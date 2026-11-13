import '@fontsource-variable/inter';
import '@fontsource/lora/400.css';
import '@fontsource/lora/400-italic.css';
import '@fontsource/lora/700.css';
import '@fontsource/courier-prime/400.css';
import '@fontsource/courier-prime/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import 'highlight.js/styles/github.css';
import './style.css';
import 'katex/dist/katex.min.css';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { get, set } from 'idb-keyval';
import corkUrl from './cork.svg?url';

const $ = (s) => document.querySelector(s);
const vp = $('#viewport'), world = $('#world'), itemsEl = $('#items'), yarnEl = $('#yarn');
const dock = $('#dock'), bar = $('#itembar'), modal = $('#modal'), fileIn = $('#file'), zoomBtn = $('#zoom');

const PINS = ['#d7352a', '#f2b01e', '#2f7de1', '#1f9d57', '#f4f1ea', '#2a2a2e'];
const TAPES = ['rgba(246,217,139,.82)', 'rgba(242,167,184,.8)', 'rgba(160,214,198,.8)', 'rgba(178,194,240,.8)', 'rgba(232,226,208,.85)'];
const YARNS = ['#d7352a', '#2f6fd1', '#1f9d57', '#f2b01e', '#f4f1ea', '#2a2a2e'];
const STICKY = ['#fdf08a', '#ffb3c7', '#a9e2f5', '#b9eeb0', '#ffc98a', '#d9c2ff'];
const CARD = ['#c9493b', '#7a1f3d', '#d1249b', '#3f3aa8', '#17b3a8', '#e0a526', '#2e8b57', '#1d1b1a'];
const STICKS_TO = ['pdf', 'code', 'scrap'];
const isSticky = (i) => i.type === 'sticky' || i.type === 'mini';
const hasPin = (i) => i.f.some((f) => f.k === 'pin');
const FONTS = { sans: 'Sans', hand: 'Hand', serif: 'Serif', plain: 'Plain', mono: 'Mono' };
const TEXT = ['sticky', 'mini', 'card', 'scrap', 'code'];
const DEF = {
  sticky: { w: 220, font: 'hand', fs: 20, c: STICKY[0] },
  mini: { w: 112, font: 'hand', fs: 14, c: STICKY[1] },
  card: { w: 360, font: 'serif', fs: 19, c: CARD[0] },
  scrap: { w: 340, font: 'sans', fs: 15 },
  code: { w: 500, font: 'mono', fs: 12.5 },
  photo: { w: 300 },
  pdf: { w: 380 },
};

let S = { items: [], yarns: [] };
let V = { x: 0, y: 0, s: 1 };
let assets = {}, assetsDirty = false;
let sel = null, selYarn = null, editing = null, tool = null, tempYarn = null, zTop = 1;
const hist = [];
const els = new Map();
const uid = () => Math.random().toString(36).slice(2, 10);
const byId = (id) => S.items.find((i) => i.id === id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const toWorld = (cx, cy) => [(cx - V.x) / V.s, (cy - V.y) / V.s];
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- persistence + undo ---------- */
const vault = window.vault;
let vaultUrl = '', saveT;
const assetSrc = (id) => assets[id] || (vaultUrl ? `${vaultUrl}/assets/${id}.jpg` : '');
function save() {
  clearTimeout(saveT);
  if (vault) vault.save(JSON.stringify({ S, V }));
  else { set('board', { S, V }); if (assetsDirty) { set('assets', assets); assetsDirty = false; } }
}
addEventListener('beforeunload', () => {
  if (editing) document.activeElement?.blur();
  if (vault) vault.saveSync(JSON.stringify({ S, V }));
});
function toast(msg) {
  const t = document.createElement('div'); t.id = 'toast'; t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), 7000);
}
function commit() {
  const j = JSON.stringify(S);
  if (j !== hist.at(-1)) { hist.push(j); if (hist.length > 60) hist.shift(); }
  clearTimeout(saveT); saveT = setTimeout(save, 300);
}
function undo() {
  if (hist.length < 2) return;
  hist.pop(); S = JSON.parse(hist.at(-1)); sel = selYarn = null;
  renderAll(); save();
}

/* ---------- view ---------- */
const TILE = 512;
function applyView() {
  world.style.transform = `translate(${V.x}px,${V.y}px) scale(${V.s})`;
  vp.style.backgroundPosition = `${V.x}px ${V.y}px`;
  vp.style.backgroundSize = `${TILE * V.s}px`;
  zoomBtn.textContent = Math.round(V.s * 100) + '%';
  positionBar();
}
function zoomAt(cx, cy, f) {
  const s = clamp(V.s * f, 0.15, 4); f = s / V.s;
  V.x = cx - (cx - V.x) * f; V.y = cy - (cy - V.y) * f; V.s = s;
  applyView();
}
vp.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.008)));
  else { V.x -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX; V.y -= e.shiftKey && !e.deltaX ? 0 : e.deltaY; applyView(); }
  clearTimeout(saveT); saveT = setTimeout(save, 400);
}, { passive: false });
zoomBtn.onclick = () => zoomAt(innerWidth / 2, innerHeight / 2, 1 / V.s);

// Rasterise the cork once so panning and zooming stay smooth.
const corkImg = new Image();
corkImg.onload = () => {
  const c = document.createElement('canvas'); c.width = c.height = TILE * 2;
  c.getContext('2d').drawImage(corkImg, 0, 0, c.width, c.height);
  c.toBlob((b) => { vp.style.backgroundImage = `url(${URL.createObjectURL(b)})`; });
};
corkImg.src = corkUrl;

/* ---------- markdown ---------- */
marked.use({ gfm: true, breaks: true });
marked.use(markedKatex({ throwOnError: false, nonStandard: true, output: 'html', strict: 'ignore' }));
function md(t) {
  let h = marked.parse(t.replace(/==([^=\n]+)==/g, '<mark>$1</mark>').replace(/\[\[([^\]\n]+)\]\]/g, '<a class="wikilink">$1</a>'));
  h = h.replace(/<blockquote>\s*<p>\[!(\w+)\][+-]?[ \t]*([^\n<]*)/g, (m, k, title) =>
    `<blockquote class="callout callout-${k.toLowerCase()}"><p><span class="callout-title">${title || k}</span>`);
  h = h.replace(/<li>(\s*(?:<p>)?<input )/g, '<li class="task">$1');
  return DOMPurify.sanitize(h);
}
function codeHtml(it) {
  const t = it.text;
  if (it.lang && hljs.getLanguage(it.lang)) return hljs.highlight(t, { language: it.lang }).value;
  return t.length < 20000 ? hljs.highlightAuto(t).value : esc(t);
}

/* ---------- paper edges ---------- */
function rnd(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function clip(it) {
  const A = { scrap: [5, 5, 6, 5], pdf: [0, 0, 0, 7], code: [3.5, 0, 3.5, 0], sticky: 'w', mini: 'w' }[it.type];
  if (!A) return '';
  const r = rnd(it.seed), N = A === 'w' ? 16 : 30, pts = [];
  const off = (side, i) => (A === 'w'
    ? (side === 1 || side === 2 ? 1.6 + 1.6 * Math.sin((i / N) * 9 + it.seed) : 0)
    : r() * A[side]).toFixed(1);
  for (let s = 0; s < 4; s++) for (let i = 0; i < N; i++) {
    const p = ((i / N) * 100).toFixed(1), q = (100 - (i / N) * 100).toFixed(1), o = off(s, i);
    pts.push([`${p}% ${o}px`, `calc(100% - ${o}px) ${p}%`, `${q}% calc(100% - ${o}px)`, `${o}px ${q}%`][s]);
  }
  return `polygon(${pts.join(',')})`;
}

/* ---------- rendering ---------- */
function place(el, it, sway = 0) {
  el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; el.style.width = it.w + 'px';
  el.style.zIndex = it.z; el.style.transform = `rotate(${it.rot + sway}deg)`;
}
function renderItem(it) {
  let el = els.get(it.id);
  if (!el) { el = document.createElement('div'); el.dataset.id = it.id; itemsEl.append(el); els.set(it.id, el); }
  el.className = `item ${it.type}` + (sel === it.id ? ' selected' : '');
  place(el, it);
  el.style.setProperty('--w', it.w + 'px'); el.style.setProperty('--fs', (it.fs || 15) + 'px');
  if (it.c) el.style.setProperty('--c', it.c);
  let inner;
  if (it.asset) inner = `<img draggable="false" src="${assetSrc(it.asset)}" style="aspect-ratio:${1 / (it.ar || 1)}">`;
  else if (it.type === 'code') inner = it.text ? `<pre><code class="hljs">${codeHtml(it)}</code></pre>` : '<span class="empty">Double-click to paste code</span>';
  else inner = it.text.trim() ? md(it.text) : '<span class="empty">Double-click to write</span>';
  el.innerHTML = `<div class="paper" style="clip-path:${clip(it)}"><div class="content md f-${it.font || 'sans'}">${inner}</div></div>`
    + it.f.map((f) => f.k === 'pin'
      ? `<div class="pin" data-f="${f.id}" style="left:${f.x * 100}%;top:${f.y * 100}%;--c:${PINS[f.c]}"></div>`
      : `<div class="tape" data-f="${f.id}" style="left:${f.x * 100}%;top:${f.y * 100}%;--c:${TAPES[f.c]};--r:${f.r}deg;--l:${f.l || 88}px"><i class="tend" data-end="-1"></i><i class="tend" data-end="1"></i></div>`).join('')
    + '<div class="handle resize" title="Resize"></div><div class="handle rotate" title="Rotate"></div>';
  if (it.type !== 'code') el.querySelectorAll('pre code').forEach((c) => hljs.highlightElement(c));
  return el;
}
function refresh(it) { renderItem(it); drawYarn(); positionBar(); }
function renderAll() {
  itemsEl.replaceChildren(); els.clear();
  S.items.forEach(renderItem);
  zTop = Math.max(1, ...S.items.map((i) => i.z || 1));
  drawYarn(); buildBar();
}

/* ---------- yarn ---------- */
function pinPos(ref) {
  const p = els.get(ref[0])?.querySelector(`[data-f="${ref[1]}"]`);
  if (!p) return null;
  const r = p.getBoundingClientRect();
  return toWorld(r.left + r.width / 2, r.top + r.height / 2);
}
const maxSag = (d) => clamp(d * 0.38, 24, 190);
function yarnGeo(a, b, sl = 0.45) {
  const max = maxSag(Math.hypot(b[0] - a[0], b[1] - a[1])), sag = sl * max, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  return { d: `M${a[0]},${a[1]} Q${mx},${my + sag} ${b[0]},${b[1]}`, mid: [mx, my + sag / 2], sag, max };
}
const yarnD = (a, b, sl) => yarnGeo(a, b, sl).d;
function drawYarn() {
  let h = '';
  S.yarns = S.yarns.filter((y) => {
    const a = pinPos(y.a), b = pinPos(y.b);
    if (!a || !b) return false;
    const g = yarnGeo(a, b, y.sl), d = g.d, on = selYarn === y.id;
    h += `<g data-y="${y.id}" class="${on ? 'sel' : ''}" style="--c:${y.c}"><path class="yh" d="${d}"/><path class="ys" d="${d}"/><path class="yt" d="${d}"/>${
      on ? `<circle class="yk" cx="${g.mid[0]}" cy="${g.mid[1]}" r="${7 / V.s}" stroke-width="${2 / V.s}"/>` : ''}</g>`;
    return true;
  });
  if (tempYarn?.[0]) { const d = yarnD(...tempYarn); h += `<g style="--c:${YARNS[0]}"><path class="ys" d="${d}"/><path class="yt" d="${d}"/></g>`; }
  yarnEl.innerHTML = h;
}

/* ---------- selection + item bar ---------- */
function select(id) {
  els.get(sel)?.classList.remove('selected');
  sel = id; selYarn = null;
  els.get(id)?.classList.add('selected');
  buildBar(); drawYarn();
}
function buildBar() {
  const it = byId(sel), y = S.yarns.find((y) => y.id === selYarn);
  if ((!it && !y) || editing) { bar.hidden = true; return; }
  let h = '';
  const sw = (list, act) => list.map((c) => `<button class="swatch" data-act="${act}" data-v="${c}" style="--c:${c}" title="Colour"></button>`).join('');
  if (y) h += sw(YARNS, 'ycol');
  else {
    if (TEXT.includes(it.type)) {
      h += Object.entries(FONTS).map(([k, n]) => `<button data-act="font" data-v="${k}" class="f-${k}${it.font === k ? ' on' : ''}">${n}</button>`).join('');
      h += '<i class="sep"></i><button data-act="fs" data-v="0.88" title="Smaller text">A−</button><button data-act="fs" data-v="1.14" title="Bigger text">A+</button><i class="sep"></i>';
    }
    if (isSticky(it)) h += sw(STICKY, 'col') + '<i class="sep"></i>';
    if (it.type === 'card') h += sw(CARD, 'col') + '<i class="sep"></i>';
    h += '<button data-act="pin">+ Pin</button><button data-act="tape">+ Tape</button><button data-act="dup">Copy</button>';
  }
  bar.innerHTML = h + '<i class="sep"></i><button data-act="del">Remove</button>';
  bar.hidden = false; positionBar();
}
function positionBar() {
  if (bar.hidden) return;
  const el = sel ? els.get(sel) : yarnEl.querySelector('g.sel');
  if (!el) return;
  const r = el.getBoundingClientRect(), half = bar.offsetWidth / 2 + 8;
  bar.style.left = clamp(r.left + r.width / 2, half, innerWidth - half) + 'px';
  bar.style.top = clamp(r.top - 54, 8, innerHeight - 140) + 'px';
}
function removeSel() {
  if (selYarn) S.yarns = S.yarns.filter((y) => y.id !== selYarn);
  else if (sel) { els.get(sel)?.remove(); els.delete(sel); S.items = S.items.filter((i) => i.id !== sel); }
  else return;
  sel = selYarn = null; buildBar(); drawYarn(); commit();
}
function duplicate() {
  const it = byId(sel); if (!it) return;
  const c = JSON.parse(JSON.stringify(it));
  Object.assign(c, { id: uid(), x: it.x + 28, y: it.y + 28, z: ++zTop, seed: (Math.random() * 1e9) | 0, rot: +(Math.random() * 6 - 3).toFixed(1) });
  c.f.forEach((f) => (f.id = uid()));
  S.items.push(c); renderItem(c).classList.add('landing'); select(c.id); commit();
}
bar.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const { act, v } = b.dataset, it = byId(sel);
  if (act === 'del') return removeSel();
  if (act === 'dup') return duplicate();
  if (act === 'ycol') { S.yarns.find((y) => y.id === selYarn).c = v; drawYarn(); return commit(); }
  if (act === 'font') it.font = v;
  if (act === 'fs') it.fs = clamp(+(it.fs * v).toFixed(1), 7, 90);
  if (act === 'col') it.c = v;
  const h = els.get(it.id).offsetHeight;
  if (act === 'pin') it.f.push({ id: uid(), k: 'pin', x: 0.15 + Math.random() * 0.7, y: Math.min(0.3, 14 / h), c: (Math.random() * PINS.length) | 0 });
  if (act === 'tape') it.f.push({ id: uid(), k: 'tape', x: 0.5, y: 2 / h, c: (Math.random() * TAPES.length) | 0, r: +(Math.random() * 12 - 6).toFixed(1) });
  refresh(it); if (act === 'tape') tapeSettle(it);
  buildBar(); commit();
});

/* ---------- adding things ---------- */
function addItem(type, props = {}, pos) {
  const c = pos || toWorld(innerWidth / 2 + (Math.random() - 0.5) * 160, innerHeight / 2 + (Math.random() - 0.5) * 120 - 120);
  const tilt = type === 'code' || type === 'pdf' ? 2 : 6;
  const it = {
    id: uid(), type, text: '', rot: +(Math.random() * tilt - tilt / 2).toFixed(1), seed: (Math.random() * 1e9) | 0, z: ++zTop,
    ...DEF[type], ...props, f: type === 'sticky' || type === 'mini' ? [] : [{ id: uid(), k: 'pin', x: 0.5, y: 0.05, c: (Math.random() * PINS.length) | 0 }],
  };
  it.x = c[0] - it.w / 2; it.y = c[1] - 30;
  S.items.push(it);
  const el = renderItem(it);
  if (it.f[0]) it.f[0].y = Math.min(0.25, 14 / el.offsetHeight);
  renderItem(it); el.classList.add('landing');
  select(it.id); commit();
  return it;
}
function loadImage(src) {
  return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
}
function putAsset(canvas) {
  const id = uid(); assets[id] = canvas.toDataURL('image/jpeg', 0.88); assetsDirty = true;
  vault?.asset(id, assets[id]);
  return { asset: id, ar: canvas.height / canvas.width };
}
async function addPhoto(file, pos) {
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImage(url), k = Math.min(1, 1800 / Math.max(im.width, im.height));
    const c = document.createElement('canvas'); c.width = im.width * k; c.height = im.height * k;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
    addItem('photo', { ...putAsset(c), w: im.width >= im.height ? 320 : 250 }, pos);
  } finally { URL.revokeObjectURL(url); }
}
async function handleFiles(files, pos) {
  let i = 0;
  for (const f of files) {
    const p = pos && [pos[0] + i * 36, pos[1] + i * 36]; i++;
    if (f.type.startsWith('image/')) await addPhoto(f, p);
    else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) await pdfPicker(f, p);
    else {
      const t = (await f.text()).replace(/\s+$/, ''), ext = (f.name.match(/\.(\w+)$/) || [])[1]?.toLowerCase();
      if (!ext || ['md', 'markdown', 'txt'].includes(ext)) addItem('scrap', { text: t, font: ext === 'txt' ? 'plain' : 'sans' }, p);
      else addItem('code', { text: t, lang: ext }, p);
    }
  }
}

/* ---------- PDF: tear pages out ---------- */
async function pdfPicker(file, pos) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const picked = new Set();
  modal.innerHTML = `<div class="sheet"><header>Tear pages out of ${esc(file.name)}<small>${doc.numPages} pages · click the ones you want on the board</small></header>
    <div class="pages"></div><footer><button data-x>Cancel</button><button class="go" disabled>Tear out</button></footer></div>`;
  modal.hidden = false;
  const grid = modal.querySelector('.pages'), go = modal.querySelector('.go');
  const draw = async (n, width) => {
    const page = await doc.getPage(n), vw = page.getViewport({ scale: 1 }), viewport = page.getViewport({ scale: width / vw.width });
    const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport, canvas }).promise;
    return canvas;
  };
  grid.onclick = (e) => {
    const pg = e.target.closest('.pg'); if (!pg) return;
    const n = +pg.dataset.n; picked.has(n) ? picked.delete(n) : picked.add(n);
    pg.classList.toggle('on'); go.disabled = !picked.size;
    go.textContent = picked.size ? `Tear out ${picked.size} page${picked.size > 1 ? 's' : ''}` : 'Tear out';
  };
  const close = () => { modal.hidden = true; modal.innerHTML = ''; };
  modal.querySelector('[data-x]').onclick = close;
  go.onclick = async () => {
    go.disabled = true; go.textContent = 'Tearing…';
    let i = 0;
    for (const n of [...picked].sort((a, b) => a - b)) {
      const base = pos || toWorld(innerWidth / 2, innerHeight / 2 - 200);
      addItem('pdf', putAsset(await draw(n, 1100)), [base[0] + i * 60, base[1] + i * 30]); i++;
    }
    close();
  };
  for (let n = 1; n <= doc.numPages && !modal.hidden; n++) {
    const pg = document.createElement('div'); pg.className = 'pg'; pg.dataset.n = n;
    grid.append(pg);
    const c = await draw(n, 300);
    pg.style.aspectRatio = c.width / c.height; pg.append(c);
    pg.insertAdjacentHTML('beforeend', `<span>${n}</span>`);
  }
}

/* ---------- dock ---------- */
dock.innerHTML = [
  ['sticky', 'Sticky'], ['mini', 'Mini'], ['card', 'Title card'], ['scrap', 'Paper'], ['code', 'Code reel'], 0,
  ['photo', 'Photo'], ['pdf', 'PDF pages'], ['file', 'From file'], 0, ['yarn', 'Yarn'],
].map((b) => (b ? `<button data-add="${b[0]}"><i class="sw sw-${b[0]}"></i>${b[1]}</button>` : '<i class="sep"></i>')).join('');
function setTool(t) {
  tool = t; document.body.classList.toggle('yarning', t === 'yarn');
  dock.querySelector('[data-add=yarn]').classList.toggle('on', t === 'yarn');
  if (t) select(null);
}
dock.addEventListener('click', (e) => {
  const k = e.target.closest('button')?.dataset.add; if (!k) return;
  if (k === 'yarn') return setTool(tool ? null : 'yarn');
  setTool(null);
  if (k === 'photo' || k === 'pdf' || k === 'file') {
    fileIn.accept = { photo: 'image/*', pdf: '.pdf,application/pdf', file: '' }[k]; fileIn.value = ''; fileIn.click();
  } else edit(addItem(k));
});
fileIn.onchange = () => handleFiles([...fileIn.files]);

/* ---------- editing ---------- */
function edit(it) {
  if (!TEXT.includes(it.type)) return;
  const el = els.get(it.id), c = el.querySelector('.content'), ta = document.createElement('textarea');
  ta.value = it.text; ta.spellcheck = false;
  ta.placeholder = it.type === 'code' ? 'Paste code…' : 'Write… (Markdown works)';
  c.replaceChildren(ta); editing = it.id; bar.hidden = true;
  const fit = () => { ta.style.height = '0'; ta.style.height = Math.max(ta.scrollHeight, 28) + 'px'; drawYarn(); };
  fit(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.oninput = fit;
  ta.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') ta.blur();
    if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); }
  };
  ta.onblur = () => { it.text = ta.value; editing = null; refresh(it); buildBar(); commit(); };
}
vp.addEventListener('dblclick', (e) => {
  const el = e.target.closest('.item');
  if (el && !e.target.closest('.pin,.tape,.handle,textarea')) edit(byId(el.dataset.id));
});
vp.addEventListener('click', (e) => {
  const a = e.target.closest('a'); if (!a) return;
  e.preventDefault();
  if (/^https?:/.test(a.getAttribute('href') || '')) window.open(a.href, '_blank', 'noopener');
});

/* ---------- pointer interactions ---------- */
function drag(e, onMove, onEnd) {
  const up = (ev) => {
    removeEventListener('pointermove', onMove); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    onEnd?.(ev);
  };
  addEventListener('pointermove', onMove); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
function center(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }

/* Pinless stickies cling to the page, PDF or code reel directly beneath them. */
function contains(it, px, py) {
  const el = els.get(it.id), hw = it.w / 2, hh = el.offsetHeight / 2, a = (-it.rot * Math.PI) / 180;
  const dx = px - it.x - hw, dy = py - it.y - hh;
  return Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) <= hw && Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) <= hh;
}
function quad(it) { // the paper's four corners on the board
  const hw = it.w / 2, hh = els.get(it.id).offsetHeight / 2, cx = it.x + hw, cy = it.y + hh;
  const a = (it.rot * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [cx + x * co - y * si, cy + x * si + y * co]);
}
function polyArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i][0] * q[1] - q[0] * p[i][1]; }
  return Math.abs(s) / 2;
}
function overlap(qa, qb) { // shared area of two papers (Sutherland–Hodgman clipping)
  let out = qa;
  for (let i = 0; i < qb.length && out.length; i++) {
    const A = qb[i], B = qb[(i + 1) % qb.length], ex = B[0] - A[0], ey = B[1] - A[1], inp = out;
    const inside = (p) => ex * (p[1] - A[1]) - ey * (p[0] - A[0]) >= 0;
    out = [];
    for (let j = 0; j < inp.length; j++) {
      const P = inp[j], Q = inp[(j + 1) % inp.length], pi = inside(P);
      if (pi) out.push(P);
      if (pi !== inside(Q)) {
        const dx = Q[0] - P[0], dy = Q[1] - P[1], t = ((A[0] - P[0]) * ey - (A[1] - P[1]) * ex) / (dx * ey - dy * ex);
        out.push([P[0] + t * dx, P[1] + t * dy]);
      }
    }
  }
  return out.length > 2 ? polyArea(out) : 0;
}
/* Tape joins its paper to whatever paper it reaches onto. */
function tapeLinks() {
  const links = [];
  for (const a of S.items) {
    const tapes = a.f.filter((f) => f.k === 'tape');
    if (!tapes.length) continue;
    const W = a.w, H = els.get(a.id).offsetHeight, cx = a.x + W / 2, cy = a.y + H / 2;
    const ar = (a.rot * Math.PI) / 180, co = Math.cos(ar), si = Math.sin(ar), qa = quad(a);
    for (const f of tapes) {
      const r = ((f.r || 0) * Math.PI) / 180, l = f.l || 88, ux = Math.cos(r), uy = Math.sin(r), hit = new Set();
      for (const t of [-0.46, -0.23, 0, 0.23, 0.46]) for (const n of [-8, 8]) {
        const lx = (f.x - 0.5) * W + t * l * ux - n * uy, ly = (f.y - 0.5) * H + t * l * uy + n * ux;
        const px = cx + lx * co - ly * si, py = cy + lx * si + ly * co;
        if (contains(a, px, py)) continue; // this bit of tape is on its own paper
        let below = null, beside = null;
        for (const b of S.items) {
          if (b === a || !contains(b, px, py)) continue;
          if (b.z < a.z) { if (!below || b.z > below.z) below = b; }
          else if (!overlap(qa, quad(b)) && (!beside || b.z > beside.z)) beside = b;
        }
        if (beside || below) hit.add(beside || below);
      }
      for (const b of hit) links.push([a, b]);
    }
  }
  return links;
}
/* A pinless, untaped sticky clings to the page it overlaps most (at least a fifth of the sticky). */
function stickyHome(s) {
  const qs = quad(s), need = polyArea(qs) * 0.2, px = s.x + s.w / 2, py = s.y + els.get(s.id).offsetHeight / 2;
  let best = null, bestA = 0;
  for (const p of S.items) {
    if (!STICKS_TO.includes(p.type) || p.z > s.z) continue;
    const a = overlap(qs, quad(p));
    if (a < need || a < bestA || (a === bestA && best && best.z > p.z)) continue;
    const blocked = S.items.some((o) => o.z > p.z && o.z < s.z && !STICKS_TO.includes(o.type)
      && !(isSticky(o) && !hasPin(o)) && contains(o, px, py));
    if (!blocked) { best = p; bestA = a; }
  }
  return best;
}
function stickyHomes(links) {
  const taped = new Set(links.flat()), homes = new Map();
  for (const s of S.items) if (isSticky(s) && !hasPin(s) && !taped.has(s)) { const h = stickyHome(s); if (h) homes.set(s, h); }
  return homes;
}
function group(it) { // everything that travels with this paper
  const links = tapeLinks(), homes = stickyHomes(links), set = new Set([it]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [a, b] of links) if (set.has(a) !== set.has(b)) { set.add(a); set.add(b); grew = true; }
    for (const [s, h] of homes) if (set.has(h) && !set.has(s)) { set.add(s); grew = true; }
  }
  set.delete(it);
  return [...set];
}
function raise(items) { // bring to the front, keeping their order among themselves
  for (const i of [...items].sort((a, b) => a.z - b.z)) { i.z = ++zTop; els.get(i.id).style.zIndex = i.z; }
}
function tapeSettle(it) { // tape reaching onto a neighbouring paper has to lie on top of it
  const links = tapeLinks();
  if (!links.some(([a, b]) => a === it && b.z > it.z)) return;
  raise([it, ...[...stickyHomes(links)].filter(([, h]) => h === it).map(([s]) => s)]);
}
function carryStart(it, el) {
  const cx = it.x + it.w / 2, cy = it.y + el.offsetHeight / 2, mates = group(it);
  const list = mates.map((s) => {
    const sEl = els.get(s.id), hh = sEl.offsetHeight / 2;
    return { s, el: sEl, hh, ox: s.x + s.w / 2 - cx, oy: s.y + hh - cy, r0: s.rot, pr0: it.rot };
  });
  raise([it, ...mates]);
  return list;
}
function carryMove(list, it, el, sway = 0) {
  const cx = it.x + it.w / 2, cy = it.y + el.offsetHeight / 2;
  for (const c of list) {
    const put = (deg) => {
      const a = (deg * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
      return [cx + c.ox * co - c.oy * si - c.s.w / 2, cy + c.ox * si + c.oy * co - c.hh];
    };
    const d = it.rot - c.pr0;
    [c.s.x, c.s.y] = put(d); c.s.rot = +(c.r0 + d).toFixed(1);
    const [vx, vy] = put(d + sway);
    c.el.style.left = vx + 'px'; c.el.style.top = vy + 'px'; c.el.style.transform = `rotate(${c.s.rot + sway}deg)`;
  }
}

function dragItem(e, it, el, carried) {
  let moved = false, active = true, vx = 0, sway = 0, sv = 0, px = e.clientX, py = e.clientY;
  const sx = px, sy = py;
  const tick = () => {
    const target = active ? clamp(vx * 0.9, -9, 9) : 0;
    sv = (sv + (target - sway) * 0.14) * 0.8; sway += sv; vx *= 0.8;
    const done = !active && Math.abs(sway) < 0.05 && Math.abs(sv) < 0.05;
    place(el, it, done ? 0 : sway); carryMove(carried, it, el, done ? 0 : sway); drawYarn(); positionBar();
    if (!done) requestAnimationFrame(tick);
  };
  drag(e, (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
    if (!moved) { moved = true; el.classList.add('lifted'); carried.forEach((c) => c.el.classList.add('lifted')); requestAnimationFrame(tick); }
    const dx = ev.clientX - px, dy = ev.clientY - py; px = ev.clientX; py = ev.clientY;
    it.x += dx / V.s; it.y += dy / V.s; vx += dx * 0.22;
  }, () => {
    active = false; el.classList.remove('lifted'); carried.forEach((c) => c.el.classList.remove('lifted'));
    carryMove(carried, it, el, 0);
    if (moved) { commit(); setTimeout(drawYarn, 260); }
  });
}
function resizeItem(e, it, el) {
  const a = (it.rot * Math.PI) / 180, w0 = it.w, sx = e.clientX, sy = e.clientY, fs0 = it.fs;
  drag(e, (ev) => {
    const d = ((ev.clientX - sx) * Math.cos(a) + (ev.clientY - sy) * Math.sin(a)) / V.s;
    it.w = clamp(w0 + d, 70, 2400);
    if (it.type === 'mini' || it.type === 'sticky') it.fs = +(fs0 * (it.w / w0)).toFixed(1);
    place(el, it); el.style.setProperty('--w', it.w + 'px'); el.style.setProperty('--fs', it.fs + 'px');
    drawYarn(); positionBar();
  }, commit);
}
function rotateItem(e, it, el, carried) {
  const [cx, cy] = center(el), ang = (ev) => (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI;
  const a0 = ang(e), r0 = it.rot;
  drag(e, (ev) => { it.rot = +(r0 + ang(ev) - a0).toFixed(1); if (Math.abs(it.rot) < 1.2) it.rot = 0; place(el, it); carryMove(carried, it, el); drawYarn(); positionBar(); }, commit);
}
function toLocal(it, el, cx, cy) { // pointer → px from the paper's centre, in the paper's own frame
  const [mx, my] = center(el), a = (-it.rot * Math.PI) / 180, wx = (cx - mx) / V.s, wy = (cy - my) / V.s;
  return [wx * Math.cos(a) - wy * Math.sin(a), wx * Math.sin(a) + wy * Math.cos(a)];
}
function dragFastener(e, it, el, fEl) {
  const f = it.f.find((f) => f.id === fEl.dataset.f), sx = e.clientX, sy = e.clientY;
  const end = +(e.target.closest?.('.tend')?.dataset.end || 0); // pulling a tape end stretches and turns it
  const W = el.offsetWidth, H = el.offsetHeight, l0 = f.l || 88, r0 = ((f.r || 0) * Math.PI) / 180;
  const fixed = [(f.x - 0.5) * W - (end * l0 / 2) * Math.cos(r0), (f.y - 0.5) * H - (end * l0 / 2) * Math.sin(r0)];
  let moved = false;
  drag(e, (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
    moved = true;
    const [lx, ly] = toLocal(it, el, ev.clientX, ev.clientY);
    if (end) {
      const dx = (lx - fixed[0]) * end, dy = (ly - fixed[1]) * end, len = clamp(Math.hypot(dx, dy), 36, 800), ang = Math.atan2(dy, dx);
      f.l = Math.round(len); f.r = +((ang * 180) / Math.PI).toFixed(1);
      f.x = (fixed[0] + (end * len / 2) * Math.cos(ang)) / W + 0.5; f.y = (fixed[1] + (end * len / 2) * Math.sin(ang)) / H + 0.5;
      fEl.style.setProperty('--l', f.l + 'px'); fEl.style.setProperty('--r', f.r + 'deg');
    } else {
      const m = f.k === 'tape' ? 0.12 : 0.04;
      f.x = clamp(lx / W + 0.5, -m, 1 + m); f.y = clamp(ly / H + 0.5, -m, 1 + m);
    }
    fEl.style.left = f.x * 100 + '%'; fEl.style.top = f.y * 100 + '%'; drawYarn();
  }, () => {
    if (!moved) { f.c = (f.c + 1) % (f.k === 'pin' ? PINS : TAPES).length; refresh(it); }
    else if (f.k === 'tape') tapeSettle(it);
    commit();
  });
}
function dragYarn(e, y) { // pull the thread down to slacken it, up to pull it taut
  const a = pinPos(y.a), b = pinPos(y.b); if (!a || !b) return;
  const g = yarnGeo(a, b, y.sl), sy = e.clientY;
  let moved = false;
  drag(e, (ev) => {
    if (!moved && Math.abs(ev.clientY - sy) < 4) return;
    moved = true;
    y.sl = +(clamp(g.sag + ((ev.clientY - sy) / V.s) * 2, 0, g.max) / g.max).toFixed(3);
    drawYarn(); positionBar();
  }, () => { if (moved) commit(); });
}
function startYarn(e, it, fEl) {
  const a = [it.id, fEl.dataset.f];
  drag(e, (ev) => { tempYarn = [pinPos(a), toWorld(ev.clientX, ev.clientY)]; drawYarn(); }, (ev) => {
    tempYarn = null;
    const p = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.pin'), tid = p?.closest('.item').dataset.id;
    if (p && !(tid === a[0] && p.dataset.f === a[1])) { S.yarns.push({ id: uid(), a, b: [tid, p.dataset.f], c: YARNS[0] }); commit(); }
    drawYarn();
  });
}

vp.addEventListener('pointerdown', (e) => {
  if (e.target.closest('textarea') || e.button === 2) return;
  const itEl = e.target.closest('.item'), yEl = e.target.closest('[data-y]');
  let fEl = e.target.closest('.pin,.tape');
  const cls = e.target.className;
  if (editing) document.activeElement?.blur();
  if (fEl && !fEl.isConnected) fEl = null;
  const it = itEl && byId(itEl.dataset.id);
  if (e.button === 1 || (!it && !yEl)) {
    e.preventDefault(); select(null); vp.classList.add('panning');
    let px = e.clientX, py = e.clientY;
    drag(e, (ev) => { V.x += ev.clientX - px; V.y += ev.clientY - py; px = ev.clientX; py = ev.clientY; applyView(); },
      () => { vp.classList.remove('panning'); save(); });
    return;
  }
  if (yEl) {
    select(null); selYarn = yEl.dataset.y; drawYarn(); buildBar();
    dragYarn(e, S.yarns.find((y) => y.id === selYarn));
    return;
  }
  if (tool === 'yarn') { if (fEl?.matches('.pin')) startYarn(e, it, fEl); return; }
  if (fEl) return dragFastener(e, it, itEl, fEl);
  const carried = carryStart(it, itEl);
  select(it.id);
  if (/\bresize\b/.test(cls)) return resizeItem(e, it, itEl);
  if (/\brotate\b/.test(cls)) return rotateItem(e, it, itEl, carried);
  dragItem(e, it, itEl, carried);
});
vp.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const fEl = e.target.closest('.pin,.tape'); if (!fEl) return;
  const it = byId(fEl.closest('.item').dataset.id);
  it.f = it.f.filter((f) => f.id !== fEl.dataset.f);
  refresh(it); commit();
});

/* ---------- keyboard, paste, drop ---------- */
addEventListener('keydown', (e) => {
  if (editing || e.target.matches?.('textarea,input')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape') { if (!modal.hidden) modal.querySelector('[data-x]')?.click(); setTool(null); select(null); }
  else if (e.key === 'Delete' || e.key === 'Backspace') removeSel();
  else if (mod && e.key === 'z') { e.preventDefault(); undo(); }
  else if (mod && e.key === 'd') { e.preventDefault(); duplicate(); }
  else if (mod && e.key === '0') zoomBtn.click();
});
let midAt = 0;
for (const ev of ['mousedown', 'mouseup', 'auxclick']) {
  addEventListener(ev, (e) => { if (e.button === 1) { midAt = Date.now(); e.preventDefault(); } }, true);
}
addEventListener('paste', (e) => {
  if (Date.now() - midAt < 600) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
addEventListener('paste', (e) => {
  if (editing) return;
  const files = [...e.clipboardData.files];
  if (files.length) { e.preventDefault(); return handleFiles(files); }
  const t = e.clipboardData.getData('text/plain').trim();
  if (t) addItem(t.length > 240 || t.split('\n').length > 6 ? 'scrap' : 'sticky', { text: t });
});
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault();
  const pos = toWorld(e.clientX, e.clientY), files = [...e.dataTransfer.files];
  if (files.length) return handleFiles(files, pos);
  const t = e.dataTransfer.getData('text/plain').trim();
  if (t) addItem(t.length > 240 ? 'scrap' : 'sticky', { text: t }, pos);
});
addEventListener('resize', positionBar);

/* ---------- boot ---------- */
function welcome() {
  const cx = innerWidth / 2, cy = innerHeight / 2;
  addItem('card', { text: '# My Corkboard\nPin anything. Move everything.' }, toWorld(cx, cy - 300));
  addItem('sticky', { text: 'Double-click me to write.\n\nStick me on a page and I travel with it.' }, toWorld(cx - 330, cy - 120));
  addItem('scrap', { text: '## Things to try\n- [x] Paste a screenshot (Ctrl+V)\n- [ ] Drop a PDF and tear out a page\n- [ ] Drop a `.md` or code file\n- [ ] Pick **Yarn**, then drag from pin to pin\n\n> [!tip] Pins\n> Click a pin to change its colour, drag to move it, right-click to pull it out.\n\nNotes understand ==Markdown==, like [[Obsidian]].' }, toWorld(cx + 20, cy - 110));
  addItem('code', { lang: 'js', w: 380, text: 'function pin(thing, board) {\n  board.push({ ...thing, tilt: Math.random() * 6 - 3 });\n  return board;\n}' }, toWorld(cx + 420, cy - 60));
  addItem('mini', { text: 'tiny!' }, toWorld(cx - 380, cy + 170));
  select(null);
}
(async () => {
  let b, a, migrated = false;
  if (vault) {
    const r = await vault.load(); vaultUrl = r.url;
    if (r.note) toast(r.note);
    if (r.json) b = JSON.parse(r.json);
  }
  if (!b) {
    [b, a] = await Promise.all([get('board'), get('assets')]).catch(() => []);
    if (vault && b?.S?.items?.length) { // move a board made before the vault existed
      for (const [id, d] of Object.entries(a || {})) await vault.asset(id, d);
      migrated = true;
    }
  }
  await document.fonts.ready;
  assets = a || {};
  if (b?.S?.items?.length) { S = b.S; V = b.V || V; applyView(); renderAll(); hist.push(JSON.stringify(S)); if (migrated) save(); }
  else { applyView(); welcome(); }
})();
