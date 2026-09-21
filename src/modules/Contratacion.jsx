import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { esAdministradorPrincipal } from '../lib/adminPrincipal.js';
import {
  AVISO_FALTA_CONTRATACION,
  ESTADOS_CONTRATACION,
  TIPOS_CONTRATACION,
  agregarSeguimientoContratacion,
  etiquetaEstadoContratacion,
  etiquetaTipoContratacion,
  listarAdminsParaRedirigir,
  listarSolicitudesContratacion,
  nombreCompletoAspirante,
  puedeGestionarContratacion,
  redirigirSolicitudContratacion,
  sucursalesInteresLabels,
  urlPortalContratacion,
  urlQrContratacion,
} from '../lib/contratacion.js';

/**
 * Bandeja de contratación: admin principal ve todo;
 * otros admins solo lo que les redirigieron.
 */
export default function Contratacion({ supabase, user }) {
  const esPrincipal = esAdministradorPrincipal(user);
  const puede = puedeGestionarContratacion(user);
  const [lista, setLista] = useState([]);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [filtroTipo, setFiltroTipo] = useState('todas');
  const [sel, setSel] = useState(null);
  const [nota, setNota] = useState('');
  const [admins, setAdmins] = useState([]);
  const [adminDestinoId, setAdminDestinoId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const enlace = useMemo(() => urlPortalContratacion(), []);
  const qrUrl = useMemo(() => urlQrContratacion(`${enlace}&qr=1`), [enlace]);

  const cargar = useCallback(async () => {
    if (!supabase || !puede) return;
    const res = await listarSolicitudesContratacion(supabase, user, {
      estado: filtroEstado,
      tipo: filtroTipo,
    });
    if (res.aviso) setAviso(res.aviso);
    if (res.error) setError(res.error);
    else setError('');
    setLista(res.data || []);
    if (sel?.id) {
      const fresh = (res.data || []).find((r) => r.id === sel.id);
      setSel(fresh || null);
    }
  }, [supabase, user, puede, filtroEstado, filtroTipo, sel?.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!esPrincipal || !supabase) return;
    listarAdminsParaRedirigir(supabase, user).then((r) => setAdmins(r.data || []));
  }, [esPrincipal, supabase, user]);

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      prompt('Copia este enlace:', enlace);
    }
  };

  const guardarSeguimiento = async (estado = null) => {
    if (!sel) return;
    setGuardando(true);
    try {
      const res = await agregarSeguimientoContratacion(supabase, sel, user, nota, estado);
      if (!res.ok) return alert(res.error);
      setNota('');
      await cargar();
      if (res.solicitud) setSel(res.solicitud);
    } finally {
      setGuardando(false);
    }
  };

  const redirigir = async () => {
    if (!sel || !adminDestinoId) return alert('Elige un administrador.');
    const dest = admins.find((a) => String(a.id) === String(adminDestinoId));
    if (!dest) return alert('Administrador no encontrado.');
    setGuardando(true);
    try {
      const res = await redirigirSolicitudContratacion(supabase, sel, user, dest, nota || `Redirigida a ${dest.nombre}`);
      if (!res.ok) return alert(res.error);
      setNota('');
      setAdminDestinoId('');
      await cargar();
      if (res.solicitud) setSel(res.solicitud);
    } finally {
      setGuardando(false);
    }
  };

  if (!puede) {
    return (
      <div>
        <p className="muted">Solo administradores pueden abrir Contratación.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div style={{ flex: '1 1 220px' }}>
          <h2 style={{ margin: '0 0 0.35rem' }}>Contratación</h2>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            {esPrincipal
              ? 'Tu bandeja personal de aspirantes. Da seguimiento o redirige a otro admin.'
              : 'Postulaciones que el admin principal te asignó.'}
          </p>
        </div>
      </div>

      {esPrincipal && (
        <div
          className="card"
          style={{
            padding: '0.85rem',
            marginBottom: '1rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            alignItems: 'center',
          }}
        >
          <div style={{ flex: '1 1 200px' }}>
            <strong style={{ display: 'block', marginBottom: '0.35rem' }}>Enlace / QR para aspirantes</strong>
            <code style={{ fontSize: '0.78rem', wordBreak: 'break-all' }}>{enlace}</code>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-gold btn-sm" onClick={copiarEnlace}>
                {copiado ? 'Copiado' : 'Copiar enlace'}
              </button>
              <a className="btn btn-ghost btn-sm" href={enlace} target="_blank" rel="noreferrer">
                Abrir portal
              </a>
            </div>
          </div>
          <img
            src={qrUrl}
            alt="QR postulación"
            width={120}
            height={120}
            style={{ borderRadius: 8, background: '#fff', border: '1px solid var(--border, #ddd)' }}
          />
        </div>
      )}

      {(aviso || error) && (
        <p style={{ color: error ? 'var(--danger, #b91c1c)' : 'inherit' }} className="muted">
          {error || aviso || AVISO_FALTA_CONTRATACION}
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <select className="input" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ width: 'auto' }}>
          <option value="todas">Todos los estados</option>
          {ESTADOS_CONTRATACION.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
        <select className="input" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ width: 'auto' }}>
          <option value="todas">Planta y CT</option>
          {TIPOS_CONTRATACION.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void cargar()}>
          <Icon name="refresh" size={14} /> Actualizar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(280px, 1.4fr)', gap: '0.75rem' }}>
        <div className="card" style={{ padding: 0, maxHeight: '70vh', overflow: 'auto' }}>
          {!lista.length && (
            <p className="muted" style={{ padding: '0.85rem' }}>Sin postulaciones en este filtro.</p>
          )}
          {lista.map((row) => {
            const activo = sel?.id === row.id;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => setSel(row)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.7rem 0.85rem',
                  border: 'none',
                  borderBottom: '1px solid var(--border, #eee)',
                  background: activo ? 'rgba(212,175,55,0.12)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <strong style={{ display: 'block' }}>{nombreCompletoAspirante(row)}</strong>
                <span className="muted" style={{ fontSize: '0.78rem' }}>
                  {etiquetaTipoContratacion(row.tipo)} · {etiquetaEstadoContratacion(row.estado)}
                  {row.edad != null ? ` · ${row.edad} años` : ''}
                </span>
              </button>
            );
          })}
        </div>

        <div className="card" style={{ padding: '0.85rem' }}>
          {!sel ? (
            <p className="muted">Selecciona una postulación.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.55rem' }}>
              <h3 style={{ margin: 0 }}>{nombreCompletoAspirante(sel)}</h3>
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                {etiquetaTipoContratacion(sel.tipo)} · {etiquetaEstadoContratacion(sel.estado)}
                {sel.asignado_a_nombre ? ` · Asignado: ${sel.asignado_a_nombre}` : ''}
              </p>

              <dl style={{ margin: 0, display: 'grid', gap: '0.35rem', fontSize: '0.88rem' }}>
                <div><strong>Tel:</strong> {sel.telefono}{sel.telefono_alt ? ` / ${sel.telefono_alt}` : ''}</div>
                {sel.email && <div><strong>Email:</strong> {sel.email}</div>}
                <div><strong>Dirección:</strong> {[sel.direccion, sel.colonia, sel.ciudad, sel.estado_mx, sel.cp].filter(Boolean).join(', ')}</div>
                <div><strong>Estudios:</strong> {sel.grado_estudios}{sel.carrera ? ` · ${sel.carrera}` : ''}</div>
                <div><strong>Experiencia:</strong> {sel.anios_experiencia || 0} años — {sel.experiencia || '—'}</div>
                {sel.puestos_anteriores && <div><strong>Puestos:</strong> {sel.puestos_anteriores}</div>}
                <div><strong>Turno:</strong> {sel.disponibilidad_turno}</div>
                <div><strong>Sucursales:</strong> {sucursalesInteresLabels(sel.sucursales_interes)}</div>
                <div>
                  <strong>Extras:</strong>{' '}
                  {[
                    sel.disponibilidad_inmediata ? 'inmediata' : null,
                    sel.tiene_transporte ? 'transporte' : null,
                    sel.licencia_conducir ? 'licencia' : null,
                    sel.expectativa_sueldo ? `sueldo ${sel.expectativa_sueldo}` : null,
                  ].filter(Boolean).join(' · ') || '—'}
                </div>
                {sel.motivacion && <div><strong>Motivación:</strong> {sel.motivacion}</div>}
                {sel.referencias && <div><strong>Referencias:</strong> {sel.referencias}</div>}
                {sel.curp && <div><strong>CURP:</strong> {sel.curp}</div>}
              </dl>

              {Array.isArray(sel.seguimiento) && sel.seguimiento.length > 0 && (
                <div>
                  <strong style={{ fontSize: '0.85rem' }}>Seguimiento</strong>
                  <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.82rem' }}>
                    {[...sel.seguimiento].reverse().map((s, i) => (
                      <li key={`${s.at}-${i}`}>
                        <span className="muted">{s.at ? new Date(s.at).toLocaleString('es-MX') : ''}</span>
                        {' · '}{s.por}{s.estado ? ` (${etiquetaEstadoContratacion(s.estado)})` : ''}
                        {s.texto ? `: ${s.texto}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <label className="muted" style={{ fontSize: '0.85rem' }}>
                Nota de seguimiento
                <textarea
                  className="input"
                  rows={2}
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  style={{ marginTop: '0.3rem', resize: 'vertical' }}
                />
              </label>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                <button type="button" className="btn btn-gold btn-sm" disabled={guardando} onClick={() => void guardarSeguimiento()}>
                  Guardar seguimiento
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={guardando} onClick={() => void guardarSeguimiento('entrevista')}>
                  Marcar entrevista
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={guardando} onClick={() => void guardarSeguimiento('aceptada')}>
                  Aceptar
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={guardando} onClick={() => void guardarSeguimiento('rechazada')}>
                  Rechazar
                </button>
              </div>

              {esPrincipal && (
                <div style={{ borderTop: '1px solid var(--border, #eee)', paddingTop: '0.65rem', marginTop: '0.25rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}>Redirigir a otro admin</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
                    <select
                      className="input"
                      value={adminDestinoId}
                      onChange={(e) => setAdminDestinoId(e.target.value)}
                      style={{ width: 'auto', minWidth: 160 }}
                    >
                      <option value="">Elegir admin…</option>
                      {admins.map((a) => (
                        <option key={a.id} value={a.id}>{a.nombre}</option>
                      ))}
                    </select>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={guardando || !adminDestinoId} onClick={() => void redirigir()}>
                      Redirigir
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
