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

/**
 * Monto de recolección que debe ir a contabilidad / IE:
 * efectivo retirado + gastos del periodo (sin descontar gastos aquí).
 * Los gastos se restan una sola vez como egresos en IE Virtual / IE Abarrotes.
 */
export function montoRecoleccionParaContabilidad(detalle = {}) {
  const d = detalle || {};
  if (d.recoleccion_contabilidad != null && d.recoleccion_contabilidad !== '') {
    return round2(d.recoleccion_contabilidad);
  }
  const efectivo = round2(d.recoleccion ?? d.recoleccion_turno ?? 0);
  const gastos = round2(d.gastos_total ?? 0);
  return round2(efectivo + gastos);
}

/** Campos a guardar en el detalle de una recolección para IE (evita doble descuento). */
export function detalleRecoleccionParaIe({ efectivo, gastosTotal, extras = {} }) {
  const rec = round2(efectivo);
  const gastos = round2(gastosTotal);
  return {
    ...extras,
    recoleccion: rec,
    recoleccion_turno: rec,
    recoleccion_efectivo: rec,
    gastos_total: gastos,
    recoleccion_contabilidad: round2(rec + gastos),
    formula_recoleccion_ie: 'efectivo_mas_gastos',
    gastos_deducidos_en_ie: true,
  };
}

/**
 * Gastos del periodo desde la última recolección (cierres de turno + abiertos actuales).
 * Sirve para mandar la recolección bruta a IE sin descontar gastos dos veces.
 */
export function gastosPeriodoDesdeUltimaRecoleccion(historial = [], gastosAbiertosTotal = 0) {
  let sum = round2(gastosAbiertosTotal);
  const lista = [...(historial || [])].sort((a, b) => {
    const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
  for (const h of lista) {
    const tipo = String(h?.detalle?.tipo_cierre || h?.turno || '').toLowerCase();
    if (tipo === 'recoleccion') break;
    sum = round2(sum + (Number(h?.detalle?.gastos_total) || 0));
  }
  return sum;
}

/** IDs de gastos del periodo (abiertos + embebidos en cierres) desde la última recolección. */
export function gastosIdsDesdeUltimaRecoleccion(historial = [], gastosAbiertos = []) {
  return gastosListaDesdeUltimaRecoleccion(historial, gastosAbiertos)
    .map((g) => (g?.id != null && g.id !== '' ? String(g.id) : null))
    .filter(Boolean);
}

/**
 * Lista de gastos del periodo (cierres desde la última recolección + abiertos actuales).
 * Para ticket de recolección e IE.
 */
function esCierreRecoleccion(h) {
  const tipo = String(h?.detalle?.tipo_cierre || '').toLowerCase();
  if (tipo === 'recoleccion' || tipo === 'recoleccion_temporal') return true;
  const turno = String(h?.turno || '').toUpperCase();
  return !tipo && turno.includes('RECOLEC');
}

/**
 * Lista de gastos del periodo (cierres desde la última recolección + abiertos actuales).
 * Para ticket de recolección e IE. Cada gasto lleva metadatos de su corte.
 */
export function gastosListaDesdeUltimaRecoleccion(historial = [], gastosAbiertos = [], opts = {}) {
  const porId = new Map();
  const push = (g, meta = {}) => {
    if (!g) return;
    const row = {
      ...g,
      _corte_folio: meta.folio ?? g._corte_folio ?? null,
      _corte_turno: meta.turno ?? g._corte_turno ?? null,
      _corte_usuario: meta.usuario ?? g._corte_usuario ?? null,
      _corte_fecha: meta.fecha ?? g._corte_fecha ?? null,
      solicitado_por: g.solicitado_por || meta.usuario || g.usuario_nombre || null,
    };
    const id = row.id != null && row.id !== '' ? String(row.id) : null;
    if (id) {
      if (!porId.has(id)) porId.set(id, row);
      return;
    }
    const key = `tmp:${row.created_at || ''}|${row.monto}|${row.categoria}|${row.comentario || ''}|${row.usuario_nombre || ''}|${row._corte_folio || ''}`;
    if (!porId.has(key)) porId.set(key, row);
  };

  const folioAbierto = opts.folioAbierto || 'ABIERTO';
  const turnoAbierto = opts.turnoAbierto || 'Corte actual';
  for (const g of gastosAbiertos || []) {
    push(g, {
      folio: folioAbierto,
      turno: turnoAbierto,
      usuario: opts.usuarioAbierto || g.solicitado_por || g.usuario_nombre || null,
      fecha: g.created_at || null,
    });
  }

  const lista = [...(historial || [])].sort((a, b) => {
    const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
  for (const h of lista) {
    if (esCierreRecoleccion(h)) break;
    const meta = {
      folio: h.folio || '—',
      turno: h.turno || h.detalle?.turno_sesion || '—',
      usuario: h.usuario_nombre || null,
      fecha: h.created_at || null,
    };
    const embebidos = h?.detalle?.gastos;
    if (Array.isArray(embebidos) && embebidos.length) {
      for (const g of embebidos) push(g, meta);
    }
  }
  return [...porId.values()];
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
 * - moneda_inicial = tope/referencia de la operación (encabezado morado)
 * - moneda_inicial_turno = MI del corte (tras cierre = MF anterior; tras recolección = tope con inyección)
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
  const monedaInyectar = estado._post_recoleccion
    ? 0
    : round2(Math.max(0, tope - (capturada ? mf : 0)));
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
    monedaInyectar,
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

/** Tope / referencia de la operación (encabezado). */
export function monedaTopeVirtual(estado) {
  return round2(estado?.moneda_inicial);
}

/** Monto a inyectar al portal en recolección: tope − MF (si tope > MF). */
export function monedaAInyectarVirtual(estado, monedaFinal) {
  const tope = monedaTopeVirtual(estado);
  let mf;
  if (monedaFinal != null && monedaFinal !== '') {
    mf = round2(monedaFinal);
  } else if (estado?.moneda_final_editada || round2(estado?.moneda_final) > 0) {
    mf = round2(estado.moneda_final);
  } else {
    mf = monedaInicialTurnoEfectiva(estado);
  }
  if (!(tope > 0)) return 0;
  return round2(Math.max(0, tope - mf));
}

/** Efectivo físico que queda en portal al recolectar (= MF capturada). */
export function monedaTrasRecoleccionVirtual(estado) {
  const mf = round2(estado?.moneda_final);
  if (estado?.moneda_final_editada || mf > 0) return mf;
  return monedaInicialTurnoEfectiva(estado);
}

/**
 * Tras recolección:
 * - caja chica → 0
 * - tope de operación se conserva
 * - se inyecta (tope − MF) para que MI del próximo corte = tope
 * - base = MF (efectivo real); la diferencia queda marcada como inyección
 * - _post_recoleccion: al cambiar el tope, la MI sigue al tope
 */
export function prepararTrasRecoleccionVirtual(estado) {
  const tope = monedaTopeVirtual(estado);
  const mf = monedaTrasRecoleccionVirtual(estado);
  const miSiguiente = tope > 0 ? tope : mf;
  const inyectar = round2(miSiguiente - mf);
  const hayInyeccion = Math.abs(inyectar) > 0.001;
  return {
    ...estado,
    fondo: round2(estado.fondo),
    caja_anterior: 0,
    moneda_inicial: tope > 0 ? tope : round2(estado.moneda_inicial),
    moneda_inicial_turno: miSiguiente,
    moneda_turno_base: mf,
    moneda_inyectada: hayInyeccion,
    moneda_inyectada_monto: hayInyeccion ? inyectar : 0,
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
    _post_recoleccion: true,
    turno_sesion: null,
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
    _post_recoleccion: false,
    turno_sesion: null,
  };
}

/**
 * Solo tras recolección: al cambiar el tope de referencia, la MI del corte
 * se iguala al nuevo tope (inyectando la diferencia respecto a la base física).
 */
export function aplicarCambioTopePostRecoleccionVirtual(estado, nuevoTope) {
  const tope = round2(nuevoTope);
  const base = round2(
    estado.moneda_turno_base != null && estado.moneda_turno_base !== ''
      ? estado.moneda_turno_base
      : estado.moneda_inicial_turno ?? 0,
  );
  const diff = round2(tope - base);
  const inyectada = Math.abs(diff) > 0.001;
  return {
    moneda_inicial: tope,
    moneda_inicial_turno: tope,
    moneda_turno_base: base,
    moneda_inyectada: inyectada,
    moneda_inyectada_monto: inyectada ? diff : 0,
    _post_recoleccion: true,
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
 * saldo caja = venta neta − recolección − recolección anterior
 *
 * Si el recolector retira efectivo pero NO puede poner las máquinas en ceros,
 * esa recolección se arrastra en `recoleccion_anterior` hasta el reinicio real.
 */
export function calcularGarage(estado, gastos = []) {
  const gastosTotal = totalGastos(gastos);
  const ventaCalc = sumaLecturaGarage(estado);
  const venta = valorManual(estado, 'venta_manual', ventaCalc);
  const subtotalCalc = round2(venta - gastosTotal);
  const subtotal = valorManual(estado, 'subtotal_manual', subtotalCalc);
  const recoleccion = round2(estado.recoleccion);
  const recoleccionAnterior = round2(estado.recoleccion_anterior);
  const recoleccionTotal = round2(recoleccion + recoleccionAnterior);
  const cajaActualCalc = round2(subtotal - recoleccionTotal);
  const cajaActual = valorManual(estado, 'caja_actual_manual', cajaActualCalc);
  return {
    venta,
    gastosTotal,
    subtotal,
    ventaNeta: subtotal,
    totalLectura: ventaCalc,
    lecturaAnterior: 0,
    recoleccion,
    recoleccionAnterior,
    recoleccionTotal,
    cajaActual,
  };
}

/**
 * Tras cerrar corte garage.
 * Conserva `recoleccion_anterior` (si había monto en Recolección sin generar archivo, se suma ahí).
 * Lecturas en ceros para el siguiente turno.
 */
export function prepararTrasCierreGarage(estado, _calc, _opts = {}) {
  const rec = round2(estado?.recoleccion);
  const ant = round2(estado?.recoleccion_anterior);
  return {
    ...estado,
    maquinas: maquinasGarageDefault(),
    pin1: 0,
    pin2: 0,
    dsch: 0,
    recoleccion: 0,
    recoleccion_anterior: round2(ant + rec),
    comentarios: '',
  };
}

/**
 * Tras generar recolección garage.
 * - Máquinas en ceros (sí) → limpia recolección, anterior, gastos (vía store) y comentarios; archivo definitivo → IE.
 * - No en ceros → monto pasa a recolección anterior; lecturas a cero; gastos siguen abiertos; sin IE.
 */
export function prepararTrasRecoleccionGarage(estado, _calc, opts = {}) {
  const maquinasEnCero = opts.maquinasEnCero === true;
  const monto = round2(opts.montoRecoleccion ?? estado?.recoleccion);
  const ant = round2(estado?.recoleccion_anterior);
  return {
    ...estado,
    maquinas: maquinasGarageDefault(),
    pin1: 0,
    pin2: 0,
    dsch: 0,
    recoleccion: 0,
    recoleccion_anterior: maquinasEnCero ? 0 : round2(ant + monto),
    comentarios: maquinasEnCero ? '' : (estado?.comentarios || ''),
  };
}

/** Pasa la recolección del turno a “recolección anterior” (sin cerrar ni reiniciar máquinas). */
export function pasarRecoleccionAAnteriorGarage(estado) {
  const rec = round2(estado?.recoleccion);
  const ant = round2(estado?.recoleccion_anterior);
  if (!(rec > 0)) return { ok: false, error: 'Indica un monto en Recolección primero.', estado };
  return {
    ok: true,
    estado: {
      ...estado,
      recoleccion: 0,
      recoleccion_anterior: round2(ant + rec),
    },
    montoPasado: rec,
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
  _post_recoleccion: false,
  turno_sesion: null,
};

export const ESTADO_ABARROTES_DEFAULT = {
  fondo_fijo: 0,
  caja_anterior: 0,
  venta: 0,
  tarjeta: 0,
  faltante: 0,
  recoleccion: 0,
  folio: '',
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
  /** Recolecciones hechas sin reiniciar máquinas; se arrastra hasta ceros. */
  recoleccion_anterior: 0,
  comentarios: '',
};

export function estadoDefault(modulo) {
  if (modulo === 'virtual') return { ...ESTADO_VIRTUAL_DEFAULT };
  if (modulo === 'abarrotes') return { ...ESTADO_ABARROTES_DEFAULT };
  if (modulo === 'garage') return { ...ESTADO_GARAGE_DEFAULT, maquinas: maquinasGarageDefault() };
  return {};
}
