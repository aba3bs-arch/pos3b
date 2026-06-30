export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function valorManual(estado, key, calculado) {
  const raw = estado?.[key];
  if (raw != null && raw !== '') return round2(raw);
  return calculado;
}

export function totalGastos(gastos = []) {
  return round2(
    (gastos || [])
      .filter((g) => {
        const est = g?.estado_aprobacion || 'aprobado';
        return est === 'aprobado';
      })
      .reduce((a, g) => a + (Number(g.monto) || 0), 0),
  );
}

/** Referencia del recolector (morado): fija hasta la próxima recolección; no cambia con los cierres de cajero. */
export function monedaRecolectorRef(estado) {
  return round2(estado?.moneda_inicial);
}

/**
 * Moneda con la que arranca este corte de cajero.
 * Tras recolección = moneda contada; tras cada cierre = moneda final del corte anterior.
 */
export function monedaInicialTurnoEfectiva(estado) {
  const raw = estado?.moneda_inicial_turno;
  if (raw != null && raw !== '') return round2(raw);
  return round2(estado?.moneda_inicial);
}

/** Tras cerrar turno: la moneda final pasa a ser la moneda inicial del siguiente corte. */
export function siguienteMonedaInicialTurnoVirtual(estado) {
  if (estado?.moneda_final_editada) return round2(estado.moneda_final);
  const mf = round2(estado?.moneda_final);
  if (mf > 0) return mf;
  return monedaInicialTurnoEfectiva(estado);
}

/** Asegura moneda_inicial_turno en datos guardados antes de la separación morado/corte. */
export function normalizarEstadoVirtual(estado = {}) {
  const e = { ...estadoDefault('virtual'), ...estado };
  const raw = e.moneda_inicial_turno;
  const sinTurnoExplicito =
    raw == null ||
    raw === '' ||
    (!e._mi_turno_inicializado && round2(raw) === 0 && round2(e.moneda_inicial) > 0);
  if (sinTurnoExplicito && round2(e.moneda_inicial) > 0) {
    e.moneda_inicial_turno = round2(e.moneda_inicial);
  }
  return e;
}

/** Corte virtual: venta efectivo = moneda inicial del corte − moneda final (si se capturó). */
export function ventasVirtualCorte(monedaInicial, monedaFinal, opts = {}) {
  const { capturada = false, monedaInicialTurno } = opts;
  if (!capturada) return 0;
  const mi = round2(monedaInicialTurno ?? monedaInicial);
  const mf = round2(monedaFinal);
  return round2(mi - mf);
}

export function calcularVirtual(estado, gastos = []) {
  const gastosTotal = totalGastos(gastos);
  const monedaTurno = monedaInicialTurnoEfectiva(estado);
  const ventaCalc = ventasVirtualCorte(estado.moneda_inicial, estado.moneda_final, {
    capturada: Boolean(estado.moneda_final_editada),
    monedaInicialTurno: monedaTurno,
  });
  const venta = valorManual(estado, 'venta_manual', ventaCalc);
  const subtotalCalc = round2(venta - gastosTotal);
  const subtotal = valorManual(estado, 'subtotal_manual', subtotalCalc);
  const cajaAnterior = round2(estado.caja_anterior);
  const cajaActualCalc = round2(cajaAnterior + subtotal);
  const cajaActual = valorManual(estado, 'caja_actual_manual', cajaActualCalc);
  const ventaNeta = round2(venta - gastosTotal);
  return { venta, gastosTotal, subtotal, ventaNeta, cajaActual, monedaTurno };
}

/** Caja en negativo: subtotal negativo o moneda final por encima de la moneda inicial (premios sin préstamo). */
export function cajaVirtualEnNegativo(estado, calc) {
  if ((calc?.cajaActual ?? 0) < -0.001) return true;
  if ((calc?.venta ?? 0) < -0.001) return true;
  if (!estado?.moneda_final_editada) return false;
  const mi = monedaInicialTurnoEfectiva(estado);
  const mf = round2(estado.moneda_final);
  return mf > mi + 0.001;
}

/** Total a recolectar al actualizar moneda: venta en efectivo + toda la caja chica. */
export function recoleccionTotalVirtual(estado, calc) {
  if (!estado?.moneda_final_editada) return 0;
  return round2((calc?.venta || 0) + (calc?.cajaActual || 0));
}

export function calcularAbarrotes(estado, gastos = []) {
  const gastosTotal = totalGastos(gastos);
  const venta = round2(estado.venta);
  const tarjeta = round2(estado.tarjeta);
  const faltante = round2(estado.faltante);
  const recoleccion = round2(estado.recoleccion);
  const cajaAnterior = round2(estado.caja_anterior);
  const subtotalCalc = round2(venta - gastosTotal - faltante - tarjeta);
  const subtotal = valorManual(estado, 'subtotal_manual', subtotalCalc);
  const cajaActualCalc = round2(venta + cajaAnterior - gastosTotal - recoleccion - faltante - tarjeta);
  const cajaActual = valorManual(estado, 'caja_actual_manual', cajaActualCalc);
  return { venta, gastosTotal, subtotal, cajaActual };
}

export function sumaMaquinasGarage(maquinas = {}) {
  return round2(Object.values(maquinas || {}).reduce((a, v) => a + (Number(v) || 0), 0));
}

/** Lectura del día: M1 + M2 + M3 + PIN1 + DSCH (contadores de máquinas). */
export const CLAVES_LECTURA_GARAGE = ['M1', 'M2', 'M3'];

export function sumaLecturaGarage(estado) {
  const m = estado?.maquinas || {};
  const maq = CLAVES_LECTURA_GARAGE.reduce((a, k) => a + (Number(m[k]) || 0), 0);
  return round2(maq + (Number(estado?.pin1) || 0) + (Number(estado?.dsch) || 0));
}

export function calcularGarage(estado, gastos = []) {
  const gastosTotal = totalGastos(gastos);
  const totalLectura = sumaLecturaGarage(estado);
  const lecturaAnterior = round2(estado.caja_anterior);
  const ventaCalc = round2(totalLectura - lecturaAnterior);
  const venta = valorManual(estado, 'venta_manual', ventaCalc);
  const subtotalCalc = round2(venta - gastosTotal);
  const subtotal = valorManual(estado, 'subtotal_manual', subtotalCalc);
  const recoleccion = round2(estado.recoleccion);
  const cajaActualCalc = round2(subtotal - recoleccion);
  const cajaActual = valorManual(estado, 'caja_actual_manual', cajaActualCalc);
  return {
    venta,
    gastosTotal,
    subtotal,
    ventaNeta: subtotal,
    totalLectura,
    lecturaAnterior,
    cajaActual,
  };
}

export const ESTADO_VIRTUAL_DEFAULT = {
  fondo: 0,
  moneda_inicial: 0,
  moneda_inicial_turno: null,
  moneda_final: 0,
  moneda_final_editada: false,
  caja_anterior: 0,
  recoleccion_turno: 0,
  recoleccion: 0,
  faltante: 0,
  comentarios: '',
  _mi_turno_inicializado: false,
};

export const ESTADO_ABARROTES_DEFAULT = {
  fondo_fijo: 0,
  caja_anterior: 0,
  venta: 0,
  tarjeta: 0,
  faltante: 0,
  recoleccion: 0,
  folio: 'AB-001',
  comentarios: '',
};

export function maquinasGarageDefault() {
  const m = {};
  for (let i = 1; i <= 8; i += 1) m[`M${i}`] = 0;
  return m;
}

export const ESTADO_GARAGE_DEFAULT = {
  maquinas: maquinasGarageDefault(),
  pin1: 0,
  pin2: 0,
  dsch: 0,
  caja_anterior: 0,
  recoleccion: 0,
  comentarios: '',
};

export function estadoDefault(modulo) {
  if (modulo === 'virtual') return { ...ESTADO_VIRTUAL_DEFAULT };
  if (modulo === 'abarrotes') return { ...ESTADO_ABARROTES_DEFAULT };
  if (modulo === 'garage') return { ...ESTADO_GARAGE_DEFAULT, maquinas: maquinasGarageDefault() };
  return {};
}
