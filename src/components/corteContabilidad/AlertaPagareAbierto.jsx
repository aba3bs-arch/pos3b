import React from 'react';
import { fmtCorte } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import { ETIQUETA_AREA_PAGARE, montoPendienteRecoleccion, pagarePendienteRecoleccion, saldoPagare } from '../../lib/pagares.js';

function montoPagareVisible(p) {
  if (pagarePendienteRecoleccion(p)) return montoPendienteRecoleccion(p);
  return saldoPagare(p);
}

/**
 * Recuadro de alerta en cortes: pagaré abierto del área.
 * Se oculta solo cuando el recolector marca Recolectar (u otro cierre de saldo).
 * Acreedor operativo: RC Virtual (“Pague a Virtual”).
 */
export default function AlertaPagareAbierto({
  pagares = [],
  area = '',
  visible = true,
}) {
  const lista = Array.isArray(pagares) ? pagares : [];
  if (!visible || !lista.length) return null;

  const total = lista.reduce((acc, p) => acc + montoPagareVisible(p), 0);
  if (!(total > 0.001)) return null;

  const areaLbl = ETIQUETA_AREA_PAGARE[area] || String(area || '').toUpperCase() || 'ÁREA';
  const n = lista.length;
  const folioHint = n === 1
    ? (lista[0]?.folio ? ` · ${lista[0].folio}` : '')
    : ` · ${n} pagarés`;

  return (
    <div className="alerta-pagare-abierto" role="alert" aria-live="assertive">
      <div className="alerta-pagare-abierto__titulo">
        PAGARÉ ABIERTO · {String(areaLbl).toUpperCase()}
        {folioHint}
      </div>
      <div className="alerta-pagare-abierto__monto">{fmtCorte(total)}</div>
      <div className="alerta-pagare-abierto__acreedor">
        Debe a: <strong>Virtual</strong>
        <span className="alerta-pagare-abierto__acreedor-alt"> · Pague a Virtual</span>
      </div>
      <div className="alerta-pagare-abierto__hint">
        La alerta se quita cuando un recolector pulse Recolectar (Vales → Pagaré / RC Virtual).
      </div>
    </div>
  );
}
