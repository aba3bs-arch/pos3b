/**
 * Cuentas de Venta en Ruta: efectivo (automática) y helpers de rol.
 * El vendedor no puede ajustar saldos; solo ventas/cobranza/capital/admin.
 */

import { normalizarRol } from './roles.js';

const LS_EFECTIVO = 'pos3b_ruta_efectivo_movimientos';

export const AVISO_FALTA_CUENTAS_RUTA =
  'Faltan tablas de cuentas/capital de ruta. Ejecuta supabase/fix_venta_en_ruta_cuentas_capital.sql';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('ruta_efectivo');
}

function leerLocal() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_EFECTIVO) || '[]');
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function guardarLocal(lista) {
  try {
    localStorage.setItem(LS_EFECTIVO, JSON.stringify(lista.slice(0, 3000)));
  } catch {
    /* ignore */
  }
}

function uid() {
  return `efe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Admin/gerente surten almacén, liberan capital y ven cuentas con detalle. */
export function puedeAdministrarVentaRuta(rol) {
  const r = normalizarRol(rol);
  return r === 'Administrador' || r === 'Gerente';
}

/** Vendedor de ruta / repartidor / supervisor en campo. */
export function esVendedorRuta(rol) {
  const r = normalizarRol(rol);
  return r === 'Repartidor' || r === 'Supervisor';
}

export function puedeModificarStockCedisRuta(rol) {
  return puedeAdministrarVentaRuta(rol);
}

export function puedeModificarCuentasRuta(rol) {
  return puedeAdministrarVentaRuta(rol);
}

export async function listarMovimientosEfectivoRuta(supabase, { limit = 500 } = {}) {
  if (!supabase) return { data: leerLocal().slice(0, limit) };
  const { data, error } = await supabase
    .from('ruta_efectivo_movimientos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error && faltaTabla(error)) {
    return { data: leerLocal().slice(0, limit), aviso: AVISO_FALTA_CUENTAS_RUTA };
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function saldoEfectivoRuta(supabase) {
  const { data, error, aviso } = await listarMovimientosEfectivoRuta(supabase, { limit: 5000 });
  if (error) return { saldo: 0, error, aviso };
  const orden = [...(data || [])].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  let saldo = 0;
  for (const m of orden) {
    const monto = round2(m.monto);
    if (m.tipo === 'ingreso') saldo = round2(saldo + monto);
    else if (m.tipo === 'egreso') saldo = round2(saldo - monto);
  }
  return { saldo, aviso };
}

async function insertarMovEfectivo(supabase, payload) {
  const saldoRes = await saldoEfectivoRuta(supabase);
  const delta = payload.tipo === 'ingreso' ? round2(payload.monto) : -round2(payload.monto);
  const saldoDespues = round2((saldoRes.saldo || 0) + delta);
  const row = { ...payload, saldo_despues: saldoDespues, monto: round2(payload.monto) };

  if (!supabase) {
    const list = leerLocal();
    const full = { ...row, id: uid(), created_at: new Date().toISOString() };
    list.unshift(full);
    guardarLocal(list);
    return { ok: true, data: full, soloLocal: true, aviso: saldoRes.aviso };
  }
  const { data, error } = await supabase.from('ruta_efectivo_movimientos').insert([row]).select('*').single();
  if (error && faltaTabla(error)) return insertarMovEfectivo(null, payload);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data, aviso: saldoRes.aviso };
}

/** Ingreso a cuenta efectivo (venta o cobranza). Sistema interno — no UI de edición. */
export async function registrarIngresoEfectivoRuta(supabase, {
  monto,
  origen = 'venta',
  refTabla,
  refId,
  notas,
  usuarioNombre,
} = {}) {
  const m = round2(monto);
  if (!(m > 0)) return { ok: false, error: 'Monto inválido.' };
  return insertarMovEfectivo(supabase, {
    tipo: 'ingreso',
    origen: String(origen || 'venta'),
    monto: m,
    ref_tabla: refTabla || null,
    ref_id: refId != null ? String(refId) : null,
    notas: notas || null,
    usuario_nombre: usuarioNombre || null,
  });
}

/** Egreso de cuenta efectivo (capital liberado u otro). */
export async function registrarEgresoEfectivoRuta(supabase, {
  monto,
  origen = 'capital',
  refTabla,
  refId,
  notas,
  usuarioNombre,
} = {}) {
  const m = round2(monto);
  if (!(m > 0)) return { ok: false, error: 'Monto inválido.' };
  const { saldo } = await saldoEfectivoRuta(supabase);
  if (m > saldo + 0.009 && origen === 'ajuste') {
    /* admin ajuste puede forzar */
  }
  return insertarMovEfectivo(supabase, {
    tipo: 'egreso',
    origen: String(origen || 'capital'),
    monto: m,
    ref_tabla: refTabla || null,
    ref_id: refId != null ? String(refId) : null,
    notas: notas || null,
    usuario_nombre: usuarioNombre || null,
  });
}

/** Solo admin/gerente: ajuste manual de cuenta efectivo. */
export async function ajustarEfectivoRuta(supabase, { monto, tipo, notas, usuarioNombre, rol } = {}) {
  if (!puedeModificarCuentasRuta(rol)) {
    return { ok: false, error: 'Solo administrador o gerente pueden ajustar la cuenta de efectivo.' };
  }
  const m = round2(Math.abs(Number(monto) || 0));
  if (!(m > 0)) return { ok: false, error: 'Monto inválido.' };
  const t = String(tipo || 'ingreso') === 'egreso' ? 'egreso' : 'ingreso';
  return insertarMovEfectivo(supabase, {
    tipo: t,
    origen: 'ajuste',
    monto: m,
    notas: notas || 'Ajuste admin',
    usuario_nombre: usuarioNombre || null,
  });
}
