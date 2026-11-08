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

function resolveCorsOrigin(request, port = 3477) {
  const activePort = Number(port) || 3477;
  const defaultOrigin = `http://127.0.0.1:${activePort}`;
  const rawOrigin = String(request?.headers?.origin || '').trim().replace(/\/+$/, '');
  if (!rawOrigin) return defaultOrigin;
  if (
    rawOrigin.toLowerCase() === `http://127.0.0.1:${activePort}` ||
    rawOrigin.toLowerCase() === `http://localhost:${activePort}`
  ) {
    return rawOrigin;
  }
  return defaultOrigin;
}

function sendJson(response, status, payload, { origin } = {}) {
  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin'
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  response.writeHead(status, headers);
  response.end(body);
}

function serveFile(request, response, filePath, { cache = false, port = 3477 } = {}) {
  let stat;
  try {
    stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      sendJson(response, 404, { error: 'No encontrado' }, { origin: resolveCorsOrigin(request, port) });
      return;
    }
  } catch {
    sendJson(response, 404, { error: 'No encontrado' }, { origin: resolveCorsOrigin(request, port) });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME[extension] || 'application/octet-stream';
  const total = stat.size;
  const rangeHeader = request?.headers?.range;
  const allowedOrigin = resolveCorsOrigin(request, port);

  const baseHeaders = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
    'Vary': 'Origin',
    'Cache-Control': cache ? 'public, max-age=3600' : 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };

  if (request?.method === 'OPTIONS') {
    response.writeHead(204, baseHeaders);
    response.end();
    return;
  }

  if (request?.method === 'HEAD') {
    response.writeHead(200, {
      ...baseHeaders,
      'Content-Length': total
    });
    response.end();
    return;
  }

  if (rangeHeader && typeof rangeHeader === 'string' && rangeHeader.startsWith('bytes=')) {
    const parts = rangeHeader.slice(6).split('-');
    let start = parseInt(parts[0], 10);
    let end = parts[1] ? parseInt(parts[1], 10) : total - 1;

    if (Number.isNaN(start)) {
      start = total - end;
      end = total - 1;
    }
    if (start < 0) {
      start = 0;
    }
    if (Number.isNaN(end) || end >= total) {
      end = total - 1;
    }

    if (start > end || start >= total || start < 0) {
      response.writeHead(416, {
        ...baseHeaders,
        'Content-Range': `bytes */${total}`
      });
      response.end();
      return;
    }

    const chunkSize = end - start + 1;
    response.writeHead(206, {
      ...baseHeaders,
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': chunkSize
    });
    const stream = fs.createReadStream(filePath, { start, end });
    response.on('close', () => stream.destroy());
    stream.pipe(response);
    return;
  }

  response.writeHead(200, {
    ...baseHeaders,
    'Content-Length': total
  });
  const stream = fs.createReadStream(filePath);
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}

function safeChild(root, requested) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, path.basename(requested));
  const rootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  if (process.platform === 'win32') {
    return resolved.toLowerCase().startsWith(rootPrefix.toLowerCase()) ? resolved : null;
  }
  return resolved.startsWith(rootPrefix) ? resolved : null;
}

class OverlayServer {
  constructor({ overlayDir, sharedDir, soundsDir, token, port = 3477, logger = console }) {
    this.overlayDir = overlayDir;
    this.sharedDir = sharedDir;
    this.soundsDir = soundsDir;
    this.token = token;
    const requested = Number(port);
    this.requestedPort = Number.isFinite(requested) ? requested : 3477;
    this.logger = logger;
    this.server = null;
    this.wss = null;
    this.port = null;
    this.clients = new Set();
    this.config = {};
    this.jar = {};
  }

  async start() {
    if (this.server) return this.port;
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (socket) => {
      this.clients.add(socket);
      this.#send(socket, { type: 'hello', config: this.config, jar: this.jar });
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
    const activePort = this.port || this.requestedPort || 3477;
    const allowedOrigin = resolveCorsOrigin(request, activePort);
    const url = new URL(request.url || '/', `http://127.0.0.1:${activePort}`);
    let pathname = '/';
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      sendJson(response, 400, { error: 'Ruta inválida' }, { origin: allowedOrigin });
      return;
    }

    const overlayCsp =
      "default-src 'self' https: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' http://127.0.0.1:* http://localhost:* https: data: blob:; media-src 'self' http://127.0.0.1:* http://localhost:* https: data: blob:; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; object-src 'none';";

    if (pathname === '/health') {
      sendJson(response, 200, { ok: true, service: 'tiktato-overlay', clients: this.clients.size }, { origin: allowedOrigin });
      return;
    }

    if (pathname === '/' || pathname === '/overlay' || pathname === '/overlay/') {
      response.setHeader('Content-Security-Policy', overlayCsp);
      serveFile(request, response, path.join(this.overlayDir, 'index.html'), { port: activePort });
      return;
    }

    if (pathname === '/overlay.js') {
      serveFile(request, response, path.join(this.overlayDir, 'overlay.js'), { port: activePort });
      return;
    }

    if (pathname === '/overlay.css') {
      serveFile(request, response, path.join(this.overlayDir, 'overlay.css'), { port: activePort });
      return;
    }

    if (
      pathname === '/jar' ||
      pathname === '/jar/' ||
      pathname === '/jar/test' ||
      pathname === '/jar/test/' ||
      pathname === '/jar-test'
    ) {
      response.setHeader('Content-Security-Policy', overlayCsp);
      serveFile(request, response, path.join(this.overlayDir, 'jar.html'), { port: activePort });
      return;
    }

    if (pathname === '/jar.js') {
      serveFile(request, response, path.join(this.overlayDir, 'jar.js'), { port: activePort });
      return;
    }

    if (pathname === '/jar.css') {
      serveFile(request, response, path.join(this.overlayDir, 'jar.css'), { port: activePort });
      return;
    }

    if (pathname === '/matter.min.js' || pathname === '/matter.js') {
      serveFile(request, response, path.join(this.overlayDir, 'matter.min.js'), { port: activePort });
      return;
    }

    if (pathname.startsWith('/assets/')) {
      const assetFile = safeChild(path.join(this.overlayDir, 'assets'), pathname.slice('/assets/'.length));
      if (assetFile) {
        serveFile(request, response, assetFile, { cache: true, port: activePort });
        return;
      }
    }

    if (pathname === '/shared/audio-engine.js') {
      serveFile(request, response, path.join(this.sharedDir, 'audio-engine.js'), { port: activePort });
      return;
    }

    if (pathname === '/api/config') {
      if (!tokenMatches(this.token, url.searchParams.get('token'))) {
        sendJson(response, 401, { error: 'Token inválido' }, { origin: allowedOrigin });
        return;
      }
      sendJson(response, 200, this.config, { origin: allowedOrigin });
      return;
    }

    if (pathname === '/api/jar') {
      if (!tokenMatches(this.token, url.searchParams.get('token'))) {
        sendJson(response, 401, { error: 'Token inválido' }, { origin: allowedOrigin });
        return;
      }
      sendJson(response, 200, this.jar, { origin: allowedOrigin });
      return;
    }

    if (pathname.startsWith('/sounds/')) {
      if (!tokenMatches(this.token, url.searchParams.get('token'))) {
        sendJson(response, 401, { error: 'Token inválido' }, { origin: allowedOrigin });
        return;
      }
      const rawFilename = pathname.slice('/sounds/'.length);
      const file = safeChild(this.soundsDir, rawFilename);
      if (!file) {
        sendJson(response, 400, { error: 'Ruta inválida' }, { origin: allowedOrigin });
        return;
      }
      serveFile(request, response, file, { cache: true, port: activePort });
      return;
    }

    if (pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }

    sendJson(response, 404, { error: 'No encontrado' }, { origin: allowedOrigin });
  }

  #handleUpgrade(request, socket, head) {
    const url = new URL(request.url || '/', `http://127.0.0.1:${this.port || 3477}`);
    if (url.pathname !== '/ws' || !tokenMatches(this.token, url.searchParams.get('token'))) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const origin = String(request.headers.origin || '').toLowerCase();
    const activePort = this.port || 3477;
    const localOrigin = `http://127.0.0.1:${activePort}`;
    const localhostOrigin = `http://localhost:${activePort}`;
    if (origin && origin !== localOrigin && origin !== localhostOrigin) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
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

  setJar(jar) {
    this.jar = jar;
    this.broadcast({ type: 'jar', jar });
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

  getJarUrl() {
    return `http://127.0.0.1:${this.port}/jar?token=${this.token}`;
  }

  getJarTestUrl() {
    return `http://127.0.0.1:${this.port}/jar?token=${this.token}&test=1`;
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
  resolveCorsOrigin,
  tokenMatches
};
