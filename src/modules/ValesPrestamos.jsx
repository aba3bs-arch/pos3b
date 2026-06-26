import React, { useCallback, useEffect, useState } from 'react';
import {
  AVISO_FALTA_CONTABILIDAD,
  listarPrestamos,
  listarPrestamosInterarea,
  listarVales,
  registrarPrestamo,
  registrarPrestamoInterarea,
  registrarVale,
} from '../lib/valesPrestamos.js';
import {
  AREAS_CONTABILIDAD,
  BENEFICIARIOS_VALES,
  ETIQUETA_AREA,
  HORA_LIMITE_VALE,
  beneficiarioValePorId,
  valeRequiereAutorizacionAdmin,
} from '../lib/contabilidadConstants.js';
import { imprimirVale } from '../lib/impresionContabilidad.js';
import { normalizarRol } from '../lib/roles.js';

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ValesPrestamos({ supabase, sucursal, user }) {
  const [pestana, setPestana] = useState('vales');
  const [aviso, setAviso] = useState('');
  const [vales, setVales] = useState([]);
  const [prestamosArea, setPrestamosArea] = useState([]);
  const [prestamosEmp, setPrestamosEmp] = useState([]);
  const [empleados, setEmpleados] = useState([]);

  const [valeForm, setValeForm] = useState({
    beneficiarioId: '',
    monto: '',
    motivo: '',
    fecha: hoyISO(),
    pinAdmin: '',
  });
  const [prestForm, setPrestForm] = useState({
    origen: 'virtual',
    gastos_area: 'abarrotes',
    monto: '',
    notas: '',
    fecha: hoyISO(),
  });
  const [prestEmpForm, setPrestEmpForm] = useState({
    usuarioId: '',
    monto: '',
    notas: '',
    fecha: hoyISO(),
  });

  const esAdmin = normalizarRol(user?.rol) === 'Administrador';
  const requiereAuthAhora = valeRequiereAutorizacionAdmin();

  const cargarVales = useCallback(async () => {
    if (!supabase) return;
    const res = await listarVales(supabase, { sucursal, tipo: 'indirecto' });
    if (res.aviso) setAviso(res.aviso);
    setVales(res.data || []);
  }, [supabase, sucursal]);

  const cargarPrestamosArea = useCallback(async () => {
    if (!supabase) return;
    const res = await listarPrestamosInterarea(supabase, { sucursal });
    if (res.aviso) setAviso(res.aviso);
    setPrestamosArea(res.data || []);
  }, [supabase, sucursal]);

  const cargarPrestamosEmp = useCallback(async () => {
    if (!supabase) return;
    const res = await listarPrestamos(supabase, { sucursal, soloActivos: true });
    if (res.aviso) setAviso(res.aviso);
    setPrestamosEmp(res.data || []);
  }, [supabase, sucursal]);

  const cargarEmpleados = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('usuarios').select('id, nombre, rol').order('nombre');
    setEmpleados(data || []);
  }, [supabase]);

  useEffect(() => {
    cargarVales();
    cargarPrestamosArea();
    cargarPrestamosEmp();
    cargarEmpleados();
  }, [cargarVales, cargarPrestamosArea, cargarPrestamosEmp, cargarEmpleados]);

  const guardarVale = async () => {
    if (!supabase) return alert('Sin conexión.');
    const ben = beneficiarioValePorId(valeForm.beneficiarioId);
    if (!ben) return alert('Selecciona beneficiario (solo Luis Enrique, Misael o Gonzalo).');
    const monto = Number(valeForm.monto);
    if (!(monto > 0)) return alert('Monto inválido.');
    const pinAdmin = requiereAuthAhora && !esAdmin ? valeForm.pinAdmin.trim() : '';
    if (requiereAuthAhora && !esAdmin && !pinAdmin) {
      return alert(`Después de las ${HORA_LIMITE_VALE}:00 se requiere PIN de administrador.`);
    }
    const res = await registrarVale(
      supabase,
      {
        sucursal_id: sucursal || 'MAIN',
        usuario_id: null,
        nombre_empleado: ben.nombre,
        tipo: 'indirecto',
        area: ben.area,
        monto,
        motivo: valeForm.motivo.trim() || null,
        fecha: valeForm.fecha || hoyISO(),
        created_by: user?.nombre || null,
      },
      { rolActor: user?.rol, nombreActor: user?.nombre, pinAdmin },
    );
    if (!res.ok) {
      if (String(res.error).includes('fix_contabilidad')) setAviso(res.error);
      return alert(res.error);
    }
    if (confirm('¿Imprimir vale?')) imprimirVale(res.vale);
    setValeForm({ beneficiarioId: '', monto: '', motivo: '', fecha: hoyISO(), pinAdmin: '' });
    cargarVales();
  };

  const guardarPrestamoGastos = async () => {
    if (!supabase) return alert('Sin conexión.');
    if (prestForm.origen === prestForm.gastos_area) {
      return alert('El área que presta y el área de gastos deben ser distintas.');
    }
    const monto = Number(prestForm.monto);
    if (!(monto > 0)) return alert('Monto inválido.');
    const notaBase = prestForm.notas.trim();
    const notas = notaBase
      ? `${notaBase} — Gastos ${ETIQUETA_AREA[prestForm.gastos_area]}`
      : `Pago gastos ${ETIQUETA_AREA[prestForm.gastos_area]}`;
    const res = await registrarPrestamoInterarea(supabase, {
      sucursal_id: sucursal || 'MAIN',
      origen: prestForm.origen,
      destino: prestForm.gastos_area,
      monto,
      fecha: prestForm.fecha || hoyISO(),
      notas,
      created_by: user?.nombre || null,
    });
    if (!res.ok) return alert(res.error);
    setPrestForm({ origen: prestForm.origen, gastos_area: prestForm.gastos_area, monto: '', notas: '', fecha: hoyISO() });
    cargarPrestamosArea();
  };

  const guardarPrestamoEmpleado = async () => {
    if (!supabase) return alert('Sin conexión.');
    const emp = empleados.find((e) => String(e.id) === String(prestEmpForm.usuarioId));
    if (!emp) return alert('Selecciona empleado.');
    const monto = Number(prestEmpForm.monto);
    if (!(monto > 0)) return alert('Monto inválido.');
    const res = await registrarPrestamo(supabase, {
      sucursal_id: sucursal || 'MAIN',
      usuario_id: emp.id,
      nombre_empleado: emp.nombre,
      monto_original: monto,
      fecha: prestEmpForm.fecha || hoyISO(),
      notas: prestEmpForm.notas.trim() || null,
      created_by: user?.nombre || null,
    });
    if (!res.ok) {
      if (String(res.error).includes('fix_contabilidad')) setAviso(res.error);
      return alert(res.error);
    }
    setPrestEmpForm({ usuarioId: '', monto: '', notas: '', fecha: hoyISO() });
    cargarPrestamosEmp();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {aviso && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', background: 'rgba(225,153,41,0.08)' }}>
          <strong>Configuración pendiente</strong>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>{aviso || AVISO_FALTA_CONTABILIDAD}</p>
        </div>
      )}

      <div className="card" style={{ fontSize: '0.85rem' }}>
        <strong>Vales</strong> — Solo Luis Enrique (Abarrotes), Misael y Gonzalo (Virtual). No se descuentan de nómina.
        Libres hasta las <strong>{HORA_LIMITE_VALE}:00</strong>
        {requiereAuthAhora ? (
          <span style={{ color: 'var(--danger)' }}>; ahora requieren administrador.</span>
        ) : (
          <span>.</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className={`btn ${pestana === 'vales' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPestana('vales')}>
          Vales
        </button>
        <button type="button" className={`btn ${pestana === 'prestamos' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPestana('prestamos')}>
          Préstamos (gastos por área)
        </button>
        <button type="button" className={`btn ${pestana === 'prestamos_emp' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPestana('prestamos_emp')}>
          Préstamos a empleados
        </button>
      </div>

      {pestana === 'vales' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Nuevo vale</h3>
            <div className="grid-2">
              <select
                className="select"
                value={valeForm.beneficiarioId}
                onChange={(e) => setValeForm({ ...valeForm, beneficiarioId: e.target.value })}
              >
                <option value="">— Beneficiario —</option>
                {BENEFICIARIOS_VALES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre} — {ETIQUETA_AREA[b.area]}
                  </option>
                ))}
              </select>
              <input className="input" type="number" min="0" step="0.01" placeholder="Monto" value={valeForm.monto} onChange={(e) => setValeForm({ ...valeForm, monto: e.target.value })} />
              <input className="input" type="date" value={valeForm.fecha} onChange={(e) => setValeForm({ ...valeForm, fecha: e.target.value })} />
              <input className="input" placeholder="Motivo" value={valeForm.motivo} onChange={(e) => setValeForm({ ...valeForm, motivo: e.target.value })} />
              {requiereAuthAhora && !esAdmin && (
                <input
                  className="input"
                  type="password"
                  placeholder="PIN administrador"
                  style={{ gridColumn: '1 / -1' }}
                  value={valeForm.pinAdmin}
                  onChange={(e) => setValeForm({ ...valeForm, pinAdmin: e.target.value })}
                />
              )}
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={guardarVale}>
              Generar vale
            </button>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Vales registrados</h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Fecha</th>
                    <th>Beneficiario</th>
                    <th>Área</th>
                    <th>Monto</th>
                    <th>Motivo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {vales.map((v) => (
                    <tr key={v.id}>
                      <td>{v.folio || '—'}</td>
                      <td>{v.fecha}</td>
                      <td>{v.nombre_empleado}</td>
                      <td>{ETIQUETA_AREA[v.area] || v.area}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(v.monto)}</td>
                      <td className="muted">{v.motivo || '—'}</td>
                      <td>
                        <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem' }} onClick={() => imprimirVale(v)}>
                          Imprimir
                        </button>
                      </td>
                    </tr>
                  ))}
                  {vales.length === 0 && (
                    <tr>
                      <td colSpan={7} className="muted">
                        Sin vales.
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
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Préstamo para pagar gastos</h3>
            <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
              Transfiere fondos entre áreas para cubrir gastos de Abarrotes, Virtual o Garage.
            </p>
            <div className="grid-2">
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
                Área que presta
                <select className="select" value={prestForm.origen} onChange={(e) => setPrestForm({ ...prestForm, origen: e.target.value })}>
                  {AREAS_CONTABILIDAD.map((a) => (
                    <option key={a} value={a}>
                      {ETIQUETA_AREA[a]}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
                Gastos a pagar de
                <select className="select" value={prestForm.gastos_area} onChange={(e) => setPrestForm({ ...prestForm, gastos_area: e.target.value })}>
                  {AREAS_CONTABILIDAD.map((a) => (
                    <option key={a} value={a}>
                      {ETIQUETA_AREA[a]}
                    </option>
                  ))}
                </select>
              </label>
              <input className="input" type="number" min="0" step="0.01" placeholder="Monto" value={prestForm.monto} onChange={(e) => setPrestForm({ ...prestForm, monto: e.target.value })} />
              <input className="input" type="date" value={prestForm.fecha} onChange={(e) => setPrestForm({ ...prestForm, fecha: e.target.value })} />
              <input className="input" placeholder="Notas (opcional)" style={{ gridColumn: '1 / -1' }} value={prestForm.notas} onChange={(e) => setPrestForm({ ...prestForm, notas: e.target.value })} />
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={guardarPrestamoGastos}>
              Registrar préstamo
            </button>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem' }}>Historial de préstamos</h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Prestó</th>
                    <th>Gastos de</th>
                    <th>Monto</th>
                    <th>Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {prestamosArea.map((p) => (
                    <tr key={p.id}>
                      <td>{p.fecha}</td>
                      <td>{ETIQUETA_AREA[p.origen] || p.origen}</td>
                      <td>{ETIQUETA_AREA[p.destino] || p.destino}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(p.monto)}</td>
                      <td className="muted">{p.notas || '—'}</td>
                    </tr>
                  ))}
                  {prestamosArea.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">
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

      {pestana === 'prestamos_emp' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Préstamo a empleado</h3>
            <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
              Se descuenta automáticamente en nómina (match por nombre del empleado).
            </p>
            <div className="grid-2">
              <select className="select" value={prestEmpForm.usuarioId} onChange={(e) => setPrestEmpForm({ ...prestEmpForm, usuarioId: e.target.value })}>
                <option value="">— Empleado —</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre} ({e.rol})
                  </option>
                ))}
              </select>
              <input className="input" type="number" min="0" step="0.01" placeholder="Monto" value={prestEmpForm.monto} onChange={(e) => setPrestEmpForm({ ...prestEmpForm, monto: e.target.value })} />
              <input className="input" type="date" value={prestEmpForm.fecha} onChange={(e) => setPrestEmpForm({ ...prestEmpForm, fecha: e.target.value })} />
              <input className="input" placeholder="Notas (opcional)" value={prestEmpForm.notas} onChange={(e) => setPrestEmpForm({ ...prestEmpForm, notas: e.target.value })} />
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={guardarPrestamoEmpleado}>
              Registrar préstamo
            </button>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem' }}>Préstamos activos</h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Empleado</th>
                    <th>Original</th>
                    <th>Saldo</th>
                    <th>Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {prestamosEmp.map((p) => (
                    <tr key={p.id}>
                      <td>{p.fecha}</td>
                      <td>{p.nombre_empleado}</td>
                      <td>{fmt(p.monto_original)}</td>
                      <td style={{ fontWeight: 700, color: 'var(--danger)' }}>{fmt(p.saldo)}</td>
                      <td className="muted">{p.notas || '—'}</td>
                    </tr>
                  ))}
                  {prestamosEmp.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">
                        Sin préstamos activos.
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
