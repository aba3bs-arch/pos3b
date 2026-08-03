import { listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';

function esCategoriaProveedores(categoria) {
  return String(categoria || '')
    .trim()
    .toUpperCase()
    .includes('PROVEEDOR');
}

export const AVISO_FALTA_TABLA_ENTREGAS =
  'Ejecuta en Supabase: supabase/fix_proveedor_entregas.sql para la matriz de días de entrega.';

/** 1=Lun … 7=Dom */
export const DIAS_ENTREGA = [
  { dia: 1, corto: 'Lun', largo: 'Lunes' },
  { dia: 2, corto: 'Mar', largo: 'Martes' },
  { dia: 3, corto: 'Mié', largo: 'Miércoles' },
  { dia: 4, corto: 'Jue', largo: 'Jueves' },
  { dia: 5, corto: 'Vie', largo: 'Viernes' },
  { dia: 6, corto: 'Sáb', largo: 'Sábado' },
  { dia: 7, corto: 'Dom', largo: 'Domingo' },
];

/** Alias frecuentes de subcategoría de corte → nombre canónico en catálogo. */
const ALIAS_PROVEEDOR = {
  'COCA COLA': 'Coca-Cola',
  COCACOLA: 'Coca-Cola',
  PEPSI: 'Pepsi',
  SABRITAS: 'Sabritas',
  BIMBO: 'bimbo',
  GAMEZA: 'Gamesa',
  GAMESA: 'Gamesa',
  'SNACKY PARTY': 'Snacky',
  SNACKY: 'Snacky',
  'BIG C FRUTS': 'Big',
  'BIG C FRUITS': 'Big',
  BIG: 'Big',
  TORTILLAS: 'tortillas',
  PANADERIA: 'PANADERIA',
  'PAN DULCE': 'PANADERIA',
  ABARROTES: 'Abarrotes',
  LALA: 'Lala',
  MONDELEZ: 'Mondelez',
  PEDIGREE: 'Pedigree',
  BARCEL: 'barcel',
  TOSTITOS: 'tostitos',
  PEÑAFIEL: 'peñafiel',
  PENAFIEL: 'peñafiel',
  KELLOGS: 'kelloggs',
  KELLOGGS: 'kelloggs',
};

export function esErrorTablaEntregas(error) {
  const msg = String(error?.message || '');
  return error?.code === '42P01' || (msg.includes('relation') && msg.includes('proveedor_entregas'));
}

export function sucursalesParaMatrizEntregas() {
  return listarSucursalesOperativas();
}

/** Normaliza para comparar nombres (sin acentos, mayúsculas). */
export function normalizarNombreProveedorClave(nombre) {
  return String(nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nombre a mostrar/guardar: alias o texto limpio de la subcategoría del corte. */
export function nombreProveedorDesdeGasto(subcategoria) {
  const raw = String(subcategoria || '').trim();
  if (!raw) return '';
  const key = normalizarNombreProveedorClave(raw);
  if (!key || ['PAGO', 'MERCANCIA', 'OTROS', 'PROVEEDORES'].includes(key)) return '';
  if (ALIAS_PROVEEDOR[key]) return ALIAS_PROVEEDOR[key];
  return raw.replace(/\s+/g, ' ').trim();
}

/** ISO day 1=Lun…7=Dom en zona Nogales/Hermosillo. */
export function diaSemanaDesdeFecha(isoOrDate = new Date()) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  const w = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Hermosillo', weekday: 'short' }).format(d);
  const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[w] || null;
}

/**
 * @returns {{ data: Array<{id, proveedor_id, sucursal_id, dia_semana}>, error: string|null, faltaTabla?: boolean }}
 */
export async function listarEntregasProveedores(supabase) {
  if (!supabase) return { data: [], error: null };
  const { data, error } = await supabase
    .from('proveedor_entregas')
    .select('id, proveedor_id, sucursal_id, dia_semana')
    .order('sucursal_id')
    .order('dia_semana');
  if (error) {
    if (esErrorTablaEntregas(error)) return { data: [], error: AVISO_FALTA_TABLA_ENTREGAS, faltaTabla: true };
    return { data: [], error: error.message };
  }
  return { data: data || [], error: null };
}

/**
 * Mapa: `${sucursal}|${dia}` → [{ id, proveedor_id }, ...]
 */
export function mapaEntregasPorCelda(filas = []) {
  const map = {};
  for (const f of filas) {
    const suc = normalizarCodigoTienda(f.sucursal_id);
    const dia = Number(f.dia_semana);
    if (!suc || !Number.isFinite(dia)) continue;
    const key = `${suc}|${dia}`;
    if (!map[key]) map[key] = [];
    map[key].push({ id: f.id, proveedor_id: f.proveedor_id });
  }
  return map;
}

export async function agregarEntregaProveedor(supabase, { proveedorId, sucursalId, diaSemana }) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const proveedor_id = proveedorId;
  const sucursal_id = normalizarCodigoTienda(sucursalId);
  const dia_semana = Number(diaSemana);
  if (!proveedor_id || !sucursal_id) return { ok: false, error: 'Falta proveedor o sucursal.' };
  if (!Number.isFinite(dia_semana) || dia_semana < 1 || dia_semana > 7) {
    return { ok: false, error: 'Día de semana inválido.' };
  }

  const { error } = await supabase.from('proveedor_entregas').insert([{ proveedor_id, sucursal_id, dia_semana }]);
  if (error) {
    if (esErrorTablaEntregas(error)) return { ok: false, error: AVISO_FALTA_TABLA_ENTREGAS, faltaTabla: true };
    if (error.code === '23505') return { ok: true, yaExiste: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function quitarEntregaProveedor(supabase, entregaId) {
  if (!supabase || !entregaId) return { ok: false, error: 'Sin conexión.' };
  const { error } = await supabase.from('proveedor_entregas').delete().eq('id', entregaId);
  if (error) {
    if (esErrorTablaEntregas(error)) return { ok: false, error: AVISO_FALTA_TABLA_ENTREGAS, faltaTabla: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Busca o crea proveedor solo por nombre (para matriz / gastos de corte). */
export async function asegurarProveedorPorNombre(supabase, nombreRaw) {
  const nombre = String(nombreRaw || '').trim();
  if (!supabase || !nombre) return { ok: false, error: 'Nombre vacío.' };
  const clave = normalizarNombreProveedorClave(nombre);

  const { data, error } = await supabase.from('proveedores').select('id, nombre');
  if (error) return { ok: false, error: error.message };

  const hit = (data || []).find((p) => normalizarNombreProveedorClave(p.nombre) === clave);
  if (hit) return { ok: true, id: hit.id, nombre: hit.nombre, creado: false };

  const { data: created, error: eIns } = await supabase
    .from('proveedores')
    .insert([{ nombre }])
    .select('id, nombre')
    .single();
  if (eIns) return { ok: false, error: eIns.message };
  return { ok: true, id: created.id, nombre: created.nombre, creado: true };
}

/**
 * Si el gasto de Abarrotes es de PROVEEDORES, registra nombre + día en la matriz.
 * No bloquea el corte si falla (solo best-effort).
 */
export async function registrarEntregaDesdeGastoAbarrotes(supabase, { sucursalId, categoria, subcategoria, fecha }) {
  if (!supabase) return { ok: false, skipped: true };
  if (!esCategoriaProveedores(categoria)) return { ok: true, skipped: true };
  const nombre = nombreProveedorDesdeGasto(subcategoria);
  if (!nombre) return { ok: true, skipped: true, reason: 'sin_nombre' };

  const dia = diaSemanaDesdeFecha(fecha || new Date());
  if (!dia) return { ok: false, error: 'Fecha inválida.' };

  const prov = await asegurarProveedorPorNombre(supabase, nombre);
  if (!prov.ok) return prov;

  const add = await agregarEntregaProveedor(supabase, {
    proveedorId: prov.id,
    sucursalId,
    diaSemana: dia,
  });
  if (!add.ok) return add;
  return {
    ok: true,
    proveedorId: prov.id,
    nombre: prov.nombre,
    dia,
    creadoProveedor: Boolean(prov.creado),
    yaExiste: Boolean(add.yaExiste),
  };
}
