export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function valorManual(estado, key, calculado) {
  const raw = estado?.[key];
  if (raw != null && raw !== '') return round2(raw);
  return calculado;
}

export function totalGastos(gastos = []) {
  return round2((gastos || []).reduce((a, g) => a + (Number(g.monto) || 0), 0));
}

/** Referencia del recolector (morado): fija hasta la próxima recolección; no cambia con los cierres de cajero. */
export function monedaRecolectorRef(estado) {
  return round2(estado?.moneda_inicial);
}

/** Moneda con la que arranca este corte de cajero (cambia al cerrar: moneda final → siguiente inicio). */
export function monedaInicialTurnoEfectiva(estado) {
  const mit = estado?.moneda_inicial_turno;
  if (mit != null && mit !== '') return round2(mit);
  return round2(estado?.moneda_inicial);
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
  const faltante = round2(estado.faltante);
  const recoleccion = round2(estado.recoleccion ?? estado.recoleccion_turno);
  const subtotalCalc = round2(venta - gastosTotal - faltante);
  const subtotal = valorManual(estado, 'subtotal_manual', subtotalCalc);
  const cajaAnterior = round2(estado.caja_anterior);
  const cajaActualCalc = round2(cajaAnterior + subtotal);
  const cajaActual = valorManual(estado, 'caja_actual_manual', cajaActualCalc);
  return { venta, gastosTotal, subtotal, cajaActual };
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

export function calcularGarage(estado, gastos = []) {
  const gastosTotal = totalGastos(gastos);
  const ventaMaquinas = sumaMaquinasGarage(estado.maquinas);
  const ventaCalc = round2(ventaMaquinas + (Number(estado.pin1) || 0) + (Number(estado.pin2) || 0) + (Number(estado.dsch) || 0));
  const venta = valorManual(estado, 'venta_manual', ventaCalc);
  const cajaAnterior = round2(estado.caja_anterior);
  const recoleccion = round2(estado.recoleccion);
  const cajaActualCalc = round2(cajaAnterior + venta - gastosTotal - recoleccion);
  const cajaActual = valorManual(estado, 'caja_actual_manual', cajaActualCalc);
  return { venta, gastosTotal, cajaActual };
}

export const ESTADO_VIRTUAL_DEFAULT = {
  fondo: 0,
  moneda_inicial: 0,
  moneda_inicial_turno: 0,
  moneda_final: 0,
  moneda_final_editada: false,
  caja_anterior: 0,
  recoleccion_turno: 0,
  recoleccion: 0,
  faltante: 0,
  comentarios: '',
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
