/**
 * Asistente de uso del POS (opcional).
 *
 * Secrets en Supabase → Edge Functions → Secrets (NO van en VITE_):
 *   GROQ_API_KEY     (recomendado, capa gratis)  o
 *   OPENAI_API_KEY
 *
 * Si no hay clave, la app responde igual con el manual local.
 *
 * Deploy:
 *   supabase functions deploy asistente-uso
 */
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const SISTEMA = `Eres el asistente de uso de POS CONTROL 3B (Abarrotes Las 3B).
Responde SOLO con los fragmentos del manual que te pasan.
Habla en español, claro y breve (máximo 180 palabras).
Usa pasos numerados cuando expliques un procedimiento.
No inventes botones, precios, ni módulos que no estén en el manual.
No des consejos legales ni de hacking.
Si el manual no cubre la pregunta, dilo y sugiere preguntar por cobrar, corte, PIN, precios o traspasos.`;

async function completar({ url, key, model, pregunta, contexto }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 450,
      messages: [
        { role: 'system', content: SISTEMA },
        {
          role: 'user',
          content: `Pregunta del empleado:\n${pregunta}\n\nManual:\n${contexto}`,
        },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data).slice(0, 200);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  const texto = data?.choices?.[0]?.message?.content;
  if (!texto) throw new Error('La IA no devolvió texto.');
  return String(texto).trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const groq = Deno.env.get('GROQ_API_KEY') || '';
    const openai = Deno.env.get('OPENAI_API_KEY') || '';
    if (!groq && !openai) {
      return json({ ok: false, sinClave: true, error: 'Sin GROQ_API_KEY ni OPENAI_API_KEY.' });
    }

    const body = await req.json().catch(() => ({}));
    const pregunta = String(body.pregunta || '').trim().slice(0, 500);
    if (pregunta.length < 3) return json({ ok: false, error: 'Pregunta vacía.' }, 400);

    const fragmentos = Array.isArray(body.fragmentos) ? body.fragmentos : [];
    const contexto = fragmentos
      .slice(0, 4)
      .map((f) => `## ${String(f.titulo || '').slice(0, 120)}\n${String(f.texto || '').slice(0, 1400)}`)
      .join('\n\n')
      .slice(0, 6000);

    let texto;
    let modelo;
    if (groq) {
      texto = await completar({
        url: 'https://api.groq.com/openai/v1/chat/completions',
        key: groq,
        model: Deno.env.get('GROQ_MODEL') || 'llama-3.1-8b-instant',
        pregunta,
        contexto,
      });
      modelo = 'groq';
    } else {
      texto = await completar({
        url: 'https://api.openai.com/v1/chat/completions',
        key: openai,
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
        pregunta,
        contexto,
      });
      modelo = 'openai';
    }

    return json({ ok: true, texto, modelo });
  } catch (e) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
