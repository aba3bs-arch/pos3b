import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { turnoActual, nombreTurnoLegible } from '../turnos.js';
import { empleadosParaCorte } from '../empleadosVisibles.js';
import { permisosCorteContabilidad, puedeEditarCorteCampo } from './permisos.js';
import { gastoRequiereEmpleado } from './catalogoGastos.js';
import {
  AVISO_FALTA_CORTES,
  agregarGastoTurno,
  cargarEstadoCorte,
  eliminarGastoTurno,
  actualizarGastoTurno,
  guardarEstadoCorte,
  limpiarGastosTurno,
  listarGastosTurno,
  listarCierresCorte,
  peekFolio,
  registrarCierreCorte,
  siguienteFolio,
} from './store.js';

export function useCorteContabilidad({ supabase, sucursal, modulo, user, calcFn, prepararTrasCierre }) {
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
  const turno = useMemo(() => nombreTurnoLegible(turnoActual()), []);

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
      if (
        ('moneda_inicial' in filtrado ||
          'moneda_inicial_turno' in filtrado ||
          'recoleccion' in filtrado ||
          'recoleccion_turno' in filtrado) &&
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
    setEstado(estRes.estado || {});
    setGastos(gasRes.data || []);
    setHistorial(histRes.data || []);
    setEmpleados(
      empleadosParaCorte(empRes.data || [], sucursal, modulo, user?.rol, { turno: turnoActual() }),
    );
    if (!estRes.estado?.folio && modulo !== 'abarrotes') {
      const f = await peekFolio(supabase, sucursal, modulo);
      setFolio(f);
    } else if (modulo === 'abarrotes') {
      setFolio(estRes.estado?.folio || 'AB-001');
    } else {
      setFolio(estRes.estado?.folio || '');
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
    const esActualizacion =
      detalleExtra.tipo_cierre === 'actualizacion' || detalleExtra.tipo_cierre === 'recoleccion';
    if (esActualizacion) {
      if (!perm.recoleccion) return alert('Solo el recolector (administrador o privilegio de recolección) puede actualizar la moneda inicial.');
    } else if (!perm.guardar) {
      return alert('No tiene permiso para cerrar este corte.');
    }

    const payload = {
      sucursal_id: sucursal || 'MAIN',
      modulo,
      folio: modulo === 'abarrotes' ? estado.folio || folio : folio,
      turno: turnoActual(),
      usuario_id: user?.id || null,
      usuario_nombre: user?.nombre || null,
      caja_actual: detalleExtra.caja_actual_cierre ?? calc.cajaActual ?? calc.caja_actual ?? 0,
      ventas: calc.venta ?? 0,
      detalle: {
        ...estado,
        ...(detalleExtra.recoleccion != null
          ? { recoleccion: detalleExtra.recoleccion, recoleccion_turno: detalleExtra.recoleccion_turno ?? detalleExtra.recoleccion }
          : {}),
        gastos,
        gastos_total: calc.gastosTotal,
        subtotal: calc.subtotal,
        venta_neta: calc.ventaNeta,
        total_lectura: calc.totalLectura,
        comentarios: estado.comentarios || '',
        ...detalleExtra,
        tipo_cierre: esActualizacion ? 'actualizacion' : detalleExtra.tipo_cierre || 'cierre',
      },
    };
    delete payload.detalle.caja_actual_cierre;
    const res = await registrarCierreCorte(supabase, payload);
    if (!res.ok) return alert(res.error || AVISO_FALTA_CORTES);

    await limpiarGastosTurno(supabase, sucursal, modulo);
    const nuevoEstado = prepararTrasCierre(estado, calc, { esActualizacion });
    if (modulo !== 'abarrotes') {
      const nuevoFolio = await siguienteFolio(supabase, sucursal, modulo);
      setFolio(nuevoFolio);
      nuevoEstado.folio = nuevoFolio;
    }
    await guardarEstadoCorte(supabase, sucursal, modulo, nuevoEstado);
    setEstado(nuevoEstado);
    setGastos([]);
    const hist = await listarCierresCorte(supabase, sucursal, modulo, 15);
    setHistorial(hist.data || []);
    alert(esActualizacion ? 'Moneda inicial actualizada. Corte registrado como actualización.' : 'Corte cerrado y guardado en historial contabilidad.');
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
    recargar: cargar,
  };
}

export function fmtCorte(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}
