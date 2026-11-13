const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vault', {
  load: () => ipcRenderer.invoke('vault:load'),
  save: (json) => ipcRenderer.send('vault:save', json),
  saveSync: (json) => ipcRenderer.sendSync('vault:saveSync', json),
  asset: (id, dataUrl) => ipcRenderer.invoke('vault:asset', id, dataUrl),
});
