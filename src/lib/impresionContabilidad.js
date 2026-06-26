import { abrirVentanaImpresion } from './impresion.js';
import { leerNombreNegocio } from './branding.js';
import { ETIQUETA_AREA } from './contabilidadConstants.js';

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

export function htmlVale(vale) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Vale</title><style>${estilos()}</style></head><body>
    <h1>VALE — ${esc(ETIQUETA_AREA[vale.area] || vale.area || 'General')}</h1>
    <div>Folio: <strong>${esc(vale.folio || '—')}</strong></div>
    <div>Fecha: ${esc(vale.fecha)}</div>
    <div>Beneficiario: <strong>${esc(vale.nombre_empleado)}</strong></div>
    <div style="font-size:20px;margin:12px 0"><strong>Monto: ${fmt(vale.monto)}</strong></div>
    <div>Motivo: ${esc(vale.motivo || '—')}</div>
    ${vale.requiere_autorizacion ? `<div>Autorizado por: ${esc(vale.autorizado_por || '—')}</div>` : ''}
    <div class="muted" style="margin-top:16px">Este vale no se descuenta de nómina.</div>
    <div class="muted">Emitido por: ${esc(vale.created_by || '—')}</div>
  </body></html>`;
}

export function imprimirNomina(datos) {
  return abrirVentanaImpresion(htmlNomina(datos), 'Nómina');
}

export function imprimirVale(vale) {
  return abrirVentanaImpresion(htmlVale(vale), 'Vale');
}
