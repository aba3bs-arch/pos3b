import { abrirVentanaImpresion, cssTicketPosLegible } from './impresion.js';
import { leerNombreNegocio, leerLogoUrl } from './branding.js';
import { ETIQUETA_AREA } from './contabilidadConstants.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import { etiquetaTipoCierre } from './corteContabilidad/permisos.js';
import { gastoDescuentaNomina } from './corteContabilidad/catalogoGastos.js';
import { nombreTurnoLegible } from './turnos.js';

function estilosCortePos() {
  return `
    body{font-family:Arial,Helvetica,sans-serif;font-size:13px;margin:12px;max-width:420px;color:#000;font-weight:800;line-height:1.35}
    img.logo{max-width:70%;max-height:64px;display:block;margin:0 auto 8px}
    h1{font-size:18px;margin:0 0 4px;text-align:center;font-weight:900}
    .sub{text-align:center;color:#000;font-size:12px;margin-bottom:10px;font-weight:800}
    table{width:100%;border-collapse:collapse}
    td{padding:4px 2px;vertical-align:top;font-weight:800}
    td.r{text-align:right;white-space:nowrap}
    .sep{border-top:2px solid #000;margin:10px 0}
    .cat-block{margin:8px 0;padding:6px 0;border-top:1.5px solid #000}
    .cat-head{margin-bottom:4px;font-size:13px;font-weight:900}
    .tag{font-size:10px;background:#e8f4fc;color:#000;padding:1px 4px;border-radius:3px;font-weight:800}
    .muted{color:#000;font-size:11px;font-weight:800}
    .borrador{background:#fff3cd;border:2px solid #000;padding:6px;border-radius:4px;text-align:center;font-weight:900;margin-bottom:8px}
    .banner{color:#fff;text-align:center;font-weight:900;padding:8px;margin:8px 0;border-radius:4px}
    .rec,.op{font-weight:900}
    @media print{body{margin:0;padding:8px}}
    ${cssTicketPosLegible()}
  `;
}

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
    moneda_tope: d.moneda_tope ?? d.moneda_inicial,
    moneda_final: d.moneda_final ?? d.moneda_final_recoleccion ?? d.precoleccion,
    moneda_inyectar: (() => {
      const tope = round2(d.moneda_tope ?? d.moneda_inicial);
      const mf = round2(d.moneda_final ?? d.moneda_final_recoleccion ?? d.precoleccion);
      return round2(Math.max(0, tope - mf));
    })(),
    gastos: Array.isArray(d.gastos) ? d.gastos : [],
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
    filas.push(['Fondo fijo', fmt(e.fondo_fijo)]);
    filas.push(['Caja chica anterior', fmt(e.caja_anterior)]);
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
      const esEmp =
        String(g.categoria || '').toUpperCase().startsWith('EMPLEADO') || g.descuentaNomina;
      const items = g.items
        .map((it) => {
          const emp = String(it.usuario_nombre || '').trim();
          const gen = String(it.solicitado_por || '').trim();
          const com = it.comentario ? ` — ${esc(it.comentario)}` : '';
          const hora = it.created_at
            ? ` · ${esc(new Date(it.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }))}`
            : '';
          // Empleado: nombre + concepto (sin repetir categoría EMPLEADO / operativos / proveedor).
          const linea = esEmp
            ? `${esc(emp || 'Sin empleado')} · ${esc(it.subcategoria || '—')}${com}${hora}`
            : `${esc(it.subcategoria || '—')}${com}${
                emp && gen && emp !== gen
                  ? ` · Emp: ${esc(emp)} · Gen: ${esc(gen)}`
                  : emp
                    ? ` · ${esc(emp)}`
                    : gen
                      ? ` · Gen: ${esc(gen)}`
                      : ''
              }${hora}`;
          return `<tr>
            <td class="muted" style="padding-left:8px">${linea}</td>
            <td class="r">${fmt(it.monto)}</td>
          </tr>`;
        })
        .join('');
      const titulo = esEmp ? 'EMPLEADOS (nómina)' : g.categoria;
      const badge = g.descuentaNomina ? ' <span class="tag">nómina</span>' : '';
      return `
        <div class="cat-block">
          <div class="cat-head"><strong>${esc(titulo)}</strong>${badge}</div>
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
    ${estilosCortePos()}
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
          const catU = String(it.categoria || '').toUpperCase();
          const esEmp = catU.startsWith('EMPLEADO') || catU.includes('CONSUMO') || catU.includes('ANTICIPO') || catU.includes('FALTANTE') || catU.includes('RECARG');
          // Empleado: no listar categoría tipo proveedor/operativos; solo concepto.
          const concepto = esEmp
            ? [it.subcategoria, it.comentario].filter(Boolean).join(' · ')
            : [it.categoria, it.subcategoria, it.comentario].filter(Boolean).join(' · ');
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

/** Todos los gastos del periodo agrupados por corte (folio / turno). */
function htmlGastosPorCortePeriodo(data) {
  const gastos = data.gastos || [];
  if (!gastos.length) return '<p class="muted">Sin gastos en los cortes del periodo.</p>';

  const porCorte = new Map();
  for (const g of gastos) {
    const folio = String(g._corte_folio || 'Sin folio').trim() || 'Sin folio';
    const turno = String(g._corte_turno || '').trim();
    const key = `${folio}||${turno}`;
    if (!porCorte.has(key)) {
      porCorte.set(key, {
        folio,
        turno,
        usuario: g._corte_usuario || null,
        fecha: g._corte_fecha || null,
        total: 0,
        items: [],
      });
    }
    const block = porCorte.get(key);
    block.total += Number(g.monto) || 0;
    block.items.push(g);
  }

  const bloques = [...porCorte.values()].sort((a, b) => {
    const ta = a.fecha ? new Date(a.fecha).getTime() : 0;
    const tb = b.fecha ? new Date(b.fecha).getTime() : 0;
    return tb - ta;
  });

  return bloques
    .map((block) => {
      const fechaTxt = block.fecha
        ? new Date(block.fecha).toLocaleString('es-MX', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
        : '';
      const head = [
        `Folio ${block.folio}`,
        block.turno ? block.turno : null,
        block.usuario ? block.usuario : null,
        fechaTxt || null,
      ].filter(Boolean).join(' · ');
      const rows = block.items
        .map((it) => {
          const catU = String(it.categoria || '').toUpperCase();
          const esEmp = catU.startsWith('EMPLEADO')
            || catU.includes('CONSUMO')
            || catU.includes('ANTICIPO')
            || catU.includes('FALTANTE')
            || catU.includes('RECARG');
          const concepto = esEmp
            ? [it.subcategoria || it.categoria, it.comentario].filter(Boolean).join(' · ')
            : [it.categoria, it.subcategoria, it.comentario].filter(Boolean).join(' · ');
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
          <div class="cat-head"><strong>${esc(head)}</strong></div>
          <table>
            <tr><td class="muted">Concepto</td><td class="muted">Empleado</td><td class="r muted">Hora</td><td class="r muted">Monto</td></tr>
            ${rows}
            <tr><td colspan="3"><strong>Subtotal corte</strong></td><td class="r"><strong>${fmt(block.total)}</strong></td></tr>
          </table>
        </div>`;
    })
    .join('');
}

/** Ticket simple de recolección Virtual: tope, final, inyectar, gastos, recolectado. */
export function htmlRecoleccionVirtual(data) {
  const logo = leerLogoUrl();
  const negocio = leerNombreNegocio();
  const fecha = data.fecha ? new Date(data.fecha).toLocaleString('es-MX') : new Date().toLocaleString('es-MX');
  const e = data.estado || {};
  const mf = round2(
    data.moneda_final ?? e.moneda_final ?? e.moneda_final_recoleccion ?? e.precoleccion,
  );
  const tope = round2(
    data.moneda_tope
      ?? e.moneda_tope
      ?? e.moneda_inicial
      ?? e.moneda_operacion,
  );
  // Siempre tope − MF (lo que Antonio debe inyectar / actualizar en portal).
  const inyectar = round2(Math.max(0, tope - mf));
  const rec = round2(data.recoleccion ?? e.recoleccion ?? e.recoleccion_turno ?? 0);
  const gastosLista = (data.gastos && data.gastos.length)
    ? data.gastos
    : (Array.isArray(e.gastos) ? e.gastos : []);
  const gastosTotal = round2(
    gastosLista.reduce((a, g) => a + (Number(g.monto) || 0), 0),
  );

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Recolección Virtual</title><style>
    ${estilosCortePos()}
    .banner{background:#6c3483}
    .inyectar-box{
      margin:12px 0;
      text-align:center;
      border:3px solid #6c3483;
      padding:12px 8px;
      background:#f5eef8;
    }
    .inyectar-label{font-size:12px;font-weight:900;margin:0 0 4px;color:#6c3483}
    .inyectar-monto{font-size:20px;font-weight:900;margin:0;color:#000}
    .inyectar-hint{font-size:11px;font-weight:800;margin:6px 0 0}
    .recolectado{
      margin-top:14px;
      text-align:center;
      border:2px solid #000;
      padding:12px 8px;
    }
    .recolectado-label{font-size:13px;font-weight:900;margin:0 0 4px}
    .recolectado-monto{font-size:16px;font-weight:900;margin:0}
    td{border-bottom:1px solid #ccc}
  </style></head><body>
    <img class="logo" src="${esc(logo)}" alt=""/>
    <h1>${esc(negocio)}</h1>
    <div class="sub">RECOLECCIÓN · VIRTUAL</div>
    <div class="banner">RECOLECCIÓN</div>
    <table>
      <tr><td>Tienda</td><td class="r"><strong>${esc(etiquetaTienda(data.sucursal))}</strong></td></tr>
      <tr><td>Folio</td><td class="r"><strong>${esc(data.folio || '—')}</strong></td></tr>
      <tr><td>Fecha</td><td class="r">${esc(fecha)}</td></tr>
      <tr><td>Usuario</td><td class="r">${esc(data.usuario_nombre || '—')}</td></tr>
    </table>
    <div class="sep"></div>
    <table>
      <tr><td>Moneda tope</td><td class="r"><strong>${fmt(tope)}</strong></td></tr>
      <tr><td>Moneda final</td><td class="r"><strong>${fmt(mf)}</strong></td></tr>
    </table>
    <div class="inyectar-box">
      <p class="inyectar-label">MONEDA A INYECTAR</p>
      <p class="inyectar-monto">${fmt(inyectar)}</p>
      <p class="inyectar-hint">tope − moneda final · actualizar portal con esta cantidad</p>
    </div>
    <div class="sep"></div>
    <strong>Desglose de gastos — todos los cortes del periodo (${gastosLista.length})</strong>
    ${htmlGastosPorCortePeriodo({ ...data, gastos: gastosLista })}
    <table style="margin-top:8px">
      <tr><td><strong>Total gastos</strong></td><td class="r"><strong>${fmt(gastosTotal)}</strong></td></tr>
    </table>
    <div class="recolectado">
      <p class="recolectado-label">Cantidad recolectada</p>
      <p class="recolectado-monto">${fmt(rec)}</p>
    </div>
  </body></html>`;
}

export function datosImpresionRecoleccionVirtual({
  sucursal,
  folio,
  turno,
  user,
  estado,
  gastos,
  calc,
  recoleccion,
  moneda_inyectar,
  moneda_tope,
  moneda_final,
  fecha,
}) {
  const e = estado || {};
  const tope = round2(moneda_tope ?? e.moneda_tope ?? e.moneda_inicial);
  const mf = round2(moneda_final ?? e.moneda_final ?? e.moneda_final_recoleccion ?? e.precoleccion);
  const inyectar = round2(Math.max(0, tope - mf));
  const lista = Array.isArray(gastos) && gastos.length
    ? gastos
    : (Array.isArray(e.gastos) ? e.gastos : []);
  const gastosTotal = round2(lista.reduce((a, g) => a + (Number(g.monto) || 0), 0));
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
    gastos_total: gastosTotal || round2(calc?.gastosTotal ?? e.gastos_total ?? 0),
    gastos: lista,
    estado: {
      ...e,
      moneda_tope: tope,
      moneda_final: mf,
      moneda_inyectar: inyectar,
      gastos: lista,
      gastos_total: gastosTotal || round2(calc?.gastosTotal ?? e.gastos_total ?? 0),
    },
    comentarios: e.comentarios || '',
    recoleccion: recoleccion ?? e.recoleccion ?? e.recoleccion_turno ?? 0,
    moneda_tope: tope,
    moneda_final: mf,
    moneda_inyectar: inyectar,
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
    ${estilosCortePos()}
    .banner{background:${bannerBg}}
    td{border-bottom:1px solid #ccc}
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
