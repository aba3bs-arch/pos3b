import { round2 } from './nominaGastos.js';
import { indiceEmpleados, resolverClaveEmpleado } from './nominaMatch.js';
import { saldoPendienteDesdePago, recalcularLineaNomina } from './nominaCalculos.js';
import { leerSaldosArrastreLocal, guardarSaldosArrastreLocal } from './nominaSaldoArrastre.js';
import { cargarLineasPeriodo } from './nomina.js';

/** Desmarca gastos de cortes vinculados a este cierre de nómina. */
export async function revertirGastosNominaPeriodo(supabase, periodoId) {
  if (!supabase || !periodoId) return { ok: true, count: 0 };

  const { data, error } = await supabase
    .from('cortes_contabilidad_gastos')
    .update({ descontado_nomina: false, periodo_nomina_id: null })
    .eq('periodo_nomina_id', periodoId)
    .select('id');

  if (error) {
    if (String(error.message).includes('periodo_nomina_id') || String(error.message).includes('descontado_nomina')) {
      return { ok: true, count: 0, aviso: 'Columnas de nómina en gastos no disponibles.' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, count: (data || []).length };
}

/** Devuelve abonos de préstamos aplicados al cerrar (LIFO sobre préstamos con abono). */
export async function revertirPrestamosNomina(supabase, { lineas, empleados = [], todasSucursales = true }) {
  if (!supabase) return { ok: true };
  const indice = indiceEmpleados(empleados);

  let q = supabase.from('prestamos').select('*').in('estado', ['activo', 'liquidado']).order('created_at', { ascending: true });
  if (!todasSucursales) {
    /* consolidada: todas las sucursales */
  }

  const { data: todos, error: eList } = await q;
  if (eList) return { ok: false, error: eList.message };

  for (const l of lineas || []) {
    let restante = round2(Number(l.deduccion_prestamos) || 0);
    if (restante <= 0) continue;
    const clave = l.usuario_id ? String(l.usuario_id) : null;
    if (!clave) continue;

    const prestamosEmp = (todos || []).filter((p) => resolverClaveEmpleado(p, indice) === clave);
    const conAbono = prestamosEmp
      .filter((p) => (Number(p.abono) || 0) > 0)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    for (const p of conAbono) {
      if (restante <= 0) break;
      const abonoActual = Number(p.abono) || 0;
      const revertir = Math.min(restante, abonoActual);
      if (revertir <= 0) continue;

      const nuevoAbono = round2(abonoActual - revertir);
      const nuevoSaldo = round2((Number(p.saldo) || 0) + revertir);

      const { error } = await supabase
        .from('prestamos')
        .update({
          saldo: nuevoSaldo,
          abono: nuevoAbono,
          estado: 'activo',
        })
        .eq('id', p.id);

      if (error) return { ok: false, error: error.message };
      p.abono = nuevoAbono;
      p.saldo = nuevoSaldo;
      restante = round2(restante - revertir);
    }
  }
  return { ok: true };
}

/** Quita del arrastre local los saldos que generó este cierre. */
export function revertirArrastreNomina(lineas) {
  const map = { ...leerSaldosArrastreLocal() };
  for (const l of lineas || []) {
    const uid = l.usuario_id != null ? String(l.usuario_id) : '';
    if (!uid) continue;
    const pend = Number(l.saldo_pendiente) || saldoPendienteDesdePago(l.pago ?? l.total);
    if (pend <= 0) continue;
    if (map[uid] != null && Math.abs(map[uid] - pend) < 0.01) delete map[uid];
    else if (map[uid] != null) map[uid] = round2(Math.max(0, map[uid] - pend));
  }
  guardarSaldosArrastreLocal(map);
  return map;
}

/** Convierte líneas guardadas en filas editables con flags manuales. */
export function lineasReabiertasParaEdicion(lineas) {
  return (lineas || []).map((l) => {
    const dedOtros = Number(l.deducciones) || 0;
    let notasOtros = '';
    const notas = String(l.notas || '');
    const m = notas.match(/Otros:\s*([^·]+)/);
    if (m) notasOtros = m[1].trim();

    return recalcularLineaNomina({
      ...l,
      salario_dia: l.sueldo_tarifa ?? l.salario_dia,
      sueldo_tarifa: l.sueldo_tarifa ?? l.salario_dia,
      deducciones: dedOtros,
      notas_otros: notasOtros,
      pagador_manual: true,
      dias_manual: true,
      sueldo_manual: true,
      gastos_manual: true,
      inventario_manual: true,
      prestamos_manual: true,
      otros_manual: true,
    });
  });
}

/**
 * Reabre la nómina más reciente cerrada: revierte gastos/préstamos/arrastre y elimina el registro.
 * Solo administrador (validar en UI).
 */
export async function reabrirPeriodoNomina(supabase, periodoId) {
  if (!supabase || !periodoId) return { ok: false, error: 'Periodo inválido.' };

  const { data: periodo, error: ePer } = await supabase.from('nomina_periodos').select('*').eq('id', periodoId).maybeSingle();
  if (ePer) return { ok: false, error: ePer.message };
  if (!periodo) return { ok: false, error: 'Periodo no encontrado.' };

  const { data: ultimo } = await supabase
    .from('nomina_periodos')
    .select('id, periodo_fin')
    .order('periodo_fin', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ultimo?.id && ultimo.id !== periodoId) {
    return {
      ok: false,
      error: 'Solo se puede reabrir la nómina más reciente. Cierra o reabre primero los periodos posteriores.',
    };
  }

  const resLineas = await cargarLineasPeriodo(supabase, periodoId);
  if (resLineas.error) return { ok: false, error: resLineas.error };
  const lineas = resLineas.data || [];

  const gRes = await revertirGastosNominaPeriodo(supabase, periodoId);
  if (!gRes.ok) return { ok: false, error: gRes.error };

  const listaEmp = lineas.map((l) => ({ id: l.usuario_id, nombre: l.nombre })).filter((e) => e.id);
  const pRes = await revertirPrestamosNomina(supabase, { lineas, empleados: listaEmp, todasSucursales: true });
  if (!pRes.ok) return { ok: false, error: pRes.error };

  const arrastreMap = revertirArrastreNomina(lineas);

  const { error: eDelLin } = await supabase.from('nomina_lineas').delete().eq('periodo_id', periodoId);
  if (eDelLin) return { ok: false, error: eDelLin.message };

  const { error: eDelPer } = await supabase.from('nomina_periodos').delete().eq('id', periodoId);
  if (eDelPer) return { ok: false, error: eDelPer.message };

  return {
    ok: true,
    periodo,
    lineas: lineasReabiertasParaEdicion(lineas),
    arrastreMap,
    gastosRevertidos: gRes.count || 0,
  };
}
