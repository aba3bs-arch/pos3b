import React, { useState } from 'react';
import InputPin from './InputPin.jsx';
import { esAdministradorPrincipal, verificarAdminPrincipal } from '../lib/adminPrincipal.js';
import { borrarDatosVentaEnRuta } from '../lib/purgaVentaEnRuta.js';

/**
 * Botón / panel destructivo: solo admin principal (AMR / Andrés).
 * Vacía el módulo Venta en Ruta antes de iniciar operación real.
 */
export default function PanelPurgaVentaEnRuta({
  supabase,
  user,
  sucursal,
  onPurgado,
}) {
  const visible = esAdministradorPrincipal(user);
  const [abierto, setAbierto] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmTexto, setConfirmTexto] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  if (!visible) return null;

  const ejecutar = async () => {
    setErr('');
    setMsg('');
    if (!pin.trim()) {
      setErr('Ingresa tu PIN de administrador principal.');
      return;
    }
    if (confirmTexto.trim().toUpperCase() !== 'BORRAR RUTA') {
      setErr('Escribe BORRAR RUTA para confirmar.');
      return;
    }
    if (
      !window.confirm(
        'ÚLTIMA CONFIRMACIÓN: se borrarán cargas, ventas, CxC, cortes, clientes, camiones y tránsito de Venta en Ruta. ¿Continuar?',
      )
    ) {
      return;
    }

    setProcesando(true);
    const auth = await verificarAdminPrincipal(supabase, pin, sucursal);
    if (!auth.ok) {
      setProcesando(false);
      setErr(auth.error);
      return;
    }

    const r = await borrarDatosVentaEnRuta(supabase);
    setProcesando(false);
    setPin('');
    setConfirmTexto('');
    if (!r.ok) {
      setErr(r.error || (r.errores || []).join('\n'));
      if (r.detalle) setMsg(r.detalle);
      return;
    }
    setMsg(r.detalle || 'Venta en Ruta reiniciada.');
    setAbierto(false);
    onPurgado?.();
  };

  return (
    <div
      className="card"
      style={{
        margin: 0,
        borderTop: '4px solid var(--brand-red)',
        borderColor: 'rgba(220, 38, 38, 0.35)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ flex: '1 1 220px' }}>
          <h3 style={{ margin: 0, color: 'var(--brand-red)', fontSize: '1rem' }}>
            Reiniciar Venta en Ruta
          </h3>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
            Solo administrador principal. Borra todos los datos del módulo para arrancar operación limpia
            (cargas, ventas, camiones, clientes, cortes, CxC y caché). No restaura stock CEDIS ni borra precios del catálogo.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            setAbierto((v) => !v);
            setErr('');
            setMsg('');
          }}
        >
          {abierto ? 'Cancelar' : 'Borrar datos de Venta en Ruta'}
        </button>
      </div>

      {abierto && (
        <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
            Escribe <strong>BORRAR RUTA</strong> para confirmar
            <input
              className="input"
              style={{ display: 'block', marginTop: '0.25rem', maxWidth: 280 }}
              value={confirmTexto}
              onChange={(e) => setConfirmTexto(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div style={{ maxWidth: 220, marginTop: '0.75rem' }}>
            <div className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>
              PIN administrador principal
            </div>
            <InputPin value={pin} onChange={(e) => setPin(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn btn-danger"
            style={{ marginTop: '0.85rem' }}
            disabled={procesando}
            onClick={() => void ejecutar()}
          >
            {procesando ? 'Borrando…' : 'Confirmar borrado total del módulo'}
          </button>
        </div>
      )}

      {msg && <p style={{ color: 'var(--brand-green)', marginTop: '0.75rem', fontSize: '0.85rem' }}>{msg}</p>}
      {err && (
        <p style={{ color: 'var(--brand-red)', marginTop: '0.75rem', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
          {err}
        </p>
      )}
    </div>
  );
}
