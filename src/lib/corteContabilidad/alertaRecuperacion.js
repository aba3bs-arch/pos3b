/**
 * Pure helpers for the corte recovery alert (tested).
 * Negativo cubierto por venta permanece hasta que el cajero liquide/abone.
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * @param {{ deuda: number, venta: number, cajaActual: number, picoCaja?: number, cajaLiquidada?: boolean, esCubreTurno?: boolean }} opts
 */
export function calcularVistaAlertaRecuperacion(opts = {}) {
  const deuda = round2(opts.deuda);
  const venta = round2(Math.max(0, opts.venta));
  const caja = Number(opts.cajaActual);
  const negativoCaja = Number.isFinite(caja) && caja < -0.001 ? round2(Math.abs(caja)) : 0;
  const picoGuardado = round2(opts.picoCaja);
  const cajaLiquidada = Boolean(opts.cajaLiquidada);
  const picoCaja = round2(Math.max(picoGuardado, negativoCaja));
  const esCubreTurno = Boolean(opts.esCubreTurno);

  if (deuda > 0.001) {
    const recuperado = round2(Math.min(deuda, venta));
    const negativoRestante = round2(Math.max(0, deuda - recuperado));
    return {
      deuda,
      venta,
      recuperado,
      negativo: negativoRestante,
      negativoCaja,
      cubiertoPorVenta: negativoRestante < 0.001 && recuperado > 0.001,
      visible: true,
      pendienteCajaRecuperada: false,
      esCubreTurno,
      puedeAbonarLiquidar: !esCubreTurno,
    };
  }

  const recuperadoCaja = !cajaLiquidada && picoCaja > 0.001
    ? round2(Math.max(0, picoCaja - negativoCaja))
    : 0;
  const pendienteCajaRecuperada = !cajaLiquidada
    && picoCaja > 0.001
    && negativoCaja < 0.001
    && recuperadoCaja > 0.001;

  return {
    deuda: 0,
    venta,
    recuperado: recuperadoCaja,
    negativo: negativoCaja,
    negativoCaja,
    cubiertoPorVenta: pendienteCajaRecuperada,
    visible: (!cajaLiquidada && picoCaja > 0.001) || negativoCaja > 0.001,
    pendienteCajaRecuperada,
    esCubreTurno,
    puedeAbonarLiquidar: !esCubreTurno,
  };
}
