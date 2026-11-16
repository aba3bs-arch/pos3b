/**
 * Arrendatarios: no son empleados de las 3B.
 * Fiado y anticipo de renta salen como egreso (vale o préstamo) y no van a nómina.
 */
import { slugBeneficiarioVale } from './contabilidadConstants.js';

const LS_KEY = 'pos3b_beneficiarios_externos';
export const EVENTO_BENEFICIARIOS_EXTERNOS = 'pos3b-beneficiarios-externos';
export const AVISO_FALTA_BENEFICIARIOS_EXTERNOS =
  'Opcional: ejecuta supabase/fix_beneficiarios_externos.sql para compartir arrendatarios entre sucursales.';

export const MARCA_ARRENDATARIO = '[ARRENDATARIO]';

export const CONCEPTOS_ARRENDATARIO = [
  { id: 'fiado', label: 'Fiado' },
  { id: 'anticipo-renta', label: 'Anticipo de renta' },
];

export function esConceptoArrendatario(categoria) {
  const c = String(categoria || '').trim().toLowerCase();
  return CONCEPTOS_ARRENDATARIO.some((x) => x.id === c);
}

export function etiquetaConceptoArrendatario(categoria) {
  const c = String(categoria || '').trim().toLowerCase();
  return CONCEPTOS_ARRENDATARIO.find((x) => x.id === c)?.label || '';
}

function normalizarNombre(nombre) {
  return String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizar(row) {
  if (!row) return null;
  const nombre = String(row.nombre || '').trim();
  if (!nombre) return null;
  const id = String(row.id || '').trim();
  if (!id) return null;
  return {
    id,
    nombre,
    nota: String(row.nota || '').trim(),
    tipo: 'arrendatario',
    activo: row.activo !== false,
  };
}

export function leerBeneficiariosExternos() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizar).filter(Boolean);
  } catch {
    return [];
  }
}

export function guardarBeneficiariosExternosLocal(lista) {
  const limpia = (lista || []).map(normalizar).filter(Boolean);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, JSON.stringify(limpia));
  } catch {
    /* quota */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_BENEFICIARIOS_EXTERNOS, { detail: limpia }));
  }
  return limpia;
}

export function listarArrendatariosActivos(lista = null) {
  return (lista || leerBeneficiariosExternos())
    .filter((b) => b.activo !== false)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function idSelectArrendatario(id) {
  return `arr:${id}`;
}

export function arrendatarioDesdeSelect(valor, lista = null) {
  const raw = String(valor || '');
  if (!raw.startsWith('arr:')) return null;
  const id = raw.slice(4);
  return listarArrendatariosActivos(lista).find((b) => b.id === id) || null;
}

function nuevoId(nombre) {
  const slug = slugBeneficiarioVale(nombre).slice(0, 28);
  const suf = Math.random().toString(36).slice(2, 6);
  return `arr-${slug || 'persona'}-${suf}`;
}

export function crearArrendatario({ nombre, nota } = {}, lista = null) {
  const limpio = String(nombre || '').trim();
  if (limpio.length < 3) return { ok: false, error: 'Escribe el nombre del arrendatario.' };
  const actual = lista || leerBeneficiariosExternos();
  const key = normalizarNombre(limpio);
  if (actual.some((b) => b.activo !== false && normalizarNombre(b.nombre) === key)) {
    return { ok: false, error: 'Ese arrendatario ya está en la lista.' };
  }
  const row = normalizar({
    id: nuevoId(limpio),
    nombre: limpio,
    nota,
    tipo: 'arrendatario',
    activo: true,
  });
  const next = guardarBeneficiariosExternosLocal([...actual.filter((b) => b.id !== row.id), row]);
  return { ok: true, beneficiario: row, lista: next };
}

export function desactivarArrendatario(id, lista = null) {
  const key = String(id || '');
  const actual = lista || leerBeneficiariosExternos();
  if (!actual.some((b) => b.id === key)) return { ok: false, error: 'No está en la lista.' };
  const next = guardarBeneficiariosExternosLocal(
    actual.map((b) => (b.id === key ? { ...b, activo: false } : b)),
  );
  return { ok: true, lista: next };
}

/** Notas del préstamo: la marca evita que nómina lo descuente. */
export function notasPrestamoArrendatario(conceptoId, notas = '') {
  const etiqueta = etiquetaConceptoArrendatario(conceptoId) || 'Fiado';
  const extra = String(notas || '').trim();
  const base = `${MARCA_ARRENDATARIO} ${etiqueta}`;
  return extra ? `${base} · ${extra}` : base;
}

export function esPrestamoArrendatario(prestamo) {
  if (!prestamo) return false;
  if (String(prestamo.tipo || '') === 'arrendatario') return true;
  if (String(prestamo.beneficiario_tipo || '') === 'arrendatario') return true;
  if (String(prestamo.usuario_id || '').startsWith('arr:')) return true;
  return String(prestamo.notas || '').includes(MARCA_ARRENDATARIO);
}

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('beneficiarios_externos');
}

async function upsertNube(supabase, row, createdBy) {
  const payload = {
    id: row.id,
    nombre: row.nombre,
    nota: row.nota || null,
    tipo: 'arrendatario',
    activo: row.activo !== false,
    created_by: createdBy || null,
  };
  const { error } = await supabase.from('beneficiarios_externos').upsert(payload, { onConflict: 'id' });
  if (error && faltaTabla(error)) return { ok: true, sinTabla: true };
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function sincronizarBeneficiariosExternos(supabase) {
  const local = leerBeneficiariosExternos();
  if (!supabase) return { ok: true, data: local, sinTabla: true };
  const { data, error } = await supabase
    .from('beneficiarios_externos')
    .select('id,nombre,nota,tipo,activo')
    .order('nombre');
  if (error) {
    if (faltaTabla(error)) {
      return { ok: true, data: local, sinTabla: true, aviso: AVISO_FALTA_BENEFICIARIOS_EXTERNOS };
    }
    return { ok: false, error: error.message, data: local };
  }
  const remotas = (data || []).map(normalizar).filter(Boolean);
  if (!remotas.length && local.length) {
    for (const row of local) {
      const up = await upsertNube(supabase, row);
      if (up.sinTabla) {
        return { ok: true, data: local, sinTabla: true, aviso: AVISO_FALTA_BENEFICIARIOS_EXTERNOS };
      }
    }
    return { ok: true, data: local, cambio: false };
  }
  guardarBeneficiariosExternosLocal(remotas);
  return { ok: true, data: remotas, cambio: true };
}

export async function persistirArrendatario(supabase, row, createdBy) {
  if (!supabase || !row) return { ok: true, soloLocal: true };
  return upsertNube(supabase, row, createdBy);
}
