import React, { useCallback, useEffect, useState } from 'react';
import {
  AVISO_FALTA_CONTABILIDAD,
  abonarPrestamo,
  listarPrestamos,
  listarVales,
  registrarPrestamo,
  registrarVale,
} from '../lib/valesPrestamos.js';

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ValesPrestamos({ supabase, sucursal, user }) {
  const [pestana, setPestana] = useState('vales');
  const [aviso, setAviso] = useState('');
  const [empleados, setEmpleados] = useState([]);
  const [vales, setVales] = useState([]);
  const [prestamos, setPrestamos] = useState([]);

  const [valeForm, setValeForm] = useState({ usuario_id: '', monto: '', motivo: '', fecha: hoyISO() });
  const [prestForm, setPrestForm] = useState({ usuario_id: '', monto: '', notas: '', fecha: hoyISO() });

  const cargarEmpleados = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('usuarios').select('id, nombre, rol, sucursal_id').order('nombre');
    const lista = (data || []).filter((u) => !sucursal || u.sucursal_id === sucursal || u.sucursal_id == null);
    setEmpleados(lista);
  }, [supabase, sucursal]);

  const cargarVales = useCallback(async () => {
    if (!supabase) return;
    const res = await listarVales(supabase, { sucursal });
    if (res.aviso) setAviso(res.aviso);
    setVales(res.data || []);
  }, [supabase, sucursal]);

  const cargarPrestamos = useCallback(async () => {
    if (!supabase) return;
    const res = await listarPrestamos(supabase, { sucursal });
    if (res.aviso) setAviso(res.aviso);
    setPrestamos(res.data || []);
  }, [supabase, sucursal]);

  useEffect(() => {
    cargarEmpleados();
    cargarVales();
    cargarPrestamos();
  }, [cargarEmpleados, cargarVales, cargarPrestamos]);

  const empleadoPorId = (id) => empleados.find((e) => String(e.id) === String(id));

  const guardarVale = async () => {
    if (!supabase) return alert('Sin conexión.');
    const emp = empleadoPorId(valeForm.usuario_id);
    if (!emp) return alert('Selecciona un empleado.');
    const monto = Number(valeForm.monto);
    if (!(monto > 0)) return alert('Monto inválido.');
    const res = await registrarVale(supabase, {
      sucursal_id: sucursal || 'MAIN',
      usuario_id: emp.id,
      nombre_empleado: emp.nombre,
      monto,
      motivo: valeForm.motivo.trim() || null,
      fecha: valeForm.fecha || hoyISO(),
      created_by: user?.nombre || null,
    });
    if (!res.ok) {
      if (String(res.error).includes('fix_contabilidad')) setAviso(res.error);
      return alert(res.error);
    }
    setValeForm({ usuario_id: '', monto: '', motivo: '', fecha: hoyISO() });
    cargarVales();
  };

  const guardarPrestamo = async () => {
    if (!supabase) return alert('Sin conexión.');
    const emp = empleadoPorId(prestForm.usuario_id);
    if (!emp) return alert('Selecciona un empleado.');
    const monto = Number(prestForm.monto);
    if (!(monto > 0)) return alert('Monto inválido.');
    const res = await registrarPrestamo(supabase, {
      sucursal_id: sucursal || 'MAIN',
      usuario_id: emp.id,
      nombre_empleado: emp.nombre,
      monto_original: monto,
      fecha: prestForm.fecha || hoyISO(),
      notas: prestForm.notas.trim() || null,
      created_by: user?.nombre || null,
    });
    if (!res.ok) {
      if (String(res.error).includes('fix_contabilidad')) setAviso(res.error);
      return alert(res.error);
    }
    setPrestForm({ usuario_id: '', monto: '', notas: '', fecha: hoyISO() });
    cargarPrestamos();
  };

  const hacerAbono = async (p) => {
    const raw = prompt(`Abono a ${p.nombre_empleado}\nSaldo: ${fmt(p.saldo)}\n\nMonto a abonar:`);
    if (raw == null) return;
    const monto = Number(raw);
    if (!(monto > 0)) return alert('Monto inválido.');
    const res = await abonarPrestamo(supabase, p, monto);
    if (!res.ok) return alert(res.error);
    cargarPrestamos();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {aviso && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', background: 'rgba(225,153,41,0.08)' }}>
          <strong>Configuración pendiente</strong>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>{aviso || AVISO_FALTA_CONTABILIDAD}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className={`btn ${pestana === 'vales' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPestana('vales')}>
          Vales
        </button>
        <button type="button" className={`btn ${pestana === 'prestamos' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPestana('prestamos')}>
          Préstamos
        </button>
      </div>

      {pestana === 'vales' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Registrar vale</h3>
            <div className="grid-2">
              <select className="select" value={valeForm.usuario_id} onChange={(e) => setValeForm({ ...valeForm, usuario_id: e.target.value })}>
                <option value="">— Empleado —</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre} ({e.rol})
                  </option>
                ))}
              </select>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Monto"
                value={valeForm.monto}
                onChange={(e) => setValeForm({ ...valeForm, monto: e.target.value })}
              />
              <input className="input" type="date" value={valeForm.fecha} onChange={(e) => setValeForm({ ...valeForm, fecha: e.target.value })} />
              <input
                className="input"
                placeholder="Motivo (opcional)"
                value={valeForm.motivo}
                onChange={(e) => setValeForm({ ...valeForm, motivo: e.target.value })}
              />
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={guardarVale}>
              Guardar vale
            </button>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Vales recientes</h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Empleado</th>
                    <th>Monto</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {vales.map((v) => (
                    <tr key={v.id}>
                      <td>{v.fecha}</td>
                      <td>{v.nombre_empleado}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(v.monto)}</td>
                      <td className="muted">{v.motivo || '—'}</td>
                    </tr>
                  ))}
                  {vales.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        Sin vales registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {pestana === 'prestamos' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Nuevo préstamo</h3>
            <div className="grid-2">
              <select className="select" value={prestForm.usuario_id} onChange={(e) => setPrestForm({ ...prestForm, usuario_id: e.target.value })}>
                <option value="">— Empleado —</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre} ({e.rol})
                  </option>
                ))}
              </select>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Monto"
                value={prestForm.monto}
                onChange={(e) => setPrestForm({ ...prestForm, monto: e.target.value })}
              />
              <input className="input" type="date" value={prestForm.fecha} onChange={(e) => setPrestForm({ ...prestForm, fecha: e.target.value })} />
              <input
                className="input"
                placeholder="Notas (opcional)"
                value={prestForm.notas}
                onChange={(e) => setPrestForm({ ...prestForm, notas: e.target.value })}
              />
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={guardarPrestamo}>
              Registrar préstamo
            </button>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Préstamos</h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Empleado</th>
                    <th>Original</th>
                    <th>Abonado</th>
                    <th>Saldo</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {prestamos.map((p) => (
                    <tr key={p.id}>
                      <td>{p.fecha}</td>
                      <td>{p.nombre_empleado}</td>
                      <td>{fmt(p.monto_original)}</td>
                      <td>{fmt(p.abono)}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(p.saldo)}</td>
                      <td>{p.estado}</td>
                      <td>
                        {p.estado === 'activo' && Number(p.saldo) > 0 && (
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem' }} onClick={() => hacerAbono(p)}>
                            Abonar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {prestamos.length === 0 && (
                    <tr>
                      <td colSpan={7} className="muted">
                        Sin préstamos registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
