const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vault', {
  load: () => ipcRenderer.invoke('vault:load'),
  save: (dir, json) => ipcRenderer.send('vault:save', dir, json),
  saveSync: (dir, json) => ipcRenderer.sendSync('vault:saveSync', dir, json),
  asset: (dir, id, dataUrl) => ipcRenderer.invoke('vault:asset', dir, id, dataUrl),
});
contextBridge.exposeInMainWorld('desk', {
  call: (name, ...args) => ipcRenderer.invoke('app:' + name, ...args),
  onUi: (fn) => ipcRenderer.on('ui', (e, what) => fn(what)),
});
