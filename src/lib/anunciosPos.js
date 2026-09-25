const LS_ANUNCIOS = 'pos3b_anuncios_pos';
const LS_VISTOS = 'pos3b_anuncios_vistos';
export const EVENTO_ANUNCIOS = 'pos3b-anuncios-cambio';

export const DURACION_ANUNCIO_OPTS = [
  { horas: 1, label: '1 hora' },
  { horas: 4, label: '4 horas' },
  { horas: 8, label: '8 horas' },
  { horas: 24, label: '24 horas' },
  { horas: 72, label: '3 días' },
  { horas: 168, label: '7 días' },
];

function emitirCambio() {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_ANUNCIOS));
  } catch {
    /* ignore */
  }
}

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('anuncios_pos') || (msg.includes('schema cache') && msg.includes('anuncios'));
}

function leerLocal() {
  try {
    const raw = localStorage.getItem(LS_ANUNCIOS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function guardarLocal(list) {
  localStorage.setItem(LS_ANUNCIOS, JSON.stringify(list));
  emitirCambio();
}

function leerVistos() {
  try {
    const raw = sessionStorage.getItem(LS_VISTOS);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function guardarVistos(set) {
  sessionStorage.setItem(LS_VISTOS, JSON.stringify([...set]));
}

/** Al iniciar sesión se vuelve a mostrar el anuncio activo en cualquier sucursal. */
export function limpiarAnunciosVistos() {
  try {
    sessionStorage.removeItem(LS_VISTOS);
  } catch {
    /* ignore */
  }
}

export function marcarAnuncioVisto(id) {
  if (!id) return;
  const v = leerVistos();
  v.add(id);
  guardarVistos(v);
}

export function anuncioFueVisto(id) {
  return leerVistos().has(id);
}

function vigente(a) {
  if (!a?.activo) return false;
  const exp = a.expira_at ? new Date(a.expira_at).getTime() : 0;
  if (exp && Date.now() > exp) return false;
  return true;
}

/** Límite recomendado para imagen compacta de anuncio (lado mayor / bytes). */
export const ANUNCIO_IMAGEN_MAX_SIDE = 480;
export const ANUNCIO_IMAGEN_MAX_BYTES = 180 * 1024;

/** Tamaño del modal según descripción e imagen opcional. */
export function tamanoVentanaAnuncio(descripcion, tieneImagen = false) {
  const len = String(descripcion || '').length;
  if (tieneImagen) {
    if (len < 120) return { maxWidth: 'min(92vw, 420px)', minHeight: '200px' };
    if (len < 320) return { maxWidth: 'min(94vw, 520px)', minHeight: '260px' };
    return { maxWidth: 'min(96vw, 640px)', minHeight: '320px' };
  }
  if (len < 80) return { maxWidth: 'min(92vw, 380px)', minHeight: '120px' };
  if (len < 220) return { maxWidth: 'min(92vw, 520px)', minHeight: '180px' };
  if (len < 500) return { maxWidth: 'min(94vw, 680px)', minHeight: '260px' };
  return { maxWidth: 'min(96vw, 860px)', minHeight: '340px' };
}

export async function listarAnuncios(supabase) {
  if (supabase) {
    const { data, error } = await supabase
      .from('anuncios_pos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error) return { data: data || [], fuente: 'nube' };
    if (!faltaTabla(error)) return { data: [], error: error.message, fuente: 'nube' };
  }
  return { data: leerLocal().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), fuente: 'local' };
}

export async function hayAnuncioActivo(supabase) {
  const { data } = await listarAnuncios(supabase);
  return (data || []).some((a) => vigente(a));
}

export async function obtenerAnuncioParaMostrar(supabase) {
  const { data } = await listarAnuncios(supabase);
  const activos = (data || []).filter((a) => vigente(a));
  activos.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  for (const a of activos) {
    if (!anuncioFueVisto(a.id)) return a;
  }
  return null;
}

export async function crearAnuncio(supabase, { asunto, descripcion, duracionHoras, creadoPor, imagenUrl }) {
  const asuntoT = String(asunto || '').trim();
  const descT = String(descripcion || '').trim();
  if (!asuntoT) return { ok: false, error: 'Escribe el asunto del anuncio.' };
  if (!descT) return { ok: false, error: 'Escribe la descripción del anuncio.' };
  const img = String(imagenUrl || '').trim();
  if (img && !img.startsWith('data:image/') && !/^https?:\/\//i.test(img)) {
    return { ok: false, error: 'La imagen del anuncio no es válida.' };
  }
  const horas = Number(duracionHoras) || 24;
  const expira_at = new Date(Date.now() + horas * 3600000).toISOString();
  const row = {
    asunto: asuntoT,
    descripcion: descT,
    imagen_url: img || null,
    duracion_horas: horas,
    activo: true,
    creado_por: creadoPor || '—',
    sucursal_id: null,
    expira_at,
    created_at: new Date().toISOString(),
  };

  if (supabase) {
    const { data, error } = await supabase.from('anuncios_pos').insert([row]).select().single();
    if (!error) {
      emitirCambio();
      return { ok: true, anuncio: data };
    }
    // Columna imagen_url aún no migrada: reintentar solo texto
    const msg = String(error?.message || '').toLowerCase();
    if (row.imagen_url && (msg.includes('imagen_url') || msg.includes('schema cache'))) {
      const { imagen_url: _omit, ...sinImg } = row;
      const retry = await supabase.from('anuncios_pos').insert([sinImg]).select().single();
      if (!retry.error) {
        emitirCambio();
        return {
          ok: true,
          anuncio: retry.data,
          avisoLocal: false,
          aviso: 'Anuncio publicado sin imagen. Ejecuta supabase/fix_anuncios_pos.sql para habilitar imágenes.',
        };
      }
    }
    if (!faltaTabla(error)) return { ok: false, error: error.message };
  }

  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `loc-${Date.now()}`;
  const anuncio = { id, ...row };
  const list = leerLocal();
  list.unshift(anuncio);
  guardarLocal(list);
  return { ok: true, anuncio, avisoLocal: true };
}

export async function desactivarAnuncio(supabase, id) {
  if (!id) return { ok: false, error: 'Sin ID.' };
  if (supabase) {
    const { error } = await supabase.from('anuncios_pos').update({ activo: false }).eq('id', id);
    if (!error) {
      emitirCambio();
      return { ok: true };
    }
    if (!faltaTabla(error)) return { ok: false, error: error.message };
  }
  const list = leerLocal().map((a) => (a.id === id ? { ...a, activo: false } : a));
  guardarLocal(list);
  return { ok: true };
}

export const AVISO_SQL_ANUNCIOS =
  'Para sincronizar anuncios entre equipos ejecuta supabase/fix_anuncios_pos.sql en Supabase.';
