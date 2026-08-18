import React from 'react';
import SubcomandosHub from '../components/SubcomandosHub.jsx';
import { colorDeModulo, iconoDeModulo } from '../lib/moduloIcons.js';
import { SUBMODULOS_ESTADISTICAS } from '../lib/roles.js';
import { AREAS_ESTADISTICA, FECHA_INICIO_ESTADISTICAS } from '../lib/estadisticasData.js';

const DESCRIPCIONES = {
  'Estadísticas Abarrotes': {
    desc: AREAS_ESTADISTICA.abarrotes.desc,
    ayuda: 'Ventas POS, gastos, inventario y mermas de abarrotes en 3B2 / 3B5.',
  },
  'Estadísticas Virtual': {
    desc: AREAS_ESTADISTICA.virtual.desc,
    ayuda: 'Ventas y gastos del corte Virtual, comparación por periodo y turno.',
  },
  'Estadísticas Garage': {
    desc: AREAS_ESTADISTICA.garage.desc,
    ayuda: 'Ventas y gastos del corte Garage, comparación por periodo y turno.',
  },
};

/** Hub de Estadísticas: elige área Abarrotes / Virtual / Garage. */
export default function Estadisticas({ submodulosVisibles, onNavigate }) {
  const items = (submodulosVisibles || []).map((id) => {
    const meta = DESCRIPCIONES[id] || {};
    return {
      id,
      label: id.replace(/^Estadísticas\s+/, ''),
      desc: meta.desc || '',
      ayuda: meta.ayuda || meta.desc || '',
      icon: iconoDeModulo(id),
      color: colorDeModulo(id),
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#16a34a' }}>Estadísticas</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Tres tableros separados. Datos desde {FECHA_INICIO_ESTADISTICAS} · foco 3B2 y 3B5.
          Gastos de prueba ($10,000 / test) quedan fuera.
        </p>
      </div>
      <SubcomandosHub items={items} onSelect={(id) => onNavigate(id)} color="#16a34a" />
      <p className="muted" style={{ fontSize: '0.78rem' }}>
        Áreas: {SUBMODULOS_ESTADISTICAS.map((m) => m.replace(/^Estadísticas\s+/, '')).join(' · ')}
      </p>
    </div>
  );
}
