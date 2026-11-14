// End-to-end check: runs the real app (window kept off-screen) against a throwaway home folder.
//   electron scripts/e2e.cjs --no-sandbox
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'cork-e2e-'));
process.env.HOME = HOME;
process.env.CORK_USERDATA = path.join(HOME, 'userdata');
process.env.CORK_TEST = '1';
delete process.env.CORK_VAULT;

const { app, BrowserWindow } = require('electron');
require('../electron/main.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${extra ? '  ' + extra : ''}`); };
const board = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'board.json'), 'utf8'));
const win = () => BrowserWindow.getAllWindows()[0];
const js = (code) => win().webContents.executeJavaScript(`(async () => { ${code} })()`, true);
function mem() { // proportional memory (shared pages counted once), per process type
  const out = {}; let total = 0;
  for (const p of app.getAppMetrics()) {
    let kb = 0;
    try { kb = +fs.readFileSync(`/proc/${p.pid}/smaps_rollup`, 'utf8').match(/^Pss:\s+(\d+)/m)[1]; } catch { kb = p.memory.workingSetSize; }
    out[p.type] = (out[p.type] || 0) + Math.round(kb / 1024); total += kb / 1024;
  }
  return `${Math.round(total)} MB  (${Object.entries(out).map(([k, v]) => `${k} ${v}`).join(', ')})`;
}
async function ready() { // wait for the page to (re)load and finish booting
  for (let i = 0; i < 150; i++) {
    await sleep(100);
    if (win() && !win().webContents.isLoading() && (await win().webContents.executeJavaScript('window.__ready === true').catch(() => false))) return;
  }
  throw new Error('the app did not finish loading');
}
async function reloaded(action) { // run something that makes the app reload, then wait for it
  await js('window.__ready = false;');
  await action();
  await ready();
}
const PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Contents 4 0 R/Resources<<>>>>endobj
4 0 obj<</Length 44>>stream
0.8 0.2 0.2 rg 40 40 220 320 re f
endstream endobj
trailer<</Root 1 0 R>>
`;

app.whenReady().then(async () => {
  try {
    const first = path.join(HOME, 'Corkboards', 'My Corkboard');
    await ready();

    console.log('first run');
    check('default board folder is created in ~/Corkboards', fs.existsSync(first));
    check('welcome pieces are on the board', (await js('return document.querySelectorAll(".item").length')) === 5);
    check('board name shows in the switcher', (await js('return document.querySelector("#chip").textContent')) === 'My Corkboard');
    await sleep(700);
    check('auto-save wrote board.json', board(first).S.items.length === 5);
    check('stickies start without a pin', (await js('return document.querySelectorAll(".item.sticky .pin, .item.mini .pin").length')) === 0);

    console.log('   memory, fresh board: ' + mem());
    console.log('content');
    await js(`const d = new DataTransfer(); d.setData('text/plain', 'Euler: $e^{i\\\\pi}+1=0$');
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true }));`);
    check('pasted text becomes a sticky with a rendered equation', await js('return !!document.querySelector(".item.sticky .katex")'));
    await js(`const c = document.createElement('canvas'); c.width = 640; c.height = 480;
      const g = c.getContext('2d'); g.fillStyle = '#3a7'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#fc3'; g.fillRect(200, 150, 240, 180);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const d = new DataTransfer(); d.items.add(new File([blob], 'shot.png', { type: 'image/png' }));
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true }));`);
    await sleep(900);
    check('pasted image becomes a photo', (await js('return document.querySelectorAll(".item.photo").length')) === 1);
    const jpgs = fs.readdirSync(path.join(first, 'assets'));
    check('photo is stored as a .jpg in the board folder', jpgs.length === 1 && jpgs[0].endsWith('.jpg'));
    await js(`const d = new DataTransfer(); d.items.add(new File([${JSON.stringify(PDF)}], 'doc.pdf', { type: 'application/pdf' }));
      const e = new DragEvent('drop', { dataTransfer: d, bubbles: true, clientX: 400, clientY: 300 }); window.dispatchEvent(e);`);
    let pages = 0;
    for (let i = 0; i < 60 && !pages; i++) { await sleep(150); pages = await js('return document.querySelectorAll("#modal .pg canvas").length'); }
    check('PDF opens in the page picker', pages === 1);
    await js('document.querySelector("#modal .pg").click(); document.querySelector("#modal .go").click();');
    await sleep(1200);
    check('torn-out PDF page lands on the board', (await js('return document.querySelectorAll(".item.pdf").length')) === 1);
    await sleep(600);
    const zoomPct = () => js('return parseInt(document.querySelector("#zoom").textContent)');
    const wheel = (dy, n = 1) => js(`for (let i = 0; i < ${n}; i++) document.querySelector("#viewport").dispatchEvent(new WheelEvent("wheel", { deltaY: ${dy}, ctrlKey: true, clientX: 400, clientY: 300, bubbles: true, cancelable: true }));`);
    await js('window.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 16)'); // a hidden window gets no frames of its own
    const z0 = await zoomPct();
    await wheel(-120);
    const mid = await js('return new Promise((r) => requestAnimationFrame(() => r(parseInt(document.querySelector("#zoom").textContent))))');
    await sleep(500);
    const z1 = await zoomPct();
    check('one mouse-wheel notch zooms a little, not across the whole range', z1 > z0 * 1.1 && z1 < z0 * 1.25, `${z0}% -> ${z1}%`);
    check('and glides there instead of jumping', mid < z1, `${mid}% on the way to ${z1}%`);
    await wheel(120); await sleep(500);
    check('one notch back returns to the same zoom', Math.abs((await zoomPct()) - z0) <= 1);
    await wheel(-120, 40); await sleep(900);
    check('zoom still stops at its limits', (await zoomPct()) === 400);
    await wheel(120, 12); await sleep(900);
    check('everything is saved (8 pieces, 2 images)', board(first).S.items.length === 8 && fs.readdirSync(path.join(first, 'assets')).length === 2);

    console.log('boards');
    await reloaded(() => js('window.desk.call("new", "Second / Board");'));
    const second = path.join(HOME, 'Corkboards', 'Second  Board');
    check('new board gets its own folder (unsafe characters stripped)', fs.existsSync(second), fs.readdirSync(path.join(HOME, 'Corkboards')).join(', '));
    check('new board starts with the welcome pieces', (await js('return document.querySelectorAll(".item").length')) === 5);
    await sleep(700);
    check('switching never writes one board into another', board(first).S.items.length === 8 && board(second).S.items.length === 5);
    await reloaded(() => js(`window.desk.call("switch", ${JSON.stringify(first)});`));
    check('switching back restores the first board', (await js('return document.querySelectorAll(".item").length')) === 8);
    await sleep(500);
    check('its images load from the board folder', await js('return [...document.querySelectorAll(".item img")].every((i) => i.complete && i.naturalWidth > 0 && i.src.startsWith("file:"))'));
    let st = await js(`return window.desk.call("rename", ${JSON.stringify(second)}, "Ideas");`);
    const ideas = path.join(HOME, 'Corkboards', 'Ideas');
    check('renaming a board renames its folder', fs.existsSync(ideas) && !fs.existsSync(second) && st.boards.some((b) => b.name === 'Ideas'));
    st = await js(`return window.desk.call("rename", ${JSON.stringify(ideas)}, "My Corkboard");`);
    check('renaming onto an existing folder is refused', !!st.error && fs.existsSync(ideas));
    st = await js(`return window.desk.call("forget", ${JSON.stringify(ideas)});`);
    check('removing a board from the list leaves its files alone', st.boards.length === 1 && fs.existsSync(path.join(ideas, 'board.json')));

    console.log('settings');
    st = await js('return window.desk.call("set", "tray", true);');
    const cfg = () => JSON.parse(fs.readFileSync(path.join(HOME, 'userdata', 'config.json'), 'utf8'));
    check('settings persist to config.json', st.settings.tray === true && cfg().settings.tray === true);
    const auto = path.join(HOME, '.config', 'autostart', 'corkboard.desktop');
    await js('return window.desk.call("set", "autostart", true);');
    check('start-at-login writes an autostart entry', fs.existsSync(auto) && /--hidden/.test(fs.readFileSync(auto, 'utf8')));
    await js('return window.desk.call("set", "autostart", false);');
    check('and removes it again', !fs.existsSync(auto));
    st = await js('return window.desk.call("set", "root", "/etc");');
    check('unknown or protected settings are ignored', st.settings.root === path.join(HOME, 'Corkboards'));
    await js('return window.desk.call("set", "tray", false);');

    console.log('recovery');
    fs.writeFileSync(path.join(first, 'board.json'), '{"S":{"items":[{"id":"x"');
    await reloaded(async () => win().reload());
    check('a damaged board file is repaired on load', (await js('return document.querySelectorAll(".item").length')) === 8);
    check('the user is told', /restored from/.test(await js('return document.querySelector("#toast")?.textContent || ""')));
    check('the damaged file is kept', fs.readdirSync(first).some((f) => f.startsWith('board.damaged-')));

    console.log('resources');
    await sleep(4000);
    app.getAppMetrics(); await sleep(3000); // second call reports CPU over the interval
    const cpu = app.getAppMetrics().reduce((t, p) => t + p.cpu.percentCPUUsage, 0);
    console.log('   memory, board with photos and a PDF: ' + mem());
    if (!process.env.CI) check('idle CPU is near zero', cpu < 2, `${cpu.toFixed(2)}%`); // shared CI machines are too noisy to judge
    await js('return window.desk.call("set", "tray", true);'); // so closing the window does not quit
    win().destroy(); await sleep(3000);
    check('with the tray on, the app outlives its window', BrowserWindow.getAllWindows().length === 0);
    console.log('   memory, window closed (tray mode): ' + mem());
  } catch (err) { check('run completed', false, err.stack); }
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  fs.rmSync(HOME, { recursive: true, force: true });
  app.exit(failed ? 1 : 0);
});
