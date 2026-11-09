const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  deleteSoundFile,
  flushConfigSave,
  hasPendingConfigSave,
  importSound,
  loadConfig,
  normalizeConfig,
  publicConfig,
  saveConfig,
  scheduleSaveConfig,
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

test('scheduleSaveConfig agrupa ráfagas con debounce y flushConfigSave persiste de inmediato', () => {
  const dir = tempDir();
  try {
    let config = loadConfig(dir);
    for (let i = 1; i <= 50; i += 1) {
      config = scheduleSaveConfig(
        dir,
        {
          ...config,
          jar: { ...config.jar, currentCoins: i * 10, currentGifts: i }
        },
        { delayMs: 2000, maxWaitMs: 5000 }
      );
    }
    assert.equal(hasPendingConfigSave(dir), true);
    assert.equal(config.jar.currentCoins, 500);
    assert.equal(config.jar.currentGifts, 50);

    // Antes del flush, el archivo en disco aún tiene el valor inicial (0)
    assert.equal(loadConfig(dir).jar.currentCoins, 0);

    // Al hacer flush (ej. before-quit), se persiste de forma inmediata
    flushConfigSave(dir);
    assert.equal(hasPendingConfigSave(dir), false);
    const reloaded = loadConfig(dir);
    assert.equal(reloaded.jar.currentCoins, 500);
    assert.equal(reloaded.jar.currentGifts, 50);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('saveConfig síncrono cancela cualquier guardado con debounce pendiente y escribe al instante', async () => {
  const dir = tempDir();
  try {
    const config = loadConfig(dir);
    scheduleSaveConfig(
      dir,
      { ...config, username: 'viejo_debounce', jar: { ...config.jar, currentCoins: 99 } },
      { delayMs: 40, maxWaitMs: 200 }
    );
    assert.equal(hasPendingConfigSave(dir), true);

    saveConfig(dir, { ...config, username: 'nuevo_manual', jar: { ...config.jar, currentCoins: 0 } });
    assert.equal(hasPendingConfigSave(dir), false);

    await new Promise((resolve) => setTimeout(resolve, 90));
    const finalConfig = loadConfig(dir);
    assert.equal(finalConfig.username, 'nuevo_manual');
    assert.equal(finalConfig.jar.currentCoins, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('scheduleSaveConfig escribe de forma asíncrona tras cumplirse el delayMs', async () => {
  const dir = tempDir();
  try {
    const config = loadConfig(dir);
    scheduleSaveConfig(
      dir,
      { ...config, username: 'async_streamer', jar: { ...config.jar, currentCoins: 777 } },
      { delayMs: 35, maxWaitMs: 200 }
    );
    for (let i = 0; i < 40 && hasPendingConfigSave(dir); i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(hasPendingConfigSave(dir), false);
    const saved = loadConfig(dir);
    assert.equal(saved.username, 'async_streamer');
    assert.equal(saved.jar.currentCoins, 777);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('flushConfigSave persiste incluso si writeConfigAsync ya está en vuelo al cerrar la app', async () => {
  const dir = tempDir();
  const origWriteFile = fs.promises.writeFile;
  try {
    const config = loadConfig(dir);
    let writeStarted = false;
    let releaseAsyncWrite;
    const gate = new Promise((resolve) => {
      releaseAsyncWrite = resolve;
    });

    fs.promises.writeFile = async (...args) => {
      writeStarted = true;
      await gate;
      return origWriteFile.apply(fs.promises, args);
    };

    scheduleSaveConfig(
      dir,
      { ...config, username: 'inflight_quit', jar: { ...config.jar, currentCoins: 999 } },
      { delayMs: 10, maxWaitMs: 50 }
    );

    for (let i = 0; i < 25 && !writeStarted; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(writeStarted, true);
    assert.equal(hasPendingConfigSave(dir), true);

    // Simular cierre de la app (before-quit) mientras writeConfigAsync está bloqueado a mitad de camino
    flushConfigSave(dir);
    assert.equal(hasPendingConfigSave(dir), false);

    const savedOnQuit = loadConfig(dir);
    assert.equal(savedOnQuit.username, 'inflight_quit');
    assert.equal(savedOnQuit.jar.currentCoins, 999);

    releaseAsyncWrite();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const afterAsync = loadConfig(dir);
    assert.equal(afterAsync.username, 'inflight_quit');
    assert.equal(afterAsync.jar.currentCoins, 999);
  } finally {
    fs.promises.writeFile = origWriteFile;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});



