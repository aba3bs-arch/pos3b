import {
  ALMACEN_CENTRAL,
  buildPatchStock,
  buildPatchStockTienda,
  buildPatchVaciarInventarioCompleto,
  esAlmacenCentral,
  stockEnUbicacion,
} from './inventarioMultitienda.js';
import { guardarMovimientoLocal, leerMovimientosLocal } from './inventarioMovimientos.js';

/**
 * Vacía inventario de productos.
 * alcance: 'piso' | 'cedis' | 'tienda' | 'global'
 * — CEDIS = almacén central MAIN (único de la empresa).
 */
export async function vaciarInventario(supabase, opts) {
  const {
    inventarioCompleto,
    sucursal,
    alcance = 'tienda',
    productoIds = null,
    usuario,
    motivo,
  } = opts;

  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const lista = (inventarioCompleto || []).filter((p) => {
    if (!productoIds?.length) return true;
    return productoIds.includes(p.id);
  });
  if (!lista.length) return { ok: false, error: 'No hay productos para vaciar.' };

  let log = leerMovimientosLocal();
  let aplicados = 0;
  const errores = [];

  for (const producto of lista) {
    let patch;
    const movimientos = [];

    if (alcance === 'global') {
      const pisoAntes = stockEnUbicacion(producto, sucursal, 'piso', sucursal);
      const cedisAntes = stockEnUbicacion(producto, ALMACEN_CENTRAL, 'cedis', sucursal);
      patch = buildPatchVaciarInventarioCompleto(producto);
      if (pisoAntes > 0) movimientos.push({ ubicacion: 'piso', qty: pisoAntes, antes: pisoAntes, despues: 0 });
      if (cedisAntes > 0) movimientos.push({ ubicacion: 'cedis', qty: cedisAntes, antes: cedisAntes, despues: 0 });
    } else if (alcance === 'cedis') {
      const cedisAntes = stockEnUbicacion(producto, ALMACEN_CENTRAL, 'cedis', sucursal);
      patch = buildPatchStock(producto, ALMACEN_CENTRAL, 'cedis', 0, sucursal);
      if (cedisAntes > 0) {
        movimientos.push({ ubicacion: 'cedis', qty: cedisAntes, antes: cedisAntes, despues: 0 });
      }
    } else if (alcance === 'piso') {
      const pisoAntes = stockEnUbicacion(producto, sucursal, 'piso', sucursal);
      patch = buildPatchStock(producto, sucursal, 'piso', 0, sucursal);
      if (pisoAntes > 0) {
        movimientos.push({ ubicacion: 'piso', qty: pisoAntes, antes: pisoAntes, despues: 0 });
      }
    } else if (alcance === 'tienda') {
      if (esAlmacenCentral(sucursal)) {
        const pisoAntes = stockEnUbicacion(producto, sucursal, 'piso', sucursal);
        const cedisAntes = stockEnUbicacion(producto, ALMACEN_CENTRAL, 'cedis', sucursal);
        patch = buildPatchStockTienda(producto, sucursal, 0, 0, sucursal);
        if (pisoAntes > 0) movimientos.push({ ubicacion: 'piso', qty: pisoAntes, antes: pisoAntes, despues: 0 });
        if (cedisAntes > 0) movimientos.push({ ubicacion: 'cedis', qty: cedisAntes, antes: cedisAntes, despues: 0 });
      } else {
        const pisoAntes = stockEnUbicacion(producto, sucursal, 'piso', sucursal);
        patch = buildPatchStock(producto, sucursal, 'piso', 0, sucursal);
        if (pisoAntes > 0) movimientos.push({ ubicacion: 'piso', qty: pisoAntes, antes: pisoAntes, despues: 0 });
      }
    }

    const { error } = await supabase.from('productos').update(patch).eq('id', producto.id);
    if (error) {
      errores.push(`${producto.nombre}: ${error.message}`);
      continue;
    }

    for (const m of movimientos) {
      log = guardarMovimientoLocal({
        tipo: 'retiro',
        modo: 'vaciado_inventario',
        producto_id: producto.id,
        producto_nombre: producto.nombre,
        cantidad: m.qty,
        stock_antes: m.antes,
        stock_despues: m.despues,
        ubicacion: m.ubicacion,
        motivo: motivo?.trim() || `Vaciado de inventario (${alcance})`,
        usuario: usuario || '—',
        sucursal: sucursal || '',
        created_at: new Date().toISOString(),
      });
    }
    aplicados += 1;
  }

  if (!aplicados) return { ok: false, error: errores.join('\n') || 'No se vació inventario.' };
  return {
    ok: true,
    aplicados,
    errores,
    log,
    mensaje:
      errores.length > 0
        ? `Inventario vaciado en ${aplicados} producto(s). ${errores.length} con error.`
        : `Inventario vaciado: ${aplicados} producto(s).`,
  };
}

export const OPCIONES_VACIADO = [
  { id: 'piso', label: 'Piso de venta (tienda activa)', desc: 'Deja en cero el mostrador; conserva el CEDIS central.' },
  { id: 'cedis', label: 'CEDIS central (almacén empresa)', desc: 'Vacía el almacén MAIN; conserva el piso de las tiendas.' },
  {
    id: 'tienda',
    label: 'Toda la tienda activa',
    desc: 'En MAIN vacía CEDIS y piso; en sucursales solo el piso de venta.',
  },
  { id: 'global', label: 'Todas las sucursales', desc: 'Pone en cero el CEDIS central y el piso de MAIN y todas las tiendas.' },
];
