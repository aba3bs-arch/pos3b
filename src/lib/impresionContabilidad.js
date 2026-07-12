import { abrirVentanaImpresion, estilosImpresion } from './impresion.js';
import { leerNombreNegocio, leerLogoUrl } from './branding.js';
import { leerConfigImpresion } from './posConfig.js';
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

/** Fecha corta para ticket térmico (evita saltos de línea largos). */
function fmtFechaCorta(ymd) {
  const s = String(ymd || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

function filaTicket(label, valor, { bold = false, danger = false } = {}) {
  const cls = [bold ? 'bold' : '', danger ? 'danger' : ''].filter(Boolean).join(' ');
  return `<tr class="${cls}"><td class="lbl">${esc(label)}</td><td class="r val">${valor}</td></tr>`;
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
    ${descNomina ? `<div class="muted">Consumo descontable en nómina (vía corte).</div>` : `<div class="muted">Tipo «${esc(etiquetaCategoriaVale(vale.categoria))}» — no se descuenta de nómina (salvo configuración del tipo).</div>`}
    <div class="muted">Corte: ${esc(ETIQUETA_AREA[vale.area] || vale.area || '—')}</div>
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

function estilosReciboNomina(ancho) {
  const base = estilosImpresion(ancho);
  const esTicket = ancho === '58mm' || ancho === '80mm';
  return `${base}
  .recibo-nomina,
  .recibo-nomina * {
    color: #000 !important;
    font-weight: 800 !important;
  }
  .recibo-nomina .muted {
    color: #000 !important;
    font-weight: 800 !important;
  }
  .recibo-nomina {
    width: 100%;
    text-align: center;
    margin: 0 auto;
  }
  .recibo-nomina .titulo {
    text-align: center;
    font-size: ${esTicket ? '1.15em' : '18px'};
    letter-spacing: 0.06em;
    margin: 2px 0 0;
    text-transform: uppercase;
  }
  .recibo-nomina .negocio {
    text-align: center;
    font-size: 0.95em;
    margin: 2px 0 6px;
  }
  .recibo-nomina .bloque { margin: 0 auto; width: 100%; }
  .recibo-nomina table.kv {
    width: 92%;
    margin: 0 auto;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .recibo-nomina table.kv td {
    border: none;
    padding: 2px 2px;
    vertical-align: top;
    font-size: inherit;
    background: transparent;
    text-align: center;
  }
  .recibo-nomina table.kv td.lbl {
    width: 48%;
    padding-right: 3px;
    text-align: right;
    word-break: break-word;
  }
  .recibo-nomina table.kv td.val {
    width: 52%;
    text-align: left;
    padding-left: 3px;
    word-break: break-word;
  }
  .recibo-nomina .nombre-emp {
    text-align: center;
    font-size: 1.1em;
    margin: 6px 0 4px;
    word-break: break-word;
    line-height: 1.25;
  }
  .recibo-nomina .sec {
    text-align: center;
    font-size: 0.92em;
    margin: 4px 0;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .recibo-nomina .neto-box {
    margin: 8px auto 4px;
    padding: 6px 4px;
    border: 2px solid #000;
    text-align: center;
    width: 92%;
  }
  .recibo-nomina .neto-box .neto-lbl {
    font-size: 0.85em;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .recibo-nomina .neto-box .neto-monto {
    font-size: ${esTicket ? '1.35em' : '22px'};
    margin-top: 2px;
    letter-spacing: 0.02em;
  }
  .recibo-nomina .firma {
    margin: 18px auto 0;
    text-align: center;
    font-size: 0.9em;
    line-height: 1.35;
    width: 92%;
  }
  .recibo-nomina .firma-linea {
    margin: 22px auto 4px;
    border-top: 1.5px solid #000;
    width: 80%;
  }
  .recibo-nomina img.logo {
    max-width: ${esTicket ? '72%' : '220px'};
    max-height: ${esTicket ? '56px' : '88px'};
    display: block;
    margin: 0 auto 8px;
    object-fit: contain;
  }
  .recibo-nomina .sep {
    border: none;
    border-top: 1px dashed #000;
    margin: 6px auto;
    width: 88%;
  }
  .recibo-nomina .center { text-align: center; }
  `;
}

export function htmlReciboNominaIndividual(linea, opts = {}) {
  const cfg = leerConfigImpresion();
  const ancho = opts.ancho || (cfg.ancho === '58mm' ? '58mm' : '80mm');
  const logo = leerLogoUrl();
  const negocio = leerNombreNegocio();
  const ahora = opts.fechaPago ? new Date(opts.fechaPago) : new Date();
  const fechaPago = ahora.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const horaPago = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const periodo = `${fmtFechaCorta(opts.periodo_inicio)} — ${fmtFechaCorta(opts.periodo_fin)}`;
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

  const labelDias =
    linea.vales_gasolina > 0 && linea.es_indirecto ? 'Vales cobrados' : 'Días trabajados';

  const filasDed = [
    dedInv > 0 ? filaTicket('Inventario', `− ${fmt(dedInv)}`, { danger: true }) : '',
    dedCons > 0 ? filaTicket('Consumos', `− ${fmt(dedCons)}`, { danger: true }) : '',
    dedPrest > 0 ? filaTicket('Préstamos', `− ${fmt(dedPrest)}`, { danger: true }) : '',
    dedArrastre > 0 ? filaTicket('Arrastre ant.', `− ${fmt(dedArrastre)}`, { danger: true }) : '',
    dedFaltas > 0 ? filaTicket('Faltas gasolina', `− ${fmt(dedFaltas)}`, { danger: true }) : '',
    Number(linea.deducciones) > 0
      ? filaTicket(
          linea.notas_otros ? `Otros (${String(linea.notas_otros).slice(0, 18)})` : 'Otros',
          `− ${fmt(Number(linea.deducciones))}`,
          { danger: true },
        )
      : '',
  ]
    .filter(Boolean)
    .join('');

  const sinDescuentos = dedInv + dedCons + dedPrest + dedArrastre + dedOtras === 0;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Recibo nómina — ${esc(linea.nombre)}</title>
  <style>${estilosReciboNomina(ancho)}</style></head><body>
  <div class="recibo-nomina">
    ${logo ? `<img class="logo" src="${esc(logo)}" alt="${esc(negocio)}"/>` : `<div class="titulo">${esc(negocio)}</div>`}
    <div class="titulo">Recibo de nómina</div>
    ${logo ? `<div class="negocio">${esc(negocio)}</div>` : ''}
    <div class="sep"></div>
    <div class="nombre-emp">${esc(linea.nombre)}</div>
    <table class="kv bloque">
      ${linea.rol ? filaTicket('Puesto', esc(linea.rol)) : ''}
      ${linea.pagador_nomina ? filaTicket('Pagador', esc(ETIQUETA_AREA[linea.pagador_nomina] || linea.pagador_nomina)) : ''}
      ${filaTicket('Periodo', esc(periodo))}
      ${salarioDia > 0 ? filaTicket('Salario / día', fmt(salarioDia)) : ''}
      ${dias > 0 ? filaTicket(labelDias, esc(String(dias))) : ''}
      ${linea.faltas_gasolina > 0 ? filaTicket('Faltas (vale)', esc(String(linea.faltas_gasolina))) : ''}
      ${filaTicket('Fecha pago', esc(fechaPago))}
      ${filaTicket('Hora', esc(horaPago))}
    </table>
    <div class="sep"></div>
    <div class="sec">Percepciones</div>
    <table class="kv bloque">
      ${filaTicket(`Sueldo (${dias}×${fmt(salarioDia)})`, fmt(sueldo), { bold: true })}
      ${bono > 0 ? filaTicket('Bonificación', fmt(bono)) : ''}
      ${filaTicket('Subtotal', fmt(bruto), { bold: true })}
    </table>
    <div class="sep"></div>
    <div class="sec">Descuentos</div>
    <table class="kv bloque">
      ${sinDescuentos ? '<tr><td colspan="2" class="muted center">Sin descuentos</td></tr>' : filasDed}
    </table>
    <div class="neto-box">
      <div class="neto-lbl">Pago neto a recibir</div>
      <div class="neto-monto">${fmtPagoImp(neto)}</div>
    </div>
    ${(linea.saldo_pendiente || 0) > 0 ? `<div class="center bold" style="margin:4px 0">Deuda próxima nómina: ${fmt(linea.saldo_pendiente)}</div>` : ''}
    <div class="sep"></div>
    <div class="firma">
      Recibí de conformidad el importe neto indicado.
      <div style="margin-top:8px" class="bold">${esc(linea.nombre)}</div>
      <div class="firma-linea"></div>
      <div class="muted">Firma del empleado</div>
    </div>
  </div>
  </body></html>`;
}

export function imprimirReciboNominaIndividual(linea, opts = {}) {
  const cfg = leerConfigImpresion();
  const ancho = opts.ancho || (cfg.ancho === '58mm' ? '58mm' : '80mm');
  return abrirVentanaImpresion(htmlReciboNominaIndividual(linea, { ...opts, ancho }), `Recibo — ${linea.nombre || 'empleado'}`, {
    ancho,
  });
}

/** Un documento con recibo por empleado (salto de página entre cada uno). */
export function htmlRecibosNominaTodos(lineas, opts = {}) {
  const lista = lineas || [];
  if (!lista.length) return '';
  const cfg = leerConfigImpresion();
  const ancho = opts.ancho || (cfg.ancho === '58mm' ? '58mm' : '80mm');
  const optsAncho = { ...opts, ancho };
  const muestra = htmlReciboNominaIndividual(lista[0], optsAncho);
  const styleMatch = muestra.match(/<style>([\s\S]*?)<\/style>/i);
  const estilosDoc = styleMatch ? styleMatch[1] : '';
  const cuerpos = lista
    .map((l) => {
      const html = htmlReciboNominaIndividual(l, optsAncho);
      const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      return m ? `<div class="recibo-page">${m[1]}</div>` : '';
    })
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Recibos nómina</title><style>${estilosDoc}.recibo-page{page-break-after:always;padding-bottom:8px}.recibo-page:last-child{page-break-after:auto}</style></head><body>${cuerpos}</body></html>`;
}

export function imprimirTodosRecibosNomina(lineas, opts = {}) {
  if (!lineas?.length) return false;
  const cfg = leerConfigImpresion();
  const ancho = opts.ancho || (cfg.ancho === '58mm' ? '58mm' : '80mm');
  return abrirVentanaImpresion(htmlRecibosNominaTodos(lineas, { ...opts, ancho }), 'Recibos nómina', { ancho });
}

export function imprimirNomina(datos) {
  return abrirVentanaImpresion(htmlNomina(datos), 'Nómina', { ancho: 'carta' });
}

export function imprimirVale(vale, opts) {
  return abrirVentanaImpresion(htmlVale(vale, opts), 'Vale');
}

export function imprimirPrestamo(prestamo) {
  return abrirVentanaImpresion(htmlPrestamo(prestamo), 'Préstamo');
}
