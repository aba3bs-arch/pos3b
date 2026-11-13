import React, { useEffect, useMemo, useRef, useState } from 'react';
import PortalFlotante from './PortalFlotante.jsx';
import {
  ACCION_FALTANTE,
  ACCION_REGISTRAR_VENTA,
  evaluarCandadoRecargasMp,
  payloadRecargasMpCorroboracion,
  notaFaltanteRecargasMp,
  notaVentaRegistradaRecargasMp,
} from '../lib/corteCajaRecargasMp.js';
import './CandadoRecargasMp.css';

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function horaNogales(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    timeZone: 'America/Hermosillo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Modal obligatorio antes de cerrar/guardar corte.
 * Compara total de la terminal Mercado Pago vs recargas registradas en el POS.
 */
export default function CandadoRecargasMp({
  abierto,
  posTotal = 0,
  /** Etiqueta del periodo consultado, p. ej. «11/11/2026 – 12/11/2026». */
  posRango = '',
  /** Recargas que suma el POS en ese periodo: [{ id, creado, vendedor, monto, ajuste, cancelacion }]. */
  posDetalle = [],
  usuarioNombre = '—',
  usuarioId = null,
  onCancelar,
  onConfirmar,
}) {
  const [terminal, setTerminal] = useState('');
  const [accionResolucion, setAccionResolucion] = useState('');
  const [aceptoRevision, setAceptoRevision] = useState(false);
  const [errorLocal, setErrorLocal] = useState('');
  const notaRef = useRef(null);

  const preview = useMemo(
    () => evaluarCandadoRecargasMp({
      terminalRaw: terminal,
      pos: posTotal,
      accionResolucion,
      aceptoRevision,
    }),
    [terminal, posTotal, accionResolucion, aceptoRevision],
  );

  useEffect(() => {
    if (!abierto) return;
    setTerminal('');
    setAccionResolucion('');
    setAceptoRevision(false);
    setErrorLocal('');
  }, [abierto]);

  useEffect(() => {
    if (preview.requiereAceptarFaltante && notaRef.current) {
      try {
        notaRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch {
        /* ignore */
      }
    }
  }, [preview.requiereAceptarFaltante, preview.diferencia]);

  if (!abierto) return null;

  const confirmar = () => {
    const ev = evaluarCandadoRecargasMp({
      terminalRaw: terminal,
      pos: posTotal,
      accionResolucion,
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
    const notaExtra = [
      notaFaltanteRecargasMp(ev, usuarioNombre),
      notaVentaRegistradaRecargasMp(ev, usuarioNombre),
    ].filter(Boolean).join('\n');
    onConfirmar?.({
      eval: ev,
      recargas_mp,
      notaExtra,
      faltante: ev.faltante || 0,
      montoVenta: ev.montoVenta || 0,
      accion: ev.accion || null,
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
        className="cv-modal-backdrop cv-modal-backdrop-float cv-portal candado-mp-backdrop"
        onClick={onCancelar}
        role="presentation"
      >
        <div
          className="card candado-mp-card"
          role="dialog"
          aria-label="Candado recargas Mercado Pago"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="candado-mp-title">Candado · Recargas Mercado Pago</h3>
          <p className="muted candado-mp-intro">
            Mira el <strong>total de recargas del turno en la terminal</strong> e introdúcelo.
            Se compara con lo registrado en el POS (días del corte, no solo el turno en curso).
            Sin esto no se cierra el corte.
          </p>

          <div className="candado-mp-kpis">
            <div className="candado-mp-kpi">
              <div className="muted candado-mp-kpi-lbl">
                POS (registrado){posRango ? ` · ${posRango}` : ''}
              </div>
              <div className="candado-mp-kpi-val">{fmt(posTotal)}</div>
            </div>
            <div className="candado-mp-kpi">
              <div className="muted candado-mp-kpi-lbl">Diferencia (terminal − POS)</div>
              <div className="candado-mp-kpi-val" style={{ color: difColor }}>
                {preview.diferencia == null ? '—' : fmt(preview.diferencia)}
              </div>
            </div>
          </div>

          {posDetalle.length > 0 && (
            <details className="candado-mp-detalle" style={{ margin: '0 0 0.6rem', fontSize: '0.84rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                Ver las {posDetalle.length} recarga(s) que suma el POS
              </summary>
              <table style={{ width: '100%', marginTop: '0.35rem', borderCollapse: 'collapse' }}>
                <tbody>
                  {posDetalle.map((r, i) => (
                    <tr key={`${r.id}_${i}`} style={{ borderBottom: '1px solid rgba(100,116,139,0.2)' }}>
                      <td style={{ padding: '0.2rem 0.3rem' }}>{horaNogales(r.creado)}</td>
                      <td style={{ padding: '0.2rem 0.3rem' }}>{r.vendedor || '—'}</td>
                      <td style={{ padding: '0.2rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>{fmt(r.monto)}</td>
                      <td className="muted" style={{ padding: '0.2rem 0.3rem' }}>
                        {r.ajuste ? 'ajuste del candado' : r.cancelacion ? 'cancelación' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          <label className="muted candado-mp-field">
            Total recargas en terminal MP (MXN)
            <input
              type="number"
              step="0.01"
              min="0"
              className="input"
              autoFocus
              value={terminal}
              onChange={(e) => {
                setTerminal(e.target.value);
                setErrorLocal('');
                setAccionResolucion('');
                setAceptoRevision(false);
              }}
              placeholder="0.00"
            />
          </label>

          {preview.requiereAceptarFaltante && (
            <div ref={notaRef} className="candado-mp-nota" role="group" aria-label="Resolver diferencia">
              <div className="candado-mp-nota-hd">
                La terminal reporta <strong>{fmt(preview.diferencia)}</strong> más que el POS
              </div>
              <p className="candado-mp-nota-txt">
                Elige cómo resolver la diferencia antes de cerrar el corte:
              </p>

              <label className={`candado-mp-opcion${accionResolucion === ACCION_REGISTRAR_VENTA ? ' sel' : ''}`}>
                <input
                  type="radio"
                  name="candado-mp-resolucion"
                  checked={accionResolucion === ACCION_REGISTRAR_VENTA}
                  onChange={() => {
                    setAccionResolucion(ACCION_REGISTRAR_VENTA);
                    setErrorLocal('');
                  }}
                />
                <span>
                  <strong>Registrar venta en el POS</strong> por {fmt(preview.diferencia)}.
                  Cuadra la terminal con el sistema sin faltante al cajero/CT.
                  {posDetalle.length > 0 && (
                    <> Antes de elegirla, revisa la lista de recargas del POS: si la recarga ya aparece ahí (de otro turno u otro día), no la registres otra vez.</>
                  )}
                </span>
              </label>

              <label className={`candado-mp-opcion${accionResolucion === ACCION_FALTANTE ? ' sel' : ''}`}>
                <input
                  type="radio"
                  name="candado-mp-resolucion"
                  checked={accionResolucion === ACCION_FALTANTE}
                  onChange={() => {
                    setAccionResolucion(ACCION_FALTANTE);
                    setErrorLocal('');
                  }}
                />
                <span>
                  <strong>Aceptar faltante</strong> de {fmt(preview.diferencia)} a cargo de{' '}
                  <strong>{usuarioNombre}</strong> (cajero/CT): también registra la recarga en el
                  POS y suma esa venta en Abarrotes, y carga el gasto FALTANTE (así no queda
                  sobrante). Aplica a nómina / pago de CT.
                </span>
              </label>
            </div>
          )}

          {preview.requiereAceptarRevision && (
            <label className="candado-mp-revision">
              <input
                type="checkbox"
                checked={aceptoRevision}
                onChange={(e) => {
                  setAceptoRevision(e.target.checked);
                  setErrorLocal('');
                }}
              />
              <span>
                Ya revisé: el POS tiene más recargas que la terminal. Confirmo que el monto de la
                terminal es correcto.
              </span>
            </label>
          )}

          {(errorLocal || (preview.error && terminal !== '')) && (
            <p className="candado-mp-error">
              {errorLocal || preview.error}
            </p>
          )}

          <div className="candado-mp-acciones">
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
