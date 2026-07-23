import React, { useEffect, useState } from 'react';
import { etiquetaTipoCierre } from '../../lib/corteContabilidad/permisos.js';
import { fmtCorte } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import { round2 } from '../../lib/corteContabilidad/calc.js';

const ACCENT = '#6c3483';

/**
 * Vista para recolector/admin: ventas y gastos por cada cierre del periodo
 * (historial) + resumen del corte abierto.
 * Click en el monto de gastos → desglose del turno.
 */
export default function CorteVirtualDesgloseModal({
  abierto,
  onCerrar,
  historial = [],
  corteActual = null,
}) {
  const [expandidoId, setExpandidoId] = useState(null);

  useEffect(() => {
    if (!abierto) setExpandidoId(null);
  }, [abierto]);

  if (!abierto) return null;

  const cierres = (historial || []).filter((h) => {
    const t = h?.detalle?.tipo_cierre;
    return t !== 'recoleccion';
  });
  const recolecciones = (historial || []).filter((h) => h?.detalle?.tipo_cierre === 'recoleccion');

  const totVentas = round2(cierres.reduce((a, h) => a + (Number(h.ventas) || Number(h.detalle?.venta) || 0), 0));
  const totGastos = round2(
    cierres.reduce((a, h) => a + (Number(h.detalle?.gastos_total) || 0), 0),
  );
  const totRec = round2(
    recolecciones.reduce(
      (a, h) => a + (Number(h.detalle?.recoleccion) || Number(h.detalle?.recoleccion_turno) || 0),
      0,
    ),
  );

  const toggle = (id) => {
    setExpandidoId((prev) => (prev === id ? null : id));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '1.25rem',
        overflow: 'auto',
      }}
      onClick={onCerrar}
    >
      <div
        className="card"
        style={{
          width: 'min(920px, 100%)',
          marginTop: '1.5rem',
          maxHeight: 'calc(100vh - 3rem)',
          overflow: 'auto',
          borderTop: `3px solid ${ACCENT}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, color: ACCENT }}>Desglose de cortes</h3>
            <p className="muted" style={{ margin: '0.3rem 0 0', fontSize: '0.82rem' }}>
              Ventas y gastos por turno · toca el monto de <strong>Gastos</strong> para ver el detalle
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onCerrar}>
            Cerrar
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.65rem',
            margin: '1rem 0',
          }}
        >
          <Kpi label="Ventas cierres" value={fmtCorte(totVentas)} />
          <Kpi label="Gastos cierres" value={fmtCorte(totGastos)} />
          <Kpi label="Recolecciones" value={fmtCorte(totRec)} accent />
          <Kpi label="Cierres" value={String(cierres.length)} />
        </div>

        {corteActual && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              background: 'rgba(108,52,131,0.06)',
              borderRadius: 8,
              border: '1px solid rgba(108,52,131,0.18)',
            }}
          >
            <strong style={{ color: ACCENT }}>Corte abierto (actual)</strong>
            <div className="table-wrap" style={{ marginTop: '0.5rem' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Turno</th>
                    <th>Venta</th>
                    <th>Gastos</th>
                    <th>Subtotal</th>
                    <th>Caja chica</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{corteActual.folio || '—'}</td>
                    <td>{corteActual.turno || '—'}</td>
                    <td style={{ fontWeight: 700 }}>{fmtCorte(corteActual.venta)}</td>
                    <td>
                      <BotonGastos
                        monto={corteActual.gastos}
                        activo={expandidoId === 'actual'}
                        onClick={() => toggle('actual')}
                      />
                    </td>
                    <td>{fmtCorte(corteActual.subtotal)}</td>
                    <td>{fmtCorte(corteActual.caja)}</td>
                  </tr>
                  {expandidoId === 'actual' && (
                    <tr>
                      <td colSpan={6} style={{ padding: '0.5rem 0.75rem 0.85rem', background: 'rgba(108,52,131,0.04)' }}>
                        <DetalleGastosTurno
                          gastos={corteActual.listaGastos || []}
                          titulo={`Gastos del corte abierto · ${corteActual.folio || ''}`}
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <h4 style={{ margin: '0 0 0.5rem', color: ACCENT }}>Historial del periodo</h4>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Folio</th>
                <th>Usuario</th>
                <th>Venta</th>
                <th>Gastos</th>
                <th>Subtotal</th>
                <th>Caja / Rec.</th>
              </tr>
            </thead>
            <tbody>
              {(historial || []).map((h) => {
                const d = h.detalle || {};
                const tipo = etiquetaTipoCierre(d);
                const esRec = d.tipo_cierre === 'recoleccion';
                const venta = Number(h.ventas) || Number(d.venta) || 0;
                const gastosMonto = Number(d.gastos_total) || 0;
                const listaGastos = Array.isArray(d.gastos) ? d.gastos : [];
                const sub = Number(d.subtotal);
                const cajaORec = esRec
                  ? Number(d.recoleccion ?? d.recoleccion_turno) || 0
                  : Number(h.caja_actual) || 0;
                const abiertoFila = expandidoId === h.id;
                return (
                  <React.Fragment key={h.id}>
                    <tr>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        {h.created_at ? new Date(h.created_at).toLocaleString('es-MX') : '—'}
                      </td>
                      <td>{tipo}</td>
                      <td>{h.folio || '—'}</td>
                      <td className="muted">{h.usuario_nombre || '—'}</td>
                      <td style={{ fontWeight: esRec ? 400 : 700 }}>{esRec ? '—' : fmtCorte(venta)}</td>
                      <td>
                        {esRec ? (
                          '—'
                        ) : (
                          <BotonGastos
                            monto={gastosMonto}
                            activo={abiertoFila}
                            onClick={() => toggle(h.id)}
                            disabled={!(gastosMonto > 0) && !listaGastos.length}
                          />
                        )}
                      </td>
                      <td>{Number.isFinite(sub) && !esRec ? fmtCorte(sub) : '—'}</td>
                      <td style={{ fontWeight: esRec ? 800 : 400, color: esRec ? ACCENT : undefined }}>
                        {fmtCorte(cajaORec)}
                      </td>
                    </tr>
                    {abiertoFila && !esRec && (
                      <tr>
                        <td colSpan={8} style={{ padding: '0.5rem 0.75rem 0.85rem', background: 'rgba(108,52,131,0.04)' }}>
                          <DetalleGastosTurno
                            gastos={listaGastos}
                            titulo={`Gastos · ${h.folio || tipo} · ${h.usuario_nombre || ''}`}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!(historial || []).length && (
                <tr>
                  <td colSpan={8} className="muted">
                    Sin cierres en el historial aún.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BotonGastos({ monto, activo, onClick, disabled }) {
  const tiene = Number(monto) > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tiene ? 'Ver desglose de gastos del turno' : 'Sin gastos'}
      style={{
        border: 'none',
        background: activo ? 'rgba(108,52,131,0.15)' : 'transparent',
        color: tiene ? ACCENT : 'inherit',
        fontWeight: 800,
        cursor: disabled ? 'default' : 'pointer',
        padding: '0.15rem 0.35rem',
        borderRadius: 4,
        textDecoration: disabled ? 'none' : 'underline',
        textUnderlineOffset: 2,
      }}
    >
      {fmtCorte(monto)}
      {!disabled && <span style={{ marginLeft: 4, fontSize: '0.7rem' }}>{activo ? '▲' : '▼'}</span>}
    </button>
  );
}

function DetalleGastosTurno({ gastos = [], titulo }) {
  if (!gastos.length) {
    return <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Sin detalle de gastos guardado en este cierre.</p>;
  }

  const total = round2(gastos.reduce((a, g) => a + (Number(g.monto) || 0), 0));

  return (
    <div>
      <div style={{ fontWeight: 700, color: ACCENT, marginBottom: '0.4rem', fontSize: '0.85rem' }}>{titulo}</div>
      <table className="data" style={{ fontSize: '0.82rem' }}>
        <thead>
          <tr>
            <th>Hora</th>
            <th>Cat.</th>
            <th>Sub</th>
            <th>Empleado</th>
            <th>Nota</th>
            <th style={{ textAlign: 'right' }}>Monto</th>
          </tr>
        </thead>
        <tbody>
          {gastos.map((g, idx) => {
            const hora = g.created_at
              ? new Date(g.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
              : '—';
            return (
              <tr key={g.id || `${g.categoria}-${idx}`}>
                <td style={{ whiteSpace: 'nowrap' }}>{hora}</td>
                <td>{g.categoria || '—'}</td>
                <td className="muted">{g.subcategoria || '—'}</td>
                <td className="muted">{g.usuario_nombre || '—'}</td>
                <td className="muted">{g.comentario || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtCorte(g.monto)}</td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={5} style={{ textAlign: 'right', fontWeight: 800 }}>Total</td>
            <td style={{ textAlign: 'right', fontWeight: 800, color: ACCENT }}>{fmtCorte(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value, accent }) {
  return (
    <div
      style={{
        padding: '0.55rem 0.7rem',
        borderRadius: 8,
        background: accent ? 'rgba(108,52,131,0.1)' : 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="muted" style={{ fontSize: '0.72rem' }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: accent ? ACCENT : undefined }}>{value}</div>
    </div>
  );
}
