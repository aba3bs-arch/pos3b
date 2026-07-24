import React from 'react';
import { MINUTOS_EXTENSION_SESION } from '../lib/extensionSesionTurno.js';

export default function ModalExtensionTurno({ open, minutos = MINUTOS_EXTENSION_SESION, onAceptar, onRechazar }) {
  if (!open) return null;

  return (
    <div className="anuncio-pos-backdrop" role="dialog" aria-modal="true" aria-labelledby="ext-turno-titulo">
      <div className="anuncio-pos-modal card" style={{ maxWidth: 440 }}>
        <h2 id="ext-turno-titulo" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
          ¿Necesitas más tiempo?
        </h2>
        <p style={{ margin: '0.85rem 0 0', lineHeight: 1.5 }}>
          Tu ventana de turno ya terminó. Si aún estás cerrando caja o entregando el turno, puedes
          quedarte <strong>{minutos} minutos más</strong>. El corte seguirá a nombre de tu turno.
        </p>
        <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.85rem', lineHeight: 1.45 }}>
          Si no necesitas más tiempo, se cerrará la sesión.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button type="button" className="btn btn-primary" onClick={onAceptar} autoFocus>
            Sí, {minutos} min más
          </button>
          <button type="button" className="btn" onClick={onRechazar}>
            No, cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
