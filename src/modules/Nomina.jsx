import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AVISO_FALTA_NOMINA,
  cargarLineasPeriodo,
  guardarPeriodoNomina,
  lineasDesdeEmpleados,
  listarPeriodosNomina,
  totalLineaNomina,
} from '../lib/nomina.js';

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function inicioQuincenaISO() {
  const d = new Date();
  const dia = d.getDate();
  d.setDate(dia <= 15 ? 1 : 16);
  return d.toISOString().slice(0, 10);
}

export default function Nomina({ supabase, sucursal, user }) {
  const [aviso, setAviso] = useState('');
  const [err, setErr] = useState('');
  const [cargando, setCargando] = useState(false);
  const [periodos, setPeriodos] = useState([]);
  const [periodoSel, setPeriodoSel] = useState(null);
  const [lineasHist, setLineasHist] = useState([]);

  const [inicio, setInicio] = useState(inicioQuincenaISO);
  const [fin, setFin] = useState(hoyISO);
  const [notasPeriodo, setNotasPeriodo] = useState('');
  const [lineas, setLineas] = useState([]);

  const totalGeneral = useMemo(() => lineas.reduce((a, l) => a + totalLineaNomina(l), 0), [lineas]);

  const cargarEmpleados = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    setErr('');
    const { data, error } = await supabase.from('usuarios').select('id, nombre, rol, sucursal_id').order('nombre');
    if (error) {
      setErr(error.message);
      setCargando(false);
      return;
    }
    const empleados = (data || []).filter((u) => !sucursal || u.sucursal_id === sucursal || u.sucursal_id == null);
    setLineas(lineasDesdeEmpleados(empleados));
    setCargando(false);
  }, [supabase, sucursal]);

  const cargarPeriodos = useCallback(async () => {
    if (!supabase) return;
    const res = await listarPeriodosNomina(supabase, { sucursal });
    if (res.aviso) setAviso(res.aviso);
    if (res.error) setErr(res.error);
    else setPeriodos(res.data || []);
  }, [supabase, sucursal]);

  useEffect(() => {
    cargarEmpleados();
    cargarPeriodos();
  }, [cargarEmpleados, cargarPeriodos]);

  const actualizarLinea = (idx, campo, valor) => {
    setLineas((prev) => {
      const next = [...prev];
      const l = { ...next[idx], [campo]: valor };
      l.total = totalLineaNomina(l);
      next[idx] = l;
      return next;
    });
  };

  const guardar = async () => {
    if (!supabase) return alert('Sin conexión a Supabase.');
    if (!inicio || !fin) return alert('Indica inicio y fin del periodo.');
    if (lineas.length === 0) return alert('No hay empleados para la nómina.');
    setCargando(true);
    setErr('');
    const res = await guardarPeriodoNomina(supabase, {
      periodo: {
        sucursal_id: sucursal || 'MAIN',
        periodo_inicio: inicio,
        periodo_fin: fin,
        estado: 'cerrado',
        notas: notasPeriodo.trim() || null,
        created_by: user?.nombre || user?.id || null,
      },
      lineas,
    });
    setCargando(false);
    if (!res.ok) {
      if (String(res.error).includes('fix_contabilidad')) setAviso(res.error);
      return alert(res.error || 'No se pudo guardar.');
    }
    alert(`Nómina guardada. Total: ${fmt(res.total)}`);
    setNotasPeriodo('');
    cargarPeriodos();
  };

  const verPeriodo = async (p) => {
    setPeriodoSel(p);
    setLineasHist([]);
    if (!supabase || !p?.id) return;
    const res = await cargarLineasPeriodo(supabase, p.id);
    if (res.error) return alert(res.error);
    setLineasHist(res.data || []);
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
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Nueva nómina</h3>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          Empleados desde <strong>Usuarios</strong> de la tienda activa. El sueldo base se recuerda para el próximo periodo.
        </p>
        <div className="grid-2" style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
            Periodo inicio
            <input className="input" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
            Periodo fin
            <input className="input" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          </label>
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
                <th>Sueldo base</th>
                <th>Bonificación</th>
                <th>Deducciones</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={l.usuario_id || i}>
                  <td>{l.nombre}</td>
                  <td className="muted">{l.rol}</td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      style={{ width: '100px' }}
                      value={l.sueldo_base}
                      onChange={(e) => actualizarLinea(i, 'sueldo_base', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      style={{ width: '100px' }}
                      value={l.bonificacion}
                      onChange={(e) => actualizarLinea(i, 'bonificacion', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      style={{ width: '100px' }}
                      value={l.deducciones}
                      onChange={(e) => actualizarLinea(i, 'deducciones', e.target.value)}
                    />
                  </td>
                  <td style={{ fontWeight: 700 }}>{fmt(l.total)}</td>
                </tr>
              ))}
              {lineas.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    {cargando ? 'Cargando empleados…' : 'No hay empleados en esta tienda.'}
                  </td>
                </tr>
              )}
            </tbody>
            {lineas.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>
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
            Guardar periodo
          </button>
          <button type="button" className="btn btn-ghost" disabled={cargando} onClick={cargarEmpleados}>
            Recargar empleados
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Historial de nóminas</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Estado</th>
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
                  <td>{p.estado || '—'}</td>
                  <td>{fmt(p.total)}</td>
                  <td className="muted">{p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</td>
                  <td>
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem' }} onClick={() => verPeriodo(p)}>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
              {periodos.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    Sin periodos guardados{aviso ? ' (ejecuta el SQL de contabilidad)' : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {periodoSel && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <h4 style={{ margin: '0 0 0.5rem' }}>
              Detalle: {periodoSel.periodo_inicio} — {periodoSel.periodo_fin}
            </h4>
            {periodoSel.notas && <p className="muted" style={{ fontSize: '0.85rem' }}>{periodoSel.notas}</p>}
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Empleado</th>
                    <th>Rol</th>
                    <th>Sueldo</th>
                    <th>Bonificación</th>
                    <th>Deducciones</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineasHist.map((l) => (
                    <tr key={l.id}>
                      <td>{l.nombre}</td>
                      <td className="muted">{l.rol}</td>
                      <td>{fmt(l.sueldo_base)}</td>
                      <td>{fmt(l.bonificacion)}</td>
                      <td>{fmt(l.deducciones)}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(l.total)}</td>
                    </tr>
                  ))}
                  {lineasHist.length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted">
                        Cargando…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
