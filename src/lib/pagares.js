import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { nombreCoincidePatrones, puedeEliminarRechazarRcVirtual } from './contabilidadConstants.js';
import { normalizarRol } from './roles.js';
import { nombreTurnoLegible, turnoActual } from './turnos.js';
import { esUsuarioCubreTurno } from './cubreTurno.js';

export const AREAS_PAGARE = ['virtual', 'garage', 'abarrotes'];

export const ETIQUETA_AREA_PAGARE = {
  virtual: 'Virtual',
  garage: 'Garage',
  abarrotes: 'Abarrotes',
};

export const ETIQUETA_ESTADO_PAGARE = {
  abierto: 'Abierto',
  parcial: 'Parcial (abonado)',
  por_recolectar: 'Por recolectar → RC Virtual',
  recolectado: 'Recolectado',
  liquidado: 'Liquidado',
  cancelado: 'Cancelado',
};

export const AVISO_FALTA_PAGARES =
  'Falta la tabla pagares. Ejecuta supabase/fix_pagares.sql en Supabase → SQL Editor.';

/** Quién puede pulsar Recolectar en Vales → Pagaré (por nombre, no solo rol). */
export const RECOLECTORES_PAGARE = [
  {
    id: 'luis-enrique',
    etiqueta: 'Luis Enrique Osuna Mada',
    patrones: [
      'luis enrique osuna mada',
      'luis enrique mada osuna',
      'luis enrique mada',
      'luis enrique osuna',
      'luis enrique',
    ],
  },
  { id: 'amr', etiqueta: 'AMR', patrones: ['amr', 'andres', 'andrés', 'marrero'] },
  { id: 'abb', etiqueta: 'ABB', patrones: ['abb', 'antonio'] },
  { id: 'jlbb', etiqueta: 'JLBB', patrones: ['jlbb', 'jose luis', 'josé luis'] },
  { id: 'fbbb', etiqueta: 'FBBB', patrones: ['fbbb', 'fjbb', 'francisco'] },
];

const ESTADOS_PENDIENTE_CAJERO = new Set(['abierto', 'parcial']);
const ESTADOS_PENDIENTE_RECOLECCION = new Set(['por_recolectar']);

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

export function etiquetaEstadoPagare(estado) {
  const e = String(estado || '').toLowerCase();
  return ETIQUETA_ESTADO_PAGARE[e] || estado || '—';
}

/** Admin, gerente o repartidor (recolector) generan el pagaré + ticket. */
export function puedeGenerarPagare(rol) {
  const r = normalizarRol(rol);
  return r === 'Administrador' || r === 'Gerente' || r === 'Repartidor';
}

/** Cajero / admin / gerente abonan o liquidan (sin ticket). Cubre turno: no. */
export function puedeAbonarLiquidarPagare(rol, user = null) {
  if (esUsuarioCubreTurno(user)) return false;
  const r = normalizarRol(rol ?? user?.rol ?? user?.role);
  return r === 'Administrador' || r === 'Gerente' || r === 'Cajero';
}

/** Luis Enrique, AMR, ABB, JLBB, FBBB (FJBB). */
export function puedeRecolectarPagare(userOrNombre) {
  const nombre = typeof userOrNombre === 'string'
    ? userOrNombre
    : (userOrNombre?.nombre || userOrNombre?.name || '');
  if (!nombre) return false;
  return RECOLECTORES_PAGARE.some((r) => nombreCoincidePatrones(nombre, r.patrones));
}

/** Administrador (rol) o AMR / ABB / JLBB / FJBB: Eliminar o Rechazar pagaré. */
export function puedeEliminarPagare(userOrNombre) {
  if (userOrNombre && typeof userOrNombre === 'object') {
    const rol = normalizarRol(userOrNombre.rol ?? userOrNombre.role);
    if (rol === 'Administrador') return true;
  }
  return puedeEliminarRechazarRcVirtual(userOrNombre);
}


export function saldoPagare(p) {
  if (!p) return 0;
  if (p.saldo != null && p.saldo !== '') return round2(p.saldo);
  return round2(p.monto);
}

export function montoPendienteRecoleccion(p) {
  if (!p) return 0;
  const rc = Number(p.rc_monto);
  if (Number.isFinite(rc) && rc > 0.001) return round2(rc);
  return saldoPagare(p);
}

/** Abierto para cajero (abonar / liquidar). */
export function pagarePendienteCajero(p) {
  if (!p) return false;
  const est = String(p.estado || '').toLowerCase();
  if (!ESTADOS_PENDIENTE_CAJERO.has(est)) return false;
  return saldoPagare(p) > 0.001;
}

/** Ya liquidado por cajero; espera Recolectar → RC Virtual. */
export function pagarePendienteRecoleccion(p) {
  if (!p) return false;
  const est = String(p.estado || '').toLowerCase();
  return ESTADOS_PENDIENTE_RECOLECCION.has(est) && montoPendienteRecoleccion(p) > 0.001;
}

export function pagareEstaAbierto(p) {
  if (!p) return false;
  const est = String(p.estado || '').toLowerCase();
  if (ESTADOS_PENDIENTE_CAJERO.has(est)) return saldoPagare(p) > 0.001;
  if (ESTADOS_PENDIENTE_RECOLECCION.has(est)) return montoPendienteRecoleccion(p) > 0.001;
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
 * @param {{ area?: string, sucursal?: string, soloAbiertos?: boolean, soloPorRecolectar?: boolean, limit?: number }} [opts]
 */
export async function listarPagares(supabase, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', data: [] };
  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 500);
  let q = supabase.from('pagares').select('*').order('created_at', { ascending: false }).limit(limit);
  const area = normalizarAreaPagare(opts.area);
  if (area) q = q.eq('area', area);
  if (opts.sucursal) q = q.eq('sucursal_id', normalizarCodigoTienda(opts.sucursal));
  if (opts.soloPorRecolectar) q = q.eq('estado', 'por_recolectar');
  else if (opts.soloAbiertos) q = q.in('estado', ['abierto', 'parcial', 'por_recolectar']);
  const { data, error } = await q;
  if (error) {
    if (faltaTablaPagares(error)) return { ok: false, error: AVISO_FALTA_PAGARES, data: [], faltaTabla: true };
    return { ok: false, error: error.message, data: [] };
  }
  let rows = data || [];
  if (opts.soloAbiertos) rows = rows.filter(pagareEstaAbierto);
  if (opts.soloPorRecolectar) rows = rows.filter(pagarePendienteRecoleccion);
  return { ok: true, data: rows };
}

/** Pagarés abiertos del área/sucursal del corte. */
export async function listarPagaresAbiertosParaCorte(supabase, { sucursal, modulo } = {}) {
  const area = normalizarAreaPagare(modulo);
  if (!supabase || !sucursal || !area) return { ok: true, data: [] };
  return listarPagares(supabase, { area, sucursal, soloAbiertos: true, limit: 50 });
}

/**
 * Genera pagaré (folio + tickets en el caller).
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
  return { ok: true, pagare: data, mensaje: `Pagaré ${folio} · ${sucursal_id} · $${monto.toFixed(2)} registrado.` };
}

/**
 * Abono parcial: pregunta monto y descuenta del saldo.
 * Si el abono deja saldo en 0 sin liquidar formal, queda liquidado (nada que recolectar).
 */
export async function abonarPagare(supabase, pagare, montoAbono, opts = {}) {
  if (!supabase || !pagare?.id) return { ok: false, error: 'Pagaré inválido.' };
  if (esUsuarioCubreTurno(opts.user)) {
    return { ok: false, error: 'Cubre turno no puede abonar. Solo el cajero en su sesión.' };
  }
  if (!puedeAbonarLiquidarPagare(opts.rolActor ?? opts.user?.rol, opts.user)) {
    return { ok: false, error: 'Solo administrador, gerente o cajero pueden abonar un pagaré.' };
  }
  if (!pagarePendienteCajero(pagare)) {
    return { ok: false, error: 'Este pagaré ya no admite abonos (está por recolectar o cerrado).' };
  }
  const saldo = saldoPagare(pagare);
  const monto = round2(montoAbono);
  if (!(monto > 0.001)) return { ok: false, error: 'Monto inválido.' };
  if (monto > saldo + 0.001) {
    return { ok: false, error: `El abono ($${monto.toFixed(2)}) supera el saldo ($${saldo.toFixed(2)}).` };
  }

  const nuevoSaldo = round2(Math.max(0, saldo - monto));
  const nuevoAbono = round2((Number(pagare.abono) || 0) + monto);
  const cerrado = nuevoSaldo < 0.001;
  const patch = {
    saldo: nuevoSaldo,
    abono: nuevoAbono,
    estado: cerrado ? 'liquidado' : 'parcial',
  };
  if (cerrado) {
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
    mensaje: cerrado
      ? 'Pagaré cerrado por abonos (saldo $0). No queda nada por recolectar.'
      : `Abono de $${monto.toFixed(2)} registrado. Saldo restante: $${nuevoSaldo.toFixed(2)}.`,
  };
}

/**
 * Liquidar: el cajero ya tiene el total pendiente.
 * Queda solo para recolección y aparece en RC Virtual → Pagaré.
 */
export async function liquidarPagare(supabase, pagare, opts = {}) {
  if (!supabase || !pagare?.id) return { ok: false, error: 'Pagaré inválido.' };
  if (esUsuarioCubreTurno(opts.user)) {
    return { ok: false, error: 'Cubre turno no puede liquidar. Solo el cajero en su sesión.' };
  }
  if (!puedeAbonarLiquidarPagare(opts.rolActor ?? opts.user?.rol, opts.user)) {
    return { ok: false, error: 'Solo administrador, gerente o cajero pueden liquidar un pagaré.' };
  }
  if (!pagarePendienteCajero(pagare)) {
    return { ok: false, error: 'Este pagaré no está pendiente de liquidar.' };
  }
  const saldo = saldoPagare(pagare);
  if (!(saldo > 0.001)) return { ok: false, error: 'El pagaré ya no tiene saldo.' };

  const ahora = new Date().toISOString();
  const patch = {
    estado: 'por_recolectar',
    saldo,
    rc_monto: saldo,
    liquidado_por: opts.nombreActor || opts.user?.nombre || null,
    liquidado_at: ahora,
  };

  const { data, error } = await supabase.from('pagares').update(patch).eq('id', pagare.id).select('*').single();
  if (error) {
    if (faltaTablaPagares(error)) return { ok: false, error: AVISO_FALTA_PAGARES, faltaTabla: true };
    return { ok: false, error: error.message };
  }
  return {
    ok: true,
    pagare: data,
    saldo,
    mensaje: (
      `Pagaré ${pagare.folio || ''} liquidado por $${saldo.toFixed(2)}. `
      + 'Queda pendiente de recolección → RC Virtual · Pagaré.'
    ).trim(),
  };
}

/**
 * Recolectar en Vales → Pagaré. Solo Luis Enrique / AMR / ABB / JLBB / FBBB.
 * Registra quién recolectó y marca recolectado (visible en RC Virtual).
 */
export async function recolectarPagare(supabase, pagare, opts = {}) {
  if (!supabase || !pagare?.id) return { ok: false, error: 'Pagaré inválido.' };
  const nombre = opts.nombreActor || opts.user?.nombre || '';
  if (!puedeRecolectarPagare(opts.user || nombre)) {
    return {
      ok: false,
      error: 'Solo Luis Enrique Osuna Mada, AMR, ABB, JLBB o FBBB pueden recolectar pagarés.',
    };
  }
  if (!pagarePendienteRecoleccion(pagare)) {
    return {
      ok: false,
      error: 'Solo se recolectan pagarés ya liquidados por el cajero (estado «Por recolectar»).',
    };
  }
  const monto = montoPendienteRecoleccion(pagare);
  const ahora = new Date().toISOString();
  const patch = {
    estado: 'recolectado',
    saldo: 0,
    rc_monto: monto,
    rc_recibido_por: nombre || null,
    rc_recibido_at: ahora,
  };

  const { data, error } = await supabase.from('pagares').update(patch).eq('id', pagare.id).select('*').single();
  if (error) {
    if (faltaTablaPagares(error)) return { ok: false, error: AVISO_FALTA_PAGARES, faltaTabla: true };
    return { ok: false, error: error.message };
  }
  return {
    ok: true,
    pagare: data,
    monto,
    mensaje: (
      `Recolectado ${pagare.folio || ''} · $${monto.toFixed(2)} · ${etiquetaTiendaSegura(pagare.sucursal_id)} `
      + `por ${nombre || '—'}. Registrado en RC Virtual → Pagaré.`
    ).trim(),
  };
}

function etiquetaTiendaSegura(codigo) {
  return String(codigo || '').trim() || '—';
}

/**
 * Compat: marca pagarés abiertos como por_recolectar (flujo antiguo al recibir en RC).
 * Preferir liquidarPagare (cajero) + recolectarPagare (autorizados).
 */
export async function registrarPagaresEnRcVirtual(supabase, { area, items, adminNombre } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', data: [] };
  const areaNorm = normalizarAreaPagare(area) || 'virtual';
  const list = Array.isArray(items) ? items : [];
  const ahora = new Date().toISOString();
  const out = [];

  let pagares = list;
  if (!pagares.length) {
    const res = await listarPagares(supabase, { area: areaNorm, soloAbiertos: true, limit: 100 });
    if (!res.ok) return res;
    pagares = (res.data || []).filter(pagarePendienteCajero);
  }

  for (const p of pagares) {
    if (!p?.id || !pagarePendienteCajero(p)) continue;
    const monto = saldoPagare(p);
    const { data, error } = await supabase
      .from('pagares')
      .update({
        estado: 'por_recolectar',
        saldo: monto,
        rc_monto: monto,
        liquidado_por: adminNombre || p.liquidado_por || null,
        liquidado_at: ahora,
      })
      .eq('id', p.id)
      .select('*')
      .single();
    if (!error && data) out.push(data);
  }
  return { ok: true, data: out };
}

/**
 * Eliminar / rechazar pagaré (AMR, ABB, JLBB, FJBB).
 * Cancela abiertos, parciales, por recolectar o ya recolectados (salen de RC Virtual).
 */
export async function cancelarPagare(supabase, pagare, opts = {}) {
  if (!supabase || !pagare?.id) return { ok: false, error: 'Pagaré inválido.' };
  const nombre = opts.nombreActor || opts.user?.nombre || '';
  if (!puedeEliminarPagare(opts.user || nombre)) {
    return {
      ok: false,
      error: 'Solo el administrador (o AMR/ABB/JLBB/FJBB) puede eliminar o rechazar pagarés.',
    };
  }
  const est = String(pagare.estado || '').toLowerCase();
  if (est === 'cancelado') {
    return { ok: false, error: 'Ese pagaré ya está cancelado.' };
  }
  const ahora = new Date().toISOString();
  const notaLinea = `Cancelado/rechazado por ${nombre || '—'} · ${ahora.slice(0, 16)}`;
  const notasPrev = String(pagare.notas || '').trim();
  const patch = {
    estado: 'cancelado',
    saldo: 0,
    rc_monto: 0,
    notas: notasPrev ? `${notasPrev}\n${notaLinea}` : notaLinea,
  };
  const { data, error } = await supabase.from('pagares').update(patch).eq('id', pagare.id).select('*').single();
  if (error) {
    if (faltaTablaPagares(error)) return { ok: false, error: AVISO_FALTA_PAGARES, faltaTabla: true };
    return { ok: false, error: error.message };
  }
  return {
    ok: true,
    pagare: data,
    mensaje: `Pagaré ${pagare.folio || ''} eliminado/rechazado por ${nombre || '—'}.`,
  };
}

