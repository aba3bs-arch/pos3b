import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AVISO_FALTA_NOMINA,
  cargarDatosNomina,
  cargarLineasPeriodo,
  guardarPeriodoNomina,
  guardarSueldoDefault,
  lineasDesdeEmpleados,
  listarPeriodosNomina,
  totalLineaNomina,
} from '../lib/nomina.js';
import { fusionarLineasNomina, otrosDeudasLinea, recalcularLineaNomina, sueldoBrutoLinea, pagoNominaLinea } from '../lib/nominaCalculos.js';
import { periodoSemanaNomina, etiquetaSemanaNomina } from '../lib/semanaNomina.js';
import { ETIQUETA_AREA, PAGADORES_NOMINA } from '../lib/contabilidadConstants.js';
import { imprimirNomina, imprimirReciboNominaIndividual, imprimirTodosRecibosNomina } from '../lib/impresionContabilidad.js';
import { empleadosParaNominaGlobal } from '../lib/empleadosVisibles.js';
import { leerBorradorNomina, guardarBorradorNomina, limpiarBorradorNomina } from '../lib/nominaBorrador.js';
import { cargarMapaSaldosArrastre } from '../lib/nominaSaldoArrastre.js';
import { reabrirPeriodoNomina } from '../lib/nominaReabrir.js';
import PanelAsistenciaGasolina from '../components/PanelAsistenciaGasolina.jsx';
import FiltroRangoCalendario from '../components/FiltroRangoCalendario.jsx';
import { normalizarRol } from '../lib/roles.js';
import { etiquetaTienda } from '../constants/sucursales.js';

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function fmtPago(n) {
  const v = Number(n) || 0;
  if (v < 0) return `−${fmt(Math.abs(v))}`;
  return fmt(v);
}

const CAMPOS_MANUAL = {
  pagador_nomina: 'pagador_manual',
  dias_trabajados: 'dias_manual',
  salario_dia: 'sueldo_manual',
  deduccion_gastos: 'gastos_manual',
  deduccion_inventario: 'inventario_manual',
  deduccion_prestamos: 'prestamos_manual',
  deducciones: 'otros_manual',
  notas_otros: 'otros_manual',
};

const COLS = [
  'Empleado',
  'Rol',
  'Pagador',
  '$/día',
  'Días',
  'Sueldo',
  'Bono',
  'Consumos',
  'Inventario',
  'Préstamos',
  'Otros',
  'Arrastre',
  'Pago',
  '',
];

export default function Nomina({ supabase, sucursal, user }) {
  const semana = useMemo(() => periodoSemanaNomina(), []);
  const esAdmin = normalizarRol(user?.rol) === 'Administrador';
  const [aviso, setAviso] = useState('');
  const [err, setErr] = useState('');
  const [cargando, setCargando] = useState(false);
  const [periodos, setPeriodos] = useState([]);
  const [periodoSel, setPeriodoSel] = useState(null);
  const [lineasHist, setLineasHist] = useState([]);

  const [inicio, setInicio] = useState(semana.inicio);
  const [fin, setFin] = useState(semana.fin);
  const [pagadorFiltro, setPagadorFiltro] = useState('');
  const [notasPeriodo, setNotasPeriodo] = useState('');
  const [lineas, setLineas] = useState([]);
  const [empleadosCache, setEmpleadosCache] = useState([]);
  const [excluidos, setExcluidos] = useState(() => new Set(leerBorradorNomina()?.excluidos || []));
  const [modoNomina, setModoNomina] = useState(() => (leerBorradorNomina()?.modo === 'manual' ? 'manual' : 'automatico'));
  const [borradorListo, setBorradorListo] = useState(false);
  const [saldosArrastre, setSaldosArrastre] = useState({});

  const modoManual = modoNomina === 'manual';
  const totalGeneral = useMemo(() => lineas.reduce((a, l) => a + totalLineaNomina(l), 0), [lineas]);

  const cargarEmpleadosYGastos = useCallback(
    async (opts = {}) => {
      if (!supabase) return;
      const { fusionar = true, lineasBase = null, excluidosIds = excluidos } = opts;
      setCargando(true);
      setErr('');
      const { data: empleados, error } = await supabase
        .from('usuarios')
        .select('id, nombre, rol, sucursal_id, nomina_pagador, turno_id, turno_horario')
        .order('nombre');
      if (error) {
        setErr(error.message);
        setCargando(false);
        return;
      }
      const lista = empleadosParaNominaGlobal(empleados || []);
      const { gastosRes, prestRes, cortesRes, valesRes, asistenciasRes } = await cargarDatosNomina(supabase, {
        desde: inicio,
        hasta: fin,
        empleados: lista,
        todasSucursales: true,
        sucursal,
      });
      if (gastosRes.error) setErr(gastosRes.error);
      if (prestRes.error) setErr(prestRes.error);
      if (cortesRes.error) setErr(cortesRes.error);
      if (valesRes.error) setErr(valesRes.error);
      if (asistenciasRes?.error) setErr(asistenciasRes.error);

      const lineasNuevas = lineasDesdeEmpleados(lista, {
        gastosMap: gastosRes.map,
        prestamosMap: prestRes.map,
        cortesMap: cortesRes.map,
        valesGasolinaMap: valesRes.map,
        valesGasolinaNoCobradosMap: valesRes.mapNoCobrados,
        asistenciasMap: asistenciasRes?.map || {},
        pagadorFiltro,
        arrastreMap: saldosArrastre,
      }).filter((l) => !excluidosIds.has(String(l.usuario_id)));

      setLineas((prev) => {
        const base = lineasBase ?? (fusionar ? prev : null);
        return fusionar && base?.length ? fusionarLineasNomina(base, lineasNuevas) : lineasNuevas;
      });
      setEmpleadosCache(lista);
      setCargando(false);
    },
    [supabase, sucursal, inicio, fin, pagadorFiltro, excluidos, saldosArrastre],
  );

  const cargarPeriodos = useCallback(async () => {
    if (!supabase) return;
    const res = await listarPeriodosNomina(supabase, { todasSucursales: true });
    if (res.aviso) setAviso(res.aviso);
    if (res.error) setErr(res.error);
    else setPeriodos(res.data || []);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    cargarMapaSaldosArrastre(supabase).then(setSaldosArrastre);
  }, [supabase]);

  useEffect(() => {
    const b = leerBorradorNomina();
    if (b && !borradorListo) {
      if (b.inicio) setInicio(b.inicio);
      if (b.fin) setFin(b.fin);
      if (b.pagadorFiltro != null) setPagadorFiltro(b.pagadorFiltro);
      if (b.notasPeriodo) setNotasPeriodo(b.notasPeriodo);
      if (Array.isArray(b.excluidos)) setExcluidos(new Set(b.excluidos));
      if (b.modo === 'manual' || b.modo === 'automatico') setModoNomina(b.modo);
      setBorradorListo(true);
    } else if (!borradorListo) {
      setBorradorListo(true);
    }
  }, [borradorListo]);

  useEffect(() => {
    if (!supabase || !borradorListo) return;
    const b = leerBorradorNomina();
    const mismoPeriodo = b?.inicio === inicio && b?.fin === fin;
    const lineasBase = mismoPeriodo && Array.isArray(b?.lineas) && b.lineas.length ? b.lineas : null;
    // Restaurar borrador del mismo periodo también en automático: no perder salarios,
    // bonos, otros ni ajustes manuales al reiniciar sesión.
    if (lineasBase) {
      for (const l of lineasBase) {
        if (l?.usuario_id && (l.sueldo_manual || Number(l.salario_dia ?? l.sueldo_tarifa) > 0)) {
          guardarSueldoDefault(l.usuario_id, l.salario_dia ?? l.sueldo_tarifa);
        }
      }
    }
    cargarEmpleadosYGastos({
      fusionar: Boolean(lineasBase) || modoNomina === 'manual',
      lineasBase,
    });
    cargarPeriodos();
    // modoNomina no va en deps: el cambio de modo se maneja en cambiarModoNomina
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, borradorListo, inicio, fin, pagadorFiltro, excluidos, cargarEmpleadosYGastos, cargarPeriodos]);

  useEffect(() => {
    if (!borradorListo) return;
    // Evitar pisar el borrador guardado con un arreglo vacío antes de terminar la carga inicial.
    if (lineas.length === 0) {
      const b = leerBorradorNomina();
      if (b?.lineas?.length && b.inicio === inicio && b.fin === fin) return;
    }
    guardarBorradorNomina({
      inicio,
      fin,
      pagadorFiltro,
      notasPeriodo,
      lineas,
      excluidos: [...excluidos],
      modo: modoNomina,
    });
  }, [lineas, inicio, fin, pagadorFiltro, notasPeriodo, excluidos, modoNomina, borradorListo]);

  const cambiarModoNomina = (nuevo) => {
    if (nuevo === modoNomina) return;
    if (nuevo === 'automatico') {
      if (
        !confirm(
          '¿Pasar a modo Automático?\n\nSe recalcularán días desde el reloj checador (retardos: los primeros 4 cuentan; desde el 5º ese día no se paga) y consumos/inventario desde cortes Virtual, Abarrotes y Garage.',
        )
      ) {
        return;
      }
      setModoNomina('automatico');
      // Recalcula días/deducciones pero conserva salarios fijos y ajustes manuales del borrador.
      void cargarEmpleadosYGastos({ fusionar: true });
      return;
    }
    setModoNomina('manual');
  };

  const actualizarLinea = (idx, campo, valor) => {
    setLineas((prev) => {
      const next = [...prev];
      const l = { ...next[idx], [campo]: valor };
      const flagManual = CAMPOS_MANUAL[campo];
      if (flagManual) l[flagManual] = true;

      if (campo === 'salario_dia') {
        l.sueldo_tarifa = Number(valor) || 0;
        if (l.usuario_id) guardarSueldoDefault(l.usuario_id, l.sueldo_tarifa);
      }

      if (campo === 'dias_trabajados' && !l.es_indirecto) {
        l.cortes_periodo = Number(valor) || 0;
      }
      if (campo === 'dias_trabajados' && l.es_indirecto) {
        l.vales_gasolina = Number(valor) || 0;
      }

      next[idx] = recalcularLineaNomina(l);
      return next;
    });
  };

  const usarSemanaActual = () => {
    const s = periodoSemanaNomina();
    setInicio(s.inicio);
    setFin(s.fin);
  };

  const guardar = async () => {
    if (!supabase) return alert('Sin conexión a Supabase.');
    if (!inicio || !fin) return alert('Indica inicio y fin del periodo.');
    if (lineas.length === 0) return alert('No hay empleados para la nómina.');
    if (
      !confirm(
        `¿Cerrar nómina del ${inicio} al ${fin}?\n\n` +
          `Se consolidan deducciones de todas las sucursales.\n` +
          `Se marcarán consumos de cortes y se aplicarán abonos a préstamos.`,
      )
    )
      return;
    setCargando(true);
    setErr('');
    const res = await guardarPeriodoNomina(supabase, {
      periodo: {
        sucursal_id: 'MAIN',
        periodo_inicio: inicio,
        periodo_fin: fin,
        estado: 'cerrado',
        notas: notasPeriodo.trim() || 'Nómina consolidada — todas las sucursales',
        pagador_filtro: pagadorFiltro || null,
        created_by: user?.nombre || user?.id || null,
      },
      lineas,
      empleados: empleadosCache,
      todasSucursales: true,
    });
    setCargando(false);
    if (!res.ok) {
      if (String(res.error).includes('fix_contabilidad')) setAviso(res.error);
      return alert(res.error || 'No se pudo guardar.');
    }
    alert(`Nómina guardada. Total: ${fmt(res.total)}`);
    setNotasPeriodo('');
    limpiarBorradorNomina();
    cargarMapaSaldosArrastre(supabase).then(setSaldosArrastre);
    cargarPeriodos();
    cargarEmpleadosYGastos({ fusionar: false });
  };

  const imprimirReciboEmpleado = (linea, periodo = {}) => {
    imprimirReciboNominaIndividual(linea, {
      periodo_inicio: periodo.periodo_inicio ?? inicio,
      periodo_fin: periodo.periodo_fin ?? fin,
      notas: periodo.notas ?? notasPeriodo,
      fechaPago: periodo.created_at || undefined,
    });
  };

  const imprimir = () => {
    imprimirNomina({
      periodo_inicio: inicio,
      periodo_fin: fin,
      pagador_filtro: pagadorFiltro,
      notas: notasPeriodo,
      lineas,
      total: totalGeneral,
    });
  };

  const verPeriodo = async (p) => {
    setPeriodoSel(p);
    setLineasHist([]);
    if (!supabase || !p?.id) return;
    const res = await cargarLineasPeriodo(supabase, p.id);
    if (res.error) return alert(res.error);
    setLineasHist(res.data || []);
  };

  const reabrirPeriodo = async () => {
    if (!esAdmin) return alert('Solo el administrador puede reabrir nóminas cerradas.');
    if (!periodoSel?.id || !supabase) return;
    if (
      !window.confirm(
        `¿Reabrir la nómina del ${periodoSel.periodo_inicio} al ${periodoSel.periodo_fin}?\n\n` +
          'Se revertirán gastos y abonos de préstamos de ese cierre, se quitará el arrastre generado y podrás editar de nuevo.\n' +
          'Solo funciona con la nómina más reciente cerrada.',
      )
    ) {
      return;
    }
    setCargando(true);
    setErr('');
    const res = await reabrirPeriodoNomina(supabase, periodoSel.id);
    setCargando(false);
    if (!res.ok) return alert(res.error || 'No se pudo reabrir.');

    setInicio(res.periodo.periodo_inicio);
    setFin(res.periodo.periodo_fin);
    setPagadorFiltro(res.periodo.pagador_filtro || '');
    setNotasPeriodo(res.periodo.notas || '');
    setLineas(res.lineas || []);
    setSaldosArrastre(res.arrastreMap || {});
    setExcluidos(new Set());
    setPeriodoSel(null);
    setLineasHist([]);
    guardarBorradorNomina({
      inicio: res.periodo.periodo_inicio,
      fin: res.periodo.periodo_fin,
      pagadorFiltro: res.periodo.pagador_filtro || '',
      notasPeriodo: res.periodo.notas || '',
      lineas: res.lineas || [],
      excluidos: [],
      modo: 'manual',
    });
    setModoNomina('manual');
    cargarPeriodos();
    alert(
      `Nómina reabierta para corrección.\n` +
        `Gastos desmarcados: ${res.gastosRevertidos || 0}.\n` +
        'Edita los datos y vuelve a usar «Cerrar nómina» cuando esté lista.',
    );
  };

  const imprimirHistorial = () => {
    if (!periodoSel) return;
    imprimirNomina({
      periodo_inicio: periodoSel.periodo_inicio,
      periodo_fin: periodoSel.periodo_fin,
      pagador_filtro: periodoSel.pagador_filtro,
      notas: periodoSel.notas,
      lineas: lineasHist,
      total: lineasHist.reduce((a, l) => a + (Number(l.total) || 0), 0),
    });
  };

  const quitarEmpleado = (linea) => {
    if (!window.confirm(`¿Quitar a ${linea.nombre} de esta nómina?`)) return;
    const id = String(linea.usuario_id);
    setExcluidos((prev) => new Set([...prev, id]));
    setLineas((prev) => prev.filter((l) => String(l.usuario_id) !== id));
  };

  const restaurarExcluidos = () => {
    if (!excluidos.size) return;
    if (!window.confirm('¿Volver a incluir todos los empleados quitados?')) return;
    setExcluidos(new Set());
  };

  const imprimirTodosRecibos = () => {
    if (!lineas.length) return;
    imprimirTodosRecibosNomina(lineas, {
      periodo_inicio: inicio,
      periodo_fin: fin,
      notas: notasPeriodo,
    });
  };

  const renderFila = (l, i, { historial = false } = {}) => {
    const key = historial ? l.id : l.usuario_id || i;
    const autoBloqueado = !historial && !modoManual;
    return (
      <tr key={key}>
        <td>
          <div style={{ fontWeight: 600 }}>{l.nombre}</div>
          {l.sucursal_id && (
            <span className="muted" style={{ fontSize: '0.68rem' }}>
              {etiquetaTienda(l.sucursal_id)}
            </span>
          )}
          {l.es_indirecto && (
            <span className="muted" style={{ display: 'block', fontSize: '0.68rem' }}>
              indirecto
            </span>
          )}
        </td>
        <td className="muted" style={{ fontSize: '0.82rem' }}>
          {l.rol}
        </td>
        <td>
          {historial ? (
            ETIQUETA_AREA[l.pagador_nomina] || l.pagador_nomina
          ) : (
            <select
              className="select"
              style={{ minWidth: '96px', fontSize: '0.78rem', padding: '0.2rem' }}
              value={l.pagador_nomina || 'abarrotes'}
              onChange={(e) => actualizarLinea(i, 'pagador_nomina', e.target.value)}
            >
              {PAGADORES_NOMINA.map((a) => (
                <option key={a} value={a}>
                  {ETIQUETA_AREA[a]}
                </option>
              ))}
            </select>
          )}
        </td>
        <td>
          {historial ? (
            fmt(l.salario_dia ?? l.sueldo_tarifa)
          ) : (
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              style={{ width: '72px' }}
              title={l.es_indirecto ? 'Pago por vale de gasolina' : 'Salario por día trabajado'}
              value={l.salario_dia ?? l.sueldo_tarifa ?? 0}
              onChange={(e) => actualizarLinea(i, 'salario_dia', e.target.value)}
            />
          )}
        </td>
        <td title={l.es_indirecto ? `Vales: ${l.vales_gasolina}` : `Asistencias: ${l.asistencias_periodo ?? 0} · Retardos: ${l.retardos_periodo ?? 0} · Cortes ref: ${l.cortes_periodo}`}>
          {historial || autoBloqueado ? (
            <>
              <strong>{l.dias_trabajados ?? '—'}</strong>
              {!historial && (
                <span className="muted" style={{ fontSize: '0.62rem', display: 'block' }}>
                  {l.es_indirecto
                    ? `auto: ${l.vales_gasolina}`
                    : (l.asistencias_periodo || 0) > 0
                      ? `asist ${l.asistencias_periodo}${l.retardos_periodo ? ` · ret ${l.retardos_periodo}` : ''}`
                      : `cortes: ${l.cortes_periodo}`}
                </span>
              )}
            </>
          ) : (
            <>
              <input
                className="input"
                type="number"
                min="0"
                step="1"
                style={{ width: '52px' }}
                value={l.dias_trabajados}
                onChange={(e) => actualizarLinea(i, 'dias_trabajados', e.target.value)}
              />
              <span className="muted" style={{ fontSize: '0.62rem', display: 'block' }}>
                {l.es_indirecto
                  ? `auto: ${l.vales_gasolina}`
                  : (l.asistencias_periodo || 0) > 0
                    ? `asist ${l.asistencias_periodo}${l.retardos_periodo ? ` · ret ${l.retardos_periodo}` : ''}`
                    : `cortes: ${l.cortes_periodo}`}
              </span>
            </>
          )}
        </td>
        <td style={{ fontWeight: 600 }} title="Días × salario por día">
          {fmt(historial ? l.sueldo_base : sueldoBrutoLinea(l))}
        </td>
        <td>
          {historial ? (
            fmt(l.bonificacion)
          ) : (
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              style={{ width: '72px' }}
              value={l.bonificacion}
              onChange={(e) => actualizarLinea(i, 'bonificacion', e.target.value)}
            />
          )}
        </td>
        <td style={{ color: l.deduccion_gastos > 0 ? 'var(--danger)' : undefined }} title={l.notas}>
          {historial || autoBloqueado ? (
            fmt(l.deduccion_gastos)
          ) : (
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              style={{ width: '72px' }}
              value={l.deduccion_gastos}
              onChange={(e) => actualizarLinea(i, 'deduccion_gastos', e.target.value)}
            />
          )}
        </td>
        <td style={{ color: l.deduccion_inventario > 0 ? 'var(--danger)' : undefined }}>
          {historial || autoBloqueado ? (
            fmt(l.deduccion_inventario)
          ) : (
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              style={{ width: '72px' }}
              value={l.deduccion_inventario ?? 0}
              onChange={(e) => actualizarLinea(i, 'deduccion_inventario', e.target.value)}
            />
          )}
        </td>
        <td style={{ color: l.deduccion_prestamos > 0 ? 'var(--danger)' : undefined }} title={l.notas}>
          {historial || autoBloqueado ? (
            fmt(l.deduccion_prestamos)
          ) : (
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              style={{ width: '72px' }}
              value={l.deduccion_prestamos ?? 0}
              onChange={(e) => actualizarLinea(i, 'deduccion_prestamos', e.target.value)}
            />
          )}
        </td>
        <td>
          {historial ? (
            <>
              {fmt(l.deducciones)}
              {l.notas_otros && (
                <span className="muted" style={{ fontSize: '0.62rem', display: 'block' }}>
                  Otros: {l.notas_otros}
                </span>
              )}
            </>
          ) : (
            <>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                style={{ width: '72px' }}
                title={l.deduccion_faltas > 0 ? `Incluye faltas gasolina: ${fmt(l.deduccion_faltas)}` : 'Otros — deducciones manuales'}
                value={l.deducciones}
                onChange={(e) => actualizarLinea(i, 'deducciones', e.target.value)}
              />
              <input
                className="input"
                type="text"
                placeholder="Concepto (otros)"
                style={{ width: '88px', marginTop: '0.2rem', fontSize: '0.72rem' }}
                value={l.notas_otros || ''}
                onChange={(e) => actualizarLinea(i, 'notas_otros', e.target.value)}
              />
            </>
          )}
          {!historial && l.deduccion_faltas > 0 && (
            <span className="muted" style={{ fontSize: '0.62rem', display: 'block' }}>
              +faltas {fmt(l.deduccion_faltas)}
            </span>
          )}
        </td>
        <td
          style={{ color: (l.deduccion_arrastre || 0) > 0 ? 'var(--brand-red)' : undefined }}
          title="Deuda de nóminas anteriores (gastos mayores al sueldo)"
        >
          {(l.deduccion_arrastre || 0) > 0 ? fmt(l.deduccion_arrastre) : historial ? '—' : '—'}
        </td>
        <td
          style={{
            fontWeight: 800,
            whiteSpace: 'nowrap',
            color: (historial ? l.pago ?? l.total : pagoNominaLinea(l)) < 0 ? 'var(--brand-red)' : 'var(--brand-blue)',
          }}
        >
          {fmtPago(historial ? l.pago ?? l.total : pagoNominaLinea(l))}
          {!historial && (l.saldo_pendiente || 0) > 0 && (
            <span className="muted" style={{ fontSize: '0.62rem', display: 'block' }}>
              → próx. {fmt(l.saldo_pendiente)}
            </span>
          )}
        </td>
        <td>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
              onClick={() => imprimirReciboEmpleado(l, historial ? periodoSel : {})}
              title="Imprimir recibo individual"
            >
              Recibo
            </button>
            {!historial && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem', color: 'var(--brand-red)' }}
                onClick={() => quitarEmpleado(l)}
                title="Quitar de esta nómina"
              >
                Quitar
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {aviso && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', background: 'rgba(225,153,41,0.08)' }}>
          <strong>Configuración pendiente</strong>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>{aviso || AVISO_FALTA_NOMINA}</p>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Nómina semanal</h3>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', maxWidth: '52rem' }}>
              Consolidada de <strong>todas las sucursales</strong>. Semana sábado–viernes.
              <strong> Pago = (días × $/día) + bono − consumos − inventario − préstamos − otros − arrastre.</strong>
              {modoManual
                ? ' Modo Manual: puedes editar todos los campos a mano.'
                : ' Modo Automático: días desde el reloj checador (tarde cuenta; desde el 5º retardo ese día no se paga). Consumos/inventario de cortes Virtual, Abarrotes y Garage.'}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.45rem' }}>
            <div
              style={{
                padding: '0.4rem 0.65rem',
                borderRadius: 8,
                background: 'rgba(26,82,118,0.08)',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'var(--brand-blue)',
              }}
            >
              Todas las sucursales
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className={!modoManual ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                onClick={() => cambiarModoNomina('automatico')}
              >
                Automático
              </button>
              <button
                type="button"
                className={modoManual ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                onClick={() => cambiarModoNomina('manual')}
              >
                Manual
              </button>
            </div>
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: '0.75rem' }}>
          <FiltroRangoCalendario
            desde={inicio}
            hasta={fin}
            onDesdeChange={setInicio}
            onHastaChange={setFin}
            labelDesde="Inicio (sábado)"
            labelHasta="Fin (viernes)"
          />
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
            Pagador
            <select className="select" value={pagadorFiltro} onChange={(e) => setPagadorFiltro(e.target.value)}>
              <option value="">Todos</option>
              {PAGADORES_NOMINA.map((a) => (
                <option key={a} value={a}>
                  {ETIQUETA_AREA[a]}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={usarSemanaActual}>
              Semana actual ({etiquetaSemanaNomina(semana.inicio, semana.fin)})
            </button>
          </div>
          <textarea
            className="input"
            placeholder="Notas del periodo (opcional)"
            style={{ gridColumn: '1 / -1', minHeight: '56px' }}
            value={notasPeriodo}
            onChange={(e) => setNotasPeriodo(e.target.value)}
          />
        </div>

        {err && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{err}</p>}

        <div className="table-wrap table-wrap-sticky-head">
          <table className="data" style={{ fontSize: '0.82rem' }}>
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c || 'act'}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => renderFila(l, i))}
              {lineas.length === 0 && (
                <tr>
                  <td colSpan={COLS.length} className="muted">
                    {cargando ? 'Cargando…' : 'Sin empleados para este filtro.'}
                  </td>
                </tr>
              )}
            </tbody>
            {lineas.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={COLS.length - 2} style={{ textAlign: 'right', fontWeight: 700 }}>
                    Total pago
                  </td>
                  <td style={{ fontWeight: 800, color: totalGeneral < 0 ? 'var(--brand-red)' : 'var(--brand-blue)' }}>{fmtPago(totalGeneral)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" disabled={cargando || lineas.length === 0} onClick={guardar}>
            Cerrar nómina
          </button>
          <button type="button" className="btn btn-ghost" disabled={lineas.length === 0} onClick={imprimir}>
            Imprimir nómina
          </button>
          <button type="button" className="btn btn-ghost" disabled={lineas.length === 0} onClick={imprimirTodosRecibos}>
            Recibos por empleado
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={cargando}
            onClick={() => cargarEmpleadosYGastos({ fusionar: true })}
          >
            {modoManual ? 'Recalcular (conservar manual)' : 'Recalcular deducciones'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={cargando}
            onClick={() => {
              if (
                !confirm(
                  '¿Recargar todo desde cero?\n\nSe actualizarán días y deducciones automáticas. Los salarios por día guardados se conservan; bonos y “otros” del borrador se pierden.',
                )
              ) {
                return;
              }
              void cargarEmpleadosYGastos({ fusionar: false });
            }}
          >
            Recargar todo
          </button>
          {excluidos.size > 0 && (
            <button type="button" className="btn btn-ghost" onClick={restaurarExcluidos}>
              Restaurar quitados ({excluidos.size})
            </button>
          )}
        </div>
      </div>

      {esAdmin && (
        <PanelAsistenciaGasolina supabase={supabase} sucursal={sucursal} user={user} desde={inicio} hasta={fin} />
      )}

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Historial</h3>
        {esAdmin && (
          <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 0.65rem' }}>
            Administrador: abre un periodo con <strong>Ver</strong> y usa <strong>Reabrir para corregir</strong> (solo el más reciente).
          </p>
        )}
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Pagador</th>
                <th>Total</th>
                <th>Registrado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.periodo_inicio} — {p.periodo_fin}
                  </td>
                  <td>{p.pagador_filtro ? ETIQUETA_AREA[p.pagador_filtro] || p.pagador_filtro : 'Todos'}</td>
                  <td>{fmt(p.total)}</td>
                  <td className="muted">{p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</td>
                  <td>
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem' }} onClick={() => verPeriodo(p)}>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {periodoSel && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h4 style={{ margin: 0 }}>
                Detalle: {periodoSel.periodo_inicio} — {periodoSel.periodo_fin}
              </h4>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" onClick={imprimirHistorial}>
                  Imprimir nómina
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    imprimirTodosRecibosNomina(lineasHist, {
                      periodo_inicio: periodoSel.periodo_inicio,
                      periodo_fin: periodoSel.periodo_fin,
                      notas: periodoSel.notas,
                    })
                  }
                >
                  Recibos por empleado
                </button>
                {esAdmin && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: 'var(--brand-gold-dark)' }}
                    disabled={cargando}
                    onClick={reabrirPeriodo}
                    title="Solo la nómina más reciente. Revierte gastos y préstamos aplicados."
                  >
                    Reabrir para corregir
                  </button>
                )}
              </div>
            </div>
            <div className="table-wrap table-wrap-sticky-head" style={{ marginTop: '0.5rem' }}>
              <table className="data" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    {COLS.map((c) => (
                      <th key={c || 'act'}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>{lineasHist.map((l, i) => renderFila(l, i, { historial: true }))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
