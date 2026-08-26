import React from 'react';
import { fmtCorte } from '../../lib/corteContabilidad/useCorteContabilidad.js';

/**
 * Alerta de recuperación por préstamo área/sucursal (no por caja del corte).
 * Muestra negativo pendiente vs recuperado según la venta del turno,
 * con Abonar / Liquidar para que el cajero cuadre.
 */
export default function CorteNegativoRecuperacion({
  etiqueta = 'corte',
  negativo = 0,
  recuperado = 0,
  deuda = 0,
  visible = false,
  puedeAbonarLiquidar = false,
  onAbonar,
  onLiquidar,
}) {
  const neg = Number(negativo) || 0;
  const rec = Number(recuperado) || 0;
  const deb = Number(deuda) || 0;
  if (!visible && !(deb > 0.001)) return null;

  // Escala visual: más cerca de cubrir la deuda = más verde
  const abs = Math.abs(neg);
  let fase = 'critico';
  if (!(abs > 0.001) && rec > 0.001) fase = 'leve';
  else if (abs < 80) fase = 'leve';
  else if (abs < 250) fase = 'medio';

  return (
    <div
      className={`corte-negativo-recuperacion corte-negativo-recuperacion--${fase}`}
      role="alert"
      aria-live="polite"
    >
      <div className="corte-negativo-recuperacion__etiqueta">
        DINERO EN RECUPERACIÓN · PRÉSTAMO · {String(etiqueta).toUpperCase()}
      </div>
      <div className="corte-negativo-recuperacion__cifras">
        <div className="corte-negativo-recuperacion__cifra">
          <span className="corte-negativo-recuperacion__cifra-lbl">Negativo</span>
          <span className="corte-negativo-recuperacion__monto">{fmtCorte(-Math.abs(neg))}</span>
        </div>
        <div className="corte-negativo-recuperacion__cifra">
          <span className="corte-negativo-recuperacion__cifra-lbl">Recuperado</span>
          <span className="corte-negativo-recuperacion__monto corte-negativo-recuperacion__monto--ok">
            {fmtCorte(rec)}
          </span>
        </div>
      </div>
      <div className="corte-negativo-recuperacion__hint">
        {fase === 'leve'
          ? 'Cubierto por venta — puedes liquidar para cuadrar el corte'
          : fase === 'medio'
            ? 'Recuperando con la venta… el color se vuelve verde al cubrir el préstamo'
            : 'Préstamo pendiente — la venta del corte reduce el negativo'}
      </div>
      {puedeAbonarLiquidar && (
        <div className="corte-negativo-recuperacion__acciones">
          {typeof onAbonar === 'function' && deb > 0.001 && (
            <button type="button" className="btn btn-ghost corte-negativo-recuperacion__btn" onClick={onAbonar}>
              Abonar
            </button>
          )}
          {typeof onLiquidar === 'function' && deb > 0.001 && (
            <button type="button" className="btn btn-primary corte-negativo-recuperacion__btn" onClick={onLiquidar}>
              Liquidar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
