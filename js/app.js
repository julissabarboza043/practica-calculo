// Práctica de Cálculo: pantallas del estudiante y panel de la profesora.
import { api, IS_DEMO } from './api.js';
import { parseQuestions } from './parser.js';
import { esc, mathHTML, typeset, setMath } from './render.js';

const $ = (id) => document.getElementById(id);
const AVATARS = ['🦊', '🐸', '🐼', '🐙', '🦄', '🐯', '🐧', '🐢', '🐝', '🦖', '🐨', '🦉', '🐬', '🦁', '🐵', '🚀', '⚡', '🌵'];
const EMOJIS = ['📘', '🎯', '📈', '🧭', '⛰️', '📐', '🔺', '🌀', '🧮', '🔍', '⭐', '🧠', '∫', '∂', '∇', '🌊'];
const POINTS_OK = 10, PENALTY = 3;
const LETTERS = 'ABCDEF';

// ---------------- utilidades ----------------
const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* nada */ } },
};
const fmt = (s) => { s = Math.max(0, Math.round(s || 0)); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`; };
function shuffle(n) { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function show(id) { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id; window.scrollTo(0, 0); }
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }
function niceError(e) {
  const m = String(e?.message || e || '');
  if (/fetch|network|load failed/i.test(m)) return 'Sin conexión. Revise el internet e intente de nuevo.';
  if (/duplicate key|unique/i.test(m)) return m.includes('join_code') || m.includes('código') ? 'Ese código ya lo usa otro curso.' : 'Ya existe uno con ese nombre.';
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Could not find the function|does not exist/i.test(m)) return 'Falta preparar la base de datos: corra practica.sql en Supabase (vea la guía).';
  return m;
}
// Botón de dos toques (en vez de una ventana de confirmación).
function twoTap(btn, ask) {
  if (btn.dataset.armed && Date.now() - +btn.dataset.armed < 3000) { delete btn.dataset.armed; return true; }
  const orig = btn.dataset.label || btn.textContent;
  btn.dataset.label = orig; btn.dataset.armed = Date.now(); btn.textContent = ask;
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = orig; } }, 3000);
  return false;
}
function floatText(txt, color) {
  const f = document.createElement('div'); f.className = 'float'; f.textContent = txt; f.style.color = color;
  document.body.appendChild(f); setTimeout(() => f.remove(), 950);
}
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const mathEl = (tag, cls, text) => { const el = h(tag, { class: cls, html: mathHTML(text) }); typeset(el); return el; };

// ======================= ESTUDIANTE =======================
const ME_KEY = 'pr-yo', RUN_KEY = 'pr-partida';
let me = store.get(ME_KEY) || { player: null, name: '', avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)], code: '' };
let run = store.get(RUN_KEY);
const saveMe = () => store.set(ME_KEY, me);
const saveRun = () => store.set(RUN_KEY, run);
let busy = false, tick = 0;

// ---------- cuenta (la misma de la Racha) ----------
function renderStudentLogin(msg) {
  show('login');
  clearInterval(tick);
  if (IS_DEMO) $('login-help').innerHTML = 'Modo demo: cualquier correo y contraseña sirven.';
  $('login-err').textContent = msg || '';
  $('login-btn').disabled = false;
}
async function loginWith(fn) {
  const email = $('lg-email-s').value.trim();
  const pass = $('lg-pass-s').value;
  if (!email || !email.includes('@')) { $('login-err').textContent = 'Escriba su correo.'; $('lg-email-s').focus(); return; }
  if (pass.length < 6) { $('login-err').textContent = 'La contraseña debe tener al menos 6 caracteres.'; $('lg-pass-s').focus(); return; }
  $('login-btn').disabled = true; $('login-err').textContent = '';
  try {
    const r = await fn(email, pass);
    if (r?.needsConfirm) { $('login-err').textContent = 'Le enviamos un correo para confirmar la cuenta. Ábralo y luego vuelva aquí para entrar.'; $('login-btn').disabled = false; return; }
    await studentStart();
  } catch (e) {
    const m = niceError(e);
    $('login-err').textContent = /already registered/i.test(m) ? 'Ese correo ya tiene cuenta: escriba su contraseña y toque «Entrar».' : m;
    $('login-btn').disabled = false;
  }
}
$('login-form').onsubmit = (ev) => { ev.preventDefault(); loginWith((e, p) => api.signIn(e, p)); };
$('signup-btn').onclick = () => loginWith((e, p) => api.signUp(e, p));
document.querySelectorAll('.js-logout').forEach((b) => {
  b.onclick = async () => {
    try { await api.signOut(); } catch (e) { /* nada */ }
    me = { player: null, name: '', avatar: me.avatar, code: me.code }; saveMe();
    run = null; saveRun();
    renderStudentLogin();
  };
});

// Arranque del estudiante: ¿tiene sesión? ¿ya entró a un curso con esta cuenta?
async function studentStart() {
  let session = null;
  try { session = await api.session(); } catch (e) { /* sin sesión */ }
  if (!session) { renderStudentLogin(); return; }
  const account = session.user?.email || '';
  if (!me.player || me.account !== account) {
    let mp;
    try { mp = await api.myPlayer(); } catch (e) { renderStudentLogin(niceError(e)); return; }
    if (!mp.player) {
      me = { player: null, name: mp.suggested_name || '', avatar: me.avatar, code: me.code, account };
      saveMe(); renderJoin(); return;
    }
    me = { ...me, player: mp.player, name: mp.name, avatar: mp.avatar, code: mp.code, course: mp.course, account };
    saveMe();
  }
  if (run && run.player === me.player && !(run.finished && !run.pending)) renderPlay();
  else { run = null; saveRun(); renderTopics(); }
}

// ---------- entrada al curso ----------
function renderJoin(msg) {
  show('join');
  $('join-who').textContent = me.account ? `Cuenta: ${me.account}` : '';
  $('name-in').value = me.name || '';
  const urlCode = new URLSearchParams(location.search).get('c');
  $('code-in').value = urlCode || me.code || '';
  const box = $('avatars'); box.innerHTML = '';
  for (const a of AVATARS) {
    const b = h('button', { type: 'button', class: a === me.avatar ? 'on' : '', 'aria-label': 'Muñequito ' + a }, a);
    b.onclick = () => { me.avatar = a; [...box.children].forEach((c) => c.classList.toggle('on', c === b)); };
    box.appendChild(b);
  }
  $('join-err').textContent = msg || '';
}
$('join-form').onsubmit = async (ev) => {
  ev.preventDefault();
  const name = $('name-in').value.trim().replace(/\s+/g, ' ');
  const code = $('code-in').value.trim().toUpperCase();
  if (!name) { $('name-in').focus(); return; }
  if (!code) { $('code-in').focus(); return; }
  $('join-btn').disabled = true; $('join-err').textContent = '';
  try {
    const r = await api.join(code, name, me.avatar);
    me = { ...me, player: r.player, name: r.name, code: r.code, course: r.course };
    saveMe();
    renderTopics();
  } catch (e) { $('join-err').textContent = niceError(e); }
  $('join-btn').disabled = false;
};

// ---------- temas ----------
async function renderTopics() {
  show('topics');
  clearInterval(tick);
  $('t-av').textContent = me.avatar; $('t-name').textContent = me.name;
  $('t-course').textContent = me.course || '';
  $('t-email').textContent = me.account || '';
  $('t-err').textContent = '';
  const grid = $('topic-grid');
  if (!grid.children.length) grid.innerHTML = '<div class="sub">Cargando temas…</div>';
  let home;
  try { home = await api.home(me.player); } catch (e) {
    const m = niceError(e);
    if (/iniciar sesión/.test(m)) { me.player = null; saveMe(); renderStudentLogin(m); return; }
    if (/Vuelva a entrar/.test(m)) { me.player = null; saveMe(); renderJoin(m); return; }
    $('t-err').textContent = m; grid.innerHTML = ''; return;
  }
  me.course = home.course; saveMe();
  $('t-course').textContent = home.course;
  document.querySelectorAll('.js-max').forEach((el) => { el.textContent = home.max_questions; });
  grid.innerHTML = '';
  $('t-empty').hidden = home.topics.length > 0;
  for (const t of home.topics) {
    const n = Math.min(t.n, home.max_questions);
    const meta = t.plays ? `${n} preguntas · mejor: <b>${t.best} pts</b>` : `${n} preguntas · ¡nuevo!`;
    const btn = h('button', { type: 'button', class: 'topic', onclick: () => startGame(t) },
      h('span', { class: 'em' }, t.emoji), h('span', {}, h('div', { class: 'nm' }, t.name), h('div', { class: 'meta', html: meta })));
    const tro = h('button', { type: 'button', class: 'trophy', title: 'Ranking', 'aria-label': 'Ranking de ' + t.name, onclick: () => openRanking(t) }, '🏆');
    grid.appendChild(h('div', { class: 'topic-wrap' }, btn, tro));
  }
}
$('t-change').onclick = () => renderJoin();

async function openRanking(t) {
  $('rm-title').textContent = `🏆 ${t.emoji} ${t.name}`;
  $('rm-list').innerHTML = '<div class="sub">Cargando…</div>';
  $('rank-modal').hidden = false;
  try { renderRank($('rm-list'), await api.ranking(me.player, t.id)); } catch (e) { $('rm-list').innerHTML = `<div class="err">${esc(niceError(e))}</div>`; }
}
$('rm-close').onclick = () => { $('rank-modal').hidden = true; };
$('rank-modal').onclick = (e) => { if (e.target === $('rank-modal')) $('rank-modal').hidden = true; };

function renderRank(el, list) {
  el.innerHTML = '';
  if (!list.length) { el.appendChild(h('div', { class: 'sub center' }, 'Todavía nadie ha terminado este tema. ¡Sea la primera persona!')); return; }
  let prev = 0;
  for (const r of list) {
    if (r.pos > prev + 1) el.appendChild(h('div', { class: 'rk gap' }, '⋯'));
    prev = r.pos;
    el.appendChild(h('div', { class: 'rk' + (r.me ? ' me' : '') },
      h('span', { class: 'pos' }, r.pos), h('span', { class: 'av' }, r.avatar), h('span', { class: 'nm' }, r.name + (r.me ? ' (usted)' : '')),
      h('span', { class: 'sc' }, r.score), h('span', { class: 'tm' }, fmt(r.seconds))));
  }
}

// ---------- juego ----------
async function startGame(t) {
  if (busy) return;
  busy = true;
  try {
    const s = await api.start(me.player, t.id);
    run = {
      player: me.player, run: s.run, topic: s.topic, startedAt: Date.now(), idx: 0, twin: null, pending: null, marks: [],
      score: 0, n_ok: 0, n_bad: 0, finished: false, seconds: 0,
      questions: s.questions.map((q) => ({ ...q, perm: shuffle(q.options.length) })),
    };
    saveRun();
    busy = false;
    renderPlay();
  } catch (e) {
    busy = false;
    toast(niceError(e));
    $('t-err').textContent = niceError(e);
  }
}
const curQ = () => run.twin || run.questions[run.idx];

function renderPlay() {
  show('play');
  $('p-av').textContent = me.avatar; $('p-name').textContent = me.name;
  $('p-err').textContent = '';
  renderPath(); renderQuestion();
  if (run.pending) showFeedback(run.pending);
  clearInterval(tick); tick = setInterval(onTick, 1000); onTick();
}
function onTick() {
  if (!run) return;
  $('p-time').textContent = '⏱ ' + fmt(run.finished ? run.seconds : (Date.now() - run.startedAt) / 1000);
}
function renderHeader() {
  const N = run.questions.length;
  $('p-pts').textContent = '⭐ ' + run.score;
  $('p-level').textContent = run.idx >= N ? '¡Meta!' : `Pregunta ${Math.min(run.idx + 1, N)} de ${N}`;
  $('p-ok').textContent = `✓ ${run.n_ok}   ✕ ${run.n_bad}`;
}
function renderPath() {
  const path = $('path'); path.innerHTML = '';
  const N = run.questions.length;
  const done = run.finished && !run.pending;
  const at = done ? N : run.idx;
  for (let i = 0; i < N; i++) {
    if (i) path.appendChild(h('div', { class: 'seg' + (i <= at ? ' done' : '') }));
    const st = run.marks[i];
    const n = h('div', { class: 'node' + (i === at ? ' cur' : st ? ' ' + st : '') },
      i === at ? me.avatar : st === 'gold' ? '★' : st === 'silver' ? '✓' : st === 'miss' ? '✕' : String(i + 1));
    path.appendChild(n);
  }
  path.appendChild(h('div', { class: 'seg' + (done ? ' done' : '') }));
  path.appendChild(h('div', { class: 'node goal' + (done ? ' cur' : '') }, done ? me.avatar : '🏁'));
  requestAnimationFrame(() => { const c = path.querySelector('.cur'); if (c) path.scrollLeft = c.offsetLeft - path.clientWidth / 2 + 25; });
  renderHeader();
}
function renderQuestion() {
  const q = curQ();
  $('q-topic').textContent = `${run.topic.emoji} ${run.topic.name}`;
  $('q-twin').hidden = !run.twin;
  setMath($('q-text'), q.statement);
  const box = $('opts'); box.innerHTML = ''; box.className = 'opts';
  q.perm.forEach((orig, k) => {
    const tt = h('span', { class: 't', html: mathHTML(q.options[orig]) });
    const b = h('button', { type: 'button', class: 'opt', 'data-idx': orig }, h('span', { class: 'k' }, LETTERS[k]), tt);
    b.onclick = () => answer(orig);
    box.appendChild(b);
  });
  typeset(box);
  $('fb').hidden = true;
}
function applyMarks(pd) {
  const box = $('opts'); box.classList.add('locked');
  for (const b of box.children) {
    const i = +b.dataset.idx;
    if (i === pd.chosen) b.classList.add(pd.kind === 'ok' ? 'right' : 'wrong');
    else if (pd.kind === 'miss' && i === pd.right) b.classList.add('right');
    else b.classList.add('dim');
  }
}
async function answer(choice) {
  if (busy || run.pending) return;
  busy = true;
  $('opts').classList.add('busy');
  $('p-err').textContent = '';
  const q = curQ();
  let res;
  try { res = await api.answer(me.player, run.run, q.id, choice); } catch (e) {
    busy = false; $('opts').classList.remove('busy');
    $('p-err').textContent = niceError(e);
    return;
  }
  $('opts').classList.remove('busy');
  Object.assign(run, { score: res.score, n_ok: res.n_ok, n_bad: res.n_bad, finished: res.finished, seconds: res.seconds });
  if (res.correct) {
    run.marks[run.idx] = run.twin ? 'silver' : 'gold';
    run.pending = { kind: 'ok', chosen: choice, explanation: res.explanation };
    floatText('+' + POINTS_OK, 'var(--good)');
  } else if (!res.resolved) {
    run.pending = { kind: 'hint', chosen: choice, hint: res.hint, twin: res.twin };
    floatText('−' + PENALTY, 'var(--bad)');
  } else {
    run.marks[run.idx] = 'miss';
    run.pending = { kind: 'miss', chosen: choice, right: res.right, rightText: q.options[res.right], explanation: res.explanation };
    floatText('−' + PENALTY, 'var(--bad)');
  }
  saveRun();
  applyMarks(run.pending);
  renderHeader();
  setTimeout(() => { busy = false; showFeedback(run.pending); }, 380);
}
function showFeedback(pd) {
  const fb = $('fb');
  fb.className = 'fb ' + (pd.kind === 'ok' ? 'good' : pd.kind === 'hint' ? 'hint' : 'bad');
  fb.hidden = false;
  applyMarks(pd);
  const ex = $('fb-ex');
  if (pd.kind === 'ok') {
    $('fb-title').textContent = `¡Correcto! +${POINTS_OK}`;
    ex.innerHTML = pd.explanation ? mathHTML(pd.explanation) : '';
  } else if (pd.kind === 'hint') {
    $('fb-title').textContent = '¡Casi! Pista:';
    ex.innerHTML = pd.hint ? mathHTML(pd.hint) : 'Revise el planteamiento con calma.';
  } else {
    $('fb-title').textContent = 'Esta no salió. La correcta era:';
    ex.innerHTML = `<span class="right-ans">${mathHTML(pd.rightText)}</span>` + mathHTML(pd.explanation || '');
  }
  typeset(ex);
  $('fb-btn').textContent = pd.kind === 'hint' ? 'Probar la pregunta similar 🔁' : run.finished ? 'Ver mi resultado 🏁' : 'Siguiente pregunta ➜';
  setTimeout(() => fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
}
$('fb-btn').onclick = () => {
  const pd = run.pending;
  if (!pd) return;
  if (pd.kind === 'hint') run.twin = { ...pd.twin, perm: shuffle(pd.twin.options.length) };
  else { run.twin = null; run.idx++; }
  run.pending = null;
  saveRun();
  if (run.finished && pd.kind !== 'hint') { renderEnd(); return; }
  renderPath(); renderQuestion();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
$('p-exit').onclick = (e) => {
  if (!twoTap(e.currentTarget, '¿Salir? Toque otra vez')) return;
  clearInterval(tick); run = null; saveRun(); renderTopics();
};

// ---------- final ----------
async function renderEnd() {
  show('end');
  clearInterval(tick);
  const N = run.questions.length;
  const gold = run.marks.filter((m) => m === 'gold').length;
  const perfect = gold === N;
  $('e-big').textContent = perfect ? '🏆' : run.n_ok >= N * 0.7 ? '🎉' : '💪';
  $('e-title').textContent = perfect ? '¡Perfecto!' : run.n_ok >= N * 0.7 ? '¡Muy bien!' : '¡Terminó!';
  $('e-sub').textContent = `${run.topic.emoji} ${run.topic.name} · ${gold} de ${N} a la primera`;
  $('e-pts').textContent = run.score; $('e-ok').textContent = run.n_ok; $('e-time').textContent = fmt(run.seconds);
  const topic = run.topic;
  $('e-again').onclick = () => startGame(topic);
  $('e-topics').onclick = () => { run = null; saveRun(); renderTopics(); };
  $('e-rank').innerHTML = '<div class="sub center">Cargando ranking…</div>';
  try { renderRank($('e-rank'), await api.ranking(me.player, topic.id)); } catch (e) { $('e-rank').innerHTML = `<div class="err">${esc(niceError(e))}</div>`; }
}

// ======================= PROFESORA =======================
const P = { courses: [], course: null, tab: store.get('pr-profe-tab') || 'stats', since: 'all', topicFilter: '', twins: true, showAll: false, open: new Set() };
let chart = null;
const body = () => $('profe-body');

async function openProfe() {
  show('profe');
  clearInterval(tick);
  const b = body(); b.innerHTML = '<div class="sub">Cargando…</div>';
  $('logout').hidden = true; $('course-select').hidden = true;
  let session = null;
  try { session = await api.session(); } catch (e) { /* sin sesión */ }
  if (!session) { renderLogin(); return; }
  $('logout').hidden = false;
  let ok = false;
  try { ok = await api.isTeacher(); } catch (e) { b.innerHTML = `<div class="err">${esc(niceError(e))}</div>`; return; }
  if (!ok) {
    b.innerHTML = '';
    b.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Esta cuenta no es de profesora'),
      h('p', { class: 'help' }, `Entró como ${session.user?.email ?? ''}. Solo los correos registrados en la tabla "teachers" de Supabase pueden usar el panel.`)));
    return;
  }
  await loadCourses();
}
$('logout').onclick = async () => { await api.signOut(); openProfe(); };

function renderLogin() {
  const b = body(); b.innerHTML = '';
  const email = h('input', { class: 'input', type: 'email', id: 'lg-email', autocomplete: 'username', placeholder: 'correo@ejemplo.com', required: true });
  const pass = h('input', { class: 'input', type: 'password', id: 'lg-pass', autocomplete: 'current-password', required: true });
  const err = h('div', { class: 'err' });
  const btn = h('button', { class: 'btn block', type: 'submit' }, 'Entrar');
  const form = h('form', { class: 'card', style: 'max-width:440px;margin:20px auto' },
    h('h2', {}, 'Entrar como profesora'),
    h('p', { class: 'help' }, IS_DEMO ? 'Modo demo: cualquier correo y contraseña sirven.' : 'Use el mismo correo y contraseña de la Racha de Cálculo.'),
    h('div', { class: 'field' }, h('label', { for: 'lg-email' }, 'Correo'), email),
    h('div', { class: 'field' }, h('label', { for: 'lg-pass' }, 'Contraseña'), pass), btn, err);
  form.onsubmit = async (ev) => {
    ev.preventDefault(); btn.disabled = true; err.textContent = '';
    try { await api.signIn(email.value.trim(), pass.value); openProfe(); } catch (e) { err.textContent = niceError(e); btn.disabled = false; }
  };
  b.appendChild(form);
  email.focus();
}

async function loadCourses(selectId) {
  try { P.courses = await api.listCourses(); } catch (e) { body().innerHTML = `<div class="err">${esc(niceError(e))}</div>`; return; }
  const saved = selectId || store.get('pr-profe-curso');
  P.course = P.courses.find((c) => c.id === saved) || P.courses[P.courses.length - 1] || null;
  const sel = $('course-select');
  sel.innerHTML = '';
  for (const c of P.courses) sel.appendChild(h('option', { value: c.id }, c.name));
  sel.hidden = P.courses.length < 2;
  if (P.course) sel.value = P.course.id;
  sel.onchange = () => { P.course = P.courses.find((c) => c.id === sel.value); store.set('pr-profe-curso', P.course.id); renderPanel(); };
  if (!P.course) { P.tab = 'course'; }
  renderPanel();
}

function renderPanel() {
  const b = body(); b.innerHTML = '';
  const tabs = [['stats', '📊 Estadísticas'], ['topics', '📚 Temas y preguntas'], ['upload', '⬆️ Subir preguntas'], ['course', '⚙️ Curso']];
  const bar = h('div', { class: 'ptabs', role: 'tablist' });
  for (const [id, label] of tabs) {
    bar.appendChild(h('button', { type: 'button', role: 'tab', class: P.tab === id ? 'on' : '', 'aria-selected': P.tab === id ? 'true' : 'false',
      onclick: () => { P.tab = id; store.set('pr-profe-tab', id); renderPanel(); } }, label));
  }
  b.appendChild(bar);
  const panel = h('div', { class: 'panel' });
  b.appendChild(panel);
  if (!P.course && P.tab !== 'course') { P.tab = 'course'; }
  ({ stats: renderStats, topics: renderTopicsAdmin, upload: renderUpload, course: renderCourse })[P.tab](panel);
}

// ---------- estadísticas ----------
function sinceIso() {
  const d = { all: 0, today: -1, week: 7, month: 30 }[P.since];
  if (!d) return null;
  if (d === -1) { const t = new Date(); t.setHours(0, 0, 0, 0); return t.toISOString(); }
  return new Date(Date.now() - d * 86400e3).toISOString();
}
const pct = (w, n) => (n ? Math.round((100 * w) / n) : 0);

async function renderStats(panel) {
  panel.appendChild(h('div', { class: 'sub' }, 'Cargando estadísticas…'));
  let data;
  try { data = await api.stats(P.course.id, sinceIso()); } catch (e) { panel.innerHTML = `<div class="err">${esc(niceError(e))}</div>`; return; }
  panel.innerHTML = '';
  const topicById = new Map(data.topics.map((t) => [t.id, t]));
  const qs = data.questions;
  const originals = qs.filter((q) => !q.parent_id);
  const totalN = qs.reduce((s, q) => s + q.n, 0);
  const totalW = qs.reduce((s, q) => s + q.wrong, 0);

  const since = h('select', { class: 'select', 'aria-label': 'Periodo' },
    ...[['all', 'Todo el curso'], ['month', 'Últimos 30 días'], ['week', 'Últimos 7 días'], ['today', 'Hoy']].map(([v, l]) => h('option', { value: v, selected: P.since === v }, l)));
  since.onchange = () => { P.since = since.value; renderPanel(); };
  panel.appendChild(h('div', { class: 'toolbar' }, since,
    h('button', { class: 'btn ghost sm', type: 'button', onclick: () => renderPanel() }, '↻ Actualizar')));

  panel.appendChild(h('div', { class: 'tiles' },
    tile(data.players, 'estudiantes'), tile(data.topics.reduce((s, t) => s + t.finished, 0), 'partidas terminadas'),
    tile(totalN, 'respuestas'), tile(totalN ? pct(totalN - totalW, totalN) + ' %' : '—', 'de acierto')));

  if (!totalN) {
    panel.appendChild(h('div', { class: 'card empty' }, h('div', { class: 'big' }, '📊'), 'Todavía no hay respuestas en este periodo.'));
    return;
  }

  // --- temas que más se fallan (solo preguntas originales: primer intento) ---
  const rows = data.topics.map((t) => {
    const os = originals.filter((q) => q.topic_id === t.id);
    const n = os.reduce((s, q) => s + q.n, 0), w = os.reduce((s, q) => s + q.wrong, 0);
    return { ...t, n, w, p: pct(w, n) };
  }).filter((t) => t.n > 0).sort((a, b) => b.p - a.p || b.n - a.n);

  const cv = h('canvas', { role: 'img', 'aria-label': 'Porcentaje de fallo por tema' });
  const box = h('div', { class: 'chart-box', style: `height:${Math.max(140, rows.length * 48 + 50)}px` }, cv);
  const table = h('table', { class: 'help', style: 'width:100%;border-collapse:collapse;margin-top:10px' },
    h('tr', {}, ...['Tema', '% fallo', 'Respuestas', 'Partidas', 'Promedio'].map((x, i) => h('th', { style: `text-align:${i ? 'right' : 'left'};padding:4px 6px;border-bottom:1px solid var(--line)` }, x))),
    ...rows.map((t) => h('tr', {}, h('td', { style: 'padding:4px 6px' }, `${t.emoji} ${t.name}`),
      ...[`${t.p} %`, t.n, t.finished, t.avg_score ?? '—'].map((x) => h('td', { style: 'text-align:right;padding:4px 6px;font-variant-numeric:tabular-nums' }, x)))));
  panel.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Temas que más se fallan'),
    h('p', { class: 'help' }, 'Porcentaje de respuestas incorrectas en el primer intento de cada pregunta (sin contar las similares).'), box,
    h('div', { style: 'overflow-x:auto' }, table)));
  drawChart(cv, rows);

  // --- preguntas que más se fallan ---
  const filter = h('select', { class: 'select', 'aria-label': 'Tema' }, h('option', { value: '' }, 'Todos los temas'),
    ...data.topics.map((t) => h('option', { value: t.id, selected: P.topicFilter === t.id }, `${t.emoji} ${t.name}`)));
  filter.onchange = () => { P.topicFilter = filter.value; P.showAll = false; renderPanel(); };
  const tw = h('input', { type: 'checkbox', checked: P.twins });
  tw.onchange = () => { P.twins = tw.checked; renderPanel(); };
  const list = h('div', { style: 'display:grid;gap:8px;margin-top:12px' });
  const sorted = qs.filter((q) => q.n > 0 && (!P.topicFilter || q.topic_id === P.topicFilter) && (P.twins || !q.parent_id))
    .sort((a, b) => b.wrong / b.n - a.wrong / a.n || b.n - a.n);
  const shown = P.showAll ? sorted : sorted.slice(0, 15);
  const twinOf = new Map(qs.filter((q) => q.parent_id).map((q) => [q.parent_id, q]));
  const parentOf = new Map(qs.map((q) => [q.id, q]));
  shown.forEach((q, i) => list.appendChild(questionRow(q, i + 1, topicById.get(q.topic_id), twinOf.get(q.id), q.parent_id ? parentOf.get(q.parent_id) : null)));
  if (!sorted.length) list.appendChild(h('div', { class: 'help' }, 'No hay respuestas para este filtro.'));
  const more = sorted.length > shown.length
    ? h('button', { class: 'btn ghost sm', type: 'button', style: 'margin-top:10px', onclick: () => { P.showAll = true; renderPanel(); } }, `Ver las ${sorted.length}`) : null;
  panel.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Preguntas que más se fallan'),
    h('p', { class: 'help' }, 'Toque una pregunta para ver qué opciones eligieron. Con pocas respuestas el porcentaje todavía no es confiable.'),
    h('div', { class: 'toolbar' }, filter, h('label', { class: 'switch' }, tw, 'Incluir preguntas similares')), list, more));
}
function tile(v, l) { return h('div', { class: 'tile' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l)); }

function drawChart(cv, rows) {
  if (chart) { chart.destroy(); chart = null; }
  if (!window.Chart) return;
  const css = getComputedStyle(document.documentElement);
  const c = (n) => css.getPropertyValue(n).trim();
  chart = new window.Chart(cv, {
    type: 'bar',
    data: {
      labels: rows.map((t) => `${t.emoji} ${t.name}`),
      datasets: [{ data: rows.map((t) => t.p), backgroundColor: rows.map((t) => (t.p >= 50 ? c('--bad') : t.p >= 30 ? c('--warn') : c('--brand'))),
        borderRadius: 6, maxBarThickness: 30 }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => { const t = rows[ctx.dataIndex]; return `${t.p} % de fallo (${t.w} de ${t.n} respuestas)`; } } } },
      scales: {
        x: { min: 0, max: 100, ticks: { color: c('--muted'), callback: (v) => v + ' %' }, grid: { color: c('--line') } },
        y: { ticks: { color: c('--ink'), font: { weight: 700, size: 13 } }, grid: { display: false } },
      },
    },
  });
}

function optionsList(q, picks) {
  const total = picks ? Object.values(picks).reduce((s, x) => s + x, 0) : 0;
  const box = h('div', { class: 'optlist' }, ...q.options.map((o, i) => {
    const t = h('span', { html: mathHTML(o) });
    const cnt = picks ? `${picks[i] ?? 0} (${pct(picks[i] ?? 0, total)} %)` : (i === q.correct ? '✓ correcta' : '');
    return h('div', { class: 'o' + (i === q.correct ? ' ok' : '') }, h('span', { class: 'l' }, 'abcdef'[i] + ')'), t, h('span', { class: 'c' }, cnt));
  }));
  typeset(box);
  return box;
}

function questionRow(q, rank, topic, twin, parent) {
  const p = pct(q.wrong, q.n);
  // En la lista, las fórmulas grandes se muestran en línea para que quepan.
  const inline = q.statement.replace(/\\\[([\s\S]+?)\\\]/g, '\\($1\\)').replace(/\$\$([\s\S]+?)\$\$/g, '\\($1\\)').replace(/\s*\n\s*/g, ' ');
  const st = h('div', { class: 'st', html: mathHTML(inline) });
  const sum = h('summary', {},
    h('span', { class: 'n' }, rank),
    h('div', { style: 'min-width:0' }, h('div', { class: 'mini' }, q.parent_id ? h('span', { class: 'badge warn' }, 'similar') : null, topic ? `${topic.emoji} ${topic.name}` : ''), st),
    h('div', {}, h('div', { class: 'pct', style: `color:${p >= 50 ? 'var(--bad)' : p >= 30 ? 'var(--warn)' : 'var(--sky)'}` }, p + ' %'),
      h('div', { class: 'bar' }, h('i', { style: `width:${p}%` })), h('div', { class: 'mini', style: 'text-align:right;margin-top:3px' }, `${q.wrong}/${q.n} fallos`)));
  const det = h('div', { class: 'qdetail' });
  const d = h('details', { class: 'qrow' }, sum, det);
  d.addEventListener('toggle', () => {
    if (!d.open || det.childElementCount) return;
    det.append(mathEl('div', 'statement', q.statement), h('div', { class: 'mini' }, 'Opciones elegidas:'), optionsList(q, q.picks));
    if (q.explanation) det.append(h('div', { class: 'mini' }, 'Explicación:'), mathEl('div', 'expl', q.explanation));
    if (twin) det.append(h('div', { class: 'help', style: 'margin-top:8px' }, twin.n ? `Su pregunta similar: ${pct(twin.wrong, twin.n)} % de fallo (${twin.wrong}/${twin.n}).` : 'Su pregunta similar todavía no se ha respondido.'));
    if (parent) det.append(h('div', { class: 'help', style: 'margin-top:8px' }, 'Es la similar de:'), mathEl('div', 'expl', parent.statement));
    typeset(det);
  });
  typeset(st);
  return d;
}

// ---------- temas y preguntas ----------
async function renderTopicsAdmin(panel) {
  panel.appendChild(h('div', { class: 'sub' }, 'Cargando…'));
  let topics, questions;
  try { [topics, questions] = await Promise.all([api.listTopics(P.course.id), api.listQuestions(P.course.id)]); } catch (e) { panel.innerHTML = `<div class="err">${esc(niceError(e))}</div>`; return; }
  panel.innerHTML = '';
  panel.appendChild(h('p', { class: 'help' }, 'Los temas se crean solos al subir preguntas. Aquí puede cambiarles el nombre o el dibujo, ordenarlos, ocultarlos (los estudiantes no los ven, pero se guardan sus estadísticas) o borrarlos.'));
  if (!topics.length) {
    panel.appendChild(h('div', { class: 'card empty' }, h('div', { class: 'big' }, '📭'), 'Todavía no hay temas. Vaya a «Subir preguntas».'));
    return;
  }
  const save = async (fn, okMsg) => { try { await fn(); if (okMsg) toast(okMsg); return true; } catch (e) { toast(niceError(e)); return false; } };
  topics.forEach((t, i) => {
    const mains = questions.filter((q) => q.topic_id === t.id && !q.parent_id);
    const twins = new Map(questions.filter((q) => q.topic_id === t.id && q.parent_id).map((q) => [q.parent_id, q]));
    const emo = h('button', { type: 'button', class: 'emo', title: 'Cambiar dibujo' }, t.emoji);
    const picker = h('div', { class: 'emoji-pick', hidden: true }, ...EMOJIS.map((e) => h('button', { type: 'button', onclick: async () => {
      if (await save(() => api.updateTopic(t.id, { emoji: e }))) { t.emoji = e; emo.textContent = e; picker.hidden = true; }
    } }, e)));
    emo.onclick = () => { picker.hidden = !picker.hidden; };
    const name = h('input', { class: 'input tname', value: t.name, maxlength: 60, 'aria-label': 'Nombre del tema' });
    name.onchange = async () => {
      const v = name.value.trim().replace(/\s+/g, ' ');
      if (!v) { name.value = t.name; return; }
      if (await save(() => api.updateTopic(t.id, { name: v }), 'Nombre guardado.')) t.name = v; else name.value = t.name;
    };
    const vis = h('input', { type: 'checkbox', checked: t.visible });
    vis.onchange = () => save(() => api.updateTopic(t.id, { visible: vis.checked }), vis.checked ? 'Ahora los estudiantes ven este tema.' : 'Tema oculto para los estudiantes.');
    const move = async (dir) => {
      const j = i + dir; if (j < 0 || j >= topics.length) return;
      const order = [...topics]; [order[i], order[j]] = [order[j], order[i]];
      const ok = await save(async () => { for (let k = 0; k < order.length; k++) if (order[k].position !== k) await api.updateTopic(order[k].id, { position: k }); });
      if (ok) renderPanel();
    };
    const qs = h('div', { class: 'qs', hidden: true });
    const toggleQs = h('button', { class: 'btn ghost', type: 'button' }, `Ver preguntas (${mains.length})`);
    toggleQs.onclick = () => {
      qs.hidden = !qs.hidden;
      toggleQs.textContent = qs.hidden ? `Ver preguntas (${mains.length})` : 'Ocultar preguntas';
      if (!qs.hidden && !qs.childElementCount) {
        mains.forEach((q, k) => qs.appendChild(adminQuestion(q, k + 1, twins.get(q.id))));
        if (!mains.length) qs.appendChild(h('div', { class: 'help' }, 'Este tema no tiene preguntas.'));
      }
    };
    const del = h('button', { class: 'btn red', type: 'button' }, 'Borrar tema');
    del.onclick = async () => {
      if (!twoTap(del, '¿Seguro? Se borran sus preguntas y estadísticas. Toque otra vez')) return;
      if (await save(() => api.deleteTopic(t.id), 'Tema borrado.')) renderPanel();
    };
    panel.appendChild(h('div', { class: 'trow' }, emo, name,
      h('div', { class: 'acts' },
        h('button', { class: 'btn ghost', type: 'button', title: 'Subir', 'aria-label': 'Subir en la lista', disabled: i === 0, onclick: () => move(-1) }, '↑'),
        h('button', { class: 'btn ghost', type: 'button', title: 'Bajar', 'aria-label': 'Bajar en la lista', disabled: i === topics.length - 1, onclick: () => move(1) }, '↓'),
        toggleQs, del),
      h('div', { class: 'info' }, `${mains.length} preguntas · ${twins.size} con similar`, h('label', { class: 'switch' }, vis, 'Visible para estudiantes')),
      picker, qs));
  });
}
function adminQuestion(q, n, twin) {
  const del = h('button', { class: 'btn red sm', type: 'button' }, 'Borrar');
  const box = h('div', { class: 'preview-q' },
    h('div', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:center' }, h('b', {}, `Pregunta ${n}`), del),
    mathEl('div', 'statement', q.statement), optionsList(q), q.explanation ? mathEl('div', 'expl', q.explanation) : null,
    twin ? h('div', { class: 'twin-box' }, h('span', { class: 'badge warn' }, 'similar'), mathEl('div', 'statement', twin.statement), optionsList(twin),
      twin.explanation ? mathEl('div', 'expl', twin.explanation) : null) : null);
  del.onclick = async () => {
    if (!twoTap(del, '¿Seguro? Toque otra vez')) return;
    try { await api.deleteQuestion(q.id); box.remove(); toast('Pregunta borrada.'); } catch (e) { toast(niceError(e)); }
  };
  return box;
}

// ---------- subir preguntas ----------
function renderUpload(panel) {
  const file = h('input', { type: 'file', accept: '.txt,text/plain', class: 'input', style: 'height:auto;padding:12px' });
  const ta = h('textarea', { class: 'input', placeholder: '=== EJERCICIO ===\ntema: Límites\nenunciado:\n…', spellcheck: 'false' });
  const out = h('div');
  file.onchange = async () => { if (file.files[0]) { ta.value = await file.files[0].text(); check(); } };
  const check = () => reviewUpload(ta.value, out);
  panel.append(
    h('div', { class: 'card' }, h('h2', {}, 'Subir preguntas'),
      h('p', { class: 'help', html: `Elija su archivo <b>.txt</b> (o pegue el texto). La app lo revisa y le muestra cómo quedó <b>antes</b> de guardar. Los temas nuevos se crean solos y las preguntas repetidas se saltan. Vea el formato en <a href="ejemplo-preguntas.txt" target="_blank" rel="noopener">el archivo de ejemplo</a>.` }),
      h('div', { class: 'field' }, h('label', {}, 'Archivo'), file),
      h('div', { class: 'field' }, h('label', {}, 'O pegue el texto aquí'), ta),
      h('button', { class: 'btn', type: 'button', onclick: check }, 'Revisar')),
    out);
}
async function reviewUpload(text, out) {
  out.innerHTML = '';
  const { items, errors, warnings } = parseQuestions(text);
  let existing = [];
  try { existing = await api.listTopics(P.course.id); } catch (e) { /* sin lista */ }
  const known = new Set(existing.map((t) => t.name.toLowerCase()));
  const card = h('div', { class: 'card' });
  out.appendChild(card);
  const twins = items.filter((i) => i.twin).length;
  card.appendChild(h('h2', {}, errors.length ? `Hay ${errors.length} error${errors.length > 1 ? 'es' : ''} que corregir` : `Todo bien: ${items.length} preguntas (${twins} con similar)`));
  if (errors.length || warnings.length) {
    card.appendChild(h('div', { class: 'msgs' }, ...errors.map((m) => h('div', { class: 'e' }, '✕ ' + m)), ...warnings.map((m) => h('div', { class: 'w' }, '⚠ ' + m))));
  }
  if (!errors.length && items.length) {
    const btn = h('button', { class: 'btn block', type: 'button', style: 'margin-top:14px' }, `Guardar ${items.length} preguntas en «${P.course.name}»`);
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await api.importQuestions(P.course.id, items);
        const msg = `Se guardaron ${r.added} preguntas` + (r.skipped ? `; ${r.skipped} ya estaban y se saltaron` : '') + (r.new_topics.length ? `. Temas nuevos: ${r.new_topics.join(', ')}` : '') + '.';
        out.innerHTML = '';
        out.appendChild(h('div', { class: 'card' }, h('h2', {}, '✅ Listo'), h('p', { class: 'help' }, msg),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { P.tab = 'topics'; store.set('pr-profe-tab', 'topics'); renderPanel(); } }, 'Ver temas y preguntas')));
        toast(msg);
      } catch (e) { toast(niceError(e)); btn.disabled = false; }
    };
    card.appendChild(btn);
  }
  // vista previa, agrupada por tema
  const groups = new Map();
  for (const it of items) { const k = it.topic || '(sin tema)'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  for (const [topic, list] of groups) {
    const g = h('div', { class: 'preview-topic' }, h('h3', {}, topic, ' ', known.has(topic.toLowerCase()) ? h('span', { class: 'badge' }, 'ya existe') : h('span', { class: 'badge warn' }, 'tema nuevo'), ` · ${list.length}`));
    list.forEach((it, k) => {
      g.appendChild(h('div', { class: 'preview-q' }, h('b', {}, `Pregunta ${k + 1}`), mathEl('div', 'statement', it.statement), optionsList(it),
        it.explanation ? mathEl('div', 'expl', it.explanation) : null,
        it.twin ? h('div', { class: 'twin-box' }, h('span', { class: 'badge warn' }, 'similar'), mathEl('div', 'statement', it.twin.statement), optionsList(it.twin),
          it.twin.explanation ? mathEl('div', 'expl', it.twin.explanation) : null) : null));
    });
    card.appendChild(g);
  }
}

// ---------- curso ----------
function renderCourse(panel) {
  const link = (code) => `${location.origin}${location.pathname}?c=${encodeURIComponent(code)}`;
  if (P.course) {
    const c = P.course;
    const name = h('input', { class: 'input', value: c.name, maxlength: 80 });
    const code = h('input', { class: 'input', value: c.join_code, maxlength: 20, autocapitalize: 'characters' });
    const url = h('input', { class: 'input', value: link(c.join_code), readonly: true, 'aria-label': 'Enlace para estudiantes' });
    code.oninput = () => { url.value = link(code.value.trim().toUpperCase()); };
    const saveBtn = h('button', { class: 'btn', type: 'button' }, 'Guardar cambios');
    saveBtn.onclick = async () => {
      const patch = { name: name.value.trim(), join_code: code.value.trim().toUpperCase().replace(/\s+/g, '') };
      if (!patch.name || patch.join_code.length < 3) { toast('Escriba un nombre y un código de al menos 3 letras.'); return; }
      try { await api.updateCourse(c.id, patch); Object.assign(c, patch); toast('Curso guardado.'); loadCourses(c.id); } catch (e) { toast(niceError(e)); }
    };
    const copy = h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(url.value); toast('Enlace copiado.'); } catch (e) { url.select(); toast('Selecciónelo y cópielo.'); }
    } }, 'Copiar');
    panel.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Curso'),
      h('div', { class: 'field' }, h('label', {}, 'Nombre'), name),
      h('div', { class: 'field' }, h('label', {}, 'Código para entrar'), code),
      h('p', { class: 'help' }, 'Los estudiantes escriben este código junto con su nombre. Si lo cambia, quienes ya entraron siguen adentro.'),
      saveBtn,
      h('div', { class: 'field', style: 'margin-top:18px' }, h('label', {}, 'Enlace para compartir (ya trae el código)'), h('div', { class: 'copyrow' }, url, copy))));
  }
  const nn = h('input', { class: 'input', placeholder: 'Ej: MA1002 Cálculo II · Grupo 2', maxlength: 80 });
  const nc = h('input', { class: 'input', placeholder: 'Ej: CALC2G2', maxlength: 20, autocapitalize: 'characters' });
  const create = h('button', { class: 'btn ghost', type: 'button' }, 'Crear curso');
  create.onclick = async () => {
    const c = { name: nn.value.trim(), join_code: nc.value.trim().toUpperCase().replace(/\s+/g, '') };
    if (!c.name || c.join_code.length < 3) { toast('Escriba un nombre y un código de al menos 3 letras.'); return; }
    try { const row = await api.createCourse(c); store.set('pr-profe-curso', row.id); toast('Curso creado.'); P.tab = 'upload'; loadCourses(row.id); } catch (e) { toast(niceError(e)); }
  };
  panel.appendChild(h('div', { class: 'card' }, h('h2', {}, P.course ? 'Crear otro curso' : 'Cree su primer curso'),
    h('p', { class: 'help' }, 'Cada curso tiene sus propios temas, preguntas, ranking y estadísticas.'),
    h('div', { class: 'field' }, h('label', {}, 'Nombre'), nn), h('div', { class: 'field' }, h('label', {}, 'Código'), nc), create));
}

// ======================= ARRANQUE =======================
function route() {
  if (location.hash === '#profe') { openProfe(); return; }
  if (chart) { chart.destroy(); chart = null; }
  studentStart();
}
window.addEventListener('hashchange', route);
if (IS_DEMO) {
  $('demo-banner').hidden = false;
  $('demo-reset').onclick = async () => {
    const { resetDemo } = await import('./demo.js');
    resetDemo(); store.set(ME_KEY, null); store.set(RUN_KEY, null); location.reload();
  };
}
route();
