import React from 'react';
import { fmtCorte } from '../../lib/corteContabilidad/useCorteContabilidad.js';

/**
 * Alerta de recuperación por pagaré / préstamo área y/o caja en negativo.
 * - Muestra negativo restante vs recuperado por venta (tope = deuda/pico).
 * - Si venta cubre el negativo: leyenda verde parpadeante; la alerta PERMANECE
 *   hasta que el cajero abone o liquide (cubre turno no ve esos botones).
 * - Admin / recolector: botón Pagaré.
 */
export default function CorteNegativoRecuperacion({
  etiqueta = 'corte',
  negativo = 0,
  recuperado = 0,
  deuda = 0,
  cajaActual = 0,
  visible = false,
  cubiertoPorVenta = false,
  pendienteCajaRecuperada = false,
  puedeAbonarLiquidar = false,
  puedeGenerarPagare = false,
  esCubreTurno = false,
  onAbonar,
  onLiquidar,
  onGenerarPagare,
  avisoEntregarTurno = false,
}) {
  const neg = Number(negativo) || 0;
  const rec = Number(recuperado) || 0;
  const deb = Number(deuda) || 0;
  const caja = Number(cajaActual) || 0;
  const cajaEnNegativo = caja < -0.001;
  const hayDeuda = deb > 0.001;
  const restante = Math.max(0, neg);
  const hayRestante = restante > 0.001;
  const recuperadoOk = cubiertoPorVenta
    || pendienteCajaRecuperada
    || (!hayRestante && rec > 0.001 && (hayDeuda || pendienteCajaRecuperada));

  if (!visible && !hayDeuda && !cajaEnNegativo && !pendienteCajaRecuperada) return null;

  let fase = 'critico';
  if (recuperadoOk) fase = 'leve';
  else if (rec > 0.001 && restante < 80) fase = 'leve';
  else if (rec > 0.001 && restante < 250) fase = 'medio';

  const montoNegativo = recuperadoOk
    ? 0
    : -Math.abs(hayRestante ? restante : (cajaEnNegativo ? Math.abs(caja) : 0));

  const mostrarAbono = puedeAbonarLiquidar && hayDeuda && hayRestante && typeof onAbonar === 'function';
  const mostrarLiquidar = puedeAbonarLiquidar
    && !hayRestante
    && (hayDeuda || pendienteCajaRecuperada)
    && typeof onLiquidar === 'function';

  return (
    <div
      className={`corte-negativo-recuperacion corte-negativo-recuperacion--${fase}${recuperadoOk ? ' corte-negativo-recuperacion--recuperado' : ''}`}
      role="alert"
      aria-live="polite"
    >
      <div className="corte-negativo-recuperacion__etiqueta">
        DINERO EN RECUPERACIÓN · {String(etiqueta).toUpperCase()}
        {hayDeuda || pendienteCajaRecuperada ? ' · PENDIENTE' : ''}
      </div>

      {avisoEntregarTurno && (
        <div className="corte-negativo-recuperacion__aviso-turno" role="status">
          Has recuperado deudas, favor de entregar al cerrar turno
        </div>
      )}

      <div className="corte-negativo-recuperacion__cifras">
        <div className="corte-negativo-recuperacion__cifra">
          <span className="corte-negativo-recuperacion__cifra-lbl">Negativo</span>
          <span className="corte-negativo-recuperacion__monto">{fmtCorte(montoNegativo)}</span>
        </div>
        <div className="corte-negativo-recuperacion__cifra">
          <span className="corte-negativo-recuperacion__cifra-lbl">Recuperado</span>
          <span
            className={`corte-negativo-recuperacion__monto corte-negativo-recuperacion__monto--ok${recuperadoOk ? ' corte-negativo-recuperacion__monto--parpadeo-verde' : ''}`}
          >
            {fmtCorte(rec)}
          </span>
        </div>
      </div>

      {recuperadoOk ? (
        <div className="corte-negativo-recuperacion__leyenda-recuperado">
          {esCubreTurno
            ? 'NEGATIVO RECUPERADO — EL CAJERO DEBE LIQUIDAR O ABONAR EN SU SESIÓN'
            : 'NEGATIVO RECUPERADO, FAVOR DE LIQUIDAR Y PAGAR PRÉSTAMO'}
        </div>
      ) : (
        <div className="corte-negativo-recuperacion__hint">
          {hayDeuda
            ? (rec > 0.001
              ? `Venta aplicada: recuperado ${fmtCorte(rec)} · resta ${fmtCorte(-restante)}`
              : 'Pendiente de recuperación — la venta del corte reduce el negativo')
            : cajaEnNegativo
              ? `Corte en negativo ${fmtCorte(caja)} — genera pagaré o recupera hasta $0.00`
              : 'Pendiente de recuperación'}
        </div>
      )}

      {esCubreTurno && (hayDeuda || pendienteCajaRecuperada || recuperadoOk) && (
        <div className="corte-negativo-recuperacion__aviso-cubre" role="status">
          Cubre turno: la alerta permanece visible. Solo el cajero puede abonar o liquidar.
        </div>
      )}

      <div className="corte-negativo-recuperacion__acciones">
        {mostrarAbono && (
          <button type="button" className="btn btn-ghost corte-negativo-recuperacion__btn" onClick={onAbonar}>
            Abono
          </button>
        )}
        {mostrarLiquidar && (
          <button type="button" className="btn btn-primary corte-negativo-recuperacion__btn" onClick={onLiquidar}>
            Liquidar
          </button>
        )}
        {puedeGenerarPagare && (hayDeuda || cajaEnNegativo) && typeof onGenerarPagare === 'function' && (
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
