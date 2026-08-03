import { listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';

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

export function esErrorTablaEntregas(error) {
  const msg = String(error?.message || '');
  return error?.code === '42P01' || (msg.includes('relation') && msg.includes('proveedor_entregas'));
}

export function sucursalesParaMatrizEntregas() {
  return listarSucursalesOperativas();
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
    if (error.code === '23505') return { ok: false, error: 'Ese proveedor ya está en ese día.' };
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
