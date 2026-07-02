import React from 'react';
import SubcomandosHub from '../components/SubcomandosHub.jsx';
import { colorDeModulo, iconoDeModulo } from '../lib/moduloIcons.js';
import { SUBMODULOS_CONTABILIDAD } from '../lib/roles.js';

const DESCRIPCIONES = {
  Nómina: 'Periodos, sueldos, asistencia y recibos',
  'Recolecciones y traspasos': 'Reportes, servicios, recolectores y gastos',
  'Liquidación recolecciones': 'Sellar efectivo en tránsito por tienda y día',
};

/** Hub de Contabilidad: solo botones; cada submódulo abre su pantalla. */
export default function Contabilidad({ submodulosVisibles, onNavigate }) {
  const items = (submodulosVisibles || []).map((id) => ({
    id,
    label: id,
    desc: DESCRIPCIONES[id] || '',
    icon: iconoDeModulo(id),
    color: colorDeModulo(id),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#7c3aed' }}>Contabilidad</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Elige un subcomando. Solo se muestra el panel que selecciones.
        </p>
      </div>
      <SubcomandosHub
        items={items}
        onSelect={(id) => onNavigate(id)}
        color="#7c3aed"
      />
      <p className="muted" style={{ fontSize: '0.78rem' }}>
        Submódulos disponibles: {SUBMODULOS_CONTABILIDAD.join(' · ')}
      </p>
    </div>
  );
}
