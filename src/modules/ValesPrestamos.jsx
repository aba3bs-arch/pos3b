import React, { useCallback, useEffect, useState } from 'react';
import {
  AVISO_FALTA_CONTABILIDAD,
  abonarPrestamo,
  listarPrestamos,
  listarPrestamosInterarea,
  listarVales,
  registrarPrestamo,
  registrarPrestamoInterarea,
  registrarVale,
} from '../lib/valesPrestamos.js';
import {
  INDIRECTOS_VALES,
  RUTAS_PRESTAMO_INTERAREA,
  ETIQUETA_AREA,
  HORA_LIMITE_VALE,
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
  const [empleados, setEmpleados] = useState([]);
  const [vales, setVales] = useState([]);
  const [prestamos, setPrestamos] = useState([]);
  const [prestamosArea, setPrestamosArea] = useState([]);

  const [valeForm, setValeForm] = useState({ area: 'virtual', nombre: '', monto: '', motivo: '', fecha: hoyISO(), pinAdmin: '' });
  const [prestForm, setPrestForm] = useState({ usuario_id: '', monto: '', notas: '', fecha: hoyISO() });
  const [interForm, setInterForm] = useState({ rutaIdx: '0', monto: '', notas: '', fecha: hoyISO() });

  const esAdmin = normalizarRol(user?.rol) === 'Administrador';
  const requiereAuthAhora = valeRequiereAutorizacionAdmin();

  const cargarEmpleados = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('usuarios').select('id, nombre, rol, sucursal_id').order('nombre');
    setEmpleados(data || []);
  }, [supabase]);

  const cargarVales = useCallback(async () => {
    if (!supabase) return;
    const res = await listarVales(supabase, { sucursal, tipo: 'indirecto' });
    if (res.aviso) setAviso(res.aviso);
    setVales(res.data || []);
  }, [supabase, sucursal]);

  const cargarPrestamos = useCallback(async () => {
    if (!supabase) return;
    const res = await listarPrestamos(supabase, { sucursal });
    if (res.aviso) setAviso(res.aviso);
    setPrestamos(res.data || []);
  }, [supabase, sucursal]);

  const cargarPrestamosArea = useCallback(async () => {
    if (!supabase) return;
    const res = await listarPrestamosInterarea(supabase, { sucursal });
    if (res.aviso) setAviso(res.aviso);
    setPrestamosArea(res.data || []);
  }, [supabase, sucursal]);

  useEffect(() => {
    cargarEmpleados();
    cargarVales();
    cargarPrestamos();
    cargarPrestamosArea();
  }, [cargarEmpleados, cargarVales, cargarPrestamos, cargarPrestamosArea]);

  const empleadoPorId = (id) => empleados.find((e) => String(e.id) === String(id));

  const guardarVale = async () => {
    if (!supabase) return alert('Sin conexión.');
    const monto = Number(valeForm.monto);
    if (!(monto > 0)) return alert('Monto inválido.');
    if (!valeForm.nombre) return alert('Selecciona beneficiario.');
    const pinAdmin = requiereAuthAhora && !esAdmin ? valeForm.pinAdmin.trim() : '';
    if (requiereAuthAhora && !esAdmin && !pinAdmin) {
      return alert(`Después de las ${HORA_LIMITE_VALE}:00 se requiere PIN de administrador.`);
    }
    const res = await registrarVale(
      supabase,
      {
        sucursal_id: sucursal || 'MAIN',
        usuario_id: null,
        nombre_empleado: valeForm.nombre,
        tipo: 'indirecto',
        area: valeForm.area,
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
    setValeForm({ area: valeForm.area, nombre: '', monto: '', motivo: '', fecha: hoyISO(), pinAdmin: '' });
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
    if (!res.ok) return alert(res.error);
    setPrestForm({ usuario_id: '', monto: '', notas: '', fecha: hoyISO() });
    cargarPrestamos();
  };

  const guardarPrestamoInterarea = async () => {
    if (!supabase) return alert('Sin conexión.');
    const ruta = RUTAS_PRESTAMO_INTERAREA[Number(interForm.rutaIdx)] || RUTAS_PRESTAMO_INTERAREA[0];
    const monto = Number(interForm.monto);
    if (!(monto > 0)) return alert('Monto inválido.');
    const res = await registrarPrestamoInterarea(supabase, {
      sucursal_id: sucursal || 'MAIN',
      origen: ruta.origen,
      destino: ruta.destino,
      monto,
      fecha: interForm.fecha || hoyISO(),
      notas: interForm.notas.trim() || null,
      created_by: user?.nombre || null,
    });
    if (!res.ok) return alert(res.error);
    setInterForm({ rutaIdx: interForm.rutaIdx, monto: '', notas: '', fecha: hoyISO() });
    cargarPrestamosArea();
  };

  const hacerAbono = async (p) => {
    const raw = prompt(`Abono a ${p.nombre_empleado}\nSaldo: ${fmt(p.saldo)}\n\nMonto:`);
    if (raw == null) return;
    const monto = Number(raw);
    if (!(monto > 0)) return alert('Monto inválido.');
    const res = await abonarPrestamo(supabase, p, monto);
    if (!res.ok) return alert(res.error);
    cargarPrestamos();
  };

  const imprimirValeRow = (v) => imprimirVale(v);

  const indirectosArea = INDIRECTOS_VALES[valeForm.area] || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {aviso && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', background: 'rgba(225,153,41,0.08)' }}>
          <strong>Configuración pendiente</strong>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>{aviso || AVISO_FALTA_CONTABILIDAD}</p>
        </div>
      )}

      <div className="card" style={{ fontSize: '0.85rem' }}>
        <strong>Vales indirectos</strong> — No se descuentan de nómina. Libres hasta las <strong>{HORA_LIMITE_VALE}:00</strong>;
        {requiereAuthAhora ? (
          <span style={{ color: 'var(--danger)' }}> ahora requieren autorización de administrador.</span>
        ) : (
          <span> después de esa hora requieren administrador.</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {[
          ['vales', 'Vales indirectos'],
          ['prestamos', 'Préstamos empleados'],
          ['interarea', 'Préstamos entre áreas'],
        ].map(([id, label]) => (
          <button key={id} type="button" className={`btn ${pestana === id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPestana(id)}>
            {label}
          </button>
        ))}
      </div>

      {pestana === 'vales' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Nuevo vale</h3>
            <div className="grid-2">
              <select className="select" value={valeForm.area} onChange={(e) => setValeForm({ ...valeForm, area: e.target.value, nombre: '' })}>
                <option value="virtual">Virtual (Misael, Gonzalo)</option>
                <option value="abarrotes">Abarrotes (Luis Enrique)</option>
              </select>
              <select className="select" value={valeForm.nombre} onChange={(e) => setValeForm({ ...valeForm, nombre: e.target.value })}>
                <option value="">— Beneficiario —</option>
                {indirectosArea.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <input className="input" type="number" min="0" step="0.01" placeholder="Monto" value={valeForm.monto} onChange={(e) => setValeForm({ ...valeForm, monto: e.target.value })} />
              <input className="input" type="date" value={valeForm.fecha} onChange={(e) => setValeForm({ ...valeForm, fecha: e.target.value })} />
              <input className="input" placeholder="Motivo" style={{ gridColumn: '1 / -1' }} value={valeForm.motivo} onChange={(e) => setValeForm({ ...valeForm, motivo: e.target.value })} />
              {requiereAuthAhora && !esAdmin && (
                <input className="input" type="password" placeholder="PIN administrador" style={{ gridColumn: '1 / -1' }} value={valeForm.pinAdmin} onChange={(e) => setValeForm({ ...valeForm, pinAdmin: e.target.value })} />
              )}
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={guardarVale}>
              Generar e imprimir vale
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
                    <th>Área</th>
                    <th>Beneficiario</th>
                    <th>Monto</th>
                    <th>Motivo</th>
                    <th>Auth.</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {vales.map((v) => (
                    <tr key={v.id}>
                      <td>{v.folio || '—'}</td>
                      <td>{v.fecha}</td>
                      <td>{ETIQUETA_AREA[v.area] || v.area}</td>
                      <td>{v.nombre_empleado}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(v.monto)}</td>
                      <td className="muted">{v.motivo || '—'}</td>
                      <td className="muted">{v.requiere_autorizacion ? v.autorizado_por || '—' : '—'}</td>
                      <td>
                        <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem' }} onClick={() => imprimirValeRow(v)}>
                          Imprimir
                        </button>
                      </td>
                    </tr>
                  ))}
                  {vales.length === 0 && (
                    <tr>
                      <td colSpan={8} className="muted">
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
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Préstamo a empleado POS</h3>
            <div className="grid-2">
              <select className="select" value={prestForm.usuario_id} onChange={(e) => setPrestForm({ ...prestForm, usuario_id: e.target.value })}>
                <option value="">— Empleado —</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre} ({e.rol})
                  </option>
                ))}
              </select>
              <input className="input" type="number" min="0" step="0.01" placeholder="Monto" value={prestForm.monto} onChange={(e) => setPrestForm({ ...prestForm, monto: e.target.value })} />
              <input className="input" type="date" value={prestForm.fecha} onChange={(e) => setPrestForm({ ...prestForm, fecha: e.target.value })} />
              <input className="input" placeholder="Notas" value={prestForm.notas} onChange={(e) => setPrestForm({ ...prestForm, notas: e.target.value })} />
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={guardarPrestamo}>
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
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {prestamos.map((p) => (
                    <tr key={p.id}>
                      <td>{p.fecha}</td>
                      <td>{p.nombre_empleado}</td>
                      <td>{fmt(p.monto_original)}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(p.saldo)}</td>
                      <td>
                        {p.estado === 'activo' && Number(p.saldo) > 0 && (
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem' }} onClick={() => hacerAbono(p)}>
                            Abonar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {pestana === 'interarea' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Préstamo entre áreas</h3>
            <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
              Transferencias contables entre Virtual, Abarrotes y Garage.
            </p>
            <div className="grid-2">
              <select className="select" value={interForm.rutaIdx} onChange={(e) => setInterForm({ ...interForm, rutaIdx: e.target.value })}>
                {RUTAS_PRESTAMO_INTERAREA.map((r, i) => (
                  <option key={r.label} value={String(i)}>
                    {r.label}
                  </option>
                ))}
              </select>
              <input className="input" type="number" min="0" step="0.01" placeholder="Monto" value={interForm.monto} onChange={(e) => setInterForm({ ...interForm, monto: e.target.value })} />
              <input className="input" type="date" value={interForm.fecha} onChange={(e) => setInterForm({ ...interForm, fecha: e.target.value })} />
              <input className="input" placeholder="Notas" value={interForm.notas} onChange={(e) => setInterForm({ ...interForm, notas: e.target.value })} />
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={guardarPrestamoInterarea}>
              Registrar préstamo entre áreas
            </button>
          </div>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem' }}>Historial entre áreas</h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Origen</th>
                    <th>Destino</th>
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
                        Sin movimientos.
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
