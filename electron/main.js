const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');

// One window only: two copies writing the same board would fight each other.
if (!app.requestSingleInstanceLock()) { app.quit(); return; }
const vault = require('./vault');

const guard = (fn) => (...a) => {
  try { return fn(...a); } catch (err) { dialog.showErrorBox('Corkboard could not save', `${err.message}\n\nVault: ${vault.DIR}`); }
};
ipcMain.handle('vault:load', guard(() => vault.load()));
ipcMain.on('vault:save', guard((e, json) => vault.save(json)));
ipcMain.on('vault:saveSync', (e, json) => { guard(() => vault.save(json))(); e.returnValue = true; });
ipcMain.handle('vault:asset', guard((e, id, data) => vault.asset(id, data)));

let win;
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1440, height: 920, title: 'Corkboard',
    backgroundColor: '#b98a5a', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  if (process.env.CORK_DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
