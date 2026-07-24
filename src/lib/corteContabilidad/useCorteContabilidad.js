import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { turnoActual, nombreTurnoLegible } from '../turnos.js';
import { empleadosParaCorte } from '../empleadosVisibles.js';
import { permisosCorteContabilidad, puedeEditarCorteCampo } from './permisos.js';
import { gastoRequiereEmpleado } from './catalogoGastos.js';
import { monedaAInyectarVirtual, monedaTopeVirtual, round2 } from './calc.js';
import {
  AVISO_FALTA_CORTES,
  agregarGastoTurno,
  cargarEstadoCorte,
  cerrarGastosHuerfanosTrasCierre,
  eliminarGastoTurno,
  actualizarGastoTurno,
  guardarEstadoCorte,
  limpiarGastosTurno,
  listarGastosTurno,
  listarCierresCorte,
  peekFolio,
  registrarCierreCorte,
  siguienteFolio,
  actualizarDetalleCierre,
  eliminarCierreCorte,
} from './store.js';

function snapshotTurno(date = new Date()) {
  const t = turnoActual(null, date);
  if (!t) return null;
  return {
    id: t.id,
    nombre: t.nombre,
    hora_inicio: t.hora_inicio,
    hora_fin: t.hora_fin,
  };
}

function resolverTurnoSesion(estado, gastos = []) {
  if (estado?.turno_sesion?.id || estado?.turno_sesion?.nombre) {
    return estado.turno_sesion;
  }
  const primerGasto = (gastos || []).find((g) => g?.created_at);
  if (primerGasto?.created_at) {
    const when = new Date(primerGasto.created_at);
    if (!Number.isNaN(when.getTime())) return snapshotTurno(when);
  }
  return snapshotTurno();
}

export function useCorteContabilidad({ supabase, sucursal, modulo, user, calcFn, prepararTrasCierre, prepararTrasRecoleccion }) {
  const [estado, setEstado] = useState(() => ({}));
  const [gastos, setGastos] = useState([]);
  const [folio, setFolio] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(true);
  const [historial, setHistorial] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const saveTimer = useRef(null);
  const perm = useMemo(
    () => permisosCorteContabilidad(user?.rol ?? user?.role, user?.id),
    [user?.rol, user?.role, user?.id],
  );
  const turno = useMemo(
    () => nombreTurnoLegible(estado?.turno_sesion || turnoActual()),
    [estado?.turno_sesion],
  );

  const calc = useMemo(() => calcFn(estado, gastos), [estado, gastos, calcFn]);

  const persistir = useCallback(
    async (nextEstado) => {
      const res = await guardarEstadoCorte(supabase, sucursal, modulo, nextEstado);
      if (res.aviso) setAviso(res.aviso);
    },
    [supabase, sucursal, modulo],
  );

  const patchEstado = useCallback(
    (patch) => {
      setEstado((prev) => {
        const next = { ...prev, ...patch };
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => persistir(next), 400);
        return next;
      });
    },
    [persistir],
  );

  const patchEstadoPermitido = useCallback(
    (patch) => {
      if (perm.editarTodo) {
        patchEstado(patch);
        return;
      }
      const filtrado = { ...patch };
      const keys = Object.keys(filtrado);

      const camposCajero = new Set([
        'moneda_final',
        'moneda_final_editada',
        'faltante',
        'comentarios',
        'maquinas',
        'pin1',
        'pin2',
        'dsch',
        'venta',
        'tarjeta',
        'venta_manual',
        'subtotal_manual',
        'caja_actual_manual',
      ]);
      const soloOperacion = keys.length > 0 && keys.every((k) => camposCajero.has(k));
      if (soloOperacion && perm.guardar) {
        if (('moneda_final' in filtrado || 'moneda_final_editada' in filtrado) && !puedeEditarCorteCampo(perm, 'moneda_final')) return;
        if ('faltante' in filtrado && !puedeEditarCorteCampo(perm, 'faltante')) return;
        if ('comentarios' in filtrado && !puedeEditarCorteCampo(perm, 'comentarios')) return;
        patchEstado(filtrado);
        return;
      }

      if ('moneda_final' in filtrado || 'moneda_final_editada' in filtrado) {
        if (!puedeEditarCorteCampo(perm, 'moneda_final')) return;
      }
      if ('faltante' in filtrado && !puedeEditarCorteCampo(perm, 'faltante')) return;
      if ('comentarios' in filtrado && !puedeEditarCorteCampo(perm, 'comentarios')) return;
      if ('fondo' in filtrado && !(perm.fondo || perm.recoleccion)) return;
      if ('caja_anterior' in filtrado && !(perm.caja_anterior || perm.recoleccion)) return;
      // MI del corte solo admin (inyección manual). Tope de operación: admin/recolector.
      if ('moneda_inicial_turno' in filtrado && !perm.editarTodo) return;
      if (
        ('moneda_inicial' in filtrado ||
          'recoleccion' in filtrado ||
          'recoleccion_turno' in filtrado ||
          'precoleccion' in filtrado ||
          '_precoleccion_editada' in filtrado) &&
        !perm.recoleccion &&
        !perm.moneda_inicial
      ) {
        return;
      }
      patchEstado(filtrado);
    },
    [patchEstado, perm],
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    // Si un cierre previo dejó gastos abiertos por error, ciérralos antes de listar.
    await cerrarGastosHuerfanosTrasCierre(supabase, sucursal, modulo);
    const [estRes, gasRes, histRes, empRes] = await Promise.all([
      cargarEstadoCorte(supabase, sucursal, modulo),
      listarGastosTurno(supabase, sucursal, modulo),
      listarCierresCorte(supabase, sucursal, modulo, 15),
      supabase
        ? supabase
            .from('usuarios')
            .select('id, nombre, rol, sucursal_id, nomina_pagador, turno_id, turno_horario')
            .order('nombre')
        : Promise.resolve({ data: [] }),
    ]);
    if (estRes.aviso || gasRes.aviso) setAviso(estRes.aviso || gasRes.aviso || '');
    let nextEstado = estRes.estado || {};
    const nextGastos = gasRes.data || [];
    if (modulo === 'virtual' && !nextEstado.turno_sesion) {
      const sesion = resolverTurnoSesion(nextEstado, nextGastos);
      if (sesion) {
        nextEstado = { ...nextEstado, turno_sesion: sesion };
        await guardarEstadoCorte(supabase, sucursal, modulo, nextEstado);
      }
    }
    setEstado(nextEstado);
    setGastos(nextGastos);
    setHistorial(histRes.data || []);
    setEmpleados(
      empleadosParaCorte(empRes.data || [], sucursal, modulo, user?.rol, {
        turno: nextEstado.turno_sesion || turnoActual(),
      }),
    );
    if (!nextEstado?.folio && modulo !== 'abarrotes') {
      const f = await peekFolio(supabase, sucursal, modulo);
      setFolio(f);
    } else if (modulo === 'abarrotes') {
      setFolio(nextEstado?.folio || 'AB-001');
    } else {
      setFolio(nextEstado?.folio || '');
    }
    setCargando(false);
  }, [supabase, sucursal, modulo, user?.rol]);

  useEffect(() => {
    cargar();
    return () => clearTimeout(saveTimer.current);
  }, [cargar]);

  const agregarGasto = async (gasto) => {
    if (!puedeEditarCorteCampo(perm, 'gastos')) return;
    if (gastoRequiereEmpleado(modulo, gasto?.categoria) && !gasto?.usuario_id) {
      return alert('Selecciona el empleado a quien se descontará el consumo en nómina.');
    }
    // Fija el turno de la sesión al primer registro (si el corte quedó abierto entre turnos).
    if (modulo === 'virtual' && !estado.turno_sesion) {
      const sesion = snapshotTurno();
      if (sesion) patchEstado({ turno_sesion: sesion });
    }
    const res = await agregarGastoTurno(supabase, sucursal, modulo, gasto, {
      rolActor: user?.rol,
      nombreActor: user?.nombre,
    });
    if (!res.ok) return alert(res.error);
    if (res.pendiente) alert(res.mensaje || 'Consumo pendiente de autorización del administrador.');
    const gas = await listarGastosTurno(supabase, sucursal, modulo);
    setGastos(gas.data || []);
  };

  const quitarGasto = async (id) => {
    if (!puedeEditarCorteCampo(perm, 'gastos')) return;
    const res = await eliminarGastoTurno(supabase, id, sucursal, modulo);
    if (!res.ok) return alert(res.error);
    setGastos((prev) => prev.filter((g) => String(g.id) !== String(id)));
  };

  const editarGasto = async (id, patch) => {
    if (!puedeEditarCorteCampo(perm, 'gastos')) return;
    const res = await actualizarGastoTurno(supabase, id, patch, sucursal, modulo);
    if (!res.ok) return alert(res.error);
    const gas = await listarGastosTurno(supabase, sucursal, modulo);
    setGastos(gas.data || []);
  };

  const cerrarCorte = async (detalleExtra = {}) => {
    if (!perm.guardar) {
      return alert('No tiene permiso para cerrar este corte.');
    }

    // Queda a nombre del turno donde se hicieron los registros (sesión abierta),
    // aunque se cierre ya entrado el siguiente turno.
    const turnoCierre = estado.turno_sesion || snapshotTurno() || turnoActual();

    const payload = {
      sucursal_id: sucursal || 'MAIN',
      modulo,
      folio: modulo === 'abarrotes' ? estado.folio || folio : folio,
      turno: turnoCierre,
      usuario_id: user?.id || null,
      usuario_nombre: user?.nombre || null,
      caja_actual: calc.cajaActual ?? 0,
      ventas: calc.venta ?? 0,
      detalle: {
        ...estado,
        gastos,
        gastos_total: calc.gastosTotal,
        subtotal: calc.subtotal,
        venta_neta: calc.ventaNeta,
        total_lectura: calc.totalLectura,
        comentarios: estado.comentarios || '',
        ...detalleExtra,
        tipo_cierre: 'cierre',
        turno_sesion: turnoCierre,
      },
    };
    const res = await registrarCierreCorte(supabase, payload);
    if (!res.ok) return alert(res.error || AVISO_FALTA_CORTES);

    // Gastos del corte quedan en historial del cierre / nómina; el nuevo corte arranca en $0.
    const idsGastos = (gastos || []).map((g) => g.id).filter(Boolean);
    const limpia = await limpiarGastosTurno(supabase, sucursal, modulo, idsGastos);
    const nuevoEstado = prepararTrasCierre(estado, calc, detalleExtra);
    // Nueva sesión abierta: turno actual (cuando arranca el siguiente corte).
    if (modulo === 'virtual') {
      nuevoEstado.turno_sesion = snapshotTurno() || turnoActual();
    }
    if (modulo !== 'abarrotes') {
      const nuevoFolio = await siguienteFolio(supabase, sucursal, modulo);
      setFolio(nuevoFolio);
      nuevoEstado.folio = nuevoFolio;
    }
    await guardarEstadoCorte(supabase, sucursal, modulo, nuevoEstado);
    setEstado(nuevoEstado);

    const gas = await listarGastosTurno(supabase, sucursal, modulo);
    const quedan = gas.data || [];
    setGastos(quedan);

    const hist = await listarCierresCorte(supabase, sucursal, modulo, 15);
    setHistorial(hist.data || []);

    if (!limpia.ok || quedan.length > 0) {
      alert(
        `Corte cerrado, pero los gastos no se reiniciaron bien.\n` +
          `${limpia.error || `Quedan ${quedan.length} gasto(s) abiertos.`}\n` +
          `Recargue o cierre de nuevo; si persiste, revise conexión a Supabase.`,
      );
      return;
    }

    alert(
      modulo === 'virtual'
        ? 'Corte cerrado. Gastos en $0 para el nuevo corte. Esta venta no va a IE; solo la recolección.'
        : 'Corte cerrado y guardado en historial contabilidad.',
    );
  };

  const registrarRecoleccion = async (opts = {}) => {
    if (!perm.recoleccion) {
      return alert('Solo el administrador o recolector con privilegio puede registrar recolección.');
    }

    if (modulo === 'virtual') {
      const calcRec =
        opts.montoRecoleccion != null
          ? round2(opts.montoRecoleccion)
          : round2(estado.recoleccion ?? estado.recoleccion_turno);
      if (!(calcRec > 0)) {
        return alert('Indique el monto de recolección.');
      }
      const mf = round2(estado.moneda_final);
      const mi = round2(estado.moneda_inicial_turno ?? estado.moneda_inicial);
      const tope = monedaTopeVirtual(estado);
      const monedaInyectar = monedaAInyectarVirtual(estado, mf);
      const payload = {
        sucursal_id: sucursal || 'MAIN',
        modulo,
        folio: `REC-${folio || 'V'}`,
        turno: 'RECOLECCION',
        usuario_id: user?.id || null,
        usuario_nombre: user?.nombre || null,
        caja_actual: 0,
        ventas: 0,
        detalle: {
          ...estado,
          fondo: round2(estado.fondo),
          caja_anterior: round2(estado.caja_anterior),
          moneda_inicial: round2(estado.moneda_inicial),
          moneda_inicial_turno: mi,
          moneda_final: mf,
          moneda_final_editada: true,
          faltante: round2(estado.faltante),
          recoleccion: calcRec,
          recoleccion_turno: calcRec,
          venta: calc.venta,
          gastos,
          gastos_total: calc.gastosTotal,
          subtotal: calc.subtotal,
          caja_actual: calc.cajaActual,
          moneda_tope: tope,
          moneda_inyectar: monedaInyectar,
          formula_recoleccion: 'tope_menos_mf',
          tipo_cierre: 'recoleccion',
          comentarios: estado.comentarios || '',
        },
      };
      const res = await registrarCierreCorte(supabase, payload);
      if (!res.ok) return { ok: false, error: res.error || AVISO_FALTA_CORTES };

      await limpiarGastosTurno(supabase, sucursal, modulo, (gastos || []).map((g) => g.id).filter(Boolean));
      const prep = prepararTrasRecoleccion || ((e) => e);
      const nuevoEstado = prep(estado, calc, {
        monedaTope: tope,
        montoRecoleccion: calcRec,
      });
      nuevoEstado.turno_sesion = snapshotTurno() || turnoActual();
      await guardarEstadoCorte(supabase, sucursal, modulo, nuevoEstado);
      setEstado(nuevoEstado);
      const gasRec = await listarGastosTurno(supabase, sucursal, modulo);
      setGastos(gasRec.data || []);
      const hist = await listarCierresCorte(supabase, sucursal, modulo, 15);
      setHistorial(hist.data || []);
      return {
        ok: true,
        folio: payload.folio,
        recoleccion: calcRec,
        monedaInyectar,
        miSiguiente: nuevoEstado.moneda_inicial_turno,
        estadoImpresion: payload.detalle,
        gastosImpresion: gastos,
        calcImpresion: { ...calc },
      };
    }

    const { corteAnteriorId, monedaFinalAnterior } = opts;
    if (!estado._precoleccion_editada && !round2(estado.precoleccion)) {
      return alert('Capture la moneda final de recolección (moneda en caja) antes de registrar.');
    }
    const montoRec = round2(estado.recoleccion ?? estado.recoleccion_turno);
    if (!(montoRec > 0)) return alert('Indique el monto de recolección en efectivo retirado.');
    if ((calc.cajaActual ?? 0) < -0.001) {
      return alert(`No se puede recolectar: la caja chica está en negativo (${fmtCorte(calc.cajaActual)}).`);
    }

    const mf = round2(estado.precoleccion);
    const monedaTope = monedaTopeVirtual(estado);
    const monedaInyectar = monedaAInyectarVirtual(estado, mf);
    if (corteAnteriorId && monedaFinalAnterior != null && monedaFinalAnterior !== '') {
      const upd = await actualizarDetalleCierre(
        supabase,
        corteAnteriorId,
        { moneda_final: round2(monedaFinalAnterior), moneda_final_editada: true },
        sucursal,
        modulo,
      );
      if (!upd.ok) return alert(upd.error || 'No se pudo actualizar el corte anterior.');
    }

    const payload = {
      sucursal_id: sucursal || 'MAIN',
      modulo,
      folio: `REC-${folio || 'V'}`,
      turno: 'RECOLECCION',
      usuario_id: user?.id || null,
      usuario_nombre: user?.nombre || null,
      caja_actual: round2(Math.max(0, calc.cajaActual)),
      ventas: 0,
      detalle: {
        ...estado,
        fondo: round2(estado.fondo),
        moneda_final: mf,
        moneda_final_editada: true,
        precoleccion: mf,
        moneda_final_recoleccion: mf,
        recoleccion: montoRec,
        recoleccion_turno: montoRec,
        moneda_tope: monedaTope,
        moneda_inyectar: monedaInyectar,
        venta: 0,
        gastos,
        gastos_total: calc.gastosTotal,
        subtotal: calc.subtotal,
        caja_antes_recoleccion: round2(calc.cajaActual + montoRec),
        corte_anterior_id: corteAnteriorId || null,
        tipo_cierre: 'recoleccion',
        comentarios: estado.comentarios || '',
      },
    };

    const res = await registrarCierreCorte(supabase, payload);
    if (!res.ok) return alert(res.error || AVISO_FALTA_CORTES);

    await limpiarGastosTurno(supabase, sucursal, modulo, (gastos || []).map((g) => g.id).filter(Boolean));
    const prep = prepararTrasRecoleccion || ((e) => e);
    const nuevoEstado = prep(estado, calc, {
      nuevaMoneda: mf,
      montoRecoleccion: montoRec,
      monedaTope,
      monedaInyectar,
    });
    await guardarEstadoCorte(supabase, sucursal, modulo, nuevoEstado);
    setEstado(nuevoEstado);
    const gasPost = await listarGastosTurno(supabase, sucursal, modulo);
    setGastos(gasPost.data || []);
    const hist = await listarCierresCorte(supabase, sucursal, modulo, 15);
    setHistorial(hist.data || []);
    const monOp = monedaTope > 0 ? monedaTope : mf;
    alert(
      `Recolección de ${fmtCorte(montoRec)} registrada.\n\n` +
        `Moneda final recolección: ${fmtCorte(mf)}\n` +
        `Moneda inicial (tope): ${fmtCorte(monedaTope)}\n` +
        `Inyectar a sucursal: ${fmtCorte(monedaInyectar)} (no es ingreso)\n` +
        `Ingreso en IE VIRTUAL: ${fmtCorte(montoRec)} (solo efectivo recolectado)\n` +
        `El fondo fijo no se registra como ingreso.\n\n` +
        `Periodo reiniciado: caja y ventas en ${fmtCorte(0)}.\n` +
        `Moneda de referencia e inicio de operación: ${fmtCorte(monOp)}.\n` +
        `Los gastos del periodo quedan en historial y nómina.`,
    );
    return { ok: true };
  };

  const eliminarCierreHistorial = async (cierreId, meta = {}) => {
    if (!perm.editarTodo) return alert('Solo el administrador puede eliminar cierres del historial.');
    const folio = meta.folio || cierreId;
    if (!confirm(`¿Eliminar el cierre ${folio} del historial?\n\nEsta acción no se puede deshacer.`)) return;
    const res = await eliminarCierreCorte(supabase, cierreId, sucursal, modulo);
    if (!res.ok) return alert(res.error || 'No se pudo eliminar.');
    const hist = await listarCierresCorte(supabase, sucursal, modulo, 15);
    setHistorial(hist.data || []);
  };

  return {
    estado,
    patchEstado: patchEstadoPermitido,
    gastos,
    agregarGasto,
    quitarGasto,
    editarGasto,
    calc,
    folio,
    setFolio,
    turno,
    perm,
    aviso,
    cargando,
    historial,
    empleados,
    cerrarCorte,
    registrarRecoleccion,
    eliminarCierreHistorial,
    recargar: cargar,
  };
}

export function fmtCorte(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}
