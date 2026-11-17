const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tiktatoStudio', {
  close: () => ipcRenderer.send('jar:close-studio')
});
