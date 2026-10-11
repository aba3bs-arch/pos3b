/**
 * Inv-op / Auditorías de mercancía en camión (Venta en Ruta).
 * Compara teórico (disponible en carga) vs contado físico y valoriza
 * faltantes a costo y a precio de venta al público.
 * Flujo operativo: recolector → departamentos → conteo móvil.
 */

import { precioCompraCatalogo, precioRutaEspecial } from './ventaEnRuta.js';
import { costoUnitarioInventario } from './valorInventario.js';
import { etiquetaDepartamento, normalizarDepartamento } from './departamentos.js';

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
      cat: normalizarDepartamento(p.cat || 'GENERAL') || 'GENERAL',
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

/** Lista de departamentos presentes en el inventario del camión (con productos). */
export function departamentosAuditoriaCamion(inventarioCamion = []) {
  const seen = new Set();
  const out = [];
  for (const p of inventarioCamion || []) {
    const d = normalizarDepartamento(p?.cat || 'GENERAL') || 'GENERAL';
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out.sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Progreso de conteo agrupado por departamento.
 * @param {Array} lineas — salida de construirLineasAuditoriaCamion
 */
export function progresoDepartamentosAuditoria(lineas = []) {
  const map = new Map();
  for (const l of lineas || []) {
    const cat = normalizarDepartamento(l.cat || 'GENERAL') || 'GENERAL';
    if (!map.has(cat)) {
      map.set(cat, {
        departamento: cat,
        etiqueta: etiquetaDepartamento(cat),
        productos: 0,
        contados: 0,
        piezasTeoricas: 0,
        piezasFaltantes: 0,
        perdidaCosto: 0,
        perdidaPublico: 0,
      });
    }
    const row = map.get(cat);
    row.productos += 1;
    row.piezasTeoricas += Number(l.teorico) || 0;
    if (l.contado != null) {
      row.contados += 1;
      row.piezasFaltantes += Number(l.faltante) || 0;
      row.perdidaCosto = round2(row.perdidaCosto + (Number(l.perdidaCosto) || 0));
      row.perdidaPublico = round2(row.perdidaPublico + (Number(l.perdidaPublico) || 0));
    }
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      pct: r.productos ? Math.round((r.contados / r.productos) * 100) : 0,
      completo: r.productos > 0 && r.contados >= r.productos,
    }))
    .sort((a, b) => a.departamento.localeCompare(b.departamento, 'es'));
}

/** Filtra líneas de un departamento. */
export function lineasAuditoriaPorDepartamento(lineas = [], departamento) {
  const dept = normalizarDepartamento(departamento || 'GENERAL') || 'GENERAL';
  return (lineas || []).filter(
    (l) => (normalizarDepartamento(l.cat || 'GENERAL') || 'GENERAL') === dept,
  );
}

/**
 * Resuelve camión activo del recolector (Panel RT o usuario POS enlazado).
 * @param {Array} camiones
 * @param {{ repartidor_id?: string, usuario_id?: string, id?: string }} recolector
 */
export function resolverCamionDeRecolector(camiones = [], recolector) {
  if (!recolector) return null;
  const rid = String(recolector.repartidor_id || recolector.id || '').trim();
  const uid = String(recolector.usuario_id || '').trim();
  const activos = (camiones || []).filter((c) => c && c.activo !== false);
  if (rid) {
    const byRt = activos.find((c) => String(c.repartidor_id || '') === rid);
    if (byRt) return byRt;
  }
  if (uid) {
    const byUsu = activos.find((c) => String(c.usuario_id || '') === uid);
    if (byUsu) return byUsu;
  }
  return null;
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
