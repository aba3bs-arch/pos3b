import React from 'react';
import { puedeVerModulo } from '../lib/roles.js';
import PanelLiquidacionRecolecciones from '../components/PanelLiquidacionRecolecciones.jsx';

/** Liquidación en oficina — submódulo de Contabilidad. */
export default function LiquidacionRecolecciones({ supabase, user }) {
  if (!puedeVerModulo(user?.rol, 'Liquidación recolecciones', user?.id)) {
    return (
      <div className="card">
        <p>No tienes acceso a liquidación de recolecciones. Pide al administrador que active el submódulo en Configuración → Privilegios → Contabilidad.</p>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: 'var(--brand-blue)' }}>Liquidación recolecciones</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Sellar efectivo en tránsito por tienda y día, o consultar liquidaciones pasadas con calendario. Las tiendas registran traspasos en <strong>Recolecciones</strong>.
        </p>
      </div>
      <PanelLiquidacionRecolecciones supabase={supabase} user={user} embedded />
    </div>
  );
}
