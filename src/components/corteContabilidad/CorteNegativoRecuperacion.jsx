import React from 'react';
import { fmtCorte } from '../../lib/corteContabilidad/useCorteContabilidad.js';

/**
 * Alerta de recuperación por pagaré / préstamo área y/o caja en negativo.
 * - Cajero: Abonar / Liquidar (sin ticket ni préstamo nuevo).
 * - Admin / recolector: botón Pagaré (genera registro + ticket x2).
 */
export default function CorteNegativoRecuperacion({
  etiqueta = 'corte',
  negativo = 0,
  recuperado = 0,
  deuda = 0,
  cajaActual = 0,
  visible = false,
  puedeAbonarLiquidar = false,
  puedeGenerarPagare = false,
  onAbonar,
  onLiquidar,
  onGenerarPagare,
}) {
  const neg = Number(negativo) || 0;
  const rec = Number(recuperado) || 0;
  const deb = Number(deuda) || 0;
  const caja = Number(cajaActual) || 0;
  const cajaEnNegativo = caja < -0.001;
  if (!visible && !(deb > 0.001) && !cajaEnNegativo) return null;

  const abs = Math.abs(neg);
  let fase = 'critico';
  if (!(abs > 0.001) && rec > 0.001) fase = 'leve';
  else if (abs < 80) fase = 'leve';
  else if (abs < 250) fase = 'medio';

  const montoNegativo = -Math.abs(neg > 0.001 ? neg : (cajaEnNegativo ? Math.abs(caja) : 0));
  const hayPendienteCobro = deb > 0.001;

  return (
    <div
      className={`corte-negativo-recuperacion corte-negativo-recuperacion--${fase}`}
      role="alert"
      aria-live="polite"
    >
      <div className="corte-negativo-recuperacion__etiqueta">
        DINERO EN RECUPERACIÓN · {String(etiqueta).toUpperCase()}
        {hayPendienteCobro ? ' · PENDIENTE' : ''}
      </div>
      <div className="corte-negativo-recuperacion__cifras">
        <div className="corte-negativo-recuperacion__cifra">
          <span className="corte-negativo-recuperacion__cifra-lbl">Negativo</span>
          <span className="corte-negativo-recuperacion__monto">{fmtCorte(montoNegativo)}</span>
        </div>
        <div className="corte-negativo-recuperacion__cifra">
          <span className="corte-negativo-recuperacion__cifra-lbl">Recuperado</span>
          <span className="corte-negativo-recuperacion__monto corte-negativo-recuperacion__monto--ok">
            {fmtCorte(rec)}
          </span>
        </div>
      </div>
      <div className="corte-negativo-recuperacion__hint">
        {cajaEnNegativo && !(abs > 0.001)
          ? `Caja en negativo (${fmtCorte(caja)}) — recupera hasta $0.00`
          : fase === 'leve'
            ? 'Cubierto por venta — puedes liquidar para cuadrar el corte'
            : fase === 'medio'
              ? 'Recuperando… el color se vuelve verde al acercarse a cero'
              : cajaEnNegativo
                ? `Corte en negativo ${fmtCorte(caja)} — la alerta refleja el mismo negativo`
                : 'Pendiente de recuperación — la venta del corte reduce el negativo'}
      </div>
      <div className="corte-negativo-recuperacion__acciones">
        {puedeAbonarLiquidar && hayPendienteCobro && typeof onAbonar === 'function' && (
          <button type="button" className="btn btn-ghost corte-negativo-recuperacion__btn" onClick={onAbonar}>
            Abonar
          </button>
        )}
        {puedeAbonarLiquidar && hayPendienteCobro && typeof onLiquidar === 'function' && (
          <button type="button" className="btn btn-primary corte-negativo-recuperacion__btn" onClick={onLiquidar}>
            Liquidar
          </button>
        )}
        {puedeGenerarPagare && (hayPendienteCobro || cajaEnNegativo) && typeof onGenerarPagare === 'function' && (
          <button
            type="button"
            className="btn btn-gold corte-negativo-recuperacion__btn"
            onClick={onGenerarPagare}
            title="Genera pagaré con ticket (2 copias). Solo admin / recolector."
          >
            Pagaré
          </button>
        )}
      </div>
    </div>
  );
}
