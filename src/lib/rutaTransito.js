/**
 * Efectivo en tránsito generado por Venta en Ruta.
 */

import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { ahoraIsoNogales } from './controlEfectivo.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export async function registrarEfectivoTransitoVentaRuta(supabase, {
  sucursalOrigen,
  monto,
  folioVenta,
  vendedorId,
  vendedorNombre,
  nota,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const m = round2(monto);
  if (!(m > 0)) return { ok: false, error: 'Monto inválido.' };
  const tienda = normalizarCodigoTienda(sucursalOrigen) || 'MAIN';
  const folio = String(folioVenta || '').trim() || `VR-${Date.now().toString(36).toUpperCase()}`;
  const row = {
    sucursal_origen: tienda === 'MAIN' ? 'MAIN' : tienda,
    repartidor_id: vendedorId != null ? String(vendedorId) : 'ruta',
    cajero_nombre: String(vendedorNombre || 'Vendedor ruta').trim(),
    monto: m,
    num_traspaso: folio,
    foto_url: nota || `Venta en ruta ${folio}`,
    estatus: 'En Tránsito',
    tipo_movimiento: 'Venta Ruta',
    descripcion_gasto: 'Venta en ruta · efectivo en tránsito',
    fecha_hora: ahoraIsoNogales(),
    usuario_liquida: 'No Leído',
  };
  const { data, error } = await supabase.from('transito_efectivo').insert([row]).select('id').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}
