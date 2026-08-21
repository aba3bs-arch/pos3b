import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { normalizarRol, puedeGestionarUsuarios } from '../lib/roles.js';
import {
  AVISO_FALTA_CHECKLIST,
  ESTADOS_CHECKLIST,
  PLANTILLA_CHECKLIST_FA3B017,
  TURNOS_CHECKLIST,
  cerrarSesionChecklist,
  eliminarSesionChecklist,
  eliminarSesionesChecklist,
  guardarComentariosSesion,
  guardarRespuestaChecklist,
  hoyYmdLocal,
  labelTurno,
  listarSesionesChecklist,
  obtenerOCrearSesionChecklist,
  progresoChecklist,
  reabrirSesionChecklist,
  turnoSugeridoAhora,
} from '../lib/checklistOperativo.js';

export default function CheckList({ supabase, sucursal, user, onIrIncidencias }) {
  const [pestana, setPestana] = useState('llenar');
  const [fecha, setFecha] = useState(() => hoyYmdLocal());
  const [turno, setTurno] = useState(() => turnoSugeridoAhora());
  const [sesion, setSesion] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [comentarios, setComentarios] = useState('');
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  const [aviso, setAviso] = useState('');
  const [abiertas, setAbiertas] = useState(() => new Set(['1']));
  const [historial, setHistorial] = useState([]);
  const [cargandoHist, setCargandoHist] = useState(false);
  const [eliminandoHist, setEliminandoHist] = useState(false);

  const rol = normalizarRol(user?.rol);
  /** Reabrir / ver todas las tiendas: Admin, Gerente, Supervisor */
  const esAdmin = puedeGestionarUsuarios(rol) || rol === 'Gerente' || rol === 'Supervisor';
  /** Borrar historial: solo Administrador */
  const puedeEliminarHistorial = puedeGestionarUsuarios(rol);
  const tienda = normalizarCodigoTienda(sucursal);
  const cerrado = sesion?.estado === 'cerrado';
  const prog = useMemo(() => progresoChecklist(respuestas), [respuestas]);

  const cargarSesion = useCallback(async () => {
    if (!supabase || !tienda) return;
    setCargando(true);
    setMsg('');
    const res = await obtenerOCrearSesionChecklist(supabase, {
      sucursalId: tienda,
      fecha,
      turno,
      usuarioId: user?.id ? String(user.id) : null,
      usuarioNombre: user?.nombre || '',
    });
    setCargando(false);
    if (!res.ok) {
      setAviso(res.aviso || '');
      setMsg(res.error || 'No se pudo abrir el checklist.');
      setSesion(null);
      setRespuestas({});
      return;
    }
    setAviso(res.aviso || '');
    setSesion(res.sesion);
    setRespuestas(res.respuestas || {});
    setComentarios(res.sesion?.comentarios || '');
  }, [supabase, tienda, fecha, turno, user?.id, user?.nombre]);

  useEffect(() => {
    if (pestana === 'llenar') cargarSesion();
  }, [pestana, cargarSesion]);

  const cargarHistorial = useCallback(async () => {
    if (!supabase) return;
    setCargandoHist(true);
    const res = await listarSesionesChecklist(supabase, {
      sucursalId: esAdmin ? null : tienda,
      desde: null,
      hasta: null,
      limit: 50,
    });
    setCargandoHist(false);
    if (res.aviso) setAviso(res.aviso);
    setHistorial(res.data || []);
  }, [supabase, tienda, esAdmin]);

  useEffect(() => {
    if (pestana === 'historial') cargarHistorial();
  }, [pestana, cargarHistorial]);

  const toggleSeccion = (id) => {
    setAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const marcar = async (item, seccionId, estado) => {
    if (!sesion?.id || cerrado) return;
    setGuardando(true);
    setMsg('');
    const prev = respuestas[item.codigo];
    const mismo = prev?.estado === estado;
    const nuevoEstado = mismo ? '' : estado;
    const res = await guardarRespuestaChecklist(supabase, {
      sesionId: sesion.id,
      itemCodigo: item.codigo,
      seccionId,
      estado: nuevoEstado,
      comentario: prev?.comentario || '',
    });
    setGuardando(false);
    if (!res.ok) {
      setMsg(res.error || 'No se pudo guardar.');
      return;
    }
    setRespuestas((m) => {
      const out = { ...m };
      if (res.deleted || !nuevoEstado) delete out[item.codigo];
      else out[item.codigo] = res.data || { ...prev, item_codigo: item.codigo, estado: nuevoEstado };
      return out;
    });
  };

  const guardarComentarioItem = async (item, seccionId, texto) => {
    if (!sesion?.id || cerrado) return;
    const est = respuestas[item.codigo]?.estado;
    if (!est) return;
    const res = await guardarRespuestaChecklist(supabase, {
      sesionId: sesion.id,
      itemCodigo: item.codigo,
      seccionId,
      estado: est,
      comentario: texto,
    });
    if (!res.ok) {
      setMsg(res.error || 'No se pudo guardar comentario.');
      return;
    }
    setRespuestas((m) => ({
      ...m,
      [item.codigo]: res.data || { ...m[item.codigo], comentario: texto },
    }));
  };

  const onBlurComentarios = async () => {
    if (!sesion?.id || cerrado) return;
    await guardarComentariosSesion(supabase, sesion.id, comentarios);
  };

  const cerrar = async () => {
    if (!sesion?.id) return;
    if (!confirm(`¿Cerrar checklist ${fecha} · ${turno}? Ya no se podrá editar (salvo admin).`)) return;
    setGuardando(true);
    await guardarComentariosSesion(supabase, sesion.id, comentarios);
    const res = await cerrarSesionChecklist(supabase, sesion.id);
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    setSesion(res.sesion);
    setMsg('Checklist cerrado.');
  };

  const reabrir = async () => {
    if (!sesion?.id || !esAdmin) return;
    const res = await reabrirSesionChecklist(supabase, sesion.id);
    if (!res.ok) return alert(res.error);
    setSesion(res.sesion);
    setMsg('Checklist reabierto.');
  };

  const abrirHistorial = (s) => {
    setFecha(String(s.fecha).slice(0, 10));
    setTurno(s.turno);
    setPestana('llenar');
  };

  const eliminarUno = async (s) => {
    if (!puedeEliminarHistorial || !s?.id) return;
    const label = `${String(s.fecha).slice(0, 10)} · ${etiquetaTienda(s.sucursal_id)} · ${labelTurno(s.turno)}`;
    if (!confirm(`¿Eliminar del historial?\n${label}\n\nSe borrarán las respuestas. No se puede deshacer.`)) return;
    setEliminandoHist(true);
    const res = await eliminarSesionChecklist(supabase, s.id);
    setEliminandoHist(false);
    if (!res.ok) {
      alert(res.error || 'No se pudo eliminar.');
      return;
    }
    if (sesion?.id === s.id) {
      setSesion(null);
      setRespuestas({});
      setComentarios('');
    }
    setMsg('Checklist eliminado del historial.');
    await cargarHistorial();
  };

  const eliminarTodoHistorial = async () => {
    if (!puedeEliminarHistorial || !historial.length) return;
    const n = historial.length;
    if (!confirm(
      `¿Eliminar las ${n} sesión(es) del historial listado?\n\nEsto borra checklists y respuestas. No se puede deshacer.`,
    )) return;
    setEliminandoHist(true);
    const ids = historial.map((s) => s.id);
    const res = await eliminarSesionesChecklist(supabase, ids);
    setEliminandoHist(false);
    if (!res.ok) {
      alert(res.error || 'No se pudo eliminar el historial.');
      return;
    }
    if (sesion?.id && ids.includes(sesion.id)) {
      setSesion(null);
      setRespuestas({});
      setComentarios('');
    }
    setMsg(`Historial eliminado (${res.eliminadas || n}).`);
    await cargarHistorial();
  };

  return (
    <div className="module">
      <div className="card" style={{ marginBottom: '0.75rem' }}>
        <h2 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>Check List operativo</h2>
        <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
          FA3B-017 · Encargado de turno marca cada punto (✔ / ✘ / R). Tienda:{' '}
          <strong>{etiquetaTienda(tienda)}</strong>
        </p>
        <div className="cv-estad-tabs" style={{ marginTop: '0.65rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <button type="button" className={`btn ${pestana === 'llenar' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPestana('llenar')}>
            Llenar turno
          </button>
          <button type="button" className={`btn ${pestana === 'historial' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPestana('historial')}>
            Historial
          </button>
        </div>
      </div>

      {aviso ? (
        <div className="card" style={{ marginBottom: '0.75rem', borderColor: 'var(--brand-gold)' }}>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>{aviso || AVISO_FALTA_CHECKLIST}</p>
        </div>
      ) : null}

      {pestana === 'llenar' && (
        <>
          <div className="card" style={{ marginBottom: '0.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
              <label>
                Fecha
                <input
                  className="input"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  disabled={guardando}
                />
              </label>
              <label>
                Turno
                <select className="select" value={turno} onChange={(e) => setTurno(e.target.value)} disabled={guardando}>
                  {TURNOS_CHECKLIST.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Encargado
                <input className="input" value={user?.nombre || '—'} readOnly />
              </label>
            </div>
            <div style={{ marginTop: '0.65rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.9rem' }}>
                {prog.marcados}/{prog.total} · {prog.pct}%
              </strong>
              <span className="muted" style={{ fontSize: '0.78rem' }}>
                ✔ {prog.ok} · ✘ {prog.no} · R {prog.reportar}
              </span>
              {sesion ? (
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.45rem',
                    borderRadius: 6,
                    background: cerrado ? 'rgba(46,125,50,0.12)' : 'rgba(225,153,41,0.15)',
                    color: cerrado ? '#2e7d32' : 'var(--brand-gold)',
                  }}
                >
                  {cerrado ? 'Cerrado' : 'Borrador'}
                </span>
              ) : null}
            </div>
            {msg ? <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>{msg}</p> : null}
          </div>

          {cargando ? (
            <p className="muted">Cargando checklist…</p>
          ) : !sesion ? (
            <p className="muted">No hay sesión. Revisa la conexión o ejecuta el SQL en Supabase.</p>
          ) : (
            <>
              {PLANTILLA_CHECKLIST_FA3B017.map((sec) => {
                const abierta = abiertas.has(sec.id);
                const hechos = sec.items.filter((it) => respuestas[it.codigo]?.estado).length;
                return (
                  <div key={sec.id} className="card" style={{ marginBottom: '0.55rem', padding: '0.65rem 0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => toggleSeccion(sec.id)}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        display: 'flex',
                        width: '100%',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <strong style={{ fontSize: '0.92rem' }}>
                        {sec.id}. {sec.nombre}
                      </strong>
                      <span className="muted" style={{ fontSize: '0.78rem' }}>
                        {hechos}/{sec.items.length} {abierta ? '▴' : '▾'}
                      </span>
                    </button>
                    {abierta && (
                      <ul style={{ listStyle: 'none', margin: '0.55rem 0 0', padding: 0 }}>
                        {sec.items.map((it) => {
                          const r = respuestas[it.codigo];
                          const est = r?.estado || '';
                          const pideNota = est === 'no' || est === 'reportar';
                          return (
                            <li
                              key={it.codigo}
                              style={{
                                padding: '0.55rem 0',
                                borderTop: '1px solid var(--border)',
                              }}
                            >
                              <div style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                                <strong>{it.codigo}</strong>{' '}
                                <span>{it.texto}</span>
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                {ESTADOS_CHECKLIST.map((e) => {
                                  const activo = est === e.id;
                                  return (
                                    <button
                                      key={e.id}
                                      type="button"
                                      className={`btn ${activo ? 'btn-primary' : 'btn-ghost'}`}
                                      style={{
                                        fontSize: '0.78rem',
                                        padding: '0.35rem 0.65rem',
                                        minWidth: 52,
                                        opacity: cerrado ? 0.7 : 1,
                                      }}
                                      disabled={cerrado || guardando}
                                      onClick={() => marcar(it, sec.id, e.id)}
                                    >
                                      {e.simbolo} {e.label}
                                    </button>
                                  );
                                })}
                                {est === 'reportar' && typeof onIrIncidencias === 'function' ? (
                                  <button
                                    type="button"
                                    className="btn btn-ghost"
                                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
                                    onClick={() => onIrIncidencias?.({ norma: it.codigo, texto: it.texto })}
                                  >
                                    Ir a Incidencias
                                  </button>
                                ) : null}
                              </div>
                              {pideNota ? (
                                <input
                                  className="input"
                                  style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}
                                  placeholder="Comentario de la falla…"
                                  defaultValue={r?.comentario || ''}
                                  disabled={cerrado}
                                  onBlur={(e) => guardarComentarioItem(it, sec.id, e.target.value)}
                                />
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}

              <div className="card" style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.35rem' }}>
                  Comentarios de fallas e incidencias en tienda
                </label>
                <textarea
                  className="input"
                  rows={3}
                  value={comentarios}
                  disabled={cerrado}
                  onChange={(e) => setComentarios(e.target.value)}
                  onBlur={onBlurComentarios}
                  placeholder="Resumen del turno (opcional)…"
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.65rem' }}>
                  {!cerrado ? (
                    <button type="button" className="btn btn-primary" disabled={guardando} onClick={cerrar}>
                      Cerrar checklist ({prog.marcados}/{prog.total})
                    </button>
                  ) : esAdmin ? (
                    <button type="button" className="btn btn-ghost" onClick={reabrir}>
                      Reabrir (admin)
                    </button>
                  ) : (
                    <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>Checklist cerrado.</p>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={cargarSesion} disabled={cargando}>
                    Recargar
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {pestana === 'historial' && (
        <div className="card">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0 }}>Historial</h3>
            {puedeEliminarHistorial && historial.length > 0 ? (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: '0.78rem', color: '#c0392b', borderColor: 'rgba(192,57,43,0.35)' }}
                disabled={eliminandoHist || cargandoHist}
                onClick={eliminarTodoHistorial}
              >
                Eliminar historial (admin)
              </button>
            ) : null}
          </div>
          {puedeEliminarHistorial ? (
            <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.75rem' }}>
              Solo Administrador puede borrar sesiones del historial. La acción no se puede deshacer.
            </p>
          ) : null}
          {cargandoHist ? (
            <p className="muted">Cargando…</p>
          ) : !historial.length ? (
            <p className="muted">Sin checklists guardados.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tienda</th>
                    <th>Turno</th>
                    <th>Estado</th>
                    <th>Quién</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {historial.map((s) => (
                    <tr key={s.id}>
                      <td>{String(s.fecha).slice(0, 10)}</td>
                      <td>{etiquetaTienda(s.sucursal_id)}</td>
                      <td>{labelTurno(s.turno)}</td>
                      <td style={{ fontWeight: 700, color: s.estado === 'cerrado' ? '#2e7d32' : 'var(--brand-gold)' }}>
                        {s.estado === 'cerrado' ? 'Cerrado' : 'Borrador'}
                      </td>
                      <td className="muted">{s.usuario_nombre || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => abrirHistorial(s)}>
                            Abrir
                          </button>
                          {puedeEliminarHistorial ? (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: '0.75rem', color: '#c0392b' }}
                              disabled={eliminandoHist}
                              onClick={() => eliminarUno(s)}
                            >
                              Eliminar
                            </button>
                          ) : null}
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
    </div>
  );
}
