// Lee el archivo de preguntas (formato descrito en FORMATO_PREGUNTAS.md)
// y lo convierte en la lista que se guarda en la base de datos.

const MAIN_START = /^\s*={3,}\s*EJERCICIO\s*={3,}\s*$/i;
const TWIN_START = /^\s*={3,}\s*SIMILAR\s*={3,}\s*$/i;
const FIELD = /^\s*([A-Za-zÁÉÍÓÚáéíóúñÑ ]{3,20}?)\s*:\s*(.*)$/;
const KNOWN = new Set(['tema', 'tipo', 'fecha', 'enunciado', 'opciones', 'explicacion']);

const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// Divide el texto en bloques y cada bloque en campos.
function splitBlocks(text) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let cur = null;
  let field = null;
  lines.forEach((line, i) => {
    const isMain = MAIN_START.test(line);
    if (isMain || TWIN_START.test(line)) {
      cur = { twin: !isMain, line: i + 1, fields: {} };
      blocks.push(cur);
      field = null;
      return;
    }
    if (!cur) return; // texto antes del primer bloque: se ignora (sirve para notas)
    const m = field !== 'explicacion' && line.match(FIELD);
    const key = m && plain(m[1]).replace(/\s+/g, '_');
    if (m && KNOWN.has(key)) {
      field = key;
      cur.fields[field] = m[2];
    } else if (field) {
      cur.fields[field] += '\n' + line;
    }
  });
  for (const b of blocks) {
    for (const k of Object.keys(b.fields)) b.fields[k] = b.fields[k].trim();
  }
  return blocks;
}

function parseOptions(raw, err) {
  const opts = [];
  const correct = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*(\*)?\s*([a-fA-F])\s*[\)\.]\s*(.*)$/);
    if (m) {
      if (m[1]) correct.push(opts.length);
      opts.push(m[3].trim());
    } else if (opts.length && line.trim()) {
      opts[opts.length - 1] += '\n' + line.trim();
    }
  }
  if (opts.length < 2) err('necesita al menos 2 opciones (a), b), …).');
  if (opts.length > 6) err('tiene más de 6 opciones; use como máximo a) … f).');
  if (correct.length !== 1) err('marque exactamente una opción correcta con * al inicio (ej. "*b) …").');
  if (opts.some((o) => !o)) err('hay una opción vacía.');
  return { options: opts, correct: correct[0] };
}

function parseQuestion(f, err, warn) {
  if (f.tipo && !plain(f.tipo).includes('seleccion')) err(`solo se aceptan preguntas de selección única (decía "${f.tipo}").`);
  if (f.fecha) warn('el campo "fecha" no se usa en esta app; se ignora.');
  const statement = f.enunciado ?? '';
  if (!statement) err('falta el enunciado.');
  const { options, correct } = parseOptions(f.opciones ?? '', err);
  if (!f.explicacion) warn('no tiene explicación.');
  return { statement, options, correct, explanation: f.explicacion ?? '' };
}

/**
 * @param {string} text contenido del archivo
 * @returns {{items:object[], errors:string[], warnings:string[]}}
 *   items: [{topic, statement, options, correct, explanation, twin?:{statement, options, correct, explanation}}]
 */
export function parseQuestions(text) {
  const items = [];
  const errors = [];
  const warnings = [];
  const blocks = splitBlocks(text);
  if (!blocks.some((b) => !b.twin)) errors.push('No encontré ningún bloque "=== EJERCICIO ===".');

  let n = 0;
  let lastTopic = null;
  let last = null;
  blocks.forEach((b) => {
    const f = b.fields;
    if (!b.twin) n += 1;
    const where = b.twin ? `Similar del ejercicio ${n} (línea ${b.line})` : `Ejercicio ${n} (línea ${b.line})`;
    const err = (m) => errors.push(`${where}: ${m}`);
    const warn = (m) => warnings.push(`${where}: ${m}`);

    if (b.twin) {
      if (!last) { err('"=== SIMILAR ===" tiene que ir justo después de un "=== EJERCICIO ===".'); return; }
      if (last.twin) { err('cada ejercicio puede tener solo una pregunta similar.'); return; }
      if (f.tema && plain(f.tema) !== plain(last.topic)) warn('la similar siempre usa el tema de su ejercicio; se ignora el "tema" que puso.');
      last.twin = parseQuestion(f, err, warn);
      return;
    }

    const topic = (f.tema ?? '').replace(/\s+/g, ' ').trim() || lastTopic;
    if (!topic) err('falta "tema:" (ej. "tema: Derivadas parciales").');
    if (topic && topic.length > 60) err('el tema es muy largo (máximo 60 letras).');
    lastTopic = topic;
    last = { topic, ...parseQuestion(f, err, warn), twin: null };
    items.push(last);
  });

  const seen = new Map();
  items.forEach((it, i) => {
    const k = plain(it.topic ?? '') + '|' + it.statement.trim();
    if (seen.has(k)) warnings.push(`Ejercicio ${i + 1}: tiene el mismo enunciado que el ejercicio ${seen.get(k) + 1}; solo se guardará una vez.`);
    else seen.set(k, i);
  });
  return { items, errors, warnings };
}
