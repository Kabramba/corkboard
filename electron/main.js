const { app, BrowserWindow, shell, ipcMain, dialog, Menu, Tray } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openVault, atomicWrite } = require('./vault');

if (process.env.CORK_USERDATA) app.setPath('userData', process.env.CORK_USERDATA);
// One copy only: two of them writing the same board would fight each other.
if (!app.requestSingleInstanceLock()) { app.quit(); return; }

const TEST = !!process.env.CORK_TEST; // automated runs keep the window off-screen
const REPO = 'https://github.com/Kabramba/corkboard';
const ICON = path.join(__dirname, 'icon.png');
const CFG = path.join(app.getPath('userData'), 'config.json');
const AUTOSTART = path.join(os.homedir(), '.config', 'autostart', 'corkboard.desktop');
const DEFAULTS = { tray: false, autostart: false, wheelZoom: false, lowMemory: false, root: path.join(os.homedir(), 'Corkboards') };

/* ---------- config ---------- */
let cfg = { boards: [], current: null, settings: {}, win: null };
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CFG, 'utf8')) }; } catch { /* first run */ }
cfg.settings = { ...DEFAULTS, ...cfg.settings };
// Drawing without the graphics card saves well over 100 MB; it has to be decided before the app is ready.
if (cfg.settings.lowMemory) app.disableHardwareAcceleration();
const saveCfg = () => { fs.mkdirSync(path.dirname(CFG), { recursive: true }); atomicWrite(CFG, JSON.stringify(cfg, null, 2)); };

/* ---------- boards ---------- */
const clean = (name) => String(name || '').replace(/[\/\\:*?"<>|\x00-\x1f]/g, '').trim().replace(/^\.+/, '').slice(0, 80) || 'Corkboard';
function freshDir(root, name) {
  let p = path.join(root, clean(name));
  for (let i = 2; fs.existsSync(p); i++) p = path.join(root, `${clean(name)} ${i}`);
  return p;
}
function firstBoard() {
  const dest = freshDir(cfg.settings.root, 'My Corkboard');
  fs.mkdirSync(dest, { recursive: true });
  return dest;
}
// A board made by an early development copy lived inside the source folder: copy it to where boards live now.
function adoptLegacyBoard() {
  const legacy = path.join(__dirname, '..', 'vault');
  if (cfg.migrated || app.isPackaged || process.env.CORK_USERDATA || !fs.existsSync(path.join(legacy, 'board.json'))) return;
  const dest = freshDir(cfg.settings.root, 'My Corkboard');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(legacy, dest, { recursive: true });
  cfg.boards.unshift(dest); cfg.current = dest; cfg.migrated = true;
}
let vault = null;
function openCurrent() {
  if (process.env.CORK_VAULT) { vault = openVault(process.env.CORK_VAULT); return; }
  adoptLegacyBoard();
  if (!cfg.current || !fs.existsSync(cfg.current)) cfg.current = cfg.boards.find((p) => fs.existsSync(p)) || null;
  if (!cfg.current) { cfg.current = firstBoard(); cfg.boards.push(cfg.current); }
  if (!cfg.boards.includes(cfg.current)) cfg.boards.push(cfg.current);
  saveCfg();
  vault = openVault(cfg.current);
}
function switchTo(dir) {
  cfg.current = dir;
  if (!cfg.boards.includes(dir)) cfg.boards.push(dir);
  openCurrent(); syncTray();
  if (win) win.reload();
}
const state = () => ({
  boards: cfg.boards.map((p) => ({ path: p, name: path.basename(p), missing: !fs.existsSync(p) })),
  current: vault.dir, settings: cfg.settings, version: app.getVersion(), repo: REPO,
});

/* ---------- settings that reach outside the window ---------- */
function syncAutostart() {
  if (!cfg.settings.autostart) return fs.rmSync(AUTOSTART, { force: true });
  const exec = app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${app.getAppPath()}" --no-sandbox`;
  fs.mkdirSync(path.dirname(AUTOSTART), { recursive: true });
  fs.writeFileSync(AUTOSTART, `[Desktop Entry]\nType=Application\nName=Corkboard\nExec=${exec}${cfg.settings.tray ? ' --hidden' : ''}\nIcon=corkboard\nX-GNOME-Autostart-enabled=true\n`);
}
let tray = null;
function syncTray() {
  if (!cfg.settings.tray) { tray?.destroy(); tray = null; return; }
  if (!tray) { tray = new Tray(path.join(__dirname, 'tray.png')); tray.setToolTip('Corkboard'); tray.on('click', showWindow); }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Corkboard', click: showWindow },
    { type: 'separator' },
    ...cfg.boards.filter((p) => fs.existsSync(p)).map((p) => ({
      label: path.basename(p), type: 'radio', checked: p === vault.dir,
      click: () => { if (p !== vault.dir) switchTo(p); showWindow(); },
    })),
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

/* ---------- ipc ---------- */
const guard = (fn) => (...a) => {
  try { return fn(...a); } catch (err) { if (TEST) { console.error(err); return { error: err.message }; } dialog.showErrorBox('Corkboard', `${err.message}\n\nBoard folder: ${vault?.dir}`); return { error: err.message }; }
};
// Saves name the board they belong to, so a late save can never land in a board that was just switched to.
const saveTo = (dir, json) => (dir === vault.dir ? vault.save(json) : false);
ipcMain.handle('vault:load', guard(() => vault.load()));
ipcMain.on('vault:save', guard((e, dir, json) => saveTo(dir, json)));
ipcMain.on('vault:saveSync', (e, dir, json) => { guard(() => saveTo(dir, json))(); e.returnValue = true; });
ipcMain.handle('vault:asset', guard((e, dir, id, data) => (dir === vault.dir ? vault.asset(id, data) : false)));

const api = {
  state,
  new: (name) => { const dir = freshDir(cfg.settings.root, name); fs.mkdirSync(dir, { recursive: true }); switchTo(dir); return state(); },
  open: async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Open a board folder', defaultPath: cfg.settings.root, properties: ['openDirectory', 'createDirectory'] });
    if (!r.canceled && r.filePaths[0] && r.filePaths[0] !== vault.dir) switchTo(r.filePaths[0]);
    return state();
  },
  switch: (dir) => { if (cfg.boards.includes(dir) && fs.existsSync(dir) && dir !== vault.dir) switchTo(dir); return state(); },
  rename: (dir, name) => {
    const to = path.join(path.dirname(dir), clean(name));
    if (to === dir || !cfg.boards.includes(dir)) return state();
    if (fs.existsSync(to)) return { ...state(), error: `A folder called "${clean(name)}" already exists there.` };
    fs.renameSync(dir, to);
    cfg.boards[cfg.boards.indexOf(dir)] = to;
    if (cfg.current === dir) { switchTo(to); return state(); }
    saveCfg(); syncTray();
    return state();
  },
  forget: (dir) => { // takes it off the list; the folder itself is left alone
    cfg.boards = cfg.boards.filter((p) => p !== dir);
    if (dir === vault.dir) { cfg.current = null; openCurrent(); syncTray(); if (win) win.reload(); } else { saveCfg(); syncTray(); }
    return state();
  },
  reveal: (dir) => { shell.openPath(dir); },
  set: (key, value) => {
    if (!(key in DEFAULTS) || key === 'root') return state();
    cfg.settings[key] = !!value; saveCfg();
    syncTray(); syncAutostart();
    return state();
  },
  chooseRoot: async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Where should new boards be created?', defaultPath: cfg.settings.root, properties: ['openDirectory', 'createDirectory'] });
    if (!r.canceled && r.filePaths[0]) { cfg.settings.root = r.filePaths[0]; saveCfg(); }
    return state();
  },
  restart: () => { app.relaunch(); app.quit(); },
  external: (url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); },
};
for (const [name, fn] of Object.entries(api)) ipcMain.handle('app:' + name, guard((e, ...a) => fn(...a)));

/* ---------- window ---------- */
let win = null;
function showWindow() {
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); return; }
  const b = cfg.win || {};
  win = new BrowserWindow({
    width: b.width || 1440, height: b.height || 920, x: b.x, y: b.y, minWidth: 720, minHeight: 480,
    title: 'Corkboard', icon: ICON, backgroundColor: '#b98a5a', autoHideMenuBar: true, show: !TEST,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), spellcheck: false, backgroundThrottling: !TEST, offscreen: !!process.env.CORK_SHOT },
  });
  if (b.max) win.maximize();
  if (process.env.CORK_DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', () => { cfg.win = { ...win.getNormalBounds(), max: win.isMaximized() }; saveCfg(); });
  win.on('closed', () => { win = null; }); // with the tray on, the page is fully unloaded while the app waits
}
const ui = (what) => () => { showWindow(); win.webContents.send('ui', what); };
Menu.setApplicationMenu(Menu.buildFromTemplate([
  { label: 'Board', submenu: [
    { label: 'Boards…', accelerator: 'CmdOrCtrl+O', click: ui('boards') },
    { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: ui('settings') },
    { type: 'separator' },
    { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
  ] },
  { label: 'View', submenu: [{ role: 'togglefullscreen' }] },
  { label: 'Help', submenu: [{ label: 'Corkboard on GitHub', click: () => shell.openExternal(REPO) }] },
]));

app.whenReady().then(() => {
  openCurrent(); syncTray();
  if (!(cfg.settings.tray && process.argv.includes('--hidden'))) showWindow();
});
app.on('second-instance', showWindow);
app.on('window-all-closed', () => { if (!cfg.settings.tray) app.quit(); });
