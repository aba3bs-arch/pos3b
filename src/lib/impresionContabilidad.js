import { abrirVentanaImpresion } from './impresion.js';
import { leerNombreNegocio, leerLogoUrl } from './branding.js';
import { ETIQUETA_AREA, etiquetaCategoriaVale } from './contabilidadConstants.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function fmtPagoImp(n) {
  const v = Number(n) || 0;
  if (v < 0) return `−${fmt(Math.abs(v))}`;
  return fmt(v);
}

function estilos() {
  return `body{font-family:Arial,sans-serif;font-size:12px;margin:16px;max-width:720px}
  h1{font-size:16px;margin:0 0 8px} table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border:1px solid #ccc;padding:4px 6px;text-align:left} th{background:#f0f0f0}
  .r{text-align:right} .muted{color:#666;font-size:11px}`;
}

export function htmlNomina(data) {
  const lineas = (data.lineas || [])
    .map(
      (l) => `<tr>
      <td>${esc(l.nombre)}</td>
      <td>${esc(l.rol)}</td>
      <td>${esc(ETIQUETA_AREA[l.pagador_nomina] || l.pagador_nomina || '—')}</td>
      <td class="r">${fmt(l.salario_dia ?? l.sueldo_tarifa)}</td>
      <td class="r">${esc(l.dias_trabajados)}</td>
      <td class="r">${fmt(l.sueldo_base)}</td>
      <td class="r">${fmt(l.bonificacion)}</td>
      <td class="r">${fmt(l.deduccion_gastos)}</td>
      <td class="r">${fmt(l.deduccion_inventario)}</td>
      <td class="r">${fmt(l.deduccion_prestamos)}</td>
      <td class="r">${fmt((Number(l.deducciones) || 0) + (Number(l.deduccion_faltas) || 0))}${l.notas_otros ? ` <span class="muted">(${esc(l.notas_otros)})</span>` : ''}</td>
      <td class="r">${(Number(l.deduccion_arrastre) || 0) > 0 ? fmt(l.deduccion_arrastre) : '—'}</td>
      <td class="r"><strong style="color:${(Number(l.pago ?? l.total) || 0) < 0 ? '#c0392b' : 'inherit'}">${fmtPagoImp(l.pago ?? l.total)}</strong></td>
    </tr>`,
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Nómina</title><style>${estilos()}</style></head><body>
    <h1>${esc(leerNombreNegocio())} — NÓMINA</h1>
    <div>Periodo: <strong>${esc(data.periodo_inicio)} — ${esc(data.periodo_fin)}</strong> (sáb–vie)</div>
    <div class="muted">Consolidada de todas las sucursales</div>
    ${data.pagador_filtro ? `<div>Pagador: <strong>${esc(ETIQUETA_AREA[data.pagador_filtro] || data.pagador_filtro)}</strong></div>` : ''}
    <div class="muted">Generado: ${esc(new Date().toLocaleString())}</div>
    <table>
      <thead><tr><th>Empleado</th><th>Rol</th><th>Pagador</th><th class="r">$/día</th><th class="r">Días</th><th class="r">Sueldo</th><th class="r">Bono</th><th class="r">Consumos</th><th class="r">Inventario</th><th class="r">Préstamos</th><th class="r">Otros</th><th class="r">Arrastre</th><th class="r">Pago</th></tr></thead>
      <tbody>${lineas}</tbody>
      <tfoot><tr><td colspan="12" class="r"><strong>Total</strong></td><td class="r"><strong>${fmtPagoImp(data.total)}</strong></td></tr></tfoot>
    </table>
    ${data.notas ? `<p class="muted">Notas: ${esc(data.notas)}</p>` : ''}
  </body></html>`;
}

export function htmlVale(vale, opts = {}) {
  const firma = opts.mostrarFirma !== false;
  const descNomina = vale.descuenta_nomina;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Vale</title><style>${estilos()}
  .firma{margin-top:48px;border-top:1px solid #333;width:70%;padding-top:6px;font-size:11px}
  </style></head><body>
    <h1>VALE — ${esc(ETIQUETA_AREA[vale.area] || vale.area || 'General')}</h1>
    <div>Folio: <strong>${esc(vale.folio || '—')}</strong></div>
    <div>Fecha: ${esc(vale.fecha)}</div>
    <div>Categoría: <strong>${esc(etiquetaCategoriaVale(vale.categoria))}</strong></div>
    <div>Beneficiario: <strong>${esc(vale.nombre_empleado)}</strong></div>
    <div style="font-size:20px;margin:12px 0"><strong>Monto: ${fmt(vale.monto)}</strong></div>
    <div>Motivo: ${esc(vale.motivo || '—')}</div>
    ${vale.autorizado_por ? `<div>Autorizado por: ${esc(vale.autorizado_por)}</div>` : ''}
    ${descNomina ? `<div class="muted">Consumo descontable en nómina (vía corte).</div>` : `<div class="muted">${vale.categoria === 'otro' ? 'Otro concepto' : 'Gasolina, herramienta y accesorios'} — ${vale.descuenta_nomina ? 'descuenta nómina' : 'no se descuenta de nómina'}.</div>`}
    <div class="muted">Emitido por: ${esc(vale.created_by || '—')}</div>
    ${firma ? `<div class="firma">Firma del beneficiario: _________________________________</div>` : ''}
  </body></html>`;
}

export function htmlPrestamo(p) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Préstamo</title><style>${estilos()}</style></head><body>
    <h1>PRÉSTAMO A EMPLEADO</h1>
    <div>Fecha: ${esc(p.fecha)}</div>
    <div>Empleado: <strong>${esc(p.nombre_empleado)}</strong></div>
    <div style="font-size:20px;margin:12px 0"><strong>Monto: ${fmt(p.monto_original)}</strong></div>
    <div>Saldo: ${fmt(p.saldo)}</div>
    <div>Cuota semanal: <strong>${fmt(p.cuota_semanal)}</strong> (mín. $500)</div>
    ${p.aprobado_admin_por ? `<div>Aprobó admin: ${esc(p.aprobado_admin_por)}</div>` : ''}
    ${p.aprobado_socio_por ? `<div>Aprobó socio: ${esc(p.aprobado_socio_por)}</div>` : ''}
    <div class="muted">Descuento automático en nómina semanal (sáb–vie).</div>
    ${p.notas ? `<div>Notas: ${esc(p.notas)}</div>` : ''}
    <div style="margin-top:40px;border-top:1px solid #333;width:70%;padding-top:6px">Firma empleado: _________________________</div>
  </body></html>`;
}

function fmtNom(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function htmlReciboNominaIndividual(linea, opts = {}) {
  const logo = leerLogoUrl();
  const negocio = leerNombreNegocio();
  const ahora = opts.fechaPago ? new Date(opts.fechaPago) : new Date();
  const fechaPago = ahora.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const horaPago = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const salarioDia = Number(linea.salario_dia ?? linea.sueldo_tarifa) || 0;
  const dias = Number(linea.dias_trabajados) || 0;
  const sueldo = fmtNom(salarioDia * dias);
  const bono = Number(linea.bonificacion) || 0;
  const bruto = fmtNom(sueldo + bono);
  const dedInv = Number(linea.deduccion_inventario) || 0;
  const dedCons = Number(linea.deduccion_consumos) || Number(linea.deduccion_gastos) || 0;
  const dedPrest = Number(linea.deduccion_prestamos) || 0;
  const dedArrastre = Number(linea.deduccion_arrastre) || 0;
  const dedFaltas = Number(linea.deduccion_faltas) || 0;
  const dedOtras = (Number(linea.deducciones) || 0) + dedFaltas;
  const neto =
    linea.pago != null && linea.pago !== ''
      ? Number(linea.pago)
      : linea.total != null && linea.total !== ''
        ? Number(linea.total)
        : fmtNom(bruto - dedInv - dedCons - dedPrest - dedArrastre - (Number(linea.deducciones) || 0) - dedFaltas);
  const filaDed = (label, monto) =>
    monto > 0
      ? `<tr><td>${esc(label)}</td><td class="r" style="color:#c0392b">− ${fmt(monto)}</td></tr>`
      : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Recibo nómina — ${esc(linea.nombre)}</title><style>${estilos()}
  .logo{display:block;margin:0 auto 10px;max-height:72px;max-width:85%}
  .titulo{text-align:center;font-size:18px;font-weight:700;margin:8px 0 4px;letter-spacing:0.04em}
  .subtitulo{text-align:center;color:#555;font-size:12px;margin-bottom:14px}
  .campo{margin:6px 0;font-size:13px}
  .campo strong{display:inline-block;min-width:130px}
  .totales{margin-top:12px;border-top:2px solid #333;padding-top:8px}
  .neto{font-size:18px;font-weight:800;color:#1a5276;margin-top:8px}
  .firma{margin-top:56px;border-top:1px solid #333;width:75%;padding-top:8px;font-size:12px}
  </style></head><body>
    <img class="logo" src="${esc(logo)}" alt="Logo"/>
    <div class="titulo">RECIBO DE NÓMINA</div>
    <div class="subtitulo">${esc(negocio)}</div>
    <div class="campo"><strong>Empleado:</strong> ${esc(linea.nombre)}</div>
    ${linea.rol ? `<div class="campo"><strong>Puesto:</strong> ${esc(linea.rol)}</div>` : ''}
    ${linea.pagador_nomina ? `<div class="campo"><strong>Pagador:</strong> ${esc(ETIQUETA_AREA[linea.pagador_nomina] || linea.pagador_nomina)}</div>` : ''}
    <div class="campo"><strong>Periodo de pago:</strong> ${esc(opts.periodo_inicio)} — ${esc(opts.periodo_fin)}</div>
    ${salarioDia > 0 ? `<div class="campo"><strong>Salario por día:</strong> ${fmt(salarioDia)}</div>` : ''}
    ${linea.dias_trabajados != null && Number(linea.dias_trabajados) > 0 ? `<div class="campo"><strong>${linea.vales_gasolina > 0 && linea.es_indirecto ? 'Vales cobrados' : 'Días trabajados'}:</strong> ${esc(linea.dias_trabajados)}</div>` : ''}
    ${linea.faltas_gasolina > 0 ? `<div class="campo"><strong>Faltas (vale no cobrado):</strong> ${esc(linea.faltas_gasolina)}</div>` : ''}
    <div class="campo"><strong>Fecha de pago:</strong> ${esc(fechaPago)}</div>
    <div class="campo"><strong>Hora:</strong> ${esc(horaPago)}</div>
    <table style="margin-top:14px">
      <tr><td><strong>Sueldo (${dias} × ${fmt(salarioDia)})</strong></td><td class="r"><strong>${fmt(sueldo)}</strong></td></tr>
      ${bono > 0 ? `<tr><td>Bonificación</td><td class="r">${fmt(bono)}</td></tr>` : ''}
      <tr><td><strong>Subtotal (sueldo + bono)</strong></td><td class="r"><strong>${fmt(bruto)}</strong></td></tr>
    </table>
    <div class="totales"><strong>Desglose de descuentos</strong></div>
    <table>
      ${filaDed('Inventario', dedInv)}
      ${filaDed('Consumos', dedCons)}
      ${filaDed('Préstamos', dedPrest)}
      ${dedArrastre > 0 ? filaDed('Arrastre (nómina anterior)', dedArrastre) : ''}
      ${dedFaltas > 0 ? filaDed('Faltas (gasolina)', dedFaltas) : ''}
      ${Number(linea.deducciones) > 0 ? filaDed(linea.notas_otros ? `Otros (${linea.notas_otros})` : 'Otros', Number(linea.deducciones)) : ''}
      ${dedInv + dedCons + dedPrest + dedArrastre + dedOtras === 0 ? '<tr><td colspan="2" class="muted">Sin descuentos</td></tr>' : ''}
    </table>
    <div class="neto" style="color:${neto < 0 ? '#c0392b' : '#1a5276'}">Pago neto a recibir: ${fmtPagoImp(neto)}</div>
    ${(linea.saldo_pendiente || 0) > 0 ? `<p class="muted" style="color:#c0392b">Deuda a próxima nómina: ${fmt(linea.saldo_pendiente)}</p>` : ''}
    <div class="firma">Recibí de conformidad el importe neto indicado.<br/><br/>
      <strong>${esc(linea.nombre)}</strong><br/>
      _________________________________________________<br/>
      <span class="muted">Firma del empleado</span>
    </div>
    ${opts.notas ? `<p class="muted" style="margin-top:12px">Notas: ${esc(opts.notas)}</p>` : ''}
    ${linea.notas ? `<p class="muted" style="margin-top:8px;font-size:11px">Detalle: ${esc(linea.notas)}</p>` : ''}
  </body></html>`;
}

export function imprimirReciboNominaIndividual(linea, opts = {}) {
  return abrirVentanaImpresion(htmlReciboNominaIndividual(linea, opts), `Recibo — ${linea.nombre || 'empleado'}`);
}

/** Un documento con recibo por empleado (salto de página entre cada uno). */
export function htmlRecibosNominaTodos(lineas, opts = {}) {
  const lista = lineas || [];
  if (!lista.length) return '';
  const muestra = htmlReciboNominaIndividual(lista[0], opts);
  const styleMatch = muestra.match(/<style>([\s\S]*?)<\/style>/i);
  const estilos = styleMatch ? styleMatch[1] : '';
  const cuerpos = lista
    .map((l) => {
      const html = htmlReciboNominaIndividual(l, opts);
      const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      return m ? `<div class="recibo-page">${m[1]}</div>` : '';
    })
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Recibos nómina</title><style>${estilos}.recibo-page{page-break-after:always;padding-bottom:12px}.recibo-page:last-child{page-break-after:auto}</style></head><body>${cuerpos}</body></html>`;
}

export function imprimirTodosRecibosNomina(lineas, opts = {}) {
  if (!lineas?.length) return false;
  return abrirVentanaImpresion(htmlRecibosNominaTodos(lineas, opts), 'Recibos nómina');
}

export function imprimirNomina(datos) {
  return abrirVentanaImpresion(htmlNomina(datos), 'Nómina');
}

export function imprimirVale(vale, opts) {
  return abrirVentanaImpresion(htmlVale(vale, opts), 'Vale');
}

export function imprimirPrestamo(prestamo) {
  return abrirVentanaImpresion(htmlPrestamo(prestamo), 'Préstamo');
}
