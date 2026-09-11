import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import { normalizarRol } from '../lib/roles.js';
import {
  AVISO_FALTA_CUBRE_SOLICITUDES,
  ESTADOS_SOLICITUD_CT,
  aceptarSolicitudCt,
  cancelarSolicitudCt,
  listarCatalogoCt,
  listarSolicitudesCt,
  marcarCumplidaCt,
  marcarNoShowCt,
  rechazarSolicitudCt,
  setDisponibilidadManualCt,
  solicitarCt,
} from '../lib/cubreSolicitudes.js';
import {
  AVISO_FALTA_CUBRE_EVALUACIONES,
  CALIFICACIONES_CT,
  CRITERIOS_EVALUACION_CT,
  contarProblemasEvaluacion,
  formEvaluacionCtVacio,
  guardarEvaluacionCt,
  mapaEvaluacionesPorSolicitudes,
  resumenCriteriosEvaluacion,
  etiquetaCalificacionCt,
} from '../lib/cubreEvaluaciones.js';
import { fechasSemanaPlan, etiquetaFechaCorta } from '../lib/planHorario.js';
import { resumenAceptacionCt } from '../lib/cubreAceptacionCt.js';
import { IndicadorAceptacionCt, ModalDesgloseAceptacion } from './IndicadorAceptacionCt.jsx';

function fmtFecha(ymd) {
  if (!ymd) return '—';
  try {
    return new Date(`${ymd}T12:00:00`).toLocaleDateString('es-MX', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return ymd;
  }
}

/**
 * Panel base del sistema CT: catálogo con semáforo + solicitudes.
 * Alta/baja de CT sigue en RH ABA3B (tipo Cubre turnos).
 */
export default function PanelCubreSolicitudes({ supabase, user, sucursal }) {
  const [catalogo, setCatalogo] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [evalsMap, setEvalsMap] = useState({});
  const [aceptacionCt, setAceptacionCt] = useState(null);
  const [aceptacionCatalogo, setAceptacionCatalogo] = useState({});
  const [desgloseAceptacion, setDesgloseAceptacion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState('');
  const [msg, setMsg] = useState('');
  const [evalModal, setEvalModal] = useState(null); // { solicitud, form, guardando }
  const [form, setForm] = useState({
    ct_rh_id: '',
    fecha: new Date().toISOString().slice(0, 10),
    turno_etiqueta: '',
    notas: '',
  });

  const rol = normalizarRol(user?.rol);
  const esAdmin = rol === 'Administrador' || rol === 'Gerente';
  const esCajero = rol === 'Cajero';
  const esCtMovil = Boolean(user?.esCtMovil && user?.ctRhId);
  const ctRhId = esCtMovil ? user.ctRhId : null;
  const puedeEvaluar = (esCajero || esAdmin) && !esCtMovil;

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    if (esCtMovil) {
      const [sol, ace] = await Promise.all([
        listarSolicitudesCt(supabase, {
          ctRhId,
          limit: 80,
        }),
        resumenAceptacionCt(supabase, ctRhId),
      ]);
      setCatalogo([]);
      setSolicitudes(sol.data || []);
      setEvalsMap({});
      setAceptacionCt(ace);
      setAceptacionCatalogo({});
      setAviso(sol.faltaTabla ? AVISO_FALTA_CUBRE_SOLICITUDES : (sol.error || ''));
      setCargando(false);
      return;
    }
    const [cat, sol] = await Promise.all([
      listarCatalogoCt(supabase),
      listarSolicitudesCt(supabase, {
        sucursal: esAdmin ? undefined : sucursal,
        limit: 150,
      }),
    ]);
    setCatalogo(cat.data || []);
    setSolicitudes(sol.data || []);
    setAviso(cat.error || sol.faltaTabla ? (sol.error || cat.error || '') : (sol.error || ''));
    if (sol.faltaTabla) setAviso(AVISO_FALTA_CUBRE_SOLICITUDES);

    const ids = (sol.data || []).map((s) => s.id);
    const ev = await mapaEvaluacionesPorSolicitudes(supabase, ids);
    setEvalsMap(ev.mapa || {});
    if (ev.faltaTabla && !sol.faltaTabla) {
      setAviso((a) => a || AVISO_FALTA_CUBRE_EVALUACIONES);
    }
    const aceMap = {};
    await Promise.all(
      (cat.data || []).slice(0, 40).map(async (c) => {
        const rhId = c.rh_id || c.id;
        if (!rhId) return;
        aceMap[String(rhId)] = await resumenAceptacionCt(supabase, rhId);
      }),
    );
    setAceptacionCatalogo(aceMap);
    setAceptacionCt(null);
    setCargando(false);
  }, [supabase, sucursal, esAdmin, esCtMovil, ctRhId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrirEvaluacion = (solicitud) => {
    const prev = evalsMap[String(solicitud.id)];
    const base = formEvaluacionCtVacio();
    if (prev) {
      for (const c of CRITERIOS_EVALUACION_CT) base[c.id] = Boolean(prev[c.id]);
      base.calificacion = prev.calificacion ?? 4;
      base.comentario = prev.comentario || '';
    }
    setEvalModal({ solicitud, form: base, guardando: false });
  };

  const guardarEvaluacion = async () => {
    if (!evalModal?.solicitud) return;
    setEvalModal((m) => (m ? { ...m, guardando: true } : m));
    const res = await guardarEvaluacionCt(supabase, evalModal.solicitud, evalModal.form, { user });
    if (!res.ok) {
      alert(res.error);
      setEvalModal((m) => (m ? { ...m, guardando: false } : m));
      return;
    }
    setMsg(res.mensaje);
    setEvalModal(null);
    await cargar();
  };

  const disponibles = useMemo(() => catalogo.filter((c) => c.puede_solicitar), [catalogo]);
  const fechasSemana = useMemo(() => {
    return fechasSemanaPlan(0).map((f) => {
      const ymd = f.fecha.toISOString().slice(0, 10);
      const corto = etiquetaFechaCorta(f.fecha);
      return { ymd, corto, diaId: f.diaId };
    });
  }, []);
  const pendientes = useMemo(
    () => (solicitudes || []).filter((s) => s.estado === 'solicitada'),
    [solicitudes],
  );

  const pedir = async (e) => {
    e.preventDefault();
    if (!form.ct_rh_id) return alert('Elige un CT disponible (verde).');
    const res = await solicitarCt(
      supabase,
      {
        sucursal_id: sucursal,
        fecha: form.fecha,
        ct_rh_id: form.ct_rh_id,
        turno_etiqueta: form.turno_etiqueta || null,
        notas: form.notas || null,
      },
      { user },
    );
    if (!res.ok) return alert(res.error);
    setMsg(res.mensaje);
    setForm((f) => ({ ...f, ct_rh_id: '', notas: '' }));
    await cargar();
  };

  if (esCtMovil) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="card" style={{ borderTop: '4px solid #2e7d32' }}>
          <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>
            Mis coberturas · {user?.nombre || 'CT'}
          </h3>
          <p className="muted" style={{ margin: 0, fontSize: '0.86rem' }}>
            Entraste con tu <strong>PIN personal móvil</strong> (solo este celular).
            Aquí aceptas o rechazas las solicitudes de las tiendas.
            Al aceptar recibes un <strong>PIN temporal</strong> para marcar en la caja de esa tienda ese día
            (no uses el PIN móvil en las cajas).
          </p>
          <div style={{ marginTop: '0.75rem' }}>
            <IndicadorAceptacionCt
              resumen={aceptacionCt}
              onClick={() => setDesgloseAceptacion({ resumen: aceptacionCt, nombre: user?.nombre || 'CT' })}
            />
          </div>
          {aviso && (
            <p style={{ margin: '0.65rem 0 0', color: 'var(--danger)', fontSize: '0.85rem' }}>{aviso}</p>
          )}
          <div style={{ marginTop: '0.65rem' }}>
            <button type="button" className="btn btn-ghost" onClick={() => void cargar()} disabled={cargando}>
              {cargando ? 'Actualizando…' : 'Actualizar'}
            </button>
            {pendientes.length > 0 && (
              <span className="muted" style={{ marginLeft: 10, fontSize: '0.85rem' }}>
                {pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        <div className="card">
          <h4 style={{ margin: '0 0 0.5rem' }}>Solicitudes para ti</h4>
          {cargando ? (
            <p className="muted">Cargando…</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tienda</th>
                    <th>Estado</th>
                    <th>PIN caja</th>
                    <th>Quién pidió</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {solicitudes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        Aún no te han solicitado cobertura. Cuando una tienda te pida desde Plan horario,
                        aparecerá aquí.
                      </td>
                    </tr>
                  ) : (
                    solicitudes.map((s) => (
                      <tr key={s.id}>
                        <td>
                          {fmtFecha(s.fecha)}
                          {s.turno_etiqueta ? (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>{s.turno_etiqueta}</div>
                          ) : null}
                        </td>
                        <td>{etiquetaTienda(s.sucursal_id)}</td>
                        <td>{ESTADOS_SOLICITUD_CT[s.estado] || s.estado}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          {s.estado === 'aceptada' && s.pin_temporal ? s.pin_temporal : '—'}
                        </td>
                        <td className="muted" style={{ fontSize: '0.8rem' }}>
                          {s.solicitado_por_nombre || s.empleado_planta_nombre || '—'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {s.estado === 'solicitada' && (
                            <>
                              <button
                                type="button"
                                className="btn btn-gold"
                                style={{ fontSize: '0.78rem', padding: '0.15rem 0.4rem' }}
                                onClick={async () => {
                                  if (!confirm(
                                    `¿Aceptar cobertura en ${etiquetaTienda(s.sucursal_id)} el ${s.fecha}?`,
                                  )) return;
                                  const res = await aceptarSolicitudCt(supabase, s.id, { user });
                                  if (!res.ok) return alert(res.error);
                                  alert(res.mensaje);
                                  await cargar();
                                }}
                              >
                                Aceptar
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ fontSize: '0.78rem', padding: '0.15rem 0.4rem' }}
                                onClick={async () => {
                                  if (!confirm('¿Rechazar esta solicitud?')) return;
                                  const res = await rechazarSolicitudCt(supabase, s.id);
                                  if (!res.ok) return alert(res.error);
                                  await cargar();
                                }}
                              >
                                Rechazar
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.8rem' }}>
            Tres PINs distintos: (1) PIN móvil = solo tu celular para ver/aceptar;
            (2) PIN de tienda (Configuración) = marcaje genérico en caja;
            (3) PIN temporal = tras aceptar, solo esa tienda y fecha.
          </p>
        </div>
      </div>

        {desgloseAceptacion && (
          <ModalDesgloseAceptacion
            resumen={desgloseAceptacion.resumen}
            nombre={desgloseAceptacion.nombre}
            onClose={() => setDesgloseAceptacion(null)}
          />
        )}
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: '4px solid #2e7d32' }}>
        <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>Cubre turnos · catálogo independiente</h3>
        <p className="muted" style={{ margin: 0, fontSize: '0.86rem' }}>
          Los CT se dan de alta/baja en <strong>RH ABA3B → Cubre turnos</strong> (no ocupan plaza de planta).
          Semáforo: <span style={{ color: '#2e7d32', fontWeight: 700 }}>verde = disponible</span>,
          {' '}<span style={{ color: '#c62828', fontWeight: 700 }}>rojo = cubriendo / hold / no disponible</span>.
          Alta distinta a planta: sin nómina (pago en gastos CUBRE TURNO → nombre).
          El CT recibe solicitudes en su <strong>celular con PIN móvil</strong>; en caja usa el PIN de tienda o el PIN temporal al aceptar.
          Tras cubrir, el <strong>empleado de planta evalúa al CT</strong> (consumo, faltantes de cigarro/dinero, quejas, etc.).
          Pueden cubrir en las 7 tiendas (algunos solo día). Desde Plan horario puedes cambiar de CT o quitarlo si el empleado trabaja su descanso.
        </p>
        {aviso && (
          <p style={{ margin: '0.65rem 0 0', color: 'var(--danger)', fontSize: '0.85rem' }}>{aviso}</p>
        )}
        {msg && (
          <p style={{ margin: '0.65rem 0 0', fontSize: '0.88rem' }}>{msg}</p>
        )}
      </div>

      <div className="card">
        <h4 style={{ margin: '0 0 0.5rem' }}>Catálogo CT</h4>
        {cargando ? (
          <p className="muted">Cargando…</p>
        ) : catalogo.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Aún no hay CT. Regístralos en RH con tipo <strong>Cubre turnos</strong>.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th />
                  <th>Nombre</th>
                  <th>Aceptación</th>
                  <th>Ámbito</th>
                  <th>Teléfono</th>
                  <th>Estado</th>
                  {esAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {catalogo.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span
                        title={c.disponibilidad_label}
                        style={{
                          display: 'inline-block',
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          background: c.color,
                        }}
                      />
                    </td>
                    <td style={{ fontWeight: 600 }}>{c.nombre}</td>
                    <td>
                      <IndicadorAceptacionCt
                        compact
                        resumen={aceptacionCatalogo[String(c.rh_id || c.id)]}
                        onClick={() => setDesgloseAceptacion({
                          resumen: aceptacionCatalogo[String(c.rh_id || c.id)],
                          nombre: c.nombre,
                        })}
                      />
                    </td>
                    <td className="muted" style={{ fontSize: '0.8rem' }}>
                      {c.ct_solo_dia ? 'Solo día · ' : 'Día/noche · '}
                      {Array.isArray(c.ct_sucursales) && c.ct_sucursales.length
                        ? c.ct_sucursales.map((s) => etiquetaTienda(s)).join(', ')
                        : '7 sucursales'}
                    </td>
                    <td className="muted">{c.telefono || '—'}</td>
                    <td>
                      {c.disponibilidad_label}
                      {c.hold_until ? (
                        <div className="muted" style={{ fontSize: '0.75rem' }}>
                          hasta {new Date(c.hold_until).toLocaleString('es-MX')}
                        </div>
                      ) : null}
                    </td>
                    {esAdmin && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {c.disponibilidad !== 'hold' && c.disponibilidad !== 'baja' && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: '0.78rem', padding: '0.15rem 0.4rem' }}
                            onClick={async () => {
                              const on = c.disponibilidad !== 'disponible';
                              const res = await setDisponibilidadManualCt(supabase, c.rh_id, on);
                              if (!res.ok) return alert(res.error);
                              await cargar();
                            }}
                          >
                            {c.disponibilidad === 'disponible' ? 'Marcar no disponible' : 'Marcar disponible'}
                          </button>
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

      {(esCajero || esAdmin) && (
        <div className="card">
          <h4 style={{ margin: '0 0 0.5rem' }}>
            Solicitar CT · {etiquetaTienda(sucursal)}
          </h4>
          <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.84rem' }}>
            El cajero elige el CT disponible que más le convenga para cubrir el descanso.
          </p>
          <form
            onSubmit={pedir}
            style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
          >
            <label className="muted" style={{ fontSize: '0.8rem' }}>
              CT disponible
              <select
                className="select"
                style={{ marginTop: 4 }}
                value={form.ct_rh_id}
                onChange={(e) => setForm({ ...form, ct_rh_id: e.target.value })}
                required
              >
                <option value="">— Verde = disponible —</option>
                {disponibles.map((c) => (
                  <option key={c.id} value={c.rh_id}>
                    ● {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted" style={{ fontSize: '0.8rem' }}>
              Fecha
              <input
                className="input"
                style={{ marginTop: 4 }}
                type="date"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                required
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: 4 }}>
                {fechasSemana.map((f) => (
                  <button
                    key={f.ymd}
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: '0.72rem', padding: '0.1rem 0.35rem' }}
                    onClick={() => setForm({ ...form, fecha: f.ymd })}
                  >
                    {f.corto}
                  </button>
                ))}
              </div>
            </label>
            <label className="muted" style={{ fontSize: '0.8rem' }}>
              Turno (opcional)
              <input
                className="input"
                style={{ marginTop: 4 }}
                value={form.turno_etiqueta}
                onChange={(e) => setForm({ ...form, turno_etiqueta: e.target.value })}
                placeholder="Diurno / Nocturno"
              />
            </label>
            <label className="muted" style={{ fontSize: '0.8rem' }}>
              Notas
              <input
                className="input"
                style={{ marginTop: 4 }}
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                placeholder="Descanso de…"
              />
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={!disponibles.length}>
                Solicitar CT
              </button>
            </div>
          </form>
          {!disponibles.length && !cargando && (
            <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.84rem' }}>
              No hay CT en verde ahora. Espera a que se liberen o revisa holds.
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h4 style={{ margin: '0 0 0.5rem' }}>Solicitudes</h4>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tienda</th>
                <th>CT</th>
                <th>Estado</th>
                <th>PIN</th>
                <th>Solicitó</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {solicitudes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">Sin solicitudes aún.</td>
                </tr>
              ) : (
                solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td>{fmtFecha(s.fecha)}</td>
                    <td>{etiquetaTienda(s.sucursal_id)}</td>
                    <td>
                      {s.ct_nombre}
                      {s.ct_telefono ? <div className="muted" style={{ fontSize: '0.75rem' }}>{s.ct_telefono}</div> : null}
                    </td>
                    <td>{ESTADOS_SOLICITUD_CT[s.estado] || s.estado}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                      {s.estado === 'aceptada' && s.pin_temporal ? s.pin_temporal : '—'}
                    </td>
                    <td className="muted" style={{ fontSize: '0.8rem' }}>{s.solicitado_por_nombre || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {s.estado === 'solicitada' && (
                        <>
                          <button
                            type="button"
                            className="btn btn-gold"
                            style={{ fontSize: '0.78rem', padding: '0.15rem 0.4rem' }}
                            onClick={async () => {
                              if (!confirm(`¿Aceptar cobertura de ${s.ct_nombre} en ${etiquetaTienda(s.sucursal_id)}?`)) return;
                              const res = await aceptarSolicitudCt(supabase, s.id, { user });
                              if (!res.ok) return alert(res.error);
                              alert(res.mensaje);
                              await cargar();
                            }}
                          >
                            Aceptar (PIN)
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: '0.78rem', padding: '0.15rem 0.4rem' }}
                            onClick={async () => {
                              const res = await rechazarSolicitudCt(supabase, s.id);
                              if (!res.ok) return alert(res.error);
                              await cargar();
                            }}
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                      {s.estado === 'aceptada' && esAdmin && (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ fontSize: '0.78rem', padding: '0.15rem 0.4rem' }}
                            onClick={async () => {
                              const res = await marcarCumplidaCt(supabase, s.id);
                              if (!res.ok) return alert(res.error);
                              abrirEvaluacion({ ...s, estado: 'cumplida' });
                            }}
                          >
                            Cumplida
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: '0.78rem', padding: '0.15rem 0.4rem', color: 'var(--danger)' }}
                            onClick={async () => {
                              if (!confirm('¿Marcar no-show? El CT irá a hold 7 días.')) return;
                              const res = await marcarNoShowCt(supabase, s.id);
                              if (!res.ok) return alert(res.error);
                              alert(res.mensaje);
                              await cargar();
                            }}
                          >
                            No cumplió
                          </button>
                        </>
                      )}
                      {puedeEvaluar && ['aceptada', 'cumplida'].includes(s.estado) && (
                        <button
                          type="button"
                          className="btn btn-gold"
                          style={{ fontSize: '0.78rem', padding: '0.15rem 0.4rem' }}
                          title="Evaluación del empleado de planta sobre el CT"
                          onClick={() => abrirEvaluacion(s)}
                        >
                          {evalsMap[String(s.id)] ? 'Ver / editar evaluación' : 'Evaluar CT'}
                        </button>
                      )}
                      {evalsMap[String(s.id)] && (
                        <span
                          className="muted"
                          style={{
                            display: 'inline-block',
                            fontSize: '0.72rem',
                            marginLeft: 4,
                            color: contarProblemasEvaluacion(evalsMap[String(s.id)])
                              ? 'var(--danger)'
                              : '#2e7d32',
                          }}
                          title={resumenCriteriosEvaluacion(evalsMap[String(s.id)]).join(' · ') || 'Sin alertas'}
                        >
                          {etiquetaCalificacionCt(evalsMap[String(s.id)].calificacion)}
                          {contarProblemasEvaluacion(evalsMap[String(s.id)])
                            ? ` · ${contarProblemasEvaluacion(evalsMap[String(s.id)])} alerta(s)`
                            : ' · OK'}
                        </span>
                      )}
                      {['solicitada', 'aceptada'].includes(s.estado) && (esAdmin || esCajero) && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ fontSize: '0.78rem', padding: '0.15rem 0.4rem' }}
                          title="Cancela la solicitud CT (el CT verá la cancelación)"
                          onClick={async () => {
                            if (!confirm(
                              `¿Cancelar la solicitud a ${s.ct_nombre}?\n\n`
                              + 'Se libera al CT y se notifica. Puedes pedir otro después.',
                            )) return;
                            const res = await cancelarSolicitudCt(supabase, s.id, { user });
                            if (!res.ok) return alert(res.error);
                            alert(res.mensaje || 'Solicitud cancelada.');
                            await cargar();
                          }}
                        >
                          Cancelar solicitud
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.8rem' }}>
          El cajero puede <strong>Cancelar solicitud</strong> mientras esté solicitada o aceptada.
          Si el CT rechaza, aparece una <strong>alerta flotante</strong> en cualquier módulo hasta atenderla.
          Tras cubrir, la planta evalúa al CT (consumo, faltantes, quejas…).
        </p>
      </div>

      {evalModal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !evalModal.guardando && setEvalModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 80,
            padding: 16,
          }}
        >
          <div
            className="card"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
          >
            <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>
              Evaluar CT · {evalModal.solicitud.ct_nombre}
            </h3>
            <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.84rem' }}>
              {etiquetaTienda(evalModal.solicitud.sucursal_id)} · {fmtFecha(evalModal.solicitud.fecha)}.
              Marca lo que falló (si no hubo problemas, deja todo desmarcado y califica).
            </p>

            <div style={{ display: 'grid', gap: '0.45rem', marginBottom: '0.75rem' }}>
              {CRITERIOS_EVALUACION_CT.map((c) => (
                <label
                  key={c.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(evalModal.form[c.id])}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEvalModal((m) => (
                        m ? { ...m, form: { ...m.form, [c.id]: checked } } : m
                      ));
                    }}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>

            <label className="muted" style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.65rem' }}>
              Calificación general
              <select
                className="select"
                style={{ display: 'block', marginTop: 4, width: '100%' }}
                value={evalModal.form.calificacion ?? 4}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setEvalModal((m) => (m ? { ...m, form: { ...m.form, calificacion: v } } : m));
                }}
              >
                {CALIFICACIONES_CT.map((c) => (
                  <option key={c.valor} value={c.valor}>{c.label}</option>
                ))}
              </select>
            </label>

            <label className="muted" style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.85rem' }}>
              Comentario (opcional)
              <textarea
                className="input"
                rows={3}
                style={{ display: 'block', marginTop: 4, width: '100%', resize: 'vertical' }}
                placeholder="Ej. faltó caja chica, cliente se quejó del trato…"
                value={evalModal.form.comentario || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setEvalModal((m) => (m ? { ...m, form: { ...m.form, comentario: v } } : m));
                }}
              />
            </label>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={evalModal.guardando}
                onClick={() => setEvalModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={evalModal.guardando}
                onClick={() => void guardarEvaluacion()}
              >
                {evalModal.guardando ? 'Guardando…' : 'Guardar evaluación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
      {desgloseAceptacion && (
        <ModalDesgloseAceptacion
          resumen={desgloseAceptacion.resumen}
          nombre={desgloseAceptacion.nombre}
          onClose={() => setDesgloseAceptacion(null)}
        />
      )}

  );
}
