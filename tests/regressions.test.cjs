const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

const {
  loadGiftsCatalog,
  DEFAULT_GIFTS,
  detectSystemRegion,
  detectSystemLanguage
} = require('../electron/gifts-catalog.cjs');

test('gifts-catalog detecta región/idioma del sistema, invalida caché de otra región y restringe popular a DEFAULT_GIFTS', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktato-gifts-'));
  try {
    assert.equal(detectSystemRegion({ locale: 'es-MX', timeZone: 'America/Mexico_City' }), 'MX');
    assert.equal(detectSystemRegion({ locale: 'es-ES', timeZone: 'Europe/Madrid' }), 'ES');
    assert.equal(detectSystemRegion({ locale: 'es-AR', timeZone: 'America/Argentina/Buenos_Aires' }), 'AR');
    assert.equal(detectSystemRegion({ locale: 'es-419', timeZone: 'America/Bogota' }), 'CO');
    assert.equal(detectSystemLanguage({ locale: 'es-AR' }), 'es');
    assert.equal(detectSystemLanguage({ locale: 'pt-BR' }), 'pt');

    const popularOneCoin = DEFAULT_GIFTS.filter((g) => g.popular && g.coins === 1);
    assert.equal(
      popularOneCoin.some((g) => /concha|shell/i.test(g.name) || /concha|shell/i.test(g.nameEn || '')),
      false
    );

    const cacheFile = path.join(dir, 'gifts-cache.json');
    // 1. Caché de otra región ('ZZ') debe invalidarse
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        version: 2,
        region: 'ZZ',
        language: 'es',
        gifts: [{ id: '999001', name: 'Regalo ZZ', nameEn: 'ZZ Gift', coins: 1, popular: true }]
      }),
      'utf8'
    );
    const catalogAfterMismatch = loadGiftsCatalog(dir);
    assert.equal(catalogAfterMismatch.some((g) => g.id === '999001'), false);

    // 2. Caché de la región actual del sistema sí se carga pero sin marcar extras como popular
    const currentRegion = detectSystemRegion();
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        version: 2,
        region: currentRegion,
        language: detectSystemLanguage(),
        gifts: [{ id: '999002', name: 'Mate Regional', nameEn: 'Mate', coins: 1, popular: true }]
      }),
      'utf8'
    );
    const catalogSameRegion = loadGiftsCatalog(dir);
    const mate = catalogSameRegion.find((g) => g.id === '999002');
    assert.ok(mate);
    assert.equal(mate.popular, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('UI de Fish Audio oculta controles de API key en TTS cuando está configurada y expone gestión protegida en Ajustes', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');

  assert.match(indexHtml, /id="ttsFishKeyControlsWrap"/);
  assert.match(indexHtml, /id="ttsFishConfiguredBanner"/);
  assert.match(indexHtml, /id="btnManageFishKeyInSettings"/);
  assert.match(indexHtml, /id="settingsFishSection"/);
  assert.match(indexHtml, /id="btnClearFishKey"/);
  assert.match(appJs, /ttsFishKeyControlsWrap/);
  assert.match(appJs, /ttsFishConfiguredBanner/);
  assert.match(appJs, /confirmAction/);
});

test('updater.cjs desactiva auto-update en builds portables (PORTABLE_EXECUTABLE_DIR)', () => {
  const updaterPath = require.resolve('../electron/updater.cjs');
  const origLoad = Module._load;
  const origPortable = process.env.PORTABLE_EXECUTABLE_DIR;

  delete require.cache[updaterPath];
  process.env.PORTABLE_EXECUTABLE_DIR = 'C:\\Portable\\Tiktato';
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return { app: { isPackaged: true } };
    }
    if (request === 'electron-updater') {
      return {
        autoUpdater: {
          logger: null,
          autoDownload: false,
          autoInstallOnAppQuit: true,
          on() {}
        }
      };
    }
    if (request === 'electron-log') {
      return {
        transports: { file: { level: 'info' } },
        info() {},
        error() {}
      };
    }
    return origLoad.call(this, request, parent, isMain);
  };

  try {
    const { setupAutoUpdater } = require(updaterPath);
    const api = setupAutoUpdater({ getMainWindow: () => null });
    assert.equal(api, null);
  } finally {
    Module._load = origLoad;
    delete require.cache[updaterPath];
    if (origPortable === undefined) delete process.env.PORTABLE_EXECUTABLE_DIR;
    else process.env.PORTABLE_EXECUTABLE_DIR = origPortable;
  }
});

test('todos los scripts de navegador son ES modules válidos sin SyntaxError', () => {
  const { spawnSync } = require('node:child_process');
  const root = path.join(__dirname, '..');
  const browserModules = [
    'overlay/jar.js',
    'overlay/overlay.js',
    'renderer/app.js',
    'shared/tts-engine.js',
    'shared/audio-engine.js'
  ];

  for (const relPath of browserModules) {
    const source = fs.readFileSync(path.join(root, relPath), 'utf8');
    const check = spawnSync(process.execPath, ['--input-type=module', '--check'], {
      input: source,
      encoding: 'utf8'
    });
    assert.equal(
      check.status,
      0,
      `${relPath} debe parsear como ES module válido sin SyntaxError:\n${check.stderr || check.stdout}`
    );
  }

  // Verificar también el script clásico theme-init.js
  const themeCheck = spawnSync(process.execPath, ['--check', path.join(root, 'renderer/theme-init.js')], {
    encoding: 'utf8'
  });
  assert.equal(themeCheck.status, 0, themeCheck.stderr || themeCheck.stdout);

  // Verificar que el validador sí detecta declaraciones duplicadas en modo módulo
  const badCheck = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: 'function dup() {}\nfunction dup() {}\n',
    encoding: 'utf8'
  });
  assert.notEqual(badCheck.status, 0);
  assert.match(badCheck.stderr, /SyntaxError/);
});

test('regresiones de estabilidad: backgroundThrottling en mainWindow, scheduleRender inmediato, speed en Fish, versiones de render y limpieza lean', () => {
  const vm = require('node:vm');
  const root = path.join(__dirname, '..');
  const mainCjs = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  const appJs = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
  const configMod = require('../electron/config.cjs');

  // 1. mainWindow.webPreferences tiene backgroundThrottling: false
  const createWindowBlock = mainCjs.match(/function createWindow\(\)[\s\S]*?mainWindow\.webContents\.on\('console-message'/);
  assert.ok(createWindowBlock);
  assert.match(createWindowBlock[0], /backgroundThrottling:\s*false/);

  // 2. main.cjs usa scheduleSaveConfig para ajustes frecuentes y ttsStreakTracker independiente
  assert.match(mainCjs, /const ttsStreakTracker = createStreakTracker\(\);/);
  assert.match(mainCjs, /hasCriticalChange\s*\?\s*saveConfig\(/);
  assert.match(mainCjs, /hasAlertOverlayClients/);

  // 3. app.js actualiza state antes de rAF, cancela rAF obsoleto en render directo, reenvía speed, evita JSON.stringify en render y limpia controles ocultos
  assert.match(appJs, /fishSynthesizer:\s*async\s*\(\{\s*text,\s*referenceId,\s*model,\s*speed\s*\}\)/);
  assert.match(appJs, /api\.fishSynthesize\(\{\s*text,\s*referenceId,\s*model,\s*speed\s*\}\)/);
  assert.match(appJs, /function scheduleRender\(nextState\)\s*\{\s*const merged = applyNextState\(nextState\);/);
  const renderBlock = appJs.match(/function render\(nextState\)[\s\S]*?\nfunction soundOptionsHtml/);
  assert.ok(renderBlock);
  assert.doesNotMatch(renderBlock[0], /JSON\.stringify/);
  assert.match(renderBlock[0], /cancelAnimationFrame\(renderRafId\)/);
  assert.doesNotMatch(indexHtml, /id="(jarTestUrl|btnCopyJarTest|btnOpenJarTest)"/);

  // 4. Verificación conductual de applyNextState / scheduleRender / render (versiones + cancelación de rAF obsoleto)
  const sliceMatch = appJs.match(/let lastRenderedVersions[\s\S]*?\nfunction soundOptionsHtml/);
  assert.ok(sliceMatch);
  const snippet = sliceMatch[0].replace(/\nfunction soundOptionsHtml$/, '');
  const rafQueue = new Map();
  let nextRafId = 1;
  const counts = { jar: 0, tts: 0, rules: 0, activity: 0 };
  const sandbox = {
    state: null,
    pendingRenderState: null,
    renderRafId: null,
    document: { activeElement: null },
    window: {
      requestAnimationFrame(fn) {
        const id = nextRafId++;
        rafQueue.set(id, fn);
        return id;
      },
      cancelAnimationFrame(id) {
        rafQueue.delete(id);
      }
    },
    $: () => null,
    setInputValue() {},
    setInputChecked() {},
    formatNumber: (n) => String(n),
    updateStatus() {},
    rebuildSpecificRulesIndex() {},
    renderGiftPresets() { counts.rules += 1; },
    renderGiftQuickList() {},
    renderQuickRules() {},
    renderRules() {},
    renderGiftCatalog() {},
    renderSounds() {},
    updateRuleSoundOptions() {},
    updateRuleGiftOptions() {},
    renderActivity() { counts.activity += 1; },
    renderJar() { counts.jar += 1; },
    renderTTS() { counts.tts += 1; }
  };
  vm.createContext(sandbox);
  vm.runInContext(`${snippet}\nglobalThis.__api = { scheduleRender, render, getState: () => state };`, sandbox);

  // Render inicial
  sandbox.__api.render({
    playInDashboard: false,
    gifts: [{ id: '5655', name: 'Rosa' }],
    versions: { settings: 1, rules: 1, jar: 1, tts: 1 },
    stats: {},
    activity: []
  });
  assert.deepEqual(counts, { jar: 1, tts: 1, rules: 1, activity: 1 });

  // scheduleRender con solo cambio de activity/stats actualiza state de inmediato (preservando gifts) y no repinta jar/tts/rules
  sandbox.__api.scheduleRender({
    playInDashboard: false,
    versions: { settings: 1, rules: 1, jar: 1, tts: 1 },
    stats: { gifts: 2 },
    activity: [{ id: 'a1' }]
  });
  assert.equal(sandbox.__api.getState().stats.gifts, 2);
  assert.equal(sandbox.__api.getState().gifts.length, 1);

  // Antes de que corra el rAF, un render directo con estado más nuevo (v.settings=2) debe cancelar el rAF viejo
  sandbox.__api.render({
    playInDashboard: true,
    versions: { settings: 2, rules: 1, jar: 1, tts: 1 },
    stats: { gifts: 2 },
    activity: [{ id: 'a1' }]
  });
  assert.equal(rafQueue.size, 0);
  assert.equal(sandbox.__api.getState().playInDashboard, true);
  assert.deepEqual(counts, { jar: 1, tts: 1, rules: 1, activity: 2 });

  // 5. config.cjs unifica AUDIO_MIME_TYPES y elimina importSound síncrono
  assert.equal('importSound' in configMod, false);
  assert.equal(configMod.AUDIO_MIME_TYPES['.mp3'], 'audio/mpeg');
});
