/** Clave Groq del asistente de uso. Se guarda en este equipo y, si existe la columna, en la nube. */

export const EVENTO_GROQ = 'pos3b-groq-updated';
export const LS_GROQ_KEY = 'pos3b_groq_api_key';
export const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_MODEL = 'llama-3.1-8b-instant';

const SISTEMA = `Eres el asistente de uso de POS CONTROL 3B (Abarrotes Las 3B).
Responde SOLO con los fragmentos del manual que te pasan.
Habla en español, claro y breve (máximo 180 palabras).
Usa pasos numerados cuando expliques un procedimiento.
No inventes botones, precios, ni módulos que no estén en el manual.
No des consejos legales ni de hacking.
Si el manual no cubre la pregunta, dilo y sugiere preguntar por cobrar, corte, PIN, precios o traspasos.`;

export function leerClaveGroq() {
  try {
    return String(localStorage.getItem(LS_GROQ_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function groqActivo() {
  return Boolean(leerClaveGroq());
}

export function guardarClaveGroqLocal(clave) {
  const k = String(clave || '').trim();
  try {
    if (k) localStorage.setItem(LS_GROQ_KEY, k);
    else localStorage.removeItem(LS_GROQ_KEY);
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_GROQ, { detail: { activo: Boolean(k) } }));
  }
  return k;
}

export function enmascararClaveGroq(clave) {
  const k = String(clave || '').trim();
  if (k.length < 12) return k ? '••••' : '';
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

function faltaTablaAsistente(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    error?.code === 'PGRST204' ||
    msg.includes('pos_asistente') ||
    msg.includes('schema cache') ||
    msg.includes('does not exist')
  );
}

export async function sincronizarClaveGroqDesdeNube(supabase) {
  if (!supabase) return { ok: true, cambio: false };
  const { data, error } = await supabase
    .from('pos_asistente')
    .select('groq_api_key, updated_at')
    .eq('id', 'global')
    .maybeSingle();
  if (error) {
    if (faltaTablaAsistente(error)) return { ok: true, sinColumna: true, cambio: false };
    return { ok: false, error: error.message };
  }
  const remota = String(data?.groq_api_key || '').trim();
  if (remota && remota !== leerClaveGroq()) {
    guardarClaveGroqLocal(remota);
    return { ok: true, cambio: true };
  }
  return { ok: true, cambio: false };
}

export async function subirClaveGroqANube(supabase, clave) {
  if (!supabase) return { ok: true };
  const groq_api_key = String(clave || '').trim() || null;
  const { error } = await supabase.from('pos_asistente').upsert({
    id: 'global',
    groq_api_key,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (faltaTablaAsistente(error)) {
      return {
        ok: false,
        sinColumna: true,
        error: 'Falta la tabla pos_asistente. En Supabase → SQL Editor ejecuta TODO supabase/fix_asistente_groq.sql',
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function completarGroq({ clave, pregunta, fragmentos = [] }) {
  const key = String(clave || leerClaveGroq() || '').trim();
  if (!key) return { ok: false, sinClave: true };

  const contexto = (fragmentos || [])
    .slice(0, 4)
    .map((f) => `## ${String(f.titulo || '').slice(0, 120)}\n${String(f.texto || '').slice(0, 1400)}`)
    .join('\n\n')
    .slice(0, 6000);

  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 450,
      messages: [
        { role: 'system', content: SISTEMA },
        {
          role: 'user',
          content: `Pregunta del empleado:\n${String(pregunta || '').slice(0, 500)}\n\nManual:\n${contexto}`,
        },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Groq HTTP ${res.status}`;
    return { ok: false, error: msg, status: res.status };
  }
  const texto = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!texto) return { ok: false, error: 'Groq no devolvió texto.' };
  return { ok: true, texto, modelo: 'groq' };
}
