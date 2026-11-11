import React, { useMemo, useState } from 'react';
import PortalFlotante from './PortalFlotante.jsx';
import {
  evaluarCandadoRecargasMp,
  payloadRecargasMpCorroboracion,
  notaFaltanteRecargasMp,
} from '../lib/corteCajaRecargasMp.js';

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

/**
 * Modal obligatorio antes de cerrar/guardar corte.
 * Compara total de la terminal Mercado Pago vs recargas registradas en el POS.
 */
export default function CandadoRecargasMp({
  abierto,
  posTotal = 0,
  usuarioNombre = '—',
  usuarioId = null,
  onCancelar,
  onConfirmar,
}) {
  const [terminal, setTerminal] = useState('');
  const [aceptoFaltante, setAceptoFaltante] = useState(false);
  const [aceptoRevision, setAceptoRevision] = useState(false);
  const [errorLocal, setErrorLocal] = useState('');

  const preview = useMemo(
    () => evaluarCandadoRecargasMp({
      terminalRaw: terminal,
      pos: posTotal,
      aceptoFaltante,
      aceptoRevision,
    }),
    [terminal, posTotal, aceptoFaltante, aceptoRevision],
  );

  if (!abierto) return null;

  const confirmar = () => {
    const ev = evaluarCandadoRecargasMp({
      terminalRaw: terminal,
      pos: posTotal,
      aceptoFaltante,
      aceptoRevision,
    });
    if (!ev.ok) {
      setErrorLocal(ev.error || 'Revisa los montos.');
      return;
    }
    const recargas_mp = payloadRecargasMpCorroboracion(ev, {
      usuarioNombre,
      usuarioId,
    });
    const notaExtra = notaFaltanteRecargasMp(ev, usuarioNombre);
    onConfirmar?.({
      eval: ev,
      recargas_mp,
      notaExtra,
      faltante: ev.faltante || 0,
    });
  };

  const difColor =
    preview.diferencia == null
      ? 'var(--muted)'
      : Math.abs(preview.diferencia) < 0.01
        ? 'var(--brand-green)'
        : 'var(--brand-red)';

  return (
    <PortalFlotante>
      <div
        className="cv-modal-backdrop cv-modal-backdrop-float cv-portal"
        onClick={onCancelar}
        role="presentation"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 10050,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
      >
        <div
          className="card"
          role="dialog"
          aria-label="Candado recargas Mercado Pago"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 'min(440px, 100%)',
            maxHeight: '90vh',
            overflow: 'auto',
            borderTop: '4px solid var(--brand-gold, #c9a227)',
          }}
        >
          <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>
            Candado · Recargas Mercado Pago
          </h3>
          <p className="muted" style={{ margin: '0 0 0.85rem', fontSize: '0.85rem' }}>
            Mira el <strong>total de recargas del turno en la terminal</strong> e introdúcelo.
            Se compara con lo registrado en el POS. Sin esto no se cierra el corte.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.65rem',
              marginBottom: '0.75rem',
            }}
          >
            <div style={{ padding: '0.65rem', borderRadius: 8, background: 'var(--surface)' }}>
              <div className="muted" style={{ fontSize: '0.72rem' }}>POS (registrado)</div>
              <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{fmt(posTotal)}</div>
            </div>
            <div style={{ padding: '0.65rem', borderRadius: 8, background: 'var(--surface)' }}>
              <div className="muted" style={{ fontSize: '0.72rem' }}>Diferencia (terminal − POS)</div>
              <div style={{ fontWeight: 800, fontSize: '1.15rem', color: difColor }}>
                {preview.diferencia == null ? '—' : fmt(preview.diferencia)}
              </div>
            </div>
          </div>

          <label className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
            Total recargas en terminal MP (MXN)
            <input
              type="number"
              step="0.01"
              min="0"
              className="input"
              autoFocus
              style={{ marginTop: '0.35rem', fontSize: '1.2rem', fontWeight: 700 }}
              value={terminal}
              onChange={(e) => {
                setTerminal(e.target.value);
                setErrorLocal('');
                setAceptoFaltante(false);
                setAceptoRevision(false);
              }}
              placeholder="0.00"
            />
          </label>

          {preview.requiereAceptarFaltante && (
            <label
              style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'flex-start',
                marginTop: '0.85rem',
                padding: '0.65rem',
                borderRadius: 8,
                background: 'rgba(180,40,40,0.12)',
                fontSize: '0.85rem',
              }}
            >
              <input
                type="checkbox"
                checked={aceptoFaltante}
                onChange={(e) => {
                  setAceptoFaltante(e.target.checked);
                  setErrorLocal('');
                }}
                style={{ marginTop: 3 }}
              />
              <span>
                Acepto faltante de <strong>{fmt(preview.faltante)}</strong> a cargo de{' '}
                <strong>{usuarioNombre}</strong> (cajero/CT en turno). Se registrará en el corte
                y aplicará a nómina / pago de CT.
              </span>
            </label>
          )}

          {preview.requiereAceptarRevision && (
            <label
              style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'flex-start',
                marginTop: '0.85rem',
                padding: '0.65rem',
                borderRadius: 8,
                background: 'rgba(180,140,40,0.14)',
                fontSize: '0.85rem',
              }}
            >
              <input
                type="checkbox"
                checked={aceptoRevision}
                onChange={(e) => {
                  setAceptoRevision(e.target.checked);
                  setErrorLocal('');
                }}
                style={{ marginTop: 3 }}
              />
              <span>
                Ya revisé: el POS tiene más recargas que la terminal. Confirmo que el monto de la
                terminal es correcto.
              </span>
            </label>
          )}

          {(errorLocal || (preview.error && terminal !== '')) && (
            <p style={{ margin: '0.75rem 0 0', color: 'var(--brand-red)', fontSize: '0.85rem' }}>
              {errorLocal || preview.error}
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-ghost" onClick={onCancelar}>
              Cancelar
            </button>
            <button type="button" className="btn btn-success" onClick={confirmar}>
              Confirmar y cerrar
            </button>
          </div>
        </div>
      </div>
    </PortalFlotante>
  );
}
