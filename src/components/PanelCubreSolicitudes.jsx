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
import { fechasSemanaPlan, etiquetaFechaCorta } from '../lib/planHorario.js';

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
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState('');
  const [msg, setMsg] = useState('');
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

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    if (esCtMovil) {
      const sol = await listarSolicitudesCt(supabase, {
        ctRhId,
        limit: 80,
      });
      setCatalogo([]);
      setSolicitudes(sol.data || []);
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
    setCargando(false);
  }, [supabase, sucursal, esAdmin, esCtMovil, ctRhId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

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
                              await cargar();
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
                      {['solicitada', 'aceptada'].includes(s.estado) && (esAdmin || esCajero) && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: '0.78rem', padding: '0.15rem 0.4rem' }}
                          onClick={async () => {
                            if (!confirm('¿Cancelar solicitud?')) return;
                            const res = await cancelarSolicitudCt(supabase, s.id);
                            if (!res.ok) return alert(res.error);
                            await cargar();
                          }}
                        >
                          Cancelar
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
          El CT acepta desde su celular (PIN móvil). Aceptar genera el PIN temporal para la caja.
          En Plan horario: cambiar CT cancela la solicitud anterior; «Quitar CT» si el empleado trabaja su descanso.
        </p>
      </div>
    </div>
  );
}
