import React from 'react';
import Icon from './Icon.jsx';
import { iconoDeModulo, colorDeModulo } from '../lib/moduloIcons.js';
import { sonidoMenuNavegacion } from '../lib/sonidosPos.js';

const COLOR_CONTABILIDAD = '#7c3aed';

export default function AppSidebarNav({
  modulosNav,
  vista,
  subContabilidad,
  contabilidadActiva,
  contabilidadOpen,
  setContabilidadOpen,
  onNavigate,
  onItemClick,
}) {
  const ir = (m) => {
    onNavigate(m);
    onItemClick?.();
  };

  return (
    <nav className="app-sidebar-nav">
      {modulosNav.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => ir(m)}
          onMouseEnter={() => vista !== m && sonidoMenuNavegacion()}
          className={`btn btn-ghost nav-btn${vista === m ? ' nav-btn-active' : ''}`}
          style={{ color: vista === m ? colorDeModulo(m) : 'var(--muted)' }}
        >
          <Icon name={iconoDeModulo(m)} size={20} style={{ color: colorDeModulo(m) }} />
          <span>{m}</span>
        </button>
      ))}
      {subContabilidad.length > 0 && (
        <div className="app-sidebar-contab">
          <button
            type="button"
            className={`btn btn-ghost nav-btn${contabilidadActiva ? ' nav-btn-active' : ''}`}
            style={{ color: contabilidadActiva ? COLOR_CONTABILIDAD : 'var(--muted)' }}
            onClick={() => setContabilidadOpen((o) => !o)}
          >
            <Icon name="dollar" size={20} style={{ color: COLOR_CONTABILIDAD }} />
            <span style={{ flex: 1, textAlign: 'left' }}>Contabilidad</span>
            <Icon name={contabilidadOpen ? 'chevronDown' : 'chevronRight'} size={16} />
          </button>
          {contabilidadOpen &&
            subContabilidad.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => ir(m)}
                onMouseEnter={() => vista !== m && sonidoMenuNavegacion()}
                className={`btn btn-ghost nav-btn nav-btn--sub${vista === m ? ' nav-btn-active' : ''}`}
                style={{ color: vista === m ? colorDeModulo(m) : 'var(--muted)' }}
              >
                <Icon name={iconoDeModulo(m)} size={18} style={{ color: colorDeModulo(m) }} />
                <span>{m}</span>
              </button>
            ))}
        </div>
      )}
    </nav>
  );
}
