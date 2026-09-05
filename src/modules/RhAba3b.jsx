import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { etiquetaTienda, listarSucursalesOperativas } from '../constants/sucursales.js';
import InputPin from '../components/InputPin.jsx';
import {
  AVISO_FALTA_RH_ABA3B,
  MOTIVOS_BAJA_RH,
  PUESTOS_RH,
  TIPOS_EMPLEADO_RH,
  altaEmpleadoRh,
  agregarNotaRh,
  darDeBajaEmpleadoRh,
  editarEmpleadoRh,
  etiquetaEstadoRh,
  etiquetaTipoEmpleadoRh,
  listarEmpleadosRh,
  listarHistorialRh,
  nombreCompletoRh,
  obtenerEmpleadoRh,
  puedeGestionarRh,
  recontratarEmpleadoRh,
  requierePinAdminPrincipalParaAlta,
} from '../lib/rhAba3b.js';
import {
  fusionarDatosIneEnForm,
  leerIneDesdeArchivo,
  mapearExtrasAFormDocs,
} from '../lib/rhIneOcr.js';
import { ROLES } from '../lib/roles.js';
import FormularioBajaEmpleado from '../components/FormularioBajaEmpleado.jsx';

const FORM_VACIO = {
  nombre: '',
  apellidos: '',
  tipo_empleado: 'tienda',
  sucursal_id: '',
  puesto: 'Cajero',
  rol_sistema: 'Cajero',
  fecha_nacimiento: '',
  curp: '',
  rfc: '',
  nss: '',
  telefono: '',
  telefono_emergencia: '',
  contacto_emergencia: '',
  email: '',
  direccion: '',
  colonia: '',
  ciudad: '',
  estado_mx: '',
  cp: '',
  banco: '',
  clabe: '',
  salario_diario: '',
  fecha_alta: new Date().toISOString().slice(0, 10),
  notas: '',
  ine_foto: '',
  doc_ine: false,
  doc_comprobante: false,
  doc_acta: false,
  doc_csf: false,
  doc_contrato: false,
  doc_foto: false,
};

function fmtFecha(iso) {
  if (!iso) return '—';
  return String(iso).slice(0, 10);
}

function fmtFechaHora(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso).slice(0, 16);
  }
}

export default function RhAba3b({ supabase, user, sucursal }) {
  const puede = puedeGestionarRh(user);
  const [pestana, setPestana] = useState('activos');
  const [aviso, setAviso] = useState('');
  const [msg, setMsg] = useState('');
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [activos, setActivos] = useState([]);
  const [inactivos, setInactivos] = useState([]);
  const [vista, setVista] = useState('lista'); // lista | alta | detalle | baja | recontrata
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [empleado, setEmpleado] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [form, setForm] = useState({ ...FORM_VACIO, sucursal_id: sucursal || '' });
  const [bajaForm, setBajaForm] = useState({
    motivo_baja: MOTIVOS_BAJA_RH[0],
    fecha_baja: new Date().toISOString().slice(0, 10),
    notas_baja: '',
    recontratable: true,
    motivo_no_recontratable: '',
  });
  const [nota, setNota] = useState('');
  const [pinAdmin, setPinAdmin] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [bajaPickId, setBajaPickId] = useState('');
  const [bajaOrigen, setBajaOrigen] = useState('lista');

  const sucOperativas = useMemo(() => listarSucursalesOperativas(), []);

  const cargarListas = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    const [a, i] = await Promise.all([
      listarEmpleadosRh(supabase, { estado: 'activo', q, tipo: filtroTipo || null }),
      listarEmpleadosRh(supabase, { estado: 'baja', q, tipo: filtroTipo || null }),
    ]);
    if (a.error || i.error) setAviso(a.error || i.error || '');
    else setAviso('');
    setActivos(a.data || []);
    setInactivos(i.data || []);
    setCargando(false);
  }, [supabase, q, filtroTipo]);

  useEffect(() => {
    void cargarListas();
  }, [cargarListas]);

  const abrirDetalle = async (id) => {
    setMsg('');
    setTrabajando(true);
    const res = await obtenerEmpleadoRh(supabase, id);
    if (!res.ok) {
      setTrabajando(false);
      setMsg(res.error);
      return;
    }
    setEmpleado(res.empleado);
    setSeleccionadoId(id);
    const hist = await listarHistorialRh(supabase, id);
    setHistorial(hist.data || []);
    setPinAdmin('');
    setForm({
      ...FORM_VACIO,
      ...res.empleado,
      ...mapearExtrasAFormDocs(res.empleado),
      salario_diario: res.empleado.salario_diario ?? '',
      fecha_nacimiento: res.empleado.fecha_nacimiento || '',
      fecha_alta: res.empleado.fecha_alta || '',
    });
    setVista('detalle');
    setTrabajando(false);
  };

  const abrirBajaDesdeLista = (e) => {
    if (!puede || !e?.id) return;
    if (e.estado === 'baja') return alert('Ya está dado de baja.');
    setMsg('');
    setSeleccionadoId(e.id);
    setEmpleado(e);
    setBajaPickId(String(e.id));
    setBajaForm({
      motivo_baja: MOTIVOS_BAJA_RH[0],
      fecha_baja: new Date().toISOString().slice(0, 10),
      notas_baja: '',
      recontratable: true,
      motivo_no_recontratable: '',
    });
    setVista('baja');
    setBajaOrigen('lista');
  };

  const continuarBajaDesdeSelector = () => {
    const e = activos.find((x) => String(x.id) === String(bajaPickId));
    if (!e) return alert('Elige el empleado de la lista.');
    abrirBajaDesdeLista(e);
  };

  const lista = pestana === 'activos' ? activos : inactivos;

  const guardarAlta = async () => {
    if (!puede) return alert('Sin permiso.');
    setTrabajando(true);
    const res = await altaEmpleadoRh(supabase, form, { user });
    setTrabajando(false);
    if (!res.ok) return alert(res.error);
    setMsg(res.mensaje);
    setVista('lista');
    setForm({ ...FORM_VACIO, sucursal_id: sucursal || '' });
    await cargarListas();
  };

  const guardarEdicion = async () => {
    if (!puede || !seleccionadoId) return;
    setTrabajando(true);
    const res = await editarEmpleadoRh(supabase, seleccionadoId, form, { user });
    setTrabajando(false);
    if (!res.ok) return alert(res.error);
    setMsg(res.mensaje);
    setEmpleado(res.empleado);
    const hist = await listarHistorialRh(supabase, seleccionadoId);
    setHistorial(hist.data || []);
    await cargarListas();
  };

  const confirmarBaja = async () => {
    if (!puede || !seleccionadoId) return;
    if (!confirm('¿Confirmar baja? Dejará de aparecer en nómina, empleados por turno y Usuarios. El expediente queda en Inactivos de RH ABA3B.')) return;
    setTrabajando(true);
    const res = await darDeBajaEmpleadoRh(supabase, seleccionadoId, bajaForm, { user });
    setTrabajando(false);
    if (!res.ok) return alert(res.error);
    setMsg(res.mensaje);
    setPestana('inactivos');
    setBajaPickId('');
    await abrirDetalle(seleccionadoId);
    await cargarListas();
  };

  const recontratarDirecto = async () => {
    if (!puede || !seleccionadoId) return;
    const necesitaPin = requierePinAdminPrincipalParaAlta(empleado);
    if (necesitaPin && !String(pinAdmin || '').trim()) {
      setVista('recontrata');
      return;
    }
    if (!confirm(necesitaPin
      ? '¿Reingresar alta con PIN del administrador principal?'
      : '¿Recontratar a este ex-empleado? Volverá a nómina, turnos y Usuarios.')) return;
    setTrabajando(true);
    const res = await recontratarEmpleadoRh(
      supabase,
      seleccionadoId,
      {
        tipo_empleado: form.tipo_empleado,
        sucursal_id: form.sucursal_id,
        puesto: form.puesto,
        salario_diario: form.salario_diario,
        fecha_alta: new Date().toISOString().slice(0, 10),
      },
      { user, pinAdminPrincipal: pinAdmin },
    );
    setTrabajando(false);
    if (!res.ok) {
      if (res.requierePinPrincipal) {
        setVista('recontrata');
        return alert(res.error);
      }
      return alert(res.error);
    }
    setMsg(res.mensaje);
    setPinAdmin('');
    setPestana('activos');
    await abrirDetalle(seleccionadoId);
    await cargarListas();
  };

  const guardarNota = async () => {
    if (!seleccionadoId) return;
    const res = await agregarNotaRh(supabase, seleccionadoId, nota, { user });
    if (!res.ok) return alert(res.error);
    setNota('');
    const hist = await listarHistorialRh(supabase, seleccionadoId);
    setHistorial(hist.data || []);
  };

  if (!puede) {
    return (
      <div className="card">
        <h2 style={{ margin: 0, color: 'var(--brand-blue-dark)' }}>RH ABA3B</h2>
        <p className="muted">Solo administrador o gerente pueden gestionar altas y bajas.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#0f766e' }}>RH ABA3B</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.88rem' }}>
          Altas y bajas de personal: tienda, cubre turnos e indirectos.
          Para dar de baja: elige el nombre abajo o pulsa <strong>Dar de baja</strong> en la fila.
          La baja se refleja en nómina, turnos y Usuarios; el reingreso no recontratable pide PIN del administrador principal.
        </p>
      </div>

      {(aviso || msg) && (
        <div
          className="card"
          style={{
            borderLeft: `4px solid ${aviso ? 'var(--danger)' : 'var(--brand-gold)'}`,
            background: aviso ? 'rgba(211,47,47,0.06)' : 'rgba(225,153,41,0.08)',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.9rem' }}>{aviso || msg}</p>
          {aviso === AVISO_FALTA_RH_ABA3B && (
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
              Ejecuta el SQL en Supabase para habilitar el módulo.
            </p>
          )}
        </div>
      )}

      {vista === 'lista' && (
        <>
          <div className="card" style={{ borderLeft: '4px solid var(--danger)' }}>
            <h3 style={{ margin: '0 0 0.5rem' }}>Cómo dar de baja un empleado</h3>
            <ol style={{ margin: '0 0 0.85rem', paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: 1.55 }}>
              <li>Elige el nombre aquí, o en la tabla pulsa <strong>Dar de baja</strong> (también puedes abrir <strong>Perfil</strong>).</li>
              <li>Indica <strong>motivo</strong>, <strong>fecha</strong> y si <strong>puede reingresar</strong>.</li>
              <li>Pulsa <strong>Confirmar baja</strong>. El PIN deja de funcionar; sale de nómina y de turnos.</li>
            </ol>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
              <label className="muted" style={{ flex: '1 1 220px', fontSize: '0.8rem' }}>
                Empleado activo
                <select
                  className="select"
                  style={{ marginTop: '0.35rem' }}
                  value={bajaPickId}
                  onChange={(e) => setBajaPickId(e.target.value)}
                >
                  <option value="">— Elige nombre —</option>
                  {activos.map((e) => (
                    <option key={e.id} value={e.id}>
                      {nombreCompletoRh(e)} · {e.sucursal_id ? etiquetaTienda(e.sucursal_id) : '—'}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-danger" disabled={!puede} onClick={continuarBajaDesdeSelector}>
                Dar de baja
              </button>
            </div>
            <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.8rem' }}>
              Administrador también puede hacerlo en <strong>Usuarios</strong>. Los inactivos están en la pestaña <strong>Inactivos / bajas</strong>.
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className={`btn ${pestana === 'activos' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPestana('activos')}
            >
              Activos ({activos.length})
            </button>
            <button
              type="button"
              className={`btn ${pestana === 'inactivos' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPestana('inactivos')}
            >
              Inactivos / bajas ({inactivos.length})
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginLeft: 'auto' }}
              onClick={() => {
                setForm({ ...FORM_VACIO, sucursal_id: sucursal && sucursal !== 'MAIN' ? sucursal : (sucOperativas[0] || '') });
                setVista('alta');
                setMsg('');
              }}
            >
              + Alta de empleado
            </button>
          </div>

          <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <input
              className="input"
              placeholder="Buscar nombre, CURP, RFC, teléfono, folio…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ flex: '1 1 220px' }}
            />
            <select className="select" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ flex: '0 1 200px' }}>
              <option value="">Todos los tipos</option>
              {TIPOS_EMPLEADO_RH.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="card table-wrap" style={{ padding: 0 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Tipo</th>
                  <th>Sucursal</th>
                  <th>Puesto</th>
                  <th>Alta</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr><td colSpan={7} className="muted">Cargando…</td></tr>
                ) : lista.length === 0 ? (
                  <tr><td colSpan={7} className="muted">Sin empleados en esta vista.</td></tr>
                ) : (
                  lista.map((e) => (
                    <tr key={e.id} style={{ opacity: e.estado === 'baja' ? 0.85 : 1 }}>
                      <td>
                        <strong>{nombreCompletoRh(e)}</strong>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>{e.folio || e.telefono || '—'}</div>
                      </td>
                      <td>{etiquetaTipoEmpleadoRh(e.tipo_empleado)}</td>
                      <td>{e.sucursal_id ? etiquetaTienda(e.sucursal_id) : '—'}</td>
                      <td>{e.puesto || '—'}</td>
                      <td>{fmtFecha(e.fecha_alta)}</td>
                      <td>
                        {etiquetaEstadoRh(e.estado)}
                        {e.estado === 'baja' && (
                          <div className="muted" style={{ fontSize: '0.75rem' }}>
                            {e.recontratable ? 'Recontratable' : 'No recontratable'}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', justifyContent: 'flex-end' }}>
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem' }} onClick={() => abrirDetalle(e.id)}>
                            Perfil
                          </button>
                          {e.estado !== 'baja' && puede && (
                            <button type="button" className="btn btn-danger" style={{ padding: '0.2rem 0.5rem' }} onClick={() => abrirBajaDesdeLista(e)}>
                              Dar de baja
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {vista === 'alta' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Alta de empleado</h3>
            <button type="button" className="btn btn-ghost" onClick={() => setVista('lista')}>Cancelar</button>
          </div>
          <FormularioRh
            form={form}
            setForm={setForm}
            sucursales={form.tipo_empleado === 'indirecto' ? ['MAIN', ...sucOperativas] : sucOperativas}
            roles={ROLES}
          />
          <button type="button" className="btn btn-primary" disabled={trabajando} onClick={guardarAlta} style={{ marginTop: '0.75rem' }}>
            {trabajando ? 'Guardando…' : 'Registrar alta'}
          </button>
        </div>
      )}

      {vista === 'detalle' && empleado && (
        <>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem', marginBottom: '0.35rem' }} onClick={() => { setVista('lista'); cargarListas(); }}>
                  ← Lista
                </button>
                <h3 style={{ margin: 0 }}>{nombreCompletoRh(empleado)}</h3>
                <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                  {empleado.folio || '—'} · {etiquetaTipoEmpleadoRh(empleado.tipo_empleado)} · {etiquetaEstadoRh(empleado.estado)}
                  {empleado.estado === 'baja' ? ` · ${empleado.recontratable ? 'Recontratable' : 'No recontratable'}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {empleado.estado === 'activo' && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      setBajaOrigen('detalle');
                      setBajaForm({
                        motivo_baja: MOTIVOS_BAJA_RH[0],
                        fecha_baja: new Date().toISOString().slice(0, 10),
                        notas_baja: '',
                        recontratable: true,
                        motivo_no_recontratable: '',
                      });
                      setVista('baja');
                    }}
                  >
                    Dar de baja
                  </button>
                )}
                {empleado.estado === 'baja' && empleado.recontratable && (
                  <button type="button" className="btn btn-primary" onClick={recontratarDirecto}>Reingresar alta</button>
                )}
                {empleado.estado === 'baja' && !empleado.recontratable && (
                  <button type="button" className="btn btn-primary" onClick={() => setVista('recontrata')}>
                    Reingresar con PIN del admin principal
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <h4 style={{ margin: '0 0 0.75rem' }}>Información personal y laboral</h4>
            <FormularioRh
              form={form}
              setForm={setForm}
              sucursales={form.tipo_empleado === 'indirecto' ? ['MAIN', ...sucOperativas] : sucOperativas}
              roles={ROLES}
              mostrarRecontratable={empleado.estado === 'baja'}
            />
            <button type="button" className="btn btn-primary" disabled={trabajando} onClick={guardarEdicion} style={{ marginTop: '0.75rem' }}>
              Guardar cambios
            </button>
          </div>

          {empleado.estado === 'baja' && (
            <div className="card" style={{ borderLeft: '4px solid var(--danger)' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>Datos de baja</h4>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                <strong>Fecha:</strong> {fmtFecha(empleado.fecha_baja)} · <strong>Motivo:</strong> {empleado.motivo_baja || '—'}
              </p>
              {empleado.notas_baja && <p className="muted" style={{ margin: '0.35rem 0 0' }}>{empleado.notas_baja}</p>}
              {!empleado.recontratable && (
                <p style={{ margin: '0.5rem 0 0', color: 'var(--danger)', fontSize: '0.88rem' }}>
                  No recontratable: {empleado.motivo_no_recontratable || '—'}
                  {' '}· Reingreso solo con PIN del administrador principal.
                </p>
              )}
            </div>
          )}

          <div className="card">
            <h4 style={{ margin: '0 0 0.5rem' }}>Agregar nota al historial</h4>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input className="input" style={{ flex: 1 }} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Observación, entrevista, incidencia…" />
              <button type="button" className="btn btn-ghost" onClick={guardarNota}>Agregar</button>
            </div>
          </div>

          <div className="card">
            <h4 style={{ margin: '0 0 0.75rem' }}>Historial de actividades</h4>
            {historial.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Sin movimientos aún.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {historial.map((h) => (
                  <div key={h.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.45rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.9rem' }}>{h.titulo || h.tipo}</strong>
                      <span className="muted" style={{ fontSize: '0.78rem' }}>{fmtFechaHora(h.created_at)}</span>
                    </div>
                    {h.detalle && <p style={{ margin: '0.2rem 0 0', fontSize: '0.86rem' }}>{h.detalle}</p>}
                    <p className="muted" style={{ margin: '0.15rem 0 0', fontSize: '0.75rem' }}>
                      {h.actor_nombre || 'Sistema'} · {h.tipo}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {vista === 'baja' && empleado && (
        <FormularioBajaEmpleado
          nombre={nombreCompletoRh(empleado)}
          form={bajaForm}
          setForm={setBajaForm}
          onConfirm={confirmarBaja}
          onCancel={() => setVista(bajaOrigen === 'detalle' ? 'detalle' : 'lista')}
          trabajando={trabajando}
          notasPlaceholder="Notas de liquidación / entrega de equipo / observaciones"
        />
      )}

      {vista === 'recontrata' && empleado && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)' }}>
          <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem' }} onClick={() => setVista('detalle')}>
            ← Volver al perfil
          </button>
          <h3 style={{ margin: '0.5rem 0' }}>Reingreso con PIN del administrador principal</h3>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            {nombreCompletoRh(empleado)} no es recontratable. Para volver a darlo de alta se necesita el PIN del{' '}
            <strong>administrador principal</strong>.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
            <div>
              <label className="muted" style={{ fontSize: '0.78rem' }}>PIN del administrador principal</label>
              <InputPin value={pinAdmin} onChange={(e) => setPinAdmin(e.target.value)} />
            </div>
            <button type="button" className="btn btn-primary" disabled={trabajando || !pinAdmin} onClick={recontratarDirecto}>
              {trabajando ? 'Validando…' : 'Reingresar alta'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FormularioRh({ form, setForm, sucursales, roles, mostrarRecontratable = false }) {
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const esIndirecto = form.tipo_empleado === 'indirecto';
  const [ocrProg, setOcrProg] = useState(null);
  const [ocrMsg, setOcrMsg] = useState('');
  const ineInputRef = React.useRef(null);

  useEffect(() => {
    if (esIndirecto && form.sucursal_id !== 'MAIN') set('sucursal_id', 'MAIN');
  }, [esIndirecto]); // eslint-disable-line react-hooks/exhaustive-deps

  const procesarIne = async (file) => {
    if (!file) return;
    setOcrMsg('');
    setOcrProg(0);
    const res = await leerIneDesdeArchivo(file, { onProgress: setOcrProg });
    setOcrProg(null);
    if (res.ine_foto) {
      setForm((prev) => ({ ...prev, ine_foto: res.ine_foto, doc_ine: true }));
    }
    if (!res.ok) {
      setOcrMsg(res.error || 'No se pudo leer el INE.');
      return;
    }
    setForm((prev) => fusionarDatosIneEnForm(prev, res.patch, { sobrescribir: true }));
    setOcrMsg(res.mensaje || 'Datos del INE aplicados. Revisa el formulario.');
  };

  return (
    <div className="grid-2" style={{ marginTop: '0.75rem' }}>
      <div
        style={{
          gridColumn: '1 / -1',
          border: '1px dashed rgba(25,118,210,0.45)',
          borderRadius: 10,
          padding: '0.85rem 1rem',
          background: 'rgba(25,118,210,0.05)',
        }}
      >
        <strong style={{ color: 'var(--brand-blue)' }}>Cargar desde foto del INE</strong>
        <p className="muted" style={{ margin: '0.35rem 0 0.65rem', fontSize: '0.85rem' }}>
          Sube o toma una foto del <strong>anverso</strong> (nombre, CURP y domicilio). Se rellenan automáticamente
          para ahorrar tiempo; revisa y completa teléfono, NSS, banco, etc.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <input
            ref={ineInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              void procesarIne(f);
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={ocrProg != null}
            onClick={() => ineInputRef.current?.click()}
          >
            {ocrProg != null ? `Leyendo INE… ${ocrProg}%` : 'Subir / tomar foto del INE'}
          </button>
          {form.ine_foto && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                set('ine_foto', '');
                setOcrMsg('Foto del INE quitada del formulario (los datos capturados se conservan).');
              }}
            >
              Quitar foto
            </button>
          )}
        </div>
        {ocrProg != null && (
          <div
            style={{
              marginTop: '0.65rem',
              height: 8,
              borderRadius: 999,
              background: 'rgba(0,0,0,0.08)',
              overflow: 'hidden',
            }}
          >
            <div style={{ width: `${ocrProg}%`, height: '100%', background: 'var(--brand-blue)', transition: 'width 0.2s' }} />
          </div>
        )}
        {ocrMsg && (
          <p style={{ margin: '0.55rem 0 0', fontSize: '0.85rem', color: ocrMsg.startsWith('No') ? 'var(--brand-red)' : 'inherit' }}>
            {ocrMsg}
          </p>
        )}
        {form.ine_foto && (
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <img
              src={form.ine_foto}
              alt="INE cargado"
              style={{
                maxWidth: 220,
                maxHeight: 140,
                objectFit: 'cover',
                borderRadius: 8,
                border: '1px solid rgba(0,0,0,0.12)',
              }}
            />
            <span className="muted" style={{ fontSize: '0.8rem' }}>
              La foto se guarda en el expediente al registrar o guardar cambios.
            </span>
          </div>
        )}
      </div>

      <input className="input" placeholder="Nombre(s) *" value={form.nombre || ''} onChange={(e) => set('nombre', e.target.value)} />
      <input className="input" placeholder="Apellidos" value={form.apellidos || ''} onChange={(e) => set('apellidos', e.target.value)} />
      <select className="select" value={form.tipo_empleado || 'tienda'} onChange={(e) => set('tipo_empleado', e.target.value)}>
        {TIPOS_EMPLEADO_RH.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <select
        className="select"
        value={esIndirecto ? 'MAIN' : (form.sucursal_id || '')}
        disabled={esIndirecto}
        onChange={(e) => set('sucursal_id', e.target.value)}
      >
        <option value="">— Sucursal —</option>
        {(sucursales || []).map((s) => (
          <option key={s} value={s}>{etiquetaTienda(s)}</option>
        ))}
      </select>
      <select className="select" value={form.puesto || ''} onChange={(e) => set('puesto', e.target.value)}>
        <option value="">— Puesto —</option>
        {PUESTOS_RH.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select className="select" value={form.rol_sistema || ''} onChange={(e) => set('rol_sistema', e.target.value)}>
        <option value="">— Rol sistema (opcional) —</option>
        {(roles || []).map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <input className="input" type="date" title="Fecha de nacimiento" value={form.fecha_nacimiento || ''} onChange={(e) => set('fecha_nacimiento', e.target.value)} />
      <input className="input" type="date" title="Fecha de alta" value={form.fecha_alta || ''} onChange={(e) => set('fecha_alta', e.target.value)} />
      <input className="input" placeholder="CURP" value={form.curp || ''} onChange={(e) => set('curp', e.target.value)} />
      <input className="input" placeholder="RFC" value={form.rfc || ''} onChange={(e) => set('rfc', e.target.value)} />
      <input className="input" placeholder="NSS" value={form.nss || ''} onChange={(e) => set('nss', e.target.value)} />
      <input className="input" placeholder="Teléfono" value={form.telefono || ''} onChange={(e) => set('telefono', e.target.value)} />
      <input className="input" placeholder="Contacto de emergencia" value={form.contacto_emergencia || ''} onChange={(e) => set('contacto_emergencia', e.target.value)} />
      <input className="input" placeholder="Tel. emergencia" value={form.telefono_emergencia || ''} onChange={(e) => set('telefono_emergencia', e.target.value)} />
      <input className="input" placeholder="Email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
      <input className="input" placeholder="Salario diario" type="number" value={form.salario_diario ?? ''} onChange={(e) => set('salario_diario', e.target.value)} />
      <input className="input" placeholder="Banco" value={form.banco || ''} onChange={(e) => set('banco', e.target.value)} />
      <input className="input" placeholder="CLABE" value={form.clabe || ''} onChange={(e) => set('clabe', e.target.value)} />
      <input className="input" style={{ gridColumn: '1 / -1' }} placeholder="Dirección" value={form.direccion || ''} onChange={(e) => set('direccion', e.target.value)} />
      <input className="input" placeholder="Colonia" value={form.colonia || ''} onChange={(e) => set('colonia', e.target.value)} />
      <input className="input" placeholder="Ciudad" value={form.ciudad || ''} onChange={(e) => set('ciudad', e.target.value)} />
      <input className="input" placeholder="Estado" value={form.estado_mx || ''} onChange={(e) => set('estado_mx', e.target.value)} />
      <input className="input" placeholder="C.P." value={form.cp || ''} onChange={(e) => set('cp', e.target.value)} />

      <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.85rem' }}>
        {[
          ['doc_ine', 'INE'],
          ['doc_comprobante', 'Comprobante domicilio'],
          ['doc_acta', 'Acta nacimiento'],
          ['doc_csf', 'Constancia fiscal'],
          ['doc_contrato', 'Contrato firmado'],
          ['doc_foto', 'Foto'],
        ].map(([k, label]) => (
          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={Boolean(form[k])} onChange={(e) => set(k, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      {mostrarRecontratable && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={form.recontratable !== false}
              onChange={(e) => set('recontratable', e.target.checked)}
            />
            Marcado como recontratable
          </label>
          {form.recontratable === false && (
            <input
              className="input"
              placeholder="Motivo no recontratable"
              value={form.motivo_no_recontratable || ''}
              onChange={(e) => set('motivo_no_recontratable', e.target.value)}
            />
          )}
        </>
      )}

      <input
        className="input"
        style={{ gridColumn: '1 / -1' }}
        placeholder="Notas de alta / observaciones"
        value={form.notas || ''}
        onChange={(e) => set('notas', e.target.value)}
      />
    </div>
  );
}
