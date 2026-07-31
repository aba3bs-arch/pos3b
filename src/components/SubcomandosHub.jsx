import React from 'react';
import Icon from './Icon.jsx';

/** Lista de botones; al elegir uno se muestra su contenido en el módulo padre.
 *  `desc` visible siempre; `ayuda` (más detalle) aparece al pasar el mouse. */
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
      <div className="subcmd-hub-grid">
        {items.map((item) => {
          const ayuda = item.ayuda || item.desc || '';
          return (
            <button
              key={item.id}
              type="button"
              className="card subcmd-hub-btn"
              onClick={() => onSelect(item.id)}
              title={ayuda}
              aria-label={`${item.label}. ${ayuda}`}
            >
              <div className="subcmd-hub-btn-head">
                {item.icon && <Icon name={item.icon} size={22} style={{ color: item.color || color }} />}
                <strong style={{ color: item.color || color, fontSize: '0.95rem' }}>{item.label}</strong>
              </div>
              {item.desc && (
                <p className="muted subcmd-hub-desc">{item.desc}</p>
              )}
              {ayuda && (
                <span className="subcmd-hub-tooltip" role="tooltip">
                  {ayuda}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
