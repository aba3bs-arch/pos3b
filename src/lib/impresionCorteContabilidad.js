import { abrirVentanaImpresion } from './impresion.js';
import { leerNombreNegocio, leerLogoUrl } from './branding.js';
import { ETIQUETA_AREA } from './contabilidadConstants.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import { etiquetaTipoCierre } from './corteContabilidad/permisos.js';
import { gastoDescuentaNomina } from './corteContabilidad/catalogoGastos.js';
import { nombreTurnoLegible } from './turnos.js';

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

/** Turno legible para ticket (acepta string u objeto sesión). */
export function formatoTurnoRecibo(turno) {
  if (turno == null || turno === '') return '—';
  if (typeof turno === 'string') {
    const t = turno.trim();
    if (!t || t === '[object Object]') return '—';
    if (/^recoleccion$/i.test(t)) return 'Recolección';
    try {
      if (t.startsWith('{')) {
        const obj = JSON.parse(t);
        return nombreTurnoLegible(obj) || t;
      }
    } catch {
      /* texto plano */
    }
    return nombreTurnoLegible(t) || t;
  }
  return nombreTurnoLegible(turno) || '—';
}

function etiquetaTipoRecibo(data) {
  if (data?.es_borrador) return 'BORRADOR (turno abierto)';
  return etiquetaTipoCierre({ tipo_cierre: data?.tipo_cierre });
}

/** Encabezado obligatorio: tienda, folio, turno, tipo, fecha, cajero. */
function htmlEncabezadoCorte(data, { fecha } = {}) {
  const fechaTxt = fecha
    || (data.fecha ? new Date(data.fecha).toLocaleString('es-MX') : new Date().toLocaleString('es-MX'));
  return `<table>
      <tr><td>Tienda</td><td class="r"><strong>${esc(etiquetaTienda(data.sucursal))}</strong></td></tr>
      <tr><td>Folio</td><td class="r"><strong>${esc(data.folio || '—')}</strong></td></tr>
      <tr><td>Turno</td><td class="r">${esc(formatoTurnoRecibo(data.turno))}</td></tr>
      <tr><td>Tipo</td><td class="r">${esc(etiquetaTipoRecibo(data))}</td></tr>
      <tr><td>Fecha</td><td class="r">${esc(fechaTxt)}</td></tr>
      <tr><td>Cajero</td><td class="r">${esc(data.usuario_nombre || '—')}</td></tr>
    </table>`;
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
    turno: formatoTurnoRecibo(turno),
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
    turno: formatoTurnoRecibo(h.turno || d.turno_sesion),
    usuario_nombre: h.usuario_nombre,
    tipo_cierre: d.tipo_cierre || 'cierre',
    temporal: d.tipo_cierre === 'recoleccion_temporal',
    fecha: h.created_at,
    venta: h.ventas ?? d.venta ?? 0,
    subtotal: d.subtotal,
    caja_actual: h.caja_actual,
    gastos_total: d.gastos_total,
    gastos: d.gastos || [],
    estado: d,
    comentarios: d.comentarios || '',
    recoleccion: d.recoleccion ?? d.recoleccion_turno ?? 0,
    recoleccion_anterior_tras: d.recoleccion_anterior_tras,
    es_borrador: false,
  };
}

function filasResumenModulo(data) {
  const e = data.estado || {};
  const mod = data.modulo;
  const filas = [];

  if (mod === 'virtual') {
    filas.push(['Moneda operación', fmt(e.moneda_inicial)]);
    filas.push(['Fondo fijo', fmt(e.fondo)]);
    filas.push(['Caja chica (anterior)', fmt(e.caja_anterior)]);
    filas.push(['Moneda inicial (corte)', fmt(e.moneda_inicial_turno ?? e.moneda_inicial)]);
    filas.push(['Moneda final', fmt(e.moneda_final)]);
    filas.push(['Venta efectivo', fmt(data.venta)]);
    if (e.recoleccion || e.recoleccion_turno) filas.push(['Recolección', fmt(e.recoleccion ?? e.recoleccion_turno)]);
    if (e.moneda_inyectada) {
      filas.push(['Moneda inyectada (admin)', fmt(e.moneda_inyectada_monto)]);
    }
  } else if (mod === 'abarrotes') {
    filas.push(['Venta total', fmt(e.venta)]);
    filas.push(['Tarjeta', fmt(e.tarjeta)]);
    filas.push(['Faltante', fmt(e.faltante)]);
    filas.push(['Recolección', fmt(e.recoleccion)]);
  } else if (mod === 'garage') {
    filas.push(['Venta actual', fmt(data.venta)]);
    if (e.recoleccion_anterior) filas.push(['Recolección anterior', fmt(e.recoleccion_anterior)]);
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
          const emp = String(it.usuario_nombre || '').trim();
          const gen = String(it.solicitado_por || '').trim();
          const quien =
            emp && gen && emp !== gen
              ? ` · Emp: ${esc(emp)} · Gen: ${esc(gen)}`
              : emp
                ? ` · ${esc(emp)}`
                : gen
                  ? ` · Gen: ${esc(gen)}`
                  : '';
          const com = it.comentario ? ` — ${esc(it.comentario)}` : '';
          const hora = it.created_at
            ? ` · ${esc(new Date(it.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }))}`
            : '';
          return `<tr>
            <td class="muted" style="padding-left:8px">${esc(it.subcategoria || '—')}${com}${quien}${hora}</td>
            <td class="r">${fmt(it.monto)}</td>
          </tr>`;
        })
        .join('');
      const badge = g.descuentaNomina ? ' <span class="tag">nómina</span>' : '';
      return `
        <div class="cat-block">
          <div class="cat-head"><strong>${esc(g.categoria)}</strong>${badge}</div>
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
    ${htmlEncabezadoCorte(data, { fecha })}
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
    <p class="muted" style="text-align:center">Solo CONSUMO, RECARGAS, ANTICIPOS y FALTANTE con empleado descuentan nómina.</p>
  </body></html>`;
}

function htmlGastosPorCajero(data) {
  const gastos = data.gastos || [];
  if (!gastos.length) return '<p class="muted">Sin gastos registrados.</p>';

  const porGenerador = {};
  for (const g of gastos) {
    const key =
      String(g.solicitado_por || g.usuario_nombre || 'Sin responsable').trim() || 'Sin responsable';
    if (!porGenerador[key]) porGenerador[key] = { total: 0, items: [] };
    porGenerador[key].total += Number(g.monto) || 0;
    porGenerador[key].items.push(g);
  }

  return Object.entries(porGenerador)
    .sort((a, b) => a[0].localeCompare(b[0], 'es'))
    .map(([quien, block]) => {
      const rows = block.items
        .map((it) => {
          const concepto = [it.categoria, it.subcategoria, it.comentario].filter(Boolean).join(' · ');
          const emp = String(it.usuario_nombre || '').trim() || '—';
          const hora = it.created_at
            ? new Date(it.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
            : '—';
          return `<tr>
            <td>${esc(concepto || '—')}</td>
            <td>${esc(emp)}</td>
            <td class="r muted">${esc(hora)}</td>
            <td class="r">${fmt(it.monto)}</td>
          </tr>`;
        })
        .join('');
      return `
        <div class="cat-block">
          <div class="cat-head"><strong>Generó: ${esc(quien)}</strong></div>
          <table>
            <tr><td class="muted">Concepto</td><td class="muted">Empleado</td><td class="r muted">Hora</td><td class="r muted">Monto</td></tr>
            ${rows}
          </table>
        </div>`;
    })
    .join('');
}

/** Ticket específico de recolección Virtual (distinto al corte normal). */
export function htmlRecoleccionVirtual(data) {
  const logo = leerLogoUrl();
  const negocio = leerNombreNegocio();
  const fecha = data.fecha ? new Date(data.fecha).toLocaleString('es-MX') : new Date().toLocaleString('es-MX');
  const e = data.estado || {};
  const miOp = round2(e.moneda_inicial);
  const mi = round2(e.moneda_inicial_turno ?? e.moneda_inicial);
  const mf = round2(e.moneda_final);
  const cajaAnt = round2(e.caja_anterior);
  const gastos = round2(data.gastos_total);
  const venta = round2(data.venta ?? (mi - mf));
  const rec = round2(data.recoleccion ?? e.recoleccion ?? 0);
  const subtotal = round2(data.subtotal ?? (venta - gastos));
  const cajaActual = round2(data.caja_actual ?? (cajaAnt + subtotal));
  const miSiguiente = mf > 0 || e.moneda_final_editada ? mf : mi;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Recolección Virtual</title><style>
    body{font-family:Arial,sans-serif;font-size:12px;margin:12px;max-width:420px;color:#111}
    img.logo{max-width:70%;max-height:64px;display:block;margin:0 auto 8px}
    h1{font-size:16px;margin:0 0 4px;text-align:center}
    .sub{text-align:center;color:#555;font-size:11px;margin-bottom:10px}
    .banner{background:#6c3483;color:#fff;text-align:center;font-weight:800;padding:8px;margin:8px 0;border-radius:4px}
    table{width:100%;border-collapse:collapse}
    td{padding:5px 4px;vertical-align:top;border-bottom:1px solid #eee}
    td.r{text-align:right;white-space:nowrap}
    .sep{border-top:1px dashed #333;margin:10px 0}
    .cat-block{margin:8px 0;padding:6px 0;border-top:1px solid #ddd}
    .cat-head{margin-bottom:4px;font-size:12px}
    .muted{color:#666;font-size:10px}
    .rec{font-weight:800}
    .op{color:#6c3483;font-weight:800}
    @media print{body{margin:0;padding:8px}}
  </style></head><body>
    <img class="logo" src="${esc(logo)}" alt=""/>
    <h1>${esc(negocio)}</h1>
    <div class="sub">TICKET DE RECOLECCIÓN · VIRTUAL</div>
    <div class="banner">RECOLECCIÓN</div>
    ${htmlEncabezadoCorte({ ...data, tipo_cierre: data.tipo_cierre || 'recoleccion' }, { fecha })}
    <div class="sep"></div>
    <table>
      <tr><td class="op">Moneda tope (ref)</td><td class="r op">${fmt(miOp)}</td></tr>
      <tr><td>Fondo fijo</td><td class="r">${fmt(e.fondo)}</td></tr>
      <tr><td>Caja chica (anterior)</td><td class="r">${fmt(cajaAnt)}</td></tr>
      <tr><td>Moneda inicial (corte)</td><td class="r">${fmt(mi)}</td></tr>
      <tr><td>Moneda final</td><td class="r">${fmt(mf)}</td></tr>
      <tr><td>Venta efectivo</td><td class="r">${fmt(venta)}</td></tr>
      <tr><td>Gastos</td><td class="r">${fmt(gastos)}</td></tr>
      <tr><td>Subtotal</td><td class="r">${fmt(subtotal)}</td></tr>
      <tr><td>Caja chica actual</td><td class="r">${fmt(cajaActual)}</td></tr>
      <tr><td class="rec">Recolección</td><td class="r rec">${fmt(rec)}</td></tr>
      <tr><td>Próxima MI (portal)</td><td class="r">${fmt(miSiguiente)}</td></tr>
      <tr><td>Caja chica nueva</td><td class="r">${fmt(0)}</td></tr>
    </table>
    <div class="sep"></div>
    <strong>Desglose de gastos</strong>
    ${htmlGastosPorCajero(data)}
    <table style="margin-top:8px">
      <tr><td><strong>Total gastos</strong></td><td class="r"><strong>${fmt(gastos)}</strong></td></tr>
    </table>
    ${data.comentarios ? `<div class="sep"></div><p class="muted"><strong>Comentarios:</strong> ${esc(data.comentarios)}</p>` : ''}
    <div class="sep"></div>
    <p class="muted" style="text-align:center">Solo la recolección entra a IE. Inyección de moneda: solo admin en el campo Moneda inicial.</p>
  </body></html>`;
}

export function datosImpresionRecoleccionVirtual({ sucursal, folio, turno, user, estado, gastos, calc, recoleccion, fecha }) {
  return {
    modulo: 'virtual',
    sucursal,
    folio,
    turno: formatoTurnoRecibo(turno || 'RECOLECCION'),
    usuario_nombre: user?.nombre || null,
    tipo_cierre: 'recoleccion',
    fecha: fecha || new Date().toISOString(),
    venta: calc?.venta ?? 0,
    subtotal: calc?.subtotal ?? 0,
    caja_actual: calc?.cajaActual ?? 0,
    gastos_total: calc?.gastosTotal ?? 0,
    gastos: gastos || [],
    estado: estado || {},
    comentarios: estado?.comentarios || '',
    recoleccion: recoleccion ?? 0,
    es_borrador: false,
  };
}

export function imprimirRecoleccionVirtual(data) {
  return abrirVentanaImpresion(htmlRecoleccionVirtual(data), 'Recolección Virtual');
}

/** Ticket de recolección Garage (definitiva o temporal). */
export function htmlRecoleccionGarage(data) {
  const logo = leerLogoUrl();
  const negocio = leerNombreNegocio();
  const fecha = data.fecha ? new Date(data.fecha).toLocaleString('es-MX') : new Date().toLocaleString('es-MX');
  const e = data.estado || {};
  const temporal = data.tipo_cierre === 'recoleccion_temporal' || data.temporal;
  const rec = round2(data.recoleccion ?? e.recoleccion ?? 0);
  const antAntes = round2(e.recoleccion_anterior);
  const antTras = round2(
    data.recoleccion_anterior_tras ?? e.recoleccion_anterior_tras ?? (temporal ? antAntes + rec : 0),
  );
  const venta = round2(data.venta ?? e.venta ?? 0);
  const gastos = round2(data.gastos_total ?? 0);
  const bannerBg = temporal ? '#b9770e' : '#7f8c8d';
  const titulo = temporal ? 'RECOLECCIÓN TEMPORAL' : 'RECOLECCIÓN';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(titulo)} Garage</title><style>
    body{font-family:Arial,sans-serif;font-size:12px;margin:12px;max-width:420px;color:#111}
    img.logo{max-width:70%;max-height:64px;display:block;margin:0 auto 8px}
    h1{font-size:16px;margin:0 0 4px;text-align:center}
    .sub{text-align:center;color:#555;font-size:11px;margin-bottom:10px}
    .banner{background:${bannerBg};color:#fff;text-align:center;font-weight:800;padding:8px;margin:8px 0;border-radius:4px}
    table{width:100%;border-collapse:collapse}
    td{padding:5px 4px;vertical-align:top;border-bottom:1px solid #eee}
    td.r{text-align:right;white-space:nowrap}
    .sep{border-top:1px dashed #333;margin:10px 0}
    .muted{color:#666;font-size:10px}
    .rec{font-weight:800}
    @media print{body{margin:0;padding:8px}}
  </style></head><body>
    <img class="logo" src="${esc(logo)}" alt=""/>
    <h1>${esc(negocio)}</h1>
    <div class="sub">TICKET DE RECOLECCIÓN · GARAGE</div>
    <div class="banner">${esc(titulo)}</div>
    ${htmlEncabezadoCorte({
      ...data,
      turno: data.turno || 'RECOLECCION',
      tipo_cierre: data.tipo_cierre || (temporal ? 'recoleccion_temporal' : 'recoleccion'),
    }, { fecha })}
    <div class="sep"></div>
    <table>
      <tr><td>Venta actual (lectura)</td><td class="r">${fmt(venta)}</td></tr>
      <tr><td>Gastos turno</td><td class="r">${fmt(gastos)}</td></tr>
      <tr><td class="rec">Monto recolectado</td><td class="r rec">${fmt(rec)}</td></tr>
      <tr><td>Recolección anterior (antes)</td><td class="r">${fmt(antAntes)}</td></tr>
      <tr><td>Recolección anterior (queda)</td><td class="r">${fmt(antTras)}</td></tr>
      <tr><td>Máquinas / DSCH en ceros</td><td class="r"><strong>${temporal ? 'NO' : 'SÍ'}</strong></td></tr>
    </table>
    <div class="sep"></div>
    <p class="muted">${
      temporal
        ? 'Temporal: el monto pasa a recolección anterior y las lecturas quedan en cero. El corte sigue abierto.'
        : 'Definitiva: máquinas y dispensadora en ceros. Recolección anterior limpia.'
    }</p>
    ${data.comentarios ? `<p class="muted"><strong>Comentarios:</strong> ${esc(data.comentarios)}</p>` : ''}
  </body></html>`;
}

export function datosImpresionRecoleccionGarage({
  sucursal,
  folio,
  user,
  estado,
  gastos,
  calc,
  recoleccion,
  temporal = false,
  fecha,
}) {
  return {
    modulo: 'garage',
    sucursal,
    folio,
    usuario_nombre: user?.nombre || null,
    tipo_cierre: temporal ? 'recoleccion_temporal' : 'recoleccion',
    temporal: Boolean(temporal),
    fecha: fecha || new Date().toISOString(),
    venta: calc?.venta ?? 0,
    subtotal: calc?.subtotal ?? 0,
    caja_actual: calc?.cajaActual ?? 0,
    gastos_total: calc?.gastosTotal ?? 0,
    gastos: gastos || [],
    estado: estado || {},
    comentarios: estado?.comentarios || '',
    recoleccion: recoleccion ?? 0,
    recoleccion_anterior_tras: estado?.recoleccion_anterior_tras,
    es_borrador: false,
  };
}

export function imprimirRecoleccionGarage(data) {
  const titulo =
    data.tipo_cierre === 'recoleccion_temporal' || data.temporal
      ? 'Recolección temporal Garage'
      : 'Recolección Garage';
  return abrirVentanaImpresion(htmlRecoleccionGarage(data), titulo);
}

export function imprimirCorteContabilidad(data) {
  const mod = ETIQUETA_AREA[data.modulo] || data.modulo || 'Corte';
  if (data.tipo_cierre === 'recoleccion' && data.modulo === 'virtual') {
    return imprimirRecoleccionVirtual(data);
  }
  if (
    data.modulo === 'garage' &&
    (data.tipo_cierre === 'recoleccion' || data.tipo_cierre === 'recoleccion_temporal')
  ) {
    return imprimirRecoleccionGarage(data);
  }
  return abrirVentanaImpresion(htmlCorteContabilidad(data), `Corte ${mod}`);
}
