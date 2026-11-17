import React, { useState } from 'react';
import { puedeVerModulo } from '../lib/roles.js';
import { iconoDeModulo, colorDeModulo } from '../lib/moduloIcons.js';
import SubcomandosHub from '../components/SubcomandosHub.jsx';
import PanelTesoreriaRuta from '../components/PanelTesoreriaRuta.jsx';
import PanelFondoPrestamos from '../components/PanelFondoPrestamos.jsx';

const VISTAS = [
  {
    id: 'servicios',
    label: 'Servicios',
    desc: 'Fondo de servicios, saldo y egresos de Cheche',
    ayuda: 'El panel de servicios que ya estaba: transferir a Tesorería y consultar movimientos.',
    icon: iconoDeModulo('Tesorería'),
    color: colorDeModulo('Tesorería'),
  },
  {
    id: 'fondo',
    label: 'Fondo de préstamos',
    desc: 'Control de préstamos y reingreso de nómina',
    ayuda: 'JLBB lleva el fondo. Lo descontado en nómina reingresa aquí. No pasa por corte ni por contabilidad.',
    icon: 'dollar',
    color: '#b45309',
  },
];

export default function Tesoreria({ supabase, user }) {
  const [vista, setVista] = useState(null);

  if (!puedeVerModulo(user?.rol, 'Tesorería', user?.id)) {
    return <div className="card"><p>No tienes acceso a Tesorería en Contabilidad.</p></div>;
  }

  if (vista === 'servicios') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setVista(null)}>
          ← Tesorería
        </button>
        <h2 style={{ margin: 0, color: '#b45309' }}>Servicios</h2>
        <PanelTesoreriaRuta supabase={supabase} user={user} />
      </div>
    );
  }

  if (vista === 'fondo') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setVista(null)}>
          ← Tesorería
        </button>
        <h2 style={{ margin: 0, color: '#b45309' }}>Fondo de préstamos</h2>
        <PanelFondoPrestamos supabase={supabase} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#b45309' }}>Tesorería</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Elige Servicios o Fondo de préstamos.
        </p>
      </div>
      <SubcomandosHub items={VISTAS} onSelect={setVista} color="#b45309" />
    </div>
  );
}
