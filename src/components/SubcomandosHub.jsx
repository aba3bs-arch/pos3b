import React from 'react';
import Icon from './Icon.jsx';

/** Lista de botones; al elegir uno se muestra su contenido en el módulo padre. */
export default function SubcomandosHub({ titulo, subtitulo, items, onSelect, color = 'var(--brand-blue)' }) {
  if (!items?.length) {
    return (
      <div className="card">
        <p className="muted">No tienes subcomandos asignados en este módulo. Pide al administrador que marque privilegios en Configuración.</p>
      </div>
    );
  }

  return (
    <div>
      {titulo && <h3 style={{ margin: '0 0 0.35rem', color }}>{titulo}</h3>}
      {subtitulo && (
        <p className="muted" style={{ margin: '0 0 1rem', fontSize: '0.85rem' }}>
          {subtitulo}
        </p>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))',
          gap: '0.75rem',
        }}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="card"
            onClick={() => onSelect(item.id)}
            style={{
              textAlign: 'left',
              padding: '1rem',
              cursor: 'pointer',
              border: '1px solid var(--border)',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              {item.icon && <Icon name={item.icon} size={22} style={{ color: item.color || color }} />}
              <strong style={{ color: item.color || color, fontSize: '0.95rem' }}>{item.label}</strong>
            </div>
            {item.desc && <p className="muted" style={{ margin: 0, fontSize: '0.8rem', lineHeight: 1.35 }}>{item.desc}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}
