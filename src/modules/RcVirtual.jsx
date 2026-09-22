import React from 'react';
import { puedeVerModulo } from '../lib/roles.js';
import PanelRVirtual from '../components/PanelRVirtual.jsx';

/** RC Virtual / RC Garage / RC Abarrotes — custodia de recolecciones → cuenta admin → ABB|FJBB. */
export default function RcVirtual({ supabase, user, area = 'virtual' }) {
  const areaNorm = area === 'garage' ? 'garage' : area === 'abarrotes' ? 'abarrotes' : 'virtual';
  const modulo = areaNorm === 'garage'
    ? 'RC Garage'
    : areaNorm === 'abarrotes'
      ? 'RC Abarrotes'
      : 'RC Virtual';
  const alts = ['RC Virtual', 'RC Garage', 'RC Abarrotes'].filter((m) => m !== modulo);
  if (
    !puedeVerModulo(user?.rol, modulo, user?.id)
    && !alts.some((m) => puedeVerModulo(user?.rol, m, user?.id))
  ) {
    return (
      <div className="card">
        <p>
          No tienes acceso a {modulo}. Pide al administrador que active el submódulo en Configuración →
          Privilegios → Contabilidad.
        </p>
      </div>
    );
  }
  return (
    <PanelRVirtual
      supabase={supabase}
      user={user}
      area={areaNorm}
      pestanaInicial={
        areaNorm === 'garage'
          ? 'garage'
          : areaNorm === 'abarrotes'
            ? 'abarrotes'
            : 'recolecciones'
      }
    />
  );
}
