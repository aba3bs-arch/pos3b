import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { cicloInventarioSucursal } from './calendarioInventario.js';
import { dateFromNogales } from './corteCaja.js';
import { resumirValorInventario } from './valorInventario.js';
import { horaEnTurno, leerTurnos, nombreTurnoLegible, turnoActual } from './turnos.js';

const LS_REMOCIONES = 'pos3b_carrito_remociones';
const LS_CONSULTAS = 'pos3b_consultas_precio';
const LS_CANCEL = 'pos3b_cancelaciones';
const MAX_LS = 800;

const AVISO_SQL =
  'Falta el SQL de proyección. En Supabase → SQL Editor ejecuta: supabase/fix_proyeccion_faltante.sql';

/** Pesos de confianza del método (verde / naranja / rojo). */
export const SENALES_PROYECCION = {
  carrito: {
    id: 'carrito',
    titulo: 'Quitado del carrito',
    peso: 1,
    confianzaPct: 100,
    nivel: 'alta',
    color: 'verde',
    detalle: 'Se escaneó y luego se quitó sin cobrar — alta sospecha de salida sin venta.',
  },
  cancelacion: {
    id: 'cancelacion',
    titulo: 'Cancelaciones de línea',
    peso: 0.5,
    confianzaPct: 50,
    nivel: 'media',
    color: 'naranja',
    detalle: 'Ticket anulado o línea cancelada — confianza media (puede ser error o merma real).',
  },
  precio: {
    id: 'precio',
    titulo: 'Precios checados',
    peso: 0,
    confianzaPct: 0,
    nivel: 'baja',
    color: 'rojo',
    detalle: 'Consulta en checador sin venta — 0% confiable; se muestra para verificar en inventario.',
  },
};

function faltaTabla(error, nombre) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes(nombre) &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache'))
  );
}

function leerLs(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function guardarLs(key, row) {
  const prev = leerLs(key);
  const next = [row, ...prev].slice(0, MAX_LS);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function sumarMontos(rows) {
  return (rows || []).reduce((a, r) => a + (Number(r.monto) || 0), 0);
}

function filtrarDesde(rows, desdeIso, suc) {
  const t0 = new Date(desdeIso).getTime();
  return (rows || []).filter((r) => {
    if (suc && normalizarCodigoTienda(r.sucursal_id) !== suc) return false;
    const t = new Date(r.created_at || 0).getTime();
    return Number.isFinite(t) && t >= t0;
  });
}

function metaTurnoActual() {
  const t = turnoActual();
  if (!t) return { turno_id: null, turno_nombre: null };
  return { turno_id: t.id || null, turno_nombre: nombreTurnoLegible(t) || null };
}

/** Normaliza cancelaciones a líneas de artículo para el detalle. */
export function lineasDesdeCancelacion(c) {
  const arts = Array.isArray(c?.articulos) ? c.articulos : [];
  if (!arts.length) {
    const monto = Number(c?.total) || Number(c?.monto) || 0;
    return [
      {
        id: `${c?.id || 'cancel'}_linea`,
        created_at: c?.created_at,
        sucursal_id: c?.sucursal_id,
        usuario: c?.usuario || '—',
        producto_id: null,
        nombre: c?.motivo ? `Cancelación · ${c.motivo}` : 'Cancelación',
        precio: monto,
        qty: 1,
        monto,
        motivo: c?.motivo || '',
        turno_id: c?.turno_id || null,
        turno_nombre: c?.turno_nombre || null,
        origen_evento: 'cancelacion',
      },
    ];
  }
  return arts.map((a, i) => {
    const qty = Number(a.qty) || 0;
    const precio = Number(a.precio) || 0;
    return {
      id: `${c?.id || 'cancel'}_${a.id || i}`,
      created_at: c?.created_at,
      sucursal_id: c?.sucursal_id,
      usuario: c?.usuario || '—',
      producto_id: a.id != null ? String(a.id) : null,
      nombre: a.nombre || a.id || 'Artículo',
      precio,
      qty,
      monto: Math.round(precio * qty * 100) / 100,
      motivo: c?.motivo || '',
      turno_id: c?.turno_id || null,
      turno_nombre: c?.turno_nombre || null,
      origen_evento: 'cancelacion',
    };
  });
}

/**
 * Agrupa eventos por turno de caja (usa turno_id si existe; si no, la hora del evento).
 */
export function agruparEventosPorTurno(eventos, turnos = null) {
  const list = turnos || leerTurnos();
  const map = new Map();
  for (const t of list) {
    map.set(String(t.id), {
      turnoId: String(t.id),
      turnoNombre: nombreTurnoLegible(t),
      items: [],
      monto: 0,
    });
  }
  const sinTurno = [];

  for (const ev of eventos || []) {
    let key = ev?.turno_id != null ? String(ev.turno_id) : '';
    if (!key || !map.has(key)) {
      const when = ev?.created_at ? new Date(ev.created_at) : null;
      if (when && !Number.isNaN(when.getTime())) {
        const match = list.find((t) => horaEnTurno(t, when));
        key = match ? String(match.id) : '';
      } else {
        key = '';
      }
    }
    if (key && map.has(key)) {
      const g = map.get(key);
      g.items.push(ev);
      g.monto += Number(ev.monto) || 0;
    } else {
      sinTurno.push(ev);
    }
  }

  const grupos = [...map.values()]
    .map((g) => ({
      ...g,
      monto: Math.round(g.monto * 100) / 100,
      items: [...g.items].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
    }))
    .filter((g) => g.items.length > 0);

  return { grupos, sinTurno };
}

/**
 * Registra artículo(s) quitados del carrito de venta.
 * Fire-and-forget seguro: no bloquea la UI de cobro.
 */
export async function registrarRemocionCarrito(supabase, opts) {
  const suc = normalizarCodigoTienda(opts?.sucursal);
  const qty = Math.max(0, Number(opts?.qty) || 0);
  const precio = Number(opts?.precio) || 0;
  if (!suc || qty <= 0) return { ok: false, error: 'Datos incompletos.' };

  const turnoMeta = metaTurnoActual();
  const payload = {
    sucursal_id: suc,
    usuario: opts?.usuario || opts?.user?.nombre || '—',
    producto_id: opts?.producto_id != null ? String(opts.producto_id) : null,
    nombre: opts?.nombre || '',
    precio,
    qty,
    monto: Math.round(precio * qty * 100) / 100,
  };

  let cloudId = null;
  let aviso = null;
  if (supabase) {
    const { data, error } = await supabase.from('carrito_remociones').insert([payload]).select('id').single();
    if (error) {
      if (faltaTabla(error, 'carrito_remociones')) aviso = AVISO_SQL;
      else return { ok: false, error: error.message, aviso };
    } else {
      cloudId = data?.id || null;
    }
  }

  const localRow = {
    ...payload,
    ...turnoMeta,
    id: cloudId || `rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
    origen: cloudId ? 'nube' : 'local',
  };
  guardarLs(LS_REMOCIONES, localRow);
  return { ok: true, id: localRow.id, aviso };
}

/**
 * Registra consulta de precio (asume 1 ud. potencial sin venta).
 * Deduplica el mismo SKU en la misma sucursal durante `debounceMs`.
 */
export async function registrarConsultaPrecio(supabase, opts) {
  const suc = normalizarCodigoTienda(opts?.sucursal);
  const productoId = opts?.producto_id != null ? String(opts.producto_id) : '';
  const precio = Number(opts?.precio) || 0;
  if (!suc || !productoId) return { ok: false, error: 'Datos incompletos.' };

  const debounceMs = Number(opts?.debounceMs) > 0 ? Number(opts.debounceMs) : 45000;
  const ahora = Date.now();
  const recientes = filtrarDesde(leerLs(LS_CONSULTAS), new Date(ahora - debounceMs).toISOString(), suc);
  if (recientes.some((r) => String(r.producto_id) === productoId)) {
    return { ok: true, dedup: true };
  }

  const turnoMeta = metaTurnoActual();
  const payload = {
    sucursal_id: suc,
    usuario: opts?.usuario || opts?.user?.nombre || '—',
    producto_id: productoId,
    nombre: opts?.nombre || '',
    precio,
    stock_mostrado: opts?.stock != null ? Number(opts.stock) : null,
    qty: 1,
    monto: Math.round(precio * 100) / 100,
  };

  let cloudId = null;
  let aviso = null;
  if (supabase) {
    const { data, error } = await supabase.from('consultas_precio').insert([payload]).select('id').single();
    if (error) {
      if (faltaTabla(error, 'consultas_precio')) aviso = AVISO_SQL;
      else return { ok: false, error: error.message, aviso };
    } else {
      cloudId = data?.id || null;
    }
  }

  const localRow = {
    ...payload,
    ...turnoMeta,
    id: cloudId || `prc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
    origen: cloudId ? 'nube' : 'local',
  };
  guardarLs(LS_CONSULTAS, localRow);
  return { ok: true, id: localRow.id, aviso };
}

async function cargarTablaDesde(supabase, table, suc, desdeIso) {
  const locales = filtrarDesde(leerLs(table === 'carrito_remociones' ? LS_REMOCIONES : LS_CONSULTAS), desdeIso, suc);
  if (!supabase) return { data: locales, soloLocal: true };

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('sucursal_id', suc)
    .gte('created_at', desdeIso)
    .order('created_at', { ascending: true })
    .limit(5000);
  if (error) {
    if (faltaTabla(error, table)) {
      return { data: locales, soloLocal: true, aviso: AVISO_SQL };
    }
    return { data: locales, error: error.message, soloLocal: true };
  }
  const nube = data || [];
  const porIdLocal = new Map(locales.map((r) => [String(r.id), r]));
  const fusion = nube.map((r) => {
    const loc = porIdLocal.get(String(r.id));
    if (!loc) return r;
    return {
      ...r,
      turno_id: r.turno_id || loc.turno_id || null,
      turno_nombre: r.turno_nombre || loc.turno_nombre || null,
    };
  });
  if (fusion.length === 0 && locales.length > 0) return { data: locales, soloLocal: true };
  const idsNube = new Set(fusion.map((r) => String(r.id)));
  const extraLocal = locales.filter((r) => !idsNube.has(String(r.id)));
  return { data: [...fusion, ...extraLocal], soloLocal: nube.length === 0 };
}

async function cargarCancelacionesDesde(supabase, suc, desdeIso) {
  const locales = filtrarDesde(leerLs(LS_CANCEL), desdeIso, suc).map((c) => ({
    ...c,
    monto: Number(c.total) || Number(c.monto) || 0,
  }));
  if (!supabase) return { data: locales, soloLocal: true };

  const { data, error } = await supabase
    .from('cancelaciones')
    .select('id,sucursal_id,total,articulos,created_at,usuario,motivo')
    .eq('sucursal_id', suc)
    .gte('created_at', desdeIso)
    .order('created_at', { ascending: true })
    .limit(5000);

  if (error) {
    return { data: locales, soloLocal: true, error: error.message };
  }
  const nube = (data || []).map((c) => ({
    ...c,
    monto: Number(c.total) || 0,
  }));
  if (nube.length === 0 && locales.length > 0) return { data: locales, soloLocal: true };
  const idsNube = new Set(nube.map((r) => String(r.id)));
  const extraLocal = locales.filter((r) => !idsNube.has(String(r.id)));
  return { data: [...nube, ...extraLocal], soloLocal: nube.length === 0 };
}

function nivelUrgencia(pct) {
  const p = Number(pct) || 0;
  if (p >= 3) return { id: 'alta', label: 'Riesgo alto de faltante', color: 'rojo' };
  if (p >= 1) return { id: 'media', label: 'Riesgo medio — revisa el proceso de venta', color: 'naranja' };
  return { id: 'baja', label: 'Riesgo controlado por ahora', color: 'verde' };
}

function ordenarDesc(rows) {
  return [...(rows || [])].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

/**
 * Proyección acumulada desde el último día de inventario de la sucursal.
 * Crece día a día con remociones, cancelaciones y (en desglose) precios checados.
 */
export async function cargarProyeccionFaltante(supabase, { sucursal, inventario } = {}) {
  const suc = normalizarCodigoTienda(sucursal);
  const ciclo = cicloInventarioSucursal(suc);
  if (!suc || !ciclo) {
    return {
      ok: false,
      sinCalendario: true,
      error: 'Esta sucursal no tiene día de inventario asignado. Configúralo en Configuración.',
    };
  }

  const desdeIso = dateFromNogales(ciclo.ymd, 0, 0, 0, 0).toISOString();
  const [rem, cons, canc] = await Promise.all([
    cargarTablaDesde(supabase, 'carrito_remociones', suc, desdeIso),
    cargarTablaDesde(supabase, 'consultas_precio', suc, desdeIso),
    cargarCancelacionesDesde(supabase, suc, desdeIso),
  ]);

  const remociones = ordenarDesc(rem.data);
  const consultasPrecio = ordenarDesc(cons.data);
  const cancelaciones = ordenarDesc(canc.data);
  const lineasCancelacion = cancelaciones.flatMap(lineasDesdeCancelacion);

  const montoCarrito = sumarMontos(remociones);
  const montoPrecio = sumarMontos(consultasPrecio);
  const montoCancel = sumarMontos(cancelaciones);

  const desglose = [
    {
      ...SENALES_PROYECCION.carrito,
      monto: montoCarrito,
      montoPonderado: montoCarrito * SENALES_PROYECCION.carrito.peso,
      eventos: remociones.length,
    },
    {
      ...SENALES_PROYECCION.cancelacion,
      monto: montoCancel,
      montoPonderado: montoCancel * SENALES_PROYECCION.cancelacion.peso,
      eventos: cancelaciones.length,
    },
    {
      ...SENALES_PROYECCION.precio,
      monto: montoPrecio,
      montoPonderado: montoPrecio * SENALES_PROYECCION.precio.peso,
      eventos: consultasPrecio.length,
    },
  ];

  const montoBruto = desglose.reduce((a, d) => a + d.monto, 0);
  const montoProyectado = desglose.reduce((a, d) => a + d.montoPonderado, 0);
  const valorInv = resumirValorInventario(inventario || []);
  const baseInv = Number(valorInv.valorTotal) || 0;
  const pctProyectado = baseInv > 0 ? (montoProyectado / baseInv) * 100 : 0;
  const pctBruto = baseInv > 0 ? (montoBruto / baseInv) * 100 : 0;
  const urgencia = nivelUrgencia(Math.max(pctProyectado, pctBruto * 0.6));

  const avisos = [rem.aviso, cons.aviso].filter(Boolean);

  return {
    ok: true,
    sucursal: suc,
    ciclo,
    desdeIso,
    desglose,
    remociones,
    consultasPrecio,
    cancelaciones,
    lineasCancelacion,
    montoBruto,
    montoProyectado,
    pctProyectado,
    pctBruto,
    valorInventario: baseInv,
    urgencia,
    avisos,
    soloLocal: Boolean(rem.soloLocal || cons.soloLocal || canc.soloLocal),
    mensaje:
      ciclo.esHoyInventario
        ? 'Hoy es día de inventario: valida si este faltante proyectado aparece en el conteo real.'
        : `Día ${ciclo.diaCiclo} del ciclo · el faltante proyectado crece si no registras bien las ventas hasta el ${ciclo.proximoYmd}.`,
  };
}
