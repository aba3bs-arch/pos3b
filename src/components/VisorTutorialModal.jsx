import React, { useEffect, useMemo, useState } from 'react';

function renderTexto(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Modal reutilizable para abrir un tutorial con imágenes
 * desde el portal CT o el panel de cajeros (sin salir del Checador).
 */
export default function VisorTutorialModal({ tutorial, abierto, onCerrar, tituloAccion = 'Cerrar' }) {
  const secciones = useMemo(() => tutorial?.secciones || [], [tutorial]);
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    if (abierto) setPaso(0);
  }, [abierto, tutorial?.id]);

  useEffect(() => {
    if (!abierto) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onCerrar?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierto, onCerrar]);

  if (!abierto || !tutorial) return null;

  const total = secciones.length;
  const idx = Math.min(Math.max(0, paso), Math.max(0, total - 1));
  const seccion = secciones[idx];
  const progreso = total ? Math.round(((idx + 1) / total) * 100) : 0;

  return (
    <div
      className="anuncio-pos-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="visor-tut-titulo"
      style={{ zIndex: 13000 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar?.();
      }}
    >
      <div
        className="card"
        style={{
          width: 'min(720px, 96vw)',
          maxHeight: '92vh',
          overflow: 'auto',
          padding: '1rem 1.1rem 1.15rem',
          boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, letterSpacing: 0.3 }}>
              Tutorial
            </p>
            <h2 id="visor-tut-titulo" style={{ margin: '0.2rem 0 0', color: 'var(--brand-blue)', fontSize: '1.2rem' }}>
              {tutorial.titulo}
            </h2>
            {tutorial.resumen ? (
              <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.86rem' }}>
                {tutorial.resumen}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn btn-ghost" onClick={onCerrar} style={{ flexShrink: 0 }}>
            {tituloAccion}
          </button>
        </div>

        <div className="tut-progreso" style={{ marginTop: '0.85rem' }} aria-hidden>
          <div className="tut-progreso__bar" style={{ width: `${progreso}%` }} />
        </div>
        <p className="muted" style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.8rem' }}>
          Paso {idx + 1} de {total}
        </p>

        {seccion ? (
          <article className="tut-seccion" style={{ borderTop: '3px solid #b5a642', margin: 0 }}>
            <h3 className="tut-seccion__titulo">{seccion.titulo}</h3>
            <div className="tut-seccion__cuerpo">
              {(seccion.cuerpo || []).map((linea, i) => (
                <p key={i}>{renderTexto(linea)}</p>
              ))}
            </div>
            {seccion.imagen ? (
              <figure className="tut-seccion__fig">
                <img src={seccion.imagen} alt={seccion.imagenAlt || seccion.titulo} loading="lazy" />
                {seccion.imagenAlt ? (
                  <figcaption className="muted">{seccion.imagenAlt}</figcaption>
                ) : null}
              </figure>
            ) : null}
            {(seccion.notas || []).length > 0 ? (
              <div className="tut-nota">
                {(seccion.notas || []).map((n, i) => (
                  <p key={i}>{renderTexto(n)}</p>
                ))}
              </div>
            ) : null}
          </article>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem', justifyContent: 'space-between' }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={idx <= 0}
            onClick={() => setPaso((p) => Math.max(0, p - 1))}
          >
            Anterior
          </button>
          <div style={{ display: 'flex', gap: '0.45rem' }}>
            {idx < total - 1 ? (
              <button type="button" className="btn btn-primary" onClick={() => setPaso((p) => p + 1)}>
                Siguiente
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={onCerrar}>
                Listo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
