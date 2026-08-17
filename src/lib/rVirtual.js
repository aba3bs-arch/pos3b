import { etiquetaTienda } from '../constants/sucursales.js';
import {
  esAbb,
  nombreCoincidePatrones,
  normalizarNombreMatch,
} from './contabilidadConstants.js';
import {
  armarAcreditacionesLiquidacion,
  fmtMonto,
  liquidarMovimientos,
  listarGastosActivosParaLiquidacion,
} from './controlEfectivo.js';
import {
  CUENTA_RT_ABB_ID,
  etiquetaCuentaRt,
  resolverOCrearCuentaRt,
  transferirEntreCuentasRt,
} from './rtCuentas.js';

export const AVISO_FALTA_R_VIRTUAL =
  'Ejecuta en Supabase: supabase/fix_r_virtual_custodia.sql para el buzón R Virtual.';

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

function esCierreRecoleccionVirtual(row) {
  if (String(row?.modulo || '').toLowerCase() !== 'virtual') return false;
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

async function listarTransitoPendienteRVirtual(supabase) {
  const { data, error } = await supabase
    .from('transito_efectivo')
    .select(
      'id, sucursal_origen, repartidor_id, repartidores(nombre), cajero_nombre, monto, fecha_hora, num_traspaso, tipo_movimiento, estatus, descripcion_gasto',
    )
    .in('estatus', ['En Tránsito', 'Por Cobrar'])
    .in('tipo_movimiento', ['Recolección', 'Entrega Crédito', 'Cobro Servicio'])
    .order('fecha_hora', { ascending: false })
    .limit(800);
  if (error) throw error;
  return data || [];
}

async function listarRecoleccionesCorteVirtual(supabase) {
  const { data, error } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('id, sucursal_id, folio, usuario_nombre, created_at, detalle, modulo, turno')
    .eq('modulo', 'virtual')
    .eq('turno', 'RECOLECCION')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []).filter(esCierreRecoleccionVirtual);
}

function itemDesdeTransito(m) {
  const nombre = m.repartidores?.nombre || m.cajero_nombre || 'Recolector';
  return {
    origen: 'transito',
    origenId: String(m.id),
    recolectorNombre: nombre,
    recolectorClave: claveRecolectorRVirtual(nombre),
    recolectorEtiqueta: etiquetaRecolectorRVirtual(nombre),
    monto: Number(m.monto || 0),
    sucursal: m.sucursal_origen || '',
    folio: m.num_traspaso || '',
    tipoItem: m.tipo_movimiento || 'Recolección',
    estatusOrigen: m.estatus,
    fecha: m.fecha_hora,
    detalle: m.descripcion_gasto || '',
    receivable: m.estatus === 'En Tránsito',
    deuda: m.estatus === 'Por Cobrar',
  };
}

function itemDesdeCorte(row) {
  const nombre = row.usuario_nombre || 'Recolector';
  const monto = montoCorteRecoleccion(row);
  return {
    origen: 'corte',
    origenId: String(row.id),
    recolectorNombre: nombre,
    recolectorClave: claveRecolectorRVirtual(nombre),
    recolectorEtiqueta: etiquetaRecolectorRVirtual(nombre),
    monto,
    sucursal: etiquetaTienda(row.sucursal_id) || row.sucursal_id || '',
    folio: row.folio || '',
    tipoItem: 'Recolección Virtual',
    estatusOrigen: 'En Tránsito',
    fecha: row.created_at,
    detalle: '',
    receivable: monto > 0,
    deuda: false,
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
 * Recolecciones de corte Virtual + traspasos aún en tránsito/deuda.
 * Lo ya liquidado (antes de recolectar en R Virtual) no aparece.
 */
export async function listarBandejaRVirtual(supabase) {
  if (!supabase) return { recolectores: [], porEntregarAbb: [], error: null };
  try {
    const [transito, custodia] = await Promise.all([
      listarTransitoPendienteRVirtual(supabase),
      listarCustodia(supabase),
    ]);
    const yaRecibidos = new Set((custodia || []).map((c) => claveItem(c.origen, c.origen_id)));
    const pendientes = [];
    for (const m of transito) {
      const it = itemDesdeTransito(m);
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

function repartirMontoAcreditado(items, acreditado) {
  const gross = items.reduce((a, it) => a + Number(it.monto || 0), 0);
  const net = Math.round((Number(acreditado) || 0) * 100) / 100;
  if (!(gross > 0) || net <= 0) {
    return items.map((it) => ({ ...it, montoAcreditado: 0 }));
  }
  let asignado = 0;
  return items.map((it, idx) => {
    if (idx === items.length - 1) {
      const resto = Math.round((net - asignado) * 100) / 100;
      return { ...it, montoAcreditado: Math.max(0, resto) };
    }
    const parte = Math.round((it.monto * net) / gross * 100) / 100;
    asignado += parte;
    return { ...it, montoAcreditado: parte };
  });
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
 * El admin recibe las recolecciones en tránsito del recolector y las carga a su cuenta.
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

  const receivable = (items || []).filter((it) => it.receivable && it.recolectorClave === recolectorClave);
  if (!receivable.length) {
    return { ok: false, error: 'No hay recolecciones en tránsito para recibir. Las deudas por cobrar no se cargan hasta que se cobren; lo ya liquidado no se vuelve a recolectar.' };
  }

  const cuenta = await resolverOCrearCuentaRt(supabase, admin);
  if (!cuenta.ok) return cuenta;

  const transito = receivable.filter((it) => it.origen === 'transito');
  const cortes = receivable.filter((it) => it.origen === 'corte');
  const grupoId = crypto.randomUUID();
  const ahora = new Date().toISOString();
  const esDestinoFinal = esAbb(admin);
  const estatus = esDestinoFinal ? 'entregado_abb' : 'recibido';
  const etiquetaAbb = etiquetaRecolectorRVirtual(admin);

  const acreditados = [];

  if (transito.length) {
    const ids = transito.map((it) => it.origenId);
    const { data: rows } = await supabase
      .from('transito_efectivo')
      .select('id, monto, tipo_movimiento, sucursal_origen, num_traspaso, repartidor_id')
      .in('id', ids)
      .eq('estatus', 'En Tránsito');
    const vivos = rows || [];
    if (!vivos.length && !cortes.length) {
      return { ok: false, error: 'Esas recolecciones ya se liquidaron; no hace falta volver a recolectarlas.' };
    }
    if (vivos.length) {
      let totalGastos = 0;
      const repIds = [...new Set(vivos.map((r) => r.repartidor_id).filter(Boolean))];
      for (const rid of repIds) {
        const activos = await listarGastosActivosParaLiquidacion(supabase, rid);
        totalGastos += (activos || []).reduce((a, g) => a + Number(g.monto || 0), 0);
      }
      const seleccionados = vivos.map((r) => ({
        ...r,
        tipo_movimiento: r.tipo_movimiento || 'Recolección',
      }));
      const { acreditaciones } = armarAcreditacionesLiquidacion({
        seleccionados,
        totalGastos,
        cuentaRtMercancia: cuenta.cuentaId,
        cuentaRtServicios: cuenta.cuentaId,
        repartidorNombre: transito[0]?.recolectorNombre,
      });
      const liq = await liquidarMovimientos(supabase, {
        ids: vivos.map((r) => r.id),
        adminNombre: admin,
        repartidorNombre: transito[0]?.recolectorNombre,
        acreditaciones,
      });
      if (!liq.ok) return liq;
      const vivosItems = transito.filter((it) => vivos.some((r) => String(r.id) === String(it.origenId)));
      const montoAcred = (liq.acreditaciones || []).reduce((a, ac) => a + Number(ac.monto || 0), 0);
      acreditados.push(...repartirMontoAcreditado(vivosItems, montoAcred));
    }
  }

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
      notas: `R Virtual · recolección corte ${it.folio || it.origenId}`,
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
      notas: `R Virtual · entregado a: ${etiquetaEntrega} · de ${recibidoPor}`,
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

export { fmtMonto };
