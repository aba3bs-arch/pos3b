import React, { useState } from 'react';
import PortalFlotante from './PortalFlotante.jsx';
import InputPin from './InputPin.jsx';
import { MINUTOS_EXTENSION_SESION } from '../lib/extensionSesionTurno.js';

/**
 * Cuando termina la ventana de turno con sesión abierta:
 * - +N min (cajero solo, para cerrar caja)
 * - PIN admin/gerente → autorización 8 h (sin cerrar sesión)
 * - Cerrar sesión
 */
export default function ModalExtensionTurno({
  open,
  minutos = MINUTOS_EXTENSION_SESION,
  onAceptar,
  onRechazar,
  onAutorizarAdmin,
  autorizandoAdmin = false,
}) {
  const [pinAdmin, setPinAdmin] = useState('');
  const [mostrarPin, setMostrarPin] = useState(false);

  if (!open) return null;

  const autorizar = async () => {
    const p = String(pinAdmin || '').trim();
    if (!p) return alert('Indica el PIN del administrador o gerente.');
    if (typeof onAutorizarAdmin !== 'function') return;
    const ok = await onAutorizarAdmin(p);
    if (ok) {
      setPinAdmin('');
      setMostrarPin(false);
    }
  };

  return (
    <PortalFlotante>
      <div className="anuncio-pos-backdrop" role="dialog" aria-modal="true" aria-labelledby="ext-turno-titulo">
        <div className="anuncio-pos-modal card" style={{ maxWidth: 460 }}>
          <h2 id="ext-turno-titulo" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
            Ventana de turno terminada
          </h2>
          <p style={{ margin: '0.85rem 0 0', lineHeight: 1.5 }}>
            Si aún estás cerrando caja, puedes quedarte <strong>{minutos} minutos más</strong>.
            Si un administrador autoriza, puedes seguir hasta <strong>8 horas</strong>.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.1rem' }}>
            <button type="button" className="btn btn-primary" onClick={onAceptar} autoFocus disabled={autorizandoAdmin}>
              Sí, {minutos} min más
            </button>
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => setMostrarPin((v) => !v)}
              disabled={autorizandoAdmin}
            >
              {mostrarPin ? 'Ocultar PIN admin' : 'Autorizar con PIN admin'}
            </button>
            <button type="button" className="btn" onClick={onRechazar} disabled={autorizandoAdmin}>
              Cerrar sesión
            </button>
          </div>

          {mostrarPin && (
            <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px dashed rgba(0,0,0,0.15)' }}>
              <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', lineHeight: 1.45 }}>
                PIN de <strong>administrador o gerente</strong> (no el del cajero). Autoriza entrada fuera de horario por 8 h en esta tienda.
              </p>
              <label className="muted" style={{ display: 'block', fontSize: '0.82rem' }}>
                PIN admin / gerente
                <InputPin
                  value={pinAdmin}
                  onChange={(e) => setPinAdmin(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !autorizandoAdmin && autorizar()}
                  placeholder="PIN admin / gerente"
                  autoFocus
                  autoComplete="off"
                  name="extension-turno-admin"
                  disabled={autorizandoAdmin}
                />
              </label>
              <button
                type="button"
                className="btn btn-gold"
                style={{ marginTop: '0.55rem' }}
                onClick={autorizar}
                disabled={autorizandoAdmin || !String(pinAdmin || '').trim()}
              >
                {autorizandoAdmin ? 'Verificando…' : 'Autorizar 8 h y continuar'}
              </button>
            </div>
          )}
        </div>
      </div>
    </PortalFlotante>
  );
}
