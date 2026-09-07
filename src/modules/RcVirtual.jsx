import React from 'react';
import { puedeVerModulo } from '../lib/roles.js';
import PanelRVirtual from '../components/PanelRVirtual.jsx';

/** RC Virtual / RC Garage — custodia de recolecciones → cuenta admin → ABB. */
export default function RcVirtual({ supabase, user, area = 'virtual' }) {
  const areaNorm = area === 'garage' ? 'garage' : 'virtual';
  const modulo = areaNorm === 'garage' ? 'RC Garage' : 'RC Virtual';
  const moduloAlt = areaNorm === 'garage' ? 'RC Virtual' : 'RC Garage';
  if (
    !puedeVerModulo(user?.rol, modulo, user?.id)
    && !puedeVerModulo(user?.rol, moduloAlt, user?.id)
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
      pestanaInicial={areaNorm === 'garage' ? 'garage' : 'recolecciones'}
    />
  );
}
