import React, { useEffect, useState } from 'react';
import { esAdministradorPrincipal } from '../lib/adminPrincipal.js';
import {
  AVISO_SQL_ANUNCIOS,
  DURACION_ANUNCIO_OPTS,
  crearAnuncio,
  desactivarAnuncio,
  hayAnuncioActivo,
  listarAnuncios,
  EVENTO_ANUNCIOS,
} from '../lib/anunciosPos.js';

function PuntoVerdeActivo() {
  return <span className="punto-verde-parpadeo" title="Anuncio activo" aria-hidden />;
}

export default function PanelAnunciosAdmin({ supabase, user, onCerrar }) {
  const esAdmin = esAdministradorPrincipal(user);
  const [activo, setActivo] = useState(false);
  const [lista, setLista] = useState([]);
  const [asunto, setAsunto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [duracion, setDuracion] = useState(24);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    const [hay, { data, error }] = await Promise.all([hayAnuncioActivo(supabase), listarAnuncios(supabase)]);
    setActivo(hay);
    setLista(data || []);
    if (error) setErr(error);
  };

  useEffect(() => {
    if (!esAdmin) return;
    cargar();
    const onEvt = () => cargar();
    window.addEventListener(EVENTO_ANUNCIOS, onEvt);
    return () => window.removeEventListener(EVENTO_ANUNCIOS, onEvt);
  }, [esAdmin, supabase]);

  if (!esAdmin) return null;

  const publicar = async () => {
    setGuardando(true);
    setErr('');
    setMsg('');
    const r = await crearAnuncio(supabase, {
      asunto,
      descripcion,
      duracionHoras: duracion,
      creadoPor: user?.nombre,
    });
    setGuardando(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setAsunto('');
    setDescripcion('');
    setMsg(r.avisoLocal ? `Anuncio publicado (solo este equipo). ${AVISO_SQL_ANUNCIOS}` : 'Anuncio publicado para todas las pantallas.');
    cargar();
  };

  const quitar = async (id) => {
    if (!window.confirm('¿Desactivar este anuncio?')) return;
    const r = await desactivarAnuncio(supabase, id);
    if (!r.ok) setErr(r.error);
    else cargar();
  };

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
          Anuncios en pantalla POS
          {activo && <PuntoVerdeActivo />}
        </h3>
        <button type="button" className="btn btn-ghost" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
      <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
        Se muestra en <strong>todas las sucursales</strong> cada vez que un usuario entra al POS (hasta pulsar Entendido en esa sesión).
      </p>

      <div style={{ display: 'grid', gap: '0.5rem', marginTop: '1rem', maxWidth: 520 }}>
        <label className="muted" style={{ fontSize: '0.8rem' }}>
          Asunto (encabezado)
          <input className="input" style={{ display: 'block', marginTop: '0.2rem' }} value={asunto} onChange={(e) => setAsunto(e.target.value)} maxLength={120} />
        </label>
        <label className="muted" style={{ fontSize: '0.8rem' }}>
          Descripción
          <textarea className="input" rows={4} style={{ display: 'block', marginTop: '0.2rem', width: '100%', resize: 'vertical' }} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Duración
            <select className="select" style={{ display: 'block', marginTop: '0.2rem' }} value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
              {DURACION_ANUNCIO_OPTS.map((d) => (
                <option key={d.horas} value={d.horas}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className="btn btn-gold" disabled={guardando} onClick={publicar}>
          {guardando ? 'Publicando…' : 'Publicar anuncio'}
        </button>
      </div>

      {msg && <p style={{ color: 'var(--brand-green)', marginTop: '0.75rem' }}>{msg}</p>}
      {err && <p style={{ color: 'var(--brand-red)', marginTop: '0.75rem' }}>{err}</p>}

      {lista.length > 0 && (
        <div style={{ marginTop: '1.25rem' }}>
          <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>Recientes</h4>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {lista.slice(0, 8).map((a) => (
              <li key={a.id} style={{ marginBottom: '0.35rem' }}>
                <strong>{a.asunto}</strong>
                {a.activo ? ' · activo' : ' · inactivo'}
                {a.activo && (
                  <button type="button" className="btn btn-ghost" style={{ marginLeft: '0.35rem', padding: '0.15rem 0.4rem', fontSize: '0.75rem' }} onClick={() => quitar(a.id)}>
                    Desactivar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
