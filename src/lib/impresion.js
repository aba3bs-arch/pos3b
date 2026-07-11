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

/** Medidas en mm para que el navegador no escale el ticket al doble. */
export function medidasPapel(ancho = '80mm') {
  const map = {
    '58mm': { page: '58mm', body: '52mm', font: '8px', ventana: 230, margen: '1.5mm' },
    '80mm': { page: '80mm', body: '72mm', font: '9px', ventana: 310, margen: '2mm' },
    carta: { page: 'A4', body: '100%', font: '11px', ventana: 720, margen: '8mm' },
  };
  return map[ancho] || map['80mm'];
}

export function estilosImpresion(ancho) {
  const m = medidasPapel(ancho);
  const esTicket = ancho === '58mm' || ancho === '80mm';
  return `
    @page { size: ${m.page} auto; margin: ${esTicket ? '1mm' : '6mm'}; }
    html { width: ${m.body}; margin: 0 auto; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: ${m.font};
      line-height: 1.22;
      color: #111;
      margin: 0 auto;
      padding: ${m.margen};
      width: ${m.body};
      max-width: ${m.body};
    }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .muted { color: #444; font-size: 0.92em; }
    .sep { border-top: 1px dashed #333; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td { padding: 1px 0; vertical-align: top; word-wrap: break-word; }
    td.r { text-align: right; white-space: nowrap; }
    h1 { font-size: 1.05em; margin: 0 0 2px; font-weight: 700; }
    h2 { font-size: 0.95em; margin: 0 0 4px; font-weight: 600; }
    img.logo { max-width: 62%; max-height: 44px; display: block; margin: 0 auto 4px; }
    .total-line { font-weight: 700; text-align: right; margin-top: 4px; }
    #pdf-bar { position: sticky; top: 0; z-index: 9; background: #1a5276; color: #fff; padding: 8px; text-align: center; font-family: system-ui, sans-serif; font-size: 13px; }
    #pdf-bar button { background: #fff; color: #1a5276; border: none; padding: 6px 14px; border-radius: 6px; font-weight: 700; cursor: pointer; margin: 0 4px; }
    @media print {
      html, body { width: ${m.body}; max-width: ${m.body}; margin: 0 auto; padding: ${m.margen}; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      #pdf-bar { display: none !important; }
    }
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
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Ticket</title><style>${estilosImpresion(cfg.ancho)}</style></head><body>
    ${cabeceraDoc('TICKET DE VENTA', { sucursal: data.sucursal, usuario: data.vendedor, fecha: data.fecha })}
    <table>${filas}</table>
    <div class="sep"></div>
    <div class="total-line">TOTAL ${fmtMoney(data.total)} MXN</div>
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
    ${data.diferencia != null ? `<div class="bold">Diferencia efectivo: ${fmtMoney(data.diferencia)}</div>` : ''}
    ${
      data.corroboracion && Object.keys(data.corroboracion).length
        ? `<div class="sep"></div><div class="bold">Corroboración rubros</div>${Object.entries(data.corroboracion)
            .map(([k, v]) => {
              if (!v || v.contado == null) return '';
              const lbl = { tarjeta: 'Tarjeta', transferencia: 'Transferencia', qr: 'QR' }[k] || k;
              return `<div>${lbl}: esp. ${fmtMoney(v.esperado)} · cont. ${fmtMoney(v.contado)} · dif. ${fmtMoney(v.diferencia)}</div>`;
            })
            .join('')}`
        : ''
    }
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

export function abrirVentanaImpresion(html, titulo = 'Imprimir', opts = {}) {
  const cfg = leerConfigImpresion();
  const ancho = opts.ancho || cfg.ancho;
  const m = medidasPapel(ancho);
  const w = window.open('', '_blank', `width=${m.ventana},height=640,scrollbars=yes`);
  if (!w) return { ok: false, error: 'Permite ventanas emergentes para imprimir.' };

  w.document.open();
  w.document.write(html);
  w.document.close();
  w.document.title = titulo;
  try {
    w.focus();
  } catch {
    /* ignore */
  }

  if (opts.autoPrint === false) return { ok: true };

  let impreso = false;
  let preparando = false;
  const dispararPrint = () => {
    if (impreso) return;
    impreso = true;
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
  };

  const cuandoListo = () => {
    if (preparando || impreso) return;
    preparando = true;
    const imgs = Array.from(w.document.images || []);
    const pendientes = imgs.filter((img) => !img.complete);
    if (!pendientes.length) {
      // Un frame extra evita el fallo de la 1ª impresión en Chrome/Edge.
      if (typeof w.requestAnimationFrame === 'function') {
        w.requestAnimationFrame(() => setTimeout(dispararPrint, 80));
      } else {
        setTimeout(dispararPrint, 80);
      }
      return;
    }
    let restantes = pendientes.length;
    const unoListo = () => {
      restantes -= 1;
      if (restantes <= 0) setTimeout(dispararPrint, 80);
    };
    pendientes.forEach((img) => {
      img.addEventListener('load', unoListo, { once: true });
      img.addEventListener('error', unoListo, { once: true });
    });
  };

  if (w.document.readyState === 'complete') {
    cuandoListo();
  } else {
    w.addEventListener('load', cuandoListo, { once: true });
    // Fallback si el evento load no llega (document.write en algunos navegadores).
    setTimeout(cuandoListo, 300);
  }
  // Tope de seguridad: nunca dejar la ventana sin diálogo de impresión.
  setTimeout(dispararPrint, 2500);

  return { ok: true };
}

/** Vista previa con botón para guardar como PDF (diálogo de impresión del sistema). */
export function abrirVentanaPDF(html, titulo = 'Guardar PDF') {
  const cfg = leerConfigImpresion();
  const m = medidasPapel(cfg.ancho);
  const barra = `<div id="pdf-bar">
    <span style="margin-right:8px">Vista previa</span>
    <button type="button" onclick="window.print()">Guardar PDF / Imprimir</button>
    <button type="button" onclick="window.close()">Cerrar</button>
  </div>`;
  const conBarra = html.replace(/<body([^>]*)>/i, `<body$1>${barra}`);
  const w = window.open('', '_blank', `width=${Math.max(m.ventana, 360)},height=720,scrollbars=yes`);
  if (!w) return { ok: false, error: 'Permite ventanas emergentes para exportar PDF.' };
  w.document.write(conBarra);
  w.document.close();
  w.document.title = titulo;
  w.focus();
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

export function imprimirVenta(datos, opts = {}) {
  return entregarTicketVenta(datos, opts.modo || 'imprimir', opts);
}

/** Imprime, abre PDF o no hace nada según el modo elegido. */
export async function entregarTicketVenta(datos, modo = 'imprimir', opts = {}) {
  if (modo === 'ninguno') return { ok: true, omitido: true };
  const payload = { fecha: fmtFecha(), ...datos };
  if (modo === 'pdf') {
    const html = htmlTicketVenta(payload);
    return abrirVentanaPDF(html, opts.titulo || 'Ticket de venta');
  }
  return imprimirDocumento('venta', payload, { ...opts, titulo: opts.titulo || 'Ticket de venta' });
}

export function exportarVentaPDF(datos) {
  return entregarTicketVenta(datos, 'pdf');
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

function htmlEtiquetasEstante(productos, meta = {}) {
  const cfg = leerConfigImpresion();
  const ancho = cfg.ancho === '58mm' ? '58mm' : '80mm';
  const items = (productos || []).map(
    (p) => `
    <div class="etiqueta" style="border:1px dashed #999;padding:8px;margin:6px;display:inline-block;width:calc(50% - 12px);min-width:140px;vertical-align:top;page-break-inside:avoid">
      <div style="font-size:0.75rem;color:#666">${esc(meta.sucursal ? etiquetaTienda(meta.sucursal) : '')}</div>
      <div style="font-weight:800;font-size:0.95rem;line-height:1.2;margin:4px 0">${esc(p.nombre)}</div>
      <div style="font-size:1.35rem;font-weight:800;color:#2d4f8c">${fmtMoney(p.precio)}</div>
      <div style="font-family:monospace;font-size:0.85rem;margin-top:4px">${esc(p.id)}</div>
      <div style="font-size:0.8rem;margin-top:2px">Stock piso: ${p.stock ?? 0}</div>
    </div>`,
  );
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Etiquetas</title>
    <style>body{font-family:system-ui,sans-serif;margin:12px} @media print{.etiqueta{border-color:#ccc}}</style></head>
    <body>
    <h3 style="margin:0 0 8px">Etiquetas de estante</h3>
    <div class="muted" style="font-size:0.85rem;margin-bottom:12px">${items.length} producto(s) · ${fmtFecha()}</div>
    ${items.join('') || '<p>Sin productos.</p>'}
    </body></html>`;
}

export function imprimirEtiquetasEstante(productos, meta = {}) {
  const html = htmlEtiquetasEstante(productos, meta);
  return abrirVentanaImpresion(html, 'Etiquetas de estante');
}
