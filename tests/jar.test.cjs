const test = require('node:test');
const assert = require('node:assert/strict');

const { createDefaultConfig, normalizeJar, publicJar } = require('../electron/config.cjs');

test('crea un frasco con meta y estado inicial', () => {
  const jar = createDefaultConfig().jar;
  assert.equal(jar.goalCoins, 1000);
  assert.equal(jar.currentCoins, 0);
  assert.equal(jar.currentGifts, 0);
  assert.deepEqual(jar.recentGifts, []);
});

test('normaliza meta, monedas y regalos recientes', () => {
  const jar = normalizeJar({
    title: '  Mi frasco  ',
    goalCoins: -10,
    currentCoins: 500,
    currentGifts: 3,
    accent: 'rosa',
    showRecentGifts: false,
    recentGifts: [
      { name: 'Rosa', coins: 1, username: 'ana', imageUrl: 'https://example.com/rose.png' },
      { name: 'Galaxy', coins: 100, username: 'leo' }
    ]
  });
  assert.equal(jar.title, 'Mi frasco');
  assert.equal(jar.goalCoins, 1);
  assert.equal(jar.currentCoins, 500);
  assert.equal(jar.currentGifts, 3);
  assert.equal(jar.accent, '#e83e5f');
  assert.equal(jar.showRecentGifts, false);
  assert.equal(jar.recentGifts.length, 2);
  assert.equal(jar.recentGifts[0].name, 'Rosa');
});

test('calcula porcentaje y meta completada', () => {
  const half = publicJar({
    jar: {
      title: 'Frasco',
      goalCoins: 200,
      currentCoins: 100,
      currentGifts: 4,
      accent: '#e83e5f',
      showRecentGifts: true,
      recentGifts: []
    }
  });
  assert.equal(half.percent, 50);
  assert.equal(half.completed, false);

  const complete = publicJar({
    jar: {
      title: 'Frasco',
      goalCoins: 100,
      currentCoins: 150,
      currentGifts: 5,
      accent: '#e83e5f',
      showRecentGifts: true,
      recentGifts: []
    }
  });
  assert.equal(complete.percent, 100);
  assert.equal(complete.completed, true);
});

test('crea y normaliza los parámetros de Frasco Pro', () => {
  const jarDefault = createDefaultConfig().jar;
  assert.equal(jarDefault.giftType, 'allGifts');
  assert.equal(jarDefault.minimumValue, 1);
  assert.equal(jarDefault.scale, 1.0);
  assert.equal(jarDefault.giftScale, 1.0);
  assert.equal(jarDefault.xOffset, 0);
  assert.equal(jarDefault.yOffset, 0);
  assert.deepEqual(jarDefault.selectedGifts, []);
  assert.equal(jarDefault.numberOfRanks, 'top5');
  assert.equal(jarDefault.displayRankBadges, true);
  assert.equal(jarDefault.displayLeaderboard, true);
  assert.equal(jarDefault.showTotalCoins, true);
  assert.equal(jarDefault.displayAlert, true);
  assert.equal(jarDefault.leaderboardDuration, 5);
  assert.equal(jarDefault.alertDuration, 5);
  assert.deepEqual(jarDefault.topDonors, []);

  const normalized = normalizeJar({
    giftType: 'invalidType',
    minimumValue: -50,
    scale: 99,
    giftScale: 0.01,
    xOffset: -50,
    yOffset: 120,
    selectedGifts: ['5655', '  Rosa  ', ''],
    numberOfRanks: 'top99',
    displayRankBadges: false,
    displayLeaderboard: false,
    showTotalCoins: false,
    displayAlert: false,
    leaderboardDuration: 999,
    alertDuration: -10,
    topDonors: [
      { username: 'alvaro', displayName: 'Alvaro ⭐', totalCoins: 250 },
      { username: 'bad_donor', totalCoins: -10 }
    ]
  });

  assert.equal(normalized.giftType, 'allGifts');
  assert.equal(normalized.minimumValue, 1);
  assert.equal(normalized.scale, 3.0);
  assert.equal(normalized.giftScale, 0.1);
  assert.equal(normalized.xOffset, -50);
  assert.equal(normalized.yOffset, 120);
  assert.deepEqual(normalized.selectedGifts, ['5655', 'Rosa']);
  assert.equal(normalized.numberOfRanks, 'top5');
  assert.equal(normalized.displayRankBadges, false);
  assert.equal(normalized.displayLeaderboard, false);
  assert.equal(normalized.showTotalCoins, false);
  assert.equal(normalized.displayAlert, false);
  assert.equal(normalized.leaderboardDuration, 60);
  assert.equal(normalized.alertDuration, 1);
  assert.equal(normalized.topDonors.length, 2);
  assert.equal(normalized.topDonors[0].username, 'alvaro');
  assert.equal(normalized.topDonors[0].totalCoins, 250);
  assert.equal(normalized.topDonors[1].totalCoins, 0);
});

test('calcula la fórmula matemática de radio conforme a la sección 6.4 de CLONE_FRASCO.md', () => {
  const { computeGiftRadius, computeBaseRadius } = require('../electron/config.cjs');

  // Regalo de 1 moneda (Rosa): R = 11 px
  const r1 = computeBaseRadius(1);
  assert.equal(Math.round(r1), 11);

  // Regalo de 100 monedas: R ≈ 22.1 px
  const r100 = computeBaseRadius(100);
  assert.ok(r100 > 21 && r100 < 23);

  // Regalo de 1.000 monedas: R ≈ 52.4 px
  const r1000 = computeBaseRadius(1000);
  assert.ok(r1000 > 51 && r1000 < 54);

  // Regalo de 100.000 monedas (Universe): R = 100 px
  const r100k = computeBaseRadius(100000);
  assert.equal(Math.round(r100k), 100);

  // Con factores de escala multiplicativos
  const scaled = computeGiftRadius(1, 1.5, 2.0);
  assert.equal(Math.round(scaled), Math.round(11 * 1.5 * 2.0));
});

test('filtra regalos del frasco según giftType, minimumValue y selectedGifts', () => {
  const { shouldPassJarFilter } = require('../electron/config.cjs');

  // allGifts
  const cfgAll = { giftType: 'allGifts' };
  assert.equal(shouldPassJarFilter(cfgAll, { type: 'gift', coins: 1, coinsPerGift: 1 }), true);
  assert.equal(shouldPassJarFilter(cfgAll, { type: 'follow' }), false);

  // minimumValue
  const cfgMin = { giftType: 'minimumValue', minimumValue: 50 };
  assert.equal(shouldPassJarFilter(cfgMin, { type: 'gift', coins: 1, coinsPerGift: 1 }), false);
  assert.equal(shouldPassJarFilter(cfgMin, { type: 'gift', coins: 50, coinsPerGift: 50 }), true);
  assert.equal(shouldPassJarFilter(cfgMin, { type: 'gift', coins: 100, coinsPerGift: 10, repeatCount: 10 }), true);

  // selectedGifts
  const cfgSel = { giftType: 'selectedGifts', selectedGifts: ['5655', 'Galaxy'] };
  assert.equal(shouldPassJarFilter(cfgSel, { type: 'gift', giftId: '5655', giftName: 'Rosa', coins: 1 }), true);
  assert.equal(shouldPassJarFilter(cfgSel, { type: 'gift', giftId: '9999', giftName: 'galaxy', coins: 1000 }), true);
  assert.equal(shouldPassJarFilter(cfgSel, { type: 'gift', giftId: '1234', giftName: 'Panda', coins: 5 }), false);
});

test('acumula y ordena donantes destacados en el Leaderboard', () => {
  const { updateTopDonorsList } = require('../electron/config.cjs');

  let list = [];
  list = updateTopDonorsList(list, { username: 'ana', displayName: 'Ana', coins: 50 });
  list = updateTopDonorsList(list, { username: 'carlos', displayName: 'Carlos', coins: 200 });
  list = updateTopDonorsList(list, { username: 'ana', displayName: 'Ana ⭐', coins: 300 });

  assert.equal(list.length, 2);
  assert.equal(list[0].username, 'ana');
  assert.equal(list[0].totalCoins, 350);
  assert.equal(list[0].displayName, 'Ana ⭐');
  assert.equal(list[1].username, 'carlos');
  assert.equal(list[1].totalCoins, 200);
});

test('jar.js limita los cuerpos físicos a MAX_BODIES (250) sin perder monedas y acota imageCache (120)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');

  const jarCode = fs.readFileSync(path.join(__dirname, '..', 'overlay', 'jar.js'), 'utf8');
  const worldBodies = [];
  const intervals = [];
  const timeouts = [];

  const mockRender = { canvas: {}, options: {}, context: null, textures: {} };
  const mockMatter = {
    Engine: {
      create: () => ({ world: { bodies: worldBodies } })
    },
    Render: {
      create: () => mockRender,
      run: () => {}
    },
    Runner: {
      create: () => ({}),
      run: () => {},
      stop: () => {}
    },
    Bodies: {
      rectangle: (x, y, w, h, opts = {}) => ({ x, y, w, h, isStatic: Boolean(opts.isStatic) }),
      circle: (x, y, r, opts = {}) => ({
        position: { x, y },
        circleRadius: r,
        isStatic: false,
        isSleeping: true,
        render: opts.render || {}
      })
    },
    Composite: {
      add: (_world, item) => {
        if (Array.isArray(item)) worldBodies.push(...item);
        else worldBodies.push(item);
      },
      remove: (_world, item) => {
        const idx = worldBodies.indexOf(item);
        if (idx !== -1) worldBodies.splice(idx, 1);
      },
      allBodies: () => [...worldBodies]
    },
    Events: {
      on: () => {}
    },
    Sleeping: {
      set: (body, sleeping) => {
        body.isSleeping = sleeping;
      }
    }
  };

  class MockImage {
    constructor() {
      this.naturalWidth = 64;
      this.naturalHeight = 64;
    }
    set src(val) {
      this._src = val;
      if (this.onload) this.onload();
    }
    get src() {
      return this._src;
    }
  }

  const makeEl = () => ({
    hidden: false,
    textContent: '',
    src: '',
    style: { width: '', setProperty: () => {} },
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    addEventListener: () => {}
  });

  const sandbox = {
    location: { search: '?studio=1', pathname: '/jar', protocol: 'http:', host: '127.0.0.1:3477' },
    URLSearchParams,
    document: {
      hidden: false,
      body: makeEl(),
      documentElement: makeEl(),
      querySelector: () => makeEl(),
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    window: {
      innerWidth: 800,
      innerHeight: 800,
      addEventListener: () => {}
    },
    Image: MockImage,
    WebSocket: class {
      addEventListener() {}
      close() {}
    },
    fetch: async () => ({ ok: false }),
    Matter: mockMatter,
    Intl,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Set,
    Map,
    Date,
    console,
    setTimeout: (fn) => {
      timeouts.push(fn);
      return timeouts.length;
    },
    clearTimeout: () => {},
    setInterval: (fn) => {
      intervals.push(fn);
      return intervals.length;
    },
    clearInterval: () => {}
  };

  vm.createContext(sandbox);
  vm.runInContext(
    `${jarCode}\n;globalThis.__jarTest = { enqueueGift, processQueueTick, preloadTexture, resetJar, getCoins: () => currentCoinsTotal, getDynamicCount: () => dynamicBodies.length, getCacheSize: () => imageCache.size, maxBodies: MAX_BODIES, maxImageCache: MAX_IMAGE_CACHE };`,
    sandbox
  );

  const api = sandbox.__jarTest;
  assert.equal(api.maxBodies, 250);
  assert.equal(api.maxImageCache, 120);

  // Encolar y procesar 300 regalos de 10 monedas cada uno
  for (let i = 1; i <= 300; i += 1) {
    api.enqueueGift({
      value: 10,
      coins: 10,
      repeatCount: 1,
      giftName: 'Rosa',
      giftPictureUrl: `https://example.com/gift_${i % 150}.webp`,
      username: `donor_${i}`
    });
    api.processQueueTick();
  }

  // El total de monedas debe conservar los 300 regalos íntegros (3.000 monedas)
  assert.equal(api.getCoins(), 3000);
  // Pero los cuerpos dinámicos en el motor físico nunca superan 250
  assert.equal(api.getDynamicCount(), 250);
  const dynamicInWorld = worldBodies.filter((b) => !b.isStatic);
  assert.equal(dynamicInWorld.length, 250);
  // Todos los cuerpos activos conservan su bandera textureLoaded incluso tras rotar imageCache (120)
  assert.equal(dynamicInWorld.every((b) => b.render?.sprite?.textureLoaded === true), true);
  // Y la caché de texturas nunca supera 120 entradas
  assert.equal(api.getCacheSize(), 120);

  // Al vaciar el frasco se limpian también los cuerpos dinámicos y las texturas huérfanas de render.textures
  api.resetJar();
  assert.equal(api.getCoins(), 0);
  assert.equal(api.getDynamicCount(), 0);
  assert.equal(worldBodies.filter((b) => !b.isStatic).length, 0);
  assert.equal(Object.keys(mockRender.textures).length <= 120, true);
});

test('main.cjs e index.html incluyen protecciones de navegación, bytedance://, CSP y backgroundThrottling: false', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const mainContent = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');

  assert.match(mainContent, /backgroundThrottling:\s*false/);
  assert.match(mainContent, /bytedance/);
  assert.match(mainContent, /scheduleSaveConfig/);
  assert.match(mainContent, /flushConfigSave/);
  assert.match(mainContent, /MAX_UNIQUE_USERS/);
  assert.match(indexHtml, /Content-Security-Policy/);
  assert.match(indexHtml, /object-src 'none'/);
});

