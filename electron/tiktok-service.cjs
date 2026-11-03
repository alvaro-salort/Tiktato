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
  const code = String(error?.code || error?.name || error?.error?.code || '');
  const message = String(
    error?.message ||
      error?.error?.message ||
      error?.reason ||
      (typeof error === 'object' ? code || 'Error desconocido' : error) ||
      'Error desconocido'
  );
  if (/UserOffline/i.test(code) || /offline/i.test(message)) {
    return 'Ese usuario no está en directo ahora mismo. Inicia el LIVE y vuelve a intentarlo.';
  }
  if (/InitialData|room id|roomId/i.test(message)) {
    return 'TikTok no devolvió la sala. Comprueba el usuario o espera unos segundos.';
  }
  if (/sign|euler|429|rate/i.test(message)) {
    return 'TikTok limitó la conexión temporalmente. Espera un minuto o configura una clave de Euler Stream.';
  }
  if (/fetch|network|ECONN|ENOTFOUND|timeout/i.test(message)) {
    return 'No se pudo conectar con TikTok. Revisa tu conexión a Internet.';
  }
  return message;
}

class TikTokService extends EventEmitter {
  constructor({ logger } = {}) {
    super();
    this.logger = logger || console;
    this.connection = null;
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

  async connect({ username, sessionId, ttTargetIdc, signApiKey }) {
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
      const module = await import('tiktok-live-connector');
      const TikTokLiveConnection = module.TikTokLiveConnection || module.default?.TikTokLiveConnection;
      if (!TikTokLiveConnection) throw new Error('La librería de TikTok no expone TikTokLiveConnection.');

      const options = {
        processInitialData: false,
        fetchRoomInfoOnConnect: true,
        enableExtendedGiftInfo: true
      };

      if (sessionId && ttTargetIdc) {
        options.authenticateWs = true;
        options.session = {
          cookie: {
            type: 'cookie',
            value: {
              sessionId,
              ttTargetIdc
            }
          }
        };
      }
      if (signApiKey) options.signApiKey = signApiKey;

      const connection = new TikTokLiveConnection(clean, options);
      this.connection = connection;

      connection.on('gift', (data) => this.#emitEvent('gift', data));
      connection.on('follow', (data) => this.#emitEvent('follow', data));
      connection.on('share', (data) => this.#emitEvent('share', data));
      connection.on('like', (data) => this.#emitEvent('like', data));
      connection.on('roomUser', (data) => {
        if (typeof data?.viewerCount === 'number') {
          this.#setStatus({ viewerCount: data.viewerCount });
        }
      });
      connection.on('streamEnd', () => {
        this.#setStatus({
          state: 'disconnected',
          message: 'El directo terminó.',
          viewerCount: 0
        });
        this.connection = null;
      });
      connection.on('disconnected', () => {
        if (!this.intentionalDisconnect) {
          this.#setStatus({
            state: 'disconnected',
            message: 'TikTok cerró la conexión.',
            viewerCount: 0
          });
        }
        this.connection = null;
      });
      connection.on('error', (error) => {
        this.logger.error?.('[tiktok] error de conexión', error);
        if (this.status.state === 'connected') {
          this.#setStatus({
            state: 'error',
            message: friendlyError(error)
          });
        }
      });

      const state = await connection.connect();
      const roomId = String(state?.roomId || connection.roomId || '');
      const roomTitle = connection.roomInfo?.title || connection.roomInfo?.roomInfo?.title || '';
      this.#setStatus({
        state: 'connected',
        roomId,
        message: roomTitle ? `En directo: ${roomTitle}` : `Conectado a @${clean}`,
        viewerCount: Number(connection.roomInfo?.userCount || 0)
      });
      this.logger.info?.(`[tiktok] conectado a @${clean} roomId=${roomId}`);
      return this.getStatus();
    } catch (error) {
      this.connection = null;
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
    const connection = this.connection;
    this.connection = null;
    if (connection) {
      try {
        await connection.disconnect();
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
  friendlyError
};
