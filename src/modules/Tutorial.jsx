import React, { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { TUTORIALES } from '../content/tutoriales.js';

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

function Seccion({ seccion }) {
  return (
    <article
      id={`tut-${seccion.id}`}
      className="card"
      style={{ marginBottom: '1rem', borderTop: '3px solid var(--brand-blue)' }}
    >
      <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)', fontSize: '1.05rem' }}>
        {seccion.titulo}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {(seccion.cuerpo || []).map((linea, i) => (
          <p key={i} style={{ margin: 0, lineHeight: 1.55, fontSize: '0.92rem' }}>
            {renderTexto(linea)}
          </p>
        ))}
      </div>
      {seccion.imagen ? (
        <figure style={{ margin: '1rem 0 0' }}>
          <img
            src={seccion.imagen}
            alt={seccion.imagenAlt || seccion.titulo}
            style={{
              width: '100%',
              maxWidth: 720,
              height: 'auto',
              borderRadius: 10,
              border: '1px solid var(--border)',
              display: 'block',
              background: '#f8fafc',
            }}
            loading="lazy"
          />
          {seccion.imagenAlt ? (
            <figcaption className="muted" style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
              {seccion.imagenAlt}
            </figcaption>
          ) : null}
        </figure>
      ) : null}
      {(seccion.notas || []).length > 0 ? (
        <div
          style={{
            marginTop: '0.9rem',
            padding: '0.65rem 0.85rem',
            borderRadius: 8,
            borderLeft: '4px solid var(--brand-gold)',
            background: 'rgba(225,153,41,0.1)',
            fontSize: '0.88rem',
            lineHeight: 1.5,
          }}
        >
          {(seccion.notas || []).map((n, i) => (
            <p key={i} style={{ margin: i ? '0.35rem 0 0' : 0 }}>
              {renderTexto(n)}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function Tutorial() {
  const [tutorialId, setTutorialId] = useState(TUTORIALES[0]?.id || '');
  const tutorial = useMemo(
    () => TUTORIALES.find((t) => t.id === tutorialId) || TUTORIALES[0],
    [tutorialId],
  );

  if (!tutorial) {
    return (
      <div className="card">
        <p className="muted">No hay tutoriales disponibles.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 900 }}>
      <header>
        <h2 style={{ margin: 0, color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Icon name="file" size={22} />
          Tutorial
        </h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Guías ilustradas para capacitar en tienda. Ábrelas cuando necesites el paso a paso.
        </p>
      </header>

      {TUTORIALES.length > 1 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {TUTORIALES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === tutorial.id ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => setTutorialId(t.id)}
            >
              {t.titulo}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className="card"
        style={{
          borderLeft: '4px solid var(--brand-gold)',
          background: 'linear-gradient(135deg, #fff 0%, rgba(59,105,181,0.06) 100%)',
        }}
      >
        <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue-dark)' }}>{tutorial.titulo}</h3>
        <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
          {tutorial.resumen}
        </p>
      </div>

      <nav
        className="card"
        style={{ padding: '0.75rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}
        aria-label="Secciones del tutorial"
      >
        {(tutorial.secciones || []).map((s) => (
          <a
            key={s.id}
            href={`#tut-${s.id}`}
            className="btn btn-ghost"
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem', textDecoration: 'none' }}
          >
            {s.titulo.replace(/^\d+\.\s*/, '')}
          </a>
        ))}
      </nav>

      {(tutorial.secciones || []).map((s) => (
        <Seccion key={s.id} seccion={s} />
      ))}
    </div>
  );
}
