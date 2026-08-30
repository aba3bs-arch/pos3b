import React from 'react';

/**
 * Oferta de activar Face ID / huella tras login con PIN.
 * El botón "Activar" debe llamar a WebAuthn create() en el mismo gesto
 * (window.confirm suele romper el gesto en Android → "No se puede generar la llave").
 */
export default function ModalActivarBiometria({
  open,
  nombre,
  registrando = false,
  onActivar,
  onOmitir,
}) {
  if (!open) return null;

  return (
    <div className="anuncio-pos-backdrop" role="dialog" aria-modal="true" aria-labelledby="bio-activar-titulo">
      <div className="anuncio-pos-modal card" style={{ maxWidth: 440 }}>
        <h2 id="bio-activar-titulo" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
          Activar biometría
        </h2>
        <p style={{ margin: '0.85rem 0 0', lineHeight: 1.5 }}>
          ¿Quieres entrar con Face ID / huella para{' '}
          <strong>{nombre || 'este usuario'}</strong> en este teléfono?
        </p>
        <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.85rem', lineHeight: 1.45 }}>
          Solo en celulares (iPhone, Android, Honor, etc.). La próxima vez no necesitarás el PIN;
          el PIN seguirá como respaldo. Si eliges No, no volveremos a preguntar en este teléfono.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onActivar}
            disabled={registrando}
            autoFocus
          >
            {registrando ? 'Activando…' : 'Sí, activar'}
          </button>
          <button type="button" className="btn" onClick={onOmitir} disabled={registrando}>
            No, gracias
          </button>
        </div>
      </div>
    </div>
  );
}
