import React, { useMemo } from 'react';
import Icon from './Icon.jsx';
import { iconoDeModulo, colorDeModulo } from '../lib/moduloIcons.js';
import { SUBMODULOS_CONTABILIDAD } from '../lib/roles.js';
import { sonidoMenuNavegacion } from '../lib/sonidosPos.js';

const PRIORIDAD_TABS = ['Inicio', 'Ventas', 'Incidencias', 'Checador', 'Corte de caja', 'Productos'];

function etiquetaCorta(modulo) {
  const map = {
    'Corte de caja': 'Corte',
    'Corte Virtual': 'Virtual',
    'Corte Abarrotes': 'Abarrotes',
    'Corte Garage': 'Garage',
    'Vales y Préstamos': 'Vales',
    Configuracion: 'Config',
    Estadisticas: 'Stats',
    Incidencias: 'Incid.',
  };
  return map[modulo] || modulo;
}

export default function MobileBottomNav({ modulos, vista, onNavigate, onOpenMenu }) {
  const tabs = useMemo(() => {
    const picks = [];
    for (const p of PRIORIDAD_TABS) {
      if (modulos.includes(p) && picks.length < 4) picks.push(p);
    }
    for (const m of modulos) {
      if (!picks.includes(m) && picks.length < 4) picks.push(m);
    }
    return picks;
  }, [modulos]);

  const vistaEnTabs = tabs.includes(vista);
  const enContabilidad = SUBMODULOS_CONTABILIDAD.includes(vista);
  const masActivo = !vistaEnTabs && !enContabilidad;

  const ir = (m) => {
    sonidoMenuNavegacion();
    onNavigate(m);
  };

  return (
    <nav className="mobile-bottom-nav" aria-label="Navegación rápida">
      {tabs.map((m) => {
        const activo = vista === m;
        const color = colorDeModulo(m);
        return (
          <button
            key={m}
            type="button"
            className={`mobile-nav-item${activo ? ' mobile-nav-item--active' : ''}`}
            onClick={() => ir(m)}
            aria-current={activo ? 'page' : undefined}
            style={{ '--nav-accent': color }}
          >
            <span className="mobile-nav-icon-wrap">
              <Icon name={iconoDeModulo(m)} size={22} />
            </span>
            <span className="mobile-nav-label">{etiquetaCorta(m)}</span>
          </button>
        );
      })}
      <button
        type="button"
        className={`mobile-nav-item mobile-nav-item--mas${masActivo ? ' mobile-nav-item--active' : ''}`}
        onClick={onOpenMenu}
        aria-label="Abrir menú completo"
      >
        <span className="mobile-nav-icon-wrap">
          <Icon name="menu" size={22} />
        </span>
        <span className="mobile-nav-label">Más</span>
      </button>
    </nav>
  );
}
