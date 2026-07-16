import { abrirVentanaImpresion } from './impresion.js';
import { leerNombreNegocio, leerLogoUrl } from './branding.js';
import { ETIQUETA_AREA } from './contabilidadConstants.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import { etiquetaTipoCierre } from './corteContabilidad/permisos.js';
import { gastoDescuentaNomina } from './corteContabilidad/catalogoGastos.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function resumenGastosPorCategoria(gastos = [], modulo = '') {
  const grupos = {};
  for (const g of gastos || []) {
    const cat = String(g.categoria || 'SIN CATEGORÍA').trim().toUpperCase();
    if (!grupos[cat]) grupos[cat] = { total: 0, items: [] };
    const m = Number(g.monto) || 0;
    grupos[cat].total += m;
    grupos[cat].items.push(g);
  }
  return Object.entries(grupos)
    .map(([categoria, data]) => ({
      categoria,
      total: round2(data.total),
      items: data.items,
      descuentaNomina: gastoDescuentaNomina(modulo, categoria),
    }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es'));
}

export function datosImpresionCorteActual({ modulo, sucursal, folio, turno, user, estado, gastos, calc, tipo_cierre = 'borrador' }) {
  return {
    modulo,
    sucursal,
    folio,
    turno,
    usuario_nombre: user?.nombre || null,
    tipo_cierre,
    fecha: new Date().toISOString(),
    venta: calc?.venta ?? 0,
    subtotal: calc?.subtotal ?? 0,
    venta_neta: calc?.ventaNeta ?? calc?.subtotal ?? 0,
    total_lectura: calc?.totalLectura ?? 0,
    caja_actual: calc?.cajaActual ?? 0,
    gastos_total: calc?.gastosTotal ?? 0,
    gastos: gastos || [],
    estado: estado || {},
    comentarios: estado?.comentarios || '',
    es_borrador: tipo_cierre === 'borrador',
  };
}

export function datosImpresionDesdeHistorial(h, modulo) {
  const d = h?.detalle || {};
  return {
    modulo,
    sucursal: h.sucursal_id,
    folio: h.folio,
    turno: h.turno,
    usuario_nombre: h.usuario_nombre,
    tipo_cierre: d.tipo_cierre || 'cierre',
    fecha: h.created_at,
    venta: h.ventas,
    subtotal: d.subtotal,
    caja_actual: h.caja_actual,
    gastos_total: d.gastos_total,
    gastos: d.gastos || [],
    estado: d,
    comentarios: d.comentarios || '',
    es_borrador: false,
  };
}

function filasResumenModulo(data) {
  const e = data.estado || {};
  const mod = data.modulo;
  const filas = [];

  if (mod === 'virtual') {
    filas.push(['Fondo fijo', fmt(e.fondo)]);
    filas.push(['Caja chica anterior', fmt(e.caja_anterior)]);
    filas.push(['Moneda inicial ref. (morado)', fmt(e.moneda_inicial)]);
    filas.push(['Moneda inicial del corte', fmt(e.moneda_inicial_turno ?? e.moneda_inicial)]);
    filas.push(['Moneda final', fmt(e.moneda_final)]);
    if (e.recoleccion || e.recoleccion_turno) filas.push(['Recolección', fmt(e.recoleccion ?? e.recoleccion_turno)]);
    if (e.precoleccion != null && e.tipo_cierre === 'recoleccion') filas.push(['Precolección', fmt(e.precoleccion)]);
    if (e.moneda_tope != null) filas.push(['Moneda tope', fmt(e.moneda_tope)]);
    if (e.moneda_inyectar != null) filas.push(['Inyectar a sucursal', fmt(e.moneda_inyectar)]);
  } else if (mod === 'abarrotes') {
    filas.push(['Venta total', fmt(e.venta)]);
    filas.push(['Tarjeta', fmt(e.tarjeta)]);
    filas.push(['Faltante', fmt(e.faltante)]);
    filas.push(['Recolección', fmt(e.recoleccion)]);
  } else if (mod === 'garage') {
    filas.push(['Lectura total', fmt(data.total_lectura)]);
    filas.push(['Lectura anterior', fmt(e.caja_anterior)]);
    filas.push(['Venta turno', fmt(data.venta)]);
    filas.push(['Recolección', fmt(e.recoleccion)]);
  }

  filas.push(['Gastos turno', fmt(data.gastos_total)]);
  filas.push(['Subtotal', fmt(data.subtotal)]);
  filas.push(['Caja actual', fmt(data.caja_actual)]);
  filas.push(['Venta registrada', fmt(data.venta)]);

  return filas
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r"><strong>${v}</strong></td></tr>`)
    .join('');
}

function htmlGastosPorCategoria(data) {
  const grupos = resumenGastosPorCategoria(data.gastos, data.modulo);
  if (!grupos.length) return '<p class="muted">Sin gastos registrados.</p>';

  return grupos
    .map((g) => {
      const items = g.items
        .map((it) => {
          const nom = it.usuario_nombre && g.descuentaNomina ? ` · ${esc(it.usuario_nombre)}` : '';
          const sub = it.subcategoria ? ` / ${esc(it.subcategoria)}` : '';
          const com = it.comentario ? ` — ${esc(it.comentario)}` : '';
          return `<tr>
            <td class="muted" style="padding-left:8px">${esc(it.subcategoria || '—')}${com}${nom}</td>
            <td class="r">${fmt(it.monto)}</td>
          </tr>`;
        })
        .join('');
      const badge = g.descuentaNomina ? ' <span class="tag">nómina</span>' : '';
      return `
        <div class="cat-block">
          <div class="cat-head"><strong>${esc(g.categoria)}</strong>${badge} <span class="r" style="float:right">${fmt(g.total)}</span></div>
          <table>${items}</table>
        </div>`;
    })
    .join('');
}

export function htmlCorteContabilidad(data) {
  const logo = leerLogoUrl();
  const negocio = leerNombreNegocio();
  const modLabel = ETIQUETA_AREA[data.modulo] || data.modulo;
  const fecha = data.fecha ? new Date(data.fecha).toLocaleString('es-MX') : new Date().toLocaleString('es-MX');
  const tipo = data.es_borrador ? 'BORRADOR (turno abierto)' : etiquetaTipoCierre({ tipo_cierre: data.tipo_cierre });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Corte ${esc(modLabel)}</title><style>
    body{font-family:Arial,sans-serif;font-size:12px;margin:12px;max-width:420px;color:#111}
    img.logo{max-width:70%;max-height:64px;display:block;margin:0 auto 8px}
    h1{font-size:16px;margin:0 0 4px;text-align:center}
    .sub{text-align:center;color:#555;font-size:11px;margin-bottom:10px}
    table{width:100%;border-collapse:collapse}
    td{padding:3px 2px;vertical-align:top}
    td.r{text-align:right;white-space:nowrap}
    .sep{border-top:1px dashed #333;margin:10px 0}
    .cat-block{margin:8px 0;padding:6px 0;border-top:1px solid #ddd}
    .cat-head{margin-bottom:4px;font-size:12px}
    .tag{font-size:9px;background:#e8f4fc;color:#1a5276;padding:1px 4px;border-radius:3px}
    .muted{color:#666;font-size:10px}
    .borrador{background:#fff3cd;border:1px solid #f0ad4e;padding:6px;border-radius:4px;text-align:center;font-weight:700;margin-bottom:8px}
    @media print{body{margin:0;padding:8px}}
  </style></head><body>
    <img class="logo" src="${esc(logo)}" alt=""/>
    <h1>${esc(negocio)}</h1>
    <div class="sub">CORTE ${esc(modLabel).toUpperCase()}</div>
    ${data.es_borrador ? '<div class="borrador">Vista previa — turno no cerrado</div>' : ''}
    <table>
      <tr><td>Tienda</td><td class="r"><strong>${esc(etiquetaTienda(data.sucursal))}</strong></td></tr>
      <tr><td>Folio</td><td class="r"><strong>${esc(data.folio || '—')}</strong></td></tr>
      <tr><td>Turno</td><td class="r">${esc(data.turno || '—')}</td></tr>
      <tr><td>Tipo</td><td class="r">${esc(tipo)}</td></tr>
      <tr><td>Fecha</td><td class="r">${esc(fecha)}</td></tr>
      <tr><td>Cajero</td><td class="r">${esc(data.usuario_nombre || '—')}</td></tr>
    </table>
    <div class="sep"></div>
    <strong>Resumen</strong>
    <table>${filasResumenModulo(data)}</table>
    <div class="sep"></div>
    <strong>Desglose de gastos por categoría</strong>
    ${htmlGastosPorCategoria(data)}
    <table style="margin-top:8px">
      <tr><td><strong>Total gastos</strong></td><td class="r"><strong>${fmt(data.gastos_total)}</strong></td></tr>
    </table>
    ${data.comentarios ? `<div class="sep"></div><p class="muted"><strong>Comentarios:</strong> ${esc(data.comentarios)}</p>` : ''}
    <div class="sep"></div>
    <p class="muted" style="text-align:center">Solo CONSUMO con empleado asignado descuenta nómina.</p>
  </body></html>`;
}

export function imprimirCorteContabilidad(data) {
  const mod = ETIQUETA_AREA[data.modulo] || data.modulo || 'Corte';
  return abrirVentanaImpresion(htmlCorteContabilidad(data), `Corte ${mod}`);
}
