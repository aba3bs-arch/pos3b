import React from 'react';
import { hoyYmdNogales } from '../../lib/corteCaja.js';
import { fmtCorte } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import {
  evaluarRecoleccion,
  limiteRecoleccionPorcentaje,
  maximoCobroCredito,
  maximoRecolectable,
  redondearRecoleccion,
} from '../../lib/corteContabilidad/analisisCajaAbarrotes.js';

const DIAS_SEMANA = [
  { dow: 1, nombre: 'Lunes' },
  { dow: 2, nombre: 'Martes' },
  { dow: 3, nombre: 'Miércoles' },
  { dow: 4, nombre: 'Jueves' },
  { dow: 5, nombre: 'Viernes' },
  { dow: 6, nombre: 'Sábado' },
  { dow: 0, nombre: 'Domingo' },
];

const NIVELES = {
  ok: { color: '#1e8449', fondo: 'rgba(39,174,96,0.12)', titulo: 'Recolección segura' },
  bajo: { color: '#b9770e', fondo: 'rgba(243,156,18,0.16)', titulo: 'Recolección deja la caja corta' },
  negativo: { color: 'var(--danger)', fondo: 'rgba(192,57,43,0.14)', titulo: 'Recolección deja la caja en negativo' },
  sin_datos: { color: 'var(--muted)', fondo: 'transparent', titulo: 'Sin historial suficiente' },
};

/**
 * Qué recolectar: cuánta caja debe quedar para llegar al próximo día fuerte (cobros de crédito del
 * repartidor, nómina) sin caer a negativo, según el historial de esta tienda.
 */
export default function ColchonRecoleccion({
  colchon,
  cajaActual,
  montoRecoleccion,
  diasColchon,
  onCambiarDias,
  ventanaColchon = 7,
  onCambiarVentana,
  reglas = null,
  onCambiarReglas,
  onUsarMaximo,
  puedeEditar = true,
  cargando = false,
  veces = null,
}) {
  const cajaAntes = Math.round(((Number(cajaActual) || 0) + (Number(montoRecoleccion) || 0)) * 100) / 100;
  const valorColchon = colchon ? colchon.colchon : null;
  const ev = evaluarRecoleccion({ cajaDespues: cajaActual, colchon: valorColchon });
  const maxExacto = maximoRecolectable({ cajaAntes, colchon: valorColchon });
  const recomendado = maxExacto == null ? null : redondearRecoleccion(maxExacto);
  const cobroCredito = colchon
    ? redondearRecoleccion(maximoCobroCredito({ cajaActual, colchonSinCredito: colchon.colchonSinCredito }))
    : null;
  const limite = limiteRecoleccionPorcentaje({ hoyYmd: hoyYmdNogales(), cajaAntes, reglas: reglas || {} });
  const excedeLimite = limite.aplica && (Number(montoRecoleccion) || 0) > limite.maximo + 0.009;
  const nivel = limite.aplica ? (excedeLimite ? 'bajo' : 'ok') : ev.nivel;
  const estilo = NIVELES[nivel] || NIVELES.sin_datos;
  const montoSugerido = limite.aplica ? limite.recomendado : recomendado;
  const fuerte = colchon?.proximoFuerte;

  return (
    <div className="card" style={{ borderLeft: `4px solid ${estilo.color}` }}>
      <h4 style={{ margin: 0 }}>Qué recolectar</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.75rem', marginTop: '0.3rem' }}>
        <label className="muted" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          Cubrir
          <select
            className="select"
            style={{ padding: '0.1rem 0.25rem', fontSize: '0.78rem' }}
            value={diasColchon}
            onChange={(e) => onCambiarDias?.(Number(e.target.value))}
          >
            <option value={0}>hasta el próximo día fuerte</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n} día{n > 1 ? 's' : ''}</option>
            ))}
          </select>
        </label>
        <label className="muted" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          Gasto normal de los últimos
          <select
            className="select"
            style={{ padding: '0.1rem 0.25rem', fontSize: '0.78rem' }}
            value={ventanaColchon}
            onChange={(e) => onCambiarVentana?.(Number(e.target.value))}
          >
            {[7, 14, 30].map((n) => (
              <option key={n} value={n}>{n} días</option>
            ))}
          </select>
        </label>
      </div>

      {!colchon ? (
        <p className="muted" style={{ fontSize: '0.82rem', margin: '0.5rem 0 0' }}>
          {cargando
            ? 'Calculando con el historial de cierres…'
            : `Aún no hay suficientes días con cierres en los últimos ${ventanaColchon} días para calcular el colchón.`}
        </p>
      ) : (
        <>
          <div style={{ background: 'rgba(30,80,160,0.08)', borderRadius: 8, padding: '0.7rem 0.8rem', margin: '0.6rem 0', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: '0.78rem' }}>
              {limite.aplica ? `Hoy es ${limite.dia}: solo se puede recolectar el ${limite.pct}% de la caja` : 'Recolecta hoy como máximo'}
            </div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--brand-blue)' }}>{fmtCorte(montoSugerido)}</div>
            <div className="muted" style={{ fontSize: '0.78rem' }}>
              {limite.aplica
                ? `Quedan ${fmtCorte(limite.dejaEnCaja)} (${100 - limite.pct}% de ${fmtCorte(cajaAntes)}) más la venta del turno en curso y del nocturno para el día siguiente.`
                : montoSugerido > 0
                  ? `Deja en caja al menos ${fmtCorte(colchon.colchon)}${fuerte && colchon.hastaFuerte ? ` para llegar al ${fuerte.dia.toLowerCase()}` : ` para los próximos ${colchon.dias} día${colchon.dias > 1 ? 's' : ''}`}.`
                  : `No recolectes: la caja (${fmtCorte(cajaAntes)}) no alcanza el colchón de ${fmtCorte(colchon.colchon)}.`}
            </div>
            {puedeEditar && montoSugerido > 0 && Math.abs((Number(montoRecoleccion) || 0) - montoSugerido) > 0.009 && (
              <button type="button" className="btn btn-primary" style={{ marginTop: '0.5rem', width: '100%' }} onClick={() => onUsarMaximo?.(montoSugerido)}>
                Poner {fmtCorte(montoSugerido)} en Recolección
              </button>
            )}
          </div>

          <p style={{ fontSize: '0.82rem', margin: '0 0 0.5rem' }}>
            <strong>Cobro de crédito:</strong>{' '}
            {cobroCredito > 0
              ? `la caja aguanta cobrar hasta ${fmtCorte(cobroCredito)} de crédito sin pasarse de lo que necesitan proveedores y nómina.`
              : 'con esta caja un cobro de crédito la deja corta para proveedores y nómina.'}
            {colchon.colchon > colchon.colchonSinCredito + 0.009 && (
              <span className="muted"> Ya hay {fmtCorte(colchon.colchon - colchon.colchonSinCredito)} reservados para los cobros de crédito esperados.</span>
            )}
          </p>

          {fuerte && (
            <p style={{ fontSize: '0.8rem', margin: '0 0 0.5rem' }}>
              <strong>Próximo día fuerte: {fuerte.dia}</strong> (en {fuerte.enDias} día{fuerte.enDias > 1 ? 's' : ''})
              {fuerte.proveedores > 0 && <> · proveedores ≈ {fmtCorte(fuerte.proveedores)}</>}
              {fuerte.credito > 0 && <> · cobros de crédito del repartidor ≈ {fmtCorte(fuerte.credito)}</>}
              {fuerte.nomina > 0 && <> · nómina ≈ {fmtCorte(fuerte.nomina)}</>}
            </p>
          )}

          <div style={{ background: estilo.fondo, color: estilo.color, borderRadius: 6, padding: '0.4rem 0.6rem', margin: '0 0 0.6rem', fontWeight: 700, fontSize: '0.85rem' }}>
            {limite.aplica ? (excedeLimite ? `Supera el límite del ${limite.pct}%` : 'Dentro del límite de recolección') : estilo.titulo}
            {limite.aplica && excedeLimite && (
              <span style={{ display: 'block', fontWeight: 500, fontSize: '0.78rem' }}>
                Máximo permitido hoy: {fmtCorte(limite.maximo)}.
              </span>
            )}
            {!limite.aplica && ev.nivel !== 'ok' && ev.nivel !== 'sin_datos' && (
              <span style={{ display: 'block', fontWeight: 500, fontSize: '0.78rem' }}>
                Faltan {fmtCorte(ev.faltante)} para llegar al colchón recomendado.
              </span>
            )}
            {!limite.aplica && ev.nivel === 'ok' && (
              <span style={{ display: 'block', fontWeight: 500, fontSize: '0.78rem' }}>
                Quedan {fmtCorte(ev.sobrante)} por encima del colchón.
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.3rem 0.75rem', fontSize: '0.85rem' }}>
            <span className="muted">Caja antes de recolectar</span>
            <strong>{fmtCorte(cajaAntes)}</strong>
            <span className="muted">Colchón recomendado</span>
            <strong>{fmtCorte(colchon.colchon)}</strong>
            <span className="muted">Caja que quedaría</span>
            <strong style={{ color: estilo.color }}>{fmtCorte(cajaActual)}</strong>
          </div>

          {puedeEditar && reglas && (
            <details style={{ marginTop: '0.7rem', fontSize: '0.8rem' }}>
              <summary className="muted" style={{ cursor: 'pointer' }}>Límite por porcentaje y pagos fijos</summary>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.4rem 0.6rem', alignItems: 'center', marginTop: '0.5rem' }}>
                <span className="muted">Límite de recolección</span>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <input
                      type="checkbox"
                      checked={reglas.limiteActivo !== false}
                      onChange={(e) => onCambiarReglas?.({ limiteActivo: e.target.checked })}
                    />
                    Activo
                  </label>
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    min="1"
                    max="99"
                    style={{ width: 70 }}
                    value={reglas.limitePct ?? 60}
                    onChange={(e) => onCambiarReglas?.({ limitePct: Number(e.target.value) || 0 })}
                  />
                  <span className="muted">% de la caja en:</span>
                  {DIAS_SEMANA.map((d) => (
                    <label key={d.dow} style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                      <input
                        type="checkbox"
                        checked={(reglas.limiteDias || []).includes(d.dow)}
                        onChange={(e) => {
                          const set = new Set(reglas.limiteDias || []);
                          if (e.target.checked) set.add(d.dow); else set.delete(d.dow);
                          onCambiarReglas?.({ limiteDias: [...set] });
                        }}
                      />
                      {d.nombre.slice(0, 3)}
                    </label>
                  ))}
                </div>
                <span className="muted">Proveedores</span>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <select
                    className="select"
                    value={reglas.proveedoresDow ?? ''}
                    onChange={(e) => onCambiarReglas?.({ proveedoresDow: e.target.value === '' ? null : Number(e.target.value) })}
                  >
                    <option value="">Sin día fijo</option>
                    {DIAS_SEMANA.map((d) => <option key={d.dow} value={d.dow}>{d.nombre}</option>)}
                  </select>
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    style={{ width: 130 }}
                    placeholder="Auto (historial)"
                    value={reglas.proveedoresMonto || ''}
                    onChange={(e) => onCambiarReglas?.({ proveedoresMonto: Number(e.target.value) || 0 })}
                  />
                </div>
                <span className="muted">Nómina</span>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <select
                    className="select"
                    value={reglas.nominaDow ?? ''}
                    onChange={(e) => onCambiarReglas?.({ nominaDow: e.target.value === '' ? null : Number(e.target.value) })}
                  >
                    <option value="">Sin día fijo</option>
                    {DIAS_SEMANA.map((d) => <option key={d.dow} value={d.dow}>{d.nombre}</option>)}
                  </select>
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    style={{ width: 110 }}
                    placeholder="Por turno"
                    value={reglas.nominaMonto || ''}
                    onChange={(e) => onCambiarReglas?.({ nominaMonto: Number(e.target.value) || 0 })}
                  />
                  <select
                    className="select"
                    value={reglas.nominaTurnos}
                    onChange={(e) => onCambiarReglas?.({ nominaTurnos: Number(e.target.value) })}
                  >
                    <option value={1}>1 turno</option>
                    <option value={2}>2 turnos (diurno y nocturno)</option>
                  </select>
                </div>
              </div>
              <p className="muted" style={{ margin: '0.4rem 0 0', fontSize: '0.75rem' }}>
                La nómina es el máximo por turno; el turno nocturno la paga en su propio corte, por eso con 2 turnos se reserva doble ese día.
                Proveedores sin monto usa el pago típico de ese día en las últimas 4 semanas
                {colchon.reglaProveedores ? ` (ahora: ${fmtCorte(colchon.proveedoresMontoUsado)})` : ''}.
              </p>
            </details>
          )}

          <details style={{ marginTop: '0.6rem', fontSize: '0.78rem' }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>Cómo se calcula</summary>
            <p className="muted" style={{ margin: '0.4rem 0' }}>
              Se suman las salidas de cada día hasta el próximo día fuerte: gasto normal (de los últimos {colchon.ventana || colchon.muestras} días),
              pago de proveedores y nómina de los días fijos configurados, y cobros de crédito del repartidor (historial de las últimas 4 semanas, solo si se repiten
              ese día de la semana). Hoy solo cuenta lo fuerte que aún falta por registrar. El colchón es el punto más bajo que tocaría la caja, descontando la venta en efectivo
              (venta − tarjeta − faltante), más {Math.round(colchon.margen * 100)}% de margen.
            </p>
            <table style={{ width: '100%', fontSize: '0.76rem' }}>
              <thead>
                <tr>
                  <th align="left">Día</th>
                  <th align="right">Gasto normal</th>
                  <th align="right">Proveedores</th>
                  <th align="right">Cobros crédito</th>
                  <th align="right">Nómina</th>
                  <th align="right">Venta efec.</th>
                </tr>
              </thead>
              <tbody>
                {colchon.detalle.map((d) => (
                  <tr key={d.k}>
                    <td>{d.dia}</td>
                    <td align="right">{fmtCorte(d.base)}</td>
                    <td align="right">{d.proveedores > 0 ? fmtCorte(d.proveedores) : '—'}</td>
                    <td align="right">{d.credito > 0 ? fmtCorte(d.credito) : '—'}</td>
                    <td align="right">{d.nomina > 0 ? fmtCorte(d.nomina) : '—'}</td>
                    <td align="right">{fmtCorte(d.venta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {colchon.fuertesDetectados?.length > 0 ? (
              <p className="muted" style={{ margin: '0.4rem 0 0' }}>
                Días fuertes detectados: {colchon.fuertesDetectados.map((f) => `${f.dia}${f.credito > 0 ? ` (crédito ≈ ${fmtCorte(f.credito)})` : ''}${f.nomina > 0 ? ` (nómina ≈ ${fmtCorte(f.nomina)})` : ''}`).join(' · ')}.
              </p>
            ) : (
              <p className="muted" style={{ margin: '0.4rem 0 0' }}>
                No se detectaron cobros de crédito ni nómina que se repitan el mismo día de la semana; se cubren 2 días de gasto normal.
              </p>
            )}
          </details>
          {veces != null && veces.negativos > 0 && (
            <p className="muted" style={{ fontSize: '0.76rem', margin: '0.6rem 0 0' }}>
              En los últimos {ventanaColchon} días la caja cerró en negativo {veces.negativos} de {veces.cierres} cierres
              {veces.recSeguidasNegativo > 0 ? `; ${veces.recSeguidasNegativo} de ${veces.recolecciones} recolecciones fueron seguidas de negativo en menos de 3 días` : ''}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
