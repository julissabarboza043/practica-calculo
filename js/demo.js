// Modo demo: una copia en JavaScript de las funciones de supabase/practica.sql que guarda
// todo en este navegador. Sirve para probar la app sin Supabase.
// Las preguntas de ejemplo salen de ejemplo-preguntas.txt.
import { parseQuestions } from './parser.js';

const DB_KEY = 'practica-demo-db';
const AUTH_KEY = 'practica-demo-auth';
const RULES = { puntos_correcta: 10, castigo_fallo: 3, preguntas_por_partida: 10 };
let db = null;

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const nowIso = () => new Date().toISOString();
const secs = (a, b) => Math.round((new Date(b) - new Date(a)) / 1000);
const fail = (m) => { throw new Error(m); };
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms)); // simula la red
const clone = (x) => JSON.parse(JSON.stringify(x));

function save() { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { /* nada */ } }

export function resetDemo() {
  try { localStorage.removeItem(DB_KEY); localStorage.removeItem(AUTH_KEY); } catch (e) { /* nada */ }
  db = null;
}

async function ensure() {
  await wait();
  if (db) return;
  try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { db = null; }
  if (!db) await seed();
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------------- cuenta (en el demo, cualquier correo y contraseña sirven) ----------------
let seedUser = null; // mientras se crean los compañeros falsos
function currentUser() {
  if (seedUser) return seedUser;
  try { return localStorage.getItem(AUTH_KEY); } catch (e) { return null; }
}
const needUser = () => currentUser() || fail('Debe iniciar sesión.');

// ---------------- las mismas funciones que en practica.sql ----------------
function playerOf(id) {
  const user = needUser();
  const p = db.players.find((x) => x.id === id && x.user_id === user);
  if (!p) fail('Vuelva a entrar con el código del curso.');
  p.last_seen = nowIso();
  return p;
}
const twinOf = (qid) => db.questions.filter((q) => q.parent_id === qid).sort((a, b) => a.position - b.position)[0] ?? null;
const keyOf = (qid) => db.keys[qid];

function importItems(course, items) {
  let added = 0, skipped = 0;
  const newTopics = [];
  for (const it of items) {
    const name = it.topic.trim();
    let t = db.topics.find((x) => x.course_id === course && x.name.toLowerCase() === name.toLowerCase());
    if (!t) {
      const pos = Math.max(-1, ...db.topics.filter((x) => x.course_id === course).map((x) => x.position)) + 1;
      t = { id: newId(), course_id: course, name, emoji: '📘', position: pos, visible: true, created_at: nowIso() };
      db.topics.push(t);
      newTopics.push(name);
    }
    if (db.questions.some((q) => q.topic_id === t.id && !q.parent_id && q.statement.trim() === it.statement.trim())) { skipped++; continue; }
    const pos = db.questions.filter((q) => q.topic_id === t.id).length;
    const q = { id: newId(), topic_id: t.id, parent_id: null, statement: it.statement, options: it.options, position: pos, created_at: nowIso() };
    db.questions.push(q);
    db.keys[q.id] = { correct: it.correct, explanation: it.explanation ?? '' };
    if (it.twin) {
      const w = { id: newId(), topic_id: t.id, parent_id: q.id, statement: it.twin.statement, options: it.twin.options, position: pos, created_at: nowIso() };
      db.questions.push(w);
      db.keys[w.id] = { correct: it.twin.correct, explanation: it.twin.explanation ?? '' };
    }
    added++;
  }
  return { added, skipped, new_topics: newTopics };
}

function startRun(player, topicId, at) {
  const pl = playerOf(player);
  const t = db.topics.find((x) => x.id === topicId && x.course_id === pl.course_id && x.visible);
  if (!t) fail('Ese tema no está disponible.');
  const ids = shuffle(db.questions.filter((q) => q.topic_id === t.id && !q.parent_id).map((q) => q.id)).slice(0, RULES.preguntas_por_partida);
  if (!ids.length) fail('Ese tema todavía no tiene preguntas.');
  const r = { id: newId(), player_id: pl.id, topic_id: t.id, question_ids: ids, started_at: at ?? nowIso(), finished_at: null, score: 0, n_ok: 0, n_bad: 0 };
  db.runs.push(r);
  return { r, t, ids };
}

function answerRun(player, runId, qid, choice, at) {
  const pl = playerOf(player);
  const r = db.runs.find((x) => x.id === runId && x.player_id === pl.id);
  if (!r) fail('Esa partida no existe.');
  const q = db.questions.find((x) => x.id === qid);
  if (!q) fail('Pregunta no encontrada.');
  const ansOf = (id) => db.answers.find((a) => a.run_id === r.id && a.question_id === id);
  let isTwin;
  if (r.question_ids.includes(q.id)) isTwin = false;
  else if (q.parent_id && r.question_ids.includes(q.parent_id) && twinOf(q.parent_id)?.id === q.id) {
    isTwin = true;
    const m = ansOf(q.parent_id);
    if (!m || m.correct) fail('Esa pregunta no le corresponde todavía.');
  } else fail('Esa pregunta no es de esta partida.');

  const k = keyOf(q.id);
  const prev = ansOf(q.id);
  let ok;
  if (prev) ok = prev.correct;
  else {
    if (r.finished_at) fail('Esta partida ya terminó.');
    if (!(Number.isInteger(choice) && choice >= 0 && choice < q.options.length)) fail('Opción inválida.');
    ok = choice === k.correct;
    db.answers.push({ run_id: r.id, question_id: q.id, is_twin: isTwin, choice, correct: ok, created_at: at ?? nowIso() });
    r.score += ok ? RULES.puntos_correcta : -RULES.castigo_fallo;
    if (ok) r.n_ok++; else r.n_bad++;
  }

  let res;
  if (ok) res = { correct: true, resolved: true, explanation: k.explanation };
  else if (!isTwin && twinOf(q.id)) {
    const tq = twinOf(q.id);
    res = { correct: false, resolved: false, hint: k.explanation, twin: { id: tq.id, statement: tq.statement, options: tq.options } };
  } else res = { correct: false, resolved: true, right: k.correct, explanation: k.explanation };

  const pending = r.question_ids.filter((id) => {
    const a = ansOf(id);
    if (!a) return true;
    const tw = twinOf(id);
    return !a.correct && tw && !ansOf(tw.id);
  }).length;
  if (!pending && !r.finished_at) r.finished_at = at ?? nowIso();
  return { ...res, score: r.score, n_ok: r.n_ok, n_bad: r.n_bad, finished: !!r.finished_at, seconds: secs(r.started_at, r.finished_at ?? nowIso()) };
}

// ---------------- datos de ejemplo ----------------
async function seed() {
  db = { courses: [], topics: [], questions: [], keys: {}, players: [], runs: [], answers: [] };
  const course = { id: newId(), name: 'MA1002 Cálculo II (demo)', join_code: 'DEMO', created_at: nowIso() };
  db.courses.push(course);
  let text = '';
  try { text = await (await fetch('ejemplo-preguntas.txt', { cache: 'no-store' })).text(); } catch (e) { /* sin archivo */ }
  const { items } = parseQuestions(text);
  importItems(course.id, items);
  db.topics.find((t) => t.name === 'Límites') && (db.topics.find((t) => t.name === 'Límites').emoji = '🎯');
  const emo = { 'Derivadas parciales': '📈', 'Derivadas direccionales y gradiente': '🧭', 'Optimización': '⛰️' };
  for (const t of db.topics) if (emo[t.name]) t.emoji = emo[t.name];

  // Compañeros falsos con partidas ya jugadas (para ver el ranking y las estadísticas).
  const fake = [['Valeria', '🦊', 0.85], ['Diego', '🐸', 0.6], ['Sofía', '🦉', 0.75], ['Andrés', '🐢', 0.45], ['Camila', '🐬', 0.7]];
  const day = 86400e3;
  for (const [name, avatar, skill] of fake) {
    const p = { id: newId(), course_id: course.id, user_id: 'falso-' + name, name, avatar, created_at: nowIso(), last_seen: nowIso() };
    db.players.push(p);
    seedUser = p.user_id;
    for (const t of db.topics) {
      // las preguntas "difíciles" (posición alta) se fallan más
      let clock = Date.now() - Math.random() * 6 * day;
      const { r } = startRun(p.id, t.id, new Date(clock).toISOString());
      for (const qid of r.question_ids) {
        const q = db.questions.find((x) => x.id === qid);
        const pOk = Math.max(0.3, skill + 0.1 - 0.12 * q.position);
        clock += 20e3 + Math.random() * 40e3;
        const k = keyOf(qid);
        const pick = (qq, kk) => (Math.random() < pOk ? kk.correct : (kk.correct + 1 + Math.floor(Math.random() * (qq.options.length - 1))) % qq.options.length);
        const a = answerRun(p.id, r.id, qid, pick(q, k), new Date(clock).toISOString());
        if (!a.resolved) {
          clock += 20e3 + Math.random() * 30e3;
          const tw = db.questions.find((x) => x.id === a.twin.id);
          answerRun(p.id, r.id, tw.id, pick(tw, keyOf(tw.id)), new Date(clock).toISOString());
        }
      }
    }
  }
  seedUser = null;
  save();
}

// ---------------- API (misma forma que api.js) ----------------
// En el demo, cualquier cuenta puede abrir también el panel de profesora.
const isTeacherSession = () => !!currentUser();
const needTeacher = () => { if (!isTeacherSession()) fail('Solo la profesora puede hacer esto.'); };

export const demoApi = {
  async myPlayer() {
    await ensure();
    const user = needUser();
    const p = db.players.filter((x) => x.user_id === user).sort((a, b) => b.last_seen.localeCompare(a.last_seen))[0];
    if (!p) return { player: null, suggested_name: null };
    const c = db.courses.find((x) => x.id === p.course_id);
    return { player: p.id, name: p.name, avatar: p.avatar, course: c?.name, code: c?.join_code };
  },
  async join(code, name, avatar) {
    await ensure();
    const user = needUser();
    const nm = String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!nm) fail('Escriba su nombre.');
    const c = db.courses.find((x) => x.join_code.toUpperCase() === String(code ?? '').trim().toUpperCase());
    if (!c) fail('Ese código no existe. Revíselo con la profesora. (En el modo demo el código es DEMO).');
    let p = db.players.find((x) => x.user_id === user && x.course_id === c.id);
    if (p) Object.assign(p, { name: nm, avatar: avatar || '🙂', last_seen: nowIso() });
    else { p = { id: newId(), course_id: c.id, user_id: user, name: nm, avatar: avatar || '🙂', created_at: nowIso(), last_seen: nowIso() }; db.players.push(p); }
    save();
    return { player: p.id, course: c.name, code: c.join_code, name: nm, avatar: p.avatar };
  },
  async home(player) {
    await ensure();
    const pl = playerOf(player);
    const topics = db.topics.filter((t) => t.course_id === pl.course_id && t.visible)
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
      .map((t) => {
        const runs = db.runs.filter((r) => r.topic_id === t.id && r.player_id === pl.id && r.finished_at);
        return { id: t.id, name: t.name, emoji: t.emoji, n: db.questions.filter((q) => q.topic_id === t.id && !q.parent_id).length,
          best: runs.length ? Math.max(...runs.map((r) => r.score)) : null, plays: runs.length };
      }).filter((t) => t.n > 0);
    save();
    return { course: db.courses.find((c) => c.id === pl.course_id)?.name, name: pl.name, avatar: pl.avatar, max_questions: RULES.preguntas_por_partida, topics };
  },
  async start(player, topic) {
    await ensure();
    const { r, t, ids } = startRun(player, topic);
    save();
    return {
      run: r.id, started_at: r.started_at, topic: { id: t.id, name: t.name, emoji: t.emoji },
      questions: ids.map((id) => { const q = db.questions.find((x) => x.id === id); return { id, statement: q.statement, options: q.options, has_twin: !!twinOf(id) }; }),
    };
  },
  async answer(player, run, question, choice) {
    await ensure();
    const res = answerRun(player, run, question, choice);
    save();
    return clone(res);
  },
  async ranking(player, topic) {
    await ensure();
    const pl = playerOf(player);
    if (!db.topics.some((t) => t.id === topic && t.course_id === pl.course_id)) fail('Ese tema no está disponible.');
    const best = new Map();
    for (const r of db.runs.filter((x) => x.topic_id === topic && x.finished_at)) {
      const s = secs(r.started_at, r.finished_at);
      const b = best.get(r.player_id);
      if (!b || r.score > b.score || (r.score === b.score && s < b.seconds)) best.set(r.player_id, { score: r.score, seconds: s, pid: r.player_id });
    }
    return [...best.values()].sort((a, b) => b.score - a.score || a.seconds - b.seconds)
      .map((b, i) => { const p = db.players.find((x) => x.id === b.pid); return { pos: i + 1, name: p.name, avatar: p.avatar, score: b.score, seconds: b.seconds, me: b.pid === pl.id }; })
      .filter((x) => x.pos <= 10 || x.me);
  },

  // --- cuenta (en el demo, cualquier correo y contraseña sirven) ---
  async session() { const u = currentUser(); return u ? { user: { email: u } } : null; },
  async signIn(email, password) {
    await wait();
    if (!email || !password) fail('Escriba el correo y la contraseña.');
    try { localStorage.setItem(AUTH_KEY, email.trim().toLowerCase()); } catch (e) { /* nada */ }
  },
  async signUp(email, password) { await this.signIn(email, password); return { needsConfirm: false }; },
  async signOut() { try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* nada */ } },
  async isTeacher() { return isTeacherSession(); },
  async listCourses() { await ensure(); needTeacher(); return clone(db.courses); },
  async createCourse(c) {
    await ensure(); needTeacher();
    if (db.courses.some((x) => x.join_code.toUpperCase() === c.join_code.toUpperCase())) fail('duplicate key value violates unique constraint (ese código ya existe)');
    const row = { id: newId(), created_at: nowIso(), ...c }; db.courses.push(row); save(); return clone(row);
  },
  async updateCourse(id, c) {
    await ensure(); needTeacher();
    if (c.join_code && db.courses.some((x) => x.id !== id && x.join_code.toUpperCase() === c.join_code.toUpperCase())) fail('duplicate key value violates unique constraint (ese código ya existe)');
    Object.assign(db.courses.find((x) => x.id === id), c); save();
  },
  async listTopics(course) {
    await ensure(); needTeacher();
    return clone(db.topics.filter((t) => t.course_id === course).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)));
  },
  async listQuestions(course) {
    await ensure(); needTeacher();
    const tids = new Set(db.topics.filter((t) => t.course_id === course).map((t) => t.id));
    return clone(db.questions.filter((q) => tids.has(q.topic_id)).map((q) => ({ ...q, ...keyOf(q.id) })));
  },
  async updateTopic(id, patch) { await ensure(); needTeacher(); Object.assign(db.topics.find((t) => t.id === id), patch); save(); },
  async deleteTopic(id) {
    await ensure(); needTeacher();
    const qids = new Set(db.questions.filter((q) => q.topic_id === id).map((q) => q.id));
    const rids = new Set(db.runs.filter((r) => r.topic_id === id).map((r) => r.id));
    db.topics = db.topics.filter((t) => t.id !== id);
    db.questions = db.questions.filter((q) => !qids.has(q.id));
    db.runs = db.runs.filter((r) => !rids.has(r.id));
    db.answers = db.answers.filter((a) => !rids.has(a.run_id) && !qids.has(a.question_id));
    save();
  },
  async deleteQuestion(id) {
    await ensure(); needTeacher();
    const ids = new Set([id, ...db.questions.filter((q) => q.parent_id === id).map((q) => q.id)]);
    db.questions = db.questions.filter((q) => !ids.has(q.id));
    db.answers = db.answers.filter((a) => !ids.has(a.question_id));
    save();
  },
  async importQuestions(course, items) { await ensure(); needTeacher(); const r = importItems(course, items); save(); return r; },
  async stats(course, since) {
    await ensure(); needTeacher();
    const after = (iso) => !since || iso >= since;
    const topics = db.topics.filter((t) => t.course_id === course).sort((a, b) => a.position - b.position);
    const tids = new Set(topics.map((t) => t.id));
    const questions = db.questions.filter((q) => tids.has(q.topic_id)).map((q) => {
      const as = db.answers.filter((a) => a.question_id === q.id && after(a.created_at));
      const picks = {};
      for (const a of as) picks[a.choice] = (picks[a.choice] ?? 0) + 1;
      return { id: q.id, topic_id: q.topic_id, parent_id: q.parent_id, statement: q.statement, options: q.options,
        correct: keyOf(q.id).correct, explanation: keyOf(q.id).explanation, n: as.length, wrong: as.filter((a) => !a.correct).length, picks };
    });
    return clone({
      questions,
      topics: topics.map((t) => {
        const rs = db.runs.filter((r) => r.topic_id === t.id && after(r.started_at));
        const fin = rs.filter((r) => r.finished_at);
        return { id: t.id, name: t.name, emoji: t.emoji, visible: t.visible, runs: rs.length, finished: fin.length,
          players: new Set(rs.map((r) => r.player_id)).size,
          avg_score: fin.length ? Math.round(10 * fin.reduce((s, r) => s + r.score, 0) / fin.length) / 10 : null };
      }),
      players: db.players.filter((p) => p.course_id === course && after(p.last_seen)).length,
    });
  },
};
