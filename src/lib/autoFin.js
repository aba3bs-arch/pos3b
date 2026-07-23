/**
 * Auto Fin — planes (semanal / quincenal / mensual) con o sin interés.
 * Tipos: vehiculo (precio + enganche) | prestamo (monto a financiar en cuotas).
 */

export const AVISO_FALTA_AUTO_FIN =
  'Ejecuta supabase/fix_auto_fin.sql y supabase/fix_auto_fin_prestamos.sql en Supabase para Auto Fin.';

export const TIPOS_AUTO_FIN = [
  { id: 'vehiculo', label: 'Vehículo / autofinanciamiento' },
  { id: 'prestamo', label: 'Préstamo' },
];

export const FRECUENCIAS_AUTO_FIN = [
  { id: 'semanal', label: 'Semanal', dias: 7 },
  { id: 'quincenal', label: 'Quincenal', dias: 15 },
  { id: 'mensual', label: 'Mensual', dias: 30 },
];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function faltaTabla(error) {
  const msg = String(error?.message || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('auto_fin') || (msg.includes('schema cache') && msg.includes('auto_fin'));
}

function faltaColumnaTipo(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('tipo') || msg.includes('beneficiario') || msg.includes('empleado_') || msg.includes('prestamo_id');
}

function toYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

function addMonths(ymd, months) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return toYmd(d);
}

export function etiquetaFrecuencia(id) {
  return FRECUENCIAS_AUTO_FIN.find((f) => f.id === id)?.label || id;
}

export function etiquetaTipoAutoFin(id) {
  return TIPOS_AUTO_FIN.find((t) => t.id === id)?.label || id || 'Vehículo';
}

export function esCreditoPrestamo(credito) {
  return String(credito?.tipo || 'vehiculo').toLowerCase() === 'prestamo';
}

/**
 * Calcula el plan de cuotas.
 * precio = precio vehículo o monto del préstamo.
 */
export function calcularPlanAutoFin({
  precio,
  enganche,
  frecuencia = 'semanal',
  numCuotas = 1,
  conInteres = false,
  tasaInteres = 0,
  fechaInicio,
} = {}) {
  const precioN = round2(precio);
  const engancheN = round2(Math.max(0, enganche));
  const n = Math.max(1, Math.floor(Number(numCuotas) || 1));
  const montoFinanciar = round2(Math.max(0, precioN - engancheN));
  const tasa = conInteres ? Math.max(0, Number(tasaInteres) || 0) : 0;
  const interesTotal = conInteres ? round2(montoFinanciar * (tasa / 100)) : 0;
  const totalPagar = round2(montoFinanciar + interesTotal);

  const cuotaBase = n > 0 ? round2(totalPagar / n) : 0;
  const capitalBase = n > 0 ? round2(montoFinanciar / n) : 0;
  const interesBase = n > 0 ? round2(interesTotal / n) : 0;

  const inicio = String(fechaInicio || toYmd(new Date())).slice(0, 10);
  const freq = FRECUENCIAS_AUTO_FIN.find((f) => f.id === frecuencia) || FRECUENCIAS_AUTO_FIN[0];

  const cuotas = [];
  let acumCapital = 0;
  let acumInteres = 0;
  let acumMonto = 0;

  for (let i = 1; i <= n; i += 1) {
    let fecha;
    if (freq.id === 'mensual') fecha = addMonths(inicio, i);
    else fecha = addDays(inicio, freq.dias * i);

    let capital = capitalBase;
    let interes = interesBase;
    let monto = cuotaBase;

    if (i === n) {
      capital = round2(montoFinanciar - acumCapital);
      interes = round2(interesTotal - acumInteres);
      monto = round2(totalPagar - acumMonto);
    }

    acumCapital = round2(acumCapital + capital);
    acumInteres = round2(acumInteres + interes);
    acumMonto = round2(acumMonto + monto);

    cuotas.push({
      numero: i,
      fecha_vencimiento: fecha,
      monto,
      capital,
      interes,
      pagado: 0,
      estado: 'pendiente',
    });
  }

  return {
    precio: precioN,
    enganche: engancheN,
    monto_financiar: montoFinanciar,
    frecuencia: freq.id,
    num_cuotas: n,
    con_interes: Boolean(conInteres) && tasa > 0,
    tasa_interes: tasa,
    interes_total: interesTotal,
    total_pagar: totalPagar,
    cuota_monto: cuotaBase,
    fecha_inicio: inicio,
    cuotas,
  };
}

export async function listarCreditosAutoFin(supabase, { estado, tipo } = {}) {
  if (!supabase) return { data: [], aviso: AVISO_FALTA_AUTO_FIN };
  let q = supabase.from('auto_fin_creditos').select('*').order('created_at', { ascending: false }).limit(500);
  if (estado) q = q.eq('estado', estado);
  if (tipo) q = q.eq('tipo', tipo);
  const { data, error } = await q;
  if (error && faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_AUTO_FIN };
  if (error && tipo && faltaColumnaTipo(error)) {
    return listarCreditosAutoFin(supabase, { estado });
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function listarPrestamosActivosParaFinanciar(supabase, { sucursal } = {}) {
  if (!supabase) return { data: [], error: null };
  let q = supabase
    .from('prestamos')
    .select('id, sucursal_id, usuario_id, nombre_empleado, monto_original, saldo, cuota_semanal, estado, fecha')
    .eq('estado', 'activo')
    .gt('saldo', 0)
    .order('fecha', { ascending: false })
    .limit(200);
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: data || [], error: null };
}

export async function obtenerCreditoAutoFin(supabase, id) {
  if (!supabase || !id) return { ok: false, error: 'Sin crédito.' };
  const { data: credito, error } = await supabase.from('auto_fin_creditos').select('*').eq('id', id).maybeSingle();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_AUTO_FIN, aviso: AVISO_FALTA_AUTO_FIN };
  if (error) return { ok: false, error: error.message };
  if (!credito) return { ok: false, error: 'Crédito no encontrado.' };

  const { data: cuotas, error: e2 } = await supabase
    .from('auto_fin_cuotas')
    .select('*')
    .eq('credito_id', id)
    .order('numero');
  if (e2) return { ok: false, error: e2.message };

  const { data: pagos, error: e3 } = await supabase
    .from('auto_fin_pagos')
    .select('*')
    .eq('credito_id', id)
    .order('fecha', { ascending: false })
    .limit(200);
  if (e3) return { ok: false, error: e3.message };

  const lista = cuotas || [];
  const saldo = round2(lista.reduce((s, c) => s + Math.max(0, round2(c.monto) - round2(c.pagado)), 0));
  const pagadoTotal = round2(lista.reduce((s, c) => s + round2(c.pagado), 0));

  return {
    ok: true,
    credito,
    cuotas: lista,
    pagos: pagos || [],
    saldo,
    pagadoTotal,
  };
}

export async function crearCreditoAutoFin(supabase, input, usuarioNombre) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const tipo = String(input.tipo || 'vehiculo').toLowerCase() === 'prestamo' ? 'prestamo' : 'vehiculo';
  const beneficiarioTipo =
    String(input.beneficiario_tipo || (tipo === 'prestamo' ? 'empleado' : 'cliente')).toLowerCase() === 'empleado'
      ? 'empleado'
      : 'cliente';

  const nombre = String(
    beneficiarioTipo === 'empleado'
      ? input.empleado_nombre || input.cliente_nombre || ''
      : input.cliente_nombre || '',
  ).trim();
  if (!nombre) {
    return {
      ok: false,
      error: beneficiarioTipo === 'empleado' ? 'Indica el empleado.' : 'Indica el cliente.',
    };
  }

  const montoLabel = tipo === 'prestamo' ? 'monto del préstamo' : 'precio del vehículo / plan';
  if (!(Number(input.precio) > 0)) return { ok: false, error: `Indica el ${montoLabel}.` };
  if (!(Number(input.num_cuotas) > 0)) return { ok: false, error: 'Indica el número de cuotas.' };

  const plan = calcularPlanAutoFin({
    precio: input.precio,
    enganche: Number(input.enganche) || 0,
    frecuencia: input.frecuencia,
    numCuotas: input.num_cuotas,
    conInteres: input.con_interes,
    tasaInteres: input.tasa_interes,
    fechaInicio: input.fecha_inicio,
  });

  if (plan.monto_financiar <= 0) {
    return { ok: false, error: 'No queda saldo a financiar. Revisa monto y enganche.' };
  }

  const descripcionDefault = tipo === 'prestamo' ? `Préstamo · ${nombre}` : null;

  const rowBase = {
    sucursal_id: input.sucursal_id || 'MAIN',
    cliente_id: beneficiarioTipo === 'cliente' ? input.cliente_id || null : null,
    cliente_nombre: nombre,
    cliente_telefono: String(input.cliente_telefono || '').trim() || null,
    descripcion: String(input.descripcion || '').trim() || descripcionDefault,
    precio: plan.precio,
    enganche: plan.enganche,
    monto_financiar: plan.monto_financiar,
    frecuencia: plan.frecuencia,
    num_cuotas: plan.num_cuotas,
    con_interes: plan.con_interes,
    tasa_interes: plan.tasa_interes,
    interes_total: plan.interes_total,
    total_pagar: plan.total_pagar,
    cuota_monto: plan.cuota_monto,
    fecha_inicio: plan.fecha_inicio,
    estado: 'activo',
    notas: String(input.notas || '').trim() || null,
    usuario_nombre: usuarioNombre || null,
  };

  const rowConTipo = {
    ...rowBase,
    tipo,
    beneficiario_tipo: beneficiarioTipo,
    empleado_id: beneficiarioTipo === 'empleado' ? input.empleado_id || null : null,
    empleado_nombre: beneficiarioTipo === 'empleado' ? nombre : null,
    prestamo_id: input.prestamo_id || null,
  };

  let { data: credito, error } = await supabase.from('auto_fin_creditos').insert([rowConTipo]).select('*').single();

  if (error && faltaColumnaTipo(error)) {
    ({ data: credito, error } = await supabase.from('auto_fin_creditos').insert([rowBase]).select('*').single());
  }

  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_AUTO_FIN, aviso: AVISO_FALTA_AUTO_FIN };
    return { ok: false, error: error.message };
  }

  const cuotasRows = plan.cuotas.map((c) => ({
    credito_id: credito.id,
    numero: c.numero,
    fecha_vencimiento: c.fecha_vencimiento,
    monto: c.monto,
    capital: c.capital,
    interes: c.interes,
    pagado: 0,
    estado: 'pendiente',
  }));

  const { error: e2 } = await supabase.from('auto_fin_cuotas').insert(cuotasRows);
  if (e2) {
    await supabase.from('auto_fin_creditos').delete().eq('id', credito.id);
    return { ok: false, error: e2.message };
  }

  if (input.prestamo_id) {
    try {
      await supabase
        .from('prestamos')
        .update({
          notas: `Financiado en Auto Fin (${credito.id}). Cobros por cuotas Auto Fin.`,
        })
        .eq('id', input.prestamo_id);
    } catch {
      /* ignore */
    }
  }

  return { ok: true, credito, plan };
}

export async function registrarPagoAutoFin(supabase, { creditoId, cuotaId, monto, fecha, metodo, nota, usuarioNombre }) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const m = round2(monto);
  if (!(m > 0)) return { ok: false, error: 'Monto inválido.' };
  if (!creditoId) return { ok: false, error: 'Crédito inválido.' };

  const { data: cuota, error: eC } = await supabase.from('auto_fin_cuotas').select('*').eq('id', cuotaId).maybeSingle();
  if (eC) return { ok: false, error: eC.message };
  if (!cuota || cuota.credito_id !== creditoId) return { ok: false, error: 'Cuota no encontrada.' };

  const pendiente = round2(Math.max(0, round2(cuota.monto) - round2(cuota.pagado)));
  if (!(pendiente > 0)) return { ok: false, error: 'Esa cuota ya está pagada.' };
  const aplica = round2(Math.min(m, pendiente));
  const nuevoPagado = round2(round2(cuota.pagado) + aplica);
  const estadoCuota = nuevoPagado + 0.001 >= round2(cuota.monto) ? 'pagada' : 'parcial';

  const { error: eP } = await supabase.from('auto_fin_pagos').insert([
    {
      credito_id: creditoId,
      cuota_id: cuotaId,
      fecha: String(fecha || toYmd(new Date())).slice(0, 10),
      monto: aplica,
      metodo: String(metodo || '').trim() || null,
      nota: String(nota || '').trim() || null,
      usuario_nombre: usuarioNombre || null,
    },
  ]);
  if (eP) {
    if (faltaTabla(eP)) return { ok: false, error: AVISO_FALTA_AUTO_FIN, aviso: AVISO_FALTA_AUTO_FIN };
    return { ok: false, error: eP.message };
  }

  const { error: eU } = await supabase
    .from('auto_fin_cuotas')
    .update({ pagado: nuevoPagado, estado: estadoCuota })
    .eq('id', cuotaId);
  if (eU) return { ok: false, error: eU.message };

  const det = await obtenerCreditoAutoFin(supabase, creditoId);
  if (det.ok && det.saldo <= 0.01) {
    await supabase.from('auto_fin_creditos').update({ estado: 'liquidado' }).eq('id', creditoId);
  }

  return { ok: true, aplicado: aplica };
}

export async function cancelarCreditoAutoFin(supabase, id) {
  if (!supabase || !id) return { ok: false, error: 'ID inválido.' };
  const { error } = await supabase.from('auto_fin_creditos').update({ estado: 'cancelado' }).eq('id', id);
  if (error) {
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_AUTO_FIN };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Cambia la fecha de inicio del financiamiento y regenera solo las fechas
 * de vencimiento de las cuotas (conserva montos y pagos ya aplicados).
 */
export async function actualizarFechaFinanciamientoAutoFin(supabase, creditoId, nuevaFechaInicio) {
  if (!supabase || !creditoId) return { ok: false, error: 'Crédito inválido.' };
  const inicio = String(nuevaFechaInicio || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return { ok: false, error: 'Fecha inválida.' };

  const { data: credito, error } = await supabase
    .from('auto_fin_creditos')
    .select('id, frecuencia, num_cuotas, estado')
    .eq('id', creditoId)
    .maybeSingle();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_AUTO_FIN, aviso: AVISO_FALTA_AUTO_FIN };
  if (error) return { ok: false, error: error.message };
  if (!credito) return { ok: false, error: 'Crédito no encontrado.' };
  if (credito.estado === 'cancelado') return { ok: false, error: 'No se puede modificar un crédito cancelado.' };

  const { data: cuotas, error: eCuotas } = await supabase
    .from('auto_fin_cuotas')
    .select('id, numero')
    .eq('credito_id', creditoId)
    .order('numero');
  if (eCuotas) return { ok: false, error: eCuotas.message };
  if (!cuotas?.length) return { ok: false, error: 'El crédito no tiene cuotas.' };

  const freq = FRECUENCIAS_AUTO_FIN.find((f) => f.id === credito.frecuencia) || FRECUENCIAS_AUTO_FIN[0];

  const { error: eFecha } = await supabase
    .from('auto_fin_creditos')
    .update({ fecha_inicio: inicio })
    .eq('id', creditoId);
  if (eFecha) return { ok: false, error: eFecha.message };

  for (const cuota of cuotas) {
    const fecha =
      freq.id === 'mensual'
        ? addMonths(inicio, cuota.numero)
        : addDays(inicio, freq.dias * cuota.numero);
    const { error: eUpd } = await supabase
      .from('auto_fin_cuotas')
      .update({ fecha_vencimiento: fecha })
      .eq('id', cuota.id);
    if (eUpd) return { ok: false, error: eUpd.message };
  }

  return { ok: true, fecha_inicio: inicio };
}
