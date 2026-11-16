// Capa de datos: habla con Supabase, o con la base de datos de prueba (modo demo).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const IS_DEMO = !SUPABASE_URL || new URLSearchParams(location.search).has('demo');

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}
const one = (x) => (Array.isArray(x) ? x[0] : x) ?? null;

async function supabaseApi() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  // Misma configuración que la Racha: como las dos páginas están en julissabarboza043.github.io,
  // quien ya inició sesión en la Racha en ese teléfono entra aquí sin volver a escribir nada.
  const sb = createClient(new URL(SUPABASE_URL).origin, SUPABASE_ANON_KEY);
  const rpc = async (fn, args) => check(await sb.rpc(fn, args));

  return {
    // --- cuenta (la misma de la Racha) ---
    async session() { return (await sb.auth.getSession()).data.session; },
    async signIn(email, password) { check(await sb.auth.signInWithPassword({ email, password })); },
    async signUp(email, password) {
      const data = check(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }));
      return { needsConfirm: !data.session };
    },
    async signOut() { await sb.auth.signOut(); },

    // --- estudiante ---
    myPlayer: () => rpc('pr_my_player'),
    join: (code, name, avatar) => rpc('pr_join', { p_code: code, p_name: name, p_avatar: avatar }),
    home: (player) => rpc('pr_home', { p_player: player }),
    start: (player, topic) => rpc('pr_start', { p_player: player, p_topic: topic }),
    answer: (player, run, question, choice) => rpc('pr_answer', { p_player: player, p_run: run, p_question: question, p_choice: choice }),
    ranking: (player, topic) => rpc('pr_ranking', { p_player: player, p_topic: topic }),

    // --- profesora ---
    isTeacher: () => rpc('is_teacher'),
    async listCourses() { return check(await sb.from('pr_courses').select('*').order('created_at')); },
    async createCourse(c) { return check(await sb.from('pr_courses').insert(c).select().single()); },
    async updateCourse(id, c) { check(await sb.from('pr_courses').update(c).eq('id', id)); },
    async listTopics(course) {
      return check(await sb.from('pr_topics').select('*').eq('course_id', course).order('position').order('created_at'));
    },
    async listQuestions(course) {
      const topics = await this.listTopics(course);
      if (!topics.length) return [];
      const rows = check(await sb.from('pr_questions')
        .select('id, topic_id, parent_id, statement, options, position, created_at, pr_keys(correct, explanation)')
        .in('topic_id', topics.map((t) => t.id)).order('position').order('created_at'));
      return rows.map(({ pr_keys: k, ...q }) => ({ ...q, correct: one(k)?.correct, explanation: one(k)?.explanation ?? '' }));
    },
    async updateTopic(id, patch) { check(await sb.from('pr_topics').update(patch).eq('id', id)); },
    async deleteTopic(id) { check(await sb.from('pr_topics').delete().eq('id', id)); },
    async deleteQuestion(id) { check(await sb.from('pr_questions').delete().eq('id', id)); },
    importQuestions: (course, items) => rpc('pr_import', { p_course: course, p_items: items }),
    stats: (course, since) => rpc('pr_stats', { p_course: course, p_since: since || null }),
  };
}

export const api = IS_DEMO ? (await import('./demo.js')).demoApi : await supabaseApi();
