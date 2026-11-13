// Renders an HTML or SVG file to a PNG with Chromium: electron scripts/render.cjs <in> <out.png> <width> <height>
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const [, , src, out, w, h] = process.argv.filter((a) => !a.startsWith('--'));
app.setPath('userData', fs.mkdtempSync(path.join(require('os').tmpdir(), 'cork-render-')));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: +w, height: +h, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadFile(path.resolve(src));
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 400)))');
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.resize({ width: +w, height: +h }).toPNG());
  app.exit(0);
});
