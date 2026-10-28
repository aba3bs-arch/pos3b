import React, { useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import { PRESETS_FECHA_PRODUCTO, rangoDesdePreset } from '../lib/consultasInventario.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { hoyYmdNogales } from '../lib/corteCaja.js';
import { listarCreditosPendientesRuta } from '../lib/rutaCxc.js';
import {
  acumuladoMostrado,
  listarVentasRutaPorRango,
  resumirCreditoAcumulado,
  resumirVentasPorTienda,
  tiendasDeVentas,
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
  const [ventas, setVentas] = useState([]);
  const [cargosPendientes, setCargosPendientes] = useState([]);
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
    void listarVentasRutaPorRango(supabase, rango).then((r) => {
      if (cancel) return;
      setVentas(r.data || []);
      if (r.error) setError(r.error);
      setCargando(false);
    });
    return () => { cancel = true; };
  }, [supabase, rango, tick]);

  // El acumulado no depende del periodo: es lo mismo que suma Créditos por pagar.
  useEffect(() => {
    let cancel = false;
    void listarCreditosPendientesRuta(supabase, { todos: true }).then((r) => {
      if (cancel) return;
      setCargosPendientes(r.data || []);
      if (r.error) setError((prev) => prev || `Crédito acumulado: ${r.error}`);
    });
    return () => { cancel = true; };
  }, [supabase, tick]);

  const acumulado = useMemo(() => resumirCreditoAcumulado(cargosPendientes), [cargosPendientes]);
  const tiendas = useMemo(() => {
    const lista = tiendasDeVentas(ventas);
    const claves = new Set(lista.map((t) => t.clave));
    for (const a of acumulado.porTienda.values()) {
      if (!claves.has(a.clave)) lista.push({ clave: a.clave, nombre: a.nombre });
    }
    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [ventas, acumulado]);
  const tiendaActiva = tiendas.some((t) => t.clave === tienda) ? tienda : '';
  const credAcum = acumuladoMostrado(acumulado, tiendaActiva);
  const nombreAcum = tiendaActiva
    ? (tiendas.find((t) => t.clave === tiendaActiva)?.nombre || tiendaActiva)
    : 'todas las tiendas';
  const { filas, total } = useMemo(
    () => resumirVentasPorTienda(ventas, { tienda: tiendaActiva }),
    [ventas, tiendaActiva],
  );

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
        {[
          ['Ventas', String(total.ventas), '#334155'],
          ['Efectivo', fmtMonto(total.efectivo), '#0f766e'],
          ['Crédito', fmtMonto(total.credito), '#b45309'],
          ['Total', fmtMonto(total.total), '#1d4ed8'],
        ].map(([etiqueta, valor, color]) => (
          <div key={etiqueta} className="card" style={{ margin: 0, padding: '0.6rem 0.8rem', borderLeft: `4px solid ${color}` }}>
            <div className="muted" style={{ fontSize: '0.75rem' }}>{etiqueta}</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color }}>{valor}</div>
          </div>
        ))}
      </div>
      <div
        className="card"
        style={{
          margin: '0 0 0.75rem', padding: '0.7rem 0.9rem', borderLeft: '5px solid #c2410c',
          background: '#fff7ed', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#9a3412' }}>Crédito acumulado · {nombreAcum}</div>
          <div className="muted" style={{ fontSize: '0.74rem' }}>
            Total del crédito aún sin cobrar ({credAcum.folios} folio(s)), igual que Créditos por pagar. No depende del periodo.
          </div>
          <div style={{ fontSize: '0.78rem', color: '#7c2d12', marginTop: 2 }}>
            Ventas en ruta {fmtMonto(credAcum.ruta)} · Recolecciones {fmtMonto(credAcum.recoleccion)}
          </div>
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#c2410c' }}>{fmtMonto(credAcum.monto)}</div>
      </div>
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
