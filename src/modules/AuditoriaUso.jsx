import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listarSucursalesOperativas, etiquetaTienda } from '../constants/sucursales.js';
import {
  AVISO_FALTA_AUDITORIA_SQL,
  ETIQUETAS_TIPO_AUDITORIA,
  EVENTO_AUDITORIA,
  TIPOS_AUDITORIA,
  listarEventosAuditoria,
  puedeVerModuloAuditoria,
  resumenEventoAuditoria,
} from '../lib/auditoriaUso.js';
import { hoyYmdNogales, addDaysYmd } from '../lib/corteCaja.js';

function fmtFechaHora(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      timeZone: 'America/Hermosillo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return String(iso).slice(0, 19).replace('T', ' ');
  }
}

function colorSeveridad(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return { bg: 'rgba(185,28,28,0.12)', fg: '#b91c1c', border: 'rgba(185,28,28,0.35)' };
  if (s === 'warning') return { bg: 'rgba(180,83,9,0.12)', fg: '#b45309', border: 'rgba(180,83,9,0.35)' };
  return { bg: 'rgba(0,0,0,0.03)', fg: '#44403c', border: 'rgba(0,0,0,0.08)' };
}

function Chip({ children, tone = 'info' }) {
  const c = colorSeveridad(tone);
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '0.68rem',
        fontWeight: 700,
        padding: '0.12rem 0.4rem',
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function DetalleJson({ detalle }) {
  if (!detalle || typeof detalle !== 'object') return null;
  const entries = Object.entries(detalle).filter(([, v]) => v != null && v !== '');
  if (!entries.length) return null;
  return (
    <dl style={{ margin: '0.35rem 0 0', display: 'grid', gap: '0.15rem', fontSize: '0.74rem' }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <dt className="muted" style={{ minWidth: 110 }}>{k}:</dt>
          <dd style={{ margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Módulo exclusivo Administrador: rastreo de quién usa la app, desde dónde y qué cambia.
 */
export default function AuditoriaUso({ supabase, user, sucursal }) {
  const hoy = hoyYmdNogales();
  const [desde, setDesde] = useState(() => addDaysYmd(hoy, -7));
  const [hasta, setHasta] = useState(hoy);
  const [tipo, setTipo] = useState('');
  const [sucFiltro, setSucFiltro] = useState('');
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [expandido, setExpandido] = useState(null);

  const tiendas = useMemo(() => listarSucursalesOperativas(), []);
  const tiposOpts = useMemo(() => Object.keys(TIPOS_AUDITORIA), []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    const res = await listarEventosAuditoria(supabase, {
      desde,
      hasta,
      tipo: tipo || null,
      sucursal: sucFiltro || null,
      soloAlertas,
      q,
      limit: 400,
    });
    setCargando(false);
    if (!res.ok) {
      setError(res.error || 'No se pudo cargar la bitácora.');
      setRows([]);
      return;
    }
    setRows(res.data || []);
    setAviso(res.aviso || '');
  }, [supabase, desde, hasta, tipo, sucFiltro, soloAlertas, q]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    const onEvt = () => { void cargar(); };
    window.addEventListener(EVENTO_AUDITORIA, onEvt);
    return () => window.removeEventListener(EVENTO_AUDITORIA, onEvt);
  }, [cargar]);

  if (!puedeVerModuloAuditoria(user?.rol)) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Auditoría / Rastreo</h2>
        <p className="muted">Solo el administrador puede ver este módulo.</p>
      </div>
    );
  }

  const kriticos = rows.filter((r) => String(r.severidad).toLowerCase() === 'critical').length;
  const warnings = rows.filter((r) => String(r.severidad).toLowerCase() === 'warning').length;
  const noReconocidos = rows.filter((r) => r.dispositivo_reconocido === false).length;
  const moviles = rows.filter((r) => r.es_movil).length;

  return (
    <div className="stack" style={{ gap: '0.85rem' }}>
      <div className="card" style={{ borderLeft: '4px solid #0f766e' }}>
        <h2 style={{ margin: 0, color: '#0f766e' }}>Auditoría / Rastreo de uso</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', maxWidth: 720 }}>
          Quién entra, desde qué equipo (caja de tienda vs celular), qué módulos abre,
          cuándo usa PIN de administrador, y si borra o altera cortes / configuración.
          Sucursal actual de sesión: <strong>{etiquetaTienda(sucursal)}</strong>.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.55rem' }}>
        <div className="card" style={{ padding: '0.65rem' }}>
          <div className="muted" style={{ fontSize: '0.7rem' }}>Eventos</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{rows.length}</div>
        </div>
        <div className="card" style={{ padding: '0.65rem', borderTop: '3px solid #b91c1c' }}>
          <div className="muted" style={{ fontSize: '0.7rem' }}>Críticos</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#b91c1c' }}>{kriticos}</div>
        </div>
        <div className="card" style={{ padding: '0.65rem', borderTop: '3px solid #b45309' }}>
          <div className="muted" style={{ fontSize: '0.7rem' }}>Alertas</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#b45309' }}>{warnings}</div>
        </div>
        <div className="card" style={{ padding: '0.65rem' }}>
          <div className="muted" style={{ fontSize: '0.7rem' }}>Equipo no reconocido</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{noReconocidos}</div>
        </div>
        <div className="card" style={{ padding: '0.65rem' }}>
          <div className="muted" style={{ fontSize: '0.7rem' }}>Desde móvil</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{moviles}</div>
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gap: '0.55rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', alignItems: 'flex-end' }}>
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            Desde
            <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ display: 'block', marginTop: 2 }} />
          </label>
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            Hasta
            <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ display: 'block', marginTop: 2 }} />
          </label>
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            Tipo
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ display: 'block', marginTop: 2, minWidth: 160 }}>
              <option value="">Todos</option>
              {tiposOpts.map((t) => (
                <option key={t} value={t}>{ETIQUETAS_TIPO_AUDITORIA[t] || t}</option>
              ))}
            </select>
          </label>
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            Sucursal
            <select className="input" value={sucFiltro} onChange={(e) => setSucFiltro(e.target.value)} style={{ display: 'block', marginTop: 2, minWidth: 120 }}>
              <option value="">Todas</option>
              {tiendas.map((s) => (
                <option key={s} value={s}>{etiquetaTienda(s)}</option>
              ))}
            </select>
          </label>
          <label className="muted" style={{ fontSize: '0.75rem', flex: '1 1 160px' }}>
            Buscar
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="nombre, módulo, dispositivo…"
              style={{ display: 'block', marginTop: 2, width: '100%' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', paddingBottom: 6 }}>
            <input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} />
            Solo alertas
          </label>
          <button type="button" className="btn" onClick={() => void cargar()} disabled={cargando}>
            {cargando ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
        {aviso ? (
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#b45309' }}>
            {aviso || AVISO_FALTA_AUDITORIA_SQL}
          </p>
        ) : null}
        {error ? (
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#b91c1c' }}>{error}</p>
        ) : null}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {rows.length === 0 && !cargando ? (
          <p className="muted" style={{ margin: '1rem', fontSize: '0.9rem' }}>
            Sin eventos en el periodo. En cuanto haya logins, cambios de módulo, PIN admin o borrados de corte, aparecerán aquí.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((r) => {
              const sev = colorSeveridad(r.severidad);
              const open = expandido === r.id;
              return (
                <li
                  key={r.id}
                  style={{
                    borderBottom: '1px solid rgba(0,0,0,0.06)',
                    padding: '0.7rem 0.85rem',
                    background: open ? sev.bg : undefined,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandido(open ? null : r.id)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      display: 'block',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                        <Chip tone={r.severidad}>{String(r.severidad || 'info').toUpperCase()}</Chip>
                        <Chip>{ETIQUETAS_TIPO_AUDITORIA[r.tipo] || r.tipo}</Chip>
                        {r.es_movil ? <Chip tone="warning">Móvil</Chip> : null}
                        {r.dispositivo_reconocido === false ? <Chip tone="critical">No reconocido</Chip> : null}
                        {r.terminal_tienda ? <Chip>Caja tienda</Chip> : null}
                      </div>
                      <span className="muted" style={{ fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtFechaHora(r.created_at)}
                      </span>
                    </div>
                    <div style={{ marginTop: '0.35rem', fontSize: '0.9rem', fontWeight: 600 }}>
                      {r.accion || resumenEventoAuditoria(r)}
                    </div>
                    <div className="muted" style={{ marginTop: 2, fontSize: '0.78rem' }}>
                      <strong>{r.usuario_nombre || '—'}</strong>
                      {r.rol ? ` · ${r.rol}` : ''}
                      {' · '}
                      {r.sucursal_id ? etiquetaTienda(r.sucursal_id) : '—'}
                      {' · '}
                      equipo {r.dispositivo_corto || '—'}
                      {r.vista ? ` · módulo ${r.vista}` : ''}
                      {r.fuente === 'local' ? ' · (local)' : ''}
                    </div>
                  </button>
                  {open ? (
                    <div style={{ marginTop: '0.45rem', paddingTop: '0.35rem', borderTop: `1px dashed ${sev.border}` }}>
                      <p className="muted" style={{ margin: 0, fontSize: '0.72rem' }}>
                        Dispositivo: <code>{r.dispositivo_id || '—'}</code>
                        {r.user_agent ? (
                          <>
                            <br />
                            UA: {String(r.user_agent).slice(0, 160)}
                          </>
                        ) : null}
                      </p>
                      <DetalleJson detalle={r.detalle} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
