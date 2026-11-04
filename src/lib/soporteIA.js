/**
 * Respuesta con IA para las dudas que el bot de guías no reconoce.
 * Solo se usa como segundo intento: la pregunta ya pasó el filtro de seguridad y la IA solo
 * recibe las guías de los módulos que el usuario tiene. Cualquier falla devuelve null y el
 * chat conserva el aviso de solicitud abierta.
 */
import { evaluarPregunta, salidaSegura } from '../../supabase/functions/_shared/soporteSeguridad.js';

const ESPERA_MS = 15000;
const MAX_POR_HORA = 12;
const intentos = [];

function dentroDelLimite(ahora = Date.now()) {
  while (intentos.length && ahora - intentos[0] > 3600000) intentos.shift();
  if (intentos.length >= MAX_POR_HORA) return false;
  intentos.push(ahora);
  return true;
}

/**
 * @returns {Promise<{ texto: string, bloqueada?: boolean, categoria?: string }|null>}
 */
export async function responderConIA(supabase, { user, sucursal, pregunta, guias, modulos }) {
  if (!supabase?.functions?.invoke || !user?.id) return null;
  if (evaluarPregunta(pregunta).bloqueada) return null;
  if (!dentroDelLimite()) return null;
  try {
    const llamada = supabase.functions.invoke('soporte-ia', {
      body: {
        pregunta: String(pregunta || '').slice(0, 600),
        usuario_id: String(user.id),
        sucursal_id: sucursal != null ? String(sucursal) : null,
        guias: (guias || []).map((g) => ({ id: g.id, tema: g.tema, texto: g.texto })),
        modulos: Array.isArray(modulos) ? modulos.slice(0, 60) : [],
      },
    });
    const limite = new Promise((resolve) => setTimeout(() => resolve({ error: 'tiempo' }), ESPERA_MS));
    const { data, error } = await Promise.race([llamada, limite]);
    if (error || !data?.ok || !data.respuesta) return null;
    if (data.bloqueada) {
      return { texto: String(data.respuesta).slice(0, 600), bloqueada: true, categoria: String(data.categoria || 'ia') };
    }
    const texto = String(data.respuesta).trim().slice(0, 1200);
    if (!texto || !salidaSegura(texto)) return null;
    return { texto };
  } catch {
    return null;
  }
}
