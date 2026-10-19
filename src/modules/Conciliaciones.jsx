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
        <h2 style={{ margin: 0, color: '#b5a642' }}>Conciliaciones · Smoking / Venta en Ruta</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Cuadra todo lo cobrado o cargado a cada tienda (efectivo RC/VentaRuta, créditos
          cobrados y créditos por pagar) vs gastos Smoking o recepción Venta en Ruta en Corte
          Abarrotes. Usa estatus «Todos» para incluir efectivo ya liquidado. Señala tiendas sin
          cobro y permite ver el ticket del corte.
        </p>
      </div>
      <PanelConciliaciones supabase={supabase} user={user} />
    </div>
  );
}
