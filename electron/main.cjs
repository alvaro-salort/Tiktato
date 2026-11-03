const { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const {
  deleteSoundFile,
  importSound,
  loadConfig,
  normalizeRule,
  publicConfig,
  saveConfig
} = require('./config.cjs');
const { buildAlert, markPlayed, selectRule } = require('./alert-matcher.cjs');
const { makeTestEvent } = require('./events.cjs');
const { OverlayServer } = require('./overlay-server.cjs');
const { TikTokService } = require('./tiktok-service.cjs');

const isDev = process.argv.includes('--dev');
const MAX_ACTIVITY = 40;

let mainWindow = null;
let config = null;
let overlayServer = null;
let tiktok = null;
let logFile = '';
let quitting = false;

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
    ttTargetIdc: decryptSecret(config.ttTargetIdcEncrypted),
    signApiKey: decryptSecret(config.signApiKeyEncrypted)
  };
}

function soundUrl(sound) {
  if (!overlayServer || !sound) return '';
  return `http://127.0.0.1:${overlayServer.port}/sounds/${encodeURIComponent(sound.filename)}?token=${overlayServer.token}`;
}

function overlayUrl() {
  return overlayServer ? overlayServer.getUrl() : '';
}

function overlaySettings() {
  return {
    ...config.overlay,
    port: overlayServer?.port || config.overlay.port
  };
}

function publicState() {
  const base = publicConfig(config, { overlayUrl: overlayUrl() });
  return {
    ...base,
    overlay: {
      ...base.overlay,
      port: overlayServer?.port || base.overlay.port
    },
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
}

function sendState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state:update', publicState());
  }
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
}

function resolveSound(soundId) {
  if (String(soundId || '').startsWith('builtin:')) {
    const key = String(soundId).replace('builtin:', '');
    return {
      id: soundId,
      name: key,
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
  stats.uniqueUsers.add(event.userId || event.username || 'anon');
  if (event.type === 'gift') {
    stats.gifts += 1;
    stats.coins += Number(event.coins || 0);
  } else if (event.type === 'follow') {
    stats.follows += 1;
  } else if (event.type === 'share') {
    stats.shares += 1;
  } else if (event.type === 'like') {
    stats.likes += Number(event.repeatCount || 1);
  }

  const record = {
    id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: event.type,
    username: event.username || 'alguien',
    displayName: event.displayName || event.username || 'Alguien',
    avatarUrl: event.avatarUrl || '',
    giftName: event.giftName || '',
    giftImageUrl: event.giftImageUrl || '',
    coins: Number(event.coins || 0),
    repeatCount: Number(event.repeatCount || 1),
    createdAt: new Date().toISOString(),
    played: Boolean(alert),
    soundName: alert?.sound?.name || '',
    test: Boolean(event.test)
  };
  recentActivity.unshift(record);
  if (recentActivity.length > MAX_ACTIVITY) recentActivity.length = MAX_ACTIVITY;
  return record;
}

function processEvent(event) {
  const now = Date.now();
  const rule = selectRule(config.rules, event, cooldowns, now);
  let alert = null;
  if (rule) {
    const sound = resolveSound(rule.soundId);
    alert = buildAlert(event, rule, { sound, now });
    markPlayed(rule, event, cooldowns, now);
    sendAlert(alert);
  }
  registerActivity(event, alert);
  sendState();
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

  if (typeof patch.sessionId === 'string' && patch.sessionId.trim()) {
    config.sessionIdEncrypted = encryptSecret(patch.sessionId.trim());
  }
  if (typeof patch.ttTargetIdc === 'string' && patch.ttTargetIdc.trim()) {
    config.ttTargetIdcEncrypted = encryptSecret(patch.ttTargetIdc.trim());
  }
  if (typeof patch.signApiKey === 'string' && patch.signApiKey.trim()) {
    config.signApiKeyEncrypted = encryptSecret(patch.signApiKey.trim());
  }
  if (patch.clearSession === true) {
    config.sessionIdEncrypted = '';
    config.ttTargetIdcEncrypted = '';
  }
  if (patch.clearSignApiKey === true) config.signApiKeyEncrypted = '';

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

function createWindow() {
  const smokeScreenshot = process.env.TIKTATO_SMOKE_SCREENSHOT || '';
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#090910',
    show: false,
    autoHideMenuBar: true,
    title: 'Tiktato',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (smokeScreenshot) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const image = await mainWindow.webContents.capturePage();
          fs.writeFileSync(smokeScreenshot, image.toPNG());
          logger.info(`[smoke] captura guardada en ${smokeScreenshot}`);
        } catch (error) {
          logger.error('[smoke] no se pudo capturar la ventana', error);
        } finally {
          app.quit();
        }
      }, 1500);
    });
    mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
      logger.error(`[smoke] falló la carga (${code}): ${description}`);
    });
  }

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (!smokeScreenshot) mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
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
      properties: ['openFile'],
      filters: [
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm'] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    try {
      const sound = importSound(app.getPath('userData'), result.filePaths[0]);
      config.sounds.push(sound);
      config = saveConfig(app.getPath('userData'), config);
      sendState();
      return { canceled: false, sound };
    } catch (error) {
      return { canceled: false, error: error.message };
    }
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
      ttTargetIdc: payload.ttTargetIdc,
      signApiKey: payload.signApiKey
    });
    await restartOverlayIfPortChanged(previousPort);
    sendState();
    try {
      const status = await tiktok.connect({
        username: config.username,
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

  ipcMain.handle('app:open-data-folder', async () => {
    await shell.openPath(app.getPath('userData'));
    return { ok: true };
  });
}

function wireTikTok() {
  tiktok = new TikTokService({ logger });
  tiktok.on('event', (event) => processEvent(event));
  tiktok.on('status', (status) => {
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

  app.whenReady().then(bootstrap).catch((error) => {
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
    tiktok?.disconnect().catch(() => {});
    overlayServer?.stop().catch(() => {});
  });

  app.on('window-all-closed', () => app.quit());
}
