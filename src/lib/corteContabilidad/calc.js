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

/** Asegura moneda_inicial_turno / base en datos guardados antes de la separación tope/corte. */
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
  if (
    (e.moneda_turno_base == null || e.moneda_turno_base === '') &&
    e.moneda_inicial_turno != null &&
    e.moneda_inicial_turno !== ''
  ) {
    e.moneda_turno_base = round2(e.moneda_inicial_turno);
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

/**
 * Virtual:
 * - moneda_inicial = tope/referencia de la operación (encabezado morado; no se autoinyecta)
 * - moneda_inicial_turno = moneda final del corte anterior (bloqueada; solo admin inyecta)
 * - venta = MI turno − MF
 * - subtotal = venta − gastos
 * - caja chica actual = caja chica anterior + subtotal
 * - faltante va en Gastos → nómina (no resta aquí)
 */
export function calcularVirtual(estado, gastos = []) {
  const gastosTotal = totalGastos(gastos);
  const mi = round2(estado.moneda_inicial_turno ?? estado.moneda_inicial);
  const mf = round2(estado.moneda_final);
  const capturada = Boolean(estado.moneda_final_editada) || mf > 0;
  const ventaCalc = capturada ? round2(mi - mf) : 0;
  const venta = valorManual(estado, 'venta_manual', ventaCalc);
  const fondo = round2(estado.fondo);
  const cajaAnterior = round2(estado.caja_anterior);
  const subtotalCalc = round2(venta - gastosTotal);
  const subtotal = valorManual(estado, 'subtotal_manual', subtotalCalc);
  const cajaActualCalc = round2(cajaAnterior + subtotal);
  const cajaActual = valorManual(estado, 'caja_actual_manual', cajaActualCalc);
  const recoleccion = round2(estado.recoleccion ?? estado.recoleccion_turno);
  const tope = round2(estado.moneda_inicial);
  const base = round2(
    estado.moneda_turno_base != null && estado.moneda_turno_base !== ''
      ? estado.moneda_turno_base
      : mi,
  );
  const inyectada = Boolean(estado.moneda_inyectada) || Math.abs(mi - base) > 0.001;
  const monedaInyectadaMonto = round2(
    estado.moneda_inyectada_monto != null && estado.moneda_inyectada_monto !== ''
      ? estado.moneda_inyectada_monto
      : mi - base,
  );
  return {
    venta,
    faltante: round2(estado.faltante),
    gastosTotal,
    subtotal,
    ventaNeta: venta,
    cajaAnterior,
    cajaActual,
    cajaChica: cajaActual,
    fondo,
    monedaTurno: mi,
    monedaOperacion: tope,
    monedaTurnoBase: base,
    monedaInyectada: inyectada,
    monedaInyectadaMonto,
    recoleccion,
    recoleccionSugerida: 0,
    recoleccionCalc: 0,
    total: subtotal,
    monedaTope: tope,
    // Ya no se autoinyecta tope − MF; la inyección es manual del admin.
    monedaInyectar: 0,
  };
}

/** Caja en negativo: venta/subtotal/caja actuales negativos o MF > MI del corte. */
export function cajaVirtualEnNegativo(estado, calc) {
  if ((calc?.cajaActual ?? 0) < -0.001) return true;
  if ((calc?.subtotal ?? 0) < -0.001) return true;
  if ((calc?.venta ?? 0) < -0.001) return true;
  if (!estado?.moneda_final_editada && !(round2(estado?.moneda_final) > 0)) return false;
  const mi = monedaInicialTurnoEfectiva(estado);
  const mf = round2(estado.moneda_final);
  return mf > mi + 0.001;
}

/** Caja chica del corte = anterior + subtotal. */
export function cajaChicaAcumulada(estado, calc) {
  return round2(calc?.cajaActual ?? round2(estado?.caja_anterior) + round2(calc?.subtotal));
}

/** Tope / referencia de la operación (encabezado). No se autoinyecta. */
export function monedaTopeVirtual(estado) {
  return round2(estado?.moneda_inicial);
}

/** @deprecated La inyección es manual del admin sobre moneda_inicial_turno. */
export function monedaAInyectarVirtual(_estado, _monedaFinal) {
  return 0;
}

/** Moneda que queda en portal tras recolección = MF del corte (no el tope). */
export function monedaTrasRecoleccionVirtual(estado) {
  const mf = round2(estado?.moneda_final);
  if (estado?.moneda_final_editada || mf > 0) return mf;
  return monedaInicialTurnoEfectiva(estado);
}

/**
 * Tras recolección:
 * - caja chica → 0
 * - fondo y tope de operación se conservan (referencia)
 * - MI del próximo corte = moneda final (NO se restablece al tope)
 */
export function prepararTrasRecoleccionVirtual(estado) {
  const tope = monedaTopeVirtual(estado);
  const miSiguiente = monedaTrasRecoleccionVirtual(estado);
  return {
    ...estado,
    fondo: round2(estado.fondo),
    caja_anterior: 0,
    moneda_inicial: tope > 0 ? tope : round2(estado.moneda_inicial),
    moneda_inicial_turno: miSiguiente,
    moneda_turno_base: miSiguiente,
    moneda_inyectada: false,
    moneda_inyectada_monto: 0,
    moneda_final: 0,
    moneda_final_editada: false,
    precoleccion: 0,
    _precoleccion_editada: false,
    recoleccion: 0,
    recoleccion_turno: 0,
    faltante: 0,
    comentarios: '',
    venta_manual: '',
    subtotal_manual: '',
    caja_actual_manual: '',
    corte_reabierto_id: null,
    _mi_turno_inicializado: true,
  };
}

/** Tras cerrar corte: MI siguiente = MF; caja chica = anterior + subtotal. */
export function prepararTrasCierreVirtual(estado, calc) {
  const turnoSiguiente = siguienteMonedaInicialTurnoVirtual(estado);
  const cajaNueva = round2(
    calc?.cajaActual ?? round2(estado.caja_anterior) + round2(calc?.subtotal),
  );
  return {
    ...estado,
    fondo: round2(estado.fondo),
    caja_anterior: cajaNueva,
    moneda_final: 0,
    moneda_final_editada: false,
    moneda_inicial: round2(estado.moneda_inicial),
    moneda_inicial_turno: turnoSiguiente,
    moneda_turno_base: turnoSiguiente,
    moneda_inyectada: false,
    moneda_inyectada_monto: 0,
    recoleccion_turno: 0,
    recoleccion: 0,
    faltante: 0,
    comentarios: '',
    venta_manual: '',
    subtotal_manual: '',
    caja_actual_manual: '',
    _mi_turno_inicializado: true,
  };
}

/** Admin inyecta moneda al portal: actualiza MI del corte y marca aviso visual. */
export function aplicarInyeccionMonedaVirtual(estado, nuevaMi) {
  const base = round2(
    estado.moneda_turno_base != null && estado.moneda_turno_base !== ''
      ? estado.moneda_turno_base
      : estado.moneda_inicial_turno ?? estado.moneda_inicial,
  );
  const mi = round2(nuevaMi);
  const diff = round2(mi - base);
  const inyectada = Math.abs(diff) > 0.001;
  return {
    moneda_inicial_turno: mi,
    moneda_turno_base: base,
    moneda_inyectada: inyectada,
    moneda_inyectada_monto: inyectada ? diff : 0,
    _mi_turno_inicializado: true,
  };
}

/** @deprecated La recolección es captura manual; se conserva por compatibilidad. */
export function recoleccionVirtualExcel(_estado, _calc) {
  return 0;
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

/** Venta actual garage: M1…M7 + PIN1 + PIN2 + DSCH. */
export const CLAVES_LECTURA_GARAGE = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'];

export function sumaLecturaGarage(estado) {
  const m = estado?.maquinas || {};
  const maq = CLAVES_LECTURA_GARAGE.reduce((a, k) => a + (Number(m[k]) || 0), 0);
  return round2(
    maq + (Number(estado?.pin1) || 0) + (Number(estado?.pin2) || 0) + (Number(estado?.dsch) || 0),
  );
}

/**
 * Garage:
 * venta actual = M1…M7 + PIN1 + PIN2 + DSCH
 * venta neta = venta actual − gastos
 * saldo caja = venta neta − recolección
 */
export function calcularGarage(estado, gastos = []) {
  const gastosTotal = totalGastos(gastos);
  const ventaCalc = sumaLecturaGarage(estado);
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
    totalLectura: ventaCalc,
    lecturaAnterior: 0,
    cajaActual,
  };
}

export const ESTADO_VIRTUAL_DEFAULT = {
  fondo: 0,
  moneda_inicial: 0,
  moneda_inicial_turno: null,
  moneda_turno_base: null,
  moneda_inyectada: false,
  moneda_inyectada_monto: 0,
  moneda_final: 0,
  moneda_final_editada: false,
  caja_anterior: 0,
  recoleccion_turno: 0,
  recoleccion: 0,
  faltante: 0,
  comentarios: '',
  precoleccion: 0,
  _precoleccion_editada: false,
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
  for (let i = 1; i <= 7; i += 1) m[`M${i}`] = 0;
  return m;
}

export const ESTADO_GARAGE_DEFAULT = {
  maquinas: maquinasGarageDefault(),
  pin1: 0,
  pin2: 0,
  dsch: 0,
  recoleccion: 0,
  comentarios: '',
};

export function estadoDefault(modulo) {
  if (modulo === 'virtual') return { ...ESTADO_VIRTUAL_DEFAULT };
  if (modulo === 'abarrotes') return { ...ESTADO_ABARROTES_DEFAULT };
  if (modulo === 'garage') return { ...ESTADO_GARAGE_DEFAULT, maquinas: maquinasGarageDefault() };
  return {};
}
