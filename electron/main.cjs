const { app, BrowserWindow, clipboard, dialog, ipcMain, powerSaveBlocker, safeStorage, session, shell } = require('electron');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  deleteSoundFile,
  flushConfigSave,
  importSound,
  loadConfig,
  normalizeJar,
  normalizeRule,
  normalizeTts,
  publicConfig,
  publicJar,
  saveConfig,
  scheduleSaveConfig,
  shouldPassJarFilter,
  updateTopDonorsList
} = require('./config.cjs');
const { buildAlert, markPlayed, selectRule } = require('./alert-matcher.cjs');
const { makeTestEvent } = require('./events.cjs');
const { getActiveCatalog, loadGiftsCatalog, refreshGiftsCatalog } = require('./gifts-catalog.cjs');
const { OverlayServer } = require('./overlay-server.cjs');
const { TikTokService } = require('./tiktok-service.cjs');

const isDev = process.argv.includes('--dev');
const MAX_ACTIVITY = 40;
const MAX_UNIQUE_USERS = 10_000;
const STATE_COALESCE_MS = 80;

if (process.env.TIKTATO_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.TIKTATO_USER_DATA));
}

let mainWindow = null;
let loginWindow = null;
let jarStudioWindow = null;
let config = null;
let overlayServer = null;
let tiktok = null;
let logFile = '';
let quitting = false;
const TIKTOK_LOGIN_PARTITION = 'persist:tiktok-login';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const cooldowns = new Map();
const recentActivity = [];
const stats = {
  gifts: 0,
  coins: 0,
  follows: 0,
  shares: 0,
  likes: 0,
  uniqueUsers: new Set()
};

const logger = {
  info(message, ...args) {
    console.log(message, ...args);
    writeLog('INFO', message, args);
  },
  warn(message, ...args) {
    console.warn(message, ...args);
    writeLog('WARN', message, args);
  },
  error(message, ...args) {
    console.error(message, ...args);
    writeLog('ERROR', message, args);
  }
};

function writeLog(level, message, args) {
  if (!logFile) return;
  const extra = args.length > 0 ? ` ${args.map((item) => safeString(item)).join(' ')}` : '';
  const line = `${new Date().toISOString()} [${level}] ${safeString(message)}${extra}\n`;
  try {
    fs.appendFileSync(logFile, line, 'utf8');
  } catch {
    // El log no debe interrumpir la app.
  }
}

function safeString(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function initLogger() {
  const logDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  logFile = path.join(logDir, 'tiktato.log');
  const old = path.join(logDir, 'tiktato.old.log');
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 2 * 1024 * 1024) {
      fs.renameSync(logFile, old);
    }
  } catch {
    // Ignorado.
  }
}

let powerSaveBlockerId = null;

function acquireStreamResources() {
  try {
    if (powerSaveBlockerId === null || !powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
      logger.info(`[sistema] powerSaveBlocker activado (id: ${powerSaveBlockerId})`);
    }
  } catch (error) {
    logger.warn('[sistema] no se pudo activar powerSaveBlocker', error);
  }
  try {
    if (os.constants?.priority?.PRIORITY_ABOVE_NORMAL !== undefined) {
      os.setPriority(os.constants.priority.PRIORITY_ABOVE_NORMAL);
      logger.info('[sistema] prioridad de proceso establecida en ABOVE_NORMAL');
    }
  } catch (error) {
    logger.warn('[sistema] no se pudo elevar la prioridad del proceso', error);
  }
}

function releaseStreamResources() {
  try {
    if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlocker.stop(powerSaveBlockerId);
      logger.info(`[sistema] powerSaveBlocker liberado (id: ${powerSaveBlockerId})`);
      powerSaveBlockerId = null;
    }
  } catch (error) {
    logger.warn('[sistema] no se pudo detener powerSaveBlocker', error);
  }
  try {
    if (os.constants?.priority?.PRIORITY_NORMAL !== undefined) {
      os.setPriority(os.constants.priority.PRIORITY_NORMAL);
      logger.info('[sistema] prioridad de proceso restaurada a NORMAL');
    }
  } catch (error) {
    logger.warn('[sistema] no se pudo restaurar la prioridad del proceso', error);
  }
}

function encryptSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return `enc:${safeStorage.encryptString(text).toString('base64')}`;
    }
  } catch (error) {
    logger.warn('[seguridad] no se pudo cifrar el secreto', error);
  }
  return `plain:${Buffer.from(text, 'utf8').toString('base64')}`;
}

function decryptSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  try {
    if (text.startsWith('enc:')) {
      return safeStorage.decryptString(Buffer.from(text.slice(4), 'base64'));
    }
    if (text.startsWith('plain:')) {
      return Buffer.from(text.slice(6), 'base64').toString('utf8');
    }
  } catch (error) {
    logger.warn('[seguridad] no se pudo descifrar el secreto', error);
  }
  return '';
}

function credentials() {
  return {
    sessionId: decryptSecret(config.sessionIdEncrypted),
    ttTargetIdc: decryptSecret(config.ttTargetIdcEncrypted)
  };
}

function soundUrl(sound) {
  if (!overlayServer || !sound) return '';
  return `http://127.0.0.1:${overlayServer.port}/sounds/${encodeURIComponent(sound.filename)}?token=${overlayServer.token}`;
}

function overlayUrl() {
  return overlayServer ? overlayServer.getUrl() : '';
}

function jarUrl() {
  return overlayServer ? overlayServer.getJarUrl() : '';
}

function jarTestUrl() {
  return overlayServer ? overlayServer.getJarTestUrl() : '';
}

function updateJarOverlay() {
  overlayServer?.setJar(publicJar(config));
}

let stateUpdateTimer = null;

function publicState({ includeGifts = true } = {}) {
  const base = publicConfig(config, { overlayUrl: overlayUrl() });
  const payload = {
    ...base,
    appVersion: app.getVersion(),
    overlay: {
      ...base.overlay,
      port: overlayServer?.port || base.overlay.port
    },
    jarUrl: jarUrl(),
    jarTestUrl: jarTestUrl(),
    sounds: config.sounds.map((sound) => ({ ...sound, url: soundUrl(sound) })),
    status: tiktok ? tiktok.getStatus() : { state: 'disconnected', message: 'Sin conexión' },
    stats: {
      gifts: stats.gifts,
      coins: stats.coins,
      follows: stats.follows,
      shares: stats.shares,
      likes: stats.likes,
      uniqueUsers: stats.uniqueUsers.size
    },
    activity: recentActivity
  };
  if (includeGifts) {
    payload.gifts = getActiveCatalog();
  }
  return payload;
}

function sendState({ includeGifts = true } = {}) {
  if (stateUpdateTimer) {
    clearTimeout(stateUpdateTimer);
    stateUpdateTimer = null;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state:update', publicState({ includeGifts }));
  }
}

function scheduleStateUpdate() {
  if (stateUpdateTimer) return;
  stateUpdateTimer = setTimeout(() => {
    stateUpdateTimer = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('state:update', publicState({ includeGifts: false }));
    }
  }, STATE_COALESCE_MS);
  stateUpdateTimer.unref?.();
}

function sendAlert(alert) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('alert', alert);
  }
  overlayServer?.broadcast({ type: 'alert', alert });
}

function updateOverlayConfig() {
  overlayServer?.setConfig({
    title: config.overlay.title,
    accent: config.overlay.accent,
    position: config.overlay.position,
    showGiftImage: config.overlay.showGiftImage,
    durationMs: config.overlay.durationMs
  });
  overlayServer?.setJar(publicJar(config));
}

function resolveSound(soundId) {
  if (String(soundId || '').startsWith('builtin:')) {
    const key = String(soundId).replace('builtin:', '');
    const names = {
      coin: 'Moneda',
      chime: 'Campanilla',
      pop: 'Pop',
      sparkle: 'Destello',
      horn: 'Fanfarria',
      drum: 'Redoble'
    };
    return {
      id: soundId,
      name: names[key] || key,
      kind: 'builtin',
      key
    };
  }
  const sound = config.sounds.find((item) => item.id === soundId);
  if (!sound) {
    return { id: 'builtin:coin', name: 'Moneda', kind: 'builtin', key: 'coin' };
  }
  return {
    id: sound.id,
    name: sound.name,
    kind: 'file',
    url: soundUrl(sound)
  };
}

function registerActivity(event, alert) {
  const userKey = event.userId || event.username || 'anon';
  if (!stats.uniqueUsers.has(userKey)) {
    if (stats.uniqueUsers.size >= MAX_UNIQUE_USERS) {
      const oldestUser = stats.uniqueUsers.values().next().value;
      if (oldestUser !== undefined) stats.uniqueUsers.delete(oldestUser);
    }
    stats.uniqueUsers.add(userKey);
  }
  if (event.type === 'gift') {
    if (event.repeatEnd !== false) {
      stats.gifts += 1;
      stats.coins += Number(event.coins || 0);
    }
  } else if (event.type === 'follow') {
    stats.follows += 1;
  } else if (event.type === 'share') {
    stats.shares += 1;
  } else if (event.type === 'like') {
    stats.likes += Number(event.repeatCount || 1);
  }

  const currentStreak = recentActivity[0];
  const isOngoingStreak =
    currentStreak &&
    currentStreak.type === 'gift' &&
    currentStreak.username === (event.username || 'alguien') &&
    currentStreak.giftName === (event.giftName || '') &&
    currentStreak.repeatEnd === false;

  if (isOngoingStreak) {
    currentStreak.repeatCount = Number(event.repeatCount || 1);
    currentStreak.coins = Number(event.coins || 0);
    currentStreak.repeatEnd = event.repeatEnd !== false;
    currentStreak.createdAt = new Date().toISOString();
    if (alert) {
      currentStreak.played = true;
      currentStreak.soundName = alert?.sound?.name || currentStreak.soundName;
    }
    return currentStreak;
  }

  const record = {
    id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    msgId: String(event.msgId || ''),
    userId: String(event.userId || ''),
    type: event.type,
    username: event.username || 'alguien',
    displayName: event.displayName || event.username || 'Alguien',
    avatarUrl: event.avatarUrl || '',
    giftName: event.giftName || '',
    giftImageUrl: event.giftImageUrl || '',
    coins: Number(event.coins || 0),
    repeatCount: Number(event.repeatCount || 1),
    comment: event.comment || event.message || '',
    createdAt: new Date().toISOString(),
    played: Boolean(alert),
    soundName: alert?.sound?.name || '',
    test: Boolean(event.test),
    repeatEnd: event.repeatEnd !== false
  };
  recentActivity.unshift(record);
  if (recentActivity.length > MAX_ACTIVITY) recentActivity.length = MAX_ACTIVITY;
  return record;
}

function addToJar(event) {
  if (event.type !== 'gift') return;
  if (event.repeatEnd === false) return;
  if (!shouldPassJarFilter(config.jar, event)) return;

  const coinsAdded = Math.max(0, Number(event.coins) || 0);
  config.jar.currentGifts += 1;
  config.jar.currentCoins += coinsAdded;

  config.jar.topDonors = updateTopDonorsList(config.jar.topDonors, {
    username: event.username,
    displayName: event.displayName,
    avatarUrl: event.avatarUrl,
    coins: coinsAdded
  });

  if (config.jar.showRecentGifts) {
    config.jar.recentGifts.unshift({
      name: event.giftName || 'Regalo',
      imageUrl: event.giftImageUrl || '',
      coins: coinsAdded,
      username: event.username || '',
      at: new Date().toISOString()
    });
    config.jar.recentGifts = config.jar.recentGifts.slice(0, 8);
  }
  config = scheduleSaveConfig(app.getPath('userData'), config);
  updateJarOverlay();

  const value =
    event.coinsPerGift ||
    (event.repeatCount ? Math.round(coinsAdded / event.repeatCount) : coinsAdded) ||
    1;
  const jarPayload = {
    value,
    giftPictureUrl: event.giftImageUrl || '',
    giftName: event.giftName || 'Regalo',
    repeatCount: Math.max(1, Number(event.repeatCount) || 1),
    username: event.username || 'alguien',
    displayName: event.displayName || event.username || 'Alguien',
    profilePictureUrl: event.avatarUrl || '',
    coins: coinsAdded,
    test: Boolean(event.test)
  };

  overlayServer?.broadcast({ type: 'coin-jar:gift', ...jarPayload });
}

function processEvent(event) {
  if (!event) return null;

  if (event.type === 'imDelete') {
    const msgSet = new Set((event.deleteMsgIds || []).map(String));
    const userSet = new Set((event.deleteUserIds || []).map(String));
    if (msgSet.size > 0 || userSet.size > 0) {
      for (let i = recentActivity.length - 1; i >= 0; i -= 1) {
        const item = recentActivity[i];
        if (
          item.type === 'chat' &&
          ((item.msgId && msgSet.has(String(item.msgId))) ||
            (item.userId && userSet.has(String(item.userId))))
        ) {
          recentActivity.splice(i, 1);
        }
      }
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('event:incoming', event);
    }
    sendState();
    return null;
  }

  const now = Date.now();
  const rule = selectRule(config.rules, event, cooldowns, now);
  const suppressAlert = Boolean(
    event.suppressAlert || (event.type === 'gift' && event.streakDelta === 0)
  );
  let alert = null;
  if (rule) {
    markPlayed(rule, event, cooldowns, now);
    if (!suppressAlert) {
      const sound = resolveSound(rule.soundId);
      alert = buildAlert(event, rule, {
        sound,
        now,
        playEveryStreak: config.tts?.playEveryStreak !== false
      });
      if (alert) {
        sendAlert(alert);
      }
    }
  }
  registerActivity(event, alert);
  addToJar(event);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('event:incoming', event);
  }
  if (event.test) {
    sendState();
  } else {
    scheduleStateUpdate();
  }
  return alert;
}

async function startOverlayServer() {
  if (overlayServer) {
    await overlayServer.stop();
    overlayServer = null;
  }
  overlayServer = new OverlayServer({
    overlayDir: path.join(__dirname, '..', 'overlay'),
    sharedDir: path.join(__dirname, '..', 'shared'),
    soundsDir: path.join(app.getPath('userData'), 'sounds'),
    token: config.overlay.token,
    port: config.overlay.port,
    logger
  });
  await overlayServer.start();
  updateOverlayConfig();
  logger.info(`[overlay] ${overlayServer.getUrl()}`);
}

function applySettings(patch) {
  if (!patch || typeof patch !== 'object') return;

  if (typeof patch.username === 'string') {
    config.username = patch.username.replace(/^@/, '').trim().slice(0, 80);
  }
  if (typeof patch.autoConnect === 'boolean') config.autoConnect = patch.autoConnect;
  if (patch.masterVolume !== undefined) {
    config.masterVolume = Math.max(0, Math.min(1, Number(patch.masterVolume) || 0));
  }
  if (typeof patch.playInDashboard === 'boolean') config.playInDashboard = patch.playInDashboard;

  if (patch.overlay && typeof patch.overlay === 'object') {
    const overlay = patch.overlay;
    if (typeof overlay.title === 'string') config.overlay.title = overlay.title.trim().slice(0, 30) || 'TIKTATO';
    if (typeof overlay.accent === 'string' && /^#[0-9a-f]{6}$/i.test(overlay.accent)) {
      config.overlay.accent = overlay.accent;
    }
    if (overlay.position === 'top' || overlay.position === 'bottom') {
      config.overlay.position = overlay.position;
    }
    if (typeof overlay.showGiftImage === 'boolean') config.overlay.showGiftImage = overlay.showGiftImage;
    if (overlay.durationMs !== undefined) {
      config.overlay.durationMs = Math.max(1500, Math.min(20_000, Number(overlay.durationMs) || 5000));
    }
    if (overlay.port !== undefined) {
      config.overlay.port = Math.max(1024, Math.min(65535, Number(overlay.port) || 3477));
    }
  }

  if (patch.jar && typeof patch.jar === 'object') {
    config.jar = normalizeJar({
      ...config.jar,
      ...patch.jar
    });
    updateJarOverlay();
  }

  if (patch.tts && typeof patch.tts === 'object') {
    config.tts = normalizeTts({
      ...config.tts,
      ...patch.tts
    });
    tiktok?.setOptions({ playEveryStreak: config.tts.playEveryStreak !== false });
  }

  if (typeof patch.sessionId === 'string' && patch.sessionId.trim()) {
    config.sessionIdEncrypted = encryptSecret(patch.sessionId.trim());
  }
  if (typeof patch.ttTargetIdc === 'string' && patch.ttTargetIdc.trim()) {
    config.ttTargetIdcEncrypted = encryptSecret(patch.ttTargetIdc.trim());
  }
  if (patch.clearSession === true) {
    config.sessionIdEncrypted = '';
    config.ttTargetIdcEncrypted = '';
  }

  config = saveConfig(app.getPath('userData'), config);
}

async function restartOverlayIfPortChanged(previousPort) {
  if (previousPort !== config.overlay.port) {
    try {
      await startOverlayServer();
    } catch (error) {
      logger.error('[overlay] no se pudo reiniciar en el nuevo puerto', error);
    }
  } else {
    updateOverlayConfig();
  }
}

async function loginTikTok() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return { ok: false, error: 'Ya hay una ventana de inicio de sesión abierta.' };
  }

  const loginSession = session.fromPartition(TIKTOK_LOGIN_PARTITION);
  loginSession.setUserAgent(BROWSER_UA);
  if (loginSession.webRequest?.onBeforeRequest) {
    loginSession.webRequest.onBeforeRequest((details, callback) => {
      const reqUrl = String(details?.url || '');
      if (/^(bytedance|tiktok|snssdk\d*):\/\//i.test(reqUrl)) {
        callback({ cancel: true });
        return;
      }
      callback({ cancel: false });
    });
  }
  const win = new BrowserWindow({
    width: 480,
    height: 760,
    minWidth: 380,
    minHeight: 560,
    parent: mainWindow || undefined,
    modal: false,
    show: false,
    autoHideMenuBar: true,
    title: 'Iniciar sesión en TikTok',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      partition: TIKTOK_LOGIN_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  loginWindow = win;
  win.webContents.setUserAgent(BROWSER_UA);
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/([a-z0-9-]+\.)?tiktok\.com\//i.test(url)) {
      win.loadURL(url);
    } else if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  const allowOnlyHttp = (event, url) => {
    if (!/^https?:\/\//i.test(url)) event.preventDefault();
  };
  win.webContents.on('will-navigate', allowOnlyHttp);
  win.webContents.on('will-redirect', allowOnlyHttp);
  win.webContents.on('will-frame-navigate', (details) => {
    if (details?.url && !/^https?:\/\//i.test(details.url)) {
      details.preventDefault?.();
    }
  });
  win.loadURL('https://www.tiktok.com/login?lang=es');

  return new Promise((resolve) => {
    let finished = false;
    let timer = null;
    let timeout = null;

    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      clearTimeout(timeout);
      loginWindow = null;
      if (!win.isDestroyed()) win.close();
      resolve(result);
    };

    let checking = false;
    const checkCookies = async () => {
      if (checking || finished) return;
      checking = true;
      try {
        const cookies = await loginSession.cookies.get({ url: 'https://www.tiktok.com' });
        const sessionId = cookies.find((cookie) => cookie.name === 'sessionid')?.value || '';
        const ttTargetIdc = cookies.find((cookie) => cookie.name === 'tt-target-idc')?.value || '';
        if (sessionId) {
          applySettings({ sessionId, ttTargetIdc });
          sendState();
          logger.info('[tiktok] sesión capturada con login QR');
          finish({ ok: true, hasSession: true });
          setTimeout(async () => {
            if (!config.username || tiktok.getStatus().state === 'connected') return;
            try {
              await tiktok.connect({ username: config.username, ...credentials() });
            } catch (error) {
              logger.warn('[tiktok] auto-conexión tras login QR falló', error);
            }
            sendState();
          }, 700);
        }
      } catch (error) {
        logger.warn('[tiktok] no se pudieron leer las cookies del login', error);
      } finally {
        checking = false;
      }
    };

    timer = setInterval(checkCookies, 1000);
    checkCookies();
    timeout = setTimeout(
      () => finish({ ok: false, error: 'Tiempo de espera agotado. Cierra la ventana e inténtalo de nuevo.' }),
      5 * 60 * 1000
    );
    win.on('closed', () => {
      if (!finished) {
        finished = true;
        clearInterval(timer);
        clearTimeout(timeout);
        loginWindow = null;
        resolve({ canceled: true });
      }
    });
  });
}

async function logoutTikTok() {
  const loginSession = session.fromPartition(TIKTOK_LOGIN_PARTITION);
  await loginSession.clearStorageData({ storages: ['cookies'] });
  return { ok: true };
}

let whenReadyTimestamp = 0;

function createWindow() {
  const smokeScreenshot = (process.env.TIKTATO_SMOKE_SCREENSHOT || '').trim();
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#fff8f5',
    show: false,
    autoHideMenuBar: true,
    title: 'Tiktato',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      v8CacheOptions: 'code'
    }
  });

  if (smokeScreenshot) {
    if (process.env.TIKTATO_SMOKE_HEIGHT) {
      mainWindow.setContentSize(1320, parseInt(process.env.TIKTATO_SMOKE_HEIGHT, 10));
    } else if (process.env.TIKTATO_SMOKE_TALL === '1') {
      mainWindow.setContentSize(1320, 1160);
    }
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript(`
        (() => {
          const t = document.getElementById('toast');
          if (t) t.remove();
          return true;
        })()
      `);
      if (process.env.TIKTATO_SMOKE_TAB) {
        const targetTab = process.env.TIKTATO_SMOKE_TAB.trim();
        mainWindow.webContents.executeJavaScript(`
          document.getElementById('tab-' + ${JSON.stringify(targetTab)})?.click();
        `);
      }
      if (process.env.TIKTATO_SMOKE_TEST_EVENT === '1') {
        setTimeout(async () => {
          await mainWindow.webContents.executeJavaScript(`
            document.querySelector('[data-test="gift"]')?.click();
            setTimeout(() => document.querySelector('[data-test="follow"]')?.click(), 180);
            setTimeout(() => document.querySelector('[data-test="like"]')?.click(), 360);
            setTimeout(() => document.querySelector('[data-test="chat"]')?.click(), 540);
          `);
        }, 600);
      }
      setTimeout(async () => {
        try {
          if (process.env.TIKTATO_SMOKE_TALL === '1') {
            const docHeight = await mainWindow.webContents.executeJavaScript(`
              (() => {
                const app = document.querySelector('.app');
                return app ? Math.ceil(app.getBoundingClientRect().height + 36) : 1120;
              })()
            `);
            if (docHeight && docHeight > 600) {
              mainWindow.setContentSize(1320, docHeight);
              await new Promise((resolve) => setTimeout(resolve, 300));
            }
          } else if (process.env.TIKTATO_SMOKE_SCROLL === 'bottom') {
            await mainWindow.webContents.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)');
            await new Promise((resolve) => setTimeout(resolve, 350));
          }
          await mainWindow.webContents.executeJavaScript(`
            (() => {
              const badge = document.getElementById('liveBadge');
              if (badge) {
                badge.className = 'badge-live is-live';
                badge.textContent = 'LIVE';
              }
              const pill = document.getElementById('statusPill');
              if (pill) pill.className = 'status-pill status-connected';
              const label = document.getElementById('statusLabel');
              if (label) label.textContent = 'Conectado';
              const msg = document.getElementById('connectionMessage');
              if (msg) msg.textContent = '';
              const user = document.getElementById('username');
              if (user) {
                user.value = '';
                user.placeholder = '@usuario';
              }
              const conn = document.getElementById('btnConnect');
              if (conn) conn.disabled = true;
              const disc = document.getElementById('btnDisconnect');
              if (disc) disc.disabled = false;
              
              const v = document.getElementById('statViewers'); if (v) v.textContent = '1.420';
              const g = document.getElementById('statGifts'); if (g) g.textContent = '86';
              const c = document.getElementById('statCoins'); if (c) c.textContent = '3.540';
              const f = document.getElementById('statFollows'); if (f) f.textContent = '38';
              
              const ver = document.getElementById('appVersion');
              if (ver) ver.textContent = 'v1.0.0';
              
              const t = document.getElementById('toast');
              if (t) {
                t.style.display = 'none';
                t.className = 'toast';
              }
            })()
          `);
          await mainWindow.webContents.executeJavaScript(`
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          `);
          await new Promise((resolve) => setTimeout(resolve, 400));
          const image = await mainWindow.webContents.capturePage();
          const dest = path.resolve(smokeScreenshot);
          fs.writeFileSync(dest, image.toPNG());
          logger.info(`[smoke] captura guardada en ${dest}`);
        } catch (error) {
          logger.error('[smoke] no se pudo capturar la ventana', error);
        } finally {
          app.quit();
        }
      }, 3200);
    });
    mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
      logger.error(`[smoke] falló la carga (${code}): ${description}`);
    });
  }

  mainWindow.webContents.on('console-message', (event) => {
    const level = event?.level ?? 0;
    const message = event?.message ?? '';
    const line = event?.line ?? 0;
    const sourceId = event?.sourceId ?? '';
    logger.info(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    logger.error(`[renderer] falló la carga (${code}): ${description}`);
  });

  const showWindow = () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  };

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (whenReadyTimestamp > 0) {
      const startupMs = Date.now() - whenReadyTimestamp;
      logger.info(`[startup] app.whenReady -> ready-to-show: ${startupMs} ms`);
      if (process.env.TIKTATO_BENCHMARK) {
        const mainRss = Math.round(process.memoryUsage().rss / 1024 / 1024);
        const rendererPid = mainWindow.webContents.getOSProcessId ? mainWindow.webContents.getOSProcessId() : 0;
        console.log(`BENCHMARK_RESULT:startup=${startupMs},mainRss=${mainRss},rendererPid=${rendererPid}`);
        setTimeout(() => {
          app.quit();
        }, process.env.TIKTATO_BENCHMARK_WAIT ? parseInt(process.env.TIKTATO_BENCHMARK_WAIT, 10) : 500);
      }
    }
    showWindow();
  });
  mainWindow.webContents.once('did-finish-load', () => {
    showWindow();
  });
  setTimeout(() => {
    showWindow();
  }, 400);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  const blockMainNavigation = (navEvent, targetUrl) => {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol === 'file:' && parsed.pathname.toLowerCase().endsWith('/renderer/index.html')) {
        return;
      }
    } catch {
      // URL inválida: bloquear
    }
    navEvent.preventDefault();
  };
  mainWindow.webContents.on('will-navigate', blockMainNavigation);
  mainWindow.webContents.on('will-redirect', blockMainNavigation);
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle('app:bootstrap', () => publicState());

  ipcMain.handle('settings:update', async (_event, patch) => {
    const previousPort = config.overlay.port;
    applySettings(patch);
    await restartOverlayIfPortChanged(previousPort);
    sendState();
    return publicState();
  });

  ipcMain.handle('rules:save', (_event, rules) => {
    const normalized = (Array.isArray(rules) ? rules : []).map(normalizeRule).filter(Boolean);
    config.rules = normalized;
    config = saveConfig(app.getPath('userData'), config);
    sendState();
    return publicState();
  });

  ipcMain.handle('sound:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Añadir sonido',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm'] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const imported = [];
    try {
      for (const filePath of result.filePaths) {
        const sound = importSound(app.getPath('userData'), filePath);
        config.sounds.push(sound);
        imported.push({ ...sound, url: soundUrl(sound) });
      }
      config = saveConfig(app.getPath('userData'), config);
      sendState();
      return { canceled: false, sound: imported[0], sounds: imported };
    } catch (error) {
      if (imported.length > 0) {
        config = saveConfig(app.getPath('userData'), config);
        sendState();
      }
      return { canceled: false, error: error.message, sounds: imported };
    }
  });

  ipcMain.handle('gifts:refresh', async () => {
    await refreshGiftsCatalog(app.getPath('userData'));
    sendState();
    return publicState();
  });

  ipcMain.handle('sound:delete', (_event, soundId) => {
    const sound = config.sounds.find((item) => item.id === soundId);
    if (!sound) return { ok: false, error: 'El sonido no existe.' };
    try {
      deleteSoundFile(app.getPath('userData'), sound);
    } catch (error) {
      logger.warn('[sound] no se pudo borrar el archivo', error);
    }
    config.sounds = config.sounds.filter((item) => item.id !== soundId);
    config.rules = config.rules.map((rule) =>
      rule.soundId === soundId ? { ...rule, soundId: 'builtin:coin' } : rule
    );
    config = saveConfig(app.getPath('userData'), config);
    sendState();
    return { ok: true };
  });

  ipcMain.handle('tiktok:connect', async (_event, payload = {}) => {
    const previousPort = config.overlay.port;
    applySettings({
      username: payload.username,
      sessionId: payload.sessionId,
      ttTargetIdc: payload.ttTargetIdc
    });
    await restartOverlayIfPortChanged(previousPort);
    sendState();
    try {
      const status = await tiktok.connect({
        username: config.username,
        roomId: payload.roomId,
        ...credentials()
      });
      sendState();
      return { ok: true, status };
    } catch (error) {
      sendState();
      return { ok: false, error: error.message, status: tiktok.getStatus() };
    }
  });

  ipcMain.handle('tiktok:disconnect', async () => {
    await tiktok.disconnect();
    sendState();
    return publicState();
  });

  ipcMain.handle('tiktok:login', () => loginTikTok());
  ipcMain.handle('tiktok:logout', () => logoutTikTok());

  ipcMain.handle('event:test', (_event, input) => {
    const alert = processEvent(makeTestEvent(input));
    return { ok: true, alert, state: publicState() };
  });

  ipcMain.handle('overlay:copy', () => {
    clipboard.writeText(overlayUrl());
    return { ok: true, url: overlayUrl() };
  });

  ipcMain.handle('overlay:open', async () => {
    if (overlayUrl()) await shell.openExternal(`${overlayUrl()}&preview=1`);
    return { ok: true };
  });

  ipcMain.handle('jar:copy', () => {
    clipboard.writeText(jarUrl());
    return { ok: true, url: jarUrl() };
  });

  ipcMain.handle('jar:open', async () => {
    if (jarUrl()) await shell.openExternal(`${jarUrl()}&preview=1`);
    return { ok: true };
  });

  ipcMain.handle('jar:open-studio', (_event, opts = {}) => {
    const bg = String(opts?.bg || 'green');
    const url = jarUrl();
    if (!url) {
      return { ok: false, error: 'El servidor del frasco no está activo. Reinicia Tiktato.' };
    }
    if (jarStudioWindow && !jarStudioWindow.isDestroyed()) {
      jarStudioWindow.focus();
      return { ok: true };
    }
    jarStudioWindow = new BrowserWindow({
      width: 560,
      height: 720,
      minWidth: 420,
      minHeight: 540,
      autoHideMenuBar: true,
      backgroundColor: bg === 'green' ? '#00ff00' : '#141218',
      title: 'Tiktato - Frasco',
      icon: path.join(__dirname, '..', 'build', 'icon.png'),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        v8CacheOptions: 'code'
      }
    });
    const isAllowedStudioUrl = (targetUrl) => {
      try {
        const parsed = new URL(targetUrl);
        const activePort = String(overlayServer?.port || config.overlay.port || 3477);
        return (
          parsed.protocol === 'http:' &&
          (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
          parsed.port === activePort
        );
      } catch {
        return false;
      }
    };
    const guardStudioNavigation = (navEvent, targetUrl) => {
      if (!isAllowedStudioUrl(targetUrl)) {
        navEvent.preventDefault();
      }
    };
    jarStudioWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    jarStudioWindow.webContents.on('will-navigate', guardStudioNavigation);
    jarStudioWindow.webContents.on('will-redirect', guardStudioNavigation);
    jarStudioWindow.loadURL(`${url}&studio=1&bg=${encodeURIComponent(bg)}`);
    jarStudioWindow.on('closed', () => {
      jarStudioWindow = null;
    });
    return { ok: true };
  });

  ipcMain.handle('jar:copy-test', () => {
    clipboard.writeText(jarTestUrl());
    return { ok: true, url: jarTestUrl() };
  });

  ipcMain.handle('jar:open-test', async () => {
    if (jarTestUrl()) await shell.openExternal(jarTestUrl());
    return { ok: true };
  });

  ipcMain.handle('jar:test-gift', (_event, sample) => {
    const testEvt = makeTestEvent(sample || { giftName: 'Rosa', coins: 1, repeatCount: 1 });
    addToJar(testEvt);
    sendState();
    return { ok: true, state: publicState() };
  });

  ipcMain.handle('jar:reset', () => {
    config.jar.currentCoins = 0;
    config.jar.currentGifts = 0;
    config.jar.recentGifts = [];
    config.jar.topDonors = [];
    config = saveConfig(app.getPath('userData'), config);
    updateJarOverlay();
    overlayServer?.broadcast({ type: 'coin-jar:reset' });
    sendState();
    return publicState();
  });

  ipcMain.handle('app:open-data-folder', async () => {
    await shell.openPath(app.getPath('userData'));
    return { ok: true };
  });
}

function wireTikTok() {
  tiktok = new TikTokService({ logger });
  tiktok.setOptions({ playEveryStreak: config.tts?.playEveryStreak !== false });
  tiktok.on('event', (event) => processEvent(event));
  tiktok.on('status', (status) => {
    if (status.state === 'connected') {
      acquireStreamResources();
    } else if (status.state === 'disconnected' || status.state === 'error') {
      releaseStreamResources();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status:update', status);
    }
    overlayServer?.broadcast({ type: 'status', status });
  });
}

async function bootstrap() {
  initLogger();
  logger.info(`Tiktato ${app.getVersion()} iniciando en ${app.getPath('userData')}`);
  config = loadConfig(app.getPath('userData'));
  loadGiftsCatalog(app.getPath('userData'));
  refreshGiftsCatalog(app.getPath('userData'))
    .then(() => sendState())
    .catch(() => {});
  await startOverlayServer();
  wireTikTok();
  registerIpc();
  createWindow();

  if (config.autoConnect && config.username) {
    setTimeout(async () => {
      try {
        await tiktok.connect({ username: config.username, ...credentials() });
        sendState();
      } catch (error) {
        logger.warn('[tiktok] auto-conexión falló', error);
      }
    }, 1500);
  }
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    whenReadyTimestamp = Date.now();
    return bootstrap();
  }).catch((error) => {
    logger.error('[app] error fatal al iniciar', error);
    dialog.showErrorBox('Tiktato no pudo iniciar', String(error?.stack || error));
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('before-quit', () => {
    if (quitting) return;
    quitting = true;
    try {
      flushConfigSave(app.getPath('userData'));
    } catch (error) {
      logger.warn('[config] no se pudo volcar config al salir', error);
    }
    releaseStreamResources();
    tiktok?.disconnect().catch(() => {});
    overlayServer?.stop().catch(() => {});
  });

  app.on('window-all-closed', () => app.quit());
}
