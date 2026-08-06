import React, { useState } from 'react';
import FormularioCobranzaRuta from '../components/FormularioCobranzaRuta.jsx';

/** Contabilidad → Cobranza: formulario de cobro de créditos de ruta. */
export default function CobranzaRuta({ supabase, user }) {
  const [aviso, setAviso] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#0f766e' }}>Cobranza</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Registro de abonos a créditos de Venta en Ruta. Separado del subcomando Crédito (cartera).
        </p>
      </div>
      {aviso && <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)' }}>{aviso}</div>}
      <div className="card" style={{ borderTop: '4px solid #0f766e' }}>
        <FormularioCobranzaRuta supabase={supabase} user={user} onAviso={setAviso} />
      </div>
    </div>
  );
}
