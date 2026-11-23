// Frasco de Donaciones (Clean-room Coin Jar con Matter.js)
const params = new URLSearchParams(location.search);
const token = params.get('token') || '';
const isTestMode =
  params.get('test') === '1' ||
  params.get('preview') === '1' ||
  location.pathname.includes('/test');
const isStudioMode = params.get('studio') === '1';
const initialBg = params.get('bg') || '';

const $ = (selector) => document.querySelector(selector);

// DOM Elements
const jarApp = $('#jarApp');
const canvasContainer = $('#jarCanvasContainer');
const totalCoinsBox = $('#jarTotalCoins');
const totalCoinsCount = $('#totalCoinsCount');
const goalCoinsTarget = $('#goalCoinsTarget');
const goalProgressBar = $('#goalProgressBar');
const alertBubble = $('#jarAlertBubble');
const alertAvatar = $('#alertAvatar');
const alertAvatarFallback = $('#alertAvatarFallback');
const alertUsername = $('#alertUsername');
const alertGiftIcon = $('#alertGiftIcon');
const alertGiftName = $('#alertGiftName');
const alertRepeatCount = $('#alertRepeatCount');
const alertCoinsValue = $('#alertCoinsValue');

const leaderboardBox = $('#jarLeaderboard');
const leaderboardMedal = $('#leaderboardMedal');
const leaderboardRankText = $('#leaderboardRankText');
const leaderboardAvatar = $('#leaderboardAvatar');
const leaderboardAvatarFallback = $('#leaderboardAvatarFallback');
const leaderboardUsername = $('#leaderboardUsername');
const leaderboardCoins = $('#leaderboardCoins');
const leaderboardProgressBar = $('#leaderboardProgressBar');
const testHud = $('#testHud');
const studioHud = $('#studioHud');

function applyStudioBackground(bg) {
  const mode = String(bg || 'transparent').toLowerCase();
  document.body.classList.remove(
    'studio-bg-green',
    'studio-bg-dark',
    'studio-bg-blue',
    'studio-bg-magenta'
  );
  if (['green', 'dark', 'blue', 'magenta'].includes(mode)) {
    document.body.classList.add(`studio-bg-${mode}`);
  }
  document.querySelectorAll('[data-bg]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.bg === mode);
  });
}

function closeStudioWindow() {
  if (window.tiktatoStudio?.close) {
    window.tiktatoStudio.close();
    return;
  }
  window.close?.();
}

function setupStudioMode() {
  if (initialBg) {
    applyStudioBackground(initialBg);
  }
  if (!isStudioMode) return;
  if (studioHud) {
    studioHud.hidden = false;
    studioHud.classList?.add('is-peeking');
    setTimeout(() => {
      studioHud.classList?.remove('is-peeking');
    }, 2600);
  }
  applyStudioBackground(initialBg || 'green');
  studioHud?.addEventListener('click', (event) => {
    const bgBtn = event.target?.closest?.('[data-bg]');
    if (bgBtn) {
      applyStudioBackground(bgBtn.dataset.bg);
      return;
    }
    const toggleTestBtn = event.target?.closest?.('#btnStudioToggleTest');
    if (toggleTestBtn && testHud) {
      testHud.hidden = !testHud.hidden;
      toggleTestBtn.classList?.toggle('is-active', !testHud.hidden);
      return;
    }
    const closeBtn = event.target?.closest?.('#btnStudioClose');
    if (closeBtn) {
      closeStudioWindow();
    }
  });
}

// Configuration State
let currentConfig = {
  title: 'Frasco de donaciones',
  goalCoins: 1000,
  currentCoins: 0,
  currentGifts: 0,
  accent: '#e83e5f',
  showRecentGifts: true,
  giftType: 'allGifts',
  minimumValue: 1,
  selectedGifts: [],
  xOffset: 0,
  yOffset: 0,
  scale: 1.0,
  giftScale: 1.0,
  numberOfRanks: 'top5',
  displayRankBadges: true,
  displayLeaderboard: true,
  showTotalCoins: true,
  displayAlert: true,
  leaderboardDuration: 5,
  alertDuration: 5,
  topDonors: []
};

let currentCoinsTotal = 0;
let topDonorsList = [];
let currentLeaderboardIndex = 0;
let leaderboardTimer = null;
let alertTimer = null;
let hasCelebratedGoal = false;
let goalPulseTimer = null;

// Physics State
const MAX_BODIES = 250;
const MAX_IMAGE_CACHE = 120;
const MAX_PHYSICAL_PER_EVENT = 25;
const MAX_QUEUE_LENGTH = 100;
const MAX_DONORS_TRACKED = 200;
const MAX_MERGE_TIER = 6;
const MERGE_RADIUS_FACTOR = 1.26;
const MERGE_COOLDOWN_MS = 100;
const MAX_MERGE_EFFECTS = 40;
const MERGE_EFFECT_DURATION_MS = 280;
let engine = null;
let render = null;
let runner = null;
let containerBodies = [];
const dynamicBodies = [];
const mergeEffects = [];
const imageCache = new Map();
const failedTextureUrls = new Set();
const giftCatalogMap = new Map();
const DEFAULT_ROSE_URL = 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/eba3a9bb85c33e017f3648eaf88d7189~tplv-obj.webp';
let fallbackRoseCanvas = null;

function isSafeImageUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/assets/')) return true;
  if (typeof URL === 'function') {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
  return /^https:\/\/[^\s]+$/i.test(trimmed);
}

function registerGiftCatalogEntries(entries) {
  if (!Array.isArray(entries)) return;
  for (const g of entries) {
    if (!g || typeof g !== 'object') continue;
    const url = isSafeImageUrl(g.imageUrl || g.giftPictureUrl) ? (g.imageUrl || g.giftPictureUrl).trim() : '';
    if (!url) continue;
    if (g.id !== undefined && g.id !== null && String(g.id).trim()) {
      giftCatalogMap.set(`id:${String(g.id).trim().toLowerCase()}`, url);
    }
    if (g.name && String(g.name).trim()) {
      giftCatalogMap.set(`name:${String(g.name).trim().toLowerCase()}`, url);
    }
    if (g.nameEn && String(g.nameEn).trim()) {
      giftCatalogMap.set(`name:${String(g.nameEn).trim().toLowerCase()}`, url);
    }
  }
}

function getRoseFallbackUrl() {
  return (
    giftCatalogMap.get('id:5655') ||
    giftCatalogMap.get('name:rosa') ||
    giftCatalogMap.get('name:rose') ||
    DEFAULT_ROSE_URL
  );
}

function resolveCatalogFallbackUrl(meta, failedUrl) {
  const candidates = [];
  if (meta?.giftId) {
    const byId = giftCatalogMap.get(`id:${String(meta.giftId).trim().toLowerCase()}`);
    if (byId) candidates.push(byId);
  }
  if (meta?.giftName) {
    const byName = giftCatalogMap.get(`name:${String(meta.giftName).trim().toLowerCase()}`);
    if (byName) candidates.push(byName);
  }
  const roseUrl = getRoseFallbackUrl();
  if (roseUrl) candidates.push(roseUrl);
  for (const url of candidates) {
    if (url && url !== failedUrl && !failedTextureUrls.has(url) && isSafeImageUrl(url)) {
      return url;
    }
  }
  return '';
}

function getFallbackRoseCanvas() {
  if (fallbackRoseCanvas) return fallbackRoseCanvas;
  if (typeof document.createElement !== 'function') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const cctx = canvas.getContext?.('2d');
  if (!cctx) return null;
  const half = size / 2;
  const grad = cctx.createRadialGradient(half - half * 0.25, half - half * 0.25, half * 0.1, half, half, half);
  grad.addColorStop(0, '#FFE4EC');
  grad.addColorStop(0.65, '#FF85A6');
  grad.addColorStop(1, '#E83E5F');
  cctx.beginPath();
  cctx.arc(half, half, half - 1, 0, Math.PI * 2);
  cctx.fillStyle = grad;
  cctx.fill();
  cctx.beginPath();
  cctx.arc(half, half, half * 0.72, 0, Math.PI * 2);
  cctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  cctx.lineWidth = Math.max(2, half * 0.06);
  cctx.stroke();
  cctx.font = '72px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  cctx.textAlign = 'center';
  cctx.textBaseline = 'middle';
  cctx.fillStyle = '#FFFFFF';
  cctx.fillText('🌹', half, half + 4);
  fallbackRoseCanvas = canvas;
  return fallbackRoseCanvas;
}

function isBackgroundPaused() {
  return Boolean(document.hidden && !isStudioMode);
}

// Queue State
const giftQueue = [];
let queueTimer = null;
let demoInterval = null;
let demoPaused = !isTestMode;
let socket = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let lastLeaderboardDuration = null;
let lastOffsets = { x: 0, y: 0 };

function formatNumber(value) {
  return new Intl.NumberFormat('es-ES').format(Number(value) || 0);
}

/* ───────── FÓRMULA MATEMÁTICA DE RADIO (Sección 6.4) ───────── */
function computeBaseRadius(v) {
  const value = Math.max(1, Math.min(100000, Number(v) || 1));
  const normalized = (value - 1) / 99999;
  const inner = Math.pow(normalized, 0.6) * 8;
  return 11 + 89 * Math.tanh(inner);
}

function computeRadius(coins, scale = 1.0, giftScale = 1.0) {
  const s = Math.max(0.1, Math.min(3.0, Number(scale) || 1.0));
  const gs = Math.max(0.1, Math.min(3.0, Number(giftScale) || 1.0));
  const baseR = computeBaseRadius(coins) * s * gs;
  // Limitar el radio físico para que quepa holgadamente por el cuello (apertura 210s)
  const maxSafeR = 98 * s;
  return Math.max(8 * s, Math.min(maxSafeR, baseR));
}

/* ───────── GEOMETRÍA DEL FRASCO: 9 POLÍGONOS (Sección 6.2) + EMBUDO ───────── */
function buildJarBodies(width, height, config) {
  const s = Number(config.scale) || 1.0;
  const xOff = Number(config.xOffset) || 0;
  const yOff = Number(config.yOffset) || 0;
  const Xc = width / 2 + xOff;
  const Yc = height / 2 + yOff;
  const W = 290;
  const H = 320;
  const kr = 30;
  const T = 20;

  const t = (W / 2) * s; // 145 * s
  const a = kr * s;      // 30 * s
  const l = H * s;       // 320 * s
  const o = T * s;       // 20 * s

  const wallOptions = {
    isStatic: true,
    render: { fillStyle: 'transparent', visible: false }
  };

  return [
    // 1: Cuello Superior Izquierdo (X: Xc - 115s, Y: Yc - 155s, Ancho: 20s, Alto: 50s)
    Matter.Bodies.rectangle(Xc - t + a, Yc - t - 10 * s, o, 50 * s, wallOptions),
    // 2: Cuello Superior Derecho (X: Xc + 115s, Y: Yc - 155s, Ancho: 20s, Alto: 50s)
    Matter.Bodies.rectangle(Xc + t - a, Yc - t - 10 * s, o, 50 * s, wallOptions),
    // 3: Hombro Inclinado Izquierdo (45°)
    Matter.Bodies.rectangle(Xc - t + 15 * s, Yc - t + 25 * s, o, 50 * s, {
      ...wallOptions,
      angle: Math.PI / 4
    }),
    // 4: Hombro Inclinado Derecho (-45°)
    Matter.Bodies.rectangle(Xc + t - 15 * s, Yc - t + 25 * s, o, 50 * s, {
      ...wallOptions,
      angle: -Math.PI / 4
    }),
    // 5: Pared Vertical Izquierda
    Matter.Bodies.rectangle(Xc - t, Yc + 25 * s, o, l - 50 * s, wallOptions),
    // 6: Pared Vertical Derecha
    Matter.Bodies.rectangle(Xc + t, Yc + 25 * s, o, l - 50 * s, wallOptions),
    // 7: Base Inclinada Izquierda (-45°)
    Matter.Bodies.rectangle(Xc - t + 15 * s, Yc + l / 2 + 15 * s, o, 50 * s, {
      ...wallOptions,
      angle: -Math.PI / 4
    }),
    // 8: Base Inclinada Derecha (45°)
    Matter.Bodies.rectangle(Xc + t - 15 * s, Yc + l / 2 + 15 * s, o, 50 * s, {
      ...wallOptions,
      angle: Math.PI / 4
    }),
    // 9: Suelo Inferior del Frasco
    Matter.Bodies.rectangle(Xc, Yc + l / 2 + 45 * s, (W - 25) * s, 2 * o, wallOptions),

    // Embudos invisibles superiores que guían cualquier rebote hacia la boca del tarro
    Matter.Bodies.rectangle(Xc - 150 * s, Yc - t - 80 * s, o, 120 * s, {
      ...wallOptions,
      angle: -Math.PI / 6
    }),
    Matter.Bodies.rectangle(Xc + 150 * s, Yc - t - 80 * s, o, 120 * s, {
      ...wallOptions,
      angle: Math.PI / 6
    }),

    // Límites de seguridad de pantalla (con techo bien por encima de spawnY)
    (() => {
      const neckTopY = Yc - t - 35 * s;
      const topWallCenterY = Math.min(-350, neckTopY - 300 * s - 25);
      const bottomWallCenterY = Math.max(height + 25, Yc + l / 2 + 120 * s);
      const leftWallX = Math.min(-25, Xc - t - 120 * s);
      const rightWallX = Math.max(width + 25, Xc + t + 120 * s);
      const spanW = Math.max(width * 2, 1600 * s);
      const spanH = Math.max(height * 2, 1600 * s);
      return [
        Matter.Bodies.rectangle(width / 2, bottomWallCenterY, spanW, 50, wallOptions),
        Matter.Bodies.rectangle(width / 2, topWallCenterY, spanW, 50, wallOptions),
        Matter.Bodies.rectangle(leftWallX, height / 2, 50, spanH, wallOptions),
        Matter.Bodies.rectangle(rightWallX, height / 2, 50, spanH, wallOptions)
      ];
    })()
  ].flat();
}

/* ───────── REGIÓN DE SPAWN (Sección 6.6) ───────── */
function computeSpawnPosition(R, width, height, config) {
  const s = Number(config.scale) || 1.0;
  const xOff = Number(config.xOffset) || 0;
  const yOff = Number(config.yOffset) || 0;
  const Xc = width / 2 + xOff;
  const Yc = height / 2 + yOff;
  const t = 145 * s;

  // Apertura interior del cuello: Xc - 105s a Xc + 105s (ancho 210s)
  const halfGap = 105 * s;
  const safeMargin = Math.max(0, halfGap - R - 4 * s);

  let spawnX = Xc;
  if (safeMargin > 0) {
    spawnX = Xc - safeMargin + Math.random() * (2 * safeMargin);
  }

  // Caída justo encima de la boca del cuello (siempre debajo del techo físico)
  const neckTopY = Yc - t - 35 * s;
  const spawnY = neckTopY - 45 * s - R;

  return { x: spawnX, y: spawnY };
}

function cleanupUnusedRenderTextures() {
  if (!render?.textures) return;
  const activeUrls = new Set();
  for (const b of dynamicBodies) {
    const tex = b?.render?.sprite?.texture;
    if (tex) activeUrls.add(tex);
  }
  for (const url of Object.keys(render.textures)) {
    if (!imageCache.has(url) && !activeUrls.has(url)) {
      delete render.textures[url];
    }
  }
}

/* ───────── PRECARGA DE TEXTURAS ───────── */
function preloadTexture(url, callback, fallbackMeta = null) {
  if (!isSafeImageUrl(url) || failedTextureUrls.has(url)) {
    const alt = resolveCatalogFallbackUrl(fallbackMeta, url);
    if (alt) {
      preloadTexture(alt, callback, null);
    } else {
      callback?.(null, '');
    }
    return;
  }
  if (imageCache.has(url)) {
    const cached = imageCache.get(url);
    imageCache.delete(url);
    imageCache.set(url, cached);
    if (cached.loaded) {
      if (render?.textures) render.textures[url] = cached.img;
      callback?.(cached.img, url);
      return;
    }
    if (callback && Array.isArray(cached.callbacks)) {
      cached.callbacks.push(callback);
    }
    return;
  }
  while (imageCache.size >= MAX_IMAGE_CACHE) {
    const oldestUrl = imageCache.keys().next().value;
    if (oldestUrl === undefined) break;
    imageCache.delete(oldestUrl);
  }
  cleanupUnusedRenderTextures();
  const img = new Image();
  const entry = { img, loaded: false, callbacks: callback ? [callback] : [] };
  imageCache.set(url, entry);

  const handleFailure = () => {
    entry.loaded = false;
    const pending = entry.callbacks.splice(0);
    imageCache.delete(url);
    failedTextureUrls.add(url);
    if (failedTextureUrls.size > 300) {
      const oldest = failedTextureUrls.values().next().value;
      failedTextureUrls.delete(oldest);
    }
    if (render?.textures) delete render.textures[url];
    const altUrl = resolveCatalogFallbackUrl(fallbackMeta, url);
    if (altUrl) {
      for (const cb of pending) {
        preloadTexture(altUrl, cb, null);
      }
      return;
    }
    for (const cb of pending) {
      cb(null, '');
    }
  };

  img.onload = () => {
    if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) {
      handleFailure();
      return;
    }
    entry.loaded = true;
    if (render?.textures) render.textures[url] = img;
    const pending = entry.callbacks.splice(0);
    for (const cb of pending) {
      cb(img, url);
    }
  };
  img.onerror = handleFailure;
  img.src = url;
}

/* ───────── INICIALIZAR MOTOR FÍSICO (Sección 6.1) ───────── */
function initPhysics() {
  if (typeof Matter === 'undefined') {
    console.error('[jar] Matter.js no está cargado');
    const err = document.createElement('div');
    err.className = 'jar-fatal-error';
    err.textContent = 'Error: Matter.js no cargó. Reinicia el frasco o comprueba la conexión.';
    document.body.appendChild(err);
    return;
  }

  engine = Matter.Engine.create({
    positionIterations: 12,
    velocityIterations: 10,
    constraintIterations: 4,
    enableSleeping: true
  });

  const width = window.innerWidth || 800;
  const height = window.innerHeight || 800;

  render = Matter.Render.create({
    element: canvasContainer,
    engine: engine,
    options: {
      width: width,
      height: height,
      wireframes: false,
      background: 'transparent',
      showSleeping: false
    }
  });

  runner = Matter.Runner.create({
    delta: 1000 / 60
  });

  containerBodies = buildJarBodies(width, height, currentConfig);
  Matter.Composite.add(engine.world, containerBodies);

  // Fusión Suika Game (regalos idénticos del mismo nivel, inicio y contacto continuo tras cooldown)
  const handleCollisionPairs = (event) => {
    const pairs = event?.pairs;
    if (!Array.isArray(pairs) || pairs.length === 0) return;
    const now = Date.now();
    const pendingMerges = [];
    for (const pair of pairs) {
      const bodyA = pair?.bodyA;
      const bodyB = pair?.bodyB;
      if (!canBodiesMerge(bodyA, bodyB, now)) continue;
      bodyA._merged = true;
      bodyB._merged = true;
      pendingMerges.push([bodyA, bodyB]);
    }
    for (const [bodyA, bodyB] of pendingMerges) {
      mergeBodies(bodyA, bodyB, now);
    }
  };
  Matter.Events.on(engine, 'collisionStart', handleCollisionPairs);
  Matter.Events.on(engine, 'collisionActive', handleCollisionPairs);

  // Hook de dibujo adicional para bordes nítidos, fallback de Rosa y destello discreto de fusión
  preloadTexture(getRoseFallbackUrl(), null, null);
  Matter.Events.on(render, 'afterRender', () => {
    const ctx = render.context;
    if (!ctx) return;
    const bodies = Matter.Composite.allBodies(engine.world);
    for (const body of bodies) {
      if (body.isStatic || !body.circleRadius) continue;
      const R = body.circleRadius;
      const x = body.position.x;
      const y = body.position.y;

      const spriteTexture = body.render?.sprite?.texture;
      const texImg = spriteTexture ? render.textures?.[spriteTexture] : null;
      const isTextureLoaded = Boolean(
        spriteTexture &&
          (body.render?.sprite?.textureLoaded || imageCache.get(spriteTexture)?.loaded) &&
          texImg &&
          texImg.complete &&
          texImg.naturalWidth > 0 &&
          texImg.naturalHeight > 0
      );

      if (!isTextureLoaded) {
        if (body.render?.sprite) {
          delete body.render.sprite;
        }
        const roseUrl = getRoseFallbackUrl();
        const roseEntry = imageCache.get(roseUrl);
        const roseTex = render.textures?.[roseUrl] || (roseEntry?.loaded ? roseEntry.img : null);
        if (roseTex && roseTex.complete && roseTex.naturalWidth > 0 && roseTex.naturalHeight > 0) {
          ctx.drawImage(roseTex, x - R * 1.25, y - R * 1.25, R * 2.5, R * 2.5);
        } else {
          if (roseUrl && !roseEntry && !failedTextureUrls.has(roseUrl)) {
            preloadTexture(roseUrl, null, null);
          }
          const roseCanvas = getFallbackRoseCanvas();
          if (roseCanvas) {
            ctx.drawImage(roseCanvas, x - R, y - R, R * 2, R * 2);
          } else {
            ctx.beginPath();
            ctx.arc(x, y, R, 0, Math.PI * 2);
            ctx.fillStyle = '#FF85A6';
            ctx.fill();
          }
        }
      }

      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = Math.max(1.2, R * 0.05);
      ctx.stroke();
    }

    if (mergeEffects.length > 0) {
      const now = Date.now();
      ctx.save();
      for (let i = mergeEffects.length - 1; i >= 0; i -= 1) {
        const fx = mergeEffects[i];
        const progress = (now - fx.createdAt) / fx.duration;
        if (progress >= 1) {
          mergeEffects.splice(i, 1);
          continue;
        }
        const ease = 1 - Math.pow(1 - progress, 2);
        const alpha = Math.max(0, 1 - progress);
        const ringR = fx.startR + (fx.endR - fx.startR) * ease;

        ctx.beginPath();
        ctx.arc(fx.x, fx.y, ringR * 0.86, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 246, 214, ${(0.16 * alpha).toFixed(3)})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(fx.x, fx.y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.48 * alpha).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, 2.2 * alpha);
        ctx.stroke();
      }
      ctx.restore();
    }
  });

  Matter.Render.run(render);
  Matter.Runner.run(runner, engine);

  window.addEventListener('resize', handleResize);
  document.addEventListener('visibilitychange', () => {
    if (isBackgroundPaused()) {
      if (runner && engine) Matter.Runner.stop(runner);
      if (render) Matter.Render.stop?.(render);
    } else {
      if (render) Matter.Render.run?.(render);
      if (runner && engine) Matter.Runner.run(runner, engine);
    }
  });
}

function handleResize() {
  if (!render || !engine) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (typeof Matter.Render?.setSize === 'function') {
    Matter.Render.setSize(render, width, height);
  } else {
    render.canvas.width = width;
    render.canvas.height = height;
    render.options.width = width;
    render.options.height = height;
  }

  rebuildJarContainer();
}

function rebuildJarContainer() {
  if (!engine) return;
  for (const body of containerBodies) {
    Matter.Composite.remove(engine.world, body);
  }
  containerBodies = buildJarBodies(window.innerWidth, window.innerHeight, currentConfig);
  Matter.Composite.add(engine.world, containerBodies);

  const nextX = Number(currentConfig.xOffset) || 0;
  const nextY = Number(currentConfig.yOffset) || 0;
  const dx = nextX - lastOffsets.x;
  const dy = nextY - lastOffsets.y;
  lastOffsets = { x: nextX, y: nextY };

  for (const activeBody of dynamicBodies) {
    if ((dx !== 0 || dy !== 0) && typeof Matter.Body?.translate === 'function') {
      Matter.Body.translate(activeBody, { x: dx, y: dy });
    }
    if (activeBody.isSleeping && Matter.Sleeping?.set) {
      Matter.Sleeping.set(activeBody, false);
    }
  }
}

/* ───────── SUIKA MERGE + SPAWN DE REGALO (Sección 6.5) ───────── */
function makeGiftKey(item, singleValue) {
  const rawId = item?.giftId !== undefined && item?.giftId !== null ? String(item.giftId).trim() : '';
  const rawName = String(item?.giftName || item?.name || 'gift').trim().toLowerCase();
  const base = rawId && rawId !== '0' ? `id:${rawId}` : `name:${rawName}`;
  return `${base}:${singleValue}`;
}

function getMaxMergeRadius(scale = currentConfig.scale) {
  const s = Math.max(0.1, Math.min(3.0, Number(scale) || 1.0));
  return 90 * s;
}

function canBodiesMerge(bodyA, bodyB, now = Date.now()) {
  if (!bodyA || !bodyB || bodyA === bodyB) return false;
  if (bodyA.isStatic || bodyB.isStatic) return false;
  if (bodyA._merged || bodyB._merged || bodyA._removed || bodyB._removed) return false;
  const metaA = bodyA.jarMeta;
  const metaB = bodyB.jarMeta;
  if (!metaA || !metaB) return false;
  if (metaA.giftKey !== metaB.giftKey) return false;
  if (metaA.mergeTier !== metaB.mergeTier) return false;
  if (metaA.mergeTier >= MAX_MERGE_TIER) return false;
  if (now < metaA.mergeReadyAt || now < metaB.mergeReadyAt) return false;
  const maxAllowedR = getMaxMergeRadius(currentConfig.scale);
  const currentMaxR = Math.max(bodyA.circleRadius || 0, bodyB.circleRadius || 0);
  if (currentMaxR >= maxAllowedR - 0.5) return false;
  return true;
}

function wakeNearbyBodies(x, y, radius) {
  if (!Matter.Sleeping?.set) return;
  const reach = radius * 3.2;
  for (const activeBody of dynamicBodies) {
    if (!activeBody || !activeBody.isSleeping) continue;
    const dx = Math.abs((activeBody.position?.x || 0) - x);
    const dy = (activeBody.position?.y || 0) - y;
    if (dx <= reach && dy <= radius * 1.5 && dy >= -reach) {
      Matter.Sleeping.set(activeBody, false);
    }
  }
}

function pushMergeEffect(x, y, radius, now = Date.now()) {
  while (mergeEffects.length >= MAX_MERGE_EFFECTS) {
    mergeEffects.shift();
  }
  mergeEffects.push({
    x,
    y,
    startR: radius * 0.72,
    endR: radius * 1.48,
    createdAt: now,
    duration: MERGE_EFFECT_DURATION_MS
  });
}

function mergeBodies(bodyA, bodyB, now = Date.now()) {
  if (!engine || !bodyA || !bodyB || bodyA._removed || bodyB._removed) return null;
  bodyA._merged = true;
  bodyB._merged = true;
  bodyA._removed = true;
  bodyB._removed = true;

  const metaA = bodyA.jarMeta;
  const metaB = bodyB.jarMeta;
  if (!metaA || !metaB) return null;

  const s = Math.max(0.1, Math.min(3.0, Number(currentConfig.scale) || 1.0));
  const maxAllowedR = getMaxMergeRadius(s);
  const baseR = Math.max(bodyA.circleRadius || 11, bodyB.circleRadius || 11);
  const nextR = Math.min(maxAllowedR, baseR * MERGE_RADIUS_FACTOR);

  const width = window.innerWidth || 800;
  const height = window.innerHeight || 800;
  const Xc = width / 2 + (Number(currentConfig.xOffset) || 0);
  const Yc = height / 2 + (Number(currentConfig.yOffset) || 0);

  const rawMidX = (bodyA.position.x + bodyB.position.x) / 2;
  const rawMidY = (bodyA.position.y + bodyB.position.y) / 2;
  const halfInnerW = rawMidY < Yc - 115 * s ? 104 * s : 133 * s;
  const minX = Xc - halfInnerW + nextR;
  const maxX = Xc + halfInnerW - nextR;
  const midX = minX <= maxX ? Math.max(minX, Math.min(maxX, rawMidX)) : Xc;
  const midY = Math.min(Yc + 184 * s - nextR, rawMidY);

  const vx = (((bodyA.velocity?.x || 0) + (bodyB.velocity?.x || 0)) * 0.15);
  const vy = Math.min(0, ((bodyA.velocity?.y || 0) + (bodyB.velocity?.y || 0)) * 0.15);

  Matter.Composite.remove(engine.world, bodyA);
  Matter.Composite.remove(engine.world, bodyB);
  const idxA = dynamicBodies.indexOf(bodyA);
  if (idxA !== -1) dynamicBodies.splice(idxA, 1);
  const idxB = dynamicBodies.indexOf(bodyB);
  if (idxB !== -1) dynamicBodies.splice(idxB, 1);

  wakeNearbyBodies(midX, midY, nextR);
  pushMergeEffect(midX, midY, nextR, now);

  return spawnGift(
    {
      giftKey: metaA.giftKey,
      giftPictureUrl: metaA.textureUrl,
      singleValue: metaA.singleValue
    },
    {
      mergeTier: metaA.mergeTier + 1,
      mergeCount: metaA.mergeCount + metaB.mergeCount,
      radiusOverride: nextR,
      spawnPos: { x: midX, y: midY },
      velocity: { x: vx, y: vy },
      mergeCooldownMs: MERGE_COOLDOWN_MS,
      now
    }
  );
}

function spawnGift(item, options = {}) {
  if (!engine) return null;
  const singleValue = Number(item.singleValue || item.value || 1);
  const R = Number(options.radiusOverride) || computeRadius(singleValue, currentConfig.scale, currentConfig.giftScale);
  const spawnPos = options.spawnPos || computeSpawnPosition(R, window.innerWidth, window.innerHeight, currentConfig);

  const rawUrl = item.giftPictureUrl || '';
  const textureUrl = isSafeImageUrl(rawUrl) ? rawUrl.trim() : '';
  const fallbackMeta = { giftId: item.giftId, giftName: item.giftName };
  if (textureUrl && (item.giftId || item.giftName)) {
    registerGiftCatalogEntries([{ id: item.giftId, name: item.giftName, imageUrl: textureUrl }]);
  }

  const bodyOptions = {
    restitution: 0.2,
    friction: 0.2,
    frictionStatic: 1.0,
    density: 0.0015,
    sleepThreshold: 45,
    render: {
      fillStyle: '#FF85A6'
    }
  };

  const cached = textureUrl ? imageCache.get(textureUrl) : null;
  if (cached?.loaded && cached.img.naturalWidth > 0 && cached.img.naturalHeight > 0) {
    const naturalW = cached.img.naturalWidth;
    const naturalH = cached.img.naturalHeight;
    if (render?.textures) render.textures[textureUrl] = cached.img;
    bodyOptions.render.sprite = {
      texture: textureUrl,
      xScale: (R * 2.5) / naturalW,
      yScale: (R * 2.5) / naturalH,
      textureLoaded: true
    };
  }

  const body = Matter.Bodies.circle(spawnPos.x, spawnPos.y, R, bodyOptions);
  const now = options.now ?? Date.now();
  body._merged = false;
  body._removed = false;
  body.jarMeta = {
    giftKey: item.giftKey || makeGiftKey(item, singleValue),
    mergeTier: Number(options.mergeTier) || 0,
    mergeCount: Number(options.mergeCount) || 1,
    singleValue,
    textureUrl,
    mergeReadyAt: now + (options.mergeCooldownMs ?? MERGE_COOLDOWN_MS)
  };
  if (options.velocity) {
    Matter.Body?.setVelocity?.(body, options.velocity);
  }

  Matter.Composite.add(engine.world, body);
  dynamicBodies.push(body);

  if (textureUrl && (!cached || !cached.loaded)) {
    preloadTexture(
      textureUrl,
      (img, resolvedUrl) => {
        if (body._removed || body._evicted || !dynamicBodies.includes(body) || !body?.render) return;
        if (!img || !(img.naturalWidth > 0 && img.naturalHeight > 0)) {
          delete body.render.sprite;
          return;
        }
        const naturalW = img.naturalWidth;
        const naturalH = img.naturalHeight;
        body.render.sprite = {
          texture: resolvedUrl || textureUrl,
          xScale: (R * 2.5) / naturalW,
          yScale: (R * 2.5) / naturalH,
          textureLoaded: true
        };
      },
      fallbackMeta
    );
  }
  let evicted = false;
  while (dynamicBodies.length > MAX_BODIES) {
    const oldestBody = dynamicBodies.shift();
    if (oldestBody) {
      oldestBody._removed = true;
      oldestBody._evicted = true;
      Matter.Composite.remove(engine.world, oldestBody);
      evicted = true;
    }
  }
  if (evicted) {
    cleanupUnusedRenderTextures();
    if (Matter.Sleeping?.set) {
      for (const activeBody of dynamicBodies) {
        if (activeBody.isSleeping) {
          Matter.Sleeping.set(activeBody, false);
        }
      }
    }
  }
  return body;
}

/* ───────── COLA ADAPTATIVA DE REGALOS (Sección 8.1) ───────── */
function computeQueueDelayMs(queueLength = giftQueue.length) {
  if (queueLength > 200) return 16;
  if (queueLength > 100) return 28;
  if (queueLength > 50) return 55;
  if (queueLength > 20) return 90;
  return 200;
}

function creditGiftDirect(data, totalCoins) {
  currentCoinsTotal += totalCoins;
  updateTotalCoinsHud();
  updateLeaderboardWithGift(data.username, data.displayName, data.profilePictureUrl, totalCoins);
}

function enqueueGift(data) {
  if (!data || typeof data !== 'object') return;
  const repeatCount = Math.max(1, Number(data.repeatCount) || 1);
  const singleValue = Math.max(1, Number(data.value || data.coinsPerGift || Math.round(Number(data.coins || 1) / repeatCount) || 1));
  const totalCoins = Math.max(singleValue * repeatCount, Number(data.coins) || singleValue * repeatCount);

  if (isBackgroundPaused()) {
    creditGiftDirect(data, totalCoins);
    return;
  }

  const availableSlots = Math.max(0, MAX_QUEUE_LENGTH - giftQueue.length);
  const physicalCount = Math.min(repeatCount, MAX_PHYSICAL_PER_EVENT, availableSlots);

  if (physicalCount <= 0) {
    creditGiftDirect(data, totalCoins);
    showAlert({ ...data, singleValue, repeatCount });
    return;
  }

  const basePerSphere = Math.floor(totalCoins / physicalCount);
  let remainder = totalCoins - basePerSphere * physicalCount;

  // Desglose acotado de combos en esferas físicas sin perder monedas
  for (let i = 0; i < physicalCount; i++) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    giftQueue.push({
      ...data,
      singleValue: Math.max(1, basePerSphere + extra),
      originalSingleValue: singleValue,
      isFirstOfCombo: i === 0,
      comboIndex: i + 1,
      totalCombo: repeatCount
    });
  }
}

function processQueueTick() {
  if (isBackgroundPaused()) return; // Pausa en pestaña oculta salvo en Studio Mode (Sección 8.1)
  if (giftQueue.length === 0) return;

  const item = giftQueue.shift();
  const value = item.singleValue || 1;

  // 1. Sumar monedas y actualizar HUD
  currentCoinsTotal += value;
  updateTotalCoinsHud();

  // 2. Materializar esfera física
  spawnGift(item);

  // 3. Actualizar Leaderboard
  updateLeaderboardWithGift(item.username, item.displayName, item.profilePictureUrl, value);

  // 4. Mostrar burbuja de alerta si es el primer impacto o alerta individual
  if (item.isFirstOfCombo) {
    showAlert({ ...item, singleValue: item.originalSingleValue || value });
  }
}

/* ───────── HUD: TOTAL COINS Y META (Sección 8.3) ───────── */
function updateTotalCoinsHud() {
  const goal = Math.max(1, Number(currentConfig.goalCoins) || 1000);
  if (totalCoinsCount) {
    totalCoinsCount.textContent = formatNumber(currentCoinsTotal);
  }
  if (goalCoinsTarget) {
    goalCoinsTarget.textContent = formatNumber(goal);
  }
  const ratio = Math.max(0, Math.min(1, currentCoinsTotal / goal));
  if (goalProgressBar) {
    goalProgressBar.style.transform = `scaleX(${ratio.toFixed(4)})`;
  }
  const goalReached = currentCoinsTotal >= goal;
  if (totalCoinsBox) {
    totalCoinsBox.hidden = currentConfig.showTotalCoins === false;
    totalCoinsBox.classList?.toggle('is-goal-reached', goalReached);
    if (goalReached && !hasCelebratedGoal && !isInitialLoad) {
      hasCelebratedGoal = true;
      totalCoinsBox.classList?.add('is-goal-just-reached');
      clearTimeout(goalPulseTimer);
      goalPulseTimer = setTimeout(() => {
        totalCoinsBox.classList?.remove('is-goal-just-reached');
      }, 720);
    } else if (!goalReached) {
      hasCelebratedGoal = false;
    }
  }
}

/* ───────── HUD: LEADERBOARD ROTATIVO (Sección 8.2) ───────── */
function getRankLimit() {
  if (currentConfig.numberOfRanks === 'top3') return 3;
  if (currentConfig.numberOfRanks === 'top10') return 10;
  return 5;
}

function getVisibleDonors() {
  return topDonorsList.slice(0, getRankLimit());
}

function updateLeaderboardWithGift(username, displayName, avatarUrl, coins) {
  if (!username) return;
  const safeAvatar = isSafeImageUrl(avatarUrl) ? avatarUrl.trim() : '';
  let entry = topDonorsList.find((d) => d.username.toLowerCase() === username.toLowerCase());
  if (entry) {
    entry.totalCoins += coins;
    if (displayName) entry.displayName = displayName;
    if (safeAvatar) entry.avatarUrl = safeAvatar;
  } else {
    entry = {
      username,
      displayName: displayName || username,
      avatarUrl: safeAvatar,
      totalCoins: coins
    };
    topDonorsList.push(entry);
  }
  topDonorsList.sort((a, b) => b.totalCoins - a.totalCoins);

  if (topDonorsList.length > MAX_DONORS_TRACKED) {
    topDonorsList.length = MAX_DONORS_TRACKED;
  }

  renderCurrentLeaderboardItem();
}

function renderCurrentLeaderboardItem() {
  if (!leaderboardBox) return;
  if (currentConfig.displayLeaderboard === false) {
    leaderboardBox.hidden = true;
    return;
  }
  leaderboardBox.hidden = false;

  const visibleDonors = getVisibleDonors();
  if (visibleDonors.length === 0) {
    leaderboardUsername.textContent = 'Esperando donaciones...';
    leaderboardCoins.textContent = '0';
    leaderboardAvatar.onerror = null;
    leaderboardAvatar.src = '/assets/coin-icon.svg';
    leaderboardAvatar.hidden = false;
    leaderboardAvatarFallback.hidden = true;
    leaderboardMedal.src = '/assets/first.svg';
    leaderboardMedal.hidden = false;
    leaderboardRankText.hidden = true;
    leaderboardProgressBar.style.transform = 'scaleX(0)';
    return;
  }

  if (currentLeaderboardIndex >= visibleDonors.length) {
    currentLeaderboardIndex = 0;
  }

  const donor = visibleDonors[currentLeaderboardIndex];
  const rank = currentLeaderboardIndex + 1;

  leaderboardUsername.textContent = donor.displayName || donor.username;
  leaderboardCoins.textContent = formatNumber(donor.totalCoins);

  const safeAvatar = isSafeImageUrl(donor.avatarUrl) ? donor.avatarUrl.trim() : '';
  if (safeAvatar) {
    leaderboardAvatarFallback.textContent = (donor.username || 'A')[0].toUpperCase();
    leaderboardAvatar.onerror = () => {
      leaderboardAvatar.hidden = true;
      leaderboardAvatarFallback.hidden = false;
    };
    leaderboardAvatar.src = safeAvatar;
    leaderboardAvatar.hidden = false;
    leaderboardAvatarFallback.hidden = true;
  } else {
    leaderboardAvatar.onerror = null;
    leaderboardAvatar.hidden = true;
    leaderboardAvatarFallback.hidden = false;
    leaderboardAvatarFallback.textContent = (donor.username || 'A')[0].toUpperCase();
  }

  // Medallas
  if (currentConfig.displayRankBadges !== false) {
    if (rank === 1) {
      leaderboardMedal.src = '/assets/first.svg';
      leaderboardMedal.hidden = false;
      leaderboardRankText.hidden = true;
    } else if (rank === 2) {
      leaderboardMedal.src = '/assets/second.svg';
      leaderboardMedal.hidden = false;
      leaderboardRankText.hidden = true;
    } else if (rank === 3) {
      leaderboardMedal.src = '/assets/third.svg';
      leaderboardMedal.hidden = false;
      leaderboardRankText.hidden = true;
    } else {
      leaderboardMedal.hidden = true;
      leaderboardRankText.hidden = false;
      leaderboardRankText.textContent = `${rank}.`;
    }
  } else {
    leaderboardMedal.hidden = true;
    leaderboardRankText.hidden = false;
    leaderboardRankText.textContent = `${rank}.`;
  }
}

function startLeaderboardCarousel() {
  clearInterval(leaderboardTimer);
  const duration = Math.max(2, Number(currentConfig.leaderboardDuration) || 5);
  lastLeaderboardDuration = duration;

  let remaining = duration * 1000;
  const step = 100;

  leaderboardTimer = setInterval(() => {
    if (isBackgroundPaused()) return;
    const visibleDonors = getVisibleDonors();
    if (visibleDonors.length <= 1) {
      leaderboardProgressBar.style.transform = visibleDonors.length === 1 ? 'scaleX(1)' : 'scaleX(0)';
      return;
    }

    remaining -= step;
    const ratio = Math.max(0, Math.min(1, remaining / (duration * 1000)));
    leaderboardProgressBar.style.transform = `scaleX(${ratio.toFixed(4)})`;

    if (remaining <= 0) {
      remaining = duration * 1000;
      currentLeaderboardIndex = (currentLeaderboardIndex + 1) % visibleDonors.length;
      renderCurrentLeaderboardItem();
    }
  }, step);
}

/* ───────── HUD: ALERTA EMERGENTE (Sección 8.4) ───────── */
function showAlert(item) {
  if (!alertBubble || currentConfig.displayAlert === false) return;

  clearTimeout(alertTimer);

  const displayRepeat = Math.max(1, Number(item.comboTotal || item.repeatCount || 1));
  alertUsername.textContent = item.displayName || item.username || 'Alguien';
  alertGiftName.textContent = item.giftName || 'Regalo';
  alertRepeatCount.textContent = `x${displayRepeat}`;

  const totalValue = (item.singleValue || 1) * displayRepeat;
  const coinWord = totalValue === 1 ? 'moneda' : 'monedas';
  alertCoinsValue.textContent = `(${formatNumber(totalValue)} ${coinWord})`;

  const safeGiftUrl = isSafeImageUrl(item.giftPictureUrl) ? item.giftPictureUrl.trim() : '';
  const roseFallback = getRoseFallbackUrl();
  if (safeGiftUrl) {
    alertGiftIcon.onerror = () => {
      alertGiftIcon.onerror = null;
      if (alertGiftIcon.src !== roseFallback) {
        alertGiftIcon.src = roseFallback;
      }
    };
    alertGiftIcon.src = safeGiftUrl;
    alertGiftIcon.hidden = false;
  } else {
    alertGiftIcon.onerror = null;
    alertGiftIcon.src = roseFallback;
    alertGiftIcon.hidden = false;
  }

  const safeProfileUrl = isSafeImageUrl(item.profilePictureUrl) ? item.profilePictureUrl.trim() : '';
  if (safeProfileUrl) {
    alertAvatarFallback.textContent = (item.username || 'A')[0].toUpperCase();
    alertAvatar.onerror = () => {
      alertAvatar.hidden = true;
      alertAvatarFallback.hidden = false;
    };
    alertAvatar.src = safeProfileUrl;
    alertAvatar.hidden = false;
    alertAvatarFallback.hidden = true;
  } else {
    alertAvatar.onerror = null;
    alertAvatar.hidden = true;
    alertAvatarFallback.hidden = false;
    alertAvatarFallback.textContent = (item.username || 'A')[0].toUpperCase();
  }

  alertBubble.classList.add('is-visible');

  const duration = Math.max(2, Number(currentConfig.alertDuration) || 5) * 1000;
  alertTimer = setTimeout(() => {
    alertBubble.classList.remove('is-visible');
  }, duration);
}

/* ───────── VACIAR FRASCO (Sección 5.2) ───────── */
function resetJar() {
  giftQueue.length = 0;
  for (const b of dynamicBodies) {
    if (b) b._evicted = true;
  }
  dynamicBodies.length = 0;
  mergeEffects.length = 0;
  cleanupUnusedRenderTextures();

  if (engine) {
    const bodies = Matter.Composite.allBodies(engine.world);
    for (const b of bodies) {
      if (!b.isStatic) {
        b._removed = true;
        Matter.Composite.remove(engine.world, b);
      }
    }
  }

  currentCoinsTotal = 0;
  topDonorsList = [];
  currentLeaderboardIndex = 0;
  hasCelebratedGoal = false;
  totalCoinsBox?.classList?.remove('is-goal-reached', 'is-goal-just-reached');

  updateTotalCoinsHud();
  renderCurrentLeaderboardItem();

  if (alertBubble) {
    alertBubble.classList.remove('is-visible');
    clearTimeout(alertTimer);
  }
}

let isInitialLoad = true;
let hasHydratedBodies = false;
const processedEventKeys = new Set();

let lastGeometryKey = '';

/* ───────── REHIDRATACIÓN AL RECARGAR OBS ───────── */
function buildRehydrationPlan(totalCoins, recentGifts = []) {
  let remaining = Math.max(0, Math.round(Number(totalCoins) || 0));
  if (remaining <= 0) return [];

  const plan = [];
  const maxRehydrateBodies = 45;
  const recent = Array.isArray(recentGifts) ? recentGifts : [];
  const fallbackTextures = recent.map((g) => g?.imageUrl).filter((u) => isSafeImageUrl(u));

  for (const gift of recent) {
    if (plan.length >= maxRehydrateBodies || remaining <= 0) break;
    const giftCoins = Math.max(1, Math.round(Number(gift?.coins) || 1));
    if (giftCoins <= remaining) {
      plan.push({
        singleValue: giftCoins,
        giftId: gift?.giftId || '',
        giftName: gift?.name || 'Regalo',
        giftPictureUrl: isSafeImageUrl(gift?.imageUrl)
          ? gift.imageUrl
          : resolveTestGiftPictureUrl(gift?.giftId, gift?.name)
      });
      remaining -= giftCoins;
    }
  }

  const denominations = [10000, 5000, 1000, 500, 100, 50, 20, 10, 5, 1];
  while (remaining > 0 && plan.length < maxRehydrateBodies) {
    const slotsLeft = maxRehydrateBodies - plan.length;
    let chosen = 1;
    for (const denom of denominations) {
      if (remaining >= denom && (remaining / denom >= 3 || denom === 1 || slotsLeft <= 8)) {
        chosen = denom;
        break;
      }
    }
    if (slotsLeft === 1) {
      chosen = remaining;
    }
    const sampleTexture = fallbackTextures.length > 0
      ? fallbackTextures[plan.length % fallbackTextures.length]
      : getRoseFallbackUrl();
    plan.push({
      singleValue: chosen,
      giftName: 'Rosa',
      giftPictureUrl: sampleTexture
    });
    remaining -= chosen;
  }

  return plan;
}

function rehydrateJarBodies(cfg) {
  if (!engine || dynamicBodies.length > 0) return;
  const plan = buildRehydrationPlan(currentCoinsTotal, cfg?.recentGifts);
  if (plan.length === 0) return;

  const width = window.innerWidth || 800;
  const height = window.innerHeight || 800;
  const s = Math.max(0.1, Math.min(3.0, Number(currentConfig.scale) || 1.0));
  const Xc = width / 2 + (Number(currentConfig.xOffset) || 0);
  const Yc = height / 2 + (Number(currentConfig.yOffset) || 0);
  const now = Date.now();

  for (let i = 0; i < plan.length; i += 1) {
    const item = plan[i];
    const R = computeRadius(item.singleValue, currentConfig.scale, currentConfig.giftScale);
    const maxOffset = Math.max(0, 110 * s - R);
    const jitterX = maxOffset > 0 ? (Math.random() * 2 - 1) * maxOffset : 0;
    const minY = Yc - 75 * s + R;
    const maxY = Yc + 165 * s - R;
    const rowY = maxY - (i % 6) * Math.min(28 * s, Math.max(8, R * 1.4));
    const spawnY = minY <= maxY ? Math.max(minY, Math.min(maxY, rowY)) : Yc;

    spawnGift(item, {
      spawnPos: { x: Xc + jitterX, y: spawnY },
      mergeCooldownMs: 800,
      now
    });
  }
}

function mergeTopDonors(incoming) {
  if (!Array.isArray(incoming)) return;
  for (const donor of incoming) {
    if (!donor || typeof donor !== 'object' || !donor.username) continue;
    const incomingCoins = Math.max(0, Number(donor.totalCoins) || 0);
    const safeAvatar = isSafeImageUrl(donor.avatarUrl) ? donor.avatarUrl.trim() : '';
    const existing = topDonorsList.find((d) => d.username.toLowerCase() === String(donor.username).toLowerCase());
    if (existing) {
      existing.totalCoins = Math.max(existing.totalCoins, incomingCoins);
      if (donor.displayName) existing.displayName = donor.displayName;
      if (safeAvatar) existing.avatarUrl = safeAvatar;
    } else {
      topDonorsList.push({
        username: donor.username,
        displayName: donor.displayName || donor.username,
        avatarUrl: safeAvatar,
        totalCoins: incomingCoins
      });
    }
  }
  topDonorsList.sort((a, b) => b.totalCoins - a.totalCoins);
  if (topDonorsList.length > MAX_DONORS_TRACKED) {
    topDonorsList.length = MAX_DONORS_TRACKED;
  }
}

/* ───────── APLICAR CONFIGURACIÓN ───────── */
function applyConfig(cfg, { isReconnect = false } = {}) {
  if (!cfg || typeof cfg !== 'object') return;
  const newGeomKey = `${cfg.scale ?? currentConfig.scale}|${cfg.xOffset ?? currentConfig.xOffset}|${cfg.yOffset ?? currentConfig.yOffset}`;
  const geomChanged = newGeomKey !== lastGeometryKey;
  lastGeometryKey = newGeomKey;

  if (Array.isArray(cfg.giftCatalog)) {
    registerGiftCatalogEntries(cfg.giftCatalog);
  }
  if (Array.isArray(cfg.gifts)) {
    registerGiftCatalogEntries(cfg.gifts);
  }

  currentConfig = {
    ...currentConfig,
    ...cfg
  };

  document.documentElement.style.setProperty('--accent', currentConfig.accent || '#e83e5f');
  document.documentElement.style.setProperty('--x-offset', `${currentConfig.xOffset || 0}px`);
  document.documentElement.style.setProperty('--y-offset', `${currentConfig.yOffset || 0}px`);
  document.documentElement.style.setProperty('--scale', `${currentConfig.scale || 1.0}`);

  const shouldHydrate = isInitialLoad && !hasHydratedBodies && dynamicBodies.length === 0 && Number(cfg.currentCoins || currentCoinsTotal) > 0;
  if (isInitialLoad) {
    if (cfg.currentCoins !== undefined) {
      currentCoinsTotal = Number(cfg.currentCoins) || 0;
      const initialGoal = Math.max(1, Number(currentConfig.goalCoins) || 1000);
      hasCelebratedGoal = currentCoinsTotal >= initialGoal;
    }
    if (Array.isArray(cfg.topDonors)) {
      topDonorsList = cfg.topDonors
        .filter((d) => d && typeof d === 'object' && d.username)
        .map((d) => ({
          ...d,
          avatarUrl: isSafeImageUrl(d.avatarUrl) ? d.avatarUrl.trim() : '',
          totalCoins: Math.max(0, Number(d.totalCoins) || 0)
        }))
        .slice(0, MAX_DONORS_TRACKED);
    }
    hasHydratedBodies = true;
    isInitialLoad = false;
  } else if (isReconnect) {
    if (cfg.currentCoins !== undefined) {
      currentCoinsTotal = Math.max(currentCoinsTotal, Number(cfg.currentCoins) || 0);
    }
    if (Array.isArray(cfg.topDonors)) {
      mergeTopDonors(cfg.topDonors);
    }
  }

  if (geomChanged) {
    rebuildJarContainer();
  }
  if (shouldHydrate && currentCoinsTotal > 0) {
    rehydrateJarBodies(cfg);
  }

  updateTotalCoinsHud();
  renderCurrentLeaderboardItem();

  const nextDuration = Math.max(2, Number(currentConfig.leaderboardDuration) || 5);
  if (leaderboardTimer === null || nextDuration !== lastLeaderboardDuration) {
    startLeaderboardCarousel();
  }
}

/* ───────── WEBSOCKET & API ───────── */
async function loadGiftCatalog() {
  if (!token) return;
  try {
    const res = await fetch(`/api/gifts?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        registerGiftCatalogEntries(data);
      } else if (data && Array.isArray(data.gifts)) {
        registerGiftCatalogEntries(data.gifts);
      }
    }
  } catch {
    // Endpoint opcional: ignorar si no está disponible
  }
}

async function loadState() {
  if (!token) return;
  try {
    const res = await fetch(`/api/jar?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      applyConfig(data);
    }
  } catch (err) {
    console.warn('[jar] no se pudo cargar estado:', err);
  }
}

function connect() {
  if (!token) return;
  clearTimeout(reconnectTimer);
  if (socket) {
    try {
      socket.close();
    } catch {
      // Ignorado
    }
    socket = null;
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}&client=jar`);
  socket = ws;

  ws.addEventListener('open', () => {
    if (socket !== ws) return;
    reconnectAttempt = 0;
  });

  ws.addEventListener('message', (event) => {
    if (socket !== ws) return;
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!payload || typeof payload !== 'object') return;

    if (payload.type === 'hello') {
      if (Array.isArray(payload.gifts)) registerGiftCatalogEntries(payload.gifts);
      applyConfig(payload.jar || payload.config, { isReconnect: !isInitialLoad });
    } else if (payload.type === 'gifts') {
      registerGiftCatalogEntries(payload.gifts);
    } else if (payload.type === 'jar') {
      applyConfig(payload.jar || payload.config);
    } else if (payload.type === 'coin-jar:gift' || payload.type === 'jar:gift') {
      if (payload.id && processedEventKeys.has(payload.id)) return;
      if (payload.id) {
        processedEventKeys.add(payload.id);
        if (processedEventKeys.size > 200) {
          const oldest = processedEventKeys.values().next().value;
          processedEventKeys.delete(oldest);
        }
      }
      enqueueGift(payload);
    } else if (payload.type === 'coin-jar:reset' || payload.type === 'jar:reset') {
      resetJar();
    }
  });

  ws.addEventListener('close', () => {
    if (socket !== ws) return;
    const delay = Math.min(15000, 1000 * Math.pow(2, reconnectAttempt)) + Math.floor(Math.random() * 500);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  });

  ws.addEventListener('error', () => {
    if (socket !== ws) return;
    ws.close();
  });
}

/* ───────── MODO DE PRUEBA / DEMO ───────── */
function resolveTestGiftPictureUrl(giftId, giftName) {
  return (
    (giftId ? giftCatalogMap.get(`id:${String(giftId).trim().toLowerCase()}`) : '') ||
    (giftName ? giftCatalogMap.get(`name:${String(giftName).trim().toLowerCase()}`) : '') ||
    getRoseFallbackUrl()
  );
}

function setupTestMode() {
  if (testHud) {
    testHud.hidden = !isTestMode;
  }

  // Botones de acción manual (siempre enlazados para Test, Preview o toggle en Studio)
  $('#btnTestRose')?.addEventListener('click', () => {
    enqueueGift({
      giftId: '5655',
      value: 1,
      giftName: 'Rosa',
      giftPictureUrl: resolveTestGiftPictureUrl('5655', 'Rosa'),
      repeatCount: 1,
      username: 'ViewerDePrueba',
      displayName: 'Viewer de Prueba',
      profilePictureUrl: ''
    });
  });

  $('#btnTestCombo')?.addEventListener('click', () => {
    enqueueGift({
      giftId: '5655',
      value: 1,
      giftName: 'Rosa',
      giftPictureUrl: resolveTestGiftPictureUrl('5655', 'Rosa'),
      repeatCount: 10,
      username: 'ComboMaster',
      displayName: 'Combo Master 🔥',
      profilePictureUrl: ''
    });
  });

  $('#btnTestGalaxy')?.addEventListener('click', () => {
    enqueueGift({
      giftId: '11046',
      value: 1000,
      giftName: 'Galaxia',
      giftPictureUrl: resolveTestGiftPictureUrl('11046', 'Galaxia'),
      repeatCount: 1,
      username: 'GalacticWhale',
      displayName: 'Galactic Whale 🌌',
      profilePictureUrl: ''
    });
  });

  $('#btnTestUniverse')?.addEventListener('click', () => {
    enqueueGift({
      giftId: '44999_universe',
      value: 44999,
      giftName: 'TikTok Universe',
      giftPictureUrl: resolveTestGiftPictureUrl('44999_universe', 'TikTok Universe'),
      repeatCount: 1,
      username: 'SuperVIP',
      displayName: 'Super VIP 👑',
      profilePictureUrl: ''
    });
  });

  const btnToggleDemo = $('#btnTestToggleDemo');
  if (btnToggleDemo) {
    btnToggleDemo.textContent = demoPaused ? 'Iniciar demo' : 'Pausar demo';
    btnToggleDemo.addEventListener('click', () => {
      demoPaused = !demoPaused;
      btnToggleDemo.textContent = demoPaused ? 'Reanudar demo' : 'Pausar demo';
    });
  }

  $('#btnTestReset')?.addEventListener('click', () => {
    resetJar();
  });

  // Simulación periódica continua de regalos para calibrar OBS (activa de entrada solo en modo prueba)
  const sampleGifts = [
    { giftId: '5655', value: 1, giftName: 'Rosa', repeatCount: 1, username: 'RosaFan' },
    { giftId: '5655', value: 1, giftName: 'Rosa', repeatCount: 5, username: 'ComboFan' },
    { giftId: '5487', value: 5, giftName: 'Corazón coreano', repeatCount: 1, username: 'Corazonero' },
    { giftId: '6104', value: 99, giftName: 'Gorra', repeatCount: 1, username: 'ModGamer' },
    { giftId: '7168', value: 500, giftName: 'Pistola de dinero', repeatCount: 1, username: 'DonanteTop' },
    { giftId: '11046', value: 1000, giftName: 'Galaxia', repeatCount: 1, username: 'ElenaLive' }
  ];

  if (isTestMode || isStudioMode) {
    demoInterval = setInterval(() => {
      if (demoPaused || isBackgroundPaused()) return;
      const randomItem = sampleGifts[Math.floor(Math.random() * sampleGifts.length)];
      enqueueGift({
        ...randomItem,
        giftPictureUrl: resolveTestGiftPictureUrl(randomItem.giftId, randomItem.giftName),
        displayName: randomItem.username,
        profilePictureUrl: ''
      });
    }, 3200);
  }
}

function scheduleQueueLoop() {
  clearTimeout(queueTimer);
  queueTimer = setTimeout(() => {
    if (!isBackgroundPaused() && giftQueue.length > 0) {
      processQueueTick();
      if (giftQueue.length > 250) {
        processQueueTick();
      }
    }
    scheduleQueueLoop();
  }, computeQueueDelayMs(giftQueue.length));
}

/* ───────── BOOTSTRAP ───────── */
(async () => {
  initPhysics();
  setupStudioMode();
  setupTestMode();
  await loadGiftCatalog();
  await loadState();
  connect();
  renderCurrentLeaderboardItem();
  startLeaderboardCarousel();

  // Cola adaptativa de regalos (200ms en reposo, acelera cuando > 20)
  scheduleQueueLoop();
})();
