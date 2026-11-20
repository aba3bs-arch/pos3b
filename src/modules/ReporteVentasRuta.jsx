import React, { useCallback, useEffect, useState } from 'react';
import { fmtMonto } from '../lib/consultasUi.js';
import { cargarReporteVentasRuta } from '../lib/reporteVentasRuta.js';

const TZ = 'America/Hermosillo';

function fmtFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short', timeZone: TZ });
}

function IconoBillete() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconoTarjeta() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconoMonedas() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="9" cy="8" rx="5" ry="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M4 8v4c0 1.7 2.2 3 5 3s5-1.3 5-3V8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M14 10c1.8.3 4 1.2 4 2.6V16c0 1.5-2.2 2.8-5 3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconoServicios() {
  return (
    <svg width="22" height="16" viewBox="0 0 32 16" aria-hidden="true">
      <path d="M4 2l2 6h-3l3 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 4c2 2 2 6 0 8M17 2c3 3 3 9 0 12" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M24 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconoGente() {
  return (
    <svg width="20" height="16" viewBox="0 0 24 16" aria-hidden="true">
      <circle cx="8" cy="5" r="2.2" fill="currentColor" />
      <circle cx="15" cy="5" r="2.2" fill="currentColor" />
      <path d="M3 14c.6-2.4 2.6-3.6 5-3.6s4.4 1.2 5 3.6M13 14c.4-1.8 1.8-3 3.6-3 1.6 0 3 1 3.4 3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function Casilla({ fondo, color, titulo, subtitulo, icono, children, activa, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        background: fondo,
        color,
        border: activa ? '2px solid #0f172a' : '2px solid transparent',
        borderRadius: 12,
        padding: '0.55rem 0.55rem 0.65rem',
        cursor: 'pointer',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.28rem', fontWeight: 800, fontSize: '0.82rem', lineHeight: 1.15 }}>
        {icono}
        <span>{titulo}</span>
      </span>
      {subtitulo ? (
        <span style={{ fontSize: '0.68rem', fontWeight: 600, opacity: 0.92, marginTop: '-0.2rem' }}>{subtitulo}</span>
      ) : null}
      {children}
    </button>
  );
}

function ListaFilas({ filas }) {
  if (!filas.length) return <p className="muted" style={{ margin: '0.45rem 0 0', fontSize: '0.8rem' }}>Sin movimientos en esta casilla.</p>;
  return (
    <div className="table-wrap" style={{ marginTop: '0.55rem' }}>
      <table className="consultas-table">
        <thead>
          <tr>
            <th>Folio</th>
            <th>Fecha</th>
            <th>Quién</th>
            <th>Tipo</th>
            <th>Monto</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td><strong>{f.folio}</strong></td>
              <td>{fmtFecha(f.fecha)}</td>
              <td>{f.quien}</td>
              <td>{f.detalle}</td>
              <td>{fmtMonto(f.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tarjeta({ tarjeta, abierta, onAbrir }) {
  const v = tarjeta.ventas;
  return (
    <article style={{
      background: 'linear-gradient(180deg, #fffdf8 0%, #fff7ea 100%)',
      border: '1px solid rgba(15, 23, 42, 0.08)',
      borderRadius: 16,
      padding: '0.9rem 0.85rem 1rem',
    }}
    >
      <h3 style={{ margin: 0, color: '#3b66b5', fontSize: '1.35rem' }}>{tarjeta.nombre}</h3>
      <div style={{
        display: 'inline-block',
        marginTop: '0.45rem',
        background: '#dbeafe',
        color: '#1d4ed8',
        borderRadius: 999,
        padding: '0.18rem 0.65rem',
        fontSize: '0.78rem',
        fontWeight: 700,
      }}
      >
        Saldo en Ruta (Ventas + Créditos del camión):
      </div>
      <div style={{ marginTop: '0.25rem', color: '#f97316', fontSize: '2rem', fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {fmtMonto(tarjeta.saldo)}
      </div>
      <div style={{ marginTop: '0.15rem', fontWeight: 800, fontSize: '0.92rem' }}>
        {tarjeta.mov} mov. en tránsito ({tarjeta.rc} rc)
      </div>
      <p style={{ margin: '0.2rem 0 0.7rem', fontSize: '0.78rem', color: '#64748b' }}>
        Ventas del camión: {v.count} rc
        {' | '}
        Créditos recuperados: {tarjeta.recuperados.count} rc
        {' | '}
        Servicios: {tarjeta.servicios.count} rc
        {' | '}
        Clientes externos: {tarjeta.externos.count} rc
      </p>
      <div className="reporte-ventas-casillas">
        <Casilla
          fondo="#16a34a"
          color="#fff"
          titulo="RC/Ventas"
          subtitulo="(Camión en curso)"
          icono={<IconoBillete />}
          activa={abierta === 'ventas'}
          onClick={() => onAbrir('ventas')}
        >
          <span style={{ background: 'rgba(255,255,255,0.92)', color: '#14532d', borderRadius: 8, padding: '0.2rem 0.4rem', fontWeight: 800, fontSize: '0.78rem' }}>
            Total: {fmtMonto(v.total)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#86efac', color: '#14532d', borderRadius: 8, padding: '0.28rem 0.4rem', fontSize: '0.75rem', fontWeight: 700 }}>
            <IconoBillete /> Efectivo: {fmtMonto(v.efectivo)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#bfdbfe', color: '#1e3a8a', borderRadius: 8, padding: '0.28rem 0.4rem', fontSize: '0.75rem', fontWeight: 700 }}>
            <IconoTarjeta /> Crédito (nuevo): {fmtMonto(v.credito)}
          </span>
        </Casilla>
        <Casilla
          fondo="#2563eb"
          color="#fff"
          titulo="RC/Créditos Recuperados"
          subtitulo="(Créditos anteriores)"
          icono={<IconoMonedas />}
          activa={abierta === 'recuperados'}
          onClick={() => onAbrir('recuperados')}
        >
          <span style={{ alignSelf: 'flex-start', background: '#fff', color: '#1d4ed8', borderRadius: 999, padding: '0.12rem 0.55rem', fontWeight: 800, fontSize: '0.78rem' }}>
            {tarjeta.recuperados.count} rc
          </span>
          <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>{fmtMonto(tarjeta.recuperados.total)}</span>
        </Casilla>
        <Casilla
          fondo="#9a3412"
          color="#fff"
          titulo="RC/Servicios"
          icono={<IconoServicios />}
          activa={abierta === 'servicios'}
          onClick={() => onAbrir('servicios')}
        >
          <span style={{ alignSelf: 'center', fontWeight: 800 }}>{tarjeta.servicios.count} rc</span>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, textAlign: 'center' }}>{fmtMonto(tarjeta.servicios.total)}</span>
        </Casilla>
        <Casilla
          fondo="#facc15"
          color="#1f2937"
          titulo="RC/Clientes Externos"
          icono={<IconoGente />}
          activa={abierta === 'externos'}
          onClick={() => onAbrir('externos')}
        >
          <span style={{ alignSelf: 'center', fontWeight: 800 }}>{tarjeta.externos.count} rc</span>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, textAlign: 'center' }}>{fmtMonto(tarjeta.externos.total)}</span>
        </Casilla>
      </div>
      {abierta ? <ListaFilas filas={tarjeta[abierta]?.filas || []} /> : null}
    </article>
  );
}

export default function ReporteVentasRuta({ supabase }) {
  const [tarjetas, setTarjetas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState(null);

  const cargar = useCallback(async (inicial) => {
    if (inicial) setCargando(true);
    const r = await cargarReporteVentasRuta(supabase);
    if (!r.ok) {
      setError(r.error || 'No se pudo leer el reporte.');
      setTarjetas([]);
    } else {
      setError(r.aviso || '');
      setTarjetas(r.tarjetas || []);
    }
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    void cargar(true);
    const t = setInterval(() => { void cargar(false); }, 15000);
    return () => clearInterval(t);
  }, [cargar]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 980 }}>
      <div>
        <h3 style={{ margin: 0, color: '#0f172a' }}>Saldos del recolector (RC)</h3>
        <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
          Control de efectivo, créditos y cobranza. Se actualiza cada 15 segundos.
        </p>
      </div>
      {error ? <p style={{ margin: 0, color: 'var(--brand-red)', fontSize: '0.85rem' }}>{error}</p> : null}
      {cargando && !tarjetas.length ? <p className="muted">Cargando reporte…</p> : null}
      {!cargando && !tarjetas.length && !error ? <p className="muted">No hay recolectores activos.</p> : null}
      {tarjetas.map((tarjeta) => (
        <Tarjeta
          key={tarjeta.id}
          tarjeta={tarjeta}
          abierta={abierta?.id === tarjeta.id ? abierta.casilla : null}
          onAbrir={(casilla) => setAbierta((prev) => (
            prev?.id === tarjeta.id && prev.casilla === casilla ? null : { id: tarjeta.id, casilla }
          ))}
        />
      ))}
    </div>
  );
}
