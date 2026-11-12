import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { etiquetaTienda, listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
import { cargarContAbarrotes } from '../lib/contVirtualData.js';
import { hoyYmdNogales } from '../lib/corteCaja.js';
import {
  construirLibroDiario,
  desplazarSemana,
  dinero,
  etiquetaSemana,
  htmlLibroDiarioImprimible,
  resumenLibroPorTienda,
  semanaDeFecha,
} from '../lib/libroDiarioAbarrotes.js';

const VERDE = '#15803d';
const ROJO = '#b91c1c';
const TODAS = 'todas';

function colorResultado(n) {
  if (n > 0.004) return VERDE;
  if (n < -0.004) return ROJO;
  return '#475569';
}

function Kpi({ titulo, valor, color, nota }) {
  return (
    <div className="card" style={{ flex: '1 1 160px', minWidth: 150, padding: '0.7rem 0.9rem' }}>
      <div className="muted" style={{ fontSize: '0.78rem' }}>{titulo}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700, color }}>{valor}</div>
      {nota ? <div className="muted" style={{ fontSize: '0.74rem' }}>{nota}</div> : null}
    </div>
  );
}

function LineaMovimiento({ signo, texto, detalle, monto, color }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '0.75rem',
        padding: '0.3rem 0',
        borderBottom: '1px dashed rgba(100,116,139,0.25)',
        fontSize: '0.88rem',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <span style={{ color, fontWeight: 700, marginRight: 6 }}>{signo}</span>
        {texto}
        {detalle ? <div className="muted" style={{ fontSize: '0.74rem', marginLeft: 16 }}>{detalle}</div> : null}
      </div>
      <div style={{ color, fontWeight: 600, whiteSpace: 'nowrap' }}>{dinero(monto)}</div>
    </div>
  );
}

function TarjetaDia({ dia, abierto, onToggle }) {
  const color = colorResultado(dia.resultado);
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${dia.sinMovimiento ? '#cbd5e1' : color}` }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        style={{
          width: '100%',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.4rem 1rem',
          padding: '0.65rem 0.9rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
          color: 'inherit',
        }}
      >
        <div style={{ flex: '1 1 150px' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{dia.nombre} {dia.corta}</div>
          {dia.sinMovimiento ? <div className="muted" style={{ fontSize: '0.78rem' }}>Sin movimientos</div> : null}
        </div>
        {!dia.sinMovimiento && (
          <>
            <div style={{ fontSize: '0.84rem' }}>
              <span className="muted">Entró </span>
              <b style={{ color: VERDE }}>{dinero(dia.totalIngresos)}</b>
            </div>
            <div style={{ fontSize: '0.84rem' }}>
              <span className="muted">Salió </span>
              <b style={{ color: ROJO }}>{dinero(dia.totalGastos)}</b>
            </div>
            <div style={{ fontSize: '0.9rem' }}>
              <span className="muted">Resultado </span>
              <b style={{ color }}>{dinero(dia.resultado)}</b>
            </div>
          </>
        )}
        <span aria-hidden style={{ marginLeft: 'auto', color: '#64748b' }}>{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && !dia.sinMovimiento && (
        <div style={{ padding: '0 0.9rem 0.8rem' }}>
          <div style={{ fontWeight: 700, color: VERDE, fontSize: '0.82rem', margin: '0.3rem 0 0.1rem' }}>
            ENTRADAS · lo que se vendió / ingresó
          </div>
          {dia.ventas.length === 0 && dia.otrosIngresos.length === 0 && (
            <div className="muted" style={{ fontSize: '0.82rem' }}>No hubo ventas registradas este día.</div>
          )}
          {dia.ventas.map((v) => (
            <LineaMovimiento
              key={v.id}
              signo="+"
              texto={v.concepto}
              detalle={v.empleado ? `Cajero: ${v.empleado}` : ''}
              monto={v.monto}
              color={VERDE}
            />
          ))}
          {dia.otrosIngresos.map((v) => (
            <LineaMovimiento key={v.id} signo="+" texto={v.concepto} detalle={v.empleado ? `Registró: ${v.empleado}` : ''} monto={v.monto} color={VERDE} />
          ))}

          <div style={{ fontWeight: 700, color: ROJO, fontSize: '0.82rem', margin: '0.7rem 0 0.1rem' }}>
            SALIDAS · lo que se gastó
          </div>
          {dia.gastos.length === 0 && <div className="muted" style={{ fontSize: '0.82rem' }}>No hubo gastos en los cortes de este día.</div>}
          {dia.gastos.map((g) => (
            <LineaMovimiento
              key={g.id}
              signo="−"
              texto={`${g.categoria}${g.subcategoria ? ` › ${g.subcategoria}` : ''}`}
              detalle={[g.concepto !== g.subcategoria ? g.concepto : '', g.empleado ? `Persona: ${g.empleado}` : ''].filter(Boolean).join(' · ')}
              monto={g.monto}
              color={ROJO}
            />
          ))}

          {dia.cortes.length > 0 && (
            <div style={{ margin: '0.7rem 0 0.1rem' }}>
              <div style={{ fontWeight: 700, color: '#334155', fontSize: '0.82rem' }}>
                CAJA CHICA · cómo cierra cada corte (igual que el ticket)
              </div>
              {dia.cortes.map((c) => (
                <div key={c.id} style={{ fontSize: '0.8rem', padding: '0.25rem 0', borderBottom: '1px dashed rgba(100,116,139,0.25)' }}>
                  <b>{c.folio}</b>{c.turno ? ` · ${c.turno}` : ''}{c.cajero ? ` · ${c.cajero}` : ''}
                  <div className="muted">
                    Caja anterior {dinero(c.cajaAnterior)} + venta en efectivo {dinero(c.ventaEfectivo)} − gastos {dinero(c.gastos)}
                    {' = '}<b style={{ color: colorResultado(c.cajaActual) }}>{dinero(c.cajaActual)}</b>
                    {c.cuadra ? '' : <span style={{ color: ROJO }}> · (calculado {dinero(c.cajaCalculada)}, revisa este corte)</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {dia.enCurso.length > 0 && (
            <div style={{ margin: '0.7rem 0 0.1rem', padding: '0.45rem 0.6rem', borderRadius: 6, background: '#fffbeb', border: '1px solid #fcd34d' }}>
              <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.82rem' }}>
                TURNO EN CURSO · gastos aún sin corte ({dinero(dia.totalEnCurso)})
              </div>
              <div className="muted" style={{ fontSize: '0.74rem', marginBottom: '0.2rem' }}>
                No cuentan en el resultado hasta que se cierre el corte; entonces pasan a SALIDAS.
              </div>
              {dia.enCurso.map((g) => (
                <LineaMovimiento
                  key={g.id}
                  signo="·"
                  texto={`${g.categoria}${g.subcategoria ? ` › ${g.subcategoria}` : ''}`}
                  detalle={[g.concepto !== g.subcategoria ? g.concepto : '', g.empleado ? `Persona: ${g.empleado}` : ''].filter(Boolean).join(' · ')}
                  monto={g.monto}
                  color="#92400e"
                />
              ))}
            </div>
          )}

          {dia.otrosEgresos.length > 0 && (
            <div style={{ margin: '0.7rem 0 0.1rem', padding: '0.45rem 0.6rem', borderRadius: 6, background: '#f1f5f9', border: '1px solid #cbd5e1' }}>
              <div style={{ fontWeight: 700, color: '#334155', fontSize: '0.82rem' }}>
                OTROS EGRESOS DE IE · no salen de la caja del corte ({dinero(dia.totalOtrosEgresos)})
              </div>
              <div className="muted" style={{ fontSize: '0.74rem', marginBottom: '0.2rem' }}>
                Vales, evidencias, préstamos o capturas manuales en IE. No se restan del resultado del día.
              </div>
              {dia.otrosEgresos.map((g) => (
                <LineaMovimiento
                  key={g.id}
                  signo="·"
                  texto={`${g.categoria}${g.subcategoria ? ` › ${g.subcategoria}` : ''}`}
                  detalle={[g.concepto !== g.subcategoria ? g.concepto : '', g.empleado ? `Persona: ${g.empleado}` : ''].filter(Boolean).join(' · ')}
                  monto={g.monto}
                  color="#475569"
                />
              ))}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              gap: '0.4rem 1rem',
              marginTop: '0.6rem',
              paddingTop: '0.45rem',
              borderTop: '2px solid rgba(100,116,139,0.35)',
              fontSize: '0.88rem',
            }}
          >
            <span>
              Resultado del día: <b style={{ color }}>{dinero(dia.resultado)}</b>
            </span>
            <span className="muted">
              Acumulado de la semana: <b style={{ color: colorResultado(dia.acumulado) }}>{dinero(dia.acumulado)}</b>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LibroDiario({ supabase, sucursal }) {
  const tiendas = useMemo(() => listarSucursalesOperativas(), []);
  const inicial = normalizarCodigoTienda(sucursal);
  const [tienda, setTienda] = useState(tiendas.includes(inicial) ? inicial : TODAS);
  const [semana, setSemana] = useState(() => semanaDeFecha(hoyYmdNogales()));
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [datos, setDatos] = useState(null);
  const [abiertos, setAbiertos] = useState({});
  const peticion = useRef(0);

  const semanaActual = useMemo(() => semanaDeFecha(hoyYmdNogales()), []);
  const esActual = semana.inicio === semanaActual.inicio;
  const esFutura = semana.inicio > semanaActual.inicio;

  const cargar = useCallback(async () => {
    if (!supabase) {
      setError('Sin conexión a Supabase.');
      return;
    }
    const id = ++peticion.current;
    setCargando(true);
    setError('');
    const res = await cargarContAbarrotes(supabase, {
      desde: semana.inicio,
      hasta: semana.fin,
      sucursal: tienda === TODAS ? null : tienda,
      limiteDetalle: 4000,
    });
    if (id !== peticion.current) return;
    setCargando(false);
    if (!res?.ok) {
      setDatos(null);
      setError(res?.error || 'No se pudo cargar el libro.');
      return;
    }
    setDatos(res);
  }, [supabase, semana.inicio, semana.fin, tienda]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const libro = useMemo(() => {
    if (!datos || tienda === TODAS) return null;
    return construirLibroDiario({
      desde: semana.inicio,
      hasta: semana.fin,
      ingresos: datos.ingresosPorDia || [],
      cortes: datos.cortesLibro || [],
      enCurso: datos.gastosEnCurso || [],
      otros: datos.egresosOtrosIe || [],
    });
  }, [datos, tienda, semana.inicio, semana.fin]);

  const resumenTiendas = useMemo(() => {
    if (!datos || tienda !== TODAS) return null;
    const porTienda = resumenLibroPorTienda(
      {
        ingresos: datos.ingresosPorDia || [],
        cortes: datos.cortesLibro || [],
        enCurso: datos.gastosEnCurso || [],
        otros: datos.egresosOtrosIe || [],
      },
      tiendas,
    );
    const filas = tiendas.map((id) => {
      const f = porTienda.find((x) => x.id === id) || { ingresos: 0, gastos: 0, enCurso: 0, otros: 0, resultado: 0 };
      return { ...f, id, label: etiquetaTienda(id) };
    });
    const r2 = (n) => Math.round(n * 100) / 100;
    const total = filas.reduce(
      (a, f) => ({ ingresos: a.ingresos + f.ingresos, gastos: a.gastos + f.gastos, enCurso: a.enCurso + f.enCurso, otros: a.otros + f.otros }),
      { ingresos: 0, gastos: 0, enCurso: 0, otros: 0 },
    );
    return { filas, total: { ...total, resultado: r2(total.ingresos - total.gastos) } };
  }, [datos, tienda, tiendas]);

  const alternarDia = (fecha) => setAbiertos((p) => ({ ...p, [fecha]: !p[fecha] }));
  const estaAbierto = (dia) => (abiertos[dia.fecha] ?? !dia.sinMovimiento);
  const expandirTodo = (valor) => {
    if (!libro) return;
    setAbiertos(Object.fromEntries(libro.dias.map((d) => [d.fecha, valor])));
  };

  const imprimir = () => {
    if (!libro) return;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) {
      alert('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e intenta de nuevo.');
      return;
    }
    w.document.write(
      htmlLibroDiarioImprimible(libro, {
        tienda: etiquetaTienda(tienda),
        semana: etiquetaSemana(semana.inicio, semana.fin),
      }),
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  const t = libro?.totales;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#b5a642' }}>Libro diario · Abarrotes</h2>
        <p className="muted" style={{ margin: '0.3rem 0 0', fontSize: '0.86rem' }}>
          Día por día de la semana (sábado a viernes): lo que <b style={{ color: VERDE }}>entró</b> por ventas y lo que{' '}
          <b style={{ color: ROJO }}>salió</b> por gastos, con el resultado de cada día.
        </p>
      </div>

      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem 0.9rem', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.82rem' }}>
          Tienda
          <select className="select" value={tienda} onChange={(e) => { setTienda(e.target.value); setAbiertos({}); }}>
            <option value={TODAS}>Todas las tiendas (resumen)</option>
            {tiendas.map((id) => (
              <option key={id} value={id}>{etiquetaTienda(id)}</option>
            ))}
          </select>
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.82rem' }}>
          Semana
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={() => { setSemana(desplazarSemana(semana.inicio, -1)); setAbiertos({}); }}>
              ← Anterior
            </button>
            <button type="button" className="btn btn-ghost" disabled={esActual} onClick={() => { setSemana(semanaActual); setAbiertos({}); }}>
              Esta semana
            </button>
            <button type="button" className="btn btn-ghost" disabled={esActual || esFutura} onClick={() => { setSemana(desplazarSemana(semana.inicio, 1)); setAbiertos({}); }}>
              Siguiente →
            </button>
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.82rem' }}>
          Ir a la semana de…
          <input
            className="input"
            type="date"
            value={semana.inicio}
            onChange={(e) => {
              if (!e.target.value) return;
              setSemana(semanaDeFecha(e.target.value));
              setAbiertos({});
            }}
          />
        </label>

        <button type="button" className="btn btn-ghost" onClick={() => void cargar()} disabled={cargando}>
          {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
        {libro && (
          <button type="button" className="btn btn-primary" onClick={imprimir}>
            Imprimir
          </button>
        )}
      </div>

      <div style={{ fontWeight: 700, fontSize: '1rem' }}>
        {etiquetaSemana(semana.inicio, semana.fin)}
        {esActual ? <span className="muted" style={{ fontWeight: 400 }}> · semana en curso</span> : null}
        {tienda !== TODAS ? <span style={{ color: '#b5a642' }}> · {etiquetaTienda(tienda)}</span> : null}
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'rgba(185,28,28,0.35)', background: '#fef2f2', color: ROJO }}>{error}</div>
      )}

      {resumenTiendas && (
        <div className="card" style={{ padding: '0.6rem 0.8rem', overflowX: 'auto' }}>
          <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.82rem' }}>
            Toca una tienda para ver su libro día por día.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid rgba(100,116,139,0.35)' }}>
                <th style={{ padding: '0.35rem 0.4rem' }}>Tienda</th>
                <th style={{ padding: '0.35rem 0.4rem', textAlign: 'right' }}>Ventas</th>
                <th style={{ padding: '0.35rem 0.4rem', textAlign: 'right' }}>Gastos de cortes</th>
                <th style={{ padding: '0.35rem 0.4rem', textAlign: 'right' }}>Resultado</th>
                <th style={{ padding: '0.35rem 0.4rem', textAlign: 'right' }}>Turno en curso</th>
                <th style={{ padding: '0.35rem 0.4rem', textAlign: 'right' }}>Otros IE</th>
              </tr>
            </thead>
            <tbody>
              {resumenTiendas.filas.map((f) => (
                <tr
                  key={f.id}
                  onClick={() => { setTienda(f.id); setAbiertos({}); }}
                  style={{ cursor: 'pointer', borderBottom: '1px solid rgba(100,116,139,0.2)' }}
                >
                  <td style={{ padding: '0.4rem' }}><b>{f.label}</b></td>
                  <td style={{ padding: '0.4rem', textAlign: 'right', color: VERDE }}>{dinero(f.ingresos)}</td>
                  <td style={{ padding: '0.4rem', textAlign: 'right', color: ROJO }}>{dinero(f.gastos)}</td>
                  <td style={{ padding: '0.4rem', textAlign: 'right', fontWeight: 700, color: colorResultado(f.resultado) }}>{dinero(f.resultado)}</td>
                  <td className="muted" style={{ padding: '0.4rem', textAlign: 'right' }}>{f.enCurso > 0 ? dinero(f.enCurso) : '—'}</td>
                  <td className="muted" style={{ padding: '0.4rem', textAlign: 'right' }}>{f.otros > 0 ? dinero(f.otros) : '—'}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid rgba(100,116,139,0.35)', fontWeight: 700 }}>
                <td style={{ padding: '0.4rem' }}>Total</td>
                <td style={{ padding: '0.4rem', textAlign: 'right', color: VERDE }}>{dinero(resumenTiendas.total.ingresos)}</td>
                <td style={{ padding: '0.4rem', textAlign: 'right', color: ROJO }}>{dinero(resumenTiendas.total.gastos)}</td>
                <td style={{ padding: '0.4rem', textAlign: 'right', color: colorResultado(resumenTiendas.total.resultado) }}>{dinero(resumenTiendas.total.resultado)}</td>
                <td className="muted" style={{ padding: '0.4rem', textAlign: 'right' }}>{resumenTiendas.total.enCurso > 0 ? dinero(resumenTiendas.total.enCurso) : '—'}</td>
                <td className="muted" style={{ padding: '0.4rem', textAlign: 'right' }}>{resumenTiendas.total.otros > 0 ? dinero(resumenTiendas.total.otros) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {libro && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
            <Kpi titulo="Entró (ventas)" valor={dinero(t.ingresos)} color={VERDE} nota={t.otrosIngresos > 0 ? `Incluye ${dinero(t.otrosIngresos)} de otros ingresos` : 'Ventas de los cortes de la semana'} />
            <Kpi titulo="Salió (gastos de los cortes)" valor={dinero(t.gastos)} color={ROJO} nota={t.ingresos > 0 ? `${t.gastoPctVentas}% de lo vendido` : ''} />
            <Kpi
              titulo="Resultado de la semana"
              valor={dinero(t.resultado)}
              color={colorResultado(t.resultado)}
              nota={t.resultado >= 0 ? 'Entró más de lo que salió' : 'Salió más de lo que entró'}
            />
            <Kpi titulo="Días con movimiento" valor={`${t.diasConMovimiento} de 7`} color="#334155" nota={libro.mejorDia ? `Mejor venta: ${libro.mejorDia.nombre} (${dinero(libro.mejorDia.total)})` : ''} />
          </div>

          <details className="card" style={{ padding: '0.55rem 0.8rem', fontSize: '0.85rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>¿Cómo leer este libro?</summary>
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.5 }}>
              <li><b style={{ color: VERDE }}>Entró</b>: venta en efectivo de los cortes (venta total menos tarjeta) y otros ingresos capturados a mano.</li>
              <li><b style={{ color: ROJO }}>Salió</b>: los gastos que guardó cada corte cerrado (los mismos del ticket). Los créditos cobrados cuentan aquí como egreso, no como ingreso.</li>
              <li><b>Resultado del día</b> = lo que entró − lo que salió. <b>Acumulado</b> = suma de los resultados desde el sábado.</li>
              <li><b>Caja chica</b>: para cada corte se muestra caja anterior + venta en efectivo − gastos = caja al cerrar, que debe ser igual al ticket.</li>
              <li><b>Turno en curso</b>: gastos capturados después del último corte; no cuentan hasta que se cierre el siguiente corte. <b>Otros egresos de IE</b>: vales, evidencias o préstamos que no salen de la caja del corte; se muestran aparte.</li>
              <li>No es utilidad: no incluye el costo de la mercancía ni la nómina de la semana si aún no se registra en IE.</li>
            </ul>
          </details>

          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700 }}>Día por día</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => expandirTodo(true)}>Abrir todos</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => expandirTodo(false)}>Cerrar todos</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {libro.dias.map((dia) => (
              <TarjetaDia key={dia.fecha} dia={dia} abierto={estaAbierto(dia)} onToggle={() => alternarDia(dia.fecha)} />
            ))}
          </div>

          {libro.gastosPorCategoria.length > 0 && (
            <div className="card" style={{ padding: '0.7rem 0.9rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.45rem' }}>¿En qué se gastó la semana?</div>
              {libro.gastosPorCategoria.map((c) => (
                <div key={c.categoria} style={{ marginBottom: '0.45rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.86rem' }}>
                    <span>{c.categoria}</span>
                    <span>
                      <b>{dinero(c.total)}</b>
                      <span className="muted"> · {c.pctGastos}% de los gastos</span>
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 4, background: 'rgba(100,116,139,0.18)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, c.pctGastos)}%`, height: '100%', background: '#b5a642' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {(libro.fueraDeSemana.ingresos > 0 || libro.fueraDeSemana.gastos > 0) && (
            <p className="muted" style={{ fontSize: '0.78rem', margin: 0 }}>
              Hay {libro.fueraDeSemana.ingresos + libro.fueraDeSemana.gastos} movimiento(s) registrados esta semana con fecha de otra semana; no se suman aquí.
            </p>
          )}
        </>
      )}

      {cargando && !datos && <p className="muted">Cargando libro…</p>}
    </div>
  );
}
