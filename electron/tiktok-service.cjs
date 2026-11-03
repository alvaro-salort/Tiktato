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
    return 'TikTok no encuentra ese usuario. Revisa el nombre exacto de la URL de tu perfil.';
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
  if (!sessionId || !ttTargetIdc) return '';
  return `sessionid=${sessionId}; sid_tt=${sessionId}; tt-target-idc=${ttTargetIdc}`;
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
  }

  getStatus() {
    return { ...this.status };
  }

  #setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.getStatus());
  }

  async connect({ username, sessionId, ttTargetIdc }) {
    const clean = cleanUsername(username);
    if (!clean) throw new Error('Escribe un usuario de TikTok válido.');

    await this.disconnect();
    this.intentionalDisconnect = false;
    this.#setStatus({
      state: 'connecting',
      username: clean,
      roomId: '',
      message: `Conectando con @${clean}…`,
      viewerCount: 0
    });

    try {
      const module = await import('piratetok-live-js');
      const { TikTokLiveClient, EventType } = module;
      if (!TikTokLiveClient || !EventType) {
        throw new Error('La librería de TikTok no expone TikTokLiveClient.');
      }

      const client = new TikTokLiveClient(clean);
      const cookie = sessionCookie(sessionId, ttTargetIdc);
      if (cookie) client.cookies(cookie);
      this.client = client;

      client.on(EventType.gift, (data) => this.#emitEvent('gift', data));
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

      const roomId = String(await client.connect());
      this.#setStatus({
        state: 'connected',
        roomId,
        message: `Conectado a @${clean}`,
        viewerCount: 0
      });
      this.logger.info?.(`[tiktok] conectado a @${clean} roomId=${roomId}`);
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
    const event = normalizeTikTokEvent(type, data);
    if (event) this.emit('event', event);
  }

  async disconnect() {
    this.intentionalDisconnect = true;
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
  sessionCookie
};
