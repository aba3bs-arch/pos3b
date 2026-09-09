import React from 'react';
import { puedeVerModulo } from '../lib/roles.js';
import PanelRevisionCompras from '../components/PanelRevisionCompras.jsx';

/** Revisión ticket por ticket: mercancía del ticket vs ingreso a inventario. */
export default function RevisionCompras({ supabase, user }) {
  if (!puedeVerModulo(user?.rol, 'Revisión de compras', user?.id)) {
    return (
      <div className="card">
        <p>
          No tienes acceso a Revisión de compras. Pide al administrador que active el submódulo en Configuración →
          Privilegios → Contabilidad.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#0e7490' }}>Revisión de compras</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Elige un rango de fechas y revisa ticket por ticket: cantidades del ticket vs lo ingresado al inventario.
          Marca cada uno como OK o con diferencias.
        </p>
      </div>
      <PanelRevisionCompras supabase={supabase} user={user} />
    </div>
  );
}
