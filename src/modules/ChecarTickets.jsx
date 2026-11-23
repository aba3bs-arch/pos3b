import React from 'react';
import { puedeVerModulo } from '../lib/roles.js';
import PanelChecarTickets from '../components/PanelChecarTickets.jsx';

/** Tablero: proveedores × días, con el gasto ingresado y el ticket para comparar. */
export default function ChecarTickets({ supabase, user }) {
  if (!puedeVerModulo(user?.rol, 'Checar tickets', user?.id)) {
    return (
      <div className="card">
        <p>
          No tienes acceso a Checar tickets. Está en el menú para auditor y administrador.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#0f766e' }}>Checar tickets</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Elige los días y la tienda. Cada proveedor va a la izquierda — puede repetirse si hubo más de un ticket —
          la siguiente columna es el gasto ingresado y cada día trae las piezas del ticket para compararlas con el físico.
        </p>
      </div>
      <PanelChecarTickets supabase={supabase} />
    </div>
  );
}
