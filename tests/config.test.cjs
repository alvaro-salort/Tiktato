const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  deleteSoundFile,
  importSound,
  loadConfig,
  normalizeConfig,
  publicConfig,
  saveConfig,
  soundsDir
} = require('../electron/config.cjs');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tiktato-test-'));
}

test('crea una configuración con reglas iniciales y token de overlay', () => {
  const dir = tempDir();
  const config = loadConfig(dir);
  assert.equal(config.version, 1);
  assert.equal(config.rules.length, 3);
  assert.match(config.overlay.token, /^[a-f0-9]{16,128}$/);
  assert.equal(fs.existsSync(path.join(dir, 'config.json')), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('permite guardar una lista vacía de reglas', () => {
  const dir = tempDir();
  const config = loadConfig(dir);
  const saved = saveConfig(dir, { ...config, rules: [] });
  assert.deepEqual(saved.rules, []);
  assert.deepEqual(loadConfig(dir).rules, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('importa, publica y elimina un sonido', () => {
  const dir = tempDir();
  const source = path.join(dir, 'sample.mp3');
  fs.writeFileSync(source, Buffer.from('fake mp3'));
  const sound = importSound(dir, source, 'Mi sonido');
  assert.match(sound.id, /^sound_/);
  assert.equal(sound.name, 'Mi sonido');
  assert.equal(fs.existsSync(path.join(soundsDir(dir), sound.filename)), true);

  const config = loadConfig(dir);
  config.sounds.push(sound);
  saveConfig(dir, config);
  const publicData = publicConfig(loadConfig(dir), { overlayUrl: 'http://127.0.0.1:3477/overlay?token=x' });
  assert.equal(publicData.sounds.length, 1);
  assert.equal(publicData.sounds[0].name, 'Mi sonido');
  assert.equal('token' in publicData.overlay, false);
  assert.equal('sessionIdEncrypted' in publicData, false);

  deleteSoundFile(dir, sound);
  assert.equal(fs.existsSync(path.join(soundsDir(dir), sound.filename)), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('normaliza valores peligrosos o inválidos', () => {
  const config = normalizeConfig({
    masterVolume: 99,
    username: '@Alvaro',
    overlay: { port: 1, accent: 'red', position: 'center', durationMs: 999999, token: 'bad' },
    rules: [
      {
        eventType: 'gift',
        giftName: 'Rosa',
        minCoins: -5,
        soundId: 'builtin:coin',
        volume: 9,
        cooldownSeconds: -3,
        enabled: true
      }
    ]
  });
  assert.equal(config.masterVolume, 1);
  assert.equal(config.username, 'Alvaro');
  assert.equal(config.overlay.port, 1024);
  assert.equal(config.overlay.accent, '#ff3d81');
  assert.equal(config.overlay.position, 'bottom');
  assert.equal(config.overlay.durationMs, 20000);
  assert.equal(config.rules[0].minCoins, 0);
  assert.equal(config.rules[0].volume, 1.5);
  assert.equal(config.rules[0].cooldownSeconds, 0);
});

test('conserva giftId, giftImageUrl e IDs con guiones bajos en las reglas', () => {
  const config = normalizeConfig({
    rules: [
      {
        id: 'rule_gift_default',
        eventType: 'gift',
        giftName: '',
        minCoins: 1,
        soundId: 'builtin:coin'
      },
      {
        id: 'rule_rosa_5655',
        eventType: 'gift',
        giftId: '5655',
        giftName: 'Rosa',
        giftImageUrl: 'https://example.com/rose.webp',
        minCoins: 0,
        soundId: 'sound_abc123'
      }
    ]
  });
  assert.equal(config.rules[0].id, 'rule_gift_default');
  assert.equal(config.rules[1].id, 'rule_rosa_5655');
  assert.equal(config.rules[1].giftId, '5655');
  assert.equal(config.rules[1].giftName, 'Rosa');
  assert.equal(config.rules[1].giftImageUrl, 'https://example.com/rose.webp');
});

