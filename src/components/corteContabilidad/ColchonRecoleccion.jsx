import React from 'react';
import { fmtCorte } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import { evaluarRecoleccion, maximoRecolectable } from '../../lib/corteContabilidad/analisisCajaAbarrotes.js';

const NIVELES = {
  ok: { color: '#1e8449', fondo: 'rgba(39,174,96,0.12)', titulo: 'Recolección segura' },
  bajo: { color: '#b9770e', fondo: 'rgba(243,156,18,0.16)', titulo: 'Recolección deja la caja corta' },
  negativo: { color: 'var(--danger)', fondo: 'rgba(192,57,43,0.14)', titulo: 'Recolección deja la caja en negativo' },
  sin_datos: { color: 'var(--muted)', fondo: 'transparent', titulo: 'Sin historial suficiente' },
};

/**
 * Antes de recolectar: cuánta caja debe quedar para no caer a negativo en los próximos días,
 * según el gasto y la venta en efectivo históricos de esta tienda.
 */
export default function ColchonRecoleccion({
  colchon,
  cajaActual,
  montoRecoleccion,
  diasColchon,
  onCambiarDias,
  onUsarMaximo,
  puedeEditar = true,
  cargando = false,
  veces = null,
}) {
  const cajaAntes = Math.round(((Number(cajaActual) || 0) + (Number(montoRecoleccion) || 0)) * 100) / 100;
  const valorColchon = colchon ? colchon.colchon : null;
  const ev = evaluarRecoleccion({ cajaDespues: cajaActual, colchon: valorColchon });
  const max = maximoRecolectable({ cajaAntes, colchon: valorColchon });
  const estilo = NIVELES[ev.nivel] || NIVELES.sin_datos;

  return (
    <div className="card" style={{ borderLeft: `4px solid ${estilo.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0 }}>Colchón antes de recolectar</h4>
        <label className="muted" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          Cubrir
          <select
            className="select"
            style={{ padding: '0.1rem 0.25rem', fontSize: '0.78rem' }}
            value={diasColchon}
            onChange={(e) => onCambiarDias?.(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n} día{n > 1 ? 's' : ''}</option>
            ))}
          </select>
        </label>
      </div>

      {!colchon ? (
        <p className="muted" style={{ fontSize: '0.82rem', margin: '0.5rem 0 0' }}>
          {cargando
            ? 'Calculando con el historial de cierres…'
            : 'Aún no hay al menos 5 días de cierres de esta tienda para calcular el colchón.'}
        </p>
      ) : (
        <>
          <div style={{ background: estilo.fondo, color: estilo.color, borderRadius: 6, padding: '0.5rem 0.6rem', margin: '0.6rem 0', fontWeight: 700, fontSize: '0.88rem' }}>
            {estilo.titulo}
            {ev.nivel !== 'ok' && ev.nivel !== 'sin_datos' && (
              <span style={{ display: 'block', fontWeight: 500, fontSize: '0.8rem' }}>
                Faltan {fmtCorte(ev.faltante)} para llegar al colchón recomendado.
              </span>
            )}
            {ev.nivel === 'ok' && (
              <span style={{ display: 'block', fontWeight: 500, fontSize: '0.8rem' }}>
                Quedan {fmtCorte(ev.sobrante)} por encima del colchón.
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.3rem 0.75rem', fontSize: '0.85rem' }}>
            <span className="muted">Caja antes de recolectar</span>
            <strong>{fmtCorte(cajaAntes)}</strong>
            <span className="muted">Colchón recomendado ({colchon.dias} d)</span>
            <strong>{fmtCorte(colchon.colchon)}</strong>
            <span className="muted">Máximo recomendable a recolectar</span>
            <strong style={{ color: 'var(--brand-blue)' }}>{fmtCorte(max)}</strong>
            <span className="muted">Caja que quedaría</span>
            <strong style={{ color: estilo.color }}>{fmtCorte(cajaActual)}</strong>
          </div>
          {puedeEditar && max != null && max > 0 && Math.abs((Number(montoRecoleccion) || 0) - max) > 0.009 && (
            <button type="button" className="btn btn-ghost" style={{ marginTop: '0.6rem', width: '100%' }} onClick={() => onUsarMaximo?.(max)}>
              Usar máximo recomendable ({fmtCorte(max)})
            </button>
          )}
          <details style={{ marginTop: '0.6rem', fontSize: '0.78rem' }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>Cómo se calcula</summary>
            <p className="muted" style={{ margin: '0.4rem 0' }}>
              Con los últimos {colchon.muestras} días de cierres: gasto esperado de cada día (percentil 75 del mismo día de la
              semana) menos la venta en efectivo que entra (venta − tarjeta − faltante), más {Math.round(colchon.margen * 100)}% de margen.
            </p>
            <table style={{ width: '100%', fontSize: '0.76rem' }}>
              <thead>
                <tr><th align="left">Día</th><th align="right">Gasto esperado</th><th align="right">Venta efectivo</th></tr>
              </thead>
              <tbody>
                {colchon.detalle.map((d) => (
                  <tr key={d.dow}>
                    <td>{d.dia}</td>
                    <td align="right">{fmtCorte(d.gasto)}</td>
                    <td align="right">{fmtCorte(d.venta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          {veces != null && veces.negativos > 0 && (
            <p className="muted" style={{ fontSize: '0.76rem', margin: '0.6rem 0 0' }}>
              En los últimos 90 días la caja cerró en negativo {veces.negativos} de {veces.cierres} cierres
              {veces.recSeguidasNegativo > 0 ? `; ${veces.recSeguidasNegativo} de ${veces.recolecciones} recolecciones fueron seguidas de negativo en menos de 3 días` : ''}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
