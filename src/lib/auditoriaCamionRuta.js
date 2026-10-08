/**
 * Inv-op / Auditorías de mercancía en camión (Venta en Ruta).
 * Compara teórico (disponible en carga) vs contado físico y valoriza
 * faltantes a costo y a precio de venta al público.
 */

import { precioCompraCatalogo, precioRutaEspecial } from './ventaEnRuta.js';
import { costoUnitarioInventario } from './valorInventario.js';

const LS_AUDITORIAS = 'pos3b_ruta_auditorias';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Precio de venta al cliente / público (ticket tienda). */
export function precioVentaPublico(producto) {
  const p = Number(producto?.precio);
  if (Number.isFinite(p) && p > 0) return round2(p);
  const ruta = precioRutaEspecial(producto);
  if (ruta != null && ruta > 0) return ruta;
  return 0;
}

/** Costo unitario para pérdida (compra catálogo, con respaldo del valuador de inventario). */
export function costoUnitarioAuditoria(producto) {
  const c = precioCompraCatalogo(producto);
  if (c != null && c > 0) return c;
  const v = costoUnitarioInventario(producto);
  if (Number.isFinite(v) && v > 0) return round2(v);
  return 0;
}

/**
 * Arma líneas de auditoría a partir del inventario consolidado del camión + conteos.
 * @param {Array} inventarioCamion — filas de inventarioCamionDesdeLineas
 * @param {Record<string, string|number>} conteos — id → cantidad contada
 */
export function construirLineasAuditoriaCamion(inventarioCamion, conteos = {}) {
  return (inventarioCamion || []).map((p) => {
    const id = String(p.id);
    const teorico = Math.max(0, Math.floor(Number(p._disp_camion) || 0));
    const raw = conteos[id];
    const contado =
      raw === null || raw === undefined || String(raw).trim() === ''
        ? null
        : Math.max(0, Math.floor(Number(raw)));
    const diferencia = contado == null ? null : contado - teorico;
    const faltante = diferencia != null && diferencia < 0 ? -diferencia : 0;
    const sobrante = diferencia != null && diferencia > 0 ? diferencia : 0;
    const costoU = costoUnitarioAuditoria(p);
    const precioPub = precioVentaPublico(p);
    const precioRuta = precioRutaEspecial(p) || 0;
    return {
      id,
      nombre: p.nombre || id,
      teorico,
      contado,
      diferencia,
      faltante,
      sobrante,
      costoUnit: costoU,
      precioPublico: precioPub,
      precioRuta,
      perdidaCosto: round2(faltante * costoU),
      perdidaPublico: round2(faltante * precioPub),
      perdidaRuta: round2(faltante * (Number(precioRuta) || 0)),
      valorTeoricoCosto: round2(teorico * costoU),
      valorTeoricoPublico: round2(teorico * precioPub),
    };
  });
}

/** Totales de una auditoría (solo líneas con conteo). */
export function resumirAuditoriaCamion(lineas) {
  const todas = lineas || [];
  const contadas = todas.filter((l) => l.contado != null);
  let piezasFaltantes = 0;
  let piezasSobrantes = 0;
  let perdidaCosto = 0;
  let perdidaPublico = 0;
  let perdidaRuta = 0;
  let valorTeoricoCosto = 0;
  let valorTeoricoPublico = 0;
  for (const l of todas) {
    valorTeoricoCosto = round2(valorTeoricoCosto + (Number(l.valorTeoricoCosto) || 0));
    valorTeoricoPublico = round2(valorTeoricoPublico + (Number(l.valorTeoricoPublico) || 0));
  }
  for (const l of contadas) {
    piezasFaltantes += Number(l.faltante) || 0;
    piezasSobrantes += Number(l.sobrante) || 0;
    perdidaCosto = round2(perdidaCosto + (Number(l.perdidaCosto) || 0));
    perdidaPublico = round2(perdidaPublico + (Number(l.perdidaPublico) || 0));
    perdidaRuta = round2(perdidaRuta + (Number(l.perdidaRuta) || 0));
  }
  return {
    productos: todas.length,
    contados: contadas.length,
    piezasFaltantes,
    piezasSobrantes,
    perdidaCosto,
    perdidaPublico,
    perdidaRuta,
    /** Diferencia de oportunidad: lo que se deja de vender al público vs costo. */
    margenPerdidoPublico: round2(Math.max(0, perdidaPublico - perdidaCosto)),
    valorTeoricoCosto,
    valorTeoricoPublico,
  };
}

function leerHistorialLocal() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_AUDITORIAS) || '[]');
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function guardarHistorialLocal(lista) {
  try {
    localStorage.setItem(LS_AUDITORIAS, JSON.stringify((lista || []).slice(0, 80)));
  } catch {
    /* ignore */
  }
}

/** Guarda un cierre de auditoría (local; no modifica stock). */
export function guardarAuditoriaCamionLocal(payload) {
  const row = {
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
    ...payload,
  };
  const list = leerHistorialLocal();
  list.unshift(row);
  guardarHistorialLocal(list);
  return { ok: true, data: row };
}

export function listarAuditoriasCamionLocal({ camionId, limit = 30 } = {}) {
  let list = leerHistorialLocal();
  if (camionId) {
    list = list.filter((a) => String(a.camion_id || '') === String(camionId));
  }
  return { data: list.slice(0, limit) };
}
