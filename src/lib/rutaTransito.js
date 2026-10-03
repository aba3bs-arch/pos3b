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
    const list = (reps || []).filter((r) => r && r.activo !== false);
    if (prefer && list.some((r) => String(r.id) === prefer)) return { ok: true, id: prefer };

    const nombre = String(vendedorNombre || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
    if (nombre) {
      const byName = list.find((r) => {
        const n = String(r.nombre || '')
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ');
        return n === nombre || n.startsWith(`${nombre} `) || nombre.startsWith(`${n} `);
      });
      if (byName) return { ok: true, id: String(byName.id) };
    }

    // Si el vendedorId parece UUID de usuario POS, no inventar otro repartidor.
    if (prefer && /^[0-9a-f-]{36}$/i.test(prefer)) {
      return {
        ok: false,
        error: `No hay recolector Panel RT enlazado al vendedor (usuario ${prefer.slice(0, 8)}…). Asigna el camión/RT o crea el repartidor.`,
      };
    }
    if (prefer) return { ok: true, id: prefer };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
  return {
    ok: false,
    error: 'No se pudo resolver el recolector para el efectivo en tránsito. Revisa Panel RT.',
  };
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
  const resuelto = await resolverRepartidorId(supabase, vendedorId, vendedorNombre);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const repartidorId = resuelto.id;
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
