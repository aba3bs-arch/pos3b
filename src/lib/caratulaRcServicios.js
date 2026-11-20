import { esCobroCreditoMovimiento } from './controlEfectivo.js';
import {
  esSucursalNoVenta,
  esSucursalRuta,
  listarSucursalesOperativas,
  normalizarCodigoTienda,
} from '../constants/sucursales.js';

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normNombre(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function mismoRecolector(a, b) {
  const x = normNombre(a);
  const y = normNombre(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const corto = x.length <= y.length ? x : y;
  const largo = x.length <= y.length ? y : x;
  return corto.length >= 6 && largo.includes(corto);
}

function vacio(id, nombre) {
  return {
    id,
    nombre,
    saldo: 0,
    transito: 0,
    rc: 0,
    ventas: { count: 0, total: 0, efectivo: 0, efectivoCount: 0, creditoNuevo: 0, creditoCount: 0 },
    recuperados: { count: 0, total: 0 },
    servicios: { count: 0, total: 0 },
    externos: { count: 0, total: 0 },
  };
}

function esTiendaPropia(codigo) {
  const c = normalizarCodigoTienda(codigo);
  if (!c || esSucursalNoVenta(c) || esSucursalRuta(c)) return false;
  return listarSucursalesOperativas().includes(c);
}

function esCargoPendiente(m) {
  if (!m || m.tipo !== 'cargo') return false;
  if (m.pagado_at) return false;
  const est = String(m.estatus || 'pendiente').toLowerCase();
  return est === 'pendiente' || est === '' || est === 'null';
}

/** Venta Ruta, cobro de crédito y cobro de servicio cuentan como «rc». */
function esMovimientoRc(m) {
  const tipo = String(m?.tipo_movimiento || '');
  return tipo === 'Venta Ruta' || tipo === 'Cobro Servicio' || esCobroCreditoMovimiento(m);
}

/**
 * Carátula RC Servicios: una fila por recolector.
 * Saldo = ventas del camión (efectivo + crédito nuevo) + créditos recuperados
 * + servicios + clientes externos.
 * El crédito nuevo es el cargo pendiente de CxC; no es efectivo en tránsito.
 */
export function armarCaratulaRcServicios(repartidores = [], movimientos = [], creditos = []) {
  const filas = new Map();
  for (const r of repartidores || []) {
    const id = String(r?.id || '').trim();
    if (!id) continue;
    filas.set(id, vacio(id, r.nombre || id));
  }

  const asegurar = (id, nombre) => {
    const clave = String(id || '').trim();
    if (!clave) return null;
    if (!filas.has(clave)) filas.set(clave, vacio(clave, nombre || clave));
    return filas.get(clave);
  };

  for (const m of movimientos || []) {
    const tipo = String(m?.tipo_movimiento || '');
    if (!tipo || tipo === 'Gasto') continue;
    if (String(m?.estatus || 'En Tránsito') !== 'En Tránsito') continue;
    const fila = asegurar(m.repartidor_id, m.repartidores?.nombre || m.repartidor_nombre);
    if (!fila) continue;
    const monto = r2(m.monto);
    fila.transito += 1;
    if (esMovimientoRc(m)) fila.rc += 1;

    if (esCobroCreditoMovimiento(m)) {
      fila.recuperados.count += 1;
      fila.recuperados.total = r2(fila.recuperados.total + monto);
      continue;
    }
    if (tipo === 'Cobro Servicio') {
      fila.servicios.count += 1;
      fila.servicios.total = r2(fila.servicios.total + monto);
      continue;
    }
    if (tipo !== 'Venta Ruta' && tipo !== 'Recolección') continue;
    if (esTiendaPropia(m.sucursal_origen)) {
      fila.ventas.efectivoCount += 1;
      fila.ventas.efectivo = r2(fila.ventas.efectivo + monto);
    } else {
      fila.externos.count += 1;
      fila.externos.total = r2(fila.externos.total + monto);
    }
  }

  for (const c of creditos || []) {
    if (!esCargoPendiente(c)) continue;
    const nombre = c.usuario_nombre || c.cajero_nombre || c.vendedor_nombre || '';
    let fila = null;
    for (const f of filas.values()) {
      if (mismoRecolector(f.nombre, nombre)) {
        fila = f;
        break;
      }
    }
    if (!fila) {
      const id = `credito:${normNombre(nombre) || c.id || 'sin-nombre'}`;
      fila = asegurar(id, nombre || 'Sin recolector');
    }
    if (!fila) continue;
    fila.ventas.creditoCount += 1;
    fila.ventas.creditoNuevo = r2(fila.ventas.creditoNuevo + (Number(c.monto) || 0));
  }

  const lista = [...filas.values()].map((f) => {
    f.ventas.count = f.ventas.efectivoCount + f.ventas.creditoCount;
    f.ventas.total = r2(f.ventas.efectivo + f.ventas.creditoNuevo);
    f.saldo = r2(f.ventas.total + f.recuperados.total + f.servicios.total + f.externos.total);
    return f;
  });

  lista.sort((a, b) => b.saldo - a.saldo || String(a.nombre).localeCompare(String(b.nombre), 'es'));
  return lista;
}
