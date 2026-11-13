import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const { openVault } = createRequire(import.meta.url)('../electron/vault.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cork-vault-'));
const board = (n) => JSON.stringify({ S: { items: Array.from({ length: n }, (_, i) => ({ id: 'i' + i })), yarns: [] }, V: {} });
const count = (json) => JSON.parse(json).S.items.length;

test('a fresh folder loads as an empty board', () => {
  const v = openVault(tmp()), r = v.load();
  assert.equal(r.json, null);
  assert.equal(r.note, null);
  assert.ok(fs.existsSync(path.join(v.dir, 'assets')));
});
test('save, reload, and keep a mirror copy as .bak', () => {
  const dir = tmp(), v = openVault(dir);
  v.load();
  assert.equal(v.save(board(1)), true);
  assert.equal(v.save(board(2)), true);
  assert.equal(v.save(board(2)), false, 'identical saves are skipped');
  assert.equal(count(fs.readFileSync(path.join(dir, 'board.json'), 'utf8')), 2);
  assert.equal(count(fs.readFileSync(path.join(dir, 'board.json.bak'), 'utf8')), 2);
  assert.equal(count(openVault(dir).load().json), 2);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')), [], 'no temp files left behind');
});
test('garbage is never written', () => {
  const dir = tmp(), v = openVault(dir);
  v.save(board(3));
  for (const bad of ['', 'nope', '{"S":{}}', '{"S":{"items":5}}']) assert.equal(v.save(bad), false);
  assert.equal(count(openVault(dir).load().json), 3);
});
test('a truncated board file is restored from .bak and the damaged file is kept', () => {
  const dir = tmp(), v = openVault(dir);
  v.save(board(4)); v.save(board(5));
  fs.writeFileSync(path.join(dir, 'board.json'), '{"S":{"items":[{"id"');
  const r = openVault(dir).load();
  assert.equal(count(r.json), 5, 'nothing is lost');
  assert.match(r.note, /restored from board\.json\.bak/);
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('board.damaged-')));
  assert.equal(count(fs.readFileSync(path.join(dir, 'board.json'), 'utf8')), 5, 'the repaired file is written back');
});
test('with board and .bak both gone, the newest snapshot is used', () => {
  const dir = tmp();
  openVault(dir).save(board(6));
  openVault(dir).load(); // takes a snapshot
  fs.rmSync(path.join(dir, 'board.json'));
  fs.rmSync(path.join(dir, 'board.json.bak'), { force: true });
  const r = openVault(dir).load();
  assert.equal(count(r.json), 6);
  assert.match(r.note, /restored from board-/);
});
test('emptying the board snapshots what was there first', () => {
  const dir = tmp(), v = openVault(dir);
  v.save(board(7)); v.save(board(0));
  const snaps = v.snapshots().map((f) => count(fs.readFileSync(path.join(dir, 'backups', f), 'utf8')));
  assert.ok(snaps.includes(7));
});
test('old snapshots are thinned to one per day', () => {
  const dir = tmp(), v = openVault(dir), b = path.join(dir, 'backups');
  for (let d = 1; d <= 20; d++) for (let h = 10; h < 15; h++) {
    fs.writeFileSync(path.join(b, `board-2020-01-${String(d).padStart(2, '0')}-${h}-00-00.json`), board(d));
  }
  v.save(board(99)); // triggers a snapshot and the pruning
  const left = v.snapshots(), old = left.slice(0, -60);
  assert.ok(left.length < 101);
  assert.equal(new Set(old.map((f) => f.slice(6, 16))).size, old.length, 'at most one old snapshot per day');
  // (the newest old day is split by the keep-recent boundary, so skip it)
  assert.ok(old.slice(0, -1).every((f) => f.includes('-14-00-00')), 'and it is the last one of that day');
});
test('assets: written once, bad ids refused', () => {
  const dir = tmp(), v = openVault(dir), png = 'data:image/jpeg;base64,' + Buffer.from('hello').toString('base64');
  assert.equal(v.asset('abc123', png), true);
  assert.equal(fs.readFileSync(path.join(dir, 'assets', 'abc123.jpg'), 'utf8'), 'hello');
  assert.equal(v.asset('../evil', png), false);
  assert.equal(v.asset('a/b', png), false);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'assets')), ['abc123.jpg']);
});
