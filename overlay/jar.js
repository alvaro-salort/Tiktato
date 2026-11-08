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

function setupStudioMode() {
  if (initialBg) {
    applyStudioBackground(initialBg);
  }
  if (!isStudioMode) return;
  if (studioHud) studioHud.hidden = false;
  applyStudioBackground(initialBg || 'green');
  studioHud?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-bg]');
    if (!btn) return;
    applyStudioBackground(btn.dataset.bg);
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

// Physics State
const MAX_BODIES = 250;
const MAX_IMAGE_CACHE = 120;
let engine = null;
let render = null;
let runner = null;
let containerBodies = [];
const dynamicBodies = [];
const imageCache = new Map();

function isBackgroundPaused() {
  return Boolean(document.hidden && !isStudioMode);
}

// Queue State
const giftQueue = [];
let queueInterval = null;
let demoInterval = null;
let demoPaused = false;
let socket = null;
let reconnectTimer = null;

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

    // Límites de seguridad de pantalla (Sección 6.3)
    Matter.Bodies.rectangle(width / 2, height + 25, width * 2, 50, wallOptions),
    Matter.Bodies.rectangle(width / 2, -25, width * 2, 50, wallOptions),
    Matter.Bodies.rectangle(-25, height / 2, 50, height * 2, wallOptions),
    Matter.Bodies.rectangle(width + 25, height / 2, 50, height * 2, wallOptions)
  ];
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

  // Caída desde encima de la boca del cuello
  const neckTopY = Yc - t - 35 * s;
  const spawnY = neckTopY - 140 * s - R;

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
function preloadTexture(url, callback) {
  if (!url) return;
  if (imageCache.has(url)) {
    const cached = imageCache.get(url);
    imageCache.delete(url);
    imageCache.set(url, cached);
    if (cached.loaded) {
      if (render?.textures) render.textures[url] = cached.img;
      callback?.(cached.img);
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
  img.crossOrigin = 'anonymous';
  const entry = { img, loaded: false, callbacks: callback ? [callback] : [] };
  imageCache.set(url, entry);
  img.onload = () => {
    entry.loaded = true;
    if (render?.textures) render.textures[url] = img;
    const pending = entry.callbacks.splice(0);
    for (const cb of pending) {
      cb(img);
    }
  };
  img.onerror = () => {
    entry.loaded = false;
    entry.callbacks.length = 0;
    imageCache.delete(url);
    if (render?.textures) delete render.textures[url];
  };
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

  // Hook de dibujo adicional para bordes nítidos y fallback dorado
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
      const isTextureLoaded = Boolean(
        spriteTexture && (body.render?.sprite?.textureLoaded || imageCache.get(spriteTexture)?.loaded)
      );

      if (!isTextureLoaded) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(x - R * 0.25, y - R * 0.25, R * 0.1, x, y, R);
        grad.addColorStop(0, '#FFE57F');
        grad.addColorStop(0.65, '#FFB800');
        grad.addColorStop(1, '#D98200');
        ctx.fillStyle = grad;
        ctx.fill();

        if (R >= 13) {
          ctx.beginPath();
          ctx.arc(x, y, R * 0.72, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.lineWidth = Math.max(1, R * 0.06);
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = Math.max(1.2, R * 0.05);
      ctx.stroke();
    }
  });

  Matter.Render.run(render);
  Matter.Runner.run(runner, engine);

  window.addEventListener('resize', handleResize);
  document.addEventListener('visibilitychange', () => {
    if (isBackgroundPaused()) {
      if (runner && engine) Matter.Runner.stop(runner);
    } else {
      if (runner && engine) Matter.Runner.run(runner, engine);
    }
  });
}

function handleResize() {
  if (!render || !engine) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  render.canvas.width = width;
  render.canvas.height = height;
  render.options.width = width;
  render.options.height = height;

  rebuildJarContainer();
}

function rebuildJarContainer() {
  if (!engine) return;
  for (const body of containerBodies) {
    Matter.Composite.remove(engine.world, body);
  }
  containerBodies = buildJarBodies(window.innerWidth, window.innerHeight, currentConfig);
  Matter.Composite.add(engine.world, containerBodies);
}

/* ───────── SPAWN DE REGALO (Sección 6.5) ───────── */
function spawnGift(item) {
  if (!engine) return;
  const singleValue = Number(item.singleValue || item.value || 1);
  const R = computeRadius(singleValue, currentConfig.scale, currentConfig.giftScale);
  const spawnPos = computeSpawnPosition(R, window.innerWidth, window.innerHeight, currentConfig);

  const textureUrl = item.giftPictureUrl || '';
  const bodyOptions = {
    restitution: 0.2,
    friction: 0.2,
    frictionStatic: 1.0,
    density: 0.0015,
    sleepThreshold: 45,
    render: {
      fillStyle: '#FFB800'
    }
  };

  const cached = textureUrl ? imageCache.get(textureUrl) : null;
  if (cached?.loaded) {
    const naturalW = cached.img.naturalWidth || 64;
    const naturalH = cached.img.naturalHeight || 64;
    if (render?.textures) render.textures[textureUrl] = cached.img;
    bodyOptions.render.sprite = {
      texture: textureUrl,
      xScale: (R * 2.5) / naturalW,
      yScale: (R * 2.5) / naturalH,
      textureLoaded: true
    };
  }

  const body = Matter.Bodies.circle(spawnPos.x, spawnPos.y, R, bodyOptions);

  if (textureUrl && (!cached || !cached.loaded)) {
    preloadTexture(textureUrl, (img) => {
      if (body?.render) {
        const naturalW = img.naturalWidth || 64;
        const naturalH = img.naturalHeight || 64;
        body.render.sprite = {
          texture: textureUrl,
          xScale: (R * 2.5) / naturalW,
          yScale: (R * 2.5) / naturalH,
          textureLoaded: true
        };
      }
    });
  }

  Matter.Composite.add(engine.world, body);
  dynamicBodies.push(body);
  let evicted = false;
  while (dynamicBodies.length > MAX_BODIES) {
    const oldestBody = dynamicBodies.shift();
    if (oldestBody) {
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
}

/* ───────── COLA DE REGALOS (Sección 8.1 - tf 200ms) ───────── */
function enqueueGift(data) {
  if (!data) return;
  const repeatCount = Math.max(1, Number(data.repeatCount) || 1);
  const singleValue = Math.max(1, Number(data.value || data.coinsPerGift || Math.round(Number(data.coins || 1) / repeatCount) || 1));

  // Desglose de combos en eventos individuales
  for (let i = 0; i < repeatCount; i++) {
    giftQueue.push({
      ...data,
      singleValue,
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
    showAlert(item);
  }
}

/* ───────── HUD: TOTAL COINS (Sección 8.3) ───────── */
function updateTotalCoinsHud() {
  if (totalCoinsCount) {
    totalCoinsCount.textContent = formatNumber(currentCoinsTotal);
  }
  if (totalCoinsBox) {
    totalCoinsBox.hidden = currentConfig.showTotalCoins === false;
  }
}

/* ───────── HUD: LEADERBOARD ROTATIVO (Sección 8.2) ───────── */
function updateLeaderboardWithGift(username, displayName, avatarUrl, coins) {
  if (!username) return;
  let entry = topDonorsList.find((d) => d.username.toLowerCase() === username.toLowerCase());
  if (entry) {
    entry.totalCoins += coins;
    if (displayName) entry.displayName = displayName;
    if (avatarUrl) entry.avatarUrl = avatarUrl;
  } else {
    entry = {
      username,
      displayName: displayName || username,
      avatarUrl: avatarUrl || '',
      totalCoins: coins
    };
    topDonorsList.push(entry);
  }
  topDonorsList.sort((a, b) => b.totalCoins - a.totalCoins);

  const limit = getRankLimit();
  if (topDonorsList.length > limit) {
    topDonorsList.length = limit;
  }

  renderCurrentLeaderboardItem();
}

function getRankLimit() {
  if (currentConfig.numberOfRanks === 'top3') return 3;
  if (currentConfig.numberOfRanks === 'top10') return 10;
  return 5;
}

function renderCurrentLeaderboardItem() {
  if (!leaderboardBox) return;
  if (currentConfig.displayLeaderboard === false) {
    leaderboardBox.hidden = true;
    return;
  }
  leaderboardBox.hidden = false;

  if (topDonorsList.length === 0) {
    leaderboardUsername.textContent = 'Esperando donaciones...';
    leaderboardCoins.textContent = '0';
    leaderboardAvatar.src = '/assets/coin-icon.svg';
    leaderboardMedal.src = '/assets/first.svg';
    leaderboardMedal.hidden = false;
    leaderboardRankText.hidden = true;
    leaderboardProgressBar.style.width = '0%';
    return;
  }

  if (currentLeaderboardIndex >= topDonorsList.length) {
    currentLeaderboardIndex = 0;
  }

  const donor = topDonorsList[currentLeaderboardIndex];
  const rank = currentLeaderboardIndex + 1;

  leaderboardUsername.textContent = donor.displayName || donor.username;
  leaderboardCoins.textContent = formatNumber(donor.totalCoins);

  if (donor.avatarUrl) {
    leaderboardAvatar.src = donor.avatarUrl;
    leaderboardAvatar.hidden = false;
    leaderboardAvatarFallback.hidden = true;
  } else {
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

  let remaining = duration * 1000;
  const step = 100;

  leaderboardTimer = setInterval(() => {
    if (isBackgroundPaused()) return;
    if (topDonorsList.length <= 1) {
      leaderboardProgressBar.style.width = '100%';
      return;
    }

    remaining -= step;
    const progress = Math.max(0, (remaining / (duration * 1000)) * 100);
    leaderboardProgressBar.style.width = `${progress}%`;

    if (remaining <= 0) {
      remaining = duration * 1000;
      currentLeaderboardIndex = (currentLeaderboardIndex + 1) % topDonorsList.length;
      renderCurrentLeaderboardItem();
    }
  }, step);
}

/* ───────── HUD: ALERTA EMERGENTE (Sección 8.4) ───────── */
function showAlert(item) {
  if (!alertBubble || currentConfig.displayAlert === false) return;

  clearTimeout(alertTimer);

  alertUsername.textContent = item.displayName || item.username || 'Alguien';
  alertGiftName.textContent = item.giftName || 'Regalo';
  alertRepeatCount.textContent = `x${item.repeatCount || 1}`;

  const totalValue = (item.singleValue || 1) * (item.repeatCount || 1);
  alertCoinsValue.textContent = `(${formatNumber(totalValue)} monedas)`;

  if (item.giftPictureUrl) {
    alertGiftIcon.src = item.giftPictureUrl;
    alertGiftIcon.hidden = false;
  } else {
    alertGiftIcon.src = '/assets/coin-icon.svg';
  }

  if (item.profilePictureUrl) {
    alertAvatar.src = item.profilePictureUrl;
    alertAvatar.hidden = false;
    alertAvatarFallback.hidden = true;
  } else {
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
  dynamicBodies.length = 0;
  cleanupUnusedRenderTextures();

  if (engine) {
    const bodies = Matter.Composite.allBodies(engine.world);
    for (const b of bodies) {
      if (!b.isStatic) {
        Matter.Composite.remove(engine.world, b);
      }
    }
  }

  currentCoinsTotal = 0;
  topDonorsList = [];
  currentLeaderboardIndex = 0;

  updateTotalCoinsHud();
  renderCurrentLeaderboardItem();

  if (alertBubble) {
    alertBubble.classList.remove('is-visible');
    clearTimeout(alertTimer);
  }
}

let isInitialLoad = true;
const processedEventKeys = new Set();

/* ───────── APLICAR CONFIGURACIÓN ───────── */
function applyConfig(cfg) {
  if (!cfg) return;
  currentConfig = {
    ...currentConfig,
    ...cfg
  };

  document.documentElement.style.setProperty('--accent', currentConfig.accent || '#e83e5f');
  document.documentElement.style.setProperty('--x-offset', `${currentConfig.xOffset || 0}px`);
  document.documentElement.style.setProperty('--y-offset', `${currentConfig.yOffset || 0}px`);
  document.documentElement.style.setProperty('--scale', `${currentConfig.scale || 1.0}`);

  if (cfg.currentCoins !== undefined && (isInitialLoad || giftQueue.length === 0)) {
    currentCoinsTotal = Number(cfg.currentCoins) || 0;
  }

  if (Array.isArray(cfg.topDonors) && (isInitialLoad || giftQueue.length === 0)) {
    topDonorsList = [...cfg.topDonors];
  }

  rebuildJarContainer();
  updateTotalCoinsHud();
  renderCurrentLeaderboardItem();
  startLeaderboardCarousel();
}

/* ───────── WEBSOCKET & API ───────── */
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
  } finally {
    isInitialLoad = false;
  }
}

function connect() {
  if (!token) return;
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`);

  socket.addEventListener('message', (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    if (payload.type === 'hello' || payload.type === 'jar') {
      applyConfig(payload.jar || payload.config);
    } else if (payload.type === 'coin-jar:gift' || payload.type === 'jar:gift') {
      const eventKey = payload.id || `${payload.username || ''}_${payload.giftName || ''}_${payload.value || payload.coins || ''}_${payload.repeatCount || 1}_${Date.now()}`;
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

  socket.addEventListener('close', () => {
    reconnectTimer = setTimeout(connect, 2000);
  });

  socket.addEventListener('error', () => socket?.close());
}

/* ───────── MODO DE PRUEBA / DEMO ───────── */
function setupTestMode() {
  if (!isTestMode) return;
  if (testHud) testHud.hidden = false;

  // Botones de acción manual
  $('#btnTestRose')?.addEventListener('click', () => {
    enqueueGift({
      value: 1,
      giftName: 'Rosa',
      giftPictureUrl: '/assets/coin-icon.svg',
      repeatCount: 1,
      username: 'ViewerDePrueba',
      displayName: 'Viewer de Prueba',
      profilePictureUrl: ''
    });
  });

  $('#btnTestCombo')?.addEventListener('click', () => {
    enqueueGift({
      value: 1,
      giftName: 'Rosa',
      giftPictureUrl: '/assets/coin-icon.svg',
      repeatCount: 10,
      username: 'ComboMaster',
      displayName: 'Combo Master 🔥',
      profilePictureUrl: ''
    });
  });

  $('#btnTestGalaxy')?.addEventListener('click', () => {
    enqueueGift({
      value: 1000,
      giftName: 'Galaxia',
      giftPictureUrl: '/assets/coin-icon.svg',
      repeatCount: 1,
      username: 'GalacticWhale',
      displayName: 'Galactic Whale 🌌',
      profilePictureUrl: ''
    });
  });

  $('#btnTestUniverse')?.addEventListener('click', () => {
    enqueueGift({
      value: 44999,
      giftName: 'TikTok Universe',
      giftPictureUrl: '/assets/coin-icon.svg',
      repeatCount: 1,
      username: 'SuperVIP',
      displayName: 'Super VIP 👑',
      profilePictureUrl: ''
    });
  });

  const btnToggleDemo = $('#btnTestToggleDemo');
  btnToggleDemo?.addEventListener('click', () => {
    demoPaused = !demoPaused;
    btnToggleDemo.textContent = demoPaused ? 'Reanudar demo' : 'Pausar demo';
  });

  $('#btnTestReset')?.addEventListener('click', () => {
    resetJar();
  });

  // Simulación periódica continua de regalos para calibrar OBS
  const sampleGifts = [
    { value: 1, giftName: 'Rosa', repeatCount: 1, username: 'RosaFan' },
    { value: 1, giftName: 'Rosa', repeatCount: 5, username: 'ComboFan' },
    { value: 5, giftName: 'Dedo Corazón', repeatCount: 1, username: 'Corazonero' },
    { value: 99, giftName: 'Gorra Tiktato', repeatCount: 1, username: 'ModGamer' },
    { value: 500, giftName: 'Máquina de dinero', repeatCount: 1, username: 'DonanteTop' },
    { value: 1000, giftName: 'Galaxia', repeatCount: 1, username: 'ElenaLive' }
  ];

  demoInterval = setInterval(() => {
    if (demoPaused || document.hidden) return;
    const randomItem = sampleGifts[Math.floor(Math.random() * sampleGifts.length)];
    enqueueGift({
      ...randomItem,
      giftPictureUrl: '/assets/coin-icon.svg',
      displayName: randomItem.username,
      profilePictureUrl: ''
    });
  }, 3200);
}

/* ───────── BOOTSTRAP ───────── */
(async () => {
  initPhysics();
  await loadState();
  connect();
  renderCurrentLeaderboardItem();
  startLeaderboardCarousel();

  // Tick de la cola de regalos (200ms - Sección 8.1)
  queueInterval = setInterval(processQueueTick, 200);

  setupStudioMode();
  setupTestMode();
})();
