import {
  etiquetaTienda,
  nombreUbicacionSucursal,
  normalizarCodigoTienda,
} from '../constants/sucursales.js';

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Cargo de CxC que todavía se puede cobrar. El monto ya es el saldo (remanente). */
export function esFolioCreditoPendiente(m) {
  if (!m || m.tipo !== 'cargo') return false;
  if (m.pagado_at) return false;
  const est = String(m.estatus || 'pendiente').toLowerCase();
  return est === 'pendiente' || est === '' || est === 'null';
}

export function claveTiendaCredito(m) {
  const esSuc = String(m?.cliente_tipo || 'sucursal') === 'sucursal';
  if (!esSuc) {
    const id = `ext:${m?.cliente_id || m?.cliente_nombre || '—'}`;
    return { id, codigo: '', nombre: m?.cliente_nombre || 'Cliente externo', esSuc: false };
  }
  const codigo = normalizarCodigoTienda(m?.cliente_id)
    || String(m?.cliente_id || m?.cliente_nombre || '—').toUpperCase();
  const colonia = nombreUbicacionSucursal(codigo);
  const nombre = colonia
    || (codigo === 'FUSION' ? 'Fusión' : '')
    || (m?.cliente_nombre && String(m.cliente_nombre).toUpperCase() !== codigo ? m.cliente_nombre : '')
    || etiquetaTienda(codigo)
    || codigo;
  return { id: codigo, codigo, nombre, esSuc: true };
}

/**
 * Carátula RC / Créditos por cobrar.
 * Crédito actualizado = suma de cargos pendientes (el monto del cargo ya es el remanente).
 * Abono = abonos ligados a esos cargos. Crédito por pagar = actualizado + abono.
 * El historial lista todos los abonos de la tienda, también los de créditos ya cerrados.
 */
export function armarTableroCreditos(cargos = [], abonos = []) {
  const abonoPorCargo = new Map();
  const historialPorTienda = new Map();

  for (const a of abonos || []) {
    if (String(a?.tipo) !== 'abono') continue;
    const monto = r2(a.monto);
    if (!(monto > 0)) continue;
    const cid = String(a.cargo_id || '');
    if (cid) abonoPorCargo.set(cid, r2((abonoPorCargo.get(cid) || 0) + monto));
    const tienda = claveTiendaCredito(a);
    if (!historialPorTienda.has(tienda.id)) historialPorTienda.set(tienda.id, []);
    historialPorTienda.get(tienda.id).push({
      id: a.id,
      folio: a.folio_venta || a.venta_id || a.cargo_id || a.id,
      fecha: a.pagado_at || a.created_at,
      monto,
      notas: a.notas || '',
      usuario: a.usuario_nombre || a.cajero_nombre || '',
    });
  }

  const map = new Map();
  for (const c of cargos || []) {
    if (!esFolioCreditoPendiente(c)) continue;
    const tienda = claveTiendaCredito(c);
    if (!map.has(tienda.id)) {
      map.set(tienda.id, {
        id: tienda.id,
        codigo: tienda.codigo,
        nombre: tienda.nombre,
        folios: [],
        credito: 0,
        abono: 0,
        actualizado: 0,
      });
    }
    const g = map.get(tienda.id);
    const saldo = r2(c.monto);
    const abono = r2(abonoPorCargo.get(String(c.id)) || 0);
    g.folios.push({
      id: c.id,
      folio: c.folio_venta || c.venta_id || String(c.id),
      fecha: c.created_at,
      importe: saldo,
      original: r2(saldo + abono),
      abono,
      estado: 'Pendiente',
      notas: c.notas || '',
    });
    g.credito = r2(g.credito + saldo + abono);
    g.abono = r2(g.abono + abono);
    g.actualizado = r2(g.actualizado + saldo);
  }

  const tiendas = [...map.values()]
    .map((g) => ({
      ...g,
      folios: [...g.folios].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))),
      historial: (historialPorTienda.get(g.id) || [])
        .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))),
    }))
    .sort((a, b) => b.actualizado - a.actualizado
      || String(a.codigo || a.nombre).localeCompare(String(b.codigo || b.nombre), 'es'));

  const totales = tiendas.reduce((s, t) => ({
    folios: s.folios + t.folios.length,
    credito: r2(s.credito + t.credito),
    abono: r2(s.abono + t.abono),
    actualizado: r2(s.actualizado + t.actualizado),
  }), { folios: 0, credito: 0, abono: 0, actualizado: 0 });

  return { tiendas, totales };
}
