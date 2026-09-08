import React from 'react';
import { puedeVerModulo } from '../lib/roles.js';
import PanelConsolidacionGastos from '../components/PanelConsolidacionGastos.jsx';

/** Consolidación de gastos por turno — submódulo de Contabilidad. */
export default function Consolidacion({ supabase, user }) {
  if (!puedeVerModulo(user?.rol, 'Consolidación', user?.id)) {
    return (
      <div className="card">
        <p>
          No tienes acceso a Consolidación. Pide al administrador que active el submódulo en Configuración → Privilegios
          → Contabilidad.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#0f766e' }}>Consolidación · Gastos por turno</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Consolida los gastos de corte por <strong>turno</strong>. Elige un área a la vez —{' '}
          <strong>Abarrotes</strong>, <strong>Virtual</strong> o <strong>Garage</strong> —; cada una es independiente.
        </p>
      </div>
      <PanelConsolidacionGastos supabase={supabase} user={user} />
    </div>
  );
}
