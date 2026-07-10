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
    if (m.tipo === 'transferencia_enviada' || m.tipo === 'gasto') return acc - v;
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
    .filter((m) => m.tipo === 'transferencia_enviada' || m.tipo === 'gasto')
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
    else if (m.tipo === 'transferencia_enviada' || m.tipo === 'gasto') saldos[m.cuenta_id] = (saldos[m.cuenta_id] || 0) - Number(m.monto || 0);
  }
  return { saldos, error: null };
}

export async function acreditarLiquidacionCuentaRt(supabase, opts = {}) {
  const { cuentaId, movimientoIds = [], montoTotal, usuarioNombre, repartidorNombre, notas, fecha } = opts;
  if (!supabase || !cuentaId) return { ok: false, error: 'Selecciona la cuenta RT que recibe el efectivo.' };
  const monto = Number(montoTotal) || 0;
  if (monto <= 0) return { ok: false, error: 'Monto de liquidación inválido.' };

  const grupoId = crypto.randomUUID();
  const row = {
    cuenta_id: cuentaId,
    tipo: 'liquidacion',
    monto: Math.round(monto * 100) / 100,
    fecha: fecha || new Date().toISOString(),
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

const TIPOS_LIQUIDACION_RT = ['Recolección', 'Entrega Crédito', 'Cobro Servicio'];

async function idsTransitoYaAcreditadosRt(supabase) {
  const { data, error } = await supabase
    .from('rt_movimientos_cuenta')
    .select('liquidacion_movimientos')
    .eq('tipo', 'liquidacion');
  if (error) throw error;
  const ids = new Set();
  for (const row of data || []) {
    const arr = row.liquidacion_movimientos;
    if (Array.isArray(arr)) arr.forEach((id) => ids.add(String(id)));
  }
  return ids;
}

function claveGrupoLiquidacionHistorica(m) {
  const f = m.fecha_liquidacion ? String(m.fecha_liquidacion).slice(0, 19) : 'sin-fecha';
  return `${f}|${m.usuario_liquida || ''}|${m.repartidor_id || ''}`;
}

function agruparLiquidacionesHistoricasPendientes(rows, yaAcreditados) {
  const pendientes = (rows || []).filter((m) => m.fecha_liquidacion && !yaAcreditados.has(String(m.id)));
  const map = new Map();
  for (const m of pendientes) {
    const key = claveGrupoLiquidacionHistorica(m);
    if (!map.has(key)) {
      map.set(key, {
        key,
        fecha: m.fecha_liquidacion,
        usuario: m.usuario_liquida || '',
        repartidorId: m.repartidor_id || '',
        repartidorNombre: m.repartidores?.nombre || '',
        ids: [],
        monto: 0,
      });
    }
    const g = map.get(key);
    g.ids.push(m.id);
    g.monto += Number(m.monto || 0);
  }
  return [...map.values()].map((g) => ({ ...g, monto: Math.round(g.monto * 100) / 100 }));
}

/** Liquidaciones selladas antes de existir rt_movimientos_cuenta. */
export async function resumenLiquidacionesHistoricasRt(supabase, { cuentaFallback } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  try {
    const [yaIds, liqRes] = await Promise.all([
      idsTransitoYaAcreditadosRt(supabase),
      supabase
        .from('transito_efectivo')
        .select('id, monto, fecha_liquidacion, usuario_liquida, repartidor_id, repartidores(nombre)')
        .eq('estatus', 'Liquidado')
        .in('tipo_movimiento', TIPOS_LIQUIDACION_RT)
        .not('fecha_liquidacion', 'is', null),
    ]);
    if (liqRes.error) {
      if (esErrorTablaRtCuentas(liqRes.error)) return { ok: false, error: AVISO_FALTA_TABLA_RT_CUENTAS };
      return { ok: false, error: liqRes.error.message };
    }

    const grupos = agruparLiquidacionesHistoricasPendientes(liqRes.data, yaIds);
    let montoAsignable = 0;
    let montoSinCuenta = 0;
    let gruposAsignables = 0;
    let gruposSinCuenta = 0;
    const usuariosSinCuenta = new Set();

    for (const g of grupos) {
      const cuentaId = resolverCuentaRtPorNombre(g.usuario) || cuentaFallback || null;
      if (cuentaId) {
        montoAsignable += g.monto;
        gruposAsignables += 1;
      } else {
        montoSinCuenta += g.monto;
        gruposSinCuenta += 1;
        if (g.usuario) usuariosSinCuenta.add(g.usuario);
      }
    }

    return {
      ok: true,
      totalGrupos: grupos.length,
      gruposAsignables,
      gruposSinCuenta,
      montoAsignable,
      montoSinCuenta,
      movimientosPendientes: grupos.reduce((a, g) => a + g.ids.length, 0),
      usuariosSinCuenta: [...usuariosSinCuenta],
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function importarLiquidacionesHistoricasRt(supabase, { cuentaFallback, usuarioNombre } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!cuentaFallback) {
    return { ok: false, error: 'Indica una cuenta por defecto para liquidaciones sin nombre Francisco/Andrés.' };
  }

  try {
    const [yaIds, liqRes] = await Promise.all([
      idsTransitoYaAcreditadosRt(supabase),
      supabase
        .from('transito_efectivo')
        .select('id, monto, fecha_liquidacion, usuario_liquida, repartidor_id, repartidores(nombre)')
        .eq('estatus', 'Liquidado')
        .in('tipo_movimiento', TIPOS_LIQUIDACION_RT)
        .not('fecha_liquidacion', 'is', null),
    ]);
    if (liqRes.error) {
      if (esErrorTablaRtCuentas(liqRes.error)) return { ok: false, error: AVISO_FALTA_TABLA_RT_CUENTAS };
      return { ok: false, error: liqRes.error.message };
    }

    const grupos = agruparLiquidacionesHistoricasPendientes(liqRes.data, yaIds);
    if (!grupos.length) return { ok: true, importados: 0, omitidos: 0, monto: 0 };

    let importados = 0;
    let omitidos = 0;
    let monto = 0;

    for (const g of grupos) {
      const cuentaId = resolverCuentaRtPorNombre(g.usuario) || cuentaFallback;
      if (!cuentaId) {
        omitidos += 1;
        continue;
      }
      const res = await acreditarLiquidacionCuentaRt(supabase, {
        cuentaId,
        movimientoIds: g.ids,
        montoTotal: g.monto,
        usuarioNombre: g.usuario || usuarioNombre,
        repartidorNombre: g.repartidorNombre,
        fecha: g.fecha,
        notas: `Liquidación histórica importada · ${g.repartidorNombre || 'recolector'}`,
      });
      if (!res.ok) return { ok: false, error: res.error, importados, omitidos };
      importados += 1;
      monto += g.monto;
    }

    return { ok: true, importados, omitidos, monto, movimientos: grupos.reduce((a, g) => a + g.ids.length, 0) };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
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

/** Registra gasto desde saldo RT y lo refleja en cortes_contabilidad_gastos. */
export async function registrarGastoCuentaRt(supabase, opts = {}) {
  const {
    cuentaId,
    monto,
    descripcion,
    categoria = 'GASTOS OPERATIVOS',
    subcategoria = 'CUENTA RT',
    tienda = 'MAIN',
    usuarioNombre,
  } = opts;
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!cuentaId) return { ok: false, error: 'Selecciona la cuenta RT (Francisco o Andrés).' };
  const desc = String(descripcion || '').trim();
  if (!desc) return { ok: false, error: 'Describe en qué se usó el dinero.' };
  const m = Number(monto) || 0;
  if (m <= 0) return { ok: false, error: 'Indica un monto mayor a cero.' };

  const { saldos, error: errSaldo } = await calcularSaldosRt(supabase);
  if (errSaldo) return { ok: false, error: errSaldo };
  const disponible = Number(saldos[cuentaId]) || 0;
  if (m > disponible + 0.001) {
    return { ok: false, error: `Saldo insuficiente en ${etiquetaCuentaRt(cuentaId)} (${fmtMonto(disponible)} disponible).` };
  }

  const cuentaLabel = etiquetaCuentaRt(cuentaId);
  const comentarioContab = `${desc} · pagado desde cuenta RT ${cuentaLabel}`;

  const { data: gastoRow, error: errGasto } = await supabase
    .from('cortes_contabilidad_gastos')
    .insert([
      {
        sucursal_id: tienda || 'MAIN',
        modulo: 'virtual',
        categoria: String(categoria || 'GASTOS OPERATIVOS').trim().toUpperCase(),
        subcategoria: String(subcategoria || 'CUENTA RT').trim().toUpperCase(),
        comentario: comentarioContab,
        monto: Math.round(m * 100) / 100,
        usuario_nombre: cuentaLabel,
        cerrado: false,
        estado_aprobacion: 'aprobado',
        solicitado_por: usuarioNombre || null,
        aprobado_por: usuarioNombre || null,
        aprobado_at: new Date().toISOString(),
      },
    ])
    .select('id')
    .single();

  if (errGasto) {
    if (errGasto.code === '42P01') {
      return { ok: false, error: 'Ejecuta supabase/fix_cortes_contabilidad.sql en Supabase.' };
    }
    return { ok: false, error: errGasto.message };
  }

  const grupoId = crypto.randomUUID();
  const row = {
    cuenta_id: cuentaId,
    tipo: 'gasto',
    monto: Math.round(m * 100) / 100,
    fecha: new Date().toISOString(),
    usuario: usuarioNombre || null,
    notas: desc,
    grupo_id: grupoId,
    gasto_contabilidad_id: gastoRow?.id || null,
  };

  const { error: errRt } = await supabase.from('rt_movimientos_cuenta').insert([row]);
  if (errRt) {
    if (gastoRow?.id) await supabase.from('cortes_contabilidad_gastos').delete().eq('id', gastoRow.id);
    if (esErrorTablaRtCuentas(errRt)) {
      return {
        ok: false,
        error: `${AVISO_FALTA_TABLA_RT_CUENTAS} También ejecuta supabase/fix_rt_cuentas_gasto.sql para permitir gastos.`,
      };
    }
    const msg = String(errRt.message || '');
    if (msg.includes('gasto_contabilidad_id') || msg.includes('rt_movimientos_cuenta_tipo_check')) {
      return {
        ok: false,
        error:
          'Falta migración en Supabase. Abre SQL Editor y ejecuta supabase/fix_rt_cuentas_gasto.sql (agrega tipo gasto y columna gasto_contabilidad_id). Luego reintenta el descuento.',
      };
    }
    return { ok: false, error: errRt.message };
  }

  return { ok: true, monto: m, cuentaId, gastoContabilidadId: gastoRow?.id };
}

export function etiquetaTipoMovimientoRt(tipo) {
  if (tipo === 'liquidacion') return 'Liquidación';
  if (tipo === 'transferencia_enviada') return 'Transferencia enviada';
  if (tipo === 'transferencia_recibida') return 'Transferencia recibida';
  if (tipo === 'gasto') return 'Gasto';
  return tipo || '—';
}

export function signoMovimientoRt(tipo) {
  if (tipo === 'transferencia_enviada' || tipo === 'gasto') return '-';
  return '+';
}

export function esEgresoMovimientoRt(tipo) {
  return tipo === 'transferencia_enviada' || tipo === 'gasto';
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
