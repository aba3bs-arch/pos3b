import React, { useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import { PRESETS_FECHA_PRODUCTO, rangoDesdePreset } from '../lib/consultasInventario.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { hoyYmdNogales } from '../lib/corteCaja.js';
import {
  cargarContextoLiquidacion,
  gastoVigente,
  gastosPosterioresALiquidacion,
  listarGastosRutaPorRango,
  listarVentasRutaPorRango,
  resumirVentasPorTienda,
  totalGastos,
  tiendasDeVentas,
  ventasPosterioresALiquidacion,
} from '../lib/ventasRutaPorTienda.js';

const PRESETS = PRESETS_FECHA_PRODUCTO.filter((p) => ['hoy', 'semana', '7d', 'mes', 'mes_ant', 'rango'].includes(p.id));

const fmtFecha = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Phoenix' });
  } catch {
    return String(iso);
  }
};

/** RC/VentaRuta → ventas en efectivo y crédito por tienda, con rango de fechas. */
export default function VentasRutaPorTienda({ supabase }) {
  const hoy = hoyYmdNogales();
  const [preset, setPreset] = useState('hoy');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [tienda, setTienda] = useState('');
  const [ventasRango, setVentasRango] = useState([]);
  const [gastosRango, setGastosRango] = useState([]);
  const [contexto, setContexto] = useState({ repartidores: [], cortes: new Map(), cargasPorId: new Map() });
  const [soloPostLiquidacion, setSoloPostLiquidacion] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [tick, setTick] = useState(0);

  const rango = useMemo(() => {
    if (preset === 'rango') return { desde, hasta };
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

  const todasLasTiendas = !tiendaActiva;
  const gastosPeriodo = useMemo(() => totalGastos(gastos), [gastos]);
  const totalNeto = Math.round((total.efectivo + total.credito - (todasLasTiendas ? gastosPeriodo : 0)) * 100) / 100;
  const tarjetas = [
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
          onPresetChange={setPreset}
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
      {todasLasTiendas ? (
        <p className="muted" style={{ fontSize: '0.78rem', margin: '0 0 0.5rem' }}>
          Total = efectivo + crédito − gastos de ruta del periodo ({gastos.filter(gastoVigente).length} gasto(s)).
          Al elegir una tienda los gastos no se restan.
        </p>
      ) : null}
      {total.canceladas > 0 ? (
        <p className="muted" style={{ fontSize: '0.78rem', margin: '0 0 0.5rem' }}>
          {total.canceladas} venta(s) cancelada(s) no se cuentan.
        </p>
      ) : null}

      {cargando ? (
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
