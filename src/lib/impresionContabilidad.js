import { abrirVentanaImpresion } from './impresion.js';
import { leerNombreNegocio } from './branding.js';
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
      <td class="r">${fmt(l.sueldo_base)}</td>
      <td class="r">${fmt(l.bonificacion)}</td>
      <td class="r">${fmt(l.deduccion_gastos)}</td>
      <td class="r">${fmt(l.deduccion_prestamos)}</td>
      <td class="r">${fmt(l.deducciones)}</td>
      <td class="r"><strong>${fmt(l.total)}</strong></td>
    </tr>`,
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Nómina</title><style>${estilos()}</style></head><body>
    <h1>${esc(leerNombreNegocio())} — NÓMINA</h1>
    <div>Periodo: <strong>${esc(data.periodo_inicio)} — ${esc(data.periodo_fin)}</strong> (sáb–vie)</div>
    ${data.pagador_filtro ? `<div>Pagador: <strong>${esc(ETIQUETA_AREA[data.pagador_filtro] || data.pagador_filtro)}</strong></div>` : ''}
    <div class="muted">Generado: ${esc(new Date().toLocaleString())}</div>
    <table>
      <thead><tr><th>Empleado</th><th>Rol</th><th>Pagador</th><th class="r">Sueldo</th><th class="r">Bono</th><th class="r">Consumos</th><th class="r">Préstamos</th><th class="r">Otras ded.</th><th class="r">Total</th></tr></thead>
      <tbody>${lineas}</tbody>
      <tfoot><tr><td colspan="8" class="r"><strong>Total</strong></td><td class="r"><strong>${fmt(data.total)}</strong></td></tr></tfoot>
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
    ${descNomina ? `<div class="muted">Consumo descontable en nómina (vía corte).</div>` : `<div class="muted">Gasolina, herramienta y accesorios no se descuentan de nómina.</div>`}
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

export function imprimirNomina(datos) {
  return abrirVentanaImpresion(htmlNomina(datos), 'Nómina');
}

export function imprimirVale(vale, opts) {
  return abrirVentanaImpresion(htmlVale(vale, opts), 'Vale');
}

export function imprimirPrestamo(prestamo) {
  return abrirVentanaImpresion(htmlPrestamo(prestamo), 'Préstamo');
}
