import { enRangoYmd, toYmd } from './fechas.js';
import { fmtMonto } from './controlEfectivo.js';

export const AVISO_FALTA_TABLA_RT_CUENTAS =
  'Ejecuta en Supabase: supabase/fix_rt_cuentas.sql para crear las cuentas RT.';

export const CUENTAS_RT = [
  { id: 'francisco', nombre: 'Francisco', patrones: ['francisco'] },
  { id: 'andres', nombre: 'Andrés', patrones: ['andres', 'andrés'] },
];

export const PRESETS_RT_CUENTAS = [
  { id: 'hoy', label: 'Hoy' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: 'mes', label: 'Mes actual' },
  { id: '6m', label: 'Últimos 6 meses' },
  { id: 'anual', label: 'Anual' },
];

function normNombre(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function esErrorTablaRtCuentas(error) {
  const msg = String(error?.message || '');
  return (
    error?.code === '42P01' ||
    (msg.includes('relation') && (msg.includes('rt_cuentas') || msg.includes('rt_movimientos_cuenta')))
  );
}

export function resolverCuentaRtPorNombre(nombre) {
  const n = normNombre(nombre);
  if (!n) return null;
  for (const c of CUENTAS_RT) {
    if (c.patrones.some((p) => n.includes(normNombre(p)))) return c.id;
  }
  return null;
}

export function etiquetaCuentaRt(id) {
  return CUENTAS_RT.find((c) => c.id === id)?.nombre || id || '—';
}

export function saldoDesdeMovimientos(movs = []) {
  return (movs || []).reduce((acc, m) => {
    const v = Number(m.monto) || 0;
    if (m.tipo === 'liquidacion' || m.tipo === 'transferencia_recibida') return acc + v;
    if (m.tipo === 'transferencia_enviada') return acc - v;
    return acc;
  }, 0);
}

export function filtrarMovimientosRtPorFecha(movs, { desde, hasta } = {}) {
  if (!desde && !hasta) return movs || [];
  return (movs || []).filter((m) => enRangoYmd(m.fecha, desde, hasta));
}

export function resumenPeriodoRt(movs = []) {
  const ingresos = movs
    .filter((m) => m.tipo === 'liquidacion' || m.tipo === 'transferencia_recibida')
    .reduce((a, m) => a + Number(m.monto || 0), 0);
  const egresos = movs
    .filter((m) => m.tipo === 'transferencia_enviada')
    .reduce((a, m) => a + Number(m.monto || 0), 0);
  return { ingresos, egresos, neto: ingresos - egresos, count: movs.length };
}

export async function listarCuentasRt(supabase) {
  if (!supabase) return { data: [], error: null };
  const { data, error } = await supabase.from('rt_cuentas').select('*').eq('activo', true).order('nombre');
  if (error) return { data: [], error };
  return { data: data?.length ? data : CUENTAS_RT.map((c) => ({ id: c.id, nombre: c.nombre, activo: true })), error: null };
}

export async function listarMovimientosCuentaRt(supabase, cuentaId, { desde, hasta } = {}) {
  if (!supabase || !cuentaId) return { data: [], error: null };
  let q = supabase
    .from('rt_movimientos_cuenta')
    .select('*')
    .eq('cuenta_id', cuentaId)
    .order('fecha', { ascending: false })
    .limit(500);
  if (desde) q = q.gte('fecha', `${desde}T00:00:00`);
  if (hasta) q = q.lte('fecha', `${hasta}T23:59:59.999`);
  const { data, error } = await q;
  return { data: data || [], error };
}

export async function listarTodosMovimientosRt(supabase, { desde, hasta, cuentaId } = {}) {
  if (!supabase) return { data: [], error: null };
  let q = supabase.from('rt_movimientos_cuenta').select('*').order('fecha', { ascending: false }).limit(800);
  if (cuentaId) q = q.eq('cuenta_id', cuentaId);
  if (desde) q = q.gte('fecha', `${desde}T00:00:00`);
  if (hasta) q = q.lte('fecha', `${hasta}T23:59:59.999`);
  const { data, error } = await q;
  return { data: data || [], error };
}

export async function calcularSaldosRt(supabase) {
  const { data: movs, error } = await supabase.from('rt_movimientos_cuenta').select('cuenta_id, tipo, monto');
  if (error) {
    if (esErrorTablaRtCuentas(error)) return { saldos: {}, error: AVISO_FALTA_TABLA_RT_CUENTAS };
    return { saldos: {}, error: error.message };
  }
  const saldos = {};
  for (const c of CUENTAS_RT) saldos[c.id] = 0;
  for (const m of movs || []) {
    if (!saldos[m.cuenta_id] && saldos[m.cuenta_id] !== 0) saldos[m.cuenta_id] = 0;
    if (m.tipo === 'liquidacion' || m.tipo === 'transferencia_recibida') saldos[m.cuenta_id] = (saldos[m.cuenta_id] || 0) + Number(m.monto || 0);
    else if (m.tipo === 'transferencia_enviada') saldos[m.cuenta_id] = (saldos[m.cuenta_id] || 0) - Number(m.monto || 0);
  }
  return { saldos, error: null };
}

export async function acreditarLiquidacionCuentaRt(supabase, opts = {}) {
  const { cuentaId, movimientoIds = [], montoTotal, usuarioNombre, repartidorNombre, notas } = opts;
  if (!supabase || !cuentaId) return { ok: false, error: 'Selecciona la cuenta RT que recibe el efectivo.' };
  const monto = Number(montoTotal) || 0;
  if (monto <= 0) return { ok: false, error: 'Monto de liquidación inválido.' };

  const grupoId = crypto.randomUUID();
  const row = {
    cuenta_id: cuentaId,
    tipo: 'liquidacion',
    monto: Math.round(monto * 100) / 100,
    fecha: new Date().toISOString(),
    usuario: usuarioNombre || null,
    notas: notas || `Liquidación recolecciones · ${repartidorNombre || 'recolector'}`,
    grupo_id: grupoId,
    repartidor_nombre: repartidorNombre || null,
    liquidacion_movimientos: movimientoIds?.length ? movimientoIds : null,
  };

  const { error } = await supabase.from('rt_movimientos_cuenta').insert([row]);
  if (error) {
    if (esErrorTablaRtCuentas(error)) return { ok: false, error: AVISO_FALTA_TABLA_RT_CUENTAS };
    return { ok: false, error: error.message };
  }
  return { ok: true, monto, cuentaId };
}

export async function transferirEntreCuentasRt(supabase, opts = {}) {
  const { desdeId, haciaId, monto, usuarioNombre, notas } = opts;
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!desdeId || !haciaId) return { ok: false, error: 'Selecciona cuenta origen y destino.' };
  if (desdeId === haciaId) return { ok: false, error: 'Origen y destino deben ser distintos.' };
  const m = Number(monto) || 0;
  if (m <= 0) return { ok: false, error: 'Indica un monto mayor a cero.' };

  const { saldos, error: errSaldo } = await calcularSaldosRt(supabase);
  if (errSaldo) return { ok: false, error: errSaldo };
  const disponible = Number(saldos[desdeId]) || 0;
  if (m > disponible + 0.001) {
    return { ok: false, error: `Saldo insuficiente en ${etiquetaCuentaRt(desdeId)} (${fmtMonto(disponible)} disponible).` };
  }

  const grupoId = crypto.randomUUID();
  const fecha = new Date().toISOString();
  const detalle = notas?.trim() || `Transferencia a ${etiquetaCuentaRt(haciaId)}`;
  const rows = [
    {
      cuenta_id: desdeId,
      tipo: 'transferencia_enviada',
      monto: Math.round(m * 100) / 100,
      fecha,
      usuario: usuarioNombre || null,
      notas: detalle,
      grupo_id: grupoId,
      cuenta_relacionada: haciaId,
    },
    {
      cuenta_id: haciaId,
      tipo: 'transferencia_recibida',
      monto: Math.round(m * 100) / 100,
      fecha,
      usuario: usuarioNombre || null,
      notas: `Recibido de ${etiquetaCuentaRt(desdeId)}${notas?.trim() ? ` · ${notas.trim()}` : ''}`,
      grupo_id: grupoId,
      cuenta_relacionada: desdeId,
    },
  ];

  const { error } = await supabase.from('rt_movimientos_cuenta').insert(rows);
  if (error) {
    if (esErrorTablaRtCuentas(error)) return { ok: false, error: AVISO_FALTA_TABLA_RT_CUENTAS };
    return { ok: false, error: error.message };
  }
  return { ok: true, monto: m, desdeId, haciaId };
}

export function etiquetaTipoMovimientoRt(tipo) {
  if (tipo === 'liquidacion') return 'Liquidación';
  if (tipo === 'transferencia_enviada') return 'Transferencia enviada';
  if (tipo === 'transferencia_recibida') return 'Transferencia recibida';
  return tipo || '—';
}

export function signoMovimientoRt(tipo) {
  if (tipo === 'transferencia_enviada') return '-';
  return '+';
}

export function rangoDesdePresetRt(preset) {
  const hoy = new Date();
  const hasta = toYmd(hoy);
  if (preset === 'hoy') return { desde: hasta, hasta };
  if (preset === '7d') return { desde: toYmd(new Date(hoy.getTime() - 7 * 864e5)), hasta };
  if (preset === 'mes') return { desde: toYmd(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta };
  if (preset === '6m') {
    const d = new Date(hoy);
    d.setMonth(d.getMonth() - 6);
    return { desde: toYmd(d), hasta };
  }
  if (preset === 'anual') return { desde: toYmd(new Date(hoy.getFullYear(), 0, 1)), hasta };
  return null;
}
