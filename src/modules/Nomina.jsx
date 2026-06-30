import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AVISO_FALTA_NOMINA,
  cargarLineasPeriodo,
  guardarPeriodoNomina,
  lineasDesdeEmpleados,
  listarPeriodosNomina,
  recalcularSueldoLinea,
  totalLineaNomina,
} from '../lib/nomina.js';
import { gastosDeduccionPorEmpleado } from '../lib/nominaGastos.js';
import { prestamosDeduccionPorEmpleado } from '../lib/nominaPrestamos.js';
import { cortesPorEmpleado, fusionarLineasNomina, valesGasolinaPorEmpleado } from '../lib/nominaCalculos.js';
import { periodoSemanaNomina, etiquetaSemanaNomina } from '../lib/semanaNomina.js';
import { ETIQUETA_AREA, PAGADORES_NOMINA } from '../lib/contabilidadConstants.js';
import { imprimirNomina, imprimirReciboNominaIndividual, imprimirTodosRecibosNomina } from '../lib/impresionContabilidad.js';
import { empleadosVisiblesParaTienda, enriquecerEmpleadosNominaIndirectos } from '../lib/empleadosVisibles.js';
import PanelAsistenciaGasolina from '../components/PanelAsistenciaGasolina.jsx';
import { normalizarRol } from '../lib/roles.js';

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

const CAMPOS_MANUAL = {
  pagador_nomina: 'pagador_manual',
  dias_trabajados: 'dias_manual',
  sueldo_base: 'sueldo_manual',
  sueldo_tarifa: 'sueldo_manual',
  deduccion_gastos: 'gastos_manual',
  deduccion_inventario: 'inventario_manual',
  deduccion_prestamos: 'prestamos_manual',
};

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

  const totalGeneral = useMemo(() => lineas.reduce((a, l) => a + totalLineaNomina(l), 0), [lineas]);

  const cargarEmpleadosYGastos = useCallback(
    async (opts = {}) => {
      if (!supabase) return;
      const { fusionar = false } = opts;
      setCargando(true);
      setErr('');
      const { data: empleados, error } = await supabase
        .from('usuarios')
        .select('id, nombre, rol, sucursal_id, nomina_pagador')
        .order('nombre');
      if (error) {
        setErr(error.message);
        setCargando(false);
        return;
      }
      const lista = enriquecerEmpleadosNominaIndirectos(
        empleadosVisiblesParaTienda(empleados || [], sucursal, user?.rol),
      );
      const [gastosRes, prestRes, cortesRes, valesRes] = await Promise.all([
        gastosDeduccionPorEmpleado(supabase, { sucursal, desde: inicio, hasta: fin, empleados: lista }),
        prestamosDeduccionPorEmpleado(supabase, { sucursal, empleados: lista }),
        cortesPorEmpleado(supabase, { sucursal, desde: inicio, hasta: fin }),
        valesGasolinaPorEmpleado(supabase, { sucursal, desde: inicio, hasta: fin, empleados: lista }),
      ]);
      if (gastosRes.error) setErr(gastosRes.error);
      if (prestRes.error) setErr(prestRes.error);
      if (cortesRes.error) setErr(cortesRes.error);
      if (valesRes.error) setErr(valesRes.error);

      const lineasNuevas = lineasDesdeEmpleados(lista, {
        gastosMap: gastosRes.map,
        prestamosMap: prestRes.map,
        cortesMap: cortesRes.map,
        valesGasolinaMap: valesRes.map,
        valesGasolinaNoCobradosMap: valesRes.mapNoCobrados,
        pagadorFiltro,
      });

      setLineas((prev) => (fusionar ? fusionarLineasNomina(prev, lineasNuevas) : lineasNuevas));
      setEmpleadosCache(lista);
      setCargando(false);
    },
    [supabase, sucursal, inicio, fin, pagadorFiltro, user?.rol],
  );

  const cargarPeriodos = useCallback(async () => {
    if (!supabase) return;
    const res = await listarPeriodosNomina(supabase, { sucursal });
    if (res.aviso) setAviso(res.aviso);
    if (res.error) setErr(res.error);
    else setPeriodos(res.data || []);
  }, [supabase, sucursal]);

  useEffect(() => {
    cargarEmpleadosYGastos();
    cargarPeriodos();
  }, [cargarEmpleadosYGastos, cargarPeriodos]);

  const actualizarLinea = (idx, campo, valor) => {
    setLineas((prev) => {
      const next = [...prev];
      const l = { ...next[idx], [campo]: valor };
      const flagManual = CAMPOS_MANUAL[campo];
      if (flagManual) l[flagManual] = true;

      if (campo === 'dias_trabajados' && !l.es_indirecto) {
        l.cortes_periodo = Number(valor) || 0;
      }
      if (campo === 'dias_trabajados' && l.es_indirecto) {
        l.vales_gasolina = Number(valor) || 0;
      }

      const recalc =
        !l.sueldo_manual &&
        (campo === 'dias_trabajados' || campo === 'sueldo_tarifa' || (campo === 'dias_trabajados' && l.es_indirecto));
      const actualizada = recalc ? recalcularSueldoLinea(l) : { ...l, total: totalLineaNomina(l) };
      next[idx] = actualizada;
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
    if (!confirm(`¿Cerrar nómina del ${inicio} al ${fin}?\nSe marcarán consumos de cortes y se aplicarán abonos a préstamos.`)) return;
    setCargando(true);
    setErr('');
    const res = await guardarPeriodoNomina(supabase, {
      periodo: {
        sucursal_id: sucursal || 'MAIN',
        periodo_inicio: inicio,
        periodo_fin: fin,
        estado: 'cerrado',
        notas: notasPeriodo.trim() || null,
        pagador_filtro: pagadorFiltro || null,
        created_by: user?.nombre || user?.id || null,
      },
      lineas,
      empleados: empleadosCache,
    });
    setCargando(false);
    if (!res.ok) {
      if (String(res.error).includes('fix_contabilidad')) setAviso(res.error);
      return alert(res.error || 'No se pudo guardar.');
    }
    alert(`Nómina guardada. Total: ${fmt(res.total)}`);
    setNotasPeriodo('');
    cargarPeriodos();
    cargarEmpleadosYGastos();
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

  const imprimirTodosRecibos = () => {
    if (!lineas.length) return;
    imprimirTodosRecibosNomina(lineas, {
      periodo_inicio: inicio,
      periodo_fin: fin,
      notas: notasPeriodo,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {aviso && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', background: 'rgba(225,153,41,0.08)' }}>
          <strong>Configuración pendiente</strong>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>{aviso}</p>
        </div>
      )}

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Nómina semanal</h3>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          Semana <strong>sábado a viernes</strong>. Cajeros: días = cortes cerrados en el periodo (editable). Indirectos (Luis Enrique, Misael, Gonzalo): pago por{' '}
          <strong>vales de gasolina cobrados</strong>; cada vale no cobrado descuenta 1 día. Los <strong>consumos</strong> se suman desde los tres cortes (Virtual, Abarrotes y Garage) al empleado correspondiente. «Recalcular gastos» actualiza consumos, préstamos e inventario{' '}
          <strong>sin borrar</strong> sueldos, días ni pagador si los editaste manualmente.
        </p>
        <div className="grid-2" style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
            Inicio (sábado)
            <input className="input" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
            Fin (viernes)
            <input className="input" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          </label>
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
          <table className="data">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Rol</th>
                <th>Pagador</th>
                <th title="Semanal para cajeros; por vale para indirectos">Tarifa</th>
                <th>{lineas.some((l) => l.es_indirecto) ? 'Días / vales' : 'Días'}</th>
                <th>Sueldo</th>
                <th>Bono</th>
                <th>Consumos</th>
                <th>Inventario</th>
                <th>Préstamos</th>
                <th title="Vale gasolina no cobrado = 1 día de falta">Faltas</th>
                <th>Otras ded.</th>
                <th>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={l.usuario_id || i}>
                  <td>
                    {l.nombre}
                    {l.es_indirecto && (
                      <span className="muted" style={{ display: 'block', fontSize: '0.7rem' }}>
                        indirecto
                      </span>
                    )}
                  </td>
                  <td className="muted">{l.rol}</td>
                  <td>
                    <select
                      className="select"
                      style={{ minWidth: '100px', fontSize: '0.8rem', padding: '0.2rem' }}
                      value={l.pagador_nomina || 'abarrotes'}
                      onChange={(e) => actualizarLinea(i, 'pagador_nomina', e.target.value)}
                    >
                      {PAGADORES_NOMINA.map((a) => (
                        <option key={a} value={a}>
                          {ETIQUETA_AREA[a]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      style={{ width: '80px' }}
                      title={l.es_indirecto ? 'Monto por vale de gasolina' : 'Sueldo semanal completo (7 días)'}
                      value={l.sueldo_tarifa ?? 0}
                      onChange={(e) => actualizarLinea(i, 'sueldo_tarifa', e.target.value)}
                    />
                  </td>
                  <td title={l.es_indirecto ? `Vales gasolina: ${l.vales_gasolina}` : `Cortes: ${l.cortes_periodo}`}>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1"
                      style={{ width: '56px' }}
                      value={l.dias_trabajados}
                      onChange={(e) => actualizarLinea(i, 'dias_trabajados', e.target.value)}
                    />
                    <span className="muted" style={{ fontSize: '0.65rem', display: 'block' }}>
                      {l.es_indirecto ? `auto: ${l.vales_gasolina}` : `auto: ${l.cortes_periodo}`}
                    </span>
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      style={{ width: '80px' }}
                      value={l.sueldo_base}
                      onChange={(e) => actualizarLinea(i, 'sueldo_base', e.target.value)}
                    />
                  </td>
                  <td>
                    <input className="input" type="number" min="0" step="0.01" style={{ width: '80px' }} value={l.bonificacion} onChange={(e) => actualizarLinea(i, 'bonificacion', e.target.value)} />
                  </td>
                  <td style={{ fontWeight: 700, color: l.deduccion_gastos > 0 ? 'var(--danger)' : undefined }} title={l.notas}>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      style={{ width: '80px' }}
                      value={l.deduccion_gastos}
                      onChange={(e) => actualizarLinea(i, 'deduccion_gastos', e.target.value)}
                    />
                  </td>
                  <td style={{ fontWeight: 700, color: l.deduccion_inventario > 0 ? 'var(--danger)' : undefined }}>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      style={{ width: '80px' }}
                      value={l.deduccion_inventario ?? 0}
                      onChange={(e) => actualizarLinea(i, 'deduccion_inventario', e.target.value)}
                    />
                  </td>
                  <td style={{ fontWeight: 700, color: l.deduccion_prestamos > 0 ? 'var(--danger)' : undefined }} title={l.notas}>
                    {fmt(l.deduccion_prestamos)}
                  </td>
                  <td style={{ fontWeight: 700, color: l.deduccion_faltas > 0 ? 'var(--danger)' : undefined }} title={l.faltas_gasolina > 0 ? `${l.faltas_gasolina} vale(s) no cobrado(s)` : undefined}>
                    {l.deduccion_faltas > 0 ? fmt(l.deduccion_faltas) : '—'}
                  </td>
                  <td>
                    <input className="input" type="number" min="0" step="0.01" style={{ width: '80px' }} value={l.deducciones} onChange={(e) => actualizarLinea(i, 'deducciones', e.target.value)} />
                  </td>
                  <td style={{ fontWeight: 700 }}>{fmt(l.total)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem' }}
                      onClick={() => imprimirReciboEmpleado(l)}
                      title="Imprimir recibo de este empleado"
                    >
                      Recibo
                    </button>
                  </td>
                </tr>
              ))}
              {lineas.length === 0 && (
                <tr>
                  <td colSpan={14} className="muted">
                    {cargando ? 'Cargando…' : 'Sin empleados para este filtro.'}
                  </td>
                </tr>
              )}
            </tbody>
            {lineas.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={12} style={{ textAlign: 'right', fontWeight: 700 }}>
                    Total nómina
                  </td>
                  <td style={{ fontWeight: 800, color: 'var(--brand-blue)' }}>{fmt(totalGeneral)}</td>
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
          <button type="button" className="btn btn-ghost" disabled={cargando} onClick={() => cargarEmpleadosYGastos({ fusionar: true })}>
            Recalcular gastos
          </button>
          <button type="button" className="btn btn-ghost" disabled={cargando} onClick={() => cargarEmpleadosYGastos({ fusionar: false })}>
            Recargar todo
          </button>
        </div>
      </div>

      {esAdmin && (
        <PanelAsistenciaGasolina supabase={supabase} sucursal={sucursal} user={user} desde={inicio} hasta={fin} />
      )}

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Historial</h3>
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
              <button type="button" className="btn btn-ghost" onClick={imprimirHistorial}>
                Imprimir
              </button>
            </div>
            <div className="table-wrap" style={{ marginTop: '0.5rem' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Empleado</th>
                    <th>Pagador</th>
                    <th>Días</th>
                    <th>Sueldo</th>
                    <th>Bono</th>
                    <th>Consumos</th>
                    <th>Inventario</th>
                    <th>Préstamos</th>
                    <th>Ded.</th>
                    <th>Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lineasHist.map((l) => (
                    <tr key={l.id}>
                      <td>{l.nombre}</td>
                      <td>{ETIQUETA_AREA[l.pagador_nomina] || l.pagador_nomina}</td>
                      <td>{l.dias_trabajados ?? '—'}</td>
                      <td>{fmt(l.sueldo_base)}</td>
                      <td>{fmt(l.bonificacion)}</td>
                      <td>{fmt(l.deduccion_gastos)}</td>
                      <td>{fmt(l.deduccion_inventario)}</td>
                      <td>{fmt(l.deduccion_prestamos)}</td>
                      <td>{fmt(l.deducciones)}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(l.total)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem' }}
                          onClick={() => imprimirReciboEmpleado(l, periodoSel)}
                        >
                          Recibo
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
