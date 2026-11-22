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
