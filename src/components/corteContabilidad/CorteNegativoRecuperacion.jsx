import React from 'react';
import { fmtCorte } from '../../lib/corteContabilidad/useCorteContabilidad.js';

/**
 * Banner superior centrado cuando la caja del corte está en negativo.
 * Parpadea amarillo/rojo/naranja; conforme se acerca a $0 se vuelve verde.
 * Tamaño de cantidad: 32pt — máxima visibilidad al entrar al módulo.
 */
export default function CorteNegativoRecuperacion({ cajaActual, etiqueta = 'corte' }) {
  const monto = Number(cajaActual) || 0;
  if (!(monto < -0.001)) return null;

  const abs = Math.abs(monto);
  // Escala de recuperación: más cerca de cero = más verde
  let fase = 'critico';
  if (abs < 80) fase = 'leve';
  else if (abs < 250) fase = 'medio';

  return (
    <div
      className={`corte-negativo-recuperacion corte-negativo-recuperacion--${fase}`}
      role="alert"
      aria-live="polite"
    >
      <div className="corte-negativo-recuperacion__etiqueta">
        DINERO EN RECUPERACIÓN · {String(etiqueta).toUpperCase()}
      </div>
      <div className="corte-negativo-recuperacion__monto">{fmtCorte(monto)}</div>
      <div className="corte-negativo-recuperacion__hint">
        {fase === 'leve'
          ? 'Casi en ceros — sigue recuperando hasta $0.00'
          : fase === 'medio'
            ? 'Recuperando… el color se vuelve verde al acercarse a cero'
            : 'Caja en negativo — al recuperar ventas el aviso se vuelve verde'}
      </div>
    </div>
  );
}
