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

/** Venta, crédito del camión, cobro de crédito y cobro de servicio cuentan como «rc». */
function esMovimientoRc(m) {
  const tipo = String(m?.tipo_movimiento || '');
  return tipo === 'Venta Ruta' || tipo === 'Entrega Crédito' || tipo === 'Cobro Servicio' || esCobroCreditoMovimiento(m);
}

/**
 * Carátula RC Servicios: una fila por recolector activo del Panel RT.
 * Saldo = ventas del camión (efectivo + crédito nuevo) + créditos recuperados
 * + servicios + clientes externos.
 * El crédito nuevo es «Entrega Crédito» que sigue en tránsito en ese camión.
 * No usa el historial de CxC: ahí están cajas, auditoras y gente que ya no trabaja.
 */
export function armarCaratulaRcServicios(repartidores = [], movimientos = []) {
  const filas = new Map();
  for (const r of repartidores || []) {
    const id = String(r?.id || '').trim();
    if (!id || r.activo === false) continue;
    filas.set(id, vacio(id, r.nombre || id));
  }

  for (const m of movimientos || []) {
    const tipo = String(m?.tipo_movimiento || '');
    if (!tipo || tipo === 'Gasto') continue;
    if (String(m?.estatus || 'En Tránsito') !== 'En Tránsito') continue;
    const fila = filas.get(String(m?.repartidor_id || '').trim());
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
    if (tipo === 'Entrega Crédito') {
      fila.ventas.creditoCount += 1;
      fila.ventas.creditoNuevo = r2(fila.ventas.creditoNuevo + monto);
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

  const lista = [...filas.values()].map((f) => {
    f.ventas.count = f.ventas.efectivoCount + f.ventas.creditoCount;
    f.ventas.total = r2(f.ventas.efectivo + f.ventas.creditoNuevo);
    f.saldo = r2(f.ventas.total + f.recuperados.total + f.servicios.total + f.externos.total);
    return f;
  });

  lista.sort((a, b) => b.saldo - a.saldo || String(a.nombre).localeCompare(String(b.nombre), 'es'));
  return lista;
}
