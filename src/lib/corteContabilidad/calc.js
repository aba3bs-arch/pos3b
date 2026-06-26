export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function totalGastos(gastos = []) {
  return round2((gastos || []).reduce((a, g) => a + (Number(g.monto) || 0), 0));
}

/** Corte virtual: venta = moneda inicial turno − moneda final (si se capturó). */
export function ventasVirtualCorte(monedaInicial, monedaFinal, opts = {}) {
  const { capturada = false, monedaInicialTurno } = opts;
  if (!capturada) return 0;
  const mi = round2(monedaInicialTurno ?? monedaInicial);
  const mf = round2(monedaFinal);
  return round2(mi - mf);
}

export function calcularVirtual(estado, gastos = []) {
  const gastosTotal = totalGastos(gastos);
  const venta = ventasVirtualCorte(estado.moneda_inicial, estado.moneda_final, {
    capturada: Boolean(estado.moneda_final_editada),
    monedaInicialTurno: estado.moneda_inicial_turno ?? estado.moneda_inicial,
  });
  const faltante = round2(estado.faltante);
  const recoleccion = round2(estado.recoleccion ?? estado.recoleccion_turno);
  const subtotal = round2(venta - gastosTotal - faltante);
  const cajaAnterior = round2(estado.caja_anterior);
  const cajaActual = round2(subtotal + cajaAnterior - recoleccion);
  return { venta, gastosTotal, subtotal, cajaActual };
}

export function calcularAbarrotes(estado, gastos = []) {
  const gastosTotal = totalGastos(gastos);
  const venta = round2(estado.venta);
  const tarjeta = round2(estado.tarjeta);
  const faltante = round2(estado.faltante);
  const recoleccion = round2(estado.recoleccion);
  const cajaAnterior = round2(estado.caja_anterior);
  const subtotal = round2(venta - gastosTotal - faltante - tarjeta);
  const cajaActual = round2(venta + cajaAnterior - gastosTotal - recoleccion - faltante - tarjeta);
  return { venta, gastosTotal, subtotal, cajaActual };
}

export function sumaMaquinasGarage(maquinas = {}) {
  return round2(Object.values(maquinas || {}).reduce((a, v) => a + (Number(v) || 0), 0));
}

export function calcularGarage(estado, gastos = []) {
  const gastosTotal = totalGastos(gastos);
  const ventaMaquinas = sumaMaquinasGarage(estado.maquinas);
  const venta = round2(ventaMaquinas + (Number(estado.pin1) || 0) + (Number(estado.pin2) || 0) + (Number(estado.dsch) || 0));
  const cajaAnterior = round2(estado.caja_anterior);
  const recoleccion = round2(estado.recoleccion);
  const cajaActual = round2(cajaAnterior + venta - gastosTotal - recoleccion);
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
