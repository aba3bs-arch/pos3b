import { etiquetaTienda } from '../constants/sucursales.js';
import {
  ALMACEN_CENTRAL,
  buildPatchStock,
  buildPatchStockTienda,
  buildPatchVaciarInventarioCompleto,
  esAlmacenCentral,
  etiquetaCedisEmpresa,
  stockEnUbicacion,
} from './inventarioMultitienda.js';
import { guardarMovimientoLocal, leerMovimientosLocal, leerProductoInventarioFresco } from './inventarioMovimientos.js';
import { puedeGestionarInventarioMultitienda } from './roles.js';

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
    rol,
  } = opts;

  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  if (!puedeGestionarInventarioMultitienda(rol)) {
    return { ok: false, error: 'Solo Gerente o Administrador pueden vaciar inventario.' };
  }
  const lista = (inventarioCompleto || []).filter((p) => {
    if (!productoIds?.length) return true;
    return productoIds.includes(p.id);
  });
  if (!lista.length) return { ok: false, error: 'No hay productos para vaciar.' };

  let log = leerMovimientosLocal();
  let aplicados = 0;
  const errores = [];

  for (const prodMem of lista) {
    const fresco = await leerProductoInventarioFresco(supabase, prodMem.id);
    if (!fresco.ok) {
      errores.push(`${prodMem.nombre || prodMem.id}: ${fresco.error}`);
      continue;
    }
    const producto = fresco.producto;
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
        if (pisoAntes > 0) {
          movimientos.push({ ubicacion: 'piso', qty: pisoAntes, antes: pisoAntes, despues: 0 });
        }
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
      }, supabase);
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

/**
 * Opciones de vaciado con el nombre concreto de la tienda activa.
 * @param {string} [sucursal]
 */
export function opcionesVaciado(sucursal) {
  const codigo = String(sucursal || '').trim() || 'MAIN';
  const tienda = etiquetaTienda(codigo);
  const enCedis = esAlmacenCentral(codigo);
  const cedisLbl = etiquetaCedisEmpresa();

  return [
    {
      id: 'piso',
      label: `Piso de venta · ${tienda}`,
      desc: enCedis
        ? `Deja en cero el piso de ${tienda}; conserva ${cedisLbl}.`
        : `Deja en cero el mostrador de ${tienda}; no toca otras tiendas ni ${cedisLbl}.`,
    },
    {
      id: 'cedis',
      label: cedisLbl,
      desc: `Vacía solo ${cedisLbl} (código CEDIS). Conserva el piso de ${tienda} y de las demás sucursales.`,
    },
    {
      id: 'tienda',
      label: `Toda la tienda · ${tienda}`,
      desc: enCedis
        ? `Vacía ${cedisLbl} y el piso de ${tienda}. No toca el piso de las otras sucursales.`
        : `Vacía solo el piso de venta de ${tienda}. No toca ${cedisLbl} ni otras tiendas.`,
    },
    {
      id: 'global',
      label: 'Todas las sucursales',
      desc: `Pone en cero ${cedisLbl} y el piso de MAIN, ${tienda} y todas las demás tiendas.`,
    },
  ];
}

/** @deprecated Preferir opcionesVaciado(sucursal) para incluir el nombre de la tienda. */
export const OPCIONES_VACIADO = opcionesVaciado();
