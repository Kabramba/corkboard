// Desktop-only chrome: the board switcher and the settings sheet.
const desk = window.desk;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export let settings = { wheelZoom: false };
let APP = null, flush = () => {}, toast = () => {}, chip, panel, modal;

function apply(st) {
  if (!st) return;
  if (st.error) toast(st.error);
  if (!st.boards) return;
  APP = st; settings = st.settings;
  const cur = st.boards.find((b) => b.path === st.current);
  chip.textContent = cur ? cur.name : 'Corkboard';
  document.title = `${chip.textContent} · Corkboard`;
  if (!panel.hidden) drawPanel();
}
function drawPanel() {
  panel.innerHTML = '<h4>Boards</h4>' + APP.boards.map((b) => `
    <div class="brow${b.path === APP.current ? ' cur' : ''}${b.missing ? ' missing' : ''}" data-p="${esc(b.path)}" title="${esc(b.path)}">
      <div><b>${esc(b.name)}</b><small>${b.missing ? 'Folder not found · ' : ''}${esc(b.path)}</small></div>
      <span><button data-b="reveal">Folder</button><button data-b="rename">Rename</button><button data-b="forget">Remove</button></span>
    </div>`).join('')
    + '<footer><button data-b="new">+ New board</button><button data-b="open">Open folder…</button><button data-b="settings">Settings</button></footer>';
}
function showPanel(on) { panel.hidden = !on; if (on) drawPanel(); }

function ask(title, value = '', ok = 'OK') {
  return new Promise((res) => {
    modal.innerHTML = `<form class="sheet small"><header>${esc(title)}</header><div class="body"><input id="askin" maxlength="80" value="${esc(value)}"></div>
      <footer><button type="button" data-x>Cancel</button><button class="go">${esc(ok)}</button></footer></form>`;
    modal.hidden = false;
    const inp = $('#askin'), done = (v) => { modal.hidden = true; modal.innerHTML = ''; res(v); };
    inp.focus(); inp.select();
    inp.onkeydown = (e) => { if (e.key === 'Escape') done(null); };
    modal.querySelector('form').onsubmit = (e) => { e.preventDefault(); done(inp.value.trim() || null); };
    modal.querySelector('[data-x]').onclick = () => done(null);
  });
}
function openSettings() {
  showPanel(false);
  const opt = (k, title, sub) => `<label class="opt"><input type="checkbox" data-k="${k}"${settings[k] ? ' checked' : ''}><span><b>${title}</b><small>${sub}</small></span></label>`;
  modal.innerHTML = `<div class="sheet small"><header>Settings</header><div class="body">
    ${opt('tray', 'Keep running in the system tray', 'Closing the window leaves Corkboard waiting in the tray, ready to reopen. The board itself is unloaded while it waits.')}
    ${opt('autostart', 'Start when I log in', 'Opens Corkboard automatically (straight to the tray, if the option above is on).')}
    ${opt('wheelZoom', 'Scroll wheel zooms', 'Off: scrolling moves the board and Ctrl + scroll zooms.')}
    ${opt('lowMemory', 'Use less memory', 'Draws the board without the graphics card. Roughly 120 MB lighter, but dragging and zooming can feel less smooth. Takes effect after a restart.')}
    <div class="opt"><span><b>New boards are created in</b><small id="rootp">${esc(settings.root)}</small></span><button data-root>Change…</button></div>
    <p class="about">Corkboard ${esc(APP.version)} · <a data-ext>Website and source code</a></p>
    </div><footer><button data-restart hidden>Restart now</button><button class="go" data-x>Done</button></footer></div>`;
  modal.hidden = false;
  modal.querySelector('[data-x]').onclick = () => { modal.hidden = true; modal.innerHTML = ''; };
  modal.querySelector('[data-root]').onclick = async () => { apply(await desk.call('chooseRoot')); const r = $('#rootp'); if (r) r.textContent = settings.root; };
  modal.querySelector('[data-ext]').onclick = () => desk.call('external', APP.repo);
  modal.querySelector('.body').onchange = async (e) => { const k = e.target.dataset.k; if (!k) return;
    apply(await desk.call('set', k, e.target.checked));
    if (k === 'lowMemory') modal.querySelector('[data-restart]').hidden = false;
  };
  modal.querySelector('[data-restart]').onclick = () => { flush(); desk.call('restart'); };
}

export async function initDesk(opts) {
  if (!desk) return;
  ({ flush, toast } = opts); modal = $('#modal');
  document.body.insertAdjacentHTML('beforeend', '<button id="chip" title="Switch board"></button><div id="boards" hidden></div>');
  chip = $('#chip'); panel = $('#boards');
  chip.onclick = () => showPanel(panel.hidden);
  addEventListener('pointerdown', (e) => { if (!panel.hidden && !e.target.closest('#boards,#chip')) showPanel(false); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') showPanel(false); });
  panel.onclick = async (e) => {
    const act = e.target.closest('button')?.dataset.b, row = e.target.closest('.brow'), dir = row?.dataset.p;
    if (!act) { if (dir && dir !== APP.current && !row.classList.contains('missing')) { flush(); desk.call('switch', dir); } return; }
    if (act === 'settings') return openSettings();
    if (act === 'reveal') return desk.call('reveal', dir);
    if (act === 'open') { flush(); return apply(await desk.call('open')); }
    if (act === 'new') { const name = await ask('Name the new board', '', 'Create'); if (name) { flush(); apply(await desk.call('new', name)); } return; }
    if (act === 'rename') {
      const name = await ask('Rename board', APP.boards.find((b) => b.path === dir).name, 'Rename');
      if (name) { flush(); apply(await desk.call('rename', dir, name)); }
      return;
    }
    if (act === 'forget') {
      const b = e.target;
      if (b.dataset.sure) { flush(); return apply(await desk.call('forget', dir)); }
      b.dataset.sure = 1; b.textContent = 'Sure? Files stay'; b.classList.add('warn');
    }
  };
  desk.onUi((what) => (what === 'settings' ? openSettings() : showPanel(true)));
  apply(await desk.call('state'));
}
