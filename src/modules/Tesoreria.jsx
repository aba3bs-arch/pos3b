import React from 'react';
import { puedeVerModulo } from '../lib/roles.js';
import PanelTesoreriaRuta from '../components/PanelTesoreriaRuta.jsx';

export default function Tesoreria({ supabase, user }) {
  if (!puedeVerModulo(user?.rol, 'Tesorería', user?.id)) {
    return <div className="card"><p>No tienes acceso a Tesorería en Contabilidad.</p></div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h2 style={{ margin: 0, color: '#b45309' }}>Tesorería</h2>
      <PanelTesoreriaRuta supabase={supabase} user={user} />
    </div>
  );
}
