const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { app } = require('electron');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;          // el usuario confirma antes de bajar
autoUpdater.autoInstallOnAppQuit = true;   // si no reinició, instala al cerrar

let isUpdaterQuitting = false;

function setupAutoUpdater({ getMainWindow }) {
  if (!app.isPackaged) {
    log.info('[updater] app no empaquetada, auto-update desactivado');
    return null;
  }

  const send = (channel, payload) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  autoUpdater.on('checking-for-update', () => send('update:status', { status: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    send('update:status', { status: 'available', version: info.version, releaseNotes: info.releaseNotes })
  );
  autoUpdater.on('update-not-available', () => send('update:status', { status: 'not-available' }));
  autoUpdater.on('download-progress', (p) =>
    send('update:status', { status: 'downloading', percent: p.percent })
  );
  autoUpdater.on('update-downloaded', (info) =>
    send('update:status', { status: 'ready', version: info.version })
  );
  autoUpdater.on('error', (err) => {
    log.error('[updater] error', err);
    send('update:status', { status: 'error', message: err.message });
  });

  const checkTimer = setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10_000);
  const checkInterval = setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
  if (typeof checkTimer?.unref === 'function') checkTimer.unref();
  if (typeof checkInterval?.unref === 'function') checkInterval.unref();

  return {
    check: () => autoUpdater.checkForUpdates(),
    download: () => autoUpdater.downloadUpdate(),
    install: () => {
      isUpdaterQuitting = true;
      setImmediate(() => autoUpdater.quitAndInstall(true, true));
    },
    isUpdaterQuitting: () => isUpdaterQuitting
  };
}

module.exports = { setupAutoUpdater };
