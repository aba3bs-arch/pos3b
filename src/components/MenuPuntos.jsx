import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

/**
 * Menú desplegable ⋮ con subcomandos.
 * items: { id, label, icon?, onClick, disabled? }[]
 */
export default function MenuPuntos({ items, ariaLabel = 'Más opciones' }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);

  return (
    <div ref={ref} className="menu-puntos-wrap">
      <button
        type="button"
        className="btn btn-ghost menu-puntos-btn"
        aria-label={ariaLabel}
        aria-expanded={abierto}
        onClick={() => setAbierto((o) => !o)}
      >
        <Icon name="moreVertical" size={22} />
      </button>
      {abierto && (
        <>
          <button
            type="button"
            className="menu-puntos-backdrop"
            aria-label="Cerrar menú"
            onClick={() => setAbierto(false)}
          />
          <div className="menu-puntos-dropdown" role="menu">
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                role="menuitem"
                className="menu-puntos-item"
                disabled={it.disabled}
                onClick={() => {
                  setAbierto(false);
                  it.onClick?.();
                }}
              >
                {it.icon && <Icon name={it.icon} size={18} />}
                <span>{it.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
