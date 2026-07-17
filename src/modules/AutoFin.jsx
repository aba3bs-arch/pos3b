import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { etiquetaTienda, listarSucursalesOperativas } from '../constants/sucursales.js';
import {
  AVISO_FALTA_AUTO_FIN,
  FRECUENCIAS_AUTO_FIN,
  calcularPlanAutoFin,
  cancelarCreditoAutoFin,
  crearCreditoAutoFin,
  etiquetaFrecuencia,
  listarCreditosAutoFin,
  obtenerCreditoAutoFin,
  registrarPagoAutoFin,
} from '../lib/autoFin.js';

const COLOR = '#0f766e';

function fmt(n) {
  return `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hoyYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FORM_VACIO = {
  sucursal_id: 'MAIN',
  cliente_id: '',
  cliente_nombre: '',
  cliente_telefono: '',
  descripcion: '',
  precio: '',
  enganche: '',
  frecuencia: 'semanal',
  num_cuotas: '12',
  con_interes: false,
  tasa_interes: '',
  fecha_inicio: hoyYmd(),
  notas: '',
};

export default function AutoFin({ supabase, user }) {
  const tiendas = useMemo(() => listarSucursalesOperativas(), []);
  const [vista, setVista] = useState('lista'); // lista | nuevo | detalle
  const [creditos, setCreditos] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('activo');
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [clientes, setClientes] = useState([]);
  const [detalle, setDetalle] = useState(null);
  const [pago, setPago] = useState({ cuotaId: '', monto: '', fecha: hoyYmd(), metodo: 'efectivo', nota: '' });

  const planPreview = useMemo(
    () =>
      calcularPlanAutoFin({
        precio: form.precio,
        enganche: form.enganche,
        frecuencia: form.frecuencia,
        numCuotas: form.num_cuotas,
        conInteres: form.con_interes,
        tasaInteres: form.tasa_interes,
        fechaInicio: form.fecha_inicio,
      }),
    [form],
  );

  const cargarLista = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    setError('');
    const res = await listarCreditosAutoFin(supabase, {
      estado: filtroEstado === 'todos' ? null : filtroEstado,
    });
    setCargando(false);
    if (res.aviso) setAviso(res.aviso);
    if (res.error) setError(res.error);
    setCreditos(res.data || []);
  }, [supabase, filtroEstado]);

  const cargarClientes = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('clientes').select('id,nombre,telefono').order('nombre').limit(500);
    setClientes(data || []);
  }, [supabase]);

  useEffect(() => {
    cargarLista();
    cargarClientes();
  }, [cargarLista, cargarClientes]);

  const abrirDetalle = async (id) => {
    setCargando(true);
    const res = await obtenerCreditoAutoFin(supabase, id);
    setCargando(false);
    if (!res.ok) return alert(res.error || 'No se pudo cargar');
    if (res.aviso) setAviso(res.aviso);
    setDetalle(res);
    const primeraPend = (res.cuotas || []).find((c) => c.estado !== 'pagada');
    setPago({
      cuotaId: primeraPend?.id || '',
      monto: primeraPend ? String(roundPendiente(primeraPend)) : '',
      fecha: hoyYmd(),
      metodo: 'efectivo',
      nota: '',
    });
    setVista('detalle');
  };

  const seleccionarCliente = (id) => {
    const c = clientes.find((x) => String(x.id) === String(id));
    setForm((f) => ({
      ...f,
      cliente_id: id,
      cliente_nombre: c?.nombre || f.cliente_nombre,
      cliente_telefono: c?.telefono || f.cliente_telefono,
    }));
  };

  const guardarCredito = async () => {
    setGuardando(true);
    const res = await crearCreditoAutoFin(
      supabase,
      {
        ...form,
        precio: Number(form.precio),
        enganche: Number(form.enganche) || 0,
        num_cuotas: Number(form.num_cuotas),
        tasa_interes: Number(form.tasa_interes) || 0,
      },
      user?.nombre || 'Usuario',
    );
    setGuardando(false);
    if (!res.ok) {
      if (res.aviso) setAviso(res.aviso);
      return alert(res.error);
    }
    alert('Crédito Auto Fin creado con desglose de cuotas.');
    setForm(FORM_VACIO);
    setVista('lista');
    cargarLista();
    abrirDetalle(res.credito.id);
  };

  const cobrar = async () => {
    if (!detalle?.credito?.id) return;
    setGuardando(true);
    const res = await registrarPagoAutoFin(supabase, {
      creditoId: detalle.credito.id,
      cuotaId: pago.cuotaId,
      monto: Number(pago.monto),
      fecha: pago.fecha,
      metodo: pago.metodo,
      nota: pago.nota,
      usuarioNombre: user?.nombre || 'Usuario',
    });
    setGuardando(false);
    if (!res.ok) {
      if (res.aviso) setAviso(res.aviso);
      return alert(res.error);
    }
    alert(`Pago de ${fmt(res.aplicado)} registrado.`);
    abrirDetalle(detalle.credito.id);
    cargarLista();
  };

  const cancelar = async () => {
    if (!detalle?.credito?.id) return;
    if (!confirm('¿Cancelar este crédito? No elimina el historial de cuotas.')) return;
    const res = await cancelarCreditoAutoFin(supabase, detalle.credito.id);
    if (!res.ok) return alert(res.error);
    cargarLista();
    setVista('lista');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, color: COLOR }}>Auto Fin</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.88rem' }}>
              Autofinanciamiento con enganche y cuotas semanales, quincenales o mensuales · con o sin intereses
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {vista !== 'lista' && (
              <button type="button" className="btn btn-ghost" onClick={() => { setVista('lista'); cargarLista(); }}>
                ← Lista
              </button>
            )}
            {vista === 'lista' && (
              <button type="button" className="btn btn-primary" style={{ background: COLOR, borderColor: COLOR }} onClick={() => { setForm({ ...FORM_VACIO, fecha_inicio: hoyYmd() }); setVista('nuevo'); }}>
                + Nuevo crédito
              </button>
            )}
          </div>
        </div>
        {(aviso || error) && (
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: error ? 'var(--brand-red)' : 'var(--brand-gold)' }}>
            {error || aviso || AVISO_FALTA_AUTO_FIN}
          </p>
        )}
      </div>

      {vista === 'lista' && (
        <>
          <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <label className="muted" style={{ fontSize: '0.8rem' }}>
              Estado
              <select className="select" style={{ display: 'block', marginTop: '0.2rem' }} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                <option value="activo">Activos</option>
                <option value="liquidado">Liquidados</option>
                <option value="cancelado">Cancelados</option>
                <option value="todos">Todos</option>
              </select>
            </label>
            <button type="button" className="btn btn-ghost" disabled={cargando} onClick={cargarLista}>
              {cargando ? 'Cargando…' : 'Actualizar'}
            </button>
          </div>
          <div className="card">
            {(creditos || []).length === 0 ? (
              <p className="muted">No hay créditos {filtroEstado !== 'todos' ? filtroEstado + 's' : ''}.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Descripción</th>
                      <th>Frecuencia</th>
                      <th>Cuotas</th>
                      <th>Total</th>
                      <th>Interés</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {creditos.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.cliente_nombre}</strong>
                          {c.cliente_telefono && <div className="muted" style={{ fontSize: '0.75rem' }}>{c.cliente_telefono}</div>}
                        </td>
                        <td>{c.descripcion || '—'}</td>
                        <td>{etiquetaFrecuencia(c.frecuencia)}</td>
                        <td>{c.num_cuotas} × {fmt(c.cuota_monto)}</td>
                        <td>{fmt(c.total_pagar)}</td>
                        <td>{c.con_interes ? `${Number(c.tasa_interes)}%` : 'Sin interés'}</td>
                        <td>{c.estado}</td>
                        <td>
                          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => abrirDetalle(c.id)}>
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {vista === 'nuevo' && (
        <div className="grid-2" style={{ gap: '1rem', alignItems: 'start' }}>
          <div className="card" style={{ borderLeft: `4px solid ${COLOR}` }}>
            <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Nuevo crédito</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <label className="muted">
                Cliente del catálogo (opcional)
                <select className="select" style={{ marginTop: '0.25rem' }} value={form.cliente_id} onChange={(e) => seleccionarCliente(e.target.value)}>
                  <option value="">— Escribir manualmente —</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="muted">
                Nombre del cliente *
                <input className="input" style={{ marginTop: '0.25rem' }} value={form.cliente_nombre} onChange={(e) => setForm({ ...form, cliente_nombre: e.target.value })} />
              </label>
              <label className="muted">
                Teléfono
                <input className="input" style={{ marginTop: '0.25rem' }} value={form.cliente_telefono} onChange={(e) => setForm({ ...form, cliente_telefono: e.target.value })} />
              </label>
              <label className="muted">
                Descripción (auto / unidad)
                <input className="input" style={{ marginTop: '0.25rem' }} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej. Nissan Versa 2018" />
              </label>
              <label className="muted">
                Sucursal
                <select className="select" style={{ marginTop: '0.25rem' }} value={form.sucursal_id} onChange={(e) => setForm({ ...form, sucursal_id: e.target.value })}>
                  {tiendas.map((t) => (
                    <option key={t} value={t}>{etiquetaTienda(t)}</option>
                  ))}
                </select>
              </label>
              <div className="grid-2" style={{ gap: '0.65rem' }}>
                <label className="muted">
                  Precio *
                  <input className="input" type="number" min="0" step="0.01" style={{ marginTop: '0.25rem' }} value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
                </label>
                <label className="muted">
                  Enganche
                  <input className="input" type="number" min="0" step="0.01" style={{ marginTop: '0.25rem' }} value={form.enganche} onChange={(e) => setForm({ ...form, enganche: e.target.value })} />
                </label>
              </div>
              <div className="grid-2" style={{ gap: '0.65rem' }}>
                <label className="muted">
                  Frecuencia de pago
                  <select className="select" style={{ marginTop: '0.25rem' }} value={form.frecuencia} onChange={(e) => setForm({ ...form, frecuencia: e.target.value })}>
                    {FRECUENCIAS_AUTO_FIN.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </label>
                <label className="muted">
                  Número de cuotas *
                  <input className="input" type="number" min="1" step="1" style={{ marginTop: '0.25rem' }} value={form.num_cuotas} onChange={(e) => setForm({ ...form, num_cuotas: e.target.value })} />
                </label>
              </div>
              <label className="muted">
                Intereses
                <select
                  className="select"
                  style={{ marginTop: '0.25rem' }}
                  value={form.con_interes ? 'con' : 'sin'}
                  onChange={(e) => setForm({ ...form, con_interes: e.target.value === 'con' })}
                >
                  <option value="sin">Sin intereses</option>
                  <option value="con">Con intereses</option>
                </select>
              </label>
              {form.con_interes && (
                <label className="muted">
                  Tasa de interés (% sobre el saldo financiado, total del plan)
                  <input className="input" type="number" min="0" step="0.01" style={{ marginTop: '0.25rem' }} value={form.tasa_interes} onChange={(e) => setForm({ ...form, tasa_interes: e.target.value })} placeholder="Ej. 15" />
                </label>
              )}
              <label className="muted">
                Fecha de inicio
                <input className="input" type="date" style={{ marginTop: '0.25rem' }} value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
              </label>
              <label className="muted">
                Notas
                <input className="input" style={{ marginTop: '0.25rem' }} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
              </label>
              <button type="button" className="btn btn-primary" style={{ background: COLOR, borderColor: COLOR }} disabled={guardando} onClick={guardarCredito}>
                {guardando ? 'Guardando…' : 'Crear crédito y generar cuotas'}
              </button>
            </div>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Vista previa del plan</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.9rem', marginBottom: '0.85rem' }}>
              <div className="muted">Saldo a financiar</div>
              <strong style={{ textAlign: 'right' }}>{fmt(planPreview.monto_financiar)}</strong>
              <div className="muted">Interés total</div>
              <strong style={{ textAlign: 'right' }}>{fmt(planPreview.interes_total)}</strong>
              <div className="muted">Total a pagar (cuotas)</div>
              <strong style={{ textAlign: 'right', color: COLOR }}>{fmt(planPreview.total_pagar)}</strong>
              <div className="muted">Cuota aprox.</div>
              <strong style={{ textAlign: 'right' }}>{fmt(planPreview.cuota_monto)}</strong>
            </div>
            <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Vence</th>
                    <th>Capital</th>
                    <th>Interés</th>
                    <th>Cuota</th>
                  </tr>
                </thead>
                <tbody>
                  {planPreview.cuotas.map((c) => (
                    <tr key={c.numero}>
                      <td>{c.numero}</td>
                      <td>{c.fecha_vencimiento}</td>
                      <td>{fmt(c.capital)}</td>
                      <td>{fmt(c.interes)}</td>
                      <td>{fmt(c.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {vista === 'detalle' && detalle?.credito && (
        <>
          <div className="card" style={{ borderLeft: `4px solid ${COLOR}` }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, color: COLOR }}>{detalle.credito.cliente_nombre}</h3>
                <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                  {detalle.credito.descripcion || 'Sin descripción'} · {etiquetaFrecuencia(detalle.credito.frecuencia)} ·{' '}
                  {detalle.credito.con_interes ? `Interés ${detalle.credito.tasa_interes}%` : 'Sin intereses'} · Estado: {detalle.credito.estado}
                </p>
              </div>
              {detalle.credito.estado === 'activo' && (
                <button type="button" className="btn btn-ghost" style={{ color: 'var(--brand-red)' }} onClick={cancelar}>
                  Cancelar crédito
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
              <Kpi label="Precio" value={fmt(detalle.credito.precio)} />
              <Kpi label="Enganche" value={fmt(detalle.credito.enganche)} />
              <Kpi label="Financiado" value={fmt(detalle.credito.monto_financiar)} />
              <Kpi label="Interés" value={fmt(detalle.credito.interes_total)} />
              <Kpi label="Total cuotas" value={fmt(detalle.credito.total_pagar)} />
              <Kpi label="Pagado" value={fmt(detalle.pagadoTotal)} />
              <Kpi label="Saldo" value={fmt(detalle.saldo)} accent={COLOR} />
            </div>
          </div>

          {detalle.credito.estado === 'activo' && (
            <div className="card">
              <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Registrar pago</h3>
              <div className="grid-2" style={{ gap: '0.65rem' }}>
                <label className="muted">
                  Cuota
                  <select className="select" style={{ marginTop: '0.25rem' }} value={pago.cuotaId} onChange={(e) => {
                    const id = e.target.value;
                    const c = (detalle.cuotas || []).find((x) => x.id === id);
                    setPago((p) => ({ ...p, cuotaId: id, monto: c ? String(roundPendiente(c)) : p.monto }));
                  }}
                  >
                    {(detalle.cuotas || []).filter((c) => c.estado !== 'pagada').map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.numero} · vence {c.fecha_vencimiento} · pendiente {fmt(roundPendiente(c))}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="muted">
                  Monto
                  <input className="input" type="number" min="0" step="0.01" style={{ marginTop: '0.25rem' }} value={pago.monto} onChange={(e) => setPago({ ...pago, monto: e.target.value })} />
                </label>
                <label className="muted">
                  Fecha
                  <input className="input" type="date" style={{ marginTop: '0.25rem' }} value={pago.fecha} onChange={(e) => setPago({ ...pago, fecha: e.target.value })} />
                </label>
                <label className="muted">
                  Método
                  <select className="select" style={{ marginTop: '0.25rem' }} value={pago.metodo} onChange={(e) => setPago({ ...pago, metodo: e.target.value })}>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="otro">Otro</option>
                  </select>
                </label>
              </div>
              <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem', background: COLOR, borderColor: COLOR }} disabled={guardando || !pago.cuotaId} onClick={cobrar}>
                {guardando ? 'Guardando…' : 'Cobrar cuota'}
              </button>
            </div>
          )}

          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Desglose de cuotas</h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Vencimiento</th>
                    <th>Capital</th>
                    <th>Interés</th>
                    <th>Cuota</th>
                    <th>Pagado</th>
                    <th>Pendiente</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(detalle.cuotas || []).map((c) => (
                    <tr key={c.id}>
                      <td>{c.numero}</td>
                      <td>{c.fecha_vencimiento}</td>
                      <td>{fmt(c.capital)}</td>
                      <td>{fmt(c.interes)}</td>
                      <td>{fmt(c.monto)}</td>
                      <td>{fmt(c.pagado)}</td>
                      <td>{fmt(roundPendiente(c))}</td>
                      <td>{c.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {(detalle.pagos || []).length > 0 && (
            <div className="card">
              <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Pagos registrados</h3>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Monto</th>
                      <th>Método</th>
                      <th>Nota</th>
                      <th>Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.pagos.map((p) => (
                      <tr key={p.id}>
                        <td>{String(p.fecha).slice(0, 10)}</td>
                        <td>{fmt(p.monto)}</td>
                        <td>{p.metodo || '—'}</td>
                        <td>{p.nota || '—'}</td>
                        <td>{p.usuario_nombre || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function roundPendiente(c) {
  return Math.round((Math.max(0, (Number(c.monto) || 0) - (Number(c.pagado) || 0)) * 100)) / 100;
}

function Kpi({ label, value, accent }) {
  return (
    <div style={{ padding: '0.65rem', borderRadius: 8, background: 'var(--surface-2, rgba(0,0,0,0.04))' }}>
      <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 800, marginTop: '0.2rem', color: accent || 'inherit' }}>{value}</div>
    </div>
  );
}
