// The board lives in plain files, like an Obsidian vault:
//   vault/board.json        the board (text, positions, pins, yarn)
//   vault/board.json.bak    the previous good save
//   vault/assets/<id>.jpg   photos and PDF pages
//   vault/backups/          timestamped snapshots
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const DIR = process.env.CORK_VAULT || path.join(__dirname, '..', 'vault');
const BOARD = path.join(DIR, 'board.json');
const BAK = BOARD + '.bak';
const ASSETS = path.join(DIR, 'assets');
const BACKUPS = path.join(DIR, 'backups');
const SNAP_EVERY = 10 * 60 * 1000, KEEP_RECENT = 60;

let lastJson = null, lastSnap = 0;
for (const d of [DIR, ASSETS, BACKUPS]) fs.mkdirSync(d, { recursive: true });

const valid = (json) => { try { return Array.isArray(JSON.parse(json).S.items); } catch { return false; } };
const read = (f) => { try { const j = fs.readFileSync(f, 'utf8'); return valid(j) ? j : null; } catch { return null; } };
const stamp = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().replace(/[:T]/g, '-').slice(0, 19); };

// Write to a temp file, flush it to disk, then swap it in: a crash can never leave a half-written file.
function atomicWrite(file, data) {
  const tmp = `${file}.${process.pid}.tmp`, fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
const snapshots = () => fs.readdirSync(BACKUPS).filter((f) => /^board-.*\.json$/.test(f)).sort();

function snapshot(json) {
  const all = snapshots();
  if (all.length && read(path.join(BACKUPS, all.at(-1))) === json) return;
  atomicWrite(path.join(BACKUPS, `board-${stamp()}.json`), json);
  lastSnap = Date.now();
  // Keep the newest ones, plus the last snapshot of every older day.
  const old = snapshots().slice(0, -KEEP_RECENT), lastOfDay = new Set();
  for (let i = old.length - 1, day = ''; i >= 0; i--) { const d = old[i].slice(6, 16); if (d !== day) { day = d; lastOfDay.add(old[i]); } }
  for (const f of old) if (!lastOfDay.has(f)) fs.rmSync(path.join(BACKUPS, f), { force: true });
}

function load() {
  const url = pathToFileURL(DIR).href;
  let json = read(BOARD), note = null;
  if (!json && (fs.existsSync(BOARD) || fs.existsSync(BAK) || snapshots().length)) {
    if (fs.existsSync(BOARD)) fs.renameSync(BOARD, path.join(DIR, `board.damaged-${stamp()}.json`));
    const tries = [BAK, ...snapshots().reverse().map((f) => path.join(BACKUPS, f))];
    for (const f of tries) if ((json = read(f))) { note = `The board file was damaged, so it was restored from ${path.basename(f)}.`; break; }
    if (json) atomicWrite(BOARD, json);
    else note = 'The board file was damaged and no backup could be read. The damaged file was kept in the vault folder.';
  }
  if (json) { lastJson = json; snapshot(json); }
  return { json, url, note };
}

function save(json) {
  if (json === lastJson || !valid(json)) return;
  if (lastJson) atomicWrite(BAK, lastJson);
  atomicWrite(BOARD, json);
  const emptied = lastJson && !JSON.parse(json).S.items.length && JSON.parse(lastJson).S.items.length;
  if (emptied) snapshot(lastJson); // never let "everything deleted" be the only copy
  lastJson = json;
  if (Date.now() - lastSnap > SNAP_EVERY) snapshot(json);
}

function asset(id, dataUrl) {
  if (!/^[a-z0-9]+$/.test(id)) return;
  const file = path.join(ASSETS, `${id}.jpg`);
  if (!fs.existsSync(file)) atomicWrite(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

module.exports = { load, save, asset, DIR };
