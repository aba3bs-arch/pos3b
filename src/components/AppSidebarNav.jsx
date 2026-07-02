import React from 'react';
import Icon from './Icon.jsx';
import { iconoDeModulo, colorDeModulo } from '../lib/moduloIcons.js';
import { sonidoMenuNavegacion } from '../lib/sonidosPos.js';
import { VISTA_HUB_CONTABILIDAD } from '../lib/roles.js';

const COLOR_CONTABILIDAD = '#7c3aed';

export default function AppSidebarNav({
  modulosNav,
  vista,
  subContabilidad,
  contabilidadActiva,
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
        <button
          type="button"
          onClick={() => ir(VISTA_HUB_CONTABILIDAD)}
          onMouseEnter={() => vista !== VISTA_HUB_CONTABILIDAD && !contabilidadActiva && sonidoMenuNavegacion()}
          className={`btn btn-ghost nav-btn${contabilidadActiva ? ' nav-btn-active' : ''}`}
          style={{ color: contabilidadActiva ? COLOR_CONTABILIDAD : 'var(--muted)' }}
        >
          <Icon name="dollar" size={20} style={{ color: COLOR_CONTABILIDAD }} />
          <span>Contabilidad</span>
        </button>
      )}
    </nav>
  );
}
