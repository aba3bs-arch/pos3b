import React from 'react';
import PortalFlotante from './PortalFlotante.jsx';
import { MINUTOS_EXTENSION_SESION } from '../lib/extensionSesionTurno.js';

/**
 * Cuando termina la ventana de turno con sesión abierta:
 * - +N min (cajero solo, para cerrar caja)
 * - Solicitar más tiempo → notificación al admin (aprueba 2–12 h en celular)
 * - Cerrar sesión
 */
export default function ModalExtensionTurno({
  open,
  minutos = MINUTOS_EXTENSION_SESION,
  onAceptar,
  onRechazar,
  onSolicitarMasTiempo,
  solicitandoMasTiempo = false,
  esperandoAprobacion = false,
}) {
  if (!open) return null;

  return (
    <PortalFlotante>
      <div className="anuncio-pos-backdrop" role="dialog" aria-modal="true" aria-labelledby="ext-turno-titulo">
        <div className="anuncio-pos-modal card" style={{ maxWidth: 460 }}>
          <h2 id="ext-turno-titulo" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
            Ventana de turno terminada
          </h2>
          {esperandoAprobacion ? (
            <>
              <p style={{ margin: '0.85rem 0 0', lineHeight: 1.5 }}>
                Solicitud enviada. Un administrador puede aprobar <strong>2 a 12 horas</strong> desde su celular.
                Cuando autorice, esta pantalla se cierra sola.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.1rem' }}>
                <button type="button" className="btn btn-primary" onClick={onAceptar} disabled={solicitandoMasTiempo}>
                  Mientras tanto: {minutos} min más
                </button>
                <button type="button" className="btn" onClick={onRechazar} disabled={solicitandoMasTiempo}>
                  Cerrar sesión
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: '0.85rem 0 0', lineHeight: 1.5 }}>
                Si aún estás cerrando caja, puedes quedarte <strong>{minutos} minutos más</strong>.
                Si necesitas más tiempo, solicita autorización al administrador (elige horas en su celular).
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.1rem' }}>
                <button type="button" className="btn btn-primary" onClick={onAceptar} autoFocus disabled={solicitandoMasTiempo}>
                  Sí, {minutos} min más
                </button>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={onSolicitarMasTiempo}
                  disabled={solicitandoMasTiempo}
                >
                  {solicitandoMasTiempo ? 'Enviando…' : 'Solicitar más tiempo'}
                </button>
                <button type="button" className="btn" onClick={onRechazar} disabled={solicitandoMasTiempo}>
                  Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </PortalFlotante>
  );
}
