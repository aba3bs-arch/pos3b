import {
  buildPatchStockTienda,
  buildPatchVaciarInventarioCompleto,
  stockEnUbicacion,
} from './inventarioMultitienda.js';
import { guardarMovimientoLocal, leerMovimientosLocal } from './inventarioMovimientos.js';

/**
 * Vacía inventario de productos.
 * alcance: 'piso' | 'cedis' | 'tienda' (piso+cedis sucursal activa) | 'global' (todas las tiendas)
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
      const cedisAntes = stockEnUbicacion(producto, sucursal, 'cedis', sucursal);
      patch = buildPatchVaciarInventarioCompleto(producto);
      if (pisoAntes > 0) movimientos.push({ ubicacion: 'piso', qty: pisoAntes, antes: pisoAntes, despues: 0 });
      if (cedisAntes > 0) movimientos.push({ ubicacion: 'cedis', qty: cedisAntes, antes: cedisAntes, despues: 0 });
    } else {
      const pisoAntes = stockEnUbicacion(producto, sucursal, 'piso', sucursal);
      const cedisAntes = stockEnUbicacion(producto, sucursal, 'cedis', sucursal);
      const nuevoPiso = alcance === 'cedis' ? pisoAntes : 0;
      const nuevoCedis = alcance === 'piso' ? cedisAntes : 0;
      patch = buildPatchStockTienda(producto, sucursal, nuevoPiso, nuevoCedis, sucursal);
      if (alcance !== 'cedis' && pisoAntes > 0) {
        movimientos.push({ ubicacion: 'piso', qty: pisoAntes, antes: pisoAntes, despues: 0 });
      }
      if (alcance !== 'piso' && cedisAntes > 0) {
        movimientos.push({ ubicacion: 'cedis', qty: cedisAntes, antes: cedisAntes, despues: 0 });
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
  { id: 'piso', label: 'Piso de venta (tienda activa)', desc: 'Deja en cero el mostrador; conserva CEDIS.' },
  { id: 'cedis', label: 'CEDIS (tienda activa)', desc: 'Deja en cero el almacén de la tienda; conserva piso.' },
  { id: 'tienda', label: 'Toda la tienda activa', desc: 'Piso y CEDIS de la sucursal seleccionada.' },
  { id: 'global', label: 'Todas las sucursales', desc: 'Pone en cero el stock en MAIN y todas las tiendas.' },
];
