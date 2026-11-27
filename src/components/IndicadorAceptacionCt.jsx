import React, { useState } from 'react';
import PortalFlotante from './PortalFlotante.jsx';
import {
  UMBRAL_ACEPTACION_CT,
  colorNivelAceptacionCt,
  etiquetaNivelAceptacionCt,
} from '../lib/cubreAceptacionCt.js';

/** Badge clicable con % de aceptación del CT. */
export function IndicadorAceptacionCt({ resumen, onClick, compact = false }) {
  const pct = resumen?.pct;
  const optsNivel = { inicial: Boolean(resumen?.inicial) };
  const color = colorNivelAceptacionCt(pct, optsNivel);
  const label = etiquetaNivelAceptacionCt(pct, optsNivel);
  return (
    <button
      type="button"
      onClick={onClick}
      title="Ver desglose por tienda"
      style={{
        display: 'inline-flex',
        flexDirection: compact ? 'row' : 'column',
        alignItems: compact ? 'center' : 'flex-start',
        gap: compact ? '0.45rem' : '0.15rem',
        border: `2px solid ${color}`,
        background: `${color}14`,
        borderRadius: 10,
        padding: compact ? '0.35rem 0.65rem' : '0.55rem 0.85rem',
        cursor: 'pointer',
        textAlign: 'left',
        minWidth: compact ? undefined : 150,
      }}
    >
      <span style={{ fontSize: compact ? '0.95rem' : '1.45rem', fontWeight: 800, color, lineHeight: 1 }}>
        {pct == null ? '100%' : `${pct}%`}
      </span>
      <span style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600 }}>
        Aceptación · {label}
        {!compact && (
          <span className="muted" style={{ display: 'block', fontWeight: 400, marginTop: 2 }}>
            {resumen?.n
              ? `${resumen.n} calificación${resumen.n === 1 ? '' : 'es'} · clic por tienda`
              : 'Arranca en 100% · depende de las calificaciones'}
          </span>
        )}
      </span>
    </button>
  );
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaNota(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1] || m[2]} ${m[1]}`;
}

function NotasSucursal({ fila }) {
  const notas = Array.isArray(fila?.notas) ? fila.notas : [];
  if (!notas.length) {
    return <p className="muted" style={{ margin: 0 }}>Esta tienda no tiene notas guardadas.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
      {notas.map((n, i) => {
        const hayNota = Boolean(n.comentario) || (n.problemas || []).length > 0;
        return (
          <article
            key={n.id || `${n.fecha}-${i}`}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '0.5rem 0.65rem',
              background: '#fff',
            }}
          >
            <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: 4 }}>
              {[fechaNota(n.fecha), n.etiqueta, n.evaluado_por].filter(Boolean).join(' · ')}
            </div>
            {(n.problemas || []).length > 0 && (
              <ul style={{ margin: '0 0 0.35rem', paddingLeft: '1.1rem', fontSize: '0.82rem' }}>
                {n.problemas.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
            {(n.comentario || !hayNota) && (
              <p style={{ margin: 0, fontSize: '0.88rem', whiteSpace: 'pre-wrap' }}>
                {n.comentario || 'Sin nota escrita.'}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

/** Modal con % general y desglose por tienda. */
export function ModalDesgloseAceptacion({ resumen, nombre, onClose }) {
  const [tiendaAbierta, setTiendaAbierta] = useState(null);
  if (!resumen) return null;
  const filas = resumen.porSucursal || [];
  const abierta = filas.find((r) => r.sucursal_id === tiendaAbierta) || null;
  return (
    <PortalFlotante>
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{ maxWidth: 480, width: '100%', margin: 0, maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h4 style={{ margin: '0 0 0.35rem' }}>Aceptación · {nombre || 'CT'}</h4>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          Todo cubreturno arranca en <strong>100%</strong>. Las calificaciones de planta (1–5 → %)
          suben o bajan ese nivel. General:{' '}
          <strong style={{ color: colorNivelAceptacionCt(resumen.pct, { inicial: resumen.inicial }) }}>
            {resumen.pct == null ? '100%' : `${resumen.pct}%`}
          </strong>
          {' '}
          (mínimo {UMBRAL_ACEPTACION_CT}% para mantener la app).
        </p>
        {filas.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Aún no hay calificaciones por tienda — se mantiene el 100% inicial.
          </p>
        ) : (
          <>
            <p className="muted" style={{ margin: '0 0 0.45rem', fontSize: '0.8rem' }}>
              Clic en una tienda para ver las notas de cada evaluación.
            </p>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Tienda</th>
                    <th>Califs.</th>
                    <th>Prom.</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((r) => {
                    const abiertaFila = r.sucursal_id === tiendaAbierta;
                    return (
                      <tr
                        key={r.sucursal_id}
                        onClick={() => setTiendaAbierta(abiertaFila ? null : r.sucursal_id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setTiendaAbierta(abiertaFila ? null : r.sucursal_id);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-expanded={abiertaFila}
                        title="Ver notas de esta tienda"
                        style={{
                          cursor: 'pointer',
                          background: abiertaFila ? '#eff6ff' : undefined,
                        }}
                      >
                        <td style={{ fontWeight: abiertaFila ? 700 : 500 }}>{r.tienda}</td>
                        <td>{r.n}</td>
                        <td>{r.promedio}/5</td>
                        <td style={{ fontWeight: 700, color: colorNivelAceptacionCt(r.pct) }}>{r.pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {abierta && (
              <div style={{ marginTop: '0.75rem' }}>
                <h5 style={{ margin: '0 0 0.4rem' }}>Notas · {abierta.tienda}</h5>
                <NotasSucursal fila={abierta} />
              </div>
            )}
          </>
        )}
        <div style={{ marginTop: '0.85rem', textAlign: 'right' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
    </PortalFlotante>
  );
}
