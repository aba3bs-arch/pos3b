import { MANUAL_ADMIN_SECCIONES } from '../content/manualAdminSections.js';
import { FAQ_USO_POS } from '../content/faqUsoPos.js';

const STOP = new Set([
  'el', 'la', 'de', 'que', 'como', 'para', 'una', 'uno', 'los', 'las', 'del', 'con', 'por',
  'en', 'al', 'se', 'su', 'mi', 'un', 'y', 'o', 'a', 'es', 'hay', 'me', 'te', 'le', 'lo',
  'si', 'no', 'ya', 'tu', 'mas', 'más', 'puedo', 'puedes', 'puede', 'quiero', 'necesito',
  'app', 'pos', 'sistema', 'hacer', 'donde', 'dónde', 'que', 'qué', 'cual', 'cuál',
  'esta', 'este', 'esto', 'the', 'and',
]);

export const SUGERENCIAS_USO = [
  '¿Cómo cobro una venta?',
  '¿Cómo hago el corte de caja?',
  'El PIN no me deja entrar',
  'El precio en caja no es el del producto',
  '¿Dónde comparo ventas vs inventario?',
  '¿Cómo surto el piso desde CEDIS?',
  '¿Cómo recibo una compra?',
];

export function sinAcentos(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function tokensPregunta(q) {
  return sinAcentos(q)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

export function listarBaseConocimiento() {
  const faq = FAQ_USO_POS.map((s) => ({
    id: s.id,
    titulo: s.title,
    keywords: s.keywords || [],
    cuerpo: s.body,
    origen: 'Guía rápida',
    peso: 2.2,
  }));
  const manual = MANUAL_ADMIN_SECCIONES.map((s) => ({
    id: `manual-${s.id}`,
    titulo: s.title,
    keywords: s.keywords || [],
    cuerpo: s.body,
    origen: 'Manual administrador',
    peso: 1,
  }));
  return [...faq, ...manual];
}

function puntuar(doc, toks, qNorm) {
  const titulo = sinAcentos(doc.titulo);
  const keys = sinAcentos((doc.keywords || []).join(' '));
  const cuerpo = sinAcentos(doc.cuerpo).slice(0, 8000);
  let score = 0;
  for (const t of toks) {
    if (titulo.includes(t)) score += 8;
    if (keys.includes(t)) score += 6;
    if (cuerpo.includes(t)) score += 1.2;
  }
  if (qNorm && titulo.includes(qNorm)) score += 12;
  return score * (doc.peso || 1);
}

function extractos(cuerpo, toks, maxParrafos = 3) {
  const bloques = String(cuerpo || '')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (!toks.length) return bloques.slice(0, maxParrafos);
  const ranked = bloques
    .map((b) => {
      const n = sinAcentos(b);
      let hit = 0;
      for (const t of toks) if (n.includes(t)) hit += 1;
      return { b, hit };
    })
    .filter((x) => x.hit > 0)
    .sort((a, b) => b.hit - a.hit);
  const picked = (ranked.length ? ranked : bloques.map((b) => ({ b, hit: 0 })))
    .slice(0, maxParrafos)
    .map((x) => x.b);
  return picked;
}

/**
 * Respuesta local (sin API): recupera secciones del manual y arma un texto.
 */
export function responderUsoLocal(pregunta) {
  const q = String(pregunta || '').trim();
  const toks = tokensPregunta(q);
  const qNorm = sinAcentos(q);
  if (q.length < 3 || toks.length === 0) {
    return {
      ok: true,
      modo: 'local',
      texto: 'Pregúntame cómo usar el POS: cobrar, corte de caja, PIN, precios, traspasos o compras.',
      fuentes: [],
      fragmentos: [],
    };
  }

  const docs = listarBaseConocimiento()
    .map((d) => ({ ...d, score: puntuar(d, toks, qNorm) }))
    .filter((d) => d.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (!docs.length) {
    return {
      ok: true,
      modo: 'local',
      texto:
        'No encontré eso en el manual. Prueba con: **cómo cobrar**, **corte de caja**, **PIN**, **precio distinto**, **traspaso** o **compras**. También está en **Ayuda**.',
      fuentes: [],
      fragmentos: [],
    };
  }

  const fragmentos = docs.map((d) => ({
    id: d.id,
    titulo: d.titulo,
    origen: d.origen,
    texto: extractos(d.cuerpo, toks).join('\n\n').slice(0, 1400),
  }));

  const partes = [];
  partes.push(fragmentos[0].texto);
  if (fragmentos[1] && docs[1].score >= docs[0].score * 0.45) {
    partes.push(`**También:** ${fragmentos[1].titulo}\n\n${fragmentos[1].texto}`);
  }
  partes.push('_Fuente: manual POS CONTROL 3B. Si algo no cuadra, confirma en el módulo indicado._');

  return {
    ok: true,
    modo: 'local',
    texto: partes.join('\n\n'),
    fuentes: fragmentos.map((f) => ({ id: f.id, titulo: f.titulo, origen: f.origen })),
    fragmentos,
  };
}

let nubeInhabilitada = false;

function iaNubeHabilitada() {
  try {
    if (typeof window !== 'undefined' && window.__POS3B_CONFIG__?.asistenteIa) return true;
  } catch {
    /* ignore */
  }
  try {
    const v = String(import.meta.env?.VITE_ASISTENTE_IA || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'si';
  } catch {
    return false;
  }
}

export async function consultarAsistenteNube(supabase, { pregunta, rol, fragmentos }) {
  if (nubeInhabilitada || !iaNubeHabilitada() || !supabase?.functions?.invoke) {
    return { ok: false, skipped: true };
  }
  try {
    const invocacion = supabase.functions.invoke('asistente-uso', {
      body: {
        pregunta: String(pregunta || '').slice(0, 500),
        rol: String(rol || '').slice(0, 40),
        fragmentos: (fragmentos || []).slice(0, 4).map((f) => ({
          titulo: String(f.titulo || '').slice(0, 120),
          texto: String(f.texto || '').slice(0, 1400),
        })),
      },
    });
    const timeout = new Promise((resolve) => {
      setTimeout(() => resolve({ timeout: true }), 3500);
    });
    const raced = await Promise.race([invocacion.then((r) => ({ invocacion: r })), timeout]);
    if (raced?.timeout) {
      nubeInhabilitada = true;
      return { ok: false, skipped: true };
    }
    const { data, error } = raced.invocacion || {};
    if (error) {
      nubeInhabilitada = true;
      return { ok: false, error: error.message || String(error) };
    }
    if (data?.sinClave) {
      nubeInhabilitada = true;
      return { ok: false, sinClave: true };
    }
    if (!data?.ok || !data?.texto) {
      nubeInhabilitada = true;
      return { ok: false, error: data?.error };
    }
    return { ok: true, texto: data.texto, modelo: data.modelo || 'ia' };
  } catch (e) {
    nubeInhabilitada = true;
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function responderUso(pregunta, { supabase, rol } = {}) {
  const local = responderUsoLocal(pregunta);
  const nube = await consultarAsistenteNube(supabase, {
    pregunta,
    rol,
    fragmentos: local.fragmentos,
  });
  if (nube.ok) {
    return {
      ok: true,
      modo: 'ia',
      texto: nube.texto,
      modelo: nube.modelo,
      fuentes: local.fuentes,
      fragmentos: local.fragmentos,
    };
  }
  return local;
}
