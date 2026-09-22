/**
 * Efectivo cobrado en Venta en Ruta → recolección RC Abarrotes
 * (bandeja Contabilidad → RC Abarrotes, agrupada por recolector).
 */
import { normalizarCodigoTienda, ALMACEN_CENTRAL } from '../constants/sucursales.js';
import { detalleRecoleccionParaIe } from './corteContabilidad/calc.js';
import {
  notificarRecoleccionPendienteIe,
  registrarCierreCorte,
} from './corteContabilidad/store.js';
import { estadoAprobacionRecoleccionInicial } from './contabilidadConstants.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Crea un cierre RECOLECCION módulo abarrotes para que el efectivo
 * aparezca en RC Abarrotes bajo el nombre del recolector (vendedor ruta).
 */
export async function registrarRecoleccionRcAbarrotesDesdeVentaRuta(supabase, {
  monto,
  vendedorNombre,
  vendedorId,
  sucursalId,
  folioVenta,
  clienteNombre,
  clienteTipo,
  ventaId,
  metodoPago,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const m = round2(monto);
  if (!(m > 0)) return { ok: false, error: 'Monto inválido.' };

  const recolector = String(vendedorNombre || '').trim() || 'Recolector ruta';
  const folio = String(folioVenta || '').trim() || `VR-${Date.now().toString(36).toUpperCase()}`;
  const sid = normalizarCodigoTienda(sucursalId)
    || (String(clienteTipo || '') === 'sucursal' ? null : ALMACEN_CENTRAL)
    || ALMACEN_CENTRAL;
  const estadoAprob = estadoAprobacionRecoleccionInicial(recolector);

  const detalle = detalleRecoleccionParaIe({
    efectivo: m,
    gastosTotal: 0,
    extras: {
      tipo_cierre: 'recoleccion',
      estado_aprobacion: estadoAprob,
      origen: 'venta_ruta',
      folio_venta: folio,
      venta_id: ventaId || null,
      cliente_nombre: clienteNombre || null,
      cliente_tipo: clienteTipo || null,
      metodo_pago: metodoPago || 'efectivo',
      comentarios: `Venta en ruta ${folio}${clienteNombre ? ` · ${clienteNombre}` : ''}`.trim(),
    },
  });

  const payload = {
    sucursal_id: sid,
    modulo: 'abarrotes',
    folio: `REC-${folio}`,
    turno: 'RECOLECCION',
    usuario_id: vendedorId != null ? String(vendedorId) : null,
    usuario_nombre: recolector,
    caja_actual: 0,
    ventas: 0,
    detalle,
  };

  const res = await registrarCierreCorte(supabase, payload);
  if (!res.ok) return { ok: false, error: res.error || 'No se registró en RC Abarrotes.' };

  if (estadoAprob === 'pendiente_admin' && res.data) {
    try {
      await notificarRecoleccionPendienteIe(supabase, res.data);
    } catch {
      /* no bloquear venta */
    }
  }

  return {
    ok: true,
    cierreId: res.data?.id || null,
    folio: payload.folio,
    monto: m,
    recolector,
    sucursalId: sid,
    estadoAprobacion: estadoAprob,
    pendienteIe: estadoAprob === 'pendiente_admin',
    data: res.data,
  };
}
