const { EventEmitter } = require('node:events');
const { createStreakTracker, normalizeTikTokEvent } = require('./events.cjs');

const MAX_BACKLOG_CHAT = 5;
const MAX_SEEN_MSG_IDS = 2000;

function cleanUsername(input) {
  return String(input || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 80);
}

function friendlyError(error) {
  const name = String(error?.name || error?.code || '');
  const message = String(
    error?.message ||
      error?.error?.message ||
      error?.reason ||
      (typeof error === 'object' ? name || 'Error desconocido' : error) ||
      'Error desconocido'
  );

  if (/STREAM_SUSPENDED|suspendido/i.test(`${name} ${message}`)) {
    return 'El directo fue suspendido por TikTok (STREAM_SUSPENDED).';
  }
  if (/UserNotFound|ProfileNotFound|user .* does not exist|profile not found/i.test(`${name} ${message}`)) {
    return 'TikTok no encuentra ese usuario. Revisa el uniqueId de la URL de tu perfil. Para un LIVE de prueba, inicia sesión con QR o usa un room ID manual.';
  }
  if (/HostNotOnline|UserOffline|not currently live|offline/i.test(`${name} ${message}`)) {
    return 'Ese usuario no está en directo ahora mismo. Inicia el LIVE y espera 1–2 minutos.';
  }
  if (/AgeRestricted|18\+/i.test(`${name} ${message}`)) {
    return 'La sala es +18. Añade tu sesión de TikTok en “Sesión opcional” y vuelve a intentarlo.';
  }
  if (/SessionRequired/i.test(`${name} ${message}`)) {
    return 'TikTok pide una sesión iniciada para esta sala. Añade sessionid y tt-target-idc en “Sesión opcional”.';
  }
  if (/DeviceBlocked/i.test(`${name} ${message}`)) {
    return 'TikTok bloqueó temporalmente este dispositivo. Espera unos minutos o cambia de red.';
  }
  if (/TikTokBlocked|429|rate|blocked/i.test(`${name} ${message}`)) {
    return 'TikTok limitó la conexión temporalmente. Espera un minuto y vuelve a intentarlo.';
  }
  if (/TtwidMissing/i.test(`${name} ${message}`)) {
    return 'No se pudo obtener el identificador anónimo de TikTok. Revisa la conexión y reintenta.';
  }
  if (/fetch|network|ECONN|ENOTFOUND|timeout/i.test(message)) {
    return 'No se pudo conectar con TikTok. Revisa tu conexión a Internet.';
  }
  return message;
}

function sessionCookie(sessionId, ttTargetIdc) {
  if (!sessionId) return '';
  const parts = [`sessionid=${sessionId}`, `sid_tt=${sessionId}`];
  if (ttTargetIdc) parts.push(`tt-target-idc=${ttTargetIdc}`);
  return parts.join('; ');
}

async function resolveRoomId(username, cookie = '', options = {}) {
  const params = new URLSearchParams({
    aid: '1988',
    app_name: 'tiktok_web',
    device_platform: 'web_pc',
    app_language: 'es',
    browser_language: 'es',
    region: 'ES',
    user_is_login: cookie ? 'true' : 'false',
    sourceType: '54',
    staleTime: '600000',
    uniqueId: username
  });
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Referer: 'https://www.tiktok.com/'
  };
  if (cookie) headers.Cookie = cookie;

  let apiError = null;
  try {
    const response = await fetch(`https://www.tiktok.com/api-live/user/room/?${params}`, {
      headers,
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) throw new Error(`TikTok respondió HTTP ${response.status}`);
    const body = await response.json();
    if (body.statusCode === 19881007) {
      const error = new Error(`user "${username}" does not exist`);
      error.name = 'UserNotFoundError';
      throw error;
    }
    if (body.statusCode !== 0) throw new Error(`TikTok API statusCode=${body.statusCode}`);
    const roomId = String(body.data?.user?.roomId || '');
    const userStatus = Number(body.data?.user?.status || 0);
    const liveStatus = Number(body.data?.liveRoom?.status || 0);
    if (!roomId || roomId === '0' || (userStatus !== 2 && liveStatus !== 2)) {
      const error = new Error(`user "${username}" is not currently live`);
      error.name = 'HostNotOnlineError';
      throw error;
    }
    return roomId;
  } catch (error) {
    if (error?.name === 'UserNotFoundError' || error?.name === 'HostNotOnlineError') {
      throw error;
    }
    apiError = error;
  }

  try {
    let scrapeProfileFn = options?.scrapeProfile;
    if (typeof scrapeProfileFn !== 'function') {
      const mod = await import('piratetok-live-js');
      scrapeProfileFn = mod.scrapeProfile;
    }
    if (typeof scrapeProfileFn === 'function') {
      const profile = await scrapeProfileFn(username, '', 12_000, headers['User-Agent'], cookie);
      const fallbackRoomId = String(profile?.roomId || '');
      if (fallbackRoomId && fallbackRoomId !== '0') {
        return fallbackRoomId;
      }
      const error = new Error(`user "${username}" is not currently live`);
      error.name = 'HostNotOnlineError';
      throw error;
    }
  } catch (fallbackError) {
    if (fallbackError?.name === 'HostNotOnlineError' || fallbackError?.name === 'ProfileNotFoundError') {
      throw fallbackError;
    }
  }

  throw apiError || new Error(`No se pudo resolver la sala de @${username}`);
}

class TikTokService extends EventEmitter {
  constructor({ logger } = {}) {
    super();
    this.logger = logger || console;
    this.client = null;
    this.status = {
      state: 'disconnected',
      username: '',
      roomId: '',
      message: 'Sin conexión',
      viewerCount: 0,
      paused: false,
      suspended: false
    };
    this.intentionalDisconnect = false;
    this.options = { playEveryStreak: true };
    this.pollTimer = null;
    this.lastConnectArgs = null;
    this.streakTracker = createStreakTracker();
    this.seenMsgIds = new Set();
    this.trackedRoomKey = '';
    this.isBacklogPhase = false;
    this.backlogBuffer = [];
    this.backlogScheduled = false;
  }

  setOptions(options) {
    if (options && typeof options === 'object') {
      this.options = { ...this.options, ...options };
    }
  }

  getStatus() {
    return { ...this.status };
  }

  #setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.getStatus());
  }

  #rememberMsgId(msgId) {
    const id = String(msgId || '');
    if (!id) return false;
    if (this.seenMsgIds.has(id)) return true;
    this.seenMsgIds.add(id);
    if (this.seenMsgIds.size > MAX_SEEN_MSG_IDS) {
      const oldest = this.seenMsgIds.values().next().value;
      this.seenMsgIds.delete(oldest);
    }
    return false;
  }

  beginBacklogWindow() {
    this.isBacklogPhase = true;
    this.backlogBuffer = [];
  }

  flushBacklog() {
    this.backlogScheduled = false;
    if (!this.isBacklogPhase && this.backlogBuffer.length === 0) return [];
    this.isBacklogPhase = false;
    const pending = this.backlogBuffer.splice(0, this.backlogBuffer.length);
    const recent = pending.slice(-MAX_BACKLOG_CHAT);
    for (const event of recent) {
      this.emit('event', event);
    }
    return recent;
  }

  handleControlEvent(data) {
    const action = Number(data?.action ?? 0);
    const clean = this.status.username;
    if (action === 1) {
      this.#setStatus({
        state: 'connected',
        paused: true,
        message: 'El directo está en pausa.'
      });
      this.emit('control', { action: 1, status: 'paused', data });
      return;
    }
    if (action === 2) {
      this.#setStatus({
        state: 'connected',
        paused: false,
        message: clean ? `Conectado a @${clean}` : `Conectado a la sala ${this.status.roomId}`
      });
      this.emit('control', { action: 2, status: 'resumed', data });
      return;
    }
    if (action === 3) {
      this.#setStatus({
        state: 'disconnected',
        paused: false,
        message: 'El directo terminó.',
        viewerCount: 0
      });
      this.client = null;
      this.emit('control', { action: 3, status: 'ended', data });
      return;
    }
    if (action === 4) {
      const client = this.client;
      this.client = null;
      if (client) {
        try {
          client.disconnect();
        } catch {}
      }
      this.#setStatus({
        state: 'error',
        paused: false,
        suspended: true,
        message: 'El directo fue suspendido por TikTok (STREAM_SUSPENDED).',
        viewerCount: 0
      });
      this.emit('control', { action: 4, status: 'suspended', data });
    }
  }

  ingestEvent(type, data) {
    const event = normalizeTikTokEvent(type, data, Date.now(), {
      ...this.options,
      streakTracker: this.streakTracker
    });
    if (!event) return null;

    if (event.type === 'imDelete') {
      for (const id of event.deleteMsgIds || []) {
        this.#rememberMsgId(id);
      }
      if (this.backlogBuffer.length > 0) {
        const msgSet = new Set(event.deleteMsgIds || []);
        const userSet = new Set(event.deleteUserIds || []);
        this.backlogBuffer = this.backlogBuffer.filter(
          (item) => !(msgSet.has(item.msgId) || (item.userId && userSet.has(item.userId)))
        );
      }
      this.emit('event', event);
      return event;
    }

    if (event.msgId && this.#rememberMsgId(event.msgId)) {
      return null;
    }

    const isHistorical = Boolean(data?.isHistory || data?.common?.isHistory);
    if (event.type === 'chat' && (this.isBacklogPhase || isHistorical)) {
      this.backlogBuffer.push(event);
      if (!this.backlogScheduled) {
        this.backlogScheduled = true;
        queueMicrotask(() => this.flushBacklog());
      }
      return event;
    }

    this.emit('event', event);
    return event;
  }

  #startPolling() {
    this.#stopPolling();
    this.pollTimer = setInterval(async () => {
      if (this.intentionalDisconnect || !this.lastConnectArgs) return;
      const clean = cleanUsername(this.lastConnectArgs.username);
      if (!clean) return;
      const cookie = sessionCookie(this.lastConnectArgs.sessionId, this.lastConnectArgs.ttTargetIdc);
      try {
        const latestRoomId = await resolveRoomId(clean, cookie);
        if (latestRoomId && this.status.roomId && latestRoomId !== this.status.roomId) {
          this.logger.info?.(`[tiktok] sala cambió de ${this.status.roomId} a ${latestRoomId}, reconectando…`);
          await this.connect({ ...this.lastConnectArgs, roomId: latestRoomId });
        } else if (this.status.state !== 'connected' && latestRoomId) {
          this.logger.info?.(`[tiktok] sala disponible detectada (${latestRoomId}), reconectando…`);
          await this.connect({ ...this.lastConnectArgs, roomId: latestRoomId });
        }
      } catch (err) {
        // Ignorar fallos temporales de red o sala offline durante el sondeo
      }
    }, 20_000);
  }

  #stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async connect({ username, sessionId, ttTargetIdc, roomId }) {
    const clean = cleanUsername(username);
    const manualRoom = String(roomId || '').trim();
    if (!clean && !manualRoom) throw new Error('Escribe un usuario de TikTok válido.');

    const nextRoomKey = `${clean.toLowerCase()}:${manualRoom}`;
    const isSameRoomTarget = this.trackedRoomKey === nextRoomKey && Boolean(nextRoomKey);

    await this.disconnect({ preserveHistory: isSameRoomTarget });
    if (!isSameRoomTarget) {
      this.seenMsgIds.clear();
      this.streakTracker.reset();
      this.trackedRoomKey = nextRoomKey;
    }

    this.intentionalDisconnect = false;
    this.lastConnectArgs = { username: clean, sessionId, ttTargetIdc, roomId: manualRoom };
    this.beginBacklogWindow();
    this.#setStatus({
      state: 'connecting',
      username: clean,
      roomId: manualRoom,
      message: manualRoom ? `Conectando a la sala ${manualRoom}…` : `Conectando con @${clean}…`,
      viewerCount: 0,
      paused: false,
      suspended: false
    });

    try {
      const module = await import('piratetok-live-js');
      const { TikTokLiveClient, EventType } = module;
      if (!TikTokLiveClient || !EventType) {
        throw new Error('La librería de TikTok no expone TikTokLiveClient.');
      }

      const client = new TikTokLiveClient(clean || 'manual');
      if (typeof client.language === 'function') client.language('es');
      const cookie = sessionCookie(sessionId, ttTargetIdc);
      if (cookie) client.cookies(cookie);
      this.client = client;

      client.on(EventType.gift, (data) => this.#emitEvent('gift', data));
      client.on(EventType.chat, (data) => this.#emitEvent('chat', data));
      if (EventType.barrage) {
        client.on(EventType.barrage, (data) => this.#emitEvent('barrage', data));
      }
      client.on(EventType.follow, (data) => this.#emitEvent('follow', data));
      client.on(EventType.share, (data) => this.#emitEvent('share', data));
      client.on(EventType.like, (data) => this.#emitEvent('like', data));
      if (EventType.join) {
        client.on(EventType.join, (data) => this.#emitEvent('join', data));
      }
      if (EventType.subNotify) {
        client.on(EventType.subNotify, (data) => this.#emitEvent('subNotify', data));
      }
      if (EventType.subscriptionNotify) {
        client.on(EventType.subscriptionNotify, (data) => this.#emitEvent('subscriptionNotify', data));
      }
      if (EventType.imDelete) {
        client.on(EventType.imDelete, (data) => this.#emitEvent('imDelete', data));
      }
      if (EventType.control) {
        client.on(EventType.control, (data) => this.handleControlEvent(data));
      }
      client.on(EventType.roomUserSeq, (data) => {
        const count = Number(data?.viewerCount ?? data?.totalUser ?? 0);
        if (Number.isFinite(count)) this.#setStatus({ viewerCount: count });
      });
      client.on(EventType.liveEnded, () => {
        this.#setStatus({
          state: 'disconnected',
          paused: false,
          message: 'El directo terminó.',
          viewerCount: 0
        });
        this.client = null;
      });
      client.on(EventType.reconnecting, () => {
        this.beginBacklogWindow();
        this.#setStatus({ state: 'connecting', message: 'Reconectando con TikTok…' });
      });
      client.on(EventType.disconnected, () => {
        if (!this.intentionalDisconnect && !this.status.suspended) {
          this.#setStatus({
            state: 'disconnected',
            paused: false,
            message: 'TikTok cerró la conexión.',
            viewerCount: 0
          });
        }
        this.client = null;
      });
      client.on('error', (error) => {
        this.logger.error?.('[tiktok] error de conexión', error);
        if (this.status.state === 'connected') {
          this.#setStatus({
            state: 'error',
            message: friendlyError(error)
          });
        }
      });

      let resolvedRoom = manualRoom;
      if (!resolvedRoom && cookie) {
        try {
          resolvedRoom = await resolveRoomId(clean, cookie);
          this.logger.info?.(`[tiktok] sala resuelta con sesión: ${resolvedRoom}`);
        } catch (error) {
          this.logger.warn?.('[tiktok] no se pudo resolver la sala con la sesión', error);
        }
      }

      const connectedRoomId = String(await client.connect(resolvedRoom || undefined));
      if (this.status.roomId && this.status.roomId !== connectedRoomId) {
        this.seenMsgIds.clear();
        this.streakTracker.reset();
      }
      this.trackedRoomKey = `${clean.toLowerCase()}:${manualRoom}`;
      this.#setStatus({
        state: 'connected',
        roomId: connectedRoomId,
        paused: false,
        suspended: false,
        message: clean ? `Conectado a @${clean}` : `Conectado a la sala ${connectedRoomId}`,
        viewerCount: 0
      });
      this.logger.info?.(`[tiktok] conectado a ${clean ? `@${clean}` : 'sala manual'} roomId=${connectedRoomId}`);
      this.#startPolling();
      return this.getStatus();
    } catch (error) {
      this.client = null;
      const message = friendlyError(error);
      this.#setStatus({ state: 'error', message });
      this.logger.error?.('[tiktok] no se pudo conectar', error);
      throw new Error(message);
    }
  }

  #emitEvent(type, data) {
    this.ingestEvent(type, data);
  }

  async disconnect({ preserveHistory = false } = {}) {
    this.intentionalDisconnect = true;
    this.#stopPolling();
    this.lastConnectArgs = null;
    this.isBacklogPhase = false;
    this.backlogBuffer = [];
    if (!preserveHistory) {
      this.seenMsgIds.clear();
      this.streakTracker.reset();
      this.trackedRoomKey = '';
    }
    const client = this.client;
    this.client = null;
    if (client) {
      try {
        client.disconnect();
      } catch (error) {
        this.logger.warn?.('[tiktok] error al desconectar', error);
      }
    }
    if (this.status.state !== 'disconnected') {
      this.#setStatus({
        state: 'disconnected',
        roomId: '',
        paused: false,
        suspended: false,
        message: 'Sin conexión',
        viewerCount: 0
      });
    }
  }
}

module.exports = {
  MAX_BACKLOG_CHAT,
  TikTokService,
  cleanUsername,
  friendlyError,
  resolveRoomId,
  sessionCookie
};
