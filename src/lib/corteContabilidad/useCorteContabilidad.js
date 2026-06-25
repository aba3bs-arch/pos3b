import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { turnoActual, nombreTurnoLegible } from '../turnos.js';
import { permisosCorteContabilidad } from './permisos.js';
import {
  AVISO_FALTA_CORTES,
  agregarGastoTurno,
  cargarEstadoCorte,
  eliminarGastoTurno,
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
  const saveTimer = useRef(null);
  const perm = useMemo(() => permisosCorteContabilidad(user?.rol), [user?.rol]);
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

  const cargar = useCallback(async () => {
    setCargando(true);
    const [estRes, gasRes, histRes] = await Promise.all([
      cargarEstadoCorte(supabase, sucursal, modulo),
      listarGastosTurno(supabase, sucursal, modulo),
      listarCierresCorte(supabase, sucursal, modulo, 15),
    ]);
    if (estRes.aviso || gasRes.aviso) setAviso(estRes.aviso || gasRes.aviso || '');
    setEstado(estRes.estado || {});
    setGastos(gasRes.data || []);
    setHistorial(histRes.data || []);
    if (!estRes.estado?.folio && modulo !== 'abarrotes') {
      const f = await peekFolio(supabase, sucursal, modulo);
      setFolio(f);
    } else if (modulo === 'abarrotes') {
      setFolio(estRes.estado?.folio || 'AB-001');
    } else {
      setFolio(estRes.estado?.folio || '');
    }
    setCargando(false);
  }, [supabase, sucursal, modulo]);

  useEffect(() => {
    cargar();
    return () => clearTimeout(saveTimer.current);
  }, [cargar]);

  const agregarGasto = async (gasto) => {
    if (!perm.gastos) return;
    const res = await agregarGastoTurno(supabase, sucursal, modulo, {
      ...gasto,
      usuario_id: user?.id,
      usuario_nombre: user?.nombre,
    });
    if (!res.ok) return alert(res.error);
    const gas = await listarGastosTurno(supabase, sucursal, modulo);
    setGastos(gas.data || []);
  };

  const quitarGasto = async (id) => {
    if (!perm.gastos) return;
    const res = await eliminarGastoTurno(supabase, id, sucursal, modulo);
    if (!res.ok) return alert(res.error);
    setGastos((prev) => prev.filter((g) => String(g.id) !== String(id)));
  };

  const cerrarCorte = async (detalleExtra = {}) => {
    if (!perm.guardar) return alert('No tiene permiso para cerrar este corte.');
    const payload = {
      sucursal_id: sucursal || 'MAIN',
      modulo,
      folio: modulo === 'abarrotes' ? estado.folio || folio : folio,
      turno: turnoActual(),
      usuario_id: user?.id || null,
      usuario_nombre: user?.nombre || null,
      caja_actual: calc.cajaActual ?? calc.caja_actual ?? 0,
      ventas: calc.venta ?? 0,
      detalle: {
        ...estado,
        gastos,
        gastos_total: calc.gastosTotal,
        subtotal: calc.subtotal,
        comentarios: estado.comentarios || '',
        ...detalleExtra,
      },
    };
    const res = await registrarCierreCorte(supabase, payload);
    if (!res.ok) return alert(res.error || AVISO_FALTA_CORTES);

    await limpiarGastosTurno(supabase, sucursal, modulo);
    const nuevoEstado = prepararTrasCierre(estado, calc);
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
    alert('Corte cerrado y guardado en historial contabilidad.');
  };

  return {
    estado,
    patchEstado,
    gastos,
    agregarGasto,
    quitarGasto,
    calc,
    folio,
    setFolio,
    turno,
    perm,
    aviso,
    cargando,
    historial,
    cerrarCorte,
    recargar: cargar,
  };
}

export function fmtCorte(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}
