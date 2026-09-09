/**
 * Revisión ticket-por-ticket: compra vs mercancía ingresada.
 * Reutiliza consolidación; guarda “revisado” en localStorage (por equipo).
 */
import {
  COLOR_ESTADO,
  ESTADOS,
  ETIQUETA_ESTADO,
  cargarConsolidacionComprasInventario,
  compararProductosTicketVsInventario,
  fmtMonto,
  tiendasFiltroConsolidacionCompras,
} from './consolidacionComprasInventario.js';

export { fmtMonto, tiendasFiltroConsolidacionCompras, ESTADOS, ETIQUETA_ESTADO, COLOR_ESTADO };

const LS_REVISION = 'pos3b_revision_compras_v1';

export const ESTADOS_LINEA = {
  OK: 'ok',
  FALTANTE: 'faltante',
  PARCIAL: 'parcial',
  EXTRA: 'extra',
};

export const ETIQUETA_LINEA = {
  ok: 'OK',
  faltante: 'Falta en inventario',
  parcial: 'Cantidad menor',
  extra: 'De más en inventario',
};

export const COLOR_LINEA = {
  ok: '#15803d',
  faltante: '#b91c1c',
  parcial: '#c2410c',
  extra: '#a16207',
};

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function leerMapaRevision() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_REVISION) || '{}');
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

function guardarMapaRevision(mapa) {
  localStorage.setItem(LS_REVISION, JSON.stringify(mapa || {}));
}

export function claveRevisionTicket(fila) {
  if (fila?.compra_id) return `compra:${fila.compra_id}`;
  const folio = String(fila?.folio || '').trim().toUpperCase();
  const suc = String(fila?.sucursal_id || '').trim().toUpperCase();
  const ymd = String(fila?.fecha_ymd || '').slice(0, 10);
  return `folio:${folio}|${suc}|${ymd}`;
}

export function leerRevisionTicket(clave) {
  if (!clave) return null;
  const mapa = leerMapaRevision();
  return mapa[clave] || null;
}

export function marcarRevisionTicket(clave, patch = {}) {
  if (!clave) return { ok: false, error: 'Clave inválida.' };
  const mapa = leerMapaRevision();
  const prev = mapa[clave] || {};
  mapa[clave] = {
    ...prev,
    ...patch,
    clave,
    revisado: patch.revisado !== false,
    revisado_at: patch.revisado_at || new Date().toISOString(),
  };
  guardarMapaRevision(mapa);
  return { ok: true, data: mapa[clave] };
}

export function quitarRevisionTicket(clave) {
  if (!clave) return { ok: false };
  const mapa = leerMapaRevision();
  delete mapa[clave];
  guardarMapaRevision(mapa);
  return { ok: true };
}

/**
 * Une ticket + inventario en filas de producto para revisión visual.
 */
export function lineasComparacionRevision(fila) {
  const cmp = compararProductosTicketVsInventario(fila?.lineas_ticket || [], fila?.lineas_inventario || []);
  const claves = new Set([...cmp.ticketMap.keys(), ...cmp.invMap.keys()]);
  const lineas = [];
  for (const k of claves) {
    const t = cmp.ticketMap.get(k);
    const inv = cmp.invMap.get(k);
    const qtyTicket = round2(t?.qty_ticket || 0);
    const qtyInv = round2(inv?.qty_inventario || 0);
    let estado = ESTADOS_LINEA.OK;
    if (qtyTicket > 0 && qtyInv + 0.001 < qtyTicket) {
      estado = qtyInv > 0.001 ? ESTADOS_LINEA.PARCIAL : ESTADOS_LINEA.FALTANTE;
    } else if (qtyTicket <= 0.001 && qtyInv > 0.001) {
      estado = ESTADOS_LINEA.EXTRA;
    }
    lineas.push({
      clave: k,
      id: t?.id || inv?.id || null,
      nombre: t?.nombre || inv?.nombre || '—',
      qty_ticket: qtyTicket,
      qty_inventario: qtyInv,
      qty_diff: round2(qtyInv - qtyTicket),
      costo: t?.costo || inv?.costo || 0,
      estado,
      estado_label: ETIQUETA_LINEA[estado] || estado,
    });
  }
  lineas.sort((a, b) => {
    const ord = { faltante: 0, parcial: 1, extra: 2, ok: 3 };
    const d = (ord[a.estado] ?? 9) - (ord[b.estado] ?? 9);
    if (d) return d;
    return String(a.nombre).localeCompare(String(b.nombre), 'es');
  });
  return lineas;
}

export function resumenLineasRevision(lineas) {
  const list = lineas || [];
  return {
    total: list.length,
    ok: list.filter((l) => l.estado === ESTADOS_LINEA.OK).length,
    faltantes: list.filter((l) => l.estado === ESTADOS_LINEA.FALTANTE).length,
    parciales: list.filter((l) => l.estado === ESTADOS_LINEA.PARCIAL).length,
    extras: list.filter((l) => l.estado === ESTADOS_LINEA.EXTRA).length,
    con_diferencia: list.filter((l) => l.estado !== ESTADOS_LINEA.OK).length,
  };
}

/**
 * Solo tickets de compra (con o sin líneas) para revisión operativa.
 * Excluye gastos huérfanos y filas solo-traspaso sin compra.
 */
export function filtrarTicketsRevision(filas = []) {
  return (filas || []).filter((f) => {
    if (f?.origen === 'gasto_huerfano' || f?.tipo === 'gasto') return false;
    if (f?.tipo === 'compra' || f?.compra_id) return true;
    // Ingreso ligado a folio de compra con líneas de ticket
    return (f?.lineas_ticket || []).length > 0;
  });
}

export function enriquecerFilaRevision(fila, mapaRevision = null) {
  const mapa = mapaRevision || leerMapaRevision();
  const clave = claveRevisionTicket(fila);
  const rev = mapa[clave] || null;
  const lineas = lineasComparacionRevision(fila);
  const resumenLin = resumenLineasRevision(lineas);
  const autoOk =
    resumenLin.con_diferencia === 0
    && (fila?.lineas_inventario || []).length > 0
    && (fila?.lineas_ticket || []).length > 0;
  return {
    ...fila,
    revision_clave: clave,
    revision: rev,
    revisado: Boolean(rev?.revisado),
    revision_resultado: rev?.resultado || null,
    lineas_revision: lineas,
    resumen_lineas: resumenLin,
    auto_ok: autoOk,
  };
}

export async function cargarRevisionCompras(supabase, { desde, hasta, sucursal } = {}) {
  const res = await cargarConsolidacionComprasInventario(supabase, { desde, hasta, sucursal });
  if (res.error && !(res.filas || []).length) {
    return { ...res, tickets: [], mapaRevision: leerMapaRevision() };
  }
  const mapa = leerMapaRevision();
  const tickets = filtrarTicketsRevision(res.filas || [])
    .map((f) => enriquecerFilaRevision(f, mapa))
    .sort((a, b) => {
      // Pendientes primero, luego fecha desc
      if (Boolean(a.revisado) !== Boolean(b.revisado)) return a.revisado ? 1 : -1;
      return String(b.fecha_ymd || '').localeCompare(String(a.fecha_ymd || ''));
    });

  const pendientes = tickets.filter((t) => !t.revisado).length;
  const conDiff = tickets.filter((t) => (t.resumen_lineas?.con_diferencia || 0) > 0).length;
  const okAuto = tickets.filter((t) => t.auto_ok).length;

  return {
    ...res,
    tickets,
    mapaRevision: mapa,
    resumenRevision: {
      total: tickets.length,
      pendientes,
      revisados: tickets.length - pendientes,
      con_diferencias: conDiff,
      ok_auto: okAuto,
    },
  };
}

export function marcarTicketRevisado(fila, { resultado, notas, usuario } = {}) {
  const clave = fila?.revision_clave || claveRevisionTicket(fila);
  const lineas = fila?.lineas_revision || lineasComparacionRevision(fila);
  const resumen = resumenLineasRevision(lineas);
  const resAuto = resumen.con_diferencia > 0 ? 'diferencias' : 'ok';
  return marcarRevisionTicket(clave, {
    revisado: true,
    resultado: resultado || resAuto,
    notas: notas || '',
    usuario: usuario || '',
    folio: fila?.folio || '',
    compra_id: fila?.compra_id || null,
    n_faltantes: resumen.faltantes,
    n_parciales: resumen.parciales,
    n_extras: resumen.extras,
  });
}
