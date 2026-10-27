import { ESTADOS_ACTIVOS, TIPO_NOTIFICACION_CONCILIACION } from './config.js';
import { ordenarAlertas } from './motor.js';
import { planificarSincronizacion, validarCambioEstado } from './plan.js';
import { crearNotificacion, emitirRefreshNotificaciones } from '../contabilidadNotificaciones.js';

export const AVISO_FALTA_CONCILIACION =
  'Falta la tabla de alertas de conciliación. En Supabase → SQL Editor ejecuta supabase/fix_ruta_conciliacion.sql.';

export function faltaTablaConciliacion(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || error?.code === 'PGRST205' || msg.includes('ruta_conciliacion');
}

const COLUMNAS_ALERTA = ['clave', 'control', 'severidad', 'estado', 'mensaje', 'sucursal_id', 'tienda', 'repartidor_id',
  'repartidor_nombre', 'venta_id', 'venta_folio', 'venta_fecha', 'carga_id', 'compra_id', 'esperado', 'registrado',
  'diferencia', 'unidad', 'detalle', 'primera_vez_at', 'ultima_vez_at'];

const soloColumnas = (row) => Object.fromEntries(COLUMNAS_ALERTA.filter((k) => k in row).map((k) => [k, row[k]]));

async function existentesDeVentas(db, ventaIds) {
  const filas = [];
  for (let i = 0; i < ventaIds.length; i += 100) {
    const lote = ventaIds.slice(i, i + 100);
    for (let start = 0; ; start += 500) {
      const { data, error } = await db.from('ruta_conciliacion_alertas').select('*')
        .in('venta_id', lote).order('id').range(start, start + 499);
      if (error) throw error;
      filas.push(...(data || []));
      if ((data || []).length < 500) break;
    }
  }
  return filas;
}

async function porLotes(filas, tam, fn) {
  for (let i = 0; i < filas.length; i += tam) await fn(filas.slice(i, i + tam));
}

/**
 * Guarda las alertas de una corrida y avisa a Admin y Gerente de las críticas nuevas.
 * Nunca modifica ventas, créditos, gastos ni inventario.
 */
export async function sincronizarAlertas(db, {
  hallazgos = [], entregas = [], desde = null, hasta = null, tipo = 'manual', usuario = null, completa = true, ahora = new Date(),
} = {}) {
  if (!db) return { ok: false, error: 'Sin conexión.' };
  const inicio = Date.now();
  const ventaIds = [...new Set(entregas.map((e) => String(e.id)))];
  try {
    const existentes = ventaIds.length ? await existentesDeVentas(db, ventaIds) : [];
    const plan = planificarSincronizacion({ existentes, hallazgos, ventasRevisadas: ventaIds, completa, ahora });

    await porLotes(plan.insertar.map(soloColumnas), 100, async (lote) => {
      const { error } = await db.from('ruta_conciliacion_alertas').upsert(lote, { onConflict: 'clave', ignoreDuplicates: true });
      if (error) throw error;
    });
    for (const { id, patch } of plan.actualizar) {
      const { error } = await db.from('ruta_conciliacion_alertas').update(patch).eq('id', id);
      if (error) throw error;
    }
    await porLotes(plan.autoResolver, 100, async (ids) => {
      const { error } = await db.from('ruta_conciliacion_alertas').update({
        estado: 'auto_resuelta', resuelta_at: ahora.toISOString(), nota_resolucion: 'Cuadró en una nueva conciliación.',
      }).in('id', ids).in('estado', ESTADOS_ACTIVOS);
      if (error) throw error;
    });

    let corridaId = null;
    const { data: corrida } = await db.from('ruta_conciliacion_corridas').insert([{
      tipo, desde, hasta, completa, ventas_revisadas: ventaIds.length,
      alertas_nuevas: plan.insertar.length, alertas_resueltas: plan.autoResolver.length,
      duracion_ms: Date.now() - inicio, ejecutada_por: usuario?.nombre || null,
    }]).select('id').single();
    corridaId = corrida?.id || null;

    let notificadas = 0;
    if (plan.nuevasCriticas.length && corridaId) {
      const n = plan.nuevasCriticas.length;
      const folios = [...new Set(plan.nuevasCriticas.map((h) => h.venta_folio).filter(Boolean))].slice(0, 3).join(', ');
      const res = await crearNotificacion(db, {
        sucursal_id: 'MAIN',
        tipo: TIPO_NOTIFICACION_CONCILIACION,
        ref_tabla: 'ruta_conciliacion_corridas',
        ref_id: corridaId,
        titulo: `Conciliación de ruta: ${n} ${n === 1 ? 'alerta crítica' : 'alertas críticas'}`,
        mensaje: `${folios ? `Ventas: ${folios}. ` : ''}Revisa Venta en Ruta → Conciliación → Alertas.`,
      });
      if (res.ok) notificadas = n;
    }
    return { ok: true, corridaId, nuevas: plan.insertar.length, resueltas: plan.autoResolver.length,
      reabiertas: plan.actualizar.filter((u) => u.patch.estado === 'abierta').length, notificadas };
  } catch (e) {
    if (faltaTablaConciliacion(e)) return { ok: false, faltaTabla: true, error: AVISO_FALTA_CONCILIACION };
    return { ok: false, error: `No se guardaron las alertas: ${e.message || e}` };
  }
}

export async function listarAlertas(db, { estados = ESTADOS_ACTIVOS, severidad = '', sucursal = '', limite = 300 } = {}) {
  if (!db) return { ok: true, data: [] };
  let q = db.from('ruta_conciliacion_alertas').select('*').in('estado', estados)
    .order('ultima_vez_at', { ascending: false }).limit(limite);
  if (severidad) q = q.eq('severidad', severidad);
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  const { data, error } = await q;
  if (error) {
    if (faltaTablaConciliacion(error)) return { ok: false, faltaTabla: true, data: [], error: AVISO_FALTA_CONCILIACION };
    return { ok: false, data: [], error: error.message };
  }
  return { ok: true, data: ordenarAlertas(data || []) };
}

export async function contarAlertasActivas(db) {
  if (!db) return { ok: true, total: 0, criticas: 0 };
  const { data, error } = await db.from('ruta_conciliacion_alertas').select('severidad').in('estado', ESTADOS_ACTIVOS).limit(1000);
  if (error) return { ok: false, total: 0, criticas: 0 };
  return { ok: true, total: data.length, criticas: data.filter((a) => a.severidad === 'critica').length };
}

export async function cambiarEstadoAlerta(db, alerta, { estado, nota = '', usuario = null, rol = null } = {}) {
  const motivo = validarCambioEstado({ estado, nota, rol: rol || usuario?.rol, severidad: alerta.severidad });
  if (motivo) return { ok: false, error: motivo };
  const cierra = ['justificada', 'resuelta'].includes(estado);
  const patch = {
    estado,
    nota_resolucion: cierra ? String(nota).trim() : null,
    resuelta_at: cierra ? new Date().toISOString() : null,
    resuelta_por: cierra ? usuario?.nombre || null : null,
  };
  const { error } = await db.from('ruta_conciliacion_alertas').update(patch).eq('id', alerta.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Quita el aviso del buzón cuando ya no quedan alertas críticas abiertas. */
export async function limpiarAvisosConciliacion(db, atendidaPor = null) {
  if (!db) return;
  const { criticas, ok } = await contarAlertasActivas(db);
  if (!ok || criticas > 0) return;
  const { error } = await db.from('contabilidad_notificaciones').update({
    estado: 'atendida', leida: true, atendida_por: atendidaPor, atendida_at: new Date().toISOString(),
  }).eq('tipo', TIPO_NOTIFICACION_CONCILIACION).eq('estado', 'pendiente');
  if (!error) emitirRefreshNotificaciones();
}
