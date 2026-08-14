import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { turnoActual, nombreTurnoLegible } from '../turnos.js';
import { empleadosParaCorte } from '../empleadosVisibles.js';
import { permisosCorteContabilidad, puedeEditarCorteCampo } from './permisos.js';
import { gastoRequiereEmpleado } from './catalogoGastos.js';
import {
  detalleRecoleccionParaIe,
  gastosIdsDesdeUltimaRecoleccion,
  gastosListaDesdeUltimaRecoleccion,
  gastosPeriodoDesdeUltimaRecoleccion,
  monedaAInyectarVirtual,
  monedaFinalParaInyectarVirtual,
  monedaTopeVirtual,
  round2,
} from './calc.js';
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
  folioTrasCierre,
  actualizarDetalleCierre,
  actualizarCierreCorte,
  eliminarCierreCorte,
  notificarRecoleccionPendienteIe,
} from './store.js';
import { estadoAprobacionRecoleccionInicial } from '../contabilidadConstants.js';
import { normalizarRol } from '../roles.js';

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
          'recoleccion_anterior' in filtrado ||
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
    const cargarUsuariosCorte = async () => {
      if (!supabase) return { data: [] };
      const intentos = [
        'id, nombre, rol, sucursal_id, tipo_empleado, nomina_pagador, turno_id, turno_horario, activo',
        'id, nombre, rol, sucursal_id, tipo_empleado, nomina_pagador, activo',
        'id, nombre, rol, sucursal_id, tipo_empleado, activo',
        'id, nombre, rol, sucursal_id, activo',
        '*',
      ];
      let lastErr = null;
      for (const cols of intentos) {
        const res = await supabase.from('usuarios').select(cols).order('nombre');
        if (!res.error) return res;
        lastErr = res.error;
      }
      return { data: [], error: lastErr };
    };

    const [estRes, gasRes, histRes, empRes] = await Promise.all([
      cargarEstadoCorte(supabase, sucursal, modulo),
      listarGastosTurno(supabase, sucursal, modulo),
      listarCierresCorte(supabase, sucursal, modulo, modulo === 'virtual' ? 80 : 15),
      cargarUsuariosCorte(),
    ]);
    if (estRes.aviso || gasRes.aviso) setAviso(estRes.aviso || gasRes.aviso || '');
    if (empRes.error) {
      setAviso((prev) => prev || `Empleados: ${empRes.error.message || empRes.error}`);
    }
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
    setEmpleados(empleadosParaCorte(empRes.data || [], sucursal, modulo, user?.rol));
    if (nextEstado?.folio) {
      setFolio(nextEstado.folio);
    } else {
      const f = await peekFolio(supabase, sucursal, modulo);
      setFolio(f);
      if (modulo === 'abarrotes' && f) {
        nextEstado = { ...nextEstado, folio: f };
        setEstado(nextEstado);
        await guardarEstadoCorte(supabase, sucursal, modulo, nextEstado);
      }
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
    await cargar();
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
    const turnoTexto = nombreTurnoLegible(turnoCierre);
    const folioCierre = modulo === 'abarrotes' ? estado.folio || folio : folio;
    const gastosCierre = [...(gastos || [])];
    const calcCierre = { ...calc };
    const estadoCierre = { ...estado };

    const payload = {
      sucursal_id: sucursal || 'MAIN',
      modulo,
      folio: folioCierre,
      turno: turnoTexto,
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

    // Virtual/Abarrotes: gastos del turno se cierran al cortar (siguiente turno en $0).
    // Garage: gastos y faltantes persisten turno a turno hasta recolección con máquinas en cero.
    let limpia = { ok: true };
    if (modulo !== 'garage') {
      const idsGastos = (gastos || []).map((g) => g.id).filter(Boolean);
      limpia = await limpiarGastosTurno(supabase, sucursal, modulo, idsGastos);
    }
    const nuevoEstado = prepararTrasCierre(estado, calc, detalleExtra);
    // Nueva sesión abierta: turno actual (cuando arranca el siguiente corte).
    if (modulo === 'virtual') {
      nuevoEstado.turno_sesion = snapshotTurno() || turnoActual();
    }
    const nuevoFolio = await folioTrasCierre(supabase, sucursal, modulo, folioCierre);
    setFolio(nuevoFolio);
    nuevoEstado.folio = nuevoFolio;
    await guardarEstadoCorte(supabase, sucursal, modulo, nuevoEstado);
    setEstado(nuevoEstado);

    const gas = await listarGastosTurno(supabase, sucursal, modulo);
    const quedan = gas.data || [];
    setGastos(quedan);

    const hist = await listarCierresCorte(supabase, sucursal, modulo, 15);
    setHistorial(hist.data || []);

    if (modulo !== 'garage' && (!limpia.ok || quedan.length > 0)) {
      alert(
        `Corte cerrado, pero los gastos no se reiniciaron bien.\n` +
          `${limpia.error || `Quedan ${quedan.length} gasto(s) abiertos.`}\n` +
          `Recargue o cierre de nuevo; si persiste, revise conexión a Supabase.`,
      );
      return { ok: false, error: limpia.error };
    }

    if (modulo === 'garage') {
      alert(
        'Corte cerrado. Gastos y faltantes se conservan para el siguiente turno.\n' +
          'Solo se ponen en cero (y pasan a IE) al generar recolección con máquinas en cero.',
      );
    } else if (modulo !== 'virtual') {
      alert('Corte cerrado y guardado en historial contabilidad.');
    }

    return {
      ok: true,
      folio: folioCierre,
      turno: turnoTexto,
      estadoImpresion: { ...estadoCierre, ...detalleExtra, tipo_cierre: 'cierre' },
      gastosImpresion: gastosCierre,
      calcImpresion: calcCierre,
    };
  };

  const registrarRecoleccion = async (opts = {}) => {
    if (!perm.recoleccion) {
      return alert('Solo el administrador o recolector con privilegio puede registrar recolección.');
    }

    if (modulo === 'garage') {
      const calcRec =
        opts.montoRecoleccion != null
          ? round2(opts.montoRecoleccion)
          : round2(estado.recoleccion);
      if (!(calcRec > 0)) {
        return alert('Indique el monto de recolección.');
      }
      const maquinasEnCero = opts.maquinasEnCero === true;
      const tipo = maquinasEnCero ? 'recoleccion' : 'recoleccion_temporal';
      const antAntes = round2(estado.recoleccion_anterior);
      const antTras = maquinasEnCero ? 0 : round2(antAntes + calcRec);
      const folioRec = `REC-${folio || 'G'}`;
      // Gastos abiertos del periodo (persisten entre cierres); no sumar historial o se duplican.
      const gastosAbiertos = gastos || [];
      const gastosIds = gastosAbiertos.map((g) => g.id).filter(Boolean);
      const gastosTotal = round2(calc.gastosTotal);
      const estadoAprob = maquinasEnCero
        ? estadoAprobacionRecoleccionInicial(user?.nombre)
        : null;

      const extrasBase = {
        ...estado,
        gastos: gastosAbiertos,
        gastos_ids: gastosIds,
        gastos_total: gastosTotal,
        subtotal: calc.subtotal,
        venta_neta: calc.ventaNeta,
        venta: calc.venta,
        recoleccion: calcRec,
        recoleccion_anterior: antAntes,
        recoleccion_anterior_tras: antTras,
        maquinas_en_cero: maquinasEnCero,
        tipo_cierre: tipo,
        comentarios: estado.comentarios || '',
      };

      const detalle = maquinasEnCero
        ? detalleRecoleccionParaIe({
            efectivo: calcRec,
            gastosTotal,
            extras: {
              ...extrasBase,
              estado_aprobacion: estadoAprob,
            },
          })
        : extrasBase;

      const payload = {
        sucursal_id: sucursal || 'MAIN',
        modulo,
        folio: folioRec,
        turno: 'RECOLECCION',
        usuario_id: user?.id || null,
        usuario_nombre: user?.nombre || null,
        caja_actual: calc.cajaActual ?? 0,
        ventas: calc.venta ?? 0,
        detalle,
      };
      const res = await registrarCierreCorte(supabase, payload);
      if (!res.ok) return { ok: false, error: res.error || AVISO_FALTA_CORTES };

      // Solo recolección definitiva (máquinas en cero) escala a Contabilidad / IE.
      if (maquinasEnCero) {
        if (estadoAprob === 'aprobado' && res.data) {
          try {
            const { liberarGastosCorteAIeTrasRecoleccion } = await import('../contVirtualEgresos.js');
            await liberarGastosCorteAIeTrasRecoleccion(supabase, res.data);
          } catch {
            /* no bloquear */
          }
        } else if (estadoAprob === 'pendiente_admin' && res.data) {
          await notificarRecoleccionPendienteIe(supabase, res.data);
        }
        await limpiarGastosTurno(supabase, sucursal, modulo, gastosIds);
        const gas = await listarGastosTurno(supabase, sucursal, modulo);
        setGastos(gas.data || []);
      }

      const prep = prepararTrasRecoleccion || ((e) => e);
      const nuevoEstado = prep(estado, calc, {
        maquinasEnCero,
        montoRecoleccion: calcRec,
      });
      await guardarEstadoCorte(supabase, sucursal, modulo, nuevoEstado);
      setEstado(nuevoEstado);
      const hist = await listarCierresCorte(supabase, sucursal, modulo, 15);
      setHistorial(hist.data || []);
      return {
        ok: true,
        folio: folioRec,
        recoleccion: calcRec,
        temporal: !maquinasEnCero,
        maquinasEnCero,
        recoleccionAnteriorTras: antTras,
        pendienteIe: maquinasEnCero && estadoAprob === 'pendiente_admin',
        estadoImpresion: detalle,
        gastosImpresion: gastosAbiertos,
        calcImpresion: { ...calc },
      };
    }

    if (modulo === 'virtual') {
      const calcRec =
        opts.montoRecoleccion != null
          ? round2(opts.montoRecoleccion)
          : round2(estado.recoleccion ?? estado.recoleccion_turno);
      if (!(calcRec > 0)) {
        return alert('Indique el monto de recolección.');
      }
      // Historial amplio: gastos del periodo + MF del último cierre.
      const histPeriodoRes = await listarCierresCorte(supabase, sucursal, modulo, 120);
      const histPeriodo = histPeriodoRes.data?.length ? histPeriodoRes.data : historial;
      const mi = round2(estado.moneda_inicial_turno ?? estado.moneda_inicial);
      const mf = monedaFinalParaInyectarVirtual(estado, histPeriodo);
      const tope = monedaTopeVirtual(estado);
      const monedaInyectar = round2(Math.max(0, tope - mf));
      const gastosPeriodoLista = gastosListaDesdeUltimaRecoleccion(histPeriodo, gastos, {
        folioAbierto: folio || 'ABIERTO',
        turnoAbierto: estado.turno_sesion || turnoActual() || 'Corte actual',
        usuarioAbierto: user?.nombre || null,
      });
      const gastosPeriodo = round2(
        gastosPeriodoLista.reduce((a, g) => a + (Number(g.monto) || 0), 0),
      );
      const gastosIds = gastosPeriodoLista
        .map((g) => (g?.id != null && g.id !== '' ? String(g.id) : null))
        .filter(Boolean);
      const estadoAprob = estadoAprobacionRecoleccionInicial(user?.nombre);
      const payload = {
        sucursal_id: sucursal || 'MAIN',
        modulo,
        folio: `REC-${folio || 'V'}`,
        turno: 'RECOLECCION',
        usuario_id: user?.id || null,
        usuario_nombre: user?.nombre || null,
        caja_actual: 0,
        ventas: 0,
        detalle: detalleRecoleccionParaIe({
          efectivo: calcRec,
          gastosTotal: gastosPeriodo,
          extras: {
            ...estado,
            fondo: round2(estado.fondo),
            caja_anterior: round2(estado.caja_anterior),
            moneda_inicial: round2(estado.moneda_inicial),
            moneda_inicial_turno: mi,
            moneda_final: mf,
            moneda_final_editada: true,
            faltante: round2(estado.faltante),
            venta: calc.venta,
            gastos: gastosPeriodoLista,
            gastos_ids: gastosIds,
            gastos_turno_actual: calc.gastosTotal,
            subtotal: calc.subtotal,
            caja_actual: calc.cajaActual,
            moneda_tope: tope,
            moneda_inyectar: monedaInyectar,
            formula_recoleccion: 'tope_menos_mf',
            tipo_cierre: 'recoleccion',
            estado_aprobacion: estadoAprob,
            comentarios: estado.comentarios || '',
          },
        }),
      };
      const res = await registrarCierreCorte(supabase, payload);
      if (!res.ok) return { ok: false, error: res.error || AVISO_FALTA_CORTES };

      if (estadoAprob === 'aprobado' && res.data) {
        try {
          const { liberarGastosCorteAIeTrasRecoleccion } = await import('../contVirtualEgresos.js');
          await liberarGastosCorteAIeTrasRecoleccion(supabase, res.data);
        } catch {
          /* no bloquear */
        }
      } else if (estadoAprob === 'pendiente_admin' && res.data) {
        await notificarRecoleccionPendienteIe(supabase, res.data);
      }

      await limpiarGastosTurno(supabase, sucursal, modulo, (gastos || []).map((g) => g.id).filter(Boolean));
      const prep = prepararTrasRecoleccion || ((e) => e);
      const estadoConMf = {
        ...estado,
        moneda_final: mf,
        moneda_final_editada: true,
      };
      const nuevoEstado = prep(estadoConMf, calc, {
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
        monedaTope: tope,
        monedaFinal: mf,
        monedaInyectar,
        miSiguiente: nuevoEstado.moneda_inicial_turno,
        estadoImpresion: payload.detalle,
        gastosImpresion: gastosPeriodoLista,
        calcImpresion: { ...calc, gastosTotal: gastosPeriodo },
        estadoAprobacion: estadoAprob,
        pendienteIe: estadoAprob === 'pendiente_admin',
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

    const gastosPeriodo = gastosPeriodoDesdeUltimaRecoleccion(historial, calc.gastosTotal);
    const gastosIds = gastosIdsDesdeUltimaRecoleccion(historial, gastos);
    const estadoAprob = estadoAprobacionRecoleccionInicial(user?.nombre);
    const payload = {
      sucursal_id: sucursal || 'MAIN',
      modulo,
      folio: `REC-${folio || 'V'}`,
      turno: 'RECOLECCION',
      usuario_id: user?.id || null,
      usuario_nombre: user?.nombre || null,
      caja_actual: round2(Math.max(0, calc.cajaActual)),
      ventas: 0,
      detalle: detalleRecoleccionParaIe({
        efectivo: montoRec,
        gastosTotal: gastosPeriodo,
        extras: {
          ...estado,
          fondo: round2(estado.fondo),
          moneda_final: mf,
          moneda_final_editada: true,
          precoleccion: mf,
          moneda_final_recoleccion: mf,
          moneda_tope: monedaTope,
          moneda_inyectar: monedaInyectar,
          venta: 0,
          gastos,
          gastos_ids: gastosIds,
          gastos_turno_actual: calc.gastosTotal,
          subtotal: calc.subtotal,
          caja_antes_recoleccion: round2(calc.cajaActual + montoRec),
          corte_anterior_id: corteAnteriorId || null,
          tipo_cierre: 'recoleccion',
          estado_aprobacion: estadoAprob,
          comentarios: estado.comentarios || '',
        },
      }),
    };

    const res = await registrarCierreCorte(supabase, payload);
    if (!res.ok) return alert(res.error || AVISO_FALTA_CORTES);

    if (estadoAprob === 'aprobado' && res.data) {
      try {
        const { liberarGastosCorteAIeTrasRecoleccion } = await import('../contVirtualEgresos.js');
        await liberarGastosCorteAIeTrasRecoleccion(supabase, res.data);
      } catch {
        /* no bloquear */
      }
    } else if (estadoAprob === 'pendiente_admin' && res.data) {
      await notificarRecoleccionPendienteIe(supabase, res.data);
    }

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
    const brutoIe = round2(montoRec + gastosPeriodo);
    const avisoPend = estadoAprob === 'pendiente_admin'
      ? '\n⚠️ Transferencia a IE pendiente de aprobación (ABB / FJBB / JLBB).\n'
      : '';
    alert(
      `Recolección de ${fmtCorte(montoRec)} registrada.\n\n` +
        `Moneda final recolección: ${fmtCorte(mf)}\n` +
        `Moneda inicial (tope): ${fmtCorte(monedaTope)}\n` +
        `Inyectar a sucursal: ${fmtCorte(monedaInyectar)} (no es ingreso)\n` +
        `Ingreso en IE (bruto, sin descontar gastos): ${fmtCorte(brutoIe)}\n` +
        `Efectivo retirado: ${fmtCorte(montoRec)} · Gastos del periodo: ${fmtCorte(gastosPeriodo)} (se descuentan solo en IE)\n` +
        `El fondo fijo no se registra como ingreso.` +
        avisoPend +
        `\n\n` +
        `Periodo reiniciado: caja y ventas en ${fmtCorte(0)}.\n` +
        `Moneda de referencia e inicio de operación: ${fmtCorte(monOp)}.\n` +
        `Los gastos del periodo quedan en historial y se deducen en IE (una sola vez).`,
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

  const claveGastoDetalle = (g, i) =>
    g?.id != null && g.id !== '' ? String(g.id) : `idx-${i}`;

  /** Edita un gasto ya guardado en el detalle de un cierre (desglose / historial). */
  const editarGastoEnCierre = async (cierreId, gastoKey, patch) => {
    if (!puedeEditarCorteCampo(perm, 'gastos')) return;
    if (!cierreId || gastoKey == null) return;
    const cierre = (historial || []).find((h) => String(h.id) === String(cierreId));
    if (!cierre) return alert('Cierre no encontrado.');
    const d = cierre.detalle || {};
    const lista = Array.isArray(d.gastos) ? [...d.gastos] : [];
    const idx = lista.findIndex((g, i) => claveGastoDetalle(g, i) === String(gastoKey));
    if (idx < 0) return alert('Gasto no encontrado en el cierre.');

    const actual = { ...lista[idx] };
    if (patch.monto != null) actual.monto = Number(patch.monto) || 0;
    if (patch.categoria != null) actual.categoria = String(patch.categoria).trim().toUpperCase();
    if (patch.subcategoria != null) actual.subcategoria = String(patch.subcategoria).trim().toUpperCase();
    if (patch.comentario != null) actual.comentario = String(patch.comentario).trim().toUpperCase();
    lista[idx] = actual;

    const gastosTotal = round2(lista.reduce((a, g) => a + (Number(g.monto) || 0), 0));
    const venta = Number(cierre.ventas) || Number(d.venta) || 0;
    const subtotal = d.subtotal_manual !== '' && d.subtotal_manual != null
      ? Number(d.subtotal_manual) || 0
      : round2(venta - gastosTotal);

    if (actual.id && !String(actual.id).startsWith('local-')) {
      const resG = await actualizarGastoTurno(supabase, actual.id, patch, sucursal, modulo);
      if (!resG.ok) return alert(resG.error || 'No se pudo actualizar el gasto.');
    }

    const res = await actualizarDetalleCierre(
      supabase,
      cierreId,
      { gastos: lista, gastos_total: gastosTotal, subtotal },
      sucursal,
      modulo,
    );
    if (!res.ok) return alert(res.error || 'No se pudo actualizar el cierre.');
    const hist = await listarCierresCorte(supabase, sucursal, modulo, 15);
    setHistorial(hist.data || []);
  };

  /** Elimina un gasto del detalle de un cierre (desglose / historial). */
  const eliminarGastoEnCierre = async (cierreId, gastoKey) => {
    if (!puedeEditarCorteCampo(perm, 'gastos')) return;
    if (!cierreId || gastoKey == null) return;
    if (!confirm('¿Eliminar este gasto del cierre?')) return;
    const cierre = (historial || []).find((h) => String(h.id) === String(cierreId));
    if (!cierre) return alert('Cierre no encontrado.');
    const d = cierre.detalle || {};
    const listaPrev = Array.isArray(d.gastos) ? d.gastos : [];
    const idx = listaPrev.findIndex((g, i) => claveGastoDetalle(g, i) === String(gastoKey));
    if (idx < 0) return alert('Gasto no encontrado en el cierre.');
    const quitado = listaPrev[idx];
    const lista = listaPrev.filter((_, i) => i !== idx);

    const gastosTotal = round2(lista.reduce((a, g) => a + (Number(g.monto) || 0), 0));
    const venta = Number(cierre.ventas) || Number(d.venta) || 0;
    const subtotal = d.subtotal_manual !== '' && d.subtotal_manual != null
      ? Number(d.subtotal_manual) || 0
      : round2(venta - gastosTotal);

    if (quitado?.id && !String(quitado.id).startsWith('local-')) {
      const resG = await eliminarGastoTurno(supabase, quitado.id, sucursal, modulo);
      if (!resG.ok) return alert(resG.error || 'No se pudo eliminar el gasto.');
    }

    const res = await actualizarDetalleCierre(
      supabase,
      cierreId,
      { gastos: lista, gastos_total: gastosTotal, subtotal },
      sucursal,
      modulo,
    );
    if (!res.ok) return alert(res.error || 'No se pudo actualizar el cierre.');
    const hist = await listarCierresCorte(supabase, sucursal, modulo, 15);
    setHistorial(hist.data || []);
  };

  /** Corrige ventas/caja/folio/comentarios de un cierre del historial. */
  const editarCierreHistorial = async (cierreId, patch) => {
    const r = normalizarRol(user?.rol);
    if (!(perm.editarTodo || r === 'Gerente' || r === 'Supervisor')) {
      return { ok: false, error: 'Tu rol no puede editar cortes guardados.' };
    }
    const res = await actualizarCierreCorte(supabase, cierreId, patch, sucursal, modulo);
    if (!res.ok) return res;
    const hist = await listarCierresCorte(supabase, sucursal, modulo, 15);
    setHistorial(hist.data || []);
    return { ok: true };
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
    editarCierreHistorial,
    editarGastoEnCierre,
    eliminarGastoEnCierre,
    recargar: cargar,
  };
}

export function fmtCorte(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}
