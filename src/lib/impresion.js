import { etiquetaTienda } from '../constants/sucursales.js';
import { leerLogoUrl, leerNombreNegocio, leerPieTicket } from './branding.js';
import { enviarTextoSerial, puertoSerialConectado } from './perifericosPnP.js';
import { impresionHabilitada, leerConfigImpresion } from './posConfig.js';

function fmtFecha(d = new Date()) {
  return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtMoney(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function linea(cols) {
  return `<tr>${cols.map((c) => `<td>${c}</td>`).join('')}</tr>`;
}

function estilosImpresion(ancho) {
  const w = ancho === '58mm' ? '58mm' : ancho === 'carta' ? '210mm' : '80mm';
  const fs = ancho === '58mm' ? '11px' : ancho === 'carta' ? '13px' : '12px';
  return `
    @page { size: ${w} auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Consolas', 'Courier New', monospace; font-size: ${fs}; color: #111; margin: 0; padding: 8px; width: ${w}; }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .muted { color: #444; font-size: 0.92em; }
    .sep { border-top: 1px dashed #333; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; }
    td.r { text-align: right; white-space: nowrap; }
    h1 { font-size: 1.15em; margin: 0 0 4px; }
    h2 { font-size: 1em; margin: 0 0 6px; }
    img.logo { max-width: 72%; max-height: 64px; display: block; margin: 0 auto 6px; }
    @media print { body { padding: 0; } }
  `;
}

function cabeceraDoc(titulo, meta = {}) {
  const negocio = esc(meta.negocio || leerNombreNegocio());
  const logo = meta.logo !== false ? leerLogoUrl() : null;
  const rows = [
    meta.sucursal ? `Tienda: ${esc(etiquetaTienda(meta.sucursal))}` : '',
    meta.fecha ? `Fecha: ${esc(meta.fecha)}` : `Fecha: ${esc(fmtFecha())}`,
    meta.usuario ? `Usuario: ${esc(meta.usuario)}` : '',
    meta.folio ? `Folio: ${esc(meta.folio)}` : '',
  ].filter(Boolean);
  return `
    <div class="center">
      ${logo ? `<img class="logo" src="${esc(logo)}" alt="" />` : ''}
      <h1>${negocio}</h1>
      <h2>${esc(titulo)}</h2>
      ${rows.map((r) => `<div class="muted">${r}</div>`).join('')}
    </div>
    <div class="sep"></div>
  `;
}

function pieDoc(extra) {
  const pie = esc(leerPieTicket());
  return `
    <div class="sep"></div>
    <div class="center muted">${pie}</div>
    ${extra ? `<div class="muted" style="margin-top:6px">${extra}</div>` : ''}
  `;
}

function htmlTablaLineas(lineas, cols) {
  const head = cols.map((c) => `<th style="text-align:${c.align || 'left'};font-size:0.9em">${esc(c.label)}</th>`).join('');
  const body = lineas
    .map((row) =>
      `<tr>${cols
        .map((c) => `<td style="text-align:${c.align || 'left'}">${c.fmt ? c.fmt(row) : esc(row[c.key])}</td>`)
        .join('')}</tr>`,
    )
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function htmlTicketVenta(data) {
  const cfg = leerConfigImpresion();
  const items = data.articulos || [];
  const filas = items
    .map(
      (it) =>
        linea([
          `<span>${esc(it.nombre)}</span>`,
          `<span class="r">${it.qty || 1} × ${fmtMoney(it.precio)}</span>`,
          `<span class="r bold">${fmtMoney(Number(it.precio) * (it.qty || 1))}</span>`,
        ]),
    )
    .join('');
  const cambio =
    data.cambio != null && data.esEfectivo
      ? `<div>Recibido: ${fmtMoney(data.recibido)} ${esc(data.moneda || 'MXN')}</div><div class="bold">Cambio: ${fmtMoney(data.cambio)} MXN</div>`
      : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Ticket</title><style>${estilosImpresion(cfg.ancho)}</style></head><body>
    ${cabeceraDoc('TICKET DE VENTA', { sucursal: data.sucursal, usuario: data.vendedor, fecha: data.fecha })}
    <table>${filas}</table>
    <div class="sep"></div>
    <div class="bold" style="font-size:1.2em;text-align:right">TOTAL ${fmtMoney(data.total)} MXN</div>
    <div class="muted" style="margin-top:4px">Pago: ${esc(data.metodo_pago)}</div>
    ${cambio}
    ${pieDoc()}
  </body></html>`;
}

export function htmlPedidoCompra(data) {
  const cfg = leerConfigImpresion();
  const lineas = (data.items || []).filter((l) => Number(l.qty_pedido || l.qty) > 0);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Pedido</title><style>${estilosImpresion(cfg.ancho)}</style></head><body>
    ${cabeceraDoc('ORDEN DE COMPRA', { sucursal: data.sucursal, usuario: data.usuario, folio: data.folio })}
    <div class="bold">Proveedor: ${esc(data.proveedor)}</div>
    ${data.notas ? `<div class="muted">Notas: ${esc(data.notas)}</div>` : ''}
    <div class="sep"></div>
    ${htmlTablaLineas(lineas, [
      { label: 'Cód.', key: 'id' },
      { label: 'Producto', key: 'nombre' },
      { label: 'Cant.', key: 'qty_pedido', align: 'right', fmt: (r) => r.qty_pedido ?? r.qty },
      { label: 'Costo', key: 'costo_est', align: 'right', fmt: (r) => fmtMoney(r.costo_est || r.costo) },
    ])}
    <div class="sep"></div>
    <div class="bold" style="text-align:right">Total estimado: ${fmtMoney(data.total)}</div>
    ${pieDoc('Documento de pedido — no actualiza inventario hasta recepción.')}
  </body></html>`;
}

export function htmlRecepcionCompra(data) {
  const cfg = leerConfigImpresion();
  const lineas = (data.items || []).filter((l) => Number(l.qty || l.qty_recibido) > 0);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Recepción</title><style>${estilosImpresion(cfg.ancho)}</style></head><body>
    ${cabeceraDoc('RECEPCIÓN DE COMPRA', { sucursal: data.sucursal, usuario: data.usuario, folio: data.folio })}
    <div class="bold">Proveedor: ${esc(data.proveedor)}</div>
    <div class="sep"></div>
    ${htmlTablaLineas(lineas, [
      { label: 'Cód.', key: 'id' },
      { label: 'Producto', key: 'nombre' },
      { label: 'Rec.', key: 'qty', align: 'right', fmt: (r) => r.qty ?? r.qty_recibido },
      { label: 'Costo', key: 'costo', align: 'right', fmt: (r) => fmtMoney(r.costo || r.costo_est) },
    ])}
    <div class="sep"></div>
    <div class="bold" style="text-align:right">Total ticket: ${fmtMoney(data.total)}</div>
    ${pieDoc('Mercancía recibida — inventario actualizado.')}
  </body></html>`;
}

export function htmlInventario(data) {
  const cfg = leerConfigImpresion();
  const rows = data.productos || [];
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Inventario</title><style>${estilosImpresion(cfg.ancho === '58mm' ? 'carta' : cfg.ancho)}</style></head><body>
    ${cabeceraDoc('INVENTARIO / STOCK', { sucursal: data.sucursal, usuario: data.usuario })}
    ${data.titulo ? `<div class="muted">${esc(data.titulo)}</div>` : ''}
    <div class="sep"></div>
    ${htmlTablaLineas(rows, [
      { label: 'Código', key: 'id' },
      { label: 'Producto', key: 'nombre' },
      { label: 'Stock', key: 'stock', align: 'right' },
      { label: 'Precio', key: 'precio', align: 'right', fmt: (r) => fmtMoney(r.precio) },
    ])}
    <div class="sep"></div>
    <div class="muted">Productos: ${rows.length}</div>
    ${pieDoc()}
  </body></html>`;
}

export function htmlMovimientoInventario(data) {
  const cfg = leerConfigImpresion();
  const lineas = data.lineas || [];
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Mov. inventario</title><style>${estilosImpresion(cfg.ancho)}</style></head><body>
    ${cabeceraDoc(data.titulo || 'MOVIMIENTO DE INVENTARIO', { sucursal: data.sucursal, usuario: data.usuario, folio: data.folio })}
    ${data.motivo ? `<div class="muted">Motivo: ${esc(data.motivo)}</div>` : ''}
    <div class="sep"></div>
    ${htmlTablaLineas(lineas, [
      { label: 'Cód.', key: 'id' },
      { label: 'Producto', key: 'nombre' },
      { label: 'Cant.', key: 'cantidad', align: 'right' },
      { label: 'Tipo', key: 'tipo' },
    ])}
    ${pieDoc()}
  </body></html>`;
}

export function htmlAjusteInventario(data) {
  const cfg = leerConfigImpresion();
  const lineas = (data.lineas || []).filter((l) => l.diferencia !== 0 && l.contada != null);
  const r = data.resumen || {};
  const estado = data.aplicado ? 'APLICADO' : 'BORRADOR';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Ajuste inventario</title><style>${estilosImpresion(cfg.ancho === '58mm' ? 'carta' : cfg.ancho)}</style></head><body>
    ${cabeceraDoc(`AJUSTE DE INVENTARIO · ${estado}`, { sucursal: data.sucursal, usuario: data.usuario, folio: data.folio })}
    ${data.departamento ? `<div class="muted">Departamento: ${esc(data.departamento)}</div>` : ''}
    <div class="sep"></div>
    <div>Faltante: <strong>${r.piezasFaltantes || 0} pzs</strong> · ${fmtMoney(r.valorFaltante)}</div>
    <div>Sobrante: <strong>${r.piezasSobrantes || 0} pzs</strong> · ${fmtMoney(r.valorSobrante)}</div>
    <div>Piezas contadas: ${r.piezasContadas || 0} · Sistema: ${r.piezasExistencia || 0}</div>
    <div class="sep"></div>
    ${lineas.length ? htmlTablaLineas(lineas, [
      { label: 'Código', key: 'codigo' },
      { label: 'Producto', key: 'nombre' },
      { label: 'Exist.', key: 'existencia', align: 'right' },
      { label: 'Contada', key: 'contada', align: 'right' },
      { label: 'Dif.', key: 'diferencia', align: 'right', fmt: (row) => (row.diferencia > 0 ? `+${row.diferencia}` : String(row.diferencia)) },
    ]) : '<div class="muted">Sin diferencias en productos contados.</div>'}
    ${pieDoc('Documento de ajuste físico por departamento.')}
  </body></html>`;
}

export function htmlReporte(data) {
  const cfg = leerConfigImpresion();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Reporte</title><style>${estilosImpresion(cfg.ancho === '58mm' ? 'carta' : cfg.ancho)}</style></head><body>
    ${cabeceraDoc(data.titulo || 'REPORTE', { sucursal: data.sucursal, usuario: data.usuario, fecha: data.rango })}
  ${data.secciones
    ?.map(
      (s) => `
    <div class="bold" style="margin-top:8px">${esc(s.titulo)}</div>
    ${s.html || (s.lineas ? `<pre style="margin:4px 0;white-space:pre-wrap">${esc(s.lineas.join('\n'))}</pre>` : '')}
  `,
    )
    .join('') || ''}
    ${data.tabla ? htmlTablaLineas(data.tabla.rows, data.tabla.cols) : ''}
    ${pieDoc()}
  </body></html>`;
}

export function htmlCorteCaja(data) {
  const cfg = leerConfigImpresion();
  const metodos = (data.detalleMetodos || [])
    .map((d) => `<div>${esc(d.metodo)}: <span class="r">${fmtMoney(d.monto)}</span></div>`)
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Corte</title><style>${estilosImpresion(cfg.ancho)}</style></head><body>
    ${cabeceraDoc('CORTE DE CAJA', { sucursal: data.sucursal, usuario: data.usuario, fecha: data.fecha })}
    <div>Turno: <strong>${esc(data.turno)}</strong></div>
    <div class="sep"></div>
    <div>Tickets: ${data.tickets}</div>
    <div>Cancelaciones: ${data.cancelaciones}</div>
    <div>Ventas brutas: ${fmtMoney(data.totalBruto)}</div>
    <div>Cancelado: -${fmtMoney(data.totalCancelaciones)}</div>
    <div class="bold">Total neto: ${fmtMoney(data.total)}</div>
    <div class="sep"></div>
    <div class="bold">Por método de pago</div>
    ${metodos || '<div class="muted">Sin movimientos</div>'}
    <div class="sep"></div>
    <div>Efectivo esperado: ${fmtMoney(data.efectivoEsperado)}</div>
    ${data.efectivoContado != null ? `<div>Efectivo contado: ${fmtMoney(data.efectivoContado)}</div>` : ''}
    ${data.diferencia != null ? `<div class="bold">Diferencia: ${fmtMoney(data.diferencia)}</div>` : ''}
    ${data.notas ? `<div class="muted">Notas: ${esc(data.notas)}</div>` : ''}
    ${pieDoc()}
  </body></html>`;
}

const GENERADORES = {
  venta: htmlTicketVenta,
  pedido_compra: htmlPedidoCompra,
  recepcion_compra: htmlRecepcionCompra,
  inventario: htmlInventario,
  movimiento_inventario: htmlMovimientoInventario,
  ajuste_inventario: htmlAjusteInventario,
  reporte: htmlReporte,
  corte: htmlCorteCaja,
};

function htmlATextoPlano(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/tr>/gi, '\n').replace(/<\/div>/gi, '\n');
  return tmp.textContent || tmp.innerText || '';
}

export function abrirVentanaImpresion(html, titulo = 'Imprimir') {
  const w = window.open('', '_blank', 'width=420,height=720');
  if (!w) return { ok: false, error: 'Permite ventanas emergentes para imprimir.' };
  w.document.write(html);
  w.document.close();
  w.document.title = titulo;
  w.focus();
  setTimeout(() => {
    w.print();
  }, 350);
  return { ok: true };
}

export async function imprimirDocumento(tipo, datos, opts = {}) {
  if (!impresionHabilitada(tipo) && !opts.forzar) {
    return { ok: false, error: `Impresión de "${tipo}" desactivada en Configuración.` };
  }
  const gen = GENERADORES[tipo];
  if (!gen) return { ok: false, error: `Tipo de documento desconocido: ${tipo}` };
  const html = gen(datos);
  const cfg = leerConfigImpresion();

  if (opts.soloSerial && puertoSerialConectado()) {
    const texto = htmlATextoPlano(html);
    return enviarTextoSerial(texto);
  }

  if (puertoSerialConectado() && cfg.impresoraId && !opts.soloNavegador) {
    const texto = htmlATextoPlano(html);
    const r = await enviarTextoSerial(texto);
    if (r.ok) return r;
  }

  const copias = Math.max(1, Number(opts.copias || cfg.copias) || 1);
  for (let i = 0; i < copias; i++) {
    const r = abrirVentanaImpresion(html, opts.titulo || tipo);
    if (!r.ok) return r;
  }
  return { ok: true };
}

export function imprimirVenta(datos) {
  return imprimirDocumento('venta', { fecha: fmtFecha(), ...datos });
}

export function imprimirPedidoCompra(datos) {
  return imprimirDocumento('pedido_compra', datos);
}

export function imprimirRecepcionCompra(datos) {
  return imprimirDocumento('recepcion_compra', datos);
}

export function imprimirInventario(datos) {
  return imprimirDocumento('inventario', datos);
}

export function imprimirMovimientoInventario(datos) {
  return imprimirDocumento('movimiento_inventario', datos);
}

export function imprimirAjusteInventario(datos) {
  return imprimirDocumento('ajuste_inventario', datos, { forzar: true });
}

export function imprimirReporte(datos) {
  return imprimirDocumento('reporte', datos);
}

export function imprimirCorte(datos) {
  return imprimirDocumento('corte', datos);
}

export function imprimirPrueba() {
  return imprimirDocumento(
    'venta',
    {
      sucursal: 'MAIN',
      vendedor: 'Prueba',
      articulos: [
        { nombre: 'Producto de ejemplo', precio: 15.5, qty: 2 },
        { nombre: 'Refresco 600ml', precio: 18, qty: 1 },
      ],
      total: 49,
      metodo_pago: 'Efectivo MXN',
      esEfectivo: true,
      recibido: 100,
      cambio: 51,
      moneda: 'MXN',
    },
    { forzar: true, titulo: 'Ticket de prueba' },
  );
}
