import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { normalizarRol } from './roles.js';
import { nombreTurnoLegible, turnoActual } from './turnos.js';
import { esUsuarioCubreTurno } from './cubreTurno.js';

export const AREAS_PAGARE = ['virtual', 'garage', 'abarrotes'];

export const ETIQUETA_AREA_PAGARE = {
  virtual: 'Virtual',
  garage: 'Garage',
  abarrotes: 'Abarrotes',
};

export const AVISO_FALTA_PAGARES =
  'Falta la tabla pagares. Ejecuta supabase/fix_pagares.sql en Supabase → SQL Editor.';

const ESTADOS_ABIERTOS = new Set(['abierto', 'parcial', 'por_recolectar']);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function faltaTablaPagares(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes('pagares')
    && (msg.includes('does not exist')
      || msg.includes('schema cache')
      || msg.includes('could not find the table'))
  );
}

export function textoPagare(monto) {
  const m = round2(monto);
  return (
    `Debo y pagaré la cantidad de: $${m.toFixed(2)} cuando sea solicitado por el recolector, `
    + 'de perderse esa cantidad, será descontada en nómina, según acuerdo de pagos.'
  );
}

export function normalizarAreaPagare(area) {
  const a = String(area || '').trim().toLowerCase();
  if (a === 'virtual' || a === 'garage' || a === 'abarrotes') return a;
  return null;
}

/** Admin, gerente o repartidor (recolector) generan el pagaré + ticket. */
export function puedeGenerarPagare(rol) {
  const r = normalizarRol(rol);
  return r === 'Administrador' || r === 'Gerente' || r === 'Repartidor';
}

/** Cajero / admin / gerente abonan o liquidan (sin ticket ni préstamo). Cubre turno: no. */
export function puedeAbonarLiquidarPagare(rol, user = null) {
  if (esUsuarioCubreTurno(user)) return false;
  const r = normalizarRol(rol ?? user?.rol ?? user?.role);
  return r === 'Administrador' || r === 'Gerente' || r === 'Cajero';
}

export function saldoPagare(p) {
  if (!p) return 0;
  if (p.saldo != null && p.saldo !== '') return round2(p.saldo);
  return round2(p.monto);
}

export function pagareEstaAbierto(p) {
  if (!p) return false;
  const est = String(p.estado || '').toLowerCase();
  if (ESTADOS_ABIERTOS.has(est)) return saldoPagare(p) > 0.001;
  return saldoPagare(p) > 0.001 && !['liquidado', 'recolectado', 'cancelado'].includes(est);
}

function folioPagare() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PAG-${y}${m}${day}-${r}`;
}

/**
 * Lista pagarés (más recientes primero).
 * @param {{ area?: string, sucursal?: string, soloAbiertos?: boolean, limit?: number }} [opts]
 */
export async function listarPagares(supabase, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', data: [] };
  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 500);
  let q = supabase.from('pagares').select('*').order('created_at', { ascending: false }).limit(limit);
  const area = normalizarAreaPagare(opts.area);
  if (area) q = q.eq('area', area);
  if (opts.sucursal) q = q.eq('sucursal_id', normalizarCodigoTienda(opts.sucursal));
  if (opts.soloAbiertos) q = q.in('estado', ['abierto', 'parcial', 'por_recolectar']);
  const { data, error } = await q;
  if (error) {
    if (faltaTablaPagares(error)) return { ok: false, error: AVISO_FALTA_PAGARES, data: [], faltaTabla: true };
    return { ok: false, error: error.message, data: [] };
  }
  let rows = data || [];
  if (opts.soloAbiertos) rows = rows.filter(pagareEstaAbierto);
  return { ok: true, data: rows };
}

/** Pagarés abiertos del área/sucursal del corte. */
export async function listarPagaresAbiertosParaCorte(supabase, { sucursal, modulo } = {}) {
  const area = normalizarAreaPagare(modulo);
  if (!supabase || !sucursal || !area) return { ok: true, data: [] };
  return listarPagares(supabase, { area, sucursal, soloAbiertos: true, limit: 50 });
}

/**
 * Genera pagaré desde la alerta de negativo (o formulario).
 * Imprime ticket 2 veces vía callback de impresión en el caller.
 */
export async function registrarPagare(supabase, payload = {}, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!puedeGenerarPagare(opts.rolActor ?? opts.user?.rol)) {
    return { ok: false, error: 'Solo administrador, gerente o recolector pueden generar un pagaré.' };
  }
  const area = normalizarAreaPagare(payload.area || payload.modulo);
  if (!area) return { ok: false, error: 'Área inválida (virtual, garage o abarrotes).' };
  const sucursal_id = normalizarCodigoTienda(payload.sucursal_id || payload.sucursal);
  if (!sucursal_id) return { ok: false, error: 'Sucursal requerida.' };
  const monto = round2(payload.monto);
  if (!(monto > 0.001)) return { ok: false, error: 'Monto del pagaré inválido.' };

  const cajero_nombre = String(payload.cajero_nombre || opts.user?.nombre || '').trim() || null;
  const cajero_id = payload.cajero_id || opts.user?.id || null;
  const turno_nombre = String(
    payload.turno_nombre
      || nombreTurnoLegible(turnoActual())
      || '',
  ).trim() || null;
  const texto = String(payload.texto || '').trim() || textoPagare(monto);
  const folio = String(payload.folio || '').trim() || folioPagare();

  const row = {
    folio,
    area,
    sucursal_id,
    monto,
    saldo: monto,
    abono: 0,
    estado: 'abierto',
    cajero_nombre,
    cajero_id: cajero_id ? String(cajero_id) : null,
    turno_nombre,
    texto,
    creado_por: opts.nombreActor || opts.user?.nombre || null,
    creado_por_rol: normalizarRol(opts.rolActor ?? opts.user?.rol) || null,
    notas: payload.notas || null,
  };

  const { data, error } = await supabase.from('pagares').insert([row]).select('*').single();
  if (error) {
    if (faltaTablaPagares(error)) return { ok: false, error: AVISO_FALTA_PAGARES, faltaTabla: true };
    return { ok: false, error: error.message };
  }
  return { ok: true, pagare: data, mensaje: `Pagaré ${folio} por $${monto.toFixed(2)} registrado.` };
}

export async function abonarPagare(supabase, pagare, montoAbono, opts = {}) {
  if (!supabase || !pagare?.id) return { ok: false, error: 'Pagaré inválido.' };
  if (esUsuarioCubreTurno(opts.user)) {
    return { ok: false, error: 'Cubre turno no puede abonar. Solo el cajero en su sesión.' };
  }
  if (!puedeAbonarLiquidarPagare(opts.rolActor ?? opts.user?.rol, opts.user)) {
    return { ok: false, error: 'Solo administrador, gerente o cajero pueden abonar un pagaré.' };
  }
  const saldo = saldoPagare(pagare);
  const monto = round2(montoAbono);
  if (!(monto > 0.001)) return { ok: false, error: 'Monto inválido.' };
  if (monto > saldo + 0.001) return { ok: false, error: `El abono ($${monto.toFixed(2)}) supera el saldo ($${saldo.toFixed(2)}).` };

  const nuevoSaldo = round2(Math.max(0, saldo - monto));
  const nuevoAbono = round2((Number(pagare.abono) || 0) + monto);
  const liquidado = nuevoSaldo < 0.001;
  const patch = {
    saldo: nuevoSaldo,
    abono: nuevoAbono,
    estado: liquidado ? 'liquidado' : 'parcial',
  };
  if (liquidado) {
    patch.liquidado_por = opts.nombreActor || opts.user?.nombre || null;
    patch.liquidado_at = new Date().toISOString();
  }

  const { data, error } = await supabase.from('pagares').update(patch).eq('id', pagare.id).select('*').single();
  if (error) {
    if (faltaTablaPagares(error)) return { ok: false, error: AVISO_FALTA_PAGARES, faltaTabla: true };
    return { ok: false, error: error.message };
  }
  return {
    ok: true,
    pagare: data,
    saldo: nuevoSaldo,
    mensaje: liquidado
      ? 'Pagaré liquidado. La alerta se elimina.'
      : `Abono registrado. Saldo restante: $${nuevoSaldo.toFixed(2)}.`,
  };
}

export async function liquidarPagare(supabase, pagare, opts = {}) {
  const saldo = saldoPagare(pagare);
  if (!(saldo > 0.001)) return { ok: false, error: 'El pagaré ya está liquidado.' };
  return abonarPagare(supabase, pagare, saldo, opts);
}

/** Marca pagarés abiertos como recibidos en RC Virtual (recolección). */
export async function registrarPagaresEnRcVirtual(supabase, { area, items, adminNombre } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', data: [] };
  const areaNorm = normalizarAreaPagare(area) || 'virtual';
  const list = Array.isArray(items) ? items : [];
  const ahora = new Date().toISOString();
  const out = [];

  // Si no hay ítems explícitos, toma pagarés abiertos del área.
  let pagares = list;
  if (!pagares.length) {
    const res = await listarPagares(supabase, { area: areaNorm, soloAbiertos: true, limit: 100 });
    if (!res.ok) return res;
    pagares = res.data || [];
  }

  for (const p of pagares) {
    if (!p?.id || !pagareEstaAbierto(p)) continue;
    const monto = saldoPagare(p);
    const { data, error } = await supabase
      .from('pagares')
      .update({
        estado: 'por_recolectar',
        rc_recibido_por: adminNombre || null,
        rc_recibido_at: ahora,
        rc_monto: round2((Number(p.rc_monto) || 0) + monto),
      })
      .eq('id', p.id)
      .select('*')
      .single();
    if (!error && data) out.push(data);
  }
  return { ok: true, data: out };
}
