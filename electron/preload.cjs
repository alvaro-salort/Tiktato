const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('tiktato', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  saveRules: (rules) => ipcRenderer.invoke('rules:save', rules),
  importSound: () => ipcRenderer.invoke('sound:import'),
  deleteSound: (soundId) => ipcRenderer.invoke('sound:delete', soundId),
  refreshGifts: () => ipcRenderer.invoke('gifts:refresh'),
  connect: (payload) => ipcRenderer.invoke('tiktok:connect', payload),
  disconnect: () => ipcRenderer.invoke('tiktok:disconnect'),
  loginTikTok: () => ipcRenderer.invoke('tiktok:login'),
  logoutTikTok: () => ipcRenderer.invoke('tiktok:logout'),
  testEvent: (input) => ipcRenderer.invoke('event:test', input),
  copyOverlayUrl: () => ipcRenderer.invoke('overlay:copy'),
  openOverlay: () => ipcRenderer.invoke('overlay:open'),
  copyJarUrl: () => ipcRenderer.invoke('jar:copy'),
  openJar: () => ipcRenderer.invoke('jar:open'),
  openJarStudio: (opts) => ipcRenderer.invoke('jar:open-studio', opts),
  copyJarTestUrl: () => ipcRenderer.invoke('jar:copy-test'),
  openJarTest: () => ipcRenderer.invoke('jar:open-test'),
  testJarGift: (sample) => ipcRenderer.invoke('jar:test-gift', sample),
  resetJar: () => ipcRenderer.invoke('jar:reset'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  onAlert: (callback) => subscribe('alert', callback),
  onIncomingEvent: (callback) => subscribe('event:incoming', callback),
  onState: (callback) => subscribe('state:update', callback),
  onStatus: (callback) => subscribe('status:update', callback)
});
