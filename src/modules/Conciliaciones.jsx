import React from 'react';
import { puedeVerModulo } from '../lib/roles.js';
import PanelConciliaciones from '../components/PanelConciliaciones.jsx';

/** Conciliaciones Abarrotes — submódulo de Contabilidad. */
export default function Conciliaciones({ supabase, user }) {
  if (!puedeVerModulo(user?.rol, 'Conciliaciones', user?.id)) {
    return (
      <div className="card">
        <p>
          No tienes acceso a Conciliaciones. Pide al administrador que active el submódulo en
          Configuración → Privilegios → Contabilidad.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#b5a642' }}>Conciliaciones</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Compara lo que colecta el repartidor (recolecciones + cobros de crédito) contra los gastos
          de Corte Abarrotes por compras de proveedor en efectivo (cigarro, sopletes, tecnología,
          encendedores, ropa, etc.) y sella la diferencia.
        </p>
      </div>
      <PanelConciliaciones supabase={supabase} user={user} />
    </div>
  );
}
