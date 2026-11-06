const { EventEmitter } = require('node:events');
const { normalizeTikTokEvent } = require('./events.cjs');

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

  if (/UserNotFound|user .* does not exist/i.test(`${name} ${message}`)) {
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

async function resolveRoomId(username, cookie = '') {
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
  if (!roomId || roomId === '0' || (![2, 4].includes(userStatus) && ![2, 4].includes(liveStatus))) {
    const error = new Error(`user "${username}" is not currently live`);
    error.name = 'HostNotOnlineError';
    throw error;
  }
  return roomId;
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
      viewerCount: 0
    };
    this.intentionalDisconnect = false;
    this.options = { playEveryStreak: true };
    this.pollTimer = null;
    this.lastConnectArgs = null;
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

    await this.disconnect();
    this.intentionalDisconnect = false;
    this.lastConnectArgs = { username: clean, sessionId, ttTargetIdc, roomId: manualRoom };
    this.#setStatus({
      state: 'connecting',
      username: clean,
      roomId: manualRoom,
      message: manualRoom ? `Conectando a la sala ${manualRoom}…` : `Conectando con @${clean}…`,
      viewerCount: 0
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
      client.on(EventType.follow, (data) => this.#emitEvent('follow', data));
      client.on(EventType.share, (data) => this.#emitEvent('share', data));
      client.on(EventType.like, (data) => this.#emitEvent('like', data));
      client.on(EventType.roomUserSeq, (data) => {
        const count = Number(data?.viewerCount ?? data?.totalUser ?? 0);
        if (Number.isFinite(count)) this.#setStatus({ viewerCount: count });
      });
      client.on(EventType.liveEnded, () => {
        this.#setStatus({
          state: 'disconnected',
          message: 'El directo terminó.',
          viewerCount: 0
        });
        this.client = null;
      });
      client.on(EventType.reconnecting, () => {
        this.#setStatus({ state: 'connecting', message: 'Reconectando con TikTok…' });
      });
      client.on(EventType.disconnected, () => {
        if (!this.intentionalDisconnect) {
          this.#setStatus({
            state: 'disconnected',
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
      this.#setStatus({
        state: 'connected',
        roomId: connectedRoomId,
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
    const event = normalizeTikTokEvent(type, data, Date.now(), this.options);
    if (event) this.emit('event', event);
  }

  async disconnect() {
    this.intentionalDisconnect = true;
    this.#stopPolling();
    this.lastConnectArgs = null;
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
        message: 'Sin conexión',
        viewerCount: 0
      });
    }
  }
}

module.exports = {
  TikTokService,
  cleanUsername,
  friendlyError,
  resolveRoomId,
  sessionCookie
};
