import React, { useState } from 'react';
import { fijarPunAdminPrincipal, leerPunSesion, recordarPunSesion } from '../lib/punAdminPrincipal.js';

/**
 * El PUN solo se muestra en la sesión del administrador principal.
 * No sale en Usuarios ni en ninguna lista.
 */
export default function PanelPunAdminPrincipal({ supabase }) {
  const [pun, setPun] = useState(() => leerPunSesion());
  const [actual, setActual] = useState('');
  const [nuevo, setNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cambiar = async () => {
    if (!supabase) return;
    setGuardando(true);
    const res = await fijarPunAdminPrincipal(supabase, actual, nuevo);
    setGuardando(false);
    if (!res.ok) {
      alert(res.error || 'No se pudo cambiar el PUN.');
      return;
    }
    recordarPunSesion(res.pun);
    setPun(res.pun);
    setActual('');
    setNuevo('');
    alert('PUN actualizado. Solo tú lo ves en esta pantalla.');
  };

  return (
    <div className="card" style={{ borderLeft: '4px solid #6b5b2a' }}>
      <h3 style={{ margin: '0 0 0.35rem', fontSize: '1rem' }}>Tu PUN</h3>
      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.82rem' }}>
        Número personal de acceso. No aparece para los demás administradores y no se puede usar para excluirte.
      </p>
      {pun ? (
        <p style={{ margin: '0 0 0.75rem', fontSize: '1.35rem', fontWeight: 800, letterSpacing: '0.04em' }}>
          {pun}
        </p>
      ) : (
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          Entra de nuevo con tu PUN para verlo aquí. En esta sesión no quedó guardado.
        </p>
      )}
      <div style={{ display: 'grid', gap: '0.45rem', maxWidth: 320 }}>
        <label className="muted" style={{ fontSize: '0.78rem' }}>
          PUN actual
          <input className="input" style={{ marginTop: '0.25rem' }} value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="off" />
        </label>
        <label className="muted" style={{ fontSize: '0.78rem' }}>
          PUN nuevo
          <input className="input" style={{ marginTop: '0.25rem' }} value={nuevo} onChange={(e) => setNuevo(e.target.value)} autoComplete="off" />
        </label>
        <button type="button" className="btn btn-primary" disabled={guardando} onClick={cambiar}>
          {guardando ? 'Guardando…' : 'Cambiar mi PUN'}
        </button>
      </div>
    </div>
  );
}
