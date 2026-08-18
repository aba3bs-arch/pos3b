import { etiquetaTienda } from '../constants/sucursales.js';
import {
  esAbb,
  esAprobadorRecoleccionIe,
  nombreCoincidePatrones,
  normalizarNombreMatch,
  recoleccionAprobadaParaIe,
} from './contabilidadConstants.js';
import { fmtMonto } from './controlEfectivo.js';
import {
  datosImpresionDesdeHistorial,
  imprimirCorteContabilidad,
} from './impresionCorteContabilidad.js';
import {
  etiquetaCuentaRt,
  resolverOCrearCuentaRt,
  transferirEntreCuentasRt,
} from './rtCuentas.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Usuario AMR / Andrés: puede generar gastos sobre recolecciones en RC Virtual. */
export function esUsuarioAmr(nombre) {
  return nombreCoincidePatrones(nombre, ['amr', 'andres', 'andrés']);
}

export const AVISO_FALTA_R_VIRTUAL =
  'Ejecuta en Supabase: supabase/fix_r_virtual_custodia.sql para RC Virtual.';

export const ETIQUETAS_RECOLECTOR_R_VIRTUAL = [
  { etiqueta: 'ABB', patrones: ['abb', 'antonio'] },
  { etiqueta: 'FJBB', patrones: ['fjbb', 'francisco'] },
  { etiqueta: 'JLBB', patrones: ['jlbb', 'jose luis', 'josé luis'] },
  { etiqueta: 'AMR', patrones: ['amr', 'andres', 'andrés'] },
  { etiqueta: 'Luis Enrique Ozuna', patrones: ['luis enrique'] },
];

export function esErrorTablaRVirtual(error) {
  const msg = String(error?.message || '');
  return (
    error?.code === '42P01'
    || (msg.includes('relation') && msg.includes('r_virtual_custodia'))
    || (msg.toLowerCase().includes('schema cache') && msg.includes('r_virtual_custodia'))
  );
}

export function etiquetaRecolectorRVirtual(nombre) {
  const raw = String(nombre || '').trim();
  if (!raw) return 'Sin nombre';
  const hit = ETIQUETAS_RECOLECTOR_R_VIRTUAL.find((e) => nombreCoincidePatrones(raw, e.patrones));
  return hit?.etiqueta || raw;
}

export function claveRecolectorRVirtual(nombre) {
  return normalizarNombreMatch(etiquetaRecolectorRVirtual(nombre)) || 'sin-nombre';
}

const MODULOS_R_VIRTUAL = new Set(['virtual', 'garage']);

/** Solo recolecciones definitivas de cortes Virtual / Garage (no temporales, no abarrotes).
 * ABB / FJBB / JLBB van directo a IE Virtual: no pasan por RC Virtual. */
function esCierreRecoleccionRVirtual(row) {
  const mod = String(row?.modulo || '').toLowerCase();
  if (!MODULOS_R_VIRTUAL.has(mod)) return false;
  if (row?.detalle?.r_virtual_estado) return false;
  if (esAprobadorRecoleccionIe(row?.usuario_nombre)) return false;
  const tipo = String(row?.detalle?.tipo_cierre || '').toLowerCase();
  if (tipo === 'recoleccion_temporal') return false;
  if (tipo === 'recoleccion') return true;
  const turno = String(row?.turno || '').toUpperCase();
  return turno.includes('RECOLEC');
}

function montoCorteRecoleccion(row) {
  const d = row?.detalle || {};
  return Number(d.recoleccion_efectivo ?? d.recoleccion ?? d.recoleccion_turno ?? 0) || 0;
}

function etiquetaTipoCorte(row) {
  const mod = String(row?.modulo || '').toLowerCase();
  if (mod === 'garage') return 'Recolección Garage';
  return 'Recolección Virtual';
}

function claveItem(origen, origenId) {
  return `${origen}:${origenId}`;
}

async function listarCustodia(supabase) {
  const { data, error } = await supabase
    .from('r_virtual_custodia')
    .select('*')
    .order('recibido_at', { ascending: false })
    .limit(800);
  if (error) throw error;
  return data || [];
}

async function listarRecoleccionesCorteRVirtual(supabase) {
  const { data, error } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('id, sucursal_id, folio, usuario_nombre, created_at, detalle, modulo, turno')
    .in('modulo', ['virtual', 'garage'])
    .eq('turno', 'RECOLECCION')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data || []).filter(esCierreRecoleccionRVirtual);
}

function gastosRcDesdeDetalle(detalle = {}) {
  const list = Array.isArray(detalle?.gastos) ? detalle.gastos : [];
  return list
    .map((g, i) => ({
      id: g.id != null ? String(g.id) : `g-${i}`,
      monto: round2(g.monto),
      comentario: String(g.comentario || '').trim(),
      categoria: String(g.categoria || '').trim(),
      usuario: String(g.usuario_nombre || g.solicitado_por || '').trim(),
      origenRc: g.origen_rc_virtual === true
        || String(g.subcategoria || '').toUpperCase() === 'RC VIRTUAL'
        || String(g.comentario || '').includes('RC Virtual'),
    }))
    .filter((g) => g.monto > 0);
}

function itemDesdeCorte(row) {
  const nombre = row.usuario_nombre || 'Recolector';
  const monto = montoCorteRecoleccion(row);
  const d = row.detalle || {};
  const gastosRc = gastosRcDesdeDetalle(d);
  const gastosRcTotal = round2(gastosRc.reduce((a, g) => a + g.monto, 0));
  const aprobadoIe = recoleccionAprobadaParaIe(row);
  return {
    origen: 'corte',
    origenId: String(row.id),
    recolectorNombre: nombre,
    recolectorClave: claveRecolectorRVirtual(nombre),
    recolectorEtiqueta: etiquetaRecolectorRVirtual(nombre),
    monto,
    sucursal: etiquetaTienda(row.sucursal_id) || row.sucursal_id || '',
    folio: row.folio || '',
    tipoItem: etiquetaTipoCorte(row),
    modulo: String(row.modulo || '').toLowerCase() || 'virtual',
    estatusOrigen: 'En Tránsito',
    fecha: row.created_at,
    detalle: '',
    receivable: monto > 0,
    deuda: false,
    gastosRc,
    gastosRcTotal,
    aprobadoIe,
    estadoAprobacionIe: String(d.estado_aprobacion || '').toLowerCase() || (aprobadoIe ? 'aprobado' : ''),
  };
}

function agruparPorRecolector(items) {
  const map = new Map();
  for (const it of items) {
    const key = it.recolectorClave;
    if (!map.has(key)) {
      map.set(key, {
        clave: key,
        etiqueta: it.recolectorEtiqueta,
        nombre: it.recolectorNombre,
        items: [],
        totalTransito: 0,
        totalDeuda: 0,
        totalRecibir: 0,
      });
    }
    const g = map.get(key);
    g.items.push(it);
    if (it.deuda) g.totalDeuda += it.monto;
    else g.totalTransito += it.monto;
    if (it.receivable) g.totalRecibir += it.monto;
  }
  return [...map.values()]
    .map((g) => ({
      ...g,
      totalTransito: Math.round(g.totalTransito * 100) / 100,
      totalDeuda: Math.round(g.totalDeuda * 100) / 100,
      totalRecibir: Math.round(g.totalRecibir * 100) / 100,
    }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));
}

function agruparCustodiaPorAdmin(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const nombre = r.recibido_por || 'Admin';
    const key = claveRecolectorRVirtual(nombre);
    if (!map.has(key)) {
      map.set(key, {
        clave: key,
        etiqueta: etiquetaRecolectorRVirtual(nombre),
        nombre,
        cuentaId: r.recibido_cuenta_id || '',
        items: [],
        total: 0,
      });
    }
    const g = map.get(key);
    g.items.push(r);
    g.total += Number(r.monto || 0);
    if (!g.cuentaId && r.recibido_cuenta_id) g.cuentaId = r.recibido_cuenta_id;
  }
  return [...map.values()]
    .map((g) => ({ ...g, total: Math.round(g.total * 100) / 100 }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));
}

/**
 * Solo recolecciones de cortes Virtual y Garage de AMR / Luis Enrique (u otros).
 * ABB, FJBB y JLBB no aparecen: van directo a IE Virtual.
 * No incluye abarrotes ni traspasos a crédito / cobro servicio.
 * Lo ya recibido en RC Virtual no aparece.
 */
export async function listarBandejaRVirtual(supabase) {
  if (!supabase) return { recolectores: [], porEntregarAbb: [], error: null };
  try {
    const [cortes, custodia] = await Promise.all([
      listarRecoleccionesCorteRVirtual(supabase),
      listarCustodia(supabase),
    ]);
    const yaRecibidos = new Set((custodia || []).map((c) => claveItem(c.origen, c.origen_id)));
    const pendientes = [];
    for (const row of cortes) {
      const it = itemDesdeCorte(row);
      // Mostrar aunque el efectivo ya se gastó (gastos RC), para poder liquidar → IE.
      if (!(it.monto > 0) && !(it.gastosRcTotal > 0)) continue;
      if (yaRecibidos.has(claveItem(it.origen, it.origenId))) continue;
      pendientes.push(it);
    }
    const porEntregarAbb = agruparCustodiaPorAdmin(
      (custodia || []).filter((c) => c.estatus === 'recibido'),
    );
    return {
      recolectores: agruparPorRecolector(pendientes),
      porEntregarAbb,
      error: null,
    };
  } catch (e) {
    if (esErrorTablaRVirtual(e)) {
      return { recolectores: [], porEntregarAbb: [], error: AVISO_FALTA_R_VIRTUAL };
    }
    return { recolectores: [], porEntregarAbb: [], error: e.message || String(e) };
  }
}

async function insertarCustodia(supabase, rows) {
  if (!rows.length) return { ok: true };
  const { error } = await supabase.from('r_virtual_custodia').insert(rows);
  if (error) {
    if (esErrorTablaRVirtual(error)) return { ok: false, error: AVISO_FALTA_R_VIRTUAL };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function marcarCorteRecibido(supabase, origenId, patch) {
  const { data: row, error: errGet } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('detalle')
    .eq('id', origenId)
    .maybeSingle();
  if (errGet || !row) return;
  const detalle = { ...(row.detalle || {}), ...patch };
  await supabase.from('cortes_contabilidad_cierres').update({ detalle }).eq('id', origenId);
}

/**
 * El admin recibe recolecciones de cortes Virtual/Garage y las carga a su cuenta.
 * Si el admin es ABB, quedan entregadas a él. Si no, quedan por entregar a ABB.
 */
export async function recibirRecoleccionesRVirtual(supabase, { recolectorClave, adminNombre, items } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const admin = String(adminNombre || '').trim();
  if (!admin) return { ok: false, error: 'No se identificó al admin que recibe.' };

  const probe = await supabase.from('r_virtual_custodia').select('id').limit(1);
  if (probe.error && esErrorTablaRVirtual(probe.error)) {
    return { ok: false, error: AVISO_FALTA_R_VIRTUAL };
  }

  const receivable = (items || []).filter(
    (it) => it.receivable
      && it.origen === 'corte'
      && it.recolectorClave === recolectorClave
      && Number(it.monto || 0) > 0
      && !esAprobadorRecoleccionIe(it.recolectorNombre),
  );
  if (!receivable.length) {
    return {
      ok: false,
      error: 'No hay recolecciones de Virtual/Garage pendientes de recibir.',
    };
  }

  // Confirmar en nube que siguen siendo cortes Virtual/Garage no recibidos.
  const ids = receivable.map((it) => it.origenId);
  const { data: rowsNube, error: errNube } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('id, modulo, detalle, turno')
    .in('id', ids);
  if (errNube) return { ok: false, error: errNube.message };
  const vivosMap = new Map((rowsNube || []).map((r) => [String(r.id), r]));
  const cortes = receivable.filter((it) => {
    const row = vivosMap.get(String(it.origenId));
    return row && esCierreRecoleccionRVirtual(row);
  });
  if (!cortes.length) {
    return {
      ok: false,
      error: 'Esas recolecciones ya se recibieron o no son de Virtual/Garage.',
    };
  }

  const cuenta = await resolverOCrearCuentaRt(supabase, admin);
  if (!cuenta.ok) return cuenta;

  const grupoId = crypto.randomUUID();
  const ahora = new Date().toISOString();
  const esDestinoFinal = esAbb(admin);
  const estatus = esDestinoFinal ? 'entregado_abb' : 'recibido';
  const etiquetaAbb = etiquetaRecolectorRVirtual(admin);

  const acreditados = [];
  for (const it of cortes) {
    const cred = await resolverOCrearCuentaRt(supabase, admin);
    if (!cred.ok) return cred;
    const { acreditarLiquidacionCuentaRt } = await import('./rtCuentas.js');
    const res = await acreditarLiquidacionCuentaRt(supabase, {
      cuentaId: cred.cuentaId,
      movimientoIds: [it.origenId],
      montoTotal: it.monto,
      usuarioNombre: admin,
      repartidorNombre: it.recolectorNombre,
      notas: `RC Virtual · ${it.tipoItem || 'recolección'} ${it.folio || it.origenId}`,
    });
    if (!res.ok) return res;
    acreditados.push({ ...it, montoAcreditado: it.monto });
    await marcarCorteRecibido(supabase, it.origenId, {
      r_virtual_estado: estatus,
      r_virtual_recibido_por: admin,
      r_virtual_recibido_at: ahora,
      r_virtual_cuenta_id: cuenta.cuentaId,
      ...(esDestinoFinal ? { r_virtual_entregado_a: etiquetaAbb, r_virtual_entregado_at: ahora } : {}),
    });
  }

  const filas = acreditados
    .filter((it) => Number(it.montoAcreditado) > 0)
    .map((it) => ({
      origen: it.origen,
      origen_id: it.origenId,
      recolector_nombre: it.recolectorNombre,
      recolector_clave: it.recolectorClave,
      monto: Math.round((Number(it.montoAcreditado ?? it.monto) || 0) * 100) / 100,
      sucursal: it.sucursal || null,
      folio: it.folio || null,
      tipo_item: it.tipoItem || null,
      detalle: it.detalle || null,
      grupo_id: grupoId,
      estatus,
      recibido_por: admin,
      recibido_cuenta_id: cuenta.cuentaId,
      recibido_at: ahora,
      entregado_a: esDestinoFinal ? etiquetaAbb : null,
      entregado_at: esDestinoFinal ? ahora : null,
    }));

  const ins = await insertarCustodia(supabase, filas);
  if (!ins.ok) return ins;

  const total = filas.reduce((a, r) => a + Number(r.monto || 0), 0);
  return {
    ok: true,
    count: filas.length,
    total: Math.round(total * 100) / 100,
    cuentaId: cuenta.cuentaId,
    entregadoAbb: esDestinoFinal,
  };
}

/**
 * ABB toma lo que le entregó otro admin: marca «entregado a: ABB»
 * y descuenta esas recolecciones de la cuenta de quien entrega.
 */
export async function entregarCustodiaAAbb(supabase, { recibidoPor, abbNombre } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const abb = String(abbNombre || '').trim();
  if (!esAbb(abb)) return { ok: false, error: 'Solo ABB puede recibir estas entregas.' };

  const etiquetaEntrega = etiquetaRecolectorRVirtual(abb);
  const clave = claveRecolectorRVirtual(recibidoPor);
  const { data, error } = await supabase
    .from('r_virtual_custodia')
    .select('*')
    .eq('estatus', 'recibido');
  if (error) {
    if (esErrorTablaRVirtual(error)) return { ok: false, error: AVISO_FALTA_R_VIRTUAL };
    return { ok: false, error: error.message };
  }

  const filas = (data || []).filter((r) => claveRecolectorRVirtual(r.recibido_por) === clave);
  if (!filas.length) return { ok: false, error: 'No hay recolecciones pendientes de ese admin.' };

  const total = Math.round(filas.reduce((a, r) => a + Number(r.monto || 0), 0) * 100) / 100;
  const cuentaOrigen = filas.find((r) => r.recibido_cuenta_id)?.recibido_cuenta_id;
  if (!cuentaOrigen) return { ok: false, error: 'No se encontró la cuenta de quien entrega.' };

  const cuentaAbb = await resolverOCrearCuentaRt(supabase, abb);
  if (!cuentaAbb.ok) return cuentaAbb;

  if (cuentaOrigen !== cuentaAbb.cuentaId && total > 0) {
    const trans = await transferirEntreCuentasRt(supabase, {
      desdeId: cuentaOrigen,
      haciaId: cuentaAbb.cuentaId,
      monto: total,
      usuarioNombre: abb,
      notas: `RC Virtual · entregado a: ${etiquetaEntrega} · de ${recibidoPor}`,
    });
    if (!trans.ok) return trans;
  }

  const ahora = new Date().toISOString();
  const ids = filas.map((r) => r.id);
  const { error: errUp } = await supabase
    .from('r_virtual_custodia')
    .update({
      estatus: 'entregado_abb',
      entregado_a: etiquetaEntrega,
      entregado_at: ahora,
    })
    .in('id', ids);
  if (errUp) return { ok: false, error: errUp.message };

  return {
    ok: true,
    count: ids.length,
    total,
    entregadoA: etiquetaEntrega,
    cuentaOrigen: etiquetaCuentaRt(cuentaOrigen),
    cuentaAbb: etiquetaCuentaRt(cuentaAbb.cuentaId),
  };
}

/**
 * Abre el ticket de una recolección Virtual/Garage (ver + imprimir).
 * `origenId` = id en cortes_contabilidad_cierres.
 */
export async function imprimirTicketRcVirtual(supabase, { origenId, origen = 'corte' } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const id = String(origenId || '').trim();
  if (!id) return { ok: false, error: 'No se identificó la recolección.' };
  if (origen && origen !== 'corte') {
    return { ok: false, error: 'Solo hay ticket para recolecciones de corte Virtual/Garage.' };
  }

  const { data, error } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('id, sucursal_id, folio, usuario_nombre, created_at, detalle, modulo, turno, ventas, caja_actual')
    .eq('id', id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'No se encontró el ticket de esa recolección.' };

  const modulo = String(data.modulo || 'virtual').toLowerCase();
  if (!MODULOS_R_VIRTUAL.has(modulo)) {
    return { ok: false, error: 'Esa recolección no es de Virtual/Garage.' };
  }

  const payload = datosImpresionDesdeHistorial(data, modulo);
  const r = imprimirCorteContabilidad(payload);
  if (r && r.ok === false) return r;
  return { ok: true };
}

/**
 * Liquida / borra una recolección de la bandeja RC Virtual:
 * - Si aún no pasó a IE VIRTUAL, la aprueba y libera egresos/ingresos pendientes.
 * - Si ya estaba aprobada, no duplica (solo marca liquidada).
 * - Sale de la bandeja (r_virtual_estado = liquidado).
 */
export async function liquidarRecoleccionRcVirtual(supabase, { origenId, adminNombre } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const id = String(origenId || '').trim();
  if (!id) return { ok: false, error: 'No se identificó la recolección.' };
  const actor = String(adminNombre || '').trim() || null;

  const { data: row, error: errGet } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (errGet) return { ok: false, error: errGet.message };
  if (!row) return { ok: false, error: 'Recolección no encontrada.' };

  const mod = String(row.modulo || '').toLowerCase();
  if (!MODULOS_R_VIRTUAL.has(mod)) {
    return { ok: false, error: 'Esa recolección no es de Virtual/Garage.' };
  }
  if (String(row?.detalle?.r_virtual_estado || '') === 'liquidado') {
    return { ok: true, yaLiquidada: true, origenId: id, monto: montoCorteRecoleccion(row) };
  }

  const yaAprobada = recoleccionAprobadaParaIe(row);
  const ahora = new Date().toISOString();
  let detalle = { ...(row.detalle || {}) };
  const pasoIe = !yaAprobada;

  if (pasoIe) {
    detalle = {
      ...detalle,
      estado_aprobacion: 'aprobado',
      aprobado_por: actor,
      aprobado_at: ahora,
    };
  }

  detalle = {
    ...detalle,
    r_virtual_estado: 'liquidado',
    r_virtual_liquidado_por: actor,
    r_virtual_liquidado_at: ahora,
  };

  const { data: updated, error: errUp } = await supabase
    .from('cortes_contabilidad_cierres')
    .update({ detalle })
    .eq('id', id)
    .select('*')
    .single();
  if (errUp) return { ok: false, error: errUp.message };

  let egresosLiberados = 0;
  try {
    const { liberarGastosCorteAIeTrasRecoleccion } = await import('./contVirtualEgresos.js');
    const lib = await liberarGastosCorteAIeTrasRecoleccion(supabase, updated);
    egresosLiberados = Number(lib?.count) || 0;
  } catch {
    /* no bloquear liquidación */
  }

  try {
    const { marcarNotificacionAtendida } = await import('./contabilidadNotificaciones.js');
    await marcarNotificacionAtendida(supabase, 'cortes_contabilidad_cierres', id, actor);
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    origenId: id,
    monto: montoCorteRecoleccion(updated),
    pasoIe,
    yaEstabaEnIe: yaAprobada,
    egresosLiberados,
  };
}

/**
 * AMR genera un gasto descontándolo del efectivo de una recolección pendiente en RC Virtual.
 * El bruto para IE (efectivo + gastos) se mantiene; el gasto queda registrado en la misma línea.
 * Si la recolección ya está aprobada en IE, el egreso aparece al recargar el panel.
 */
export async function generarGastoRecoleccionRcVirtual(supabase, {
  origenId,
  monto,
  descripcion,
  usuarioNombre,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!esUsuarioAmr(usuarioNombre)) {
    return { ok: false, error: 'Solo el usuario AMR puede generar gastos sobre recolecciones.' };
  }
  const id = String(origenId || '').trim();
  if (!id) return { ok: false, error: 'Indica la recolección.' };
  const m = round2(monto);
  if (!(m > 0)) return { ok: false, error: 'Indica un monto mayor a cero.' };
  const desc = String(descripcion || '').trim();
  if (!desc) return { ok: false, error: 'Describe el gasto.' };

  const { data: row, error: errGet } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (errGet) return { ok: false, error: errGet.message };
  if (!row) return { ok: false, error: 'Recolección no encontrada.' };

  const mod = String(row.modulo || '').toLowerCase();
  if (!MODULOS_R_VIRTUAL.has(mod)) {
    return { ok: false, error: 'Solo se pueden generar gastos sobre recolecciones Virtual/Garage.' };
  }
  if (row?.detalle?.r_virtual_estado === 'liquidado') {
    return { ok: false, error: 'Esa recolección ya fue liquidada.' };
  }

  const d = row.detalle && typeof row.detalle === 'object' ? { ...row.detalle } : {};
  const efectivoPrev = round2(d.recoleccion_efectivo ?? d.recoleccion ?? d.recoleccion_turno ?? 0);
  if (m > efectivoPrev + 0.001) {
    return {
      ok: false,
      error: `El gasto (${fmtMonto(m)}) supera el efectivo de la recolección (${fmtMonto(efectivoPrev)}).`,
    };
  }

  const comentario = `${desc} · RC Virtual · ${row.folio || id}`;
  const { data: gastoRow, error: errGasto } = await supabase
    .from('cortes_contabilidad_gastos')
    .insert([
      {
        sucursal_id: row.sucursal_id || 'MAIN',
        modulo: mod,
        categoria: 'GASTOS OPERATIVOS',
        subcategoria: 'RC VIRTUAL',
        comentario,
        monto: m,
        usuario_nombre: usuarioNombre || 'AMR',
        cerrado: true,
        estado_aprobacion: 'aprobado',
        solicitado_por: usuarioNombre || null,
        aprobado_por: usuarioNombre || null,
        aprobado_at: new Date().toISOString(),
      },
    ])
    .select('*')
    .single();
  if (errGasto) {
    if (errGasto.code === '42P01') {
      return { ok: false, error: 'Ejecuta supabase/fix_cortes_contabilidad.sql en Supabase.' };
    }
    return { ok: false, error: errGasto.message };
  }

  const efectivo = round2(efectivoPrev - m);
  const gastosPrev = Array.isArray(d.gastos) ? [...d.gastos] : [];
  const idsPrev = Array.isArray(d.gastos_ids) ? d.gastos_ids.map(String) : [];
  const gastoEmb = {
    id: gastoRow.id,
    categoria: gastoRow.categoria,
    subcategoria: gastoRow.subcategoria,
    comentario: gastoRow.comentario,
    monto: m,
    usuario_nombre: gastoRow.usuario_nombre,
    solicitado_por: gastoRow.solicitado_por,
    origen_rc_virtual: true,
    created_at: gastoRow.created_at,
  };
  gastosPrev.push(gastoEmb);
  if (!idsPrev.includes(String(gastoRow.id))) idsPrev.push(String(gastoRow.id));
  const gastosTotal = round2(
    gastosPrev.reduce((a, g) => a + (Number(g.monto) || 0), 0),
  );

  const detalle = {
    ...d,
    recoleccion: efectivo,
    recoleccion_turno: efectivo,
    recoleccion_efectivo: efectivo,
    gastos: gastosPrev,
    gastos_ids: idsPrev,
    gastos_total: gastosTotal,
    recoleccion_contabilidad: round2(efectivo + gastosTotal),
    formula_recoleccion_ie: 'efectivo_mas_gastos',
    gastos_deducidos_en_ie: true,
  };

  const { error: errUp } = await supabase
    .from('cortes_contabilidad_cierres')
    .update({ detalle })
    .eq('id', id);
  if (errUp) {
    await supabase.from('cortes_contabilidad_gastos').delete().eq('id', gastoRow.id);
    return { ok: false, error: errUp.message };
  }

  // Si ya estaba en IE, intentar registrar egreso de libro (CUBRE/TAXIS u omitidos no aplican;
  // el unificado lo tomará por gastos_ids liberados).
  if (recoleccionAprobadaParaIe({ ...row, detalle })) {
    try {
      const { liberarGastosCorteAIeTrasRecoleccion } = await import('./contVirtualEgresos.js');
      await liberarGastosCorteAIeTrasRecoleccion(supabase, { ...row, detalle });
    } catch {
      /* ignore */
    }
  }

  return {
    ok: true,
    origenId: id,
    monto: m,
    efectivoRestante: efectivo,
    gastoId: gastoRow.id,
    gasto: gastoEmb,
  };
}

export { fmtMonto };
