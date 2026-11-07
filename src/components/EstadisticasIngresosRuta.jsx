import React, { useEffect, useMemo, useState } from 'react';
import { cargarAnalisisIngresosRuta, armarAnalisisIngresosRuta, BUCKETS_ANTIGUEDAD } from '../lib/rutaIngresosCxc.js';

function fmt(n) {
  const v = Number(n) || 0;
  const txt = Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '-' : ''}$${txt}`;
}

function fmtFecha(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Hermosillo' });
}

const COLOR_NIVEL = { alto: '#c0392b', medio: '#e67e22', info: '#2980b9' };
const ESTADO_ENTREGA = {
  completo: { txt: 'Completo', color: '#27ae60' },
  por_entregar: { txt: 'Por entregar', color: '#2980b9' },
  atrasado: { txt: 'Entrega atrasada', color: '#c0392b' },
  faltante: { txt: 'Falta registrar', color: '#c0392b' },
  de_mas: { txt: 'Registró de más', color: '#e67e22' },
};
const COLOR_BUCKET = Object.fromEntries(BUCKETS_ANTIGUEDAD.map((b) => [b.id, b.color]));

function Mini({ label, value, color, sub }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '0.55rem 0.65rem' }}>
      <div className="muted" style={{ fontSize: '0.72rem' }}>{label}</div>
      <strong style={{ fontSize: '1.1rem', color: color || 'inherit' }}>{value}</strong>
      {sub && <div className="muted" style={{ fontSize: '0.72rem' }}>{sub}</div>}
    </div>
  );
}

function Grid({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.65rem', marginBottom: '0.85rem' }}>
      {children}
    </div>
  );
}

function Titulo({ children }) {
  return <h5 style={{ margin: '1.1rem 0 0.4rem', color: 'var(--brand-blue)', fontSize: '0.98rem' }}>{children}</h5>;
}

function Badge({ color, children }) {
  return (
    <span style={{ background: color, color: '#fff', borderRadius: 999, padding: '0.1rem 0.5rem', fontSize: '0.74rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

const TABLA = { fontSize: '0.82rem', width: '100%' };

/**
 * Estadísticas Abarrotes · Ingresos de Venta en Ruta, créditos pendientes,
 * entrega del recolector y estado actual del camión.
 */
export default function EstadisticasIngresosRuta({ supabase, desde, hasta, sucursal }) {
  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState(null);
  const [verTodos, setVerTodos] = useState(false);
  const [camionAbierto, setCamionAbierto] = useState(null);

  useEffect(() => {
    let ok = true;
    if (!supabase || !desde || !hasta) return undefined;
    (async () => {
      setCargando(true);
      try {
        const res = await cargarAnalisisIngresosRuta(supabase, { desde, hasta, sucursal: sucursal || null });
        if (ok) setDatos(res);
      } catch (e) {
        if (ok) setDatos({ ok: false, error: e?.message || String(e) });
      } finally {
        if (ok) setCargando(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, [supabase, desde, hasta, sucursal]);

  const a = useMemo(() => (datos?.ok ? armarAnalisisIngresosRuta(datos, { tienda: sucursal || '' }) : null), [datos, sucursal]);

  const ing = a?.ingresos;
  const car = a?.cartera;
  const pctRealizado = ing?.total > 0 ? Math.min(100, (ing.ingresoRealizado / ing.total) * 100) : 0;
  const lista = car ? (verTodos ? car.lista : car.lista.slice(0, 15)) : [];

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h4 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>
        Venta en ruta · ingresos, créditos pendientes, entrega y camión
      </h4>
      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.8rem' }}>
        Ingresos del periodo (contado + crédito cobrado) y lo que queda por cobrar, la cartera de créditos pendientes
        (todas las fechas), si cada recolector entrega el dinero completo y qué hay hoy en cada camión.
      </p>

      {cargando && <p className="muted">Analizando venta en ruta…</p>}
      {!cargando && datos && !datos.ok && <p style={{ color: '#c0392b', margin: 0 }}>{datos.error}</p>}
      {!cargando && (datos?.avisos || []).map((x) => (
        <p key={x} className="muted" style={{ margin: '0 0 0.35rem', fontSize: '0.78rem', color: '#e67e22' }}>{x}</p>
      ))}

      {!cargando && a && (
        <>
          <ul style={{ margin: '0 0 0.9rem', paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
            {a.avisos.map((x) => (
              <li key={x.texto} style={{ color: COLOR_NIVEL[x.nivel] || 'inherit', marginBottom: '0.25rem' }}>{x.texto}</li>
            ))}
          </ul>

          <Titulo>1. Ingresos de venta en ruta (periodo)</Titulo>
          <Grid>
            <Mini label="Vendido total" value={fmt(ing.total)} sub={`${ing.ventas} venta(s)`} />
            <Mini label="Contado (efectivo)" value={fmt(ing.contado)} color="#27ae60" />
            <Mini label="Vendido a crédito" value={fmt(ing.creditoVendido)} />
            <Mini label="Crédito ya cobrado" value={fmt(ing.creditoCobrado)} color="#27ae60" />
            <Mini label="Crédito PENDIENTE" value={fmt(ing.creditoPendiente)} color={ing.creditoPendiente > 0 ? '#c0392b' : '#27ae60'} sub="de las ventas del periodo" />
            <Mini label="Ingreso realizado" value={fmt(ing.ingresoRealizado)} color="#27ae60" sub={ing.pctRealizado != null ? `${ing.pctRealizado}% de lo vendido` : ''} />
          </Grid>
          <div style={{ height: 14, borderRadius: 7, background: '#fadbd8', overflow: 'hidden', marginBottom: '0.3rem' }} title="Verde: ya ingresó · Rojo: por cobrar">
            <div style={{ width: `${pctRealizado}%`, height: '100%', background: '#27ae60' }} />
          </div>
          <p className="muted" style={{ margin: '0 0 0.3rem', fontSize: '0.74rem' }}>
            Verde = ya ingresó (contado + crédito cobrado) · Rojo = por cobrar. Cobranza recibida en el periodo (de cualquier venta): {fmt(ing.cobranzaDelPeriodo)}.
          </p>

          <Titulo>2. Créditos pendientes (cartera actual, todas las fechas)</Titulo>
          <Grid>
            <Mini label="Pendiente de ventas en ruta" value={fmt(car.ruta.monto)} color={car.ruta.monto > 0 ? '#c0392b' : '#27ae60'} sub={`${car.ruta.creditos} crédito(s)`} />
            <Mini label="Más de 30 días" value={fmt(car.vencidoMas30)} color={car.vencidoMas30 > 0 ? '#c0392b' : '#27ae60'} />
            <Mini label="El más viejo" value={`${car.ruta.masViejoDias} días`} />
            <Mini label="Créditos de recolección" value={fmt(car.recoleccion.monto)} sub={`${car.recoleccion.creditos} (no son venta de ruta)`} />
          </Grid>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '0.8rem' }}>
            {car.porAntiguedad.map((b) => (
              <div key={b.id} style={{ borderLeft: `5px solid ${b.color}`, background: 'var(--surface)', borderRadius: 8, padding: '0.45rem 0.6rem' }}>
                <div className="muted" style={{ fontSize: '0.72rem' }}>{b.etiqueta}</div>
                <strong style={{ color: b.color }}>{fmt(b.monto)}</strong>
                <div className="muted" style={{ fontSize: '0.72rem' }}>{b.creditos} crédito(s)</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.9rem', marginBottom: '0.8rem' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data" style={TABLA}>
                <thead><tr><th>Tienda / cliente</th><th>Créditos</th><th>Pendiente</th><th>Más viejo</th></tr></thead>
                <tbody>
                  {car.porTienda.length === 0 && <tr><td colSpan={4} className="muted">Sin créditos pendientes.</td></tr>}
                  {car.porTienda.map((t) => (
                    <tr key={t.clave}><td>{t.nombre}</td><td>{t.creditos}</td><td style={{ fontWeight: 700 }}>{fmt(t.monto)}</td><td>{t.masViejoDias} d</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data" style={TABLA}>
                <thead><tr><th>Vendedor</th><th>Créditos</th><th>Pendiente</th><th>Más viejo</th></tr></thead>
                <tbody>
                  {car.porVendedor.length === 0 && <tr><td colSpan={4} className="muted">Sin créditos pendientes.</td></tr>}
                  {car.porVendedor.map((t) => (
                    <tr key={t.clave}><td>{t.nombre}</td><td>{t.creditos}</td><td style={{ fontWeight: 700 }}>{fmt(t.monto)}</td><td>{t.masViejoDias} d</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data" style={TABLA}>
              <thead><tr><th>Folio</th><th>Tienda / cliente</th><th>Fecha</th><th>Antigüedad</th><th>Vendedor</th><th>Origen</th><th>Monto</th></tr></thead>
              <tbody>
                {lista.length === 0 && <tr><td colSpan={7} className="muted">Sin créditos pendientes.</td></tr>}
                {lista.map((c) => (
                  <tr key={c.id}>
                    <td>{c.folio}</td>
                    <td>{c.tienda}</td>
                    <td>{fmtFecha(c.fecha)}</td>
                    <td><Badge color={COLOR_BUCKET[c.bucket]}>{c.dias} d</Badge></td>
                    <td>{c.vendedor}</td>
                    <td>{c.origen === 'recoleccion' ? 'Recolección' : 'Venta en ruta'}</td>
                    <td style={{ fontWeight: 700 }}>{fmt(c.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {car.lista.length > 15 && (
            <button type="button" className="btn btn-ghost" style={{ marginTop: '0.4rem', fontSize: '0.8rem' }} onClick={() => setVerTodos((v) => !v)}>
              {verTodos ? 'Ver solo los 15 más viejos' : `Ver los ${car.lista.length} créditos`}
            </button>
          )}

          <Titulo>3. ¿El recolector entrega el dinero completo? (periodo)</Titulo>
          <p className="muted" style={{ margin: '0 0 0.4rem', fontSize: '0.76rem' }}>
            Esperado = efectivo vendido + cobros de crédito. Debe sumar: Entregado + Por entregar + Sin registrar. «Sin registrar»
            es efectivo que se vendió y nunca quedó en tránsito.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="data" style={TABLA}>
              <thead>
                <tr>
                  <th>Recolector</th><th>Vendido efvo</th><th>Cobros crédito</th><th>Esperado</th><th>Entregado</th>
                  <th>Por entregar</th><th>Sin registrar</th><th>Gastos</th><th>En tránsito hoy</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {a.entrega.length === 0 && <tr><td colSpan={10} className="muted">Sin movimientos de recolectores en el periodo.</td></tr>}
                {a.entrega.map((f) => {
                  const est = ESTADO_ENTREGA[f.estado] || ESTADO_ENTREGA.completo;
                  return (
                    <tr key={f.id}>
                      <td>{f.nombre}</td>
                      <td>{fmt(f.vendidoEfectivo)}</td>
                      <td>{fmt(f.cobrosCredito)}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(f.esperado)}</td>
                      <td>{fmt(f.entregado)}{f.pctEntregado != null ? ` (${f.pctEntregado}%)` : ''}</td>
                      <td>{fmt(f.porEntregar)}</td>
                      <td style={{ fontWeight: 700, color: f.sinRegistrar > 0.5 ? '#c0392b' : 'inherit' }}>{fmt(f.sinRegistrar)}</td>
                      <td>{fmt(f.gastos)}</td>
                      <td>{f.enTransitoActual > 0 ? `${fmt(f.enTransitoActual)} · ${f.masViejoDias} d` : '—'}</td>
                      <td><Badge color={est.color}>{est.txt}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Titulo>4. Inventario actual en el camión</Titulo>
          <div style={{ overflowX: 'auto' }}>
            <table className="data" style={TABLA}>
              <thead>
                <tr>
                  <th>Camión</th><th>Recolector</th><th>Carga</th><th>Días abierta</th><th>Cargado</th><th>Vendido</th>
                  <th>Devuelto</th><th>En camión hoy</th><th>Valor a precio ruta</th><th>Valor a costo</th><th>Vendido sin venta</th><th />
                </tr>
              </thead>
              <tbody>
                {a.camiones.length === 0 && <tr><td colSpan={12} className="muted">No hay cargas abiertas en ningún camión.</td></tr>}
                {a.camiones.map((c) => (
                  <React.Fragment key={c.cargaId}>
                    <tr>
                      <td>{c.camion}</td>
                      <td>{c.recolector}</td>
                      <td>{c.folio || '—'}</td>
                      <td style={{ color: c.dias > 7 ? '#c0392b' : 'inherit', fontWeight: c.dias > 7 ? 700 : 400 }}>{c.dias}</td>
                      <td>{c.cargada.toLocaleString('es-MX')}</td>
                      <td>{c.vendida.toLocaleString('es-MX')}{c.pctVendido != null ? ` (${c.pctVendido}%)` : ''}</td>
                      <td>{c.devuelta.toLocaleString('es-MX')}</td>
                      <td style={{ fontWeight: 700 }}>{c.disponible.toLocaleString('es-MX')} pzas · {c.productos} prod.</td>
                      <td>{fmt(c.valorDisponibleRuta)}</td>
                      <td>{fmt(c.valorDisponibleCosto)}</td>
                      <td style={{ color: c.sinRegistrar > 10 ? '#c0392b' : 'inherit', fontWeight: c.sinRegistrar > 10 ? 700 : 400 }}>{c.sinRegistrar > 10 ? fmt(c.sinRegistrar) : '—'}</td>
                      <td>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem' }} onClick={() => setCamionAbierto(camionAbierto === c.cargaId ? null : c.cargaId)}>
                          {camionAbierto === c.cargaId ? 'Ocultar' : 'Productos'}
                        </button>
                      </td>
                    </tr>
                    {c.alertas.length > 0 && (
                      <tr>
                        <td colSpan={12} style={{ color: '#c0392b', fontSize: '0.78rem' }}>{c.alertas.join(' · ')}</td>
                      </tr>
                    )}
                    {camionAbierto === c.cargaId && (
                      <tr>
                        <td colSpan={12}>
                          <table className="data" style={{ ...TABLA, background: 'var(--surface)' }}>
                            <thead><tr><th>Producto</th><th>Cargado</th><th>Vendido</th><th>Devuelto</th><th>En camión</th><th>Valor ruta</th></tr></thead>
                            <tbody>
                              {c.detalle.map((p) => (
                                <tr key={p.producto_id}>
                                  <td>{p.nombre}</td><td>{p.cargada}</td><td>{p.vendida}</td><td>{p.devuelta}</td>
                                  <td style={{ fontWeight: p.disponible > 0 ? 700 : 400 }}>{p.disponible}</td><td>{fmt(p.valorRuta)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ margin: '0.6rem 0 0', fontSize: '0.74rem' }}>
            Inventario teórico del sistema (cargado − vendido − devuelto); no sustituye el conteo físico de Auditoría del camión.
            «Vendido sin venta» compara la mercancía que salió del camión contra las ventas registradas de esa carga.
            El filtro de tienda aplica a ingresos, créditos y entregas; el camión siempre se muestra completo.
          </p>
        </>
      )}
    </div>
  );
}
