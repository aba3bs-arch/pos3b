import React, { useEffect, useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LineaTiempoContratacion from '../components/LineaTiempoContratacion.jsx';
import { leerNombreNegocio } from '../lib/branding.js';
import {
  consultarEstatusPostulacion,
  leerCodigoEstatusDesdeUrl,
} from '../lib/contratacionEstatus.js';

const LLAVE_TEL = 'pos3b_contratacion_estatus_tel';

function leerTelGuardado() {
  try {
    return localStorage.getItem(LLAVE_TEL) || '';
  } catch {
    return '';
  }
}

/** Consulta pública: el candidato ve en qué punto va su proceso de reclutamiento. */
export default function ContratacionEstatus({ supabase }) {
  const brand = leerNombreNegocio();
  const [codigo, setCodigo] = useState(() => leerCodigoEstatusDesdeUrl());
  const [telefono, setTelefono] = useState(() => leerTelGuardado());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [solicitud, setSolicitud] = useState(null);

  const consultar = async (cod = codigo, tel = telefono) => {
    setCargando(true);
    setError('');
    try {
      const res = await consultarEstatusPostulacion(supabase, cod, tel);
      if (!res.ok) {
        setSolicitud(null);
        setError(res.error || 'No se pudo consultar.');
        return;
      }
      setSolicitud(res.solicitud);
      try {
        localStorage.setItem(LLAVE_TEL, String(tel).replace(/\D/g, '').slice(-10));
      } catch {
        /* sin almacenamiento */
      }
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    const cod = leerCodigoEstatusDesdeUrl();
    const tel = leerTelGuardado();
    if (cod && tel.replace(/\D/g, '').length >= 10) void consultar(cod, tel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const volver = () => {
    window.location.href = `${window.location.origin}/?contratacion=1`;
  };

  return (
    <div className="contratacion-publica" style={{ minHeight: '100vh', padding: '1.25rem', maxWidth: 560, margin: '0 auto' }}>
      <header style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <BrandLogo alt={brand} maxHeight={72} style={{ margin: '0 auto' }} />
        <h1 style={{ margin: '0.65rem 0 0.25rem', fontSize: '1.35rem' }}>{brand}</h1>
        <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>Estatus de tu postulación</p>
      </header>

      {!solicitud && (
        <form
          className="card"
          style={{ padding: '1.1rem', display: 'grid', gap: '0.7rem' }}
          onSubmit={(e) => {
            e.preventDefault();
            void consultar();
          }}
        >
          <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
            Escribe el código que recibiste al postularte y el teléfono que registraste.
          </p>
          <label style={{ fontSize: '0.85rem' }}>
            Código de seguimiento
            <input
              className="input"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="Ej. A1B2C3D4"
              style={{ marginTop: '0.3rem', letterSpacing: 2, fontWeight: 600 }}
            />
          </label>
          <label style={{ fontSize: '0.85rem' }}>
            Teléfono (10 dígitos)
            <input
              className="input"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="631 123 4567"
              style={{ marginTop: '0.3rem' }}
            />
          </label>
          {error && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--danger, #b91c1c)' }}>{error}</p>}
          <button type="submit" className="btn btn-gold" disabled={cargando}>
            {cargando ? 'Consultando…' : 'Ver mi estatus'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={volver}>
            Quiero postularme
          </button>
        </form>
      )}

      {solicitud && (
        <section className="card" style={{ padding: '1.1rem', display: 'grid', gap: '0.85rem' }}>
          <div style={{ textAlign: 'left' }}>
            <strong style={{ fontSize: '1.05rem' }}>{solicitud.nombre}</strong>
            {solicitud.codigo_seguimiento ? (
              <div className="muted" style={{ fontSize: '0.8rem' }}>Código {solicitud.codigo_seguimiento}</div>
            ) : null}
          </div>
          <LineaTiempoContratacion solicitud={solicitud} />
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-gold btn-sm" disabled={cargando} onClick={() => void consultar()}>
              {cargando ? 'Actualizando…' : 'Actualizar'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSolicitud(null); setError(''); }}>
              Consultar otra
            </button>
          </div>
          {error && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--danger, #b91c1c)' }}>{error}</p>}
        </section>
      )}

      <p className="muted" style={{ textAlign: 'center', fontSize: '0.75rem', marginTop: '1.5rem' }}>
        Solo para aspirantes · No es el acceso de empleados
      </p>
    </div>
  );
}
