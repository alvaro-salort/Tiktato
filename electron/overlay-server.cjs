const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { WebSocketServer, WebSocket } = require('ws');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm'
};

function tokenMatches(expected, received) {
  const left = Buffer.from(String(expected || ''));
  const right = Buffer.from(String(received || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

function serveFile(response, filePath, { cache = false } = {}) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendJson(response, 404, { error: 'No encontrado' });
    return;
  }
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    'Content-Type': MIME[extension] || 'application/octet-stream',
    'Cache-Control': cache ? 'public, max-age=3600' : 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(filePath).pipe(response);
}

function safeChild(root, requested) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, path.basename(requested));
  return resolved.startsWith(`${resolvedRoot}${path.sep}`) ? resolved : null;
}

class OverlayServer {
  constructor({ overlayDir, sharedDir, soundsDir, token, port = 3477, logger = console }) {
    this.overlayDir = overlayDir;
    this.sharedDir = sharedDir;
    this.soundsDir = soundsDir;
    this.token = token;
    this.requestedPort = Number(port) || 3477;
    this.logger = logger;
    this.server = null;
    this.wss = null;
    this.port = null;
    this.clients = new Set();
    this.config = {};
  }

  async start() {
    if (this.server) return this.port;
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (socket) => {
      this.clients.add(socket);
      this.#send(socket, { type: 'hello', config: this.config });
      socket.on('close', () => this.clients.delete(socket));
      socket.on('error', () => this.clients.delete(socket));
    });
    this.server = http.createServer((request, response) => this.#handleHttp(request, response));
    this.server.on('upgrade', (request, socket, head) => this.#handleUpgrade(request, socket, head));

    const ports = this.requestedPort === 0
      ? [0]
      : Array.from({ length: 20 }, (_, index) => this.requestedPort + index);

    let lastError = null;
    for (const candidate of ports) {
      try {
        this.port = await this.#listen(candidate);
        this.logger.info?.(`[overlay] servidor escuchando en http://127.0.0.1:${this.port}`);
        return this.port;
      } catch (error) {
        lastError = error;
        if (error.code !== 'EADDRINUSE') break;
      }
    }
    this.#closeServer();
    throw lastError || new Error('No se pudo iniciar el servidor del overlay.');
  }

  #listen(port) {
    return new Promise((resolve, reject) => {
      const onError = (error) => {
        this.server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off('error', onError);
        resolve(this.server.address().port);
      };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(port, '127.0.0.1');
    });
  }

  #handleHttp(request, response) {
    const url = new URL(request.url || '/', `http://127.0.0.1:${this.port || 3477}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/health') {
      sendJson(response, 200, { ok: true, service: 'tiktato-overlay', clients: this.clients.size });
      return;
    }

    if (pathname === '/' || pathname === '/overlay' || pathname === '/overlay/') {
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'self' https: data:; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src 'self' https: data:; connect-src 'self' ws://127.0.0.1:*;"
      );
      serveFile(response, path.join(this.overlayDir, 'index.html'));
      return;
    }

    if (pathname === '/overlay.js') {
      serveFile(response, path.join(this.overlayDir, 'overlay.js'));
      return;
    }

    if (pathname === '/overlay.css') {
      serveFile(response, path.join(this.overlayDir, 'overlay.css'));
      return;
    }

    if (pathname === '/shared/audio-engine.js') {
      serveFile(response, path.join(this.sharedDir, 'audio-engine.js'));
      return;
    }

    if (pathname === '/api/config') {
      if (!tokenMatches(this.token, url.searchParams.get('token'))) {
        sendJson(response, 401, { error: 'Token inválido' });
        return;
      }
      sendJson(response, 200, this.config);
      return;
    }

    if (pathname.startsWith('/sounds/')) {
      if (!tokenMatches(this.token, url.searchParams.get('token'))) {
        sendJson(response, 401, { error: 'Token inválido' });
        return;
      }
      const file = safeChild(this.soundsDir, pathname.slice('/sounds/'.length));
      if (!file) {
        sendJson(response, 400, { error: 'Ruta inválida' });
        return;
      }
      serveFile(response, file, { cache: true });
      return;
    }

    if (pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }

    sendJson(response, 404, { error: 'No encontrado' });
  }

  #handleUpgrade(request, socket, head) {
    const url = new URL(request.url || '/', `http://127.0.0.1:${this.port || 3477}`);
    if (url.pathname !== '/ws' || !tokenMatches(this.token, url.searchParams.get('token'))) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(request, socket, head, (websocket) => {
      this.wss.emit('connection', websocket, request);
    });
  }

  setConfig(config) {
    this.config = config;
    this.broadcast({ type: 'config', config });
  }

  broadcast(payload) {
    const message = JSON.stringify(payload);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  #send(socket, payload) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }

  getUrl() {
    return `http://127.0.0.1:${this.port}/overlay?token=${this.token}`;
  }

  async stop() {
    for (const client of this.clients) {
      try {
        client.close();
      } catch {
        // Ignorado.
      }
    }
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    if (!this.server) return;
    await new Promise((resolve) => this.server.close(() => resolve()));
    this.#closeServer();
  }

  #closeServer() {
    this.server = null;
    this.port = null;
  }
}

module.exports = {
  OverlayServer,
  tokenMatches
};
