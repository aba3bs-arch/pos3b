import React, { useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import { PRESETS_FECHA_PRODUCTO, rangoDesdePreset } from '../lib/consultasInventario.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { hoyYmdNogales } from '../lib/corteCaja.js';
import {
  cargarContextoLiquidacion,
  cargarCortesLiquidacion,
  gastoVigente,
  gastosPosterioresALiquidacion,
  listarGastosRutaPorRango,
  listarVentasRutaPorRango,
  rangoDesdeUltimaRecoleccion,
  resumirTraspasosCredito,
  resumirVentasPorTienda,
  totalGastos,
  tiendasDeVentas,
  ventasPosterioresALiquidacion,
} from '../lib/ventasRutaPorTienda.js';

export const PRESET_ULTIMA_RECOLECCION = 'ultima_recoleccion';

const PRESETS = [
  ...PRESETS_FECHA_PRODUCTO.filter((p) => ['hoy', 'semana', '7d', 'mes', 'mes_ant'].includes(p.id)),
  { id: PRESET_ULTIMA_RECOLECCION, label: 'Desde última recolección' },
  ...PRESETS_FECHA_PRODUCTO.filter((p) => p.id === 'rango'),
];

const fmtDia = (ymd) => {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(ymd || '—');
  const f = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  const nombre = f.toLocaleDateString('es-MX', { weekday: 'short', timeZone: 'UTC' });
  return `${nombre} ${m[3]}/${m[2]}/${m[1]}`;
};

const fmtFecha = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Phoenix' });
  } catch {
    return String(iso);
  }
};

/**
 * RC/VentaRuta → ventas en efectivo y crédito por tienda (modo 'tiendas'), o traspasos dejados
 * a crédito por día y por tienda (modo 'traspasos'), con rango de fechas.
 */
export default function VentasRutaPorTienda({ supabase, modo = 'tiendas' }) {
  const hoy = hoyYmdNogales();
  const [preset, setPreset] = useState('hoy');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [tienda, setTienda] = useState('');
  const [ventasRango, setVentasRango] = useState([]);
  const [gastosRango, setGastosRango] = useState([]);
  const [contexto, setContexto] = useState({ repartidores: [], cortes: new Map(), cargasPorId: new Map() });
  const [soloPostLiquidacion, setSoloPostLiquidacion] = useState(modo !== 'traspasos');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [tick, setTick] = useState(0);

  const [ultimaRecoleccionIso, setUltimaRecoleccionIso] = useState(null);

  const cambiarPreset = (id) => {
    setPreset(id);
    if (id === PRESET_ULTIMA_RECOLECCION) setSoloPostLiquidacion(true);
  };

  useEffect(() => {
    if (preset !== PRESET_ULTIMA_RECOLECCION) return undefined;
    let cancel = false;
    void cargarCortesLiquidacion(supabase).then(({ cortes }) => {
      if (cancel) return;
      const r = rangoDesdeUltimaRecoleccion(cortes, { hoy: hoyYmdNogales() });
      setDesde(r.desde);
      setHasta(r.hasta);
      setUltimaRecoleccionIso(r.ultimaIso);
    }).catch(() => {});
    return () => { cancel = true; };
  }, [preset, supabase, tick]);

  const rango = useMemo(() => {
    if (preset === 'rango' || preset === PRESET_ULTIMA_RECOLECCION) return { desde, hasta };
    return rangoDesdePreset(preset) || { desde: hoy, hasta: hoy };
  }, [preset, desde, hasta, hoy]);

  useEffect(() => {
    if (!rango.desde || !rango.hasta) return undefined;
    if (rango.desde > rango.hasta) {
      setError('La fecha inicial no puede ser posterior a la final.');
      return undefined;
    }
    let cancel = false;
    setCargando(true);
    setError('');
    void Promise.all([
      listarVentasRutaPorRango(supabase, rango),
      listarGastosRutaPorRango(supabase, rango),
    ]).then(async ([rv, rg]) => {
      const ctx = await cargarContextoLiquidacion(supabase, rv.data || []).catch(() => null);
      if (cancel) return;
      setVentasRango(rv.data || []);
      setGastosRango(rg.data || []);
      if (ctx) setContexto(ctx);
      if (rv.error || rg.error) setError(rv.error || `Gastos: ${rg.error}`);
      setCargando(false);
    });
    return () => { cancel = true; };
  }, [supabase, rango, tick]);

  const corte = useMemo(
    () => (soloPostLiquidacion
      ? ventasPosterioresALiquidacion(ventasRango, contexto)
      : { ventas: ventasRango, excluidas: 0, sinRecolector: 0 }),
    [soloPostLiquidacion, ventasRango, contexto],
  );
  const ventas = corte.ventas;
  const gastos = useMemo(
    () => (soloPostLiquidacion ? gastosPosterioresALiquidacion(gastosRango, contexto.cortes) : gastosRango),
    [soloPostLiquidacion, gastosRango, contexto],
  );
  const cortesVisibles = useMemo(
    () => contexto.repartidores
      .filter((r) => contexto.cortes.has(String(r.id)))
      .map((r) => ({ id: r.id, nombre: r.nombre, iso: contexto.cortes.get(String(r.id)) }))
      .sort((a, b) => String(b.iso).localeCompare(String(a.iso))),
    [contexto],
  );
  const tiendas = useMemo(() => tiendasDeVentas(ventas), [ventas]);
  const tiendaActiva = tiendas.some((t) => t.clave === tienda) ? tienda : '';
  const { filas, total } = useMemo(
    () => resumirVentasPorTienda(ventas, { tienda: tiendaActiva }),
    [ventas, tiendaActiva],
  );

  const traspasos = useMemo(
    () => (modo === 'traspasos' ? resumirTraspasosCredito(ventas, { tienda: tiendaActiva }) : null),
    [modo, ventas, tiendaActiva],
  );

  const todasLasTiendas = !tiendaActiva;
  const gastosPeriodo = useMemo(() => totalGastos(gastos), [gastos]);
  const totalNeto = Math.round((total.efectivo + total.credito - (todasLasTiendas ? gastosPeriodo : 0)) * 100) / 100;
  const tarjetas = modo === 'traspasos'
    ? [
        ['Traspasos a crédito', String(traspasos.total.traspasos), '#334155'],
        ['Crédito total', fmtMonto(traspasos.total.credito), '#b45309'],
        ['Pendiente de cobro', fmtMonto(traspasos.total.pendiente), '#b91c1c'],
        ['Cobrado / otros', fmtMonto(traspasos.total.otros), '#0f766e'],
      ]
    : [
        ['Ventas', String(total.ventas), '#334155'],
        ['Efectivo', fmtMonto(total.efectivo), '#0f766e'],
        ['Crédito', fmtMonto(total.credito), '#b45309'],
        ...(todasLasTiendas ? [['Gastos', fmtMonto(gastosPeriodo), '#b91c1c']] : []),
        [todasLasTiendas ? 'Total (menos gastos)' : 'Total', fmtMonto(totalNeto), '#1d4ed8'],
      ];

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
        <FiltroPeriodo
          preset={preset}
          onPresetChange={cambiarPreset}
          desde={desde}
          hasta={hasta}
          onDesdeChange={setDesde}
          onHastaChange={setHasta}
          presets={PRESETS}
          style={{ minWidth: 220 }}
        />
        <label className="muted">
          Tienda
          <select
            className="select"
            style={{ display: 'block', marginTop: '0.35rem', minWidth: 180 }}
            value={tiendaActiva}
            onChange={(e) => { setAbierta(null); setTienda(e.target.value); }}
          >
            <option value="">Todas las tiendas</option>
            {tiendas.map((t) => (
              <option key={t.clave} value={t.clave}>{t.nombre}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-ghost" onClick={() => setTick((n) => n + 1)} disabled={cargando}>
          {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {error ? <p style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{error}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {tarjetas.map(([etiqueta, valor, color]) => (
          <div key={etiqueta} className="card" style={{ margin: 0, padding: '0.6rem 0.8rem', borderLeft: `4px solid ${color}` }}>
            <div className="muted" style={{ fontSize: '0.75rem' }}>{etiqueta}</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color }}>{valor}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '0.78rem', margin: '0 0 0.6rem' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={soloPostLiquidacion}
            onChange={(e) => setSoloPostLiquidacion(e.target.checked)}
          />
          <span>Contar solo lo posterior a la última liquidación de cada recolector</span>
        </label>
        {soloPostLiquidacion ? (
          <div className="muted" style={{ marginTop: '0.2rem' }}>
            {corte.excluidas > 0
              ? `${corte.excluidas} venta(s) ya liquidadas no se cuentan. `
              : 'No hay ventas ya liquidadas en este periodo. '}
            {cortesVisibles.length
              ? `Última liquidación: ${cortesVisibles.map((c) => `${c.nombre || c.id} ${fmtFecha(c.iso)}`).join(' · ')}.`
              : 'Aún no hay liquidaciones registradas.'}
            {corte.sinRecolector > 0 ? ` ${corte.sinRecolector} venta(s) sin recolector identificado se cuentan completas.` : ''}
          </div>
        ) : null}
      </div>
      {preset === PRESET_ULTIMA_RECOLECCION ? (
        <p className="muted" style={{ fontSize: '0.78rem', margin: '0 0 0.5rem' }}>
          {ultimaRecoleccionIso
            ? `Desde la última recolección (${fmtFecha(ultimaRecoleccionIso)}) hasta hoy.`
            : 'Aún no hay recolecciones liquidadas: se muestran los últimos 30 días.'}
        </p>
      ) : null}
      {modo !== 'traspasos' && todasLasTiendas ? (
        <p className="muted" style={{ fontSize: '0.78rem', margin: '0 0 0.5rem' }}>
          Total = efectivo + crédito − gastos de ruta del periodo ({gastos.filter(gastoVigente).length} gasto(s)).
          Al elegir una tienda los gastos no se restan.
        </p>
      ) : null}
      {modo !== 'traspasos' && total.canceladas > 0 ? (
        <p className="muted" style={{ fontSize: '0.78rem', margin: '0 0 0.5rem' }}>
          {total.canceladas} venta(s) cancelada(s) no se cuentan.
        </p>
      ) : null}

      {modo === 'traspasos' ? (
        cargando ? (
          <p className="muted">Cargando…</p>
        ) : !traspasos.dias.length ? (
          <p className="muted">Sin traspasos a crédito en este periodo.</p>
        ) : (
          <div className="table-wrap">
            <table className="consultas-table">
              <thead>
                <tr>
                  <th>Día / Tienda</th>
                  <th>Traspasos</th>
                  <th>Crédito</th>
                  <th>Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {traspasos.dias.map((d) => (
                  <React.Fragment key={d.ymd}>
                    <tr style={{ background: 'var(--surface-2, #f1f5f9)' }}>
                      <td><strong>{fmtDia(d.ymd)}</strong></td>
                      <td><strong>{d.traspasos}</strong></td>
                      <td><strong>{fmtMonto(d.credito)}</strong></td>
                      <td><strong>{fmtMonto(d.pendiente)}</strong></td>
                    </tr>
                    {d.tiendas.map((f) => {
                      const clave = `${d.ymd}|${f.clave}`;
                      return (
                        <React.Fragment key={clave}>
                          <tr style={{ cursor: 'pointer' }} onClick={() => setAbierta(abierta === clave ? null : clave)}>
                            <td style={{ paddingLeft: '1.5rem' }}>
                              {abierta === clave ? '▾' : '▸'} {f.nombre}
                              {f.externo ? <span className="muted" style={{ fontSize: '0.72rem' }}> · externo</span> : null}
                            </td>
                            <td>{f.traspasos}</td>
                            <td>{fmtMonto(f.credito)}</td>
                            <td>{fmtMonto(f.pendiente)}</td>
                          </tr>
                          {abierta === clave ? (
                            <tr>
                              <td colSpan={4} style={{ background: 'var(--surface-2, #f8fafc)' }}>
                                <table className="consultas-table" style={{ margin: 0 }}>
                                  <thead>
                                    <tr>
                                      <th>Folio</th>
                                      <th>Hora</th>
                                      <th>Crédito</th>
                                      <th>Estado</th>
                                      <th>Vendedor</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {f.detalle.map((v) => (
                                      <tr key={v.id || v.folio}>
                                        <td><strong>{v.folio || '—'}</strong></td>
                                        <td className="muted" style={{ fontSize: '0.8rem' }}>{fmtFecha(v.created_at)}</td>
                                        <td>{fmtMonto(v._credito)}</td>
                                        <td>{v.estado_credito || '—'}</td>
                                        <td className="muted">{v.vendedor_nombre || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                ))}
                <tr className="consultas-tfoot-total">
                  <td><strong>Total del periodo</strong></td>
                  <td><strong>{traspasos.total.traspasos}</strong></td>
                  <td><strong>{fmtMonto(traspasos.total.credito)}</strong></td>
                  <td><strong>{fmtMonto(traspasos.total.pendiente)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      ) : cargando ? (
        <p className="muted">Cargando…</p>
      ) : !filas.length ? (
        <p className="muted">Sin ventas en este periodo.</p>
      ) : (
        <div className="table-wrap">
          <table className="consultas-table">
            <thead>
              <tr>
                <th>Tienda</th>
                <th>Ventas</th>
                <th>Efectivo</th>
                <th>Crédito</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <React.Fragment key={f.clave}>
                  <tr
                    style={{ cursor: 'pointer' }}
                    onClick={() => setAbierta(abierta === f.clave ? null : f.clave)}
                  >
                    <td>
                      <strong>{abierta === f.clave ? '▾' : '▸'} {f.nombre}</strong>
                      {f.externo ? <span className="muted" style={{ fontSize: '0.72rem' }}> · externo</span> : null}
                    </td>
                    <td>{f.ventas}</td>
                    <td>{fmtMonto(f.efectivo)}</td>
                    <td>{fmtMonto(f.credito)}</td>
                    <td><strong>{fmtMonto(f.total)}</strong></td>
                  </tr>
                  {abierta === f.clave ? (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--surface-2, #f8fafc)' }}>
                        <table className="consultas-table" style={{ margin: 0 }}>
                          <thead>
                            <tr>
                              <th>Folio</th>
                              <th>Fecha</th>
                              <th>Pago</th>
                              <th>Efectivo</th>
                              <th>Crédito</th>
                              <th>Total</th>
                              <th>Vendedor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {f.detalle.map((v) => (
                              <tr key={v.id || v.folio}>
                                <td><strong>{v.folio || '—'}</strong></td>
                                <td className="muted" style={{ fontSize: '0.8rem' }}>{fmtFecha(v.created_at)}</td>
                                <td>
                                  {v.metodo_pago || '—'}
                                  {v.estado_credito ? ` · ${v.estado_credito}` : ''}
                                </td>
                                <td>{fmtMonto(v._efectivo)}</td>
                                <td>{fmtMonto(v._credito)}</td>
                                <td>{fmtMonto(v.total)}</td>
                                <td className="muted">{v.vendedor_nombre || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
