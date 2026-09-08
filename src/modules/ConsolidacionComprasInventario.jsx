import React from 'react';
import { puedeVerModulo } from '../lib/roles.js';
import PanelConsolidacionComprasInventario from '../components/PanelConsolidacionComprasInventario.jsx';

/** Compras / ingresos de inventario vs gastos PROVEEDORES — submódulo de Contabilidad. */
export default function ConsolidacionComprasInventario({ supabase, user }) {
  if (!puedeVerModulo(user?.rol, 'Compras vs inventario', user?.id)) {
    return (
      <div className="card">
        <p>
          No tienes acceso a Compras vs inventario. Pide al administrador que active el submódulo en Configuración →
          Privilegios → Contabilidad.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#0369a1' }}>Compras vs inventario</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Consolida tickets de compra, ingresos de inventario (compra o traspaso) y el gasto que generan. Desglose por
          tienda y panorama de discrepancias (sin ingreso, sin gasto, duplicados, montos).
        </p>
      </div>
      <PanelConsolidacionComprasInventario supabase={supabase} user={user} />
    </div>
  );
}
