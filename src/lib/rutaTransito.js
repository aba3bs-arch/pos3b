/**
 * Efectivo en tránsito generado por Venta en Ruta.
 *
 * repartidor_id debe existir en public.repartidores (ej. rep_luis).
 * El POS pasa UUID de usuarios; resolverRepartidorId() mapea a un id válido.
 */

import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { ahoraIsoNogales } from './controlEfectivo.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function resolverRepartidorId(supabase, vendedorId, vendedorNombre) {
  const prefer = vendedorId != null ? String(vendedorId).trim() : '';
  try {
    const { data: reps } = await supabase
      .from('repartidores')
      .select('id,nombre,activo')
      .order('id');
    const list = reps || [];
    if (prefer && list.some((r) => String(r.id) === prefer)) return prefer;
    const nombre = String(vendedorNombre || '').trim().toLowerCase();
    if (nombre) {
      const byName = list.find(
        (r) => String(r.nombre || '').trim().toLowerCase() === nombre && r.activo !== false,
      );
      if (byName) return String(byName.id);
    }
    const luis = list.find((r) => String(r.id) === 'rep_luis');
    if (luis) return 'rep_luis';
    const activo = list.find((r) => r.activo !== false);
    if (activo) return String(activo.id);
  } catch {
    /* ignore */
  }
  return prefer || 'rep_luis';
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
  const repartidorId = await resolverRepartidorId(supabase, vendedorId, vendedorNombre);
  const row = {
    sucursal_origen: tienda === 'MAIN' ? 'MAIN' : tienda,
    repartidor_id: repartidorId,
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
