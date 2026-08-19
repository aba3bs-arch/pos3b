import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { etiquetaTienda, listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
import { normalizarRol, puedeGestionarUsuarios } from '../lib/roles.js';
import {
  AVISO_FALTA_EVALUACION,
  DOC_EVALUACION,
  NUM_PREGUNTAS_ALEATORIAS,
  PTS_POR_PREGUNTA,
  PTS_TOTAL,
  calcularPuntuacion,
  eliminarEvaluacion,
  evaluacionVacia,
  guardarEvaluacion,
  hoyYmdLocal,
  listarEvaluaciones,
  obtenerEvaluacion,
  seleccionarPreguntasAleatorias,
} from '../lib/evaluacionOperativa.js';
import './EvaluacionOperativa.css';

function fmtPts(n) {
  const v = Number(n) || 0;
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

export default function EvaluacionOperativa({ supabase, sucursal, user }) {
  const rol = normalizarRol(user?.rol);
  const esAdmin = puedeGestionarUsuarios(rol) || rol === 'Gerente' || rol === 'Supervisor' || rol === 'Auditor';
  const tiendas = useMemo(() => listarSucursalesOperativas(), []);
  const [pestana, setPestana] = useState('nueva');
  const [draft, setDraft] = useState(() => evaluacionVacia({
    sucursalId: sucursal,
    auditorNombre: user?.nombre || '',
    auditorId: user?.id != null ? String(user.id) : null,
  }));
  const [empleados, setEmpleados] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  const [aviso, setAviso] = useState('');
  const [paso, setPaso] = useState(0); // 0 datos · 1 tickets · 2 piso · 3 preguntas · 4 cierre

  const cerrado = draft?.estado === 'cerrado';

  const score = useMemo(
    () => calcularPuntuacion({
      bloques: draft.bloques || [],
      respuestasPiso: draft.respuestas_piso || {},
      tickets: draft.tickets || [],
      preguntas: draft.preguntas || [],
    }),
    [draft],
  );

  const cargarEmpleados = useCallback(async () => {
    if (!supabase) return;
    const suc = normalizarCodigoTienda(draft.sucursal_id || sucursal);
    let q = supabase
      .from('usuarios')
      .select('id, nombre, rol, sucursal_id, activo')
      .order('nombre');
    const { data, error } = await q;
    if (error) {
      setEmpleados([]);
      return;
    }
    const lista = (data || []).filter((u) => {
      if (u.activo === false) return false;
      const r = normalizarRol(u.rol);
      if (r === 'Administrador') return false;
      if (!suc) return true;
      return normalizarCodigoTienda(u.sucursal_id) === suc || normalizarCodigoTienda(u.sucursal_id) === 'MAIN';
    });
    setEmpleados(lista);
  }, [supabase, draft.sucursal_id, sucursal]);

  useEffect(() => {
    cargarEmpleados();
  }, [cargarEmpleados]);

  const cargarHist = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    const res = await listarEvaluaciones(supabase, {
      sucursalId: esAdmin ? null : normalizarCodigoTienda(sucursal),
      limit: 50,
    });
    setCargando(false);
    if (res.aviso) setAviso(res.aviso);
    if (res.error) setMsg(res.error);
    setHistorial(res.data || []);
  }, [supabase, sucursal, esAdmin]);

  useEffect(() => {
    if (pestana === 'historial') cargarHist();
  }, [pestana, cargarHist]);

  const nueva = () => {
    setDraft(evaluacionVacia({
      sucursalId: sucursal,
      auditorNombre: user?.nombre || '',
      auditorId: user?.id != null ? String(user.id) : null,
    }));
    setPaso(0);
    setMsg('');
    setPestana('nueva');
  };

  const mezclarPreguntas = () => {
    if (cerrado) return;
    if (!confirm(`¿Sacar otras ${NUM_PREGUNTAS_ALEATORIAS} preguntas al azar? Se borra la calificación oral actual.`)) return;
    setDraft((d) => ({ ...d, preguntas: seleccionarPreguntasAleatorias() }));
  };

  const setCampo = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const setTicket = (idx, patch) => {
    setDraft((d) => {
      const tickets = [...(d.tickets || [])];
      tickets[idx] = { ...tickets[idx], ...patch };
      return { ...d, tickets };
    });
  };

  const addTicket = () => {
    setDraft((d) => ({
      ...d,
      tickets: [
        ...(d.tickets || []),
        { fecha: '', proveedor: '', cant_ticket: '', cant_ingresada: '', dif_neg: '', dif_pos: '', nota: '' },
      ],
    }));
  };

  const setPiso = (codigo, valor) => {
    if (cerrado) return;
    setDraft((d) => {
      const prev = d.respuestas_piso?.[codigo];
      const next = { ...(d.respuestas_piso || {}) };
      if (prev === valor) delete next[codigo];
      else next[codigo] = valor;
      return { ...d, respuestas_piso: next };
    });
  };

  const setPregunta = (id, patch) => {
    if (cerrado) return;
    setDraft((d) => ({
      ...d,
      preguntas: (d.preguntas || []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  };

  const guardar = async ({ cerrar = false } = {}) => {
    setGuardando(true);
    setMsg('');
    const res = await guardarEvaluacion(supabase, draft, { cerrar });
    setGuardando(false);
    if (!res.ok) {
      setAviso(res.aviso || '');
      setMsg(res.error || 'No se pudo guardar.');
      return;
    }
    setDraft(res.data);
    setAviso(res.aviso || '');
    setMsg(cerrar
      ? `Evaluación cerrada · ${fmtPts(res.score?.total)} / ${PTS_TOTAL} pts (${res.score?.pct}%)`
      : `Guardado · ${fmtPts(res.score?.total)} / ${PTS_TOTAL} pts (${res.score?.pct}%)`);
    if (cerrar) setPaso(4);
  };

  const abrirHist = async (id) => {
    setCargando(true);
    const res = await obtenerEvaluacion(supabase, id);
    setCargando(false);
    if (!res.ok) {
      setMsg(res.error || 'No se pudo abrir.');
      return;
    }
    setDraft(res.data);
    setPestana('nueva');
    setPaso(4);
    setMsg('');
  };

  const borrar = async () => {
    if (!draft.id) return;
    if (!confirm('¿Eliminar esta evaluación?')) return;
    const res = await eliminarEvaluacion(supabase, draft.id);
    if (!res.ok) {
      setMsg(res.error || 'No se pudo eliminar.');
      return;
    }
    nueva();
    setMsg('Evaluación eliminada.');
  };

  const pasos = ['Datos', 'Tickets', 'Piso', 'Preguntas', 'Resultado'];

  return (
    <div className="eo-app">
      <div className="eo-head">
        <span className="doc">{DOC_EVALUACION}</span>
        <h2>Evaluación operativa</h2>
        <p>
          Auditoría móvil del personal de tienda. Preguntas aleatorias basadas en las normas del Check List.
        </p>
      </div>

      <div className="eo-tabs">
        <button type="button" className={pestana === 'nueva' ? 'active' : ''} onClick={() => setPestana('nueva')}>
          Evaluar
        </button>
        <button type="button" className={pestana === 'historial' ? 'active' : ''} onClick={() => setPestana('historial')}>
          Historial
        </button>
      </div>

      {aviso && <div className="eo-aviso">{aviso || AVISO_FALTA_EVALUACION}</div>}
      {msg && <div className={msg.includes('cerrada') || msg.includes('Guardado') ? 'eo-okmsg' : 'eo-error'}>{msg}</div>}

      {pestana === 'historial' && (
        <div className="eo-card">
          <h3>Historial</h3>
          {cargando && <p className="eo-empty">Cargando…</p>}
          {!cargando && !historial.length && <p className="eo-empty">Sin evaluaciones guardadas.</p>}
          {!cargando && historial.map((h) => (
            <button key={h.id} type="button" className="eo-hist-row" onClick={() => abrirHist(h.id)}>
              <div>
                <div className="t">{etiquetaTienda(h.sucursal_id)} · {String(h.fecha).slice(0, 10)}</div>
                <div className="m">{h.encargado_nombre || '—'} · {h.auditor_nombre || 'Auditor'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`eo-badge${h.estado === 'borrador' ? ' borrador' : ''}`}>
                  {h.estado === 'cerrado' ? `${fmtPts(h.puntuacion_pct)}%` : 'Borrador'}
                </span>
              </div>
            </button>
          ))}
          <button type="button" className="eo-btn ghost" style={{ width: '100%', marginTop: '0.75rem' }} onClick={nueva}>
            + Nueva evaluación
          </button>
        </div>
      )}

      {pestana === 'nueva' && (
        <>
          <div className="eo-scorebar">
            <div className="kpi">
              <span className="lbl">Puntos</span>
              <strong>{fmtPts(score.total)}</strong>
            </div>
            <div className="kpi">
              <span className="lbl">De</span>
              <strong>{PTS_TOTAL}</strong>
            </div>
            <div className="kpi">
              <span className="lbl">%</span>
              <strong>{fmtPts(score.pct)}</strong>
            </div>
          </div>

          <div className="eo-tabs" style={{ marginTop: 0 }}>
            {pasos.map((label, i) => (
              <button
                key={label}
                type="button"
                className={paso === i ? 'active' : ''}
                onClick={() => setPaso(i)}
                style={{ fontSize: '0.72rem', padding: '0.45rem 0.25rem' }}
              >
                {label}
              </button>
            ))}
          </div>

          {paso === 0 && (
            <div className="eo-card">
              <h3>Datos de la visita</h3>
              <p className="sub">Antes de preguntar, explica que se basan en las normas operativas.</p>
              <div className="eo-grid">
                <div className="eo-field">
                  <label>Tienda</label>
                  <select
                    value={draft.sucursal_id || ''}
                    disabled={cerrado}
                    onChange={(e) => setCampo({ sucursal_id: e.target.value, encargado_id: null, encargado_nombre: '' })}
                  >
                    <option value="">Selecciona…</option>
                    {tiendas.map((t) => (
                      <option key={t} value={t}>{etiquetaTienda(t)}</option>
                    ))}
                  </select>
                </div>
                <div className="eo-field">
                  <label>Fecha</label>
                  <input
                    type="date"
                    value={draft.fecha || hoyYmdLocal()}
                    disabled={cerrado}
                    onChange={(e) => setCampo({ fecha: e.target.value })}
                  />
                </div>
                <div className="eo-field">
                  <label>Encargado / empleado</label>
                  <select
                    value={draft.encargado_id || ''}
                    disabled={cerrado}
                    onChange={(e) => {
                      const id = e.target.value;
                      const emp = empleados.find((x) => String(x.id) === String(id));
                      setCampo({
                        encargado_id: id || null,
                        encargado_nombre: emp?.nombre || '',
                      });
                    }}
                  >
                    <option value="">Selecciona o escribe abajo…</option>
                    {empleados.map((e) => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="eo-field">
                  <label>Nombre (si no está en lista)</label>
                  <input
                    value={draft.encargado_nombre || ''}
                    disabled={cerrado}
                    placeholder="Nombre completo"
                    onChange={(e) => setCampo({ encargado_nombre: e.target.value, encargado_id: null })}
                  />
                </div>
                <div className="eo-field">
                  <label>Auditor</label>
                  <input
                    value={draft.auditor_nombre || ''}
                    disabled={cerrado}
                    onChange={(e) => setCampo({ auditor_nombre: e.target.value })}
                  />
                </div>
              </div>
              <button type="button" className="eo-btn primary" style={{ width: '100%', marginTop: '0.85rem' }} onClick={() => setPaso(1)}>
                Continuar → Tickets
              </button>
            </div>
          )}

          {paso === 1 && (
            <div className="eo-card">
              <div className="eo-bloque-hd">
                <h3 style={{ margin: 0 }}>Revisión de tickets de compra</h3>
                <span className="pts">{fmtPts(score.tickets.pts)} / {score.tickets.max} pts</span>
              </div>
              <p className="sub">Compara cantidad en ticket vs ingresada al sistema.</p>
              {(draft.tickets || []).map((t, idx) => (
                <div key={idx} className="eo-ticket">
                  <div className="eo-grid two">
                    <div className="eo-field">
                      <label>Fecha</label>
                      <input type="date" value={t.fecha || ''} disabled={cerrado} onChange={(e) => setTicket(idx, { fecha: e.target.value })} />
                    </div>
                    <div className="eo-field">
                      <label>Proveedor</label>
                      <input value={t.proveedor || ''} disabled={cerrado} onChange={(e) => setTicket(idx, { proveedor: e.target.value })} />
                    </div>
                    <div className="eo-field">
                      <label>Cant. ticket</label>
                      <input inputMode="decimal" value={t.cant_ticket || ''} disabled={cerrado} onChange={(e) => setTicket(idx, { cant_ticket: e.target.value })} />
                    </div>
                    <div className="eo-field">
                      <label>Cant. ingresada</label>
                      <input inputMode="decimal" value={t.cant_ingresada || ''} disabled={cerrado} onChange={(e) => setTicket(idx, { cant_ingresada: e.target.value })} />
                    </div>
                    <div className="eo-field">
                      <label>Dif. neg.</label>
                      <input inputMode="decimal" value={t.dif_neg || ''} disabled={cerrado} onChange={(e) => setTicket(idx, { dif_neg: e.target.value })} />
                    </div>
                    <div className="eo-field">
                      <label>Dif. pos.</label>
                      <input inputMode="decimal" value={t.dif_pos || ''} disabled={cerrado} onChange={(e) => setTicket(idx, { dif_pos: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
              {!cerrado && (
                <button type="button" className="eo-btn ghost" style={{ width: '100%' }} onClick={addTicket}>+ Otro ticket</button>
              )}
              <div className="eo-actions">
                <button type="button" className="eo-btn primary" onClick={() => setPaso(2)}>Continuar → Piso</button>
                <button type="button" className="eo-btn ghost" onClick={() => setPaso(0)}>← Datos</button>
              </div>
            </div>
          )}

          {paso === 2 && (
            <>
              {(draft.bloques || []).map((b) => {
                const r = score.desglose[b.id] || { pts: 0, max: b.ptsMax };
                const sinPts = !(Number(b.ptsMax) > 0);
                return (
                  <div key={b.id} className="eo-card">
                    <div className="eo-bloque-hd">
                      <h3 style={{ margin: 0 }}>{b.titulo}</h3>
                      <span className="pts">{sinPts ? 'Sin pts' : `${fmtPts(r.pts)} / ${r.max} pts`}</span>
                    </div>
                    <p className="sub">{sinPts ? 'Solo observación · no suma al total' : 'Cumple · normas operativas'}</p>
                    {(b.items || []).map((it) => {
                      const val = draft.respuestas_piso?.[it.codigo];
                      return (
                        <div key={it.codigo} className="eo-item">
                          <div className="txt">
                            <span className="cod">{it.codigo}</span>
                            {it.texto}
                          </div>
                          <div className="eo-toggle">
                            <button type="button" className={`si${val === 'si' ? ' active' : ''}`} disabled={cerrado} onClick={() => setPiso(it.codigo, 'si')}>
                              Sí
                            </button>
                            <button type="button" className={`no${val === 'no' ? ' active' : ''}`} disabled={cerrado} onClick={() => setPiso(it.codigo, 'no')}>
                              No
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              <div className="eo-actions">
                <button type="button" className="eo-btn primary" onClick={() => setPaso(3)}>Continuar → Preguntas</button>
                <button type="button" className="eo-btn ghost" onClick={() => setPaso(1)}>← Tickets</button>
              </div>
            </>
          )}

          {paso === 3 && (
            <div className="eo-card">
              <div className="eo-bloque-hd">
                <h3 style={{ margin: 0 }}>Evaluación del empleado</h3>
                <span className="pts">{fmtPts(score.preguntas.pts)} / {score.preguntas.max} pts</span>
              </div>
              <p className="sub">
                {NUM_PREGUNTAS_ALEATORIAS} preguntas al azar · {PTS_POR_PREGUNTA} pts c/u. Califica según la respuesta oral.
              </p>
              {!cerrado && (
                <button type="button" className="eo-btn ghost" style={{ width: '100%', marginBottom: '0.75rem' }} onClick={mezclarPreguntas}>
                  🔀 Otras preguntas al azar
                </button>
              )}
              {(draft.preguntas || []).map((p) => (
                <div key={p.id} className="eo-preg">
                  <div className="n">Pregunta {p.orden}</div>
                  <div className="q">{p.texto}</div>
                  {p.guia && <div className="guia">Guía auditor: {p.guia}</div>}
                  <div className="eo-field">
                    <label>Notas / respuesta observada</label>
                    <textarea
                      value={p.notas_auditor || ''}
                      disabled={cerrado}
                      placeholder="Anota lo que respondió…"
                      onChange={(e) => setPregunta(p.id, { notas_auditor: e.target.value })}
                    />
                  </div>
                  <div className="eo-pts-row">
                    {[0, 1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={Number(p.pts) === n ? 'active' : ''}
                        disabled={cerrado}
                        onClick={() => setPregunta(p.id, { pts: n })}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="eo-actions">
                <button type="button" className="eo-btn primary" onClick={() => setPaso(4)}>Ver resultado</button>
                <button type="button" className="eo-btn ghost" onClick={() => setPaso(2)}>← Piso</button>
              </div>
            </div>
          )}

          {paso === 4 && (
            <div className="eo-card">
              <h3>Resultado y firmas</h3>
              <p className="sub">Puntuación total y % de evaluación.</p>
              <div className="eo-scorebar">
                <div className="kpi">
                  <span className="lbl">Total</span>
                  <strong>{fmtPts(score.total)}</strong>
                </div>
                <div className="kpi">
                  <span className="lbl">Máx</span>
                  <strong>{PTS_TOTAL}</strong>
                </div>
                <div className="kpi">
                  <span className="lbl">Eval.</span>
                  <strong>{fmtPts(score.pct)}%</strong>
                </div>
              </div>
              <div className="eo-grid" style={{ marginBottom: '0.75rem' }}>
                <div className="eo-field" style={{ fontSize: '0.85rem', color: 'var(--eo-muted)' }}>
                  Piso {fmtPts(score.pisoPts)} · Tickets {fmtPts(score.tickets.pts)} · Preguntas {fmtPts(score.preguntas.pts)}
                </div>
              </div>
              <div className="eo-field" style={{ marginBottom: '0.65rem' }}>
                <label>Comentarios</label>
                <textarea
                  value={draft.comentarios || ''}
                  disabled={cerrado}
                  placeholder="Observaciones del auditor…"
                  onChange={(e) => setCampo({ comentarios: e.target.value })}
                />
              </div>
              <div className="eo-grid two">
                <div className="eo-field">
                  <label>Firma auditor</label>
                  <input value={draft.firma_auditor || ''} disabled={cerrado} onChange={(e) => setCampo({ firma_auditor: e.target.value })} placeholder="Nombre" />
                </div>
                <div className="eo-field">
                  <label>Firma encargado</label>
                  <input value={draft.firma_encargado || ''} disabled={cerrado} onChange={(e) => setCampo({ firma_encargado: e.target.value })} placeholder="Nombre" />
                </div>
                <div className="eo-field">
                  <label>Firma asesor</label>
                  <input value={draft.firma_asesor || ''} disabled={cerrado} onChange={(e) => setCampo({ firma_asesor: e.target.value })} placeholder="Opcional" />
                </div>
              </div>

              <div className="eo-actions">
                {!cerrado && (
                  <>
                    <button type="button" className="eo-btn primary" disabled={guardando} onClick={() => guardar({ cerrar: false })}>
                      {guardando ? 'Guardando…' : 'Guardar borrador'}
                    </button>
                    <button
                      type="button"
                      className="eo-btn warn"
                      disabled={guardando}
                      onClick={() => {
                        if (!confirm('¿Cerrar evaluación? Ya no se podrá editar.')) return;
                        guardar({ cerrar: true });
                      }}
                    >
                      Cerrar evaluación
                    </button>
                  </>
                )}
                {cerrado && (
                  <div className="eo-okmsg">Evaluación cerrada · {fmtPts(draft.puntuacion_pct ?? score.pct)}%</div>
                )}
                <button type="button" className="eo-btn ghost" onClick={() => setPaso(3)}>← Preguntas</button>
                <button type="button" className="eo-btn ghost" onClick={nueva}>Nueva evaluación</button>
                {draft.id && esAdmin && !cerrado && (
                  <button type="button" className="eo-btn ghost" style={{ color: 'var(--eo-no)' }} onClick={borrar}>
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
