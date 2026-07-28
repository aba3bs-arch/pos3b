import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { consultarVentas } from '../lib/ventasQuery.js';
import { consultarCortes } from '../lib/corteCaja.js';
import { etiquetaTienda, esAlmacenCentral } from '../constants/sucursales.js';
import { cargarReporteMovimientosInventario } from '../lib/consultasInventario.js';
import {
  agruparDocumentosInventario,
  colorAvatar,
  fmtFechaCorta,
  fmtMonto,
  folioNumerico,
  inicialesNombre,
} from '../lib/consultasUi.js';
import './Consultas.css';

const NAV = [
  { id: 'ventas', label: 'Ventas', ico: '▣' },
  { id: 'cfdi', label: 'CFDI', ico: '▤' },
  { id: 'compras', label: 'Compras', ico: '🛒' },
  { id: 'cajas', label: 'Cajas de cobro', ico: '🖥' },
  { id: 'inventarios', label: 'Inventarios', ico: '⬡' },
];

const TITULOS = {
  ventas: 'Ventas',
  cfdi: 'CFDI',
  cfdi_ventas: 'CFDI · Ventas',
  compras: 'Compras',
  cajas: 'Cajas de cobro',
  cajas_saldos: 'Saldos de caja',
  cajas_cortes: 'Cortes de caja',
  inventarios: 'Ajuste De Inventario',
};

function hoyYmd() {
  return new Date().toISOString().slice(0, 10);
}

function haceDiasYmd(n) {
  return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
}

function Avatar({ nombre, color }) {
  return (
    <span className="consultas-avatar" style={{ background: color || colorAvatar(nombre) }} title={nombre || ''}>
      {inicialesNombre(nombre)}
    </span>
  );
}

function EmptyState({ texto }) {
  return (
    <div className="consultas-empty">
      <div className="consultas-empty-ico">🔍</div>
      <div>{texto || 'No se encontró ningún resultado'}</div>
    </div>
  );
}

function moneyCell(n, { allowNegColor = true } = {}) {
  const v = Number(n) || 0;
  if (Math.abs(v) < 0.005) return <span className="consultas-money-zero">{fmtMonto(0)}</span>;
  if (allowNegColor && v < 0) return <span className="consultas-money-neg">{fmtMonto(v)}</span>;
  return <span className="consultas-money-pos">{fmtMonto(v)}</span>;
}

export default function Consultas({ supabase, inventario, sucursal, sucursalesLista, user }) {
  const [seccion, setSeccion] = useState('ventas');
  const [desde, setDesde] = useState(() => haceDiasYmd(7));
  const [hasta, setHasta] = useState(() => hoyYmd());
  const [q, setQ] = useState('');
  const [filtroSucursal, setFiltroSucursal] = useState(() => (esAlmacenCentral(sucursal) ? '' : sucursal || ''));
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState('');

  const [ventas, setVentas] = useState([]);
  const [compras, setCompras] = useState([]);
  const [docsInv, setDocsInv] = useState([]);
  const [cortes, setCortes] = useState([]);
  const [sel, setSel] = useState(null);

  const tiendas = sucursalesLista?.length ? sucursalesLista : [sucursal || 'MAIN'].filter(Boolean);

  const precioPorId = useMemo(() => {
    const map = new Map();
    for (const p of inventario || []) map.set(String(p.id), Number(p.precio) || 0);
    return map;
  }, [inventario]);

  const titulo = TITULOS[seccion] || 'Consultas';
  const esLista =
    seccion === 'ventas' ||
    seccion === 'cfdi_ventas' ||
    seccion === 'compras' ||
    seccion === 'inventarios' ||
    seccion === 'cajas_cortes' ||
    seccion === 'cajas_saldos';

  const buscarVentas = useCallback(async () => {
    if (!supabase) return [];
    const ini = new Date(`${String(desde).slice(0, 10)}T00:00:00`);
    const fin = new Date(`${String(hasta).slice(0, 10)}T23:59:59.999`);
    const { data, error, aviso: av } = await consultarVentas(supabase, {
      columns: 'id,total,metodo_pago,vendedor,sucursal_id,articulos,created_at,turno_id,turno_nombre',
      desde: ini,
      hasta: fin,
      sucursal: filtroSucursal || null,
      limit: 2000,
    });
    if (error) throw new Error(error);
    if (av) setAviso(av);
    return data || [];
  }, [supabase, desde, hasta, filtroSucursal]);

  const buscarCompras = useCallback(async () => {
    if (!supabase) return [];
    const ini = new Date(`${String(desde).slice(0, 10)}T00:00:00`);
    const fin = new Date(`${String(hasta).slice(0, 10)}T23:59:59.999`);
    let query = supabase
      .from('compras')
      .select('id,sucursal_id,sucursal,estado,total,items,items_pedido,notas,created_at,fecha,proveedor_id,proveedores(nombre)')
      .gte('created_at', ini.toISOString())
      .lte('created_at', fin.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);
    if (filtroSucursal) query = query.eq('sucursal_id', filtroSucursal);
    const { data, error } = await query;
    if (error) {
      if (/compras|does not exist|schema cache/i.test(String(error.message || ''))) return [];
      throw new Error(error.message);
    }
    return data || [];
  }, [supabase, desde, hasta, filtroSucursal]);

  const buscarInventarios = useCallback(async () => {
    const r = await cargarReporteMovimientosInventario(supabase, {
      desde,
      hasta,
      sucursal: filtroSucursal || null,
    });
    if (r.faltaTablaNube) {
      setAviso((r.avisos || []).join(' · '));
    } else if (r.avisos?.length) {
      setAviso(r.avisos[0] || '');
    }
    return agruparDocumentosInventario(r.data || [], { precioPorId });
  }, [supabase, desde, hasta, filtroSucursal, precioPorId]);

  const buscarCortes = useCallback(async () => {
    const { data, error, aviso: av } = await consultarCortes(supabase, {
      desde,
      hasta,
      sucursal: filtroSucursal || null,
      limit: 300,
    });
    if (error) throw new Error(error);
    if (av) setAviso(av);
    return data || [];
  }, [supabase, desde, hasta, filtroSucursal]);

  const refrescar = useCallback(async () => {
    if (!esLista) return;
    setLoading(true);
    setAviso('');
    setSel(null);
    try {
      if (seccion === 'ventas' || seccion === 'cfdi_ventas') {
        setVentas(await buscarVentas());
      } else if (seccion === 'compras') {
        setCompras(await buscarCompras());
      } else if (seccion === 'inventarios') {
        setDocsInv(await buscarInventarios());
      } else if (seccion === 'cajas_cortes' || seccion === 'cajas_saldos') {
        setCortes(await buscarCortes());
      }
    } catch (e) {
      setAviso(e?.message || String(e));
      setVentas([]);
      setCompras([]);
      setDocsInv([]);
      setCortes([]);
    } finally {
      setLoading(false);
    }
  }, [esLista, seccion, buscarVentas, buscarCompras, buscarInventarios, buscarCortes]);

  useEffect(() => {
    void refrescar();
  }, [seccion, desde, hasta, filtroSucursal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (esAlmacenCentral(sucursal)) return;
    if (sucursal && !filtroSucursal) setFiltroSucursal(sucursal);
  }, [sucursal]); // eslint-disable-line react-hooks/exhaustive-deps

  const qNorm = q.trim().toLowerCase();

  const ventasFiltradas = useMemo(() => {
    if (!qNorm) return ventas;
    return ventas.filter((v) => {
      const folio = folioNumerico(v.id, 5);
      const arts = Array.isArray(v.articulos) ? v.articulos.map((a) => `${a.id} ${a.nombre}`).join(' ') : '';
      const blob = `${folio} ${v.id} ${v.vendedor || ''} ${arts} ${v.metodo_pago || ''}`.toLowerCase();
      return blob.includes(qNorm);
    });
  }, [ventas, qNorm]);

  const comprasFiltradas = useMemo(() => {
    if (!qNorm) return compras;
    return compras.filter((c) => {
      const folio = folioNumerico(c.id, 5);
      const prov = c.proveedores?.nombre || '';
      const items = [...(c.items || []), ...(c.items_pedido || [])].map((i) => `${i.id} ${i.nombre}`).join(' ');
      return `${folio} ${c.id} ${prov} ${items} ${c.notas || ''}`.toLowerCase().includes(qNorm);
    });
  }, [compras, qNorm]);

  const docsFiltrados = useMemo(() => {
    if (!qNorm) return docsInv;
    return docsInv.filter((d) => `${d.label} ${d.usuario} ${d.folio}`.toLowerCase().includes(qNorm));
  }, [docsInv, qNorm]);

  const cortesFiltrados = useMemo(() => {
    if (!qNorm) return cortes;
    return cortes.filter((c) => {
      const blob = `${c.usuario || ''} ${c.turno_nombre || ''} ${c.sucursal || c.sucursal_id || ''} ${c.fecha || ''}`.toLowerCase();
      return blob.includes(qNorm);
    });
  }, [cortes, qNorm]);

  const saldosDesdeCortes = useMemo(() => {
    // Agrupa último corte por sucursal+usuario como proxy de “saldo de caja”.
    const map = new Map();
    for (const c of cortesFiltrados) {
      const key = `${c.sucursal || c.sucursal_id || ''}|${c.usuario || ''}`;
      const prev = map.get(key);
      const t = new Date(c.created_at || c.fecha || 0).getTime();
      if (!prev || t > prev._t) {
        map.set(key, {
          ...c,
          _t: t,
          saldo: Number(c.efectivoContado ?? c.efectivo_contado ?? 0),
        });
      }
    }
    return [...map.values()].sort((a, b) => b._t - a._t);
  }, [cortesFiltrados]);

  const placeholderBusqueda =
    seccion === 'ventas' || seccion === 'cfdi_ventas'
      ? 'Buscar… Folio, Cliente, Producto'
      : seccion === 'compras'
        ? 'Buscar… Folio, Proveedor, Producto'
        : seccion === 'inventarios'
          ? 'Buscar'
          : 'Buscar…';

  const irA = (id) => {
    setSeccion(id);
    setQ('');
    setSel(null);
  };

  return (
    <div className="consultas-shell">
      <aside className="consultas-side">
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`consultas-side-btn${
              seccion === n.id || seccion.startsWith(`${n.id}_`) ? ' active' : ''
            }`}
            onClick={() => irA(n.id)}
          >
            <span className="consultas-side-ico">{n.ico}</span>
            {n.label}
          </button>
        ))}
      </aside>

      <section className="consultas-main">
        <div className="consultas-topbar">
          <span>{titulo}</span>
          <span className="muted-top">{user?.nombre || ''}</span>
        </div>

        {seccion === 'cfdi' && (
          <div className="consultas-submenu">
            <button type="button" onClick={() => irA('cfdi_ventas')}>
              Ventas <span>›</span>
            </button>
          </div>
        )}

        {seccion === 'cajas' && (
          <div className="consultas-submenu">
            <button type="button" onClick={() => irA('cajas_saldos')}>
              Saldos de caja <span>›</span>
            </button>
            <button type="button" onClick={() => irA('cajas_cortes')}>
              Cortes de caja <span>›</span>
            </button>
          </div>
        )}

        {esLista && (
          <>
            <div className="consultas-toolbar">
              <div className="consultas-search">
                <span aria-hidden>🔍</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholderBusqueda} />
              </div>
              <button type="button" className="consultas-icon-btn" title="Actualizar" onClick={() => void refrescar()} disabled={loading}>
                ↻
              </button>
              <label className="consultas-chip" title="Desde">
                📅
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </label>
              <label className="consultas-chip" title="Hasta">
                →
                <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </label>
            </div>

            <div className="consultas-filters-row">
              <select value={filtroSucursal} onChange={(e) => setFiltroSucursal(e.target.value)}>
                <option value="">Todas las sucursales</option>
                {tiendas.map((s) => (
                  <option key={s} value={s}>
                    {etiquetaTienda(s)}
                  </option>
                ))}
              </select>
              {loading && <span className="muted" style={{ fontSize: '0.8rem' }}>Cargando…</span>}
            </div>

            {aviso && <div className="consultas-aviso">{aviso}</div>}

            <div className="consultas-body">
              {(seccion === 'ventas' || seccion === 'cfdi_ventas') && (
                ventasFiltradas.length === 0 ? (
                  <EmptyState />
                ) : (
                  <table className="consultas-table">
                    <thead>
                      <tr>
                        <th>Serie-Folio</th>
                        <th>CFDI</th>
                        <th>Cliente</th>
                        <th>Usuario/Vendedor</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventasFiltradas.map((v) => {
                        const folio = folioNumerico(v.id, 5);
                        const selected = sel?.id === v.id;
                        return (
                          <tr key={v.id} className={selected ? 'selected' : ''} onClick={() => setSel(selected ? null : v)}>
                            <td>
                              <div className="consultas-folio">
                                {folio}
                                <small>{fmtFechaCorta(v.created_at)}</small>
                              </div>
                            </td>
                            <td className="muted">{seccion === 'cfdi_ventas' ? '—' : ''}</td>
                            <td>Público En General</td>
                            <td>
                              <div className="consultas-avatars">
                                <Avatar nombre={v.vendedor} />
                                <Avatar nombre={v.vendedor} />
                              </div>
                            </td>
                            <td>{fmtMonto(v.total)} MXN</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              )}

              {seccion === 'compras' && (
                comprasFiltradas.length === 0 ? (
                  <EmptyState />
                ) : (
                  <table className="consultas-table">
                    <thead>
                      <tr>
                        <th>Serie-Folio</th>
                        <th>Proveedor</th>
                        <th>Usuario</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comprasFiltradas.map((c) => {
                        const folio = folioNumerico(c.id, 5);
                        const selected = sel?.id === c.id;
                        return (
                          <tr key={c.id} className={selected ? 'selected' : ''} onClick={() => setSel(selected ? null : c)}>
                            <td>
                              <div className="consultas-folio">
                                {folio}
                                <small>
                                  {fmtFechaCorta(c.created_at || c.fecha)} · {c.estado || '—'}
                                </small>
                              </div>
                            </td>
                            <td>{c.proveedores?.nombre || '—'}</td>
                            <td>
                              <Avatar nombre={c.notas?.split('·')[0] || 'COMPRA'} />
                            </td>
                            <td>{fmtMonto(c.total)} MXN</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              )}

              {seccion === 'inventarios' && (
                docsFiltrados.length === 0 ? (
                  <EmptyState />
                ) : (
                  <table className="consultas-table">
                    <thead>
                      <tr>
                        <th>Tipo de movimiento</th>
                        <th>Usuario</th>
                        <th>Diferencia negativa</th>
                        <th>Diferencia positiva</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docsFiltrados.map((d) => {
                        const selected = sel?.id === d.id;
                        return (
                          <tr key={d.id} className={selected ? 'selected' : ''} onClick={() => setSel(selected ? null : d)}>
                            <td>
                              <div className="consultas-folio">
                                {fmtFechaCorta(d.created_at)}
                                <small style={{ color: '#334155', fontWeight: 600 }}>{d.label}</small>
                              </div>
                            </td>
                            <td>
                              <Avatar nombre={d.usuario} />
                            </td>
                            <td>{moneyCell(d.difNeg > 0 ? -d.difNeg : 0)}</td>
                            <td>{moneyCell(d.difPos)}</td>
                            <td>{moneyCell(d.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              )}

              {seccion === 'cajas_cortes' && (
                cortesFiltrados.length === 0 ? (
                  <EmptyState />
                ) : (
                  <table className="consultas-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Usuario</th>
                        <th>Sucursal</th>
                        <th>Ventas</th>
                        <th>Contado</th>
                        <th>Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cortesFiltrados.map((c) => {
                        const id = c.id || `${c.fecha}_${c.usuario}`;
                        const selected = sel?.id === id;
                        const dif = Number(c.diferencia) || 0;
                        return (
                          <tr key={id} className={selected ? 'selected' : ''} onClick={() => setSel(selected ? null : { ...c, id })}>
                            <td>
                              <div className="consultas-folio">
                                {String(c.fecha || '').slice(0, 10)}
                                <small>{c.turno_nombre || c.turno_id || '—'}</small>
                              </div>
                            </td>
                            <td>
                              <Avatar nombre={c.usuario} />
                            </td>
                            <td>{etiquetaTienda(c.sucursal || c.sucursal_id)}</td>
                            <td>{fmtMonto(c.totalVentas ?? c.total_ventas)}</td>
                            <td>{fmtMonto(c.efectivoContado ?? c.efectivo_contado)}</td>
                            <td>{moneyCell(dif)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              )}

              {seccion === 'cajas_saldos' && (
                saldosDesdeCortes.length === 0 ? (
                  <EmptyState texto="Sin saldos. Se toman del último corte de cada caja en el periodo." />
                ) : (
                  <table className="consultas-table">
                    <thead>
                      <tr>
                        <th>Caja / Usuario</th>
                        <th>Sucursal</th>
                        <th>Último corte</th>
                        <th>Saldo (efectivo contado)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saldosDesdeCortes.map((c) => (
                        <tr key={`${c.sucursal || c.sucursal_id}|${c.usuario}`}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                              <Avatar nombre={c.usuario} />
                              <span>{c.usuario || '—'}</span>
                            </div>
                          </td>
                          <td>{etiquetaTienda(c.sucursal || c.sucursal_id)}</td>
                          <td>{fmtFechaCorta(c.created_at || c.fecha)}</td>
                          <td>{fmtMonto(c.saldo)} MXN</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>

            {sel && (seccion === 'ventas' || seccion === 'cfdi_ventas') && Array.isArray(sel.articulos) && (
              <div className="consultas-detail">
                <h4>Detalle ticket {folioNumerico(sel.id, 5)}</h4>
                <table className="consultas-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Cant.</th>
                      <th>Precio</th>
                      <th>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.articulos.map((a, i) => (
                      <tr key={`${a.id}_${i}`}>
                        <td>{a.nombre || a.id}</td>
                        <td>{a.qty ?? a.cantidad ?? 1}</td>
                        <td>{fmtMonto(a.precio)}</td>
                        <td>{fmtMonto((Number(a.precio) || 0) * (Number(a.qty ?? a.cantidad) || 1))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="muted" style={{ marginTop: '0.5rem', fontSize: '0.82rem' }}>
                  {sel.metodo_pago || '—'} · {etiquetaTienda(sel.sucursal_id)} · {sel.vendedor || '—'}
                </div>
              </div>
            )}

            {sel && seccion === 'inventarios' && Array.isArray(sel.lineas) && (
              <div className="consultas-detail">
                <h4>{sel.label}</h4>
                <table className="consultas-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Cant.</th>
                      <th>Stock</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.lineas.map((m) => (
                      <tr key={m.id}>
                        <td>{m.producto_nombre || m.producto_id}</td>
                        <td>{m.cantidad}</td>
                        <td style={{ fontSize: '0.8rem' }}>
                          {m.stock_antes != null ? `${m.stock_antes} → ${m.stock_despues}` : '—'}
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>{m.motivo || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {sel && seccion === 'compras' && (
              <div className="consultas-detail">
                <h4>Compra {folioNumerico(sel.id, 5)}</h4>
                <table className="consultas-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Cant.</th>
                      <th>Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sel.items?.length ? sel.items : sel.items_pedido || []).map((a, i) => (
                      <tr key={`${a.id}_${i}`}>
                        <td>{a.nombre || a.id}</td>
                        <td>{a.qty ?? a.qty_pedido ?? a.qty_recibido ?? 0}</td>
                        <td>{fmtMonto(a.costo ?? a.costo_est)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
