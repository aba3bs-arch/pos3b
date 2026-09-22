/**
 * Al aceptar/recibir una compra (herramienta Compras / venta en ruta),
 * carga el gasto PROVEEDORES al corte de Abarrotes de esa tienda.
 */
import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { agregarGastoTurno } from './corteContabilidad/store.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Pedidos nacidos del POS Venta en Ruta (notas «Venta en ruta …»). */
export function esCompraVentaEnRuta(compra) {
  return /venta\s+en\s+ruta/i.test(String(compra?.notas || ''));
}

/**
 * Arma el payload de gasto para el corte Abarrotes.
 * Incluye el folio CMP en comentario (y folios_inventario) para consolidación / Smoking.
 */
export function payloadGastoDesdeCompra({
  compra,
  folioCompra,
  totalTicket,
  proveedorNombre,
  usuarioNombre,
} = {}) {
  const esRuta = esCompraVentaEnRuta(compra);
  const prov = String(
    proveedorNombre
    || compra?.proveedores?.nombre
    || '',
  ).trim();
  const subcategoria = (prov || (esRuta ? 'VENTA EN RUTA' : 'MERCANCIA')).toUpperCase();
  const folio = String(folioCompra || '').trim();
  const partes = [
    esRuta ? 'COMPRA VENTA EN RUTA' : 'COMPRA RECIBIDA',
    folio || null,
    prov || null,
  ].filter(Boolean);
  const comentario = partes.join(' · ');
  return {
    categoria: 'PROVEEDORES',
    subcategoria,
    comentario,
    monto: round2(totalTicket),
    usuario_nombre: usuarioNombre || null,
    folios_inventario: folio || undefined,
  };
}

/**
 * Inserta el gasto de la compra en cortes_contabilidad_gastos (módulo abarrotes, turno abierto).
 * Idempotente por folio CMP en comentario.
 */
export async function cargarGastoCompraACorteAbarrotes(supabase, {
  compra,
  sucursal,
  folioCompra,
  totalTicket,
  proveedorNombre,
  usuarioNombre,
  rolActor,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const sid = normalizarCodigoTienda(sucursal || compra?.sucursal_id) || 'MAIN';
  const folio = String(folioCompra || '').trim();
  const monto = round2(totalTicket);
  if (!(monto > 0)) return { ok: false, error: 'Monto del ticket inválido para el gasto.' };
  if (!folio) return { ok: false, error: 'Falta folio de inventario de la compra.' };

  // Evitar duplicar si ya se cargó este folio al corte.
  const { data: prev, error: errPrev } = await supabase
    .from('cortes_contabilidad_gastos')
    .select('id, comentario, monto, cerrado')
    .eq('sucursal_id', sid)
    .eq('modulo', 'abarrotes')
    .ilike('comentario', `%${folio}%`)
    .limit(5);
  if (errPrev && errPrev.code !== '42P01') {
    return { ok: false, error: errPrev.message };
  }
  const ya = (prev || []).find((g) => {
    const com = String(g.comentario || '');
    return com.toUpperCase().includes(String(folio).toUpperCase());
  });
  if (ya) {
    return { ok: true, yaExistia: true, data: ya, sucursalId: sid };
  }

  const gasto = payloadGastoDesdeCompra({
    compra,
    folioCompra: folio,
    totalTicket: monto,
    proveedorNombre,
    usuarioNombre,
  });

  const res = await agregarGastoTurno(supabase, sid, 'abarrotes', gasto, {
    nombreActor: usuarioNombre || null,
    rolActor: rolActor || null,
  });
  if (!res.ok) {
    // Si el anti-duplicado del corte lo bloqueó, tratar como ya cargado.
    if (res.duplicado) {
      return {
        ok: true,
        yaExistia: true,
        data: res.duplicados?.[0] || null,
        sucursalId: sid,
        aviso: res.error || null,
      };
    }
    return { ok: false, error: res.error || 'No se pudo cargar el gasto al corte de abarrotes.' };
  }
  return {
    ok: true,
    data: Array.isArray(res.data) ? res.data[res.data.length - 1] : res.data,
    sucursalId: sid,
    modulo: 'abarrotes',
  };
}
