const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');

const { OverlayServer, tokenMatches } = require('../electron/overlay-server.cjs');

const root = path.join(__dirname, '..');
const token = 'a'.repeat(32);

function makeServer() {
  const sounds = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktato-sounds-'));
  fs.writeFileSync(path.join(sounds, 'demo.mp3'), Buffer.from('fake'));
  return {
    sounds,
    server: new OverlayServer({
      overlayDir: path.join(root, 'overlay'),
      sharedDir: path.join(root, 'shared'),
      soundsDir: sounds,
      token,
      port: 0,
      logger: { info() {} }
    })
  };
}

test('compara tokens sin filtrar longitud', () => {
  assert.equal(tokenMatches(token, token), true);
  assert.equal(tokenMatches(token, 'b'.repeat(32)), false);
  assert.equal(tokenMatches(token, ''), false);
});

test('sirve health, overlay y config protegida', async () => {
  const { server, sounds } = makeServer();
  try {
    await server.start();
    server.setConfig({ title: 'TIKTATO', accent: '#ff3d81' });

    const health = await fetch(`http://127.0.0.1:${server.port}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);

    const overlay = await fetch(`http://127.0.0.1:${server.port}/overlay`);
    assert.equal(overlay.status, 200);
    assert.match(await overlay.text(), /Tiktato Overlay/);

    const denied = await fetch(`http://127.0.0.1:${server.port}/api/config`);
    assert.equal(denied.status, 401);

    const config = await fetch(`http://127.0.0.1:${server.port}/api/config?token=${token}`);
    assert.equal(config.status, 200);
    assert.equal((await config.json()).title, 'TIKTATO');

    const sound = await fetch(`http://127.0.0.1:${server.port}/sounds/demo.mp3?token=${token}`);
    assert.equal(sound.status, 200);
    assert.equal(await sound.text(), 'fake');

    const badSound = await fetch(`http://127.0.0.1:${server.port}/sounds/demo.mp3`);
    assert.equal(badSound.status, 401);
  } finally {
    await server.stop();
    fs.rmSync(sounds, { recursive: true, force: true });
  }
});

test('sirve el frasco y su estado protegido', async () => {
  const { server, sounds } = makeServer();
  try {
    await server.start();
    server.setJar({
      title: 'Frasco de donaciones',
      goalCoins: 1000,
      currentCoins: 250,
      currentGifts: 4,
      accent: '#e83e5f',
      showRecentGifts: true,
      recentGifts: [],
      percent: 25,
      completed: false
    });

    const page = await fetch(`http://127.0.0.1:${server.port}/jar`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Frasco de donaciones/);

    const denied = await fetch(`http://127.0.0.1:${server.port}/api/jar`);
    assert.equal(denied.status, 401);

    const jar = await fetch(`http://127.0.0.1:${server.port}/api/jar?token=${token}`);
    assert.equal(jar.status, 200);
    assert.equal((await jar.json()).percent, 25);
  } finally {
    await server.stop();
    fs.rmSync(sounds, { recursive: true, force: true });
  }
});

test('entrega el estado inicial por WebSocket y difunde alertas', async () => {
  const { server, sounds } = makeServer();
  try {
    await server.start();
    server.setConfig({ title: 'TIKTATO', accent: '#ff3d81' });
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws?token=${token}`);
    const messages = [];
    socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(messages[0].type, 'hello');
    assert.equal(messages[0].config.title, 'TIKTATO');

    server.broadcast({ type: 'alert', alert: { id: 'alert_test', type: 'gift' } });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(messages[1].type, 'alert');
    assert.equal(messages[1].alert.id, 'alert_test');
    socket.close();
  } finally {
    await server.stop();
    fs.rmSync(sounds, { recursive: true, force: true });
  }
});

test('rechaza WebSocket sin token', async () => {
  const { server, sounds } = makeServer();
  try {
    await server.start();
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    const error = await new Promise((resolve) => socket.once('error', resolve));
    assert.match(error.message, /401/);
  } finally {
    await server.stop();
    fs.rmSync(sounds, { recursive: true, force: true });
  }
});
