import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AVISO_FALTA_NOMINA,
  cargarLineasPeriodo,
  guardarPeriodoNomina,
  lineasDesdeEmpleados,
  listarPeriodosNomina,
  totalLineaNomina,
} from '../lib/nomina.js';
import { gastosDeduccionPorEmpleado } from '../lib/nominaGastos.js';
import { prestamosDeduccionPorEmpleado } from '../lib/nominaPrestamos.js';
import { periodoSemanaNomina, etiquetaSemanaNomina } from '../lib/semanaNomina.js';
import { AREAS_CONTABILIDAD, ETIQUETA_AREA } from '../lib/contabilidadConstants.js';
import { imprimirNomina } from '../lib/impresionContabilidad.js';
function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

export default function Nomina({ supabase, sucursal, user }) {
  const semana = useMemo(() => periodoSemanaNomina(), []);
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

  const cargarEmpleadosYGastos = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    setErr('');
    const { data: empleados, error } = await supabase.from('usuarios').select('id, nombre, rol, sucursal_id, nomina_pagador').order('nombre');
    if (error) {
      setErr(error.message);
      setCargando(false);
      return;
    }
    const lista = empleados || [];
    const [gastosRes, prestRes] = await Promise.all([
      gastosDeduccionPorEmpleado(supabase, { sucursal, desde: inicio, hasta: fin, empleados: lista }),
      prestamosDeduccionPorEmpleado(supabase, { sucursal, empleados: lista }),
    ]);
    if (gastosRes.error) setErr(gastosRes.error);
    if (prestRes.error) setErr(prestRes.error);
    const lineasNuevas = lineasDesdeEmpleados(lista, {
      gastosMap: gastosRes.map,
      prestamosMap: prestRes.map,
      pagadorFiltro,
    });
    setLineas(lineasNuevas);
    setEmpleadosCache(lista);
    setCargando(false);
  }, [supabase, sucursal, inicio, fin, pagadorFiltro]);

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
      l.total = totalLineaNomina(l);
      next[idx] = l;
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
          Semana <strong>sábado a viernes</strong>. Consumos de cortes y préstamos activos se descuentan por <strong>nombre de empleado</strong>.
          Define en <strong>Usuarios</strong> quién paga la nómina (Virtual / Abarrotes / Garage).
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
              {AREAS_CONTABILIDAD.map((a) => (
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

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Rol</th>
                <th>Pagador</th>
                <th>Sueldo</th>
                <th>Bono</th>
                <th>Gastos cortes</th>
                <th>Préstamos</th>
                <th>Otras ded.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={l.usuario_id || i}>
                  <td>{l.nombre}</td>
                  <td className="muted">{l.rol}</td>
                  <td>{ETIQUETA_AREA[l.pagador_nomina] || l.pagador_nomina}</td>
                  <td>
                    <input className="input" type="number" min="0" step="0.01" style={{ width: '90px' }} value={l.sueldo_base} onChange={(e) => actualizarLinea(i, 'sueldo_base', e.target.value)} />
                  </td>
                  <td>
                    <input className="input" type="number" min="0" step="0.01" style={{ width: '90px' }} value={l.bonificacion} onChange={(e) => actualizarLinea(i, 'bonificacion', e.target.value)} />
                  </td>
                  <td style={{ fontWeight: 700, color: l.deduccion_gastos > 0 ? 'var(--danger)' : undefined }} title={l.notas}>
                    {fmt(l.deduccion_gastos)}
                  </td>
                  <td style={{ fontWeight: 700, color: l.deduccion_prestamos > 0 ? 'var(--danger)' : undefined }} title={l.notas}>
                    {fmt(l.deduccion_prestamos)}
                  </td>
                  <td>
                    <input className="input" type="number" min="0" step="0.01" style={{ width: '90px' }} value={l.deducciones} onChange={(e) => actualizarLinea(i, 'deducciones', e.target.value)} />
                  </td>
                  <td style={{ fontWeight: 700 }}>{fmt(l.total)}</td>
                </tr>
              ))}
              {lineas.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted">
                    {cargando ? 'Cargando…' : 'Sin empleados para este filtro.'}
                  </td>
                </tr>
              )}
            </tbody>
            {lineas.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={8} style={{ textAlign: 'right', fontWeight: 700 }}>
                    Total nómina
                  </td>
                  <td style={{ fontWeight: 800, color: 'var(--brand-blue)' }}>{fmt(totalGeneral)}</td>
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
            Imprimir
          </button>
          <button type="button" className="btn btn-ghost" disabled={cargando} onClick={cargarEmpleadosYGastos}>
            Recalcular gastos
          </button>
        </div>
      </div>

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
                    <th>Sueldo</th>
                    <th>Bono</th>
                    <th>Gastos</th>
                    <th>Préstamos</th>
                    <th>Ded.</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineasHist.map((l) => (
                    <tr key={l.id}>
                      <td>{l.nombre}</td>
                      <td>{ETIQUETA_AREA[l.pagador_nomina] || l.pagador_nomina}</td>
                      <td>{fmt(l.sueldo_base)}</td>
                      <td>{fmt(l.bonificacion)}</td>
                      <td>{fmt(l.deduccion_gastos)}</td>
                      <td>{fmt(l.deduccion_prestamos)}</td>
                      <td>{fmt(l.deducciones)}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(l.total)}</td>
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
