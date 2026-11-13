import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { etiquetaTienda, listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
import { cargarContAbarrotes } from '../lib/contVirtualData.js';
import { hoyYmdNogales } from '../lib/corteCaja.js';
import {
  construirLibroDiario,
  desplazarSemana,
  dinero,
  fusionarDatosLibro,
  htmlLibroDiarioImprimible,
  nombreMes,
  periodoLibro,
  resumenLibroPorTienda,
  resumenPorMes,
  resumenPorSemana,
  semanaDeFecha,
  trocearPeriodo,
} from '../lib/libroDiarioAbarrotes.js';

const VERDE = '#15803d';
const ROJO = '#b91c1c';
const TODAS = 'todas';
const MAX_DIAS_TARJETAS = 100;

const MODOS = [
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'anio', label: 'Año' },
  { id: 'rango', label: 'Rango de fechas' },
];

function TablaResumenPeriodos({ titulo, filas, onElegir, textoElegir }) {
  const tot = filas.reduce(
    (a, f) => ({
      ventas: a.ventas + f.ventas,
      pctAba: a.pctAba + f.pctAba,
      pctVirtual: a.pctVirtual + f.pctVirtual,
      gastos: a.gastos + f.gastos,
      resultado: a.resultado + f.resultado,
    }),
    { ventas: 0, pctAba: 0, pctVirtual: 0, gastos: 0, resultado: 0 },
  );
  const th = { padding: '0.35rem 0.4rem', textAlign: 'right' };
  const td = { padding: '0.4rem', textAlign: 'right' };
  return (
    <div className="card" style={{ padding: '0.6rem 0.8rem', overflowX: 'auto' }}>
      <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>{titulo}</div>
      {onElegir ? <p className="muted" style={{ margin: '0 0 0.4rem', fontSize: '0.8rem' }}>{textoElegir}</p> : null}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid rgba(100,116,139,0.35)' }}>
            <th style={{ padding: '0.35rem 0.4rem' }}>Periodo</th>
            <th style={th}>Ventas</th>
            <th style={th}>PCT ABA</th>
            <th style={th}>PCT VIRTUAL</th>
            <th style={th}>Gastos de cortes</th>
            <th style={th}>Resultado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr
              key={f.clave || f.inicio}
              onClick={onElegir ? () => onElegir(f) : undefined}
              style={{ cursor: onElegir ? 'pointer' : 'default', borderBottom: '1px solid rgba(100,116,139,0.2)' }}
            >
              <td style={{ padding: '0.4rem' }}><b>{f.etiqueta}</b></td>
              <td style={{ ...td, color: VERDE }}>{dinero(f.ventas)}</td>
              <td style={{ ...td, color: '#1d4ed8' }}>{f.pctAba > 0 ? dinero(f.pctAba) : '—'}</td>
              <td style={{ ...td, color: '#7c3aed' }}>{f.pctVirtual > 0 ? dinero(f.pctVirtual) : '—'}</td>
              <td style={{ ...td, color: ROJO }}>{dinero(f.gastos)}</td>
              <td style={{ ...td, fontWeight: 700, color: colorResultado(f.resultado) }}>{dinero(f.resultado)}</td>
            </tr>
          ))}
          <tr style={{ borderTop: '2px solid rgba(100,116,139,0.35)', fontWeight: 700 }}>
            <td style={{ padding: '0.4rem' }}>Total</td>
            <td style={{ ...td, color: VERDE }}>{dinero(tot.ventas)}</td>
            <td style={{ ...td, color: '#1d4ed8' }}>{tot.pctAba > 0 ? dinero(tot.pctAba) : '—'}</td>
            <td style={{ ...td, color: '#7c3aed' }}>{tot.pctVirtual > 0 ? dinero(tot.pctVirtual) : '—'}</td>
            <td style={{ ...td, color: ROJO }}>{dinero(tot.gastos)}</td>
            <td style={{ ...td, color: colorResultado(tot.resultado) }}>{dinero(tot.resultado)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

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

          {(dia.pctAba > 0 || dia.pctVirtual > 0) && (
            <div style={{ margin: '0.7rem 0 0.1rem', fontSize: '0.82rem' }}>
              <div style={{ fontWeight: 700, color: '#334155' }}>PAGOS CON TARJETA · no entran a la caja de efectivo</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 1.2rem', marginTop: '0.15rem' }}>
                <span><b style={{ color: '#1d4ed8' }}>PCT ABA</b> (venta del POS): {dinero(dia.pctAba)}</span>
                <span><b style={{ color: '#7c3aed' }}>PCT VIRTUAL</b> (diferencia): {dinero(dia.pctVirtual)}</span>
              </div>
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
              Acumulado del periodo: <b style={{ color: colorResultado(dia.acumulado) }}>{dinero(dia.acumulado)}</b>
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
  const hoy = useMemo(() => hoyYmdNogales(), []);
  const [modo, setModo] = useState('semana');
  const [semana, setSemana] = useState(() => semanaDeFecha(hoyYmdNogales()));
  const [mes, setMes] = useState(() => ({ anio: Number(hoyYmdNogales().slice(0, 4)), mes: Number(hoyYmdNogales().slice(5, 7)) }));
  const [anio, setAnio] = useState(() => Number(hoyYmdNogales().slice(0, 4)));
  const [rango, setRango] = useState(() => ({ desde: `${hoyYmdNogales().slice(0, 8)}01`, hasta: hoyYmdNogales() }));
  const [extender, setExtender] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [datos, setDatos] = useState(null);
  const [abiertos, setAbiertos] = useState({});
  const peticion = useRef(0);

  const semanaActual = useMemo(() => semanaDeFecha(hoyYmdNogales()), []);
  const esActual = semana.inicio === semanaActual.inicio;
  const esFutura = semana.inicio > semanaActual.inicio;
  const anioActual = Number(hoy.slice(0, 4));
  const mesActual = Number(hoy.slice(5, 7));
  const aniosDisponibles = useMemo(
    () => Array.from({ length: 8 }, (_, i) => anioActual + 1 - i),
    [anioActual],
  );

  const periodo = useMemo(
    () => periodoLibro({ modo, semana, mes, anio, desde: rango.desde, hasta: rango.hasta, extender }),
    [modo, semana, mes, anio, rango.desde, rango.hasta, extender],
  );

  const cargar = useCallback(async () => {
    if (!supabase) {
      setError('Sin conexión a Supabase.');
      return;
    }
    if (!periodo.desde || !periodo.hasta) {
      setError('Indica las fechas del periodo.');
      return;
    }
    const id = ++peticion.current;
    setCargando(true);
    setError('');
    const tramos = trocearPeriodo(periodo.desde, periodo.hasta, 31);
    const resultados = [];
    setProgreso(tramos.length > 1 ? { hecho: 0, total: tramos.length } : null);
    for (let k = 0; k < tramos.length; k += 3) {
      const lote = tramos.slice(k, k + 3);
      // eslint-disable-next-line no-await-in-loop
      const rs = await Promise.all(lote.map((t) => cargarContAbarrotes(supabase, {
        desde: t.desde,
        hasta: t.hasta,
        sucursal: tienda === TODAS ? null : tienda,
        limiteDetalle: 4000,
      })));
      if (id !== peticion.current) return;
      const fallo = rs.find((r) => !r?.ok);
      if (fallo) {
        setCargando(false);
        setProgreso(null);
        setDatos(null);
        setError(fallo?.error || 'No se pudo cargar el libro.');
        return;
      }
      resultados.push(...rs);
      if (tramos.length > 1) setProgreso({ hecho: resultados.length, total: tramos.length });
    }
    setCargando(false);
    setProgreso(null);
    setDatos(resultados.length === 1 ? resultados[0] : fusionarDatosLibro(resultados));
  }, [supabase, periodo.desde, periodo.hasta, tienda]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const libro = useMemo(() => {
    if (!datos || tienda === TODAS) return null;
    return construirLibroDiario({
      desde: periodo.desde,
      hasta: periodo.hasta,
      ingresos: datos.ingresosPorDia || [],
      cortes: datos.cortesLibro || [],
      enCurso: datos.gastosEnCurso || [],
      otros: datos.egresosOtrosIe || [],
    });
  }, [datos, tienda, periodo.desde, periodo.hasta]);

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
      const f = porTienda.find((x) => x.id === id) || { ingresos: 0, gastos: 0, enCurso: 0, otros: 0, pctAba: 0, pctVirtual: 0, resultado: 0 };
      return { ...f, id, label: etiquetaTienda(id) };
    });
    const r2 = (n) => Math.round(n * 100) / 100;
    const total = filas.reduce(
      (a, f) => ({
        ingresos: a.ingresos + f.ingresos,
        gastos: a.gastos + f.gastos,
        enCurso: a.enCurso + f.enCurso,
        otros: a.otros + f.otros,
        pctAba: a.pctAba + f.pctAba,
        pctVirtual: a.pctVirtual + f.pctVirtual,
      }),
      { ingresos: 0, gastos: 0, enCurso: 0, otros: 0, pctAba: 0, pctVirtual: 0 },
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
        semana: periodo.etiqueta,
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
          Día por día: lo que <b style={{ color: VERDE }}>entró</b> por ventas y lo que{' '}
          <b style={{ color: ROJO }}>salió</b> por gastos, con el resultado de cada día. Consulta por semana (sábado a viernes),
          mes (del 1 al último día), año (1 de enero al 31 de diciembre) o un rango de fechas.
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
          Ver por
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
            {MODOS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={modo === m.id ? 'btn btn-primary' : 'btn btn-ghost'}
                onClick={() => { setModo(m.id); setAbiertos({}); }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {modo === 'semana' && (
          <>
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
          </>
        )}

        {modo === 'mes' && (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.82rem' }}>
              Mes
              <select className="select" value={mes.mes} onChange={(e) => { setMes({ ...mes, mes: Number(e.target.value) }); setAbiertos({}); }}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{nombreMes(m)}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.82rem' }}>
              Año
              <select className="select" value={mes.anio} onChange={(e) => { setMes({ ...mes, anio: Number(e.target.value) }); setAbiertos({}); }}>
                {aniosDisponibles.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setMes(mes.mes === 1 ? { anio: mes.anio - 1, mes: 12 } : { anio: mes.anio, mes: mes.mes - 1 }); setAbiertos({}); }}
              >
                ← Anterior
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={mes.anio === anioActual && mes.mes === mesActual}
                onClick={() => { setMes({ anio: anioActual, mes: mesActual }); setAbiertos({}); }}
              >
                Este mes
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setMes(mes.mes === 12 ? { anio: mes.anio + 1, mes: 1 } : { anio: mes.anio, mes: mes.mes + 1 }); setAbiertos({}); }}
              >
                Siguiente →
              </button>
            </div>
          </>
        )}

        {modo === 'anio' && (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.82rem' }}>
              Año
              <select className="select" value={anio} onChange={(e) => { setAnio(Number(e.target.value)); setAbiertos({}); }}>
                {aniosDisponibles.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost" onClick={() => { setAnio(anio - 1); setAbiertos({}); }}>← Anterior</button>
              <button type="button" className="btn btn-ghost" disabled={anio === anioActual} onClick={() => { setAnio(anioActual); setAbiertos({}); }}>Este año</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setAnio(anio + 1); setAbiertos({}); }}>Siguiente →</button>
            </div>
          </>
        )}

        {modo === 'rango' && (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.82rem' }}>
              Desde
              <input
                className="input"
                type="date"
                value={rango.desde}
                onChange={(e) => { if (e.target.value) { setRango({ ...rango, desde: e.target.value }); setAbiertos({}); } }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.82rem' }}>
              Hasta
              <input
                className="input"
                type="date"
                value={rango.hasta}
                onChange={(e) => { if (e.target.value) { setRango({ ...rango, hasta: e.target.value }); setAbiertos({}); } }}
              />
            </label>
          </>
        )}

        {(modo === 'mes' || modo === 'rango') && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', maxWidth: 300 }}>
            <input type="checkbox" checked={extender} onChange={(e) => { setExtender(e.target.checked); setAbiertos({}); }} />
            Empezar en el sábado de la semana (y cerrar en el viernes)
          </label>
        )}

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
        {periodo.etiqueta}
        {modo === 'semana' && esActual ? <span className="muted" style={{ fontWeight: 400 }}> · semana en curso</span> : null}
        {modo !== 'semana' && periodo.desde ? (
          <span className="muted" style={{ fontWeight: 400 }}> · {periodo.dias} días ({periodo.desde} a {periodo.hasta})</span>
        ) : null}
        {tienda !== TODAS ? <span style={{ color: '#b5a642' }}> · {etiquetaTienda(tienda)}</span> : null}
      </div>

      {periodo.recortado && (
        <div className="card" style={{ background: '#fffbeb', borderColor: '#fcd34d', fontSize: '0.84rem' }}>
          El rango es muy largo; se muestran como máximo 400 días desde la fecha inicial.
        </div>
      )}
      {cargando && progreso && (
        <p className="muted" style={{ margin: 0, fontSize: '0.84rem' }}>
          Cargando {progreso.hecho} de {progreso.total} tramos de 31 días…
        </p>
      )}

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
                <th style={{ padding: '0.35rem 0.4rem', textAlign: 'right' }} title="Pagos con tarjeta registrados en las ventas del POS">PCT ABA</th>
                <th style={{ padding: '0.35rem 0.4rem', textAlign: 'right' }} title="Pagos con tarjeta del corte que no están en las ventas del POS (diferencia)">PCT VIRTUAL</th>
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
                  <td style={{ padding: '0.4rem', textAlign: 'right', color: '#1d4ed8' }}>{f.pctAba > 0 ? dinero(f.pctAba) : '—'}</td>
                  <td style={{ padding: '0.4rem', textAlign: 'right', color: '#7c3aed' }}>{f.pctVirtual > 0 ? dinero(f.pctVirtual) : '—'}</td>
                  <td style={{ padding: '0.4rem', textAlign: 'right', color: ROJO }}>{dinero(f.gastos)}</td>
                  <td style={{ padding: '0.4rem', textAlign: 'right', fontWeight: 700, color: colorResultado(f.resultado) }}>{dinero(f.resultado)}</td>
                  <td className="muted" style={{ padding: '0.4rem', textAlign: 'right' }}>{f.enCurso > 0 ? dinero(f.enCurso) : '—'}</td>
                  <td className="muted" style={{ padding: '0.4rem', textAlign: 'right' }}>{f.otros > 0 ? dinero(f.otros) : '—'}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid rgba(100,116,139,0.35)', fontWeight: 700 }}>
                <td style={{ padding: '0.4rem' }}>Total</td>
                <td style={{ padding: '0.4rem', textAlign: 'right', color: VERDE }}>{dinero(resumenTiendas.total.ingresos)}</td>
                <td style={{ padding: '0.4rem', textAlign: 'right', color: '#1d4ed8' }}>{resumenTiendas.total.pctAba > 0 ? dinero(resumenTiendas.total.pctAba) : '—'}</td>
                <td style={{ padding: '0.4rem', textAlign: 'right', color: '#7c3aed' }}>{resumenTiendas.total.pctVirtual > 0 ? dinero(resumenTiendas.total.pctVirtual) : '—'}</td>
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
            <Kpi titulo="Entró (ventas)" valor={dinero(t.ingresos)} color={VERDE} nota={t.otrosIngresos > 0 ? `Incluye ${dinero(t.otrosIngresos)} de otros ingresos` : 'Ventas de los cortes del periodo'} />
            <Kpi titulo="PCT ABA" valor={dinero(t.pctAba)} color="#1d4ed8" nota="Tarjeta registrada en las ventas del POS" />
            <Kpi titulo="PCT VIRTUAL" valor={dinero(t.pctVirtual)} color="#7c3aed" nota="Tarjeta del corte menos lo registrado en el POS" />
            <Kpi titulo="Salió (gastos de los cortes)" valor={dinero(t.gastos)} color={ROJO} nota={t.ingresos > 0 ? `${t.gastoPctVentas}% de lo vendido` : ''} />
            <Kpi
              titulo="Resultado del periodo"
              valor={dinero(t.resultado)}
              color={colorResultado(t.resultado)}
              nota={t.resultado >= 0 ? 'Entró más de lo que salió' : 'Salió más de lo que entró'}
            />
            <Kpi titulo="Días con movimiento" valor={`${t.diasConMovimiento} de ${libro.dias.length}`} color="#334155" nota={libro.mejorDia ? `Mejor venta: ${libro.mejorDia.nombre} (${dinero(libro.mejorDia.total)})` : ''} />
          </div>

          <details className="card" style={{ padding: '0.55rem 0.8rem', fontSize: '0.85rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>¿Cómo leer este libro?</summary>
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.5 }}>
              <li><b style={{ color: VERDE }}>Entró</b>: venta en efectivo de los cortes (venta total menos tarjeta) y otros ingresos capturados a mano.</li>
              <li><b style={{ color: ROJO }}>Salió</b>: los gastos que guardó cada corte cerrado (los mismos del ticket). Los créditos cobrados cuentan aquí como egreso, no como ingreso.</li>
              <li><b>Resultado del día</b> = lo que entró − lo que salió. <b>Acumulado</b> = suma de los resultados desde el primer día del periodo consultado.</li>
              <li><b>PCT ABA / PCT VIRTUAL</b>: el pago con tarjeta que captura el cajero en el corte se divide en dos. PCT ABA es lo que ya está registrado como tarjeta en las ventas del POS de la tienda; PCT VIRTUAL es la diferencia. Ninguno entra a Entró/Salió porque no es efectivo.</li>
              <li><b>Caja chica</b>: para cada corte se muestra caja anterior + venta en efectivo − gastos = caja al cerrar, que debe ser igual al ticket.</li>
              <li><b>Turno en curso</b>: gastos capturados después del último corte; no cuentan hasta que se cierre el siguiente corte. <b>Otros egresos de IE</b>: vales, evidencias o préstamos que no salen de la caja del corte; se muestran aparte.</li>
              <li>No es utilidad: no incluye el costo de la mercancía ni la nómina del periodo si aún no se registra en IE.</li>
            </ul>
          </details>

          {libro.dias.length > 35 && (
            <TablaResumenPeriodos
              titulo="Resumen por mes"
              filas={resumenPorMes(libro.dias)}
              textoElegir="Toca un mes para ver su libro día por día."
              onElegir={(f) => { setMes({ anio: f.anio, mes: f.mes }); setModo('mes'); setExtender(false); setAbiertos({}); }}
            />
          )}
          {libro.dias.length > 7 && libro.dias.length <= 120 && (
            <TablaResumenPeriodos titulo="Resumen por semana (sábado a viernes)" filas={resumenPorSemana(libro.dias)} />
          )}

          {libro.dias.length <= MAX_DIAS_TARJETAS ? (
            <>
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
            </>
          ) : (
            <p className="muted" style={{ fontSize: '0.84rem', margin: 0 }}>
              Para ver el detalle día por día elige un mes (toca el mes en el resumen) o un rango de hasta {MAX_DIAS_TARJETAS} días.
            </p>
          )}

          {libro.gastosPorCategoria.length > 0 && (
            <div className="card" style={{ padding: '0.7rem 0.9rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.45rem' }}>¿En qué se gastó en el periodo?</div>
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
              Hay {libro.fueraDeSemana.ingresos + libro.fueraDeSemana.gastos} movimiento(s) con fecha fuera del periodo consultado; no se suman aquí.
            </p>
          )}
        </>
      )}

      {cargando && !datos && <p className="muted">Cargando libro…</p>}
    </div>
  );
}
