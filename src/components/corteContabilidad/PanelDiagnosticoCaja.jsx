import React, { useMemo, useState } from 'react';
import { fmtCorte } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import { fmtYmdEs, hoyYmdNogales } from '../../lib/corteCaja.js';
import {
  CAUSAS_NEGATIVO,
  analizarNegativos,
  filasUltimosDias,
  perfilDiario,
} from '../../lib/corteContabilidad/analisisCajaAbarrotes.js';

function lecturas(resumen, eventos) {
  const out = [];
  if (!resumen.negativos) return out;
  const peorDia = [...resumen.porDia].sort((a, b) => b.eventos - a.eventos)[0];
  if (peorDia?.eventos > 0) {
    out.push(`El día con más cierres en negativo es ${peorDia.dia} (${peorDia.eventos} de ${peorDia.cierres} cierres).`);
  }
  const causas = Object.entries(resumen.porCausa).sort((a, b) => b[1] - a[1]);
  if (causas.length) {
    out.push(`Causa más frecuente: ${CAUSAS_NEGATIVO[causas[0][0]] || causas[0][0]} (${causas[0][1]} de ${resumen.negativos} negativos).`);
  }
  const trasRec = eventos.filter((e) => e.recoleccionPrevia && e.recoleccionPrevia.diasAntes <= 3).length;
  if (trasRec > 0) {
    out.push(`${trasRec} de ${resumen.negativos} negativos ocurrieron 3 días o menos después de una recolección.`);
  }
  if (resumen.recolecciones > 0 && resumen.recSeguidasNegativo > 0) {
    out.push(`${resumen.recSeguidasNegativo} de ${resumen.recolecciones} recolecciones fueron seguidas de un cierre en negativo${resumen.diasHastaNegativoProm != null ? ` (en promedio a los ${resumen.diasHastaNegativoProm} días)` : ''}.`);
  }
  if (resumen.recBajoColchon > 0) {
    out.push(`${resumen.recBajoColchon} recolección(es) se hicieron aun sabiendo que dejaban la caja bajo el colchón.`);
  }
  return out;
}

function Tarjeta({ titulo, valor, nota, peligro = false }) {
  return (
    <div className="card" style={{ padding: '0.6rem 0.75rem' }}>
      <div className="muted" style={{ fontSize: '0.74rem' }}>{titulo}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: peligro ? 'var(--danger)' : undefined }}>{valor}</div>
      {nota && <div className="muted" style={{ fontSize: '0.72rem' }}>{nota}</div>}
    </div>
  );
}

/**
 * Diagnóstico de caja chica de Abarrotes: cuándo y por qué cierra en negativo.
 * Solo lectura; usa los cierres y recolecciones ya guardados.
 */
export default function PanelDiagnosticoCaja({ filas = [], cargando = false, error = '', onRecargar }) {
  const [abierto, setAbierto] = useState(false);
  const [rango, setRango] = useState(7);

  const filasRango = useMemo(() => filasUltimosDias(filas, hoyYmdNogales(), rango), [filas, rango]);
  const { eventos, resumen } = useMemo(() => analizarNegativos(filasRango), [filasRango]);
  const perfil = useMemo(() => perfilDiario(filasRango), [filasRango]);
  const frases = useMemo(() => lecturas(resumen, eventos), [resumen, eventos]);
  const causas = Object.entries(resumen.porCausa).sort((a, b) => b[1] - a[1]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div>
          <h4 style={{ margin: 0 }}>Diagnóstico de caja negativa</h4>
          <div className="muted" style={{ fontSize: '0.78rem' }}>Cuándo y por qué la caja de Abarrotes cierra en negativo</div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setAbierto((v) => !v)}>
          {abierto ? 'Ocultar' : 'Ver diagnóstico'}
        </button>
      </div>

      {abierto && (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: '0.8rem' }}>Periodo</span>
            {[7, 30, 60, 90].map((d) => (
              <button key={d} type="button" className={rango === d ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setRango(d)}>
                {d} días
              </button>
            ))}
            <button type="button" className="btn btn-ghost" onClick={onRecargar} disabled={cargando}>
              {cargando ? 'Cargando…' : 'Actualizar'}
            </button>
          </div>

          {error && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', margin: 0 }}>{error}</p>}

          {!resumen.cierres ? (
            <p className="muted" style={{ fontSize: '0.84rem', margin: 0 }}>
              {cargando ? 'Cargando cierres…' : 'No hay cierres de Abarrotes en este periodo para analizar.'}
            </p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.6rem' }}>
                <Tarjeta titulo="Cierres analizados" valor={resumen.cierres} nota={`${resumen.recolecciones} recolecciones`} />
                <Tarjeta
                  titulo="Cierres en negativo"
                  valor={`${resumen.negativos} (${resumen.pctNegativos}%)`}
                  peligro={resumen.negativos > 0}
                />
                <Tarjeta
                  titulo="Peor caja"
                  valor={resumen.negativos ? fmtCorte(resumen.peorCaja) : '—'}
                  nota={resumen.negativos ? `Faltaron ${fmtCorte(resumen.faltaronPromedio)} en promedio` : ''}
                  peligro={resumen.negativos > 0}
                />
                <Tarjeta
                  titulo="Recolecciones seguidas de negativo"
                  valor={`${resumen.recSeguidasNegativo} de ${resumen.recolecciones}`}
                  nota="Dentro de los 3 días siguientes"
                />
              </div>

              {frases.length > 0 && (
                <div style={{ background: 'rgba(243,156,18,0.12)', borderRadius: 6, padding: '0.6rem 0.75rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Lo que muestran los datos</div>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.83rem' }}>
                    {frases.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                </div>
              )}
              {!resumen.negativos && (
                <p style={{ margin: 0, fontSize: '0.84rem', color: '#1e8449' }}>
                  No hubo cierres en negativo en este periodo.
                </p>
              )}

              <div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>Cuándo: por día de la semana</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr className="muted" style={{ textAlign: 'right' }}>
                        <th align="left">Día</th>
                        <th>Cierres</th>
                        <th>En negativo</th>
                        <th>Faltante acum.</th>
                        <th>Gasto prom./día</th>
                        <th>Venta efectivo prom./día</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumen.porDia.map((d) => {
                        const p = perfil.porDow[d.dow];
                        return (
                          <tr key={d.dow} style={{ textAlign: 'right', background: d.eventos > 0 ? 'rgba(192,57,43,0.07)' : undefined }}>
                            <td align="left">{d.dia}</td>
                            <td>{d.cierres}</td>
                            <td style={{ color: d.eventos > 0 ? 'var(--danger)' : undefined, fontWeight: d.eventos > 0 ? 700 : 400 }}>{d.eventos}</td>
                            <td>{d.faltaron > 0 ? fmtCorte(d.faltaron) : '—'}</td>
                            <td>{p.n ? fmtCorte(p.gastoProm) : '—'}</td>
                            <td>{p.n ? fmtCorte(p.ventaEfProm) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {resumen.negativos > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.9rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>Por qué: causas</div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem' }}>
                      {causas.map(([id, n]) => (
                        <li key={id}>{CAUSAS_NEGATIVO[id] || id}: <strong>{n}</strong></li>
                      ))}
                    </ul>
                    <div className="muted" style={{ fontSize: '0.72rem', marginTop: '0.3rem' }}>Un cierre puede tener varias causas.</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>Gastos más grandes en los negativos</div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem' }}>
                      {resumen.gastosEnNegativos.map((g) => (
                        <li key={g.nombre}>{g.nombre}: <strong>{fmtCorte(g.monto)}</strong></li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {eventos.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>Cada cierre en negativo</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr className="muted">
                          <th align="left">Fecha</th>
                          <th align="left">Turno</th>
                          <th align="right">Caja</th>
                          <th align="right">Caja al iniciar</th>
                          <th align="right">Venta efectivo</th>
                          <th align="right">Gastos</th>
                          <th align="left">Mayor gasto</th>
                          <th align="left">Recolección previa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eventos.slice(0, 20).map((e) => (
                          <tr key={`${e.fecha}-${e.turno}-${e.folio}`} style={{ borderTop: '1px solid var(--border)' }}>
                            <td>{fmtYmdEs(e.fecha)} <span className="muted">{e.dia.slice(0, 3)}</span></td>
                            <td>{e.turno}</td>
                            <td align="right" style={{ color: 'var(--danger)', fontWeight: 700 }}>{fmtCorte(e.caja)}</td>
                            <td align="right">{fmtCorte(e.cajaInicio)}</td>
                            <td align="right">{fmtCorte(e.ventaEfectivo)}</td>
                            <td align="right">{fmtCorte(e.gastos)}</td>
                            <td>{e.topGastos[0] ? `${e.topGastos[0].nombre} ${fmtCorte(e.topGastos[0].monto)}` : '—'}</td>
                            <td>
                              {e.recoleccionPrevia
                                ? `${fmtCorte(e.recoleccionPrevia.monto)} hace ${e.recoleccionPrevia.diasAntes} d (quedó ${fmtCorte(e.recoleccionPrevia.cajaDespues)})${e.recoleccionPrevia.bajoColchon ? ' · bajo colchón' : ''}`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {eventos.length > 20 && <div className="muted" style={{ fontSize: '0.72rem' }}>Mostrando los 20 más recientes de {eventos.length}.</div>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
