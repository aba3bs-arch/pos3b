import React from 'react';
import { puedeLiquidarRecolecciones } from '../lib/controlEfectivo.js';
import PanelLiquidacionRecolecciones from '../components/PanelLiquidacionRecolecciones.jsx';

/** Liquidación en oficina — menú propio (Administrador / Gerente). */
export default function LiquidacionRecolecciones({ supabase, user }) {
  if (!puedeLiquidarRecolecciones(user?.rol)) {
    return (
      <div className="card">
        <p>Solo <strong>Administrador</strong> o <strong>Gerente</strong> pueden liquidar recolecciones.</p>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: 'var(--brand-blue)' }}>Liquidación recolecciones</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Oficina central: sellar efectivo en tránsito. Las tiendas usan el módulo <strong>Recolecciones</strong>.
        </p>
      </div>
      <PanelLiquidacionRecolecciones supabase={supabase} user={user} embedded />
    </div>
  );
}
