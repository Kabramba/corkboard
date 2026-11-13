const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1440, height: 920, title: 'Corkboard',
    backgroundColor: '#b98a5a', autoHideMenuBar: true,
  });
  if (process.env.CORK_DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
});
app.on('window-all-closed', () => app.quit());
