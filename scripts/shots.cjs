// Takes the README screenshot by running the real app on a demo board: electron scripts/shots.cjs --no-sandbox
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'cork-shot-'));
const DEMO = path.join(HOME, 'Demo');
Object.assign(process.env, { HOME, CORK_USERDATA: path.join(HOME, 'userdata'), CORK_VAULT: DEMO, CORK_TEST: '1', CORK_SHOT: '1' });
fs.mkdirSync(path.join(DEMO, 'assets'), { recursive: true });
fs.copyFileSync(path.join(__dirname, '../art/demo/photo.jpg'), path.join(DEMO, 'assets', 'photo.jpg'));
fs.copyFileSync(path.join(__dirname, '../art/demo/page.jpg'), path.join(DEMO, 'assets', 'page.jpg'));

let z = 1;
const pin = (id, c, x = 0.5, y = 0.06) => ({ id, k: 'pin', x, y, c });
const it = (o) => ({ id: 'i' + z, z: z++, text: '', rot: 0, seed: z * 7919, f: [], ...o });
const code = `export function stickyHome(sticky, papers) {
  // a sticky clings to the page it overlaps most
  let best = null, bestArea = 0;
  for (const page of papers) {
    const shared = overlap(quad(sticky), quad(page));
    if (shared > bestArea) { best = page; bestArea = shared; }
  }
  return bestArea >= area(sticky) * 0.2 ? best : null;
}`;
const items = [
  it({ type: 'card', x: 560, y: 46, w: 470, font: 'serif', fs: 19, c: '#c9493b', rot: -1.5, f: [pin('a', 1, 0.5, 0.09)], text: '# Thesis board\nEverything for chapter three, in one place.' }),
  it({ type: 'scrap', x: 96, y: 300, w: 370, font: 'sans', fs: 15, rot: 1.6, f: [pin('b', 2, 0.5, 0.04)], text: '## Reading notes\n- [x] Collect the sources\n- [x] Skim the methods\n- [ ] Compare ==sample sizes==\n\n> [!tip] Markdown\n> Headings, lists, tables and `code` all render.\n\n$$\n\\hat{\\beta} = (X^\\top X)^{-1} X^\\top y\n$$' }),
  it({ type: 'sticky', x: 110, y: 70, w: 220, font: 'hand', fs: 21, c: '#fdf08a', rot: -4, text: 'Ask Priya about\nthe **1998** survey\nbefore Friday!' }),
  it({ type: 'photo', x: 590, y: 300, w: 340, rot: 2.5, asset: 'photo', ar: 600 / 900, f: [pin('c', 0, 0.5, 0.05)] }),
  it({ type: 'pdf', x: 965, y: 425, w: 270, rot: -3, asset: 'page', ar: 1100 / 850, f: [{ id: 't', k: 'tape', x: 0.5, y: 0.01, c: 2, r: -3, l: 110 }] }),
  it({ type: 'code', x: 1090, y: 150, w: 450, font: 'mono', fs: 11.5, lang: 'js', rot: -1, f: [pin('d', 3, 0.5, 0.06)], text: code }),
  it({ type: 'mini', x: 395, y: 560, w: 118, font: 'hand', fs: 15, c: '#ffb3c7', rot: 6, text: 'cite\nthis!' }),
  it({ type: 'sticky', x: 1300, y: 540, w: 210, font: 'hand', fs: 20, c: '#b9eeb0', rot: 3, text: 'Figure 3 goes\nwith the photo\n→ yarn them' }),
  it({ type: 'mini', x: 1160, y: 500, w: 118, font: 'hand', fs: 15, c: '#a9e2f5', rot: -5, text: 'p. 42' }),
];
const yarns = [
  { id: 'y2', a: ['i4', 'c'], b: ['i6', 'd'], c: '#2f6fd1', sl: 0.5 },
  { id: 'y3', a: ['i2', 'b'], b: ['i4', 'c'], c: '#d7352a', sl: 0.55 },
];
fs.writeFileSync(path.join(DEMO, 'board.json'), JSON.stringify({ S: { items, yarns }, V: { x: 0, y: 0, s: 1 } }));

const { app, BrowserWindow } = require('electron');
require('../electron/main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  win.setContentSize(1600, 960);
  for (let i = 0; i < 100 && !(await win.webContents.executeJavaScript('window.__ready === true').catch(() => false)); i++) await sleep(100);
  await win.webContents.executeJavaScript('document.querySelector("#chip").textContent = "Thesis board"; document.querySelector("#hint").remove();');
  await sleep(1200);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '../docs/screenshot.png'), img.resize({ width: 1600 }).toPNG());
  console.log('wrote docs/screenshot.png', img.getSize());
  fs.rmSync(HOME, { recursive: true, force: true });
  app.exit(0);
});
