import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EVENTO_NOTIFICACIONES,
  etiquetaTipoNotificacion,
  listarHistorialNotificaciones,
  listarNotificacionesPendientes,
  marcarNotificacionAtendidaPorId,
  TIPOS_NOTIF,
} from '../lib/contabilidadNotificaciones.js';
import {
  actualizarIncidencia,
  CATEGORIAS_INCIDENCIA,
  crearIncidencia,
  etiquetaCategoriaIncidencia,
  etiquetaEstadoIncidencia,
  etiquetaPrioridadIncidencia,
  fechaHoraIncidencia,
  fmtFechaIncidencia,
  fmtHoraIncidencia,
  listarIncidencias,
  PRIORIDADES_INCIDENCIA,
} from '../lib/incidenciasPos.js';
import { normalizarRol } from '../lib/roles.js';
import { esSocioAprobadorPrestamo } from '../lib/contabilidadConstants.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import { BtnLabel } from '../components/Icon.jsx';

function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Buzon({
  supabase,
  sucursal,
  user,
  pestanaInicial = 'pendientes',
  onIrValesPendientes,
  onNavigate,
}) {
  const rol = normalizarRol(user?.rol);
  const esAdmin = rol === 'Administrador';
  const esGerente = rol === 'Gerente';
  const esSocio = esSocioAprobadorPrestamo(user?.nombre);
  const veTodasTiendas = esAdmin || esGerente;
  const puedeGestionar = esAdmin || esGerente || rol === 'Supervisor';

  const [pestana, setPestana] = useState(pestanaInicial);
  const [aviso, setAviso] = useState('');
  const [pendientes, setPendientes] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [incidencias, setIncidencias] = useState([]);
  const [msg, setMsg] = useState('');

  const [formInc, setFormInc] = useState({
    titulo: '',
    descripcion: '',
    categoria: 'operacion',
    prioridad: 'normal',
  });
  const [resolviendo, setResolviendo] = useState(null);
  const [resolucionTxt, setResolucionTxt] = useState('');
  const [ahoraReporte, setAhoraReporte] = useState(() => new Date());

  const nombreTienda = etiquetaTienda(sucursal);
  const { fechaTxt: fechaReporte, horaTxt: horaReporte } = fechaHoraIncidencia(ahoraReporte);

  useEffect(() => {
    if (pestana !== 'incidencias') return undefined;
    const id = setInterval(() => setAhoraReporte(new Date()), 30_000);
    return () => clearInterval(id);
  }, [pestana]);

  const filtrarPendientes = useCallback(
    (lista) => {
      if (esAdmin || esGerente) return lista;
      if (esSocio) return lista.filter((n) => n.tipo === TIPOS_NOTIF.PRESTAMO_SOCIO);
      return lista.filter((n) => n.tipo === TIPOS_NOTIF.INCIDENCIA || n.sucursal_id === sucursal);
    },
    [esAdmin, esGerente, esSocio, sucursal],
  );

  const recargar = useCallback(async () => {
    if (!supabase) return;
    const opts = { todasTiendas: veTodasTiendas, sucursal: veTodasTiendas ? undefined : sucursal };
    const [pRes, hRes, iRes] = await Promise.all([
      listarNotificacionesPendientes(supabase, { ...opts, limit: 100 }),
      veTodasTiendas ? listarHistorialNotificaciones(supabase, { ...opts, limit: 60 }) : Promise.resolve({ data: [] }),
      listarIncidencias(supabase, {
        sucursal: veTodasTiendas ? undefined : sucursal,
        limit: 100,
      }),
    ]);
    const avisos = [pRes.aviso, iRes.aviso, hRes.aviso].filter(Boolean);
    setAviso(avisos[0] || '');
    setPendientes(filtrarPendientes(pRes.data || []));
    setHistorial(hRes.data || []);
    setIncidencias(iRes.data || []);
  }, [supabase, veTodasTiendas, sucursal, filtrarPendientes]);

  useEffect(() => {
    recargar();
    const id = setInterval(recargar, 45_000);
    const onEvt = () => recargar();
    window.addEventListener(EVENTO_NOTIFICACIONES, onEvt);
    return () => {
      clearInterval(id);
      window.removeEventListener(EVENTO_NOTIFICACIONES, onEvt);
    };
  }, [recargar]);

  useEffect(() => {
    setPestana(pestanaInicial);
  }, [pestanaInicial]);

  const incidenciasAbiertas = useMemo(
    () => incidencias.filter((i) => i.estado === 'abierta' || i.estado === 'en_revision'),
    [incidencias],
  );

  const irAccionNotif = (n) => {
    if (n.tipo === TIPOS_NOTIF.INCIDENCIA) {
      setPestana('incidencias');
      return;
    }
    if (typeof onIrValesPendientes === 'function') onIrValesPendientes();
    else if (typeof onNavigate === 'function') onNavigate('Vales y Préstamos');
  };

  const marcarVisto = async (n) => {
    if (!puedeGestionar) return;
    if (n.tipo === TIPOS_NOTIF.VALE_PENDIENTE || n.tipo === TIPOS_NOTIF.PRESTAMO_ADMIN || n.tipo === TIPOS_NOTIF.PRESTAMO_SOCIO) {
      irAccionNotif(n);
      return;
    }
    const res = await marcarNotificacionAtendidaPorId(supabase, n.id, user?.nombre);
    if (!res.ok) setMsg(res.error || 'No se pudo marcar.');
    else {
      setMsg('Marcada como atendida.');
      recargar();
    }
  };

  const enviarIncidencia = async (e) => {
    e.preventDefault();
    setMsg('');
    const momento = new Date();
    const { fechaTxt, horaTxt } = fechaHoraIncidencia(momento);
    const res = await crearIncidencia(supabase, {
      ...formInc,
      sucursal_id: sucursal,
      reportado_por: user?.nombre,
      etiqueta_tienda: nombreTienda,
      fecha_reporte: fechaTxt,
      hora_reporte: horaTxt,
    });
    if (!res.ok) {
      setMsg(res.error || 'Error al reportar.');
      return;
    }
    setMsg('Incidencia reportada. El administrador fue notificado.');
    setFormInc({ titulo: '', descripcion: '', categoria: 'operacion', prioridad: 'normal' });
    recargar();
    setPestana('incidencias');
  };

  const cambiarEstadoInc = async (inc, estado) => {
    if (!puedeGestionar) return;
    const res = await actualizarIncidencia(
      supabase,
      inc.id,
      { estado, resolucion: resolucionTxt.trim() || inc.resolucion || null },
      { atendidaPor: user?.nombre },
    );
    if (!res.ok) setMsg(res.error || 'Error al actualizar.');
    else {
      setMsg('Incidencia actualizada.');
      setResolviendo(null);
      setResolucionTxt('');
      recargar();
    }
  };

  const pestanas = [
    { id: 'pendientes', label: `Pendientes (${pendientes.length})` },
    { id: 'incidencias', label: `Incidencias (${incidencias.length})` },
  ];
  if (veTodasTiendas) pestanas.push({ id: 'historial', label: 'Historial' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: 'var(--brand-blue)' }}>Buzón de notificaciones</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          {veTodasTiendas
            ? 'Pendientes de todas las tiendas · vales, préstamos e incidencias'
            : `Tienda ${etiquetaTienda(sucursal)} · reportes e incidencias`}
        </p>
      </div>

      {aviso && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', padding: '0.75rem 1rem' }}>
          <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>{aviso}</p>
        </div>
      )}

      {msg && (
        <div className="card" style={{ padding: '0.65rem 1rem', background: 'rgba(59,105,181,0.08)' }}>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>{msg}</p>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn ${pestana === p.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setPestana(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {pestana === 'pendientes' && (
        <div className="card">
          {pendientes.length === 0 ? (
            <p className="muted">Sin notificaciones pendientes.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    {veTodasTiendas && <th>Tienda</th>}
                    <th>Tipo</th>
                    <th>Detalle</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map((n) => (
                    <tr key={n.id}>
                      <td>{fmtFecha(n.created_at)}</td>
                      {veTodasTiendas && <td>{etiquetaTienda(n.sucursal_id)}</td>}
                      <td>{etiquetaTipoNotificacion(n.tipo)}</td>
                      <td>
                        <strong>{n.titulo}</strong>
                        {n.mensaje && <div className="muted" style={{ fontSize: '0.82rem' }}>{n.mensaje}</div>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {(n.tipo === TIPOS_NOTIF.VALE_PENDIENTE ||
                            n.tipo === TIPOS_NOTIF.PRESTAMO_ADMIN ||
                            n.tipo === TIPOS_NOTIF.PRESTAMO_SOCIO) && (
                            <button type="button" className="btn btn-gold btn-sm" onClick={() => irAccionNotif(n)}>
                              Ir a aprobar
                            </button>
                          )}
                          {n.tipo === TIPOS_NOTIF.INCIDENCIA && (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => setPestana('incidencias')}>
                              Ver incidencia
                            </button>
                          )}
                          {puedeGestionar &&
                            (n.tipo === TIPOS_NOTIF.PRESTAMO_INTERAREA || n.tipo === TIPOS_NOTIF.INCIDENCIA) && (
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => marcarVisto(n)}>
                                Marcar visto
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {pestana === 'incidencias' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)' }}>Reporte de incidencia</h3>
            <form onSubmit={enviarIncidencia} style={{ display: 'grid', gap: '0.65rem', maxWidth: 560 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.5rem',
                  padding: '0.65rem 0.75rem',
                  borderRadius: 8,
                  background: 'rgba(59,105,181,0.06)',
                  border: '1px solid var(--border)',
                }}
              >
                <div>
                  <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Tienda</div>
                  <div style={{ fontWeight: 700, marginTop: '0.2rem' }}>{nombreTienda}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Fecha</div>
                  <div style={{ fontWeight: 700, marginTop: '0.2rem' }}>{fechaReporte}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Hora</div>
                  <div style={{ fontWeight: 700, marginTop: '0.2rem' }}>{horaReporte}</div>
                </div>
              </div>
              <label>
                <span className="muted" style={{ fontSize: '0.82rem' }}>Título del reporte</span>
                <input
                  className="input"
                  value={formInc.titulo}
                  onChange={(e) => setFormInc((f) => ({ ...f, titulo: e.target.value }))}
                  required
                  maxLength={120}
                  placeholder="Ej. Falla en impresora de tickets"
                />
              </label>
              <label>
                <span className="muted" style={{ fontSize: '0.82rem' }}>Descripción</span>
                <textarea
                  className="input"
                  rows={3}
                  value={formInc.descripcion}
                  onChange={(e) => setFormInc((f) => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Detalle de lo ocurrido…"
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <label>
                  <span className="muted" style={{ fontSize: '0.82rem' }}>Categoría</span>
                  <select
                    className="input"
                    value={formInc.categoria}
                    onChange={(e) => setFormInc((f) => ({ ...f, categoria: e.target.value }))}
                  >
                    {CATEGORIAS_INCIDENCIA.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="muted" style={{ fontSize: '0.82rem' }}>Prioridad</span>
                  <select
                    className="input"
                    value={formInc.prioridad}
                    onChange={(e) => setFormInc((f) => ({ ...f, prioridad: e.target.value }))}
                  >
                    {PRIORIDADES_INCIDENCIA.map((p) => (
                      <option key={p} value={p}>{etiquetaPrioridadIncidencia(p)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="submit" className="btn btn-primary" style={{ justifySelf: 'start' }}>
                <BtnLabel icon="alert">Enviar reporte</BtnLabel>
              </button>
            </form>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)' }}>
              Incidencias {veTodasTiendas ? '· todas las tiendas' : ''}
              {incidenciasAbiertas.length > 0 && (
                <span className="badge" style={{ marginLeft: '0.5rem', background: 'var(--danger)', color: '#fff' }}>
                  {incidenciasAbiertas.length} abiertas
                </span>
              )}
            </h3>
            {incidencias.length === 0 ? (
              <p className="muted">No hay incidencias registradas.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Hora</th>
                      <th>Tienda</th>
                      <th>Título</th>
                      <th>Categoría</th>
                      <th>Prioridad</th>
                      <th>Estado</th>
                      <th>Reportó</th>
                      {puedeGestionar && <th>Gestión</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {incidencias.map((inc) => (
                      <tr key={inc.id}>
                        <td>{fmtFechaIncidencia(inc.created_at)}</td>
                        <td>{fmtHoraIncidencia(inc.created_at)}</td>
                        <td>{etiquetaTienda(inc.sucursal_id)}</td>
                        <td>
                          <strong>{inc.titulo}</strong>
                          {inc.descripcion && (
                            <div className="muted" style={{ fontSize: '0.82rem', maxWidth: 280 }}>{inc.descripcion}</div>
                          )}
                          {inc.resolucion && (
                            <div style={{ fontSize: '0.82rem', marginTop: 4, color: 'var(--brand-blue)' }}>
                              Resolución: {inc.resolucion}
                            </div>
                          )}
                        </td>
                        <td>{etiquetaCategoriaIncidencia(inc.categoria)}</td>
                        <td>{etiquetaPrioridadIncidencia(inc.prioridad)}</td>
                        <td>{etiquetaEstadoIncidencia(inc.estado)}</td>
                        <td>{inc.reportado_por || '—'}</td>
                        {puedeGestionar && (
                          <td>
                            {inc.estado === 'abierta' || inc.estado === 'en_revision' ? (
                              resolviendo === inc.id ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
                                  <textarea
                                    className="input"
                                    rows={2}
                                    placeholder="Notas de resolución…"
                                    value={resolucionTxt}
                                    onChange={(e) => setResolucionTxt(e.target.value)}
                                  />
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {inc.estado === 'abierta' && (
                                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiarEstadoInc(inc, 'en_revision')}>
                                        En revisión
                                      </button>
                                    )}
                                    <button type="button" className="btn btn-primary btn-sm" onClick={() => cambiarEstadoInc(inc, 'resuelta')}>
                                      Resolver
                                    </button>
                                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setResolviendo(null); setResolucionTxt(''); }}>
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button type="button" className="btn btn-gold btn-sm" onClick={() => setResolviendo(inc.id)}>
                                  Atender
                                </button>
                              )
                            ) : (
                              <span className="muted" style={{ fontSize: '0.82rem' }}>
                                {inc.atendida_por ? `Por ${inc.atendida_por}` : '—'}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {pestana === 'historial' && veTodasTiendas && (
        <div className="card">
          {historial.length === 0 ? (
            <p className="muted">Sin historial reciente.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tienda</th>
                    <th>Tipo</th>
                    <th>Detalle</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((n) => (
                    <tr key={n.id}>
                      <td>{fmtFecha(n.created_at)}</td>
                      <td>{etiquetaTienda(n.sucursal_id)}</td>
                      <td>{etiquetaTipoNotificacion(n.tipo)}</td>
                      <td>{n.titulo}</td>
                      <td>
                        <span className={n.estado === 'pendiente' ? 'badge' : 'muted'}>{n.estado}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
