import React from 'react';
import { puedeVerModulo } from '../lib/roles.js';
import PanelRVirtual from '../components/PanelRVirtual.jsx';

/** RC Virtual — submódulo de Contabilidad (custodia Virtual/Garage → cuenta admin → ABB). */
export default function RcVirtual({ supabase, user }) {
  if (!puedeVerModulo(user?.rol, 'RC Virtual', user?.id)) {
    return (
      <div className="card">
        <p>
          No tienes acceso a RC Virtual. Pide al administrador que active el submódulo en Configuración →
          Privilegios → Contabilidad.
        </p>
      </div>
    );
  }
  return <PanelRVirtual supabase={supabase} user={user} />;
}
