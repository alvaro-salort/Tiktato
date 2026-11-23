const { EventEmitter } = require('node:events');
const { createStreakTracker, normalizeTikTokEvent } = require('./events.cjs');
const { detectSystemLanguage, detectSystemRegion } = require('./gifts-catalog.cjs');

const MAX_BACKLOG_CHAT = 5;
const MAX_SEEN_MSG_IDS = 2000;
const CHAT_DEDUP_WINDOW_MS = 3_000;

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
  const lang = detectSystemLanguage();
  const region = detectSystemRegion();
  const params = new URLSearchParams({
    aid: '1988',
    app_name: 'tiktok_web',
    device_platform: 'web_pc',
    app_language: lang,
    browser_language: lang,
    region,
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
      suspended: false,
      reconnecting: false,
      retryIn: 0
    };
    this.intentionalDisconnect = false;
    this.connectGen = 0;
    this.pollingInFlight = false;
    this.options = { playEveryStreak: true, emitAllPackets: true };
    this.pollTimer = null;
    this.pollTimeout = null;
    this.lastConnectArgs = null;
    this.streakTracker = createStreakTracker();
    this.seenMsgIds = new Set();
    this.recentChatFingerprints = new Map();
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

  #cleanupClient(client) {
    if (!client) return;
    try {
      client.removeAllListeners?.();
    } catch {}
    try {
      client.disconnect?.();
    } catch {}
  }

  #handleLiveEnded() {
    const client = this.client;
    this.client = null;
    this.#cleanupClient(client);
    this.#setStatus({
      state: 'disconnected',
      paused: false,
      reconnecting: false,
      retryIn: 0,
      message: 'El directo terminó.',
      viewerCount: 0
    });
    if (!this.intentionalDisconnect && this.lastConnectArgs) {
      this.#startPolling({ initialDelayMs: 3000 });
    }
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
      this.#handleLiveEnded();
      this.emit('control', { action: 3, status: 'ended', data });
      return;
    }
    if (action === 4) {
      const client = this.client;
      this.client = null;
      this.#cleanupClient(client);
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

  #isDuplicateChat(event, now) {
    if (event?.type !== 'chat') return false;
    const normalizedText = String(event.comment || event.message || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (!normalizedText) return false;

    const userId = String(event.userId || '').trim().toLowerCase();
    const username = String(event.username || '').trim().toLowerCase();
    const keys = [];
    if (username) keys.push(`u:${username}:${normalizedText}`);
    if (userId && userId !== username) keys.push(`id:${userId}:${normalizedText}`);
    if (keys.length === 0) return false;

    for (const key of keys) {
      const lastSeen = this.recentChatFingerprints.get(key);
      if (lastSeen !== undefined && now >= lastSeen && now - lastSeen < CHAT_DEDUP_WINDOW_MS) {
        return true;
      }
    }
    for (const key of keys) {
      this.recentChatFingerprints.delete(key);
      this.recentChatFingerprints.set(key, now);
    }
    if (this.recentChatFingerprints.size > 500) {
      for (const [entryKey, ts] of this.recentChatFingerprints.entries()) {
        if (now - ts >= CHAT_DEDUP_WINDOW_MS || this.recentChatFingerprints.size > 500) {
          this.recentChatFingerprints.delete(entryKey);
        } else {
          break;
        }
      }
    }
    return false;
  }

  ingestEvent(type, data, now = Date.now()) {
    const event = normalizeTikTokEvent(type, data, now, {
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

    const dedupKey =
      event.type === 'gift'
        ? (event.msgId && event.msgId !== '0'
            ? `gift:${event.msgId}:${event.groupId || ''}:${event.giftId || event.giftName || ''}:${event.repeatCount}:${event.repeatEnd ? 1 : 0}:${event.createTime || ''}`
            : '')
        : (event.msgId ||
            (event.type && (event.userId || event.username)
              ? `${event.type}:${event.userId || event.username}:${event.createTime || event.timestamp || ''}`
              : ''));
    if (dedupKey && this.#rememberMsgId(dedupKey)) {
      return null;
    }

    if (this.#isDuplicateChat(event, now)) {
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

  #startPolling({ initialDelayMs = 0 } = {}) {
    this.#stopPolling();
    if (this.status.state === 'connected') return;
    let secondsLeft = 20;

    const tick = () => {
      if (this.intentionalDisconnect || !this.lastConnectArgs || this.status.state === 'connected') {
        this.#stopPolling();
        return;
      }
      this.#setStatus({
        state: 'connecting',
        reconnecting: true,
        retryIn: secondsLeft,
        message: `Buscando directo... reintentando en ${secondsLeft}s`
      });
    };

    const run = () => {
      if (this.status.state === 'connected') return;
      tick();
      this.pollTimer = setInterval(async () => {
        if (this.intentionalDisconnect || !this.lastConnectArgs || this.status.state === 'connected') {
          this.#stopPolling();
          return;
        }
        if (this.pollingInFlight) return;
        this.pollingInFlight = true;

        try {
          secondsLeft--;
          if (secondsLeft > 0) {
            tick();
            return;
          }

          secondsLeft = 20;
          const clean = cleanUsername(this.lastConnectArgs.username);
          if (!clean) return;
          const cookie = sessionCookie(this.lastConnectArgs.sessionId, this.lastConnectArgs.ttTargetIdc);
          const savedArgs = { ...this.lastConnectArgs };
          let latestRoomId = null;
          try {
            this.#setStatus({
              state: 'connecting',
              reconnecting: true,
              retryIn: 0,
              message: 'Buscando directo... comprobando...'
            });
            latestRoomId = await resolveRoomId(clean, cookie);
          } catch {
            // Ignorar fallos temporales de red o sala offline durante el sondeo
          }

          if (this.intentionalDisconnect || !this.lastConnectArgs) return;

          if (latestRoomId) {
            this.logger.info?.(`[tiktok] sala disponible detectada (${latestRoomId}), reconectando…`);
            try {
              await this.connect({ ...savedArgs, roomId: latestRoomId });
            } catch (error) {
              this.logger.warn?.('[tiktok] reconexión desde sondeo falló', error);
            }
            return;
          }
          tick();
        } finally {
          this.pollingInFlight = false;
        }
      }, 1000);
      if (typeof this.pollTimer?.unref === 'function') this.pollTimer.unref();
    };

    if (initialDelayMs > 0 && this.status.state !== 'connected') {
      this.pollTimeout = setTimeout(() => {
        this.pollTimeout = null;
        if (!this.intentionalDisconnect && this.status.state !== 'connected') {
          secondsLeft = Math.max(1, 20 - Math.round(initialDelayMs / 1000));
          run();
        }
      }, initialDelayMs);
      if (typeof this.pollTimeout?.unref === 'function') this.pollTimeout.unref();
    } else {
      run();
    }
  }

  #stopPolling() {
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
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
      this.recentChatFingerprints.clear();
      this.streakTracker.reset();
      this.trackedRoomKey = nextRoomKey;
    }

    this.intentionalDisconnect = false;
    const gen = ++this.connectGen;
    const isStale = () => gen !== this.connectGen || this.intentionalDisconnect;

    this.lastConnectArgs = { username: clean, sessionId, ttTargetIdc, roomId: manualRoom };
    this.beginBacklogWindow();
    this.#setStatus({
      state: 'connecting',
      username: clean,
      roomId: manualRoom,
      reconnecting: false,
      retryIn: 0,
      message: manualRoom ? `Conectando a la sala ${manualRoom}…` : `Conectando con @${clean}…`,
      viewerCount: 0,
      paused: false,
      suspended: false
    });

    let client = null;
    try {
      const module = await import('piratetok-live-js');
      if (isStale()) return this.getStatus();

      const { TikTokLiveClient, EventType } = module;
      if (!TikTokLiveClient || !EventType) {
        throw new Error('La librería de TikTok no expone TikTokLiveClient.');
      }

      client = new TikTokLiveClient(clean || 'manual');
      if (typeof client.language === 'function') client.language('es');
      const cookie = sessionCookie(sessionId, ttTargetIdc);
      if (cookie) client.cookies(cookie);
      this.client = client;

      client.on(EventType.gift, (data) => {
        if (isStale()) return;
        this.#emitEvent('gift', data);
      });
      client.on(EventType.chat, (data) => {
        if (isStale()) return;
        this.#emitEvent('chat', data);
      });
      if (EventType.barrage) {
        client.on(EventType.barrage, (data) => {
          if (isStale()) return;
          this.#emitEvent('barrage', data);
        });
      }
      client.on(EventType.follow, (data) => {
        if (isStale()) return;
        this.#emitEvent('follow', data);
      });
      client.on(EventType.share, (data) => {
        if (isStale()) return;
        this.#emitEvent('share', data);
      });
      client.on(EventType.like, (data) => {
        if (isStale()) return;
        this.#emitEvent('like', data);
      });
      if (EventType.join) {
        client.on(EventType.join, (data) => {
          if (isStale()) return;
          this.#emitEvent('join', data);
        });
      }
      if (EventType.subNotify) {
        client.on(EventType.subNotify, (data) => {
          if (isStale()) return;
          this.#emitEvent('subNotify', data);
        });
      }
      if (EventType.subscriptionNotify) {
        client.on(EventType.subscriptionNotify, (data) => {
          if (isStale()) return;
          this.#emitEvent('subscriptionNotify', data);
        });
      }
      if (EventType.imDelete) {
        client.on(EventType.imDelete, (data) => {
          if (isStale()) return;
          this.#emitEvent('imDelete', data);
        });
      }
      if (EventType.control) {
        client.on(EventType.control, (data) => {
          if (isStale()) return;
          this.handleControlEvent(data);
        });
      }
      client.on(EventType.roomUserSeq, (data) => {
        if (isStale()) return;
        const count = Number(data?.viewerCount ?? data?.totalUser ?? 0);
        if (Number.isFinite(count)) this.#setStatus({ viewerCount: count });
      });
      client.on(EventType.liveEnded, () => {
        if (isStale()) return;
        this.#handleLiveEnded();
      });
      client.on(EventType.reconnecting, () => {
        if (isStale()) return;
        this.beginBacklogWindow();
        this.#setStatus({ state: 'connecting', message: 'Reconectando con TikTok…' });
      });
      client.on(EventType.disconnected, () => {
        if (isStale()) return;
        const currentClient = this.client;
        this.client = null;
        this.#cleanupClient(currentClient || client);
        if (!this.intentionalDisconnect && !this.status.suspended) {
          this.#setStatus({
            state: 'disconnected',
            paused: false,
            reconnecting: false,
            retryIn: 0,
            message: 'TikTok cerró la conexión.',
            viewerCount: 0
          });
          if (this.lastConnectArgs) {
            this.#startPolling({ initialDelayMs: 3000 });
          }
        }
      });
      client.on('error', (error) => {
        if (isStale()) return;
        this.logger.error?.('[tiktok] error de conexión', error);
        if (this.status.state === 'connected') {
          this.#setStatus({
            state: 'error',
            message: friendlyError(error)
          });
        }
      });

      let resolvedRoom = manualRoom;
      if (!resolvedRoom && clean) {
        try {
          resolvedRoom = await resolveRoomId(clean, cookie);
          this.logger.info?.(`[tiktok] sala resuelta: ${resolvedRoom}`);
        } catch (error) {
          if (isStale()) {
            this.#cleanupClient(client);
            if (this.client === client) this.client = null;
            return this.getStatus();
          }
          if (error?.name === 'HostNotOnlineError' || error?.name === 'UserNotFoundError') {
            throw error;
          }
          this.logger.warn?.('[tiktok] no se pudo resolver la sala', error);
        }
      }

      if (isStale()) {
        this.#cleanupClient(client);
        if (this.client === client) this.client = null;
        return this.getStatus();
      }

      const connectedRoomId = String(await client.connect(resolvedRoom || undefined));
      if (isStale()) {
        this.#cleanupClient(client);
        if (this.client === client) this.client = null;
        return this.getStatus();
      }

      if (this.status.roomId && this.status.roomId !== connectedRoomId) {
        this.seenMsgIds.clear();
        this.recentChatFingerprints.clear();
        this.streakTracker.reset();
      }
      this.trackedRoomKey = `${clean.toLowerCase()}:${manualRoom}`;
      this.#setStatus({
        state: 'connected',
        roomId: connectedRoomId,
        paused: false,
        suspended: false,
        reconnecting: false,
        retryIn: 0,
        message: clean ? `Conectado a @${clean}` : `Conectado a la sala ${connectedRoomId}`,
        viewerCount: 0
      });
      this.logger.info?.(`[tiktok] conectado a ${clean ? `@${clean}` : 'sala manual'} roomId=${connectedRoomId}`);
      this.#stopPolling();
      return this.getStatus();
    } catch (error) {
      this.#cleanupClient(client);
      if (this.client === client) this.client = null;
      if (isStale()) {
        return this.getStatus();
      }
      const message = friendlyError(error);
      this.#setStatus({ state: 'error', reconnecting: false, retryIn: 0, message });
      this.logger.error?.('[tiktok] no se pudo conectar', error);
      if (!this.intentionalDisconnect && this.lastConnectArgs) {
        this.#startPolling({ initialDelayMs: 3000 });
      }
      throw new Error(message);
    }
  }

  #emitEvent(type, data) {
    this.ingestEvent(type, data);
  }

  async disconnect({ preserveHistory = false } = {}) {
    this.connectGen += 1;
    this.intentionalDisconnect = true;
    this.#stopPolling();
    this.lastConnectArgs = null;
    this.isBacklogPhase = false;
    this.backlogBuffer = [];
    if (!preserveHistory) {
      this.seenMsgIds.clear();
      this.recentChatFingerprints.clear();
      this.streakTracker.reset();
      this.trackedRoomKey = '';
    }
    const client = this.client;
    this.client = null;
    this.#cleanupClient(client);
    if (this.status.state !== 'disconnected' || this.status.reconnecting) {
      this.#setStatus({
        state: 'disconnected',
        roomId: '',
        paused: false,
        suspended: false,
        reconnecting: false,
        retryIn: 0,
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
