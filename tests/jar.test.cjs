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

test('crea y normaliza los parámetros avanzados del frasco', () => {
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
    `${jarCode}\n;globalThis.__jarTest = { enqueueGift, processQueueTick, preloadTexture, resetJar, applyConfig, getCoins: () => currentCoinsTotal, getDynamicCount: () => dynamicBodies.length, getCacheSize: () => imageCache.size, maxBodies: MAX_BODIES, maxImageCache: MAX_IMAGE_CACHE };`,
    sandbox
  );

  const api = sandbox.__jarTest;
  assert.equal(api.maxBodies, 250);
  assert.equal(api.maxImageCache, 120);

  // Comprobar que applyConfig tras carga inicial no sobreescribe las monedas acumuladas
  api.applyConfig({ currentCoins: 0 });
  api.applyConfig({ currentCoins: 9999 });
  assert.equal(api.getCoins(), 0);

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
  assert.match(mainContent, /recentActivity\.find/);
  assert.match(mainContent, /transparent:\s*true/);
  assert.match(mainContent, /masterVolume:\s*Number/);
  assert.match(mainContent, /jarStreakTracker/);
  assert.match(mainContent, /jar:close-studio/);
  assert.match(indexHtml, /Content-Security-Policy/);
  assert.match(indexHtml, /object-src 'none'/);
});

function createJarVmSandbox({ search = '?studio=1', pathname = '/jar', hidden = false, windowWidth = 800, windowHeight = 800 } = {}) {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');

  const jarCode = fs.readFileSync(path.join(__dirname, '..', 'overlay', 'jar.js'), 'utf8');
  const worldBodies = [];
  const engineListeners = {};
  const renderListeners = {};
  const elements = new Map();

  const makeEl = (id = '') => {
    const listeners = {};
    const classes = new Set();
    const el = {
      id,
      hidden: id === 'testHud' || id === 'studioHud',
      textContent: '',
      src: '',
      width: 0,
      height: 0,
      dataset: {},
      getContext: () => mockCtx,
      style: { width: '', transform: '', setProperty: () => {} },
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)),
        remove: (...c) => c.forEach((x) => classes.delete(x)),
        toggle: (c, force) => {
          if (force === undefined) {
            if (classes.has(c)) classes.delete(c);
            else classes.add(c);
          } else if (force) {
            classes.add(c);
          } else {
            classes.delete(c);
          }
        },
        contains: (c) => classes.has(c)
      },
      addEventListener: (type, fn) => {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(fn);
      },
      click: () => {
        for (const fn of listeners.click || []) fn({ target: el });
      },
      dispatchEvent: (evt) => {
        for (const fn of listeners[evt.type] || []) fn(evt);
      },
      closest: (sel) => (sel === `#${id}` ? el : null)
    };
    return el;
  };

  const getEl = (selector) => {
    if (!elements.has(selector)) {
      elements.set(selector, makeEl(selector.replace(/^#/, '')));
    }
    return elements.get(selector);
  };

  const ctxOps = [];
  const mockCtx = {
    save: () => ctxOps.push('save'),
    restore: () => ctxOps.push('restore'),
    translate: () => ctxOps.push('translate'),
    rotate: () => ctxOps.push('rotate'),
    beginPath: () => ctxOps.push('beginPath'),
    arc: () => ctxOps.push('arc'),
    fill: () => ctxOps.push('fill'),
    stroke: () => ctxOps.push('stroke'),
    fillText: () => ctxOps.push('fillText'),
    drawImage: () => ctxOps.push('drawImage'),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: ''
  };
  const mockRender = { canvas: {}, options: {}, context: mockCtx, textures: {} };
  const mockMatter = {
    Engine: {
      create: () => ({ world: { bodies: worldBodies } })
    },
    Render: {
      create: () => mockRender,
      run: () => {},
      stop: () => {},
      setSize: () => {}
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
        velocity: { x: 0, y: 0 },
        angle: 0,
        circleRadius: r,
        isStatic: false,
        isSleeping: false,
        render: opts.render || {}
      })
    },
    Body: {
      setVelocity: (body, vel) => {
        body.velocity = { ...vel };
      },
      setPosition: () => {},
      translate: () => {}
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
      on: (target, eventName, cb) => {
        if (target === mockRender) {
          if (!renderListeners[eventName]) renderListeners[eventName] = [];
          renderListeners[eventName].push(cb);
        } else {
          if (!engineListeners[eventName]) engineListeners[eventName] = [];
          engineListeners[eventName].push(cb);
        }
      }
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
      this.complete = true;
    }
    set src(val) {
      this._src = val;
      if (this.onload) this.onload();
    }
    get src() {
      return this._src;
    }
  }

  let studioCloseCalled = 0;
  let windowCloseCalled = 0;
  let fakeNow = 1_000_000;

  class FakeDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(fakeNow);
      else super(...args);
    }
    static now() {
      return fakeNow;
    }
  }

  const activeIntervals = new Map();
  let nextIntervalId = 1;

  const sandbox = {
    location: { search, pathname, protocol: 'http:', host: '127.0.0.1:3477' },
    URLSearchParams,
    document: {
      hidden,
      body: makeEl('body'),
      documentElement: makeEl('html'),
      createElement: () => makeEl('canvas'),
      querySelector: (sel) => getEl(sel),
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    window: {
      innerWidth: windowWidth,
      innerHeight: windowHeight,
      addEventListener: () => {},
      close: () => {
        windowCloseCalled += 1;
      },
      tiktatoStudio: {
        close: () => {
          studioCloseCalled += 1;
        }
      }
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
    Date: FakeDate,
    console,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: (fn, ms) => {
      const id = nextIntervalId++;
      activeIntervals.set(id, { fn, ms });
      return id;
    },
    clearInterval: (id) => {
      activeIntervals.delete(id);
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(
    `${jarCode}\n;globalThis.__jarApi = {
      enqueueGift, processQueueTick, resetJar, applyConfig, spawnGift, mergeBodies, canBodiesMerge,
      buildJarBodies, computeSpawnPosition, computeRadius, computeQueueDelayMs, getVisibleDonors,
      updateLeaderboardWithGift, buildRehydrationPlan, loadState,
      getCoins: () => currentCoinsTotal,
      getDynamicBodies: () => dynamicBodies,
      getMergeEffects: () => mergeEffects,
      getQueue: () => giftQueue,
      getTopDonors: () => topDonorsList,
      getLeaderboardIndex: () => currentLeaderboardIndex,
      getIsInitialLoad: () => isInitialLoad,
      getLeaderboardTimer: () => leaderboardTimer,
      setDocHidden: (val) => { document.hidden = val; },
      advanceNow: (ms) => { fakeNow += ms; }
    };`,
    sandbox
  );

  sandbox.__jarApi.triggerCollisionStart = (pairs) =>
    (engineListeners.collisionStart || []).forEach((fn) => fn({ pairs }));
  sandbox.__jarApi.triggerCollisionActive = (pairs) =>
    (engineListeners.collisionActive || []).forEach((fn) => fn({ pairs }));
  sandbox.__jarApi.triggerAfterRender = () =>
    (renderListeners.afterRender || []).forEach((fn) => fn());

  return {
    api: sandbox.__jarApi,
    worldBodies,
    elements,
    getEl,
    ctxOps,
    activeIntervals,
    getStudioCloseCalled: () => studioCloseCalled,
    getWindowCloseCalled: () => windowCloseCalled,
    advanceNow: (ms) => {
      fakeNow += ms;
    }
  };
}

test('fusión estilo Suika Game: une regalos idénticos del mismo nivel, evita doble fusión/explosión, respeta tope y dibuja destello limpio', () => {
  const { api, worldBodies, ctxOps, advanceNow } = createJarVmSandbox();
  api.applyConfig({ currentCoins: 0, scale: 1.0, giftScale: 1.0 });

  // 3 rosas iguales en el frasco
  api.enqueueGift({ giftId: '5655', value: 1, giftName: 'Rosa', repeatCount: 3, username: 'ana' });
  api.processQueueTick();
  api.processQueueTick();
  api.processQueueTick();

  assert.equal(api.getCoins(), 3);
  assert.equal(api.getDynamicBodies().length, 3);
  const [b1, b2, b3] = api.getDynamicBodies();
  const baseRadius = b1.circleRadius;

  // Antes de expirar cooldown, no debe fusionar
  api.triggerCollisionStart([{ bodyA: b1, bodyB: b2 }]);
  assert.equal(api.getDynamicBodies().length, 3);

  // Tras expirar cooldown, colisión simultánea (b1,b2) y (b2,b3) solo debe fusionar 1 par (sin doble fusión de b2)
  advanceNow(200);
  api.triggerCollisionStart([
    { bodyA: b1, bodyB: b2 },
    { bodyA: b2, bodyB: b3 }
  ]);
  assert.equal(api.getDynamicBodies().length, 2);
  assert.equal(api.getCoins(), 3);

  const merged = api.getDynamicBodies().find((b) => b.jarMeta.mergeTier === 1);
  const untouched = api.getDynamicBodies().find((b) => b.jarMeta.mergeTier === 0);
  assert.ok(merged, 'Debe existir una esfera fusionada de nivel 1');
  assert.ok(untouched, 'b3 debe permanecer en nivel 0');
  assert.ok(merged.circleRadius > baseRadius, 'La esfera fusionada debe crecer de tamaño');
  assert.equal(merged.jarMeta.mergeCount, 2);

  // Nivel 1 y nivel 0 NO deben fusionarse aunque colisionen tras el cooldown
  advanceNow(200);
  api.triggerCollisionStart([{ bodyA: merged, bodyB: untouched }]);
  assert.equal(api.getDynamicBodies().length, 2);

  // Regalos distintos tampoco se fusionan
  api.enqueueGift({ giftId: '6064', value: 1, giftName: 'GG', repeatCount: 1, username: 'leo' });
  api.processQueueTick();
  const gg = api.getDynamicBodies().find((b) => b.jarMeta.giftKey.includes('6064'));
  advanceNow(200);
  api.triggerCollisionStart([{ bodyA: untouched, bodyB: gg }]);
  assert.equal(api.getDynamicBodies().length, 3);

  // Efecto visual en afterRender se dibuja sin textos ni errores y se limpia tras su duración
  assert.equal(api.getMergeEffects().length, 1);
  api.triggerAfterRender();
  assert.ok(ctxOps.includes('arc'));
  advanceNow(500);
  api.triggerAfterRender();
  assert.equal(api.getMergeEffects().length, 0);

  // Tope de tamaño/nivel: dos TikTok Universe (R=98) no se fusionan por encima de maxSafeR
  api.resetJar();
  api.enqueueGift({ giftId: '44999_u', value: 44999, giftName: 'TikTok Universe', repeatCount: 2, username: 'vip' });
  api.processQueueTick();
  api.processQueueTick();
  const [u1, u2] = api.getDynamicBodies();
  advanceNow(300);
  api.triggerCollisionStart([{ bodyA: u1, bodyB: u2 }]);
  assert.equal(api.getDynamicBodies().length, 2);
  assert.equal(worldBodies.filter((b) => !b.isStatic).length, 2);
});

test('el spawn en 800x600 y 560x720 siempre queda por debajo del techo físico incluso para Universo y scale 2.0', () => {
  const { api } = createJarVmSandbox();
  const scenarios = [
    { width: 800, height: 600, scale: 1.0, coins: 1 },
    { width: 800, height: 600, scale: 1.0, coins: 1000 },
    { width: 800, height: 600, scale: 1.0, coins: 44999 },
    { width: 560, height: 720, scale: 1.0, coins: 44999 },
    { width: 800, height: 600, scale: 2.0, coins: 44999 }
  ];

  for (const sc of scenarios) {
    const cfg = { scale: sc.scale, giftScale: 1.0, xOffset: 0, yOffset: 0 };
    const bodies = api.buildJarBodies(sc.width, sc.height, cfg);
    // Encontrar techo físico (el muro estático más alto)
    const topWall = bodies.reduce((highest, b) => (b.y < highest.y ? b : highest), bodies[0]);
    const ceilingBottomEdge = topWall.y + topWall.h / 2;

    const R = api.computeRadius(sc.coins, sc.scale, 1.0);
    const pos = api.computeSpawnPosition(R, sc.width, sc.height, cfg);
    const sphereTopEdge = pos.y - R;
    assert.ok(
      sphereTopEdge > ceilingBottomEdge,
      `Escenario ${sc.width}x${sc.height} scale=${sc.scale} coins=${sc.coins}: sphereTop=${sphereTopEdge} debe ser > ceilingBottom=${ceilingBottomEdge}`
    );
  }
});

test('cola adaptativa acelera cuando >20, acota cola en segundo plano sin perder monedas y rehidrata al recargar', () => {
  const { api, getEl } = createJarVmSandbox({ search: '', pathname: '/jar', hidden: false });

  // Cola adaptativa
  assert.equal(api.computeQueueDelayMs(5), 200);
  assert.ok(api.computeQueueDelayMs(25) < 200);
  assert.ok(api.computeQueueDelayMs(250) <= 28);

  // Rehidratación inicial al abrir con currentCoins > 0 y meta
  api.applyConfig({
    currentCoins: 3780,
    goalCoins: 5000,
    recentGifts: [
      { name: 'Galaxia', coins: 1000, imageUrl: 'https://example.com/galaxy.png' },
      { name: 'Rosa', coins: 1, imageUrl: 'https://example.com/rose.png' }
    ],
    topDonors: [
      { username: 'u1', totalCoins: 100 },
      { username: 'u2', totalCoins: 90 },
      { username: 'u3', totalCoins: 80 },
      { username: 'u4', totalCoins: 70 },
      { username: 'u5', totalCoins: 60 },
      { username: 'u6', totalCoins: 50 }
    ],
    numberOfRanks: 'top3'
  });

  assert.equal(api.getCoins(), 3780);
  assert.ok(api.getDynamicBodies().length > 0 && api.getDynamicBodies().length <= 45);
  assert.equal(getEl('#goalCoinsTarget').textContent, '5000');
  assert.match(getEl('#goalProgressBar').style.transform, /^scaleX\(/);
  assert.equal(getEl('#jarTotalCoins').classList.contains('is-goal-reached'), false);

  // Al cambiar numberOfRanks a top10 en applyConfig, no se perdieron los donantes #4-#6
  assert.equal(api.getVisibleDonors().length, 3);
  api.applyConfig({ numberOfRanks: 'top10' });
  assert.equal(api.getVisibleDonors().length, 6);

  // Al alcanzar la meta se activa is-goal-reached y animación discreta
  api.enqueueGift({ giftId: '1000_g', value: 1500, giftName: 'Mega', repeatCount: 1, username: 'whale' });
  api.processQueueTick();
  assert.equal(api.getCoins(), 5280);
  assert.equal(getEl('#jarTotalCoins').classList.contains('is-goal-reached'), true);
  assert.equal(getEl('#jarTotalCoins').classList.contains('is-goal-just-reached'), true);

  // En segundo plano (document.hidden && !isStudioMode), acredita directamente sin inflar giftQueue
  api.resetJar();
  api.setDocHidden(true);
  api.enqueueGift({ giftId: '5655', value: 2, giftName: 'Rosa', repeatCount: 600, username: 'spammer' });
  assert.equal(api.getQueue().length, 0);
  assert.equal(api.getCoins(), 1200);
  api.setDocHidden(false);
});

test('jar.css oculta [hidden] correctamente, Studio tiene botón Cerrar funcional y MODO PRUEBA solo aparece en test/preview', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const jarCss = fs.readFileSync(path.join(__dirname, '..', 'overlay', 'jar.css'), 'utf8');
  const jarHtml = fs.readFileSync(path.join(__dirname, '..', 'overlay', 'jar.html'), 'utf8');

  assert.match(jarCss, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  assert.match(jarCss, /-webkit-app-region:\s*drag;/);
  assert.match(jarCss, /-webkit-app-region:\s*no-drag;/);
  assert.match(jarHtml, /id="btnStudioClose"/);
  assert.match(jarHtml, /id="goalProgressBar"/);

  // En Studio mode: testHud permanece hidden, studioHud visible, y btnStudioClose cierra
  const studioVm = createJarVmSandbox({ search: '?studio=1&bg=green', pathname: '/jar' });
  assert.equal(studioVm.getEl('#studioHud').hidden, false);
  assert.equal(studioVm.getEl('#testHud').hidden, true);
  studioVm.getEl('#studioHud').dispatchEvent({
    type: 'click',
    target: studioVm.getEl('#btnStudioClose')
  });
  assert.equal(studioVm.getStudioCloseCalled(), 1);

  // Toggle de pruebas en Studio muestra testHud y sus botones funcionan
  studioVm.getEl('#studioHud').dispatchEvent({
    type: 'click',
    target: studioVm.getEl('#btnStudioToggleTest')
  });
  assert.equal(studioVm.getEl('#testHud').hidden, false);
  studioVm.getEl('#btnTestRose').click();
  assert.equal(studioVm.api.getQueue().length, 1);

  // En Test mode (/jar/test): testHud visible y botones funcionales
  const testVm = createJarVmSandbox({ search: '', pathname: '/jar/test' });
  assert.equal(testVm.getEl('#testHud').hidden, false);
  assert.equal(testVm.getEl('#studioHud').hidden, true);
  testVm.getEl('#btnTestCombo').click();
  assert.equal(testVm.api.getQueue().length, 10);
  testVm.getEl('#btnTestReset').click();
  assert.equal(testVm.api.getQueue().length, 0);
});

test('TikTokService no descarta múltiples rosas ni actualizaciones de racha con mismo msgId o createTime, e integra streakTracker para el frasco', () => {
  const { TikTokService } = require('../electron/tiktok-service.cjs');
  const { createStreakTracker } = require('../electron/events.cjs');

  const service = new TikTokService();
  // Incluso con playEveryStreak: false (sonidos/TTS apagados), emitAllPackets: true permite emitir al frasco
  service.setOptions({ playEveryStreak: false, emitAllPackets: true });
  const received = [];
  service.on('event', (ev) => received.push(ev));

  // Racha compartiendo el mismo msgId y createTime
  service.ingestEvent('gift', {
    msgId: 'streak_777',
    createTime: 1700000000,
    user: { id: 'u1', uniqueId: 'ana', nickname: 'Ana' },
    giftId: 5655,
    repeatCount: 1,
    repeatEnd: 0,
    gift: { type: 1, name: 'Rosa', diamondCount: 1 }
  });
  service.ingestEvent('gift', {
    msgId: 'streak_777',
    createTime: 1700000000,
    user: { id: 'u1', uniqueId: 'ana', nickname: 'Ana' },
    giftId: 5655,
    repeatCount: 3,
    repeatEnd: 0,
    gift: { type: 1, name: 'Rosa', diamondCount: 1 }
  });
  service.ingestEvent('gift', {
    msgId: 'streak_777',
    createTime: 1700000000,
    user: { id: 'u1', uniqueId: 'ana', nickname: 'Ana' },
    giftId: 5655,
    repeatCount: 3,
    repeatEnd: 1,
    gift: { type: 1, name: 'Rosa', diamondCount: 1 }
  });
  // Replay exacto en reconexión del paquete de cierre: debe deduplicarse
  service.ingestEvent('gift', {
    msgId: 'streak_777',
    createTime: 1700000000,
    user: { id: 'u1', uniqueId: 'ana', nickname: 'Ana' },
    giftId: 5655,
    repeatCount: 3,
    repeatEnd: 1,
    gift: { type: 1, name: 'Rosa', diamondCount: 1 }
  });

  // Dos rosas individuales sin msgId en el mismo segundo (createTime igual)
  service.ingestEvent('gift', {
    createTime: 1700000001,
    user: { id: 'u1', uniqueId: 'ana', nickname: 'Ana' },
    giftId: 5655,
    repeatCount: 1,
    repeatEnd: 1,
    groupId: 'g_a',
    gift: { type: 1, name: 'Rosa', diamondCount: 1 }
  });
  service.ingestEvent('gift', {
    createTime: 1700000001,
    user: { id: 'u1', uniqueId: 'ana', nickname: 'Ana' },
    giftId: 5655,
    repeatCount: 1,
    repeatEnd: 1,
    groupId: 'g_b',
    gift: { type: 1, name: 'Rosa', diamondCount: 1 }
  });

  assert.equal(received.length, 5);
  assert.equal(received[0].suppressAlert, true);
  assert.equal(received[1].suppressAlert, true);
  assert.equal(received[2].suppressAlert, false);

  // El jarStreakTracker procesa en tiempo real con playEveryStreak: true dando suma exacta (3 + 1 + 1 = 5)
  const jarTracker = createStreakTracker();
  let jarCoins = 0;
  for (const ev of received) {
    const res = jarTracker.process(
      {
        userId: ev.userId,
        username: ev.username,
        giftId: ev.giftId,
        giftName: ev.giftName,
        groupId: ev.groupId,
        msgId: ev.msgId,
        giftType: ev.giftType,
        repeatCount: ev.repeatCount,
        repeatEnd: ev.repeatEnd
      },
      1000,
      { playEveryStreak: true }
    );
    jarCoins += res.streakDelta * ev.coinsPerGift;
  }
  assert.equal(jarCoins, 5);

  // Dos regalos individuales seguidos con distinto msgId dentro de 4s no deben suprimirse como cierre duplicado
  const t2 = createStreakTracker();
  const r1 = t2.process({ userId: 'u2', giftId: '5655', msgId: 'm1', repeatCount: 1, repeatEnd: 1 }, 1000, { playEveryStreak: true });
  const r2 = t2.process({ userId: 'u2', giftId: '5655', msgId: 'm2', repeatCount: 1, repeatEnd: 1 }, 1500, { playEveryStreak: true });
  assert.equal(r1.streakDelta, 1);
  assert.equal(r2.streakDelta, 1);
});

test('collisionActive fusiona esferas que quedaron en contacto tras expirar cooldown y mergeBodies respeta paredes del cuello', () => {
  const { api, advanceNow } = createJarVmSandbox({ windowWidth: 800, windowHeight: 800 });
  api.applyConfig({ currentCoins: 0, scale: 1.0, giftScale: 1.0 });

  api.enqueueGift({ giftId: '5655', value: 1, giftName: 'Rosa', repeatCount: 2, username: 'ana' });
  api.processQueueTick();
  api.processQueueTick();
  const [rA, rB] = api.getDynamicBodies();

  // Tocan durante el cooldown -> collisionStart no fusiona aún
  api.triggerCollisionStart([{ bodyA: rA, bodyB: rB }]);
  assert.equal(api.getDynamicBodies().length, 2);

  // Siguen en contacto cuando expira el cooldown -> collisionActive sí fusiona
  advanceNow(150);
  api.triggerCollisionActive([{ bodyA: rA, bodyB: rB }]);
  assert.equal(api.getDynamicBodies().length, 1);

  // Fusión dentro del cuello (y < Yc - 115 = 285): debe acotarse dentro de Xc ± (104 - nextR)
  api.resetJar();
  const bLeft = api.spawnGift(
    { giftId: '1000_g', singleValue: 1000, giftName: 'Galaxia' },
    { spawnPos: { x: 310, y: 240 }, mergeCooldownMs: 0 }
  );
  const bRight = api.spawnGift(
    { giftId: '1000_g', singleValue: 1000, giftName: 'Galaxia' },
    { spawnPos: { x: 315, y: 245 }, mergeCooldownMs: 0 }
  );
  const mergedNeck = api.mergeBodies(bLeft, bRight);
  assert.ok(mergedNeck);
  assert.ok(
    mergedNeck.position.x - mergedNeck.circleRadius >= 400 - 104 - 0.01,
    `mergedNeck X (${mergedNeck.position.x}) - R (${mergedNeck.circleRadius}) no debe invadir pared izquierda del cuello`
  );
});

test('applyConfig en cada regalo no reinicia el temporizador del carrusel del Leaderboard', () => {
  const { api, activeIntervals } = createJarVmSandbox({ search: '', pathname: '/jar' });
  api.applyConfig({
    currentCoins: 300,
    leaderboardDuration: 5,
    topDonors: [
      { username: 'ana', displayName: 'Ana', totalCoins: 200 },
      { username: 'leo', displayName: 'Leo', totalCoins: 100 }
    ]
  });
  assert.equal(api.getLeaderboardIndex(), 0);
  const carouselEntry = Array.from(activeIntervals.values()).find((it) => it.ms === 100);
  assert.ok(carouselEntry, 'Debe existir el intervalo de 100ms del carrusel');

  // Avanzar 4s (40 ticks de 100ms) mientras llegan actualizaciones config/jar por nuevos regalos
  for (let i = 0; i < 40; i += 1) {
    carouselEntry.fn();
    if (i === 20) {
      api.applyConfig({ currentCoins: 301, leaderboardDuration: 5 });
    }
  }
  assert.equal(api.getLeaderboardIndex(), 0);

  // Al completar los últimos 10 ticks (5s totales), DEBE rotar a índice 1 sin haberse reiniciado
  for (let i = 0; i < 10; i += 1) {
    carouselEntry.fn();
  }
  assert.equal(api.getLeaderboardIndex(), 1);
});

test('simulación física real con Matter.js soporta +500 rosas sin desbordar el frasco ni NaN', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');

  const matterCode = fs.readFileSync(path.join(__dirname, '..', 'overlay', 'matter.min.js'), 'utf8');
  const jarCode = fs.readFileSync(path.join(__dirname, '..', 'overlay', 'jar.js'), 'utf8');

  let fakeNow = 2_000_000;
  class FakeDate extends Date {
    constructor(...args) {
      if (args.length) super(...args);
      else super(fakeNow);
    }
    static now() {
      return fakeNow;
    }
  }

  const makeEl = () => ({
    hidden: false,
    textContent: '',
    src: '',
    dataset: {},
    style: { setProperty: () => {} },
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    addEventListener: () => {}
  });

  const sandbox = {
    window: {},
    global: {},
    self: {},
    location: { search: '', pathname: '/jar', protocol: 'http:', host: '127.0.0.1:3477' },
    URLSearchParams,
    document: {
      hidden: false,
      body: makeEl(),
      documentElement: makeEl(),
      querySelector: () => makeEl(),
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    Image: class {
      set src(_v) {}
    },
    WebSocket: class {
      addEventListener() {}
      close() {}
    },
    fetch: async () => ({ ok: false }),
    Intl,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Set,
    Map,
    Date: FakeDate,
    console,
    performance: { now: () => fakeNow },
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {}
  };
  sandbox.window = sandbox;
  sandbox.window.innerWidth = 800;
  sandbox.window.innerHeight = 600;
  sandbox.window.addEventListener = () => {};

  vm.createContext(sandbox);
  vm.runInContext(matterCode, sandbox);
  sandbox.Matter.Render.create = () => ({ canvas: {}, options: {}, context: null, textures: {} });
  sandbox.Matter.Render.run = () => {};
  sandbox.Matter.Runner.run = () => {};

  vm.runInContext(
    `${jarCode}\n;globalThis.__realSim = { engine, enqueueGift, processQueueTick, applyConfig, dynamicBodies, getCoins: () => currentCoinsTotal };`,
    sandbox
  );

  const sim = sandbox.__realSim;
  sim.applyConfig({ scale: 1.0, giftScale: 1.0, currentCoins: 0 });

  for (let i = 0; i < 520; i += 1) {
    sim.enqueueGift({ giftId: '5655', value: 1, giftName: 'Rosa', repeatCount: 1, username: `u${i % 15}` });
    sim.processQueueTick();
    for (let f = 0; f < 2; f += 1) {
      fakeNow += 16.6;
      sandbox.Matter.Engine.update(sim.engine, 16.6);
    }
  }
  for (let f = 0; f < 240; f += 1) {
    fakeNow += 16.6;
    sandbox.Matter.Engine.update(sim.engine, 16.6);
  }

  assert.equal(sim.getCoins(), 520);
  assert.ok(sim.dynamicBodies.length < 100, `Las fusiones Suika deben compactar 520 rosas (actual: ${sim.dynamicBodies.length})`);
  assert.ok(sim.dynamicBodies.some((b) => b.jarMeta.mergeTier >= 3), 'Debe haber fusiones de nivel >= 3');
  for (const body of sim.dynamicBodies) {
    assert.ok(Number.isFinite(body.position.x) && Number.isFinite(body.position.y));
    assert.ok(body.position.y >= 60 && body.position.y <= 520, `Esfera fuera de rango Y esperado: ${body.position.y}`);
  }
});

test('jar.js: tope de cola/combos, acumulador fuera de topN, hidratación tras fallo y fallback de textura a Rosa', async () => {
  const { api, ctxOps } = createJarVmSandbox();

  // 1. loadState() falla -> isInitialLoad sigue en true y luego applyConfig hidrata correctamente
  await api.loadState();
  assert.equal(api.getIsInitialLoad(), true);
  api.applyConfig({
    currentCoins: 600,
    numberOfRanks: 'top3',
    leaderboardDuration: 5,
    topDonors: [
      { username: 'u1', displayName: 'U1', totalCoins: 300 },
      { username: 'u2', displayName: 'U2', totalCoins: 200 },
      { username: 'u3', displayName: 'U3', totalCoins: 100 }
    ]
  });
  assert.equal(api.getIsInitialLoad(), false);
  assert.equal(api.getCoins(), 600);

  // 2. Donante fuera de top3 acumula monedas hasta superar al #2/#3
  api.enqueueGift({ coins: 150, value: 150, repeatCount: 1, giftName: 'Rosa', username: 'u4' });
  api.processQueueTick();
  api.enqueueGift({ coins: 100, value: 100, repeatCount: 1, giftName: 'Rosa', username: 'u4' });
  api.processQueueTick();
  const visible = api.getVisibleDonors();
  assert.equal(visible.length, 3);
  assert.equal(visible[0].username, 'u1');
  assert.equal(visible[1].username, 'u4');
  assert.equal(visible[1].totalCoins, 250);

  // 3. Combo de 50 regalos acotado a MAX_PHYSICAL_PER_EVENT (25) sin perder monedas
  const coinsBeforeCombo = api.getCoins();
  api.enqueueGift({ coins: 50, coinsPerGift: 1, repeatCount: 50, giftName: 'Rosa', username: 'combo' });
  assert.ok(api.getQueue().length <= 27);
  while (api.getQueue().length > 0) api.processQueueTick();
  assert.equal(api.getCoins(), coinsBeforeCombo + 50);

  // 4. Fallback visual a Rosa cuando textura no existe en render.textures
  const bodies = api.getDynamicBodies();
  assert.ok(bodies.length > 0);
  bodies[0].render.sprite = { texture: 'https://expired.cdn/missing.webp', textureLoaded: true };
  api.triggerAfterRender();
  assert.equal(bodies[0].render.sprite, undefined);
  assert.ok(ctxOps.includes('drawImage'));
});
