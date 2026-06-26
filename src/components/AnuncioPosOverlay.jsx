import React, { useEffect, useState } from 'react';
import {
  EVENTO_ANUNCIOS,
  marcarAnuncioVisto,
  obtenerAnuncioParaMostrar,
  tamanoVentanaAnuncio,
} from '../lib/anunciosPos.js';

export default function AnuncioPosOverlay({ supabase, onIrVentas }) {
  const [anuncio, setAnuncio] = useState(null);

  const refrescar = async () => {
    const a = await obtenerAnuncioParaMostrar(supabase);
    setAnuncio(a);
  };

  useEffect(() => {
    refrescar();
    const t = setInterval(refrescar, 60000);
    const onEvt = () => refrescar();
    window.addEventListener(EVENTO_ANUNCIOS, onEvt);
    return () => {
      clearInterval(t);
      window.removeEventListener(EVENTO_ANUNCIOS, onEvt);
    };
  }, [supabase]);

  if (!anuncio) return null;

  const tam = tamanoVentanaAnuncio(anuncio.descripcion);

  const cerrar = () => {
    marcarAnuncioVisto(anuncio.id);
    setAnuncio(null);
  };

  return (
    <div
      className="anuncio-pos-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anuncio-pos-titulo"
    >
      <div className="anuncio-pos-modal card" style={{ maxWidth: tam.maxWidth, minHeight: tam.minHeight }}>
        <h2 id="anuncio-pos-titulo" className="anuncio-pos-titulo-parpadeo">
          {anuncio.asunto}
        </h2>
        <div
          className="anuncio-pos-cuerpo"
          style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, marginTop: '0.75rem' }}
        >
          {anuncio.descripcion}
        </div>
        {anuncio.expira_at && (
          <p className="muted" style={{ fontSize: '0.78rem', margin: '0.75rem 0 0' }}>
            Vigente hasta {new Date(anuncio.expira_at).toLocaleString('es-MX')}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button type="button" className="btn btn-primary" onClick={cerrar}>
            Entendido
          </button>
          {typeof onIrVentas === 'function' && (
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => {
                cerrar();
                onIrVentas();
              }}
            >
              Ir a Ventas
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
