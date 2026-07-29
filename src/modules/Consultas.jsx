import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { consultarVentas } from '../lib/ventasQuery.js';
import { consultarCortes } from '../lib/corteCaja.js';
import { cargarSaldosCajaEnCurso } from '../lib/movimientosCaja.js';
import { etiquetaTienda, esAlmacenCentral } from '../constants/sucursales.js';
import { cargarReporteMovimientosInventario } from '../lib/consultasInventario.js';
import { etiquetaDepartamento, listarDepartamentos, normalizarDepartamento } from '../lib/departamentos.js';
import {
  agruparDocumentosInventario,
  agruparVentaPorArticulo,
  colorAvatar,
  fmtFechaCorta,
  fmtMonto,
  folioNumerico,
  inicialesNombre,
} from '../lib/consultasUi.js';
import ProductoThumb from '../components/ProductoThumb.jsx';
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
  ventas_tickets: 'Ventas · Tickets',
  ventas_articulo: 'Ventas · Por artículo',
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

/** Normaliza articulos de una venta (array o JSON string). */
function articulosDeVenta(venta) {
  let a = venta?.articulos;
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a);
    } catch {
      a = [];
    }
  }
  return Array.isArray(a) ? a : [];
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
  const [filtroDepto, setFiltroDepto] = useState('');
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState('');

  const [ventas, setVentas] = useState([]);
  const [compras, setCompras] = useState([]);
  const [docsInv, setDocsInv] = useState([]);
  const [cortes, setCortes] = useState([]);
  const [saldos, setSaldos] = useState([]);
  const [sel, setSel] = useState(null);
  const [selSaldo, setSelSaldo] = useState(null);

  const tiendas = sucursalesLista?.length ? sucursalesLista : [sucursal || 'MAIN'].filter(Boolean);

  const precioPorId = useMemo(() => {
    const map = new Map();
    for (const p of inventario || []) map.set(String(p.id), Number(p.precio) || 0);
    return map;
  }, [inventario]);

  const productoPorId = useMemo(() => {
    const map = new Map();
    for (const p of inventario || []) map.set(String(p.id), p);
    return map;
  }, [inventario]);

  const enDetalleInv = seccion === 'inventarios' && sel && Array.isArray(sel.lineas);
  const tituloBarra = enDetalleInv
    ? `${sel.titulo || 'Movimiento'} - ${sel.folio}`
    : TITULOS[seccion] || 'Consultas';
  const esLista =
    seccion === 'ventas_tickets' ||
    seccion === 'ventas_articulo' ||
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
    return agruparDocumentosInventario(r.data || [], { precioPorId, incluirVentas: false });
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

  const buscarSaldos = useCallback(async () => {
    // Venta al momento del turno (hasta que se cierre el corte). Sin fecha fija del filtro.
    const tienda = filtroSucursal || (esAlmacenCentral(sucursal) ? null : sucursal) || null;
    if (!tienda) {
      setAviso('Elige una sucursal para ver el saldo de caja en curso (hasta el cierre de corte).');
    }
    const r = await cargarSaldosCajaEnCurso(supabase, { sucursal: tienda, fecha: null });
    if (r.aviso) setAviso(r.aviso);
    return r.data || [];
  }, [supabase, filtroSucursal, sucursal]);

  const refrescar = useCallback(async () => {
    if (!esLista) return;
    setLoading(true);
    setAviso('');
    setSel(null);
    setSelSaldo(null);
    try {
      if (seccion === 'ventas_tickets' || seccion === 'ventas_articulo' || seccion === 'cfdi_ventas') {
        setVentas(await buscarVentas());
      } else if (seccion === 'compras') {
        setCompras(await buscarCompras());
      } else if (seccion === 'inventarios') {
        setDocsInv(await buscarInventarios());
      } else if (seccion === 'cajas_cortes') {
        setCortes(await buscarCortes());
      } else if (seccion === 'cajas_saldos') {
        setSaldos(await buscarSaldos());
      }
    } catch (e) {
      setAviso(e?.message || String(e));
      setVentas([]);
      setCompras([]);
      setDocsInv([]);
      setCortes([]);
      setSaldos([]);
    } finally {
      setLoading(false);
    }
  }, [esLista, seccion, buscarVentas, buscarCompras, buscarInventarios, buscarCortes, buscarSaldos]);

  useEffect(() => {
    void refrescar();
  }, [seccion, desde, hasta, filtroSucursal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Saldos: refresco automático para ver la venta al momento.
  useEffect(() => {
    if (seccion !== 'cajas_saldos') return undefined;
    const id = window.setInterval(() => {
      void buscarSaldos()
        .then((data) => {
          setSaldos(data || []);
          setSelSaldo((prev) => {
            if (!prev) return null;
            const next = (data || []).find((s) => s.id === prev.id);
            return next && next.enCurso && !next.sinMovimiento ? next : null;
          });
        })
        .catch(() => {});
    }, 15000);
    return () => window.clearInterval(id);
  }, [seccion, buscarSaldos]);

  useEffect(() => {
    if (esAlmacenCentral(sucursal)) return;
    if (sucursal && !filtroSucursal) setFiltroSucursal(sucursal);
  }, [sucursal]); // eslint-disable-line react-hooks/exhaustive-deps

  const qNorm = q.trim().toLowerCase();

  const ventasFiltradas = useMemo(() => {
    if (!qNorm) return ventas;
    return ventas.filter((v) => {
      const folio = folioNumerico(v.id, 5);
      const arts = articulosDeVenta(v).map((a) => `${a.id} ${a.nombre}`).join(' ');
      const blob = `${folio} ${v.id} ${v.vendedor || ''} ${arts} ${v.metodo_pago || ''}`.toLowerCase();
      return blob.includes(qNorm);
    });
  }, [ventas, qNorm]);

  const departamentos = useMemo(() => listarDepartamentos(inventario), [inventario]);

  const reporteArticulo = useMemo(
    () => agruparVentaPorArticulo(ventas, { productoPorId }),
    [ventas, productoPorId],
  );

  const articulosFiltrados = useMemo(() => {
    const depto = filtroDepto ? normalizarDepartamento(filtroDepto) : '';
    return reporteArticulo.filas.filter((r) => {
      if (depto && normalizarDepartamento(r.departamento) !== depto) return false;
      if (!qNorm) return true;
      return `${r.id} ${r.nombre} ${r.departamento}`.toLowerCase().includes(qNorm);
    });
  }, [reporteArticulo.filas, qNorm, filtroDepto]);

  /** % sobre el total filtrado (no sobre todo el periodo). */
  const articulosConPct = useMemo(() => {
    const totalImp = articulosFiltrados.reduce((s, r) => s + r.importe, 0) || 1;
    return articulosFiltrados.map((r) => ({
      ...r,
      pct: Math.round((r.importe / totalImp) * 10000) / 100,
    }));
  }, [articulosFiltrados]);

  const totalesArticuloFiltrado = useMemo(() => {
    const piezas = articulosFiltrados.reduce((s, r) => s + r.piezas, 0);
    const importe = articulosFiltrados.reduce((s, r) => s + r.importe, 0);
    return {
      piezas: Math.round(piezas * 1000) / 1000,
      importe: Math.round(importe * 100) / 100,
      skus: articulosFiltrados.length,
    };
  }, [articulosFiltrados]);

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
    return docsInv.filter((d) =>
      `${d.label} ${d.usuario} ${d.folio} ${d.titulo} ${d.ruta || ''} ${d.traspaso_origen || ''} ${d.traspaso_destino || ''}`
        .toLowerCase()
        .includes(qNorm),
    );
  }, [docsInv, qNorm]);

  const idxDocInv = useMemo(() => {
    if (!sel || seccion !== 'inventarios') return -1;
    return docsFiltrados.findIndex((d) => d.id === sel.id);
  }, [sel, docsFiltrados, seccion]);

  const hayDocAnterior = idxDocInv > 0;
  const hayDocSiguiente = idxDocInv >= 0 && idxDocInv < docsFiltrados.length - 1;

  const irDocInv = useCallback(
    (dir) => {
      if (idxDocInv < 0) return;
      const next = idxDocInv + dir;
      if (next < 0 || next >= docsFiltrados.length) return;
      setSel(docsFiltrados[next]);
    },
    [idxDocInv, docsFiltrados],
  );

  const cortesFiltrados = useMemo(() => {
    if (!qNorm) return cortes;
    return cortes.filter((c) => {
      const blob = `${c.usuario || ''} ${c.turno_nombre || ''} ${c.sucursal || c.sucursal_id || ''} ${c.fecha || ''}`.toLowerCase();
      return blob.includes(qNorm);
    });
  }, [cortes, qNorm]);

  const saldosFiltrados = useMemo(() => {
    if (!qNorm) return saldos;
    return saldos.filter((s) => `${s.nombreCaja} ${s.turno_id}`.toLowerCase().includes(qNorm));
  }, [saldos, qNorm]);

  useEffect(() => {
    if (!enDetalleInv) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        irDocInv(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        irDocInv(1);
      } else if (e.key === 'Escape') {
        setSel(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enDetalleInv, irDocInv]);

  const placeholderBusqueda =
    seccion === 'ventas_tickets' || seccion === 'cfdi_ventas'
      ? 'Buscar… Folio, Cliente, Producto'
      : seccion === 'ventas_articulo'
        ? 'Buscar… Código o nombre de artículo'
        : seccion === 'compras'
          ? 'Buscar… Folio, Proveedor, Producto'
          : seccion === 'cajas_cortes'
            ? 'Buscar… Usuario, turno, sucursal'
            : seccion === 'cajas_saldos'
              ? 'Buscar caja o turno'
              : seccion === 'inventarios'
                ? 'Buscar folio o monto'
                : 'Buscar…';

  const irA = (id) => {
    setSel(null);
    setSelSaldo(null);
    setQ('');
    if (!String(id).startsWith('ventas_')) setFiltroDepto('');
    setSeccion(id);
  };

  const lineasDetalleInv = useMemo(() => {
    if (!enDetalleInv) return [];
    return (sel.lineas || []).map((m) => {
      const prod = productoPorId.get(String(m.producto_id));
      const precio = Number(m.precio) || Number(prod?.precio) || 0;
      const qty = Math.abs(Number(m.cantidad) || 0);
      const existencia = m.stock_antes != null ? Number(m.stock_antes) : 0;
      const contado = m.stock_despues != null ? Number(m.stock_despues) : qty;
      const difValor =
        m.subtotal != null && Number(m.subtotal)
          ? Math.abs(Number(m.subtotal))
          : Math.abs(contado - existencia) * precio || qty * precio;
      return { ...m, prod, precio, existencia, contado, difValor };
    });
  }, [enDetalleInv, sel, productoPorId]);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
            {(enDetalleInv ||
              seccion === 'cajas_cortes' ||
              seccion === 'cajas_saldos' ||
              seccion === 'cfdi_ventas' ||
              seccion === 'ventas_tickets' ||
              seccion === 'ventas_articulo') && (
              <button
                type="button"
                className="consultas-back"
                title="Volver"
                onClick={() => {
                  if (enDetalleInv) setSel(null);
                  else if (seccion.startsWith('cajas_')) irA('cajas');
                  else if (seccion.startsWith('cfdi_')) irA('cfdi');
                  else if (seccion.startsWith('ventas_')) irA('ventas');
                }}
              >
                ←
              </button>
            )}
            <span className="consultas-topbar-title">{tituloBarra}</span>
          </div>
          <div className="consultas-topbar-right">
            {enDetalleInv && docsFiltrados.length > 0 && (
              <div className="consultas-pager" role="navigation" aria-label="Navegar operaciones">
                <button
                  type="button"
                  className="consultas-pager-btn"
                  title="Operación anterior (←)"
                  disabled={!hayDocAnterior}
                  onClick={() => irDocInv(-1)}
                >
                  ‹
                </button>
                <span className="consultas-pager-pos">
                  {idxDocInv + 1} / {docsFiltrados.length}
                </span>
                <button
                  type="button"
                  className="consultas-pager-btn"
                  title="Operación siguiente (→)"
                  disabled={!hayDocSiguiente}
                  onClick={() => irDocInv(1)}
                >
                  ›
                </button>
              </div>
            )}
            <span className="muted-top">{user?.nombre || ''}</span>
          </div>
        </div>

        {seccion === 'ventas' && (
          <div className="consultas-submenu">
            <button type="button" onClick={() => irA('ventas_tickets')}>
              Tickets <span>›</span>
            </button>
            <button type="button" onClick={() => irA('ventas_articulo')}>
              Venta por artículo <span>›</span>
            </button>
          </div>
        )}

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

        {enDetalleInv && (
          <div className="consultas-inv-detalle">
            <div className="consultas-inv-meta">
              <Avatar nombre={sel.usuario} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="muted" style={{ fontSize: '0.82rem' }}>
                  Almacén:{' '}
                  <strong style={{ color: '#334155' }}>
                    {etiquetaTienda(sel.sucursal || filtroSucursal || sucursal) || 'Default'}
                  </strong>
                </div>
                <div className="muted" style={{ fontSize: '0.75rem', marginTop: '0.15rem' }}>
                  {sel.titulo} · Folio {sel.folio} · {sel.usuario || '—'}
                </div>
                {sel.esTraspaso && (sel.ruta || (sel.traspaso_origen && sel.traspaso_destino)) && (
                  <div style={{ fontSize: '0.8rem', marginTop: '0.35rem', color: '#1e5bb8', fontWeight: 600 }}>
                    {sel.ruta || `${sel.traspaso_origen} → ${sel.traspaso_destino}`}
                  </div>
                )}
              </div>
              <div className="consultas-inv-fecha">{fmtFechaCorta(sel.created_at)}</div>
              <div className="consultas-pager consultas-pager--light" role="navigation" aria-label="Navegar operaciones">
                <button
                  type="button"
                  className="consultas-pager-btn"
                  title="Anterior"
                  disabled={!hayDocAnterior}
                  onClick={() => irDocInv(-1)}
                >
                  ‹
                </button>
                <span className="consultas-pager-pos">
                  {idxDocInv + 1}/{docsFiltrados.length}
                </span>
                <button
                  type="button"
                  className="consultas-pager-btn"
                  title="Siguiente"
                  disabled={!hayDocSiguiente}
                  onClick={() => irDocInv(1)}
                >
                  ›
                </button>
              </div>
            </div>
            <div className="consultas-body">
              <table className="consultas-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Lote</th>
                    <th>Precio</th>
                    <th>Existencia</th>
                    <th>Diferencia</th>
                    <th>Contado</th>
                  </tr>
                </thead>
                <tbody>
                  {lineasDetalleInv.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className="consultas-prod-cell">
                          <ProductoThumb producto={m.prod || { id: m.producto_id, nombre: m.producto_nombre }} size={40} />
                          <div>
                            <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{m.producto_id}</div>
                            <div style={{ fontWeight: 600 }}>{m.producto_nombre || m.producto_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="muted">—</td>
                      <td>{fmtMonto(m.precio)}</td>
                      <td>{m.existencia}</td>
                      <td style={{ color: '#1e5bb8', fontWeight: 600 }}>{fmtMonto(m.difValor)}</td>
                      <td style={{ fontWeight: 700 }}>{m.contado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="consultas-inv-total">
              Total ({lineasDetalleInv.length}) {fmtMonto(sel.total)}
            </div>
          </div>
        )}

        {esLista && !enDetalleInv && (
          <>
            <div className="consultas-toolbar">
              <div className="consultas-search">
                <span aria-hidden>🔍</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholderBusqueda} />
              </div>
              <button type="button" className="consultas-icon-btn" title="Actualizar" onClick={() => void refrescar()} disabled={loading}>
                ↻
              </button>
              {seccion !== 'cajas_saldos' && (
                <>
                  <label className="consultas-chip" title="Desde">
                    📅
                    <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
                  </label>
                  <label className="consultas-chip" title="Hasta">
                    →
                    <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                  </label>
                </>
              )}
              {seccion === 'cajas_saldos' && (
                <span className="consultas-chip" title="Venta al momento">
                  🔴 En vivo
                </span>
              )}
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
              {seccion === 'ventas_articulo' && (
                <select value={filtroDepto} onChange={(e) => setFiltroDepto(e.target.value)}>
                  <option value="">Todos los departamentos</option>
                  {departamentos.map((d) => (
                    <option key={d} value={d}>
                      {etiquetaDepartamento(d)}
                    </option>
                  ))}
                </select>
              )}
              {loading && <span className="muted" style={{ fontSize: '0.8rem' }}>Cargando…</span>}
            </div>

            {aviso && <div className="consultas-aviso">{aviso}</div>}

            <div className="consultas-body">
              {(seccion === 'ventas_tickets' || seccion === 'cfdi_ventas') && (
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

              {seccion === 'ventas_articulo' && (
                articulosConPct.length === 0 ? (
                  <EmptyState texto="Sin ventas de artículos en el rango (o en ese departamento)." />
                ) : (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                        gap: '0.5rem',
                        marginBottom: '0.75rem',
                      }}
                    >
                      {[
                        { label: 'Artículos', value: String(totalesArticuloFiltrado.skus) },
                        { label: 'Piezas', value: String(totalesArticuloFiltrado.piezas) },
                        { label: 'Importe', value: fmtMonto(totalesArticuloFiltrado.importe) },
                        { label: 'Tickets', value: String(reporteArticulo.tickets) },
                      ].map((k) => (
                        <div
                          key={k.label}
                          style={{
                            padding: '0.5rem 0.65rem',
                            borderRadius: 8,
                            background: 'var(--surface, #f8fafc)',
                            border: '1px solid var(--border, #e2e8f0)',
                          }}
                        >
                          <div className="muted" style={{ fontSize: '0.72rem' }}>
                            {k.label}
                          </div>
                          <strong style={{ fontSize: '1rem', color: 'var(--brand-blue, #1e5bb8)' }}>{k.value}</strong>
                        </div>
                      ))}
                    </div>
                    <table className="consultas-table">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Descripción</th>
                          <th>Depto.</th>
                          <th style={{ textAlign: 'right' }}>Piezas</th>
                          <th style={{ textAlign: 'right' }}>P. prom.</th>
                          <th style={{ textAlign: 'right' }}>Importe</th>
                          <th style={{ textAlign: 'right' }}>%</th>
                          <th style={{ textAlign: 'right' }}>Tickets</th>
                        </tr>
                      </thead>
                      <tbody>
                        {articulosConPct.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <div className="consultas-prod-cell">
                                <ProductoThumb producto={productoPorId.get(r.id) || { id: r.id, nombre: r.nombre }} size={36} />
                                <span style={{ fontWeight: 600 }}>{r.id}</span>
                              </div>
                            </td>
                            <td style={{ fontWeight: 600 }}>{r.nombre}</td>
                            <td className="muted">{etiquetaDepartamento(r.departamento)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.piezas}</td>
                            <td style={{ textAlign: 'right' }}>{fmtMonto(r.precioPromedio)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMonto(r.importe)}</td>
                            <td style={{ textAlign: 'right' }} className="muted">
                              {r.pct.toFixed(1)}%
                            </td>
                            <td style={{ textAlign: 'right' }} className="muted">
                              {r.tickets}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3} style={{ fontWeight: 700 }}>
                            Total ({totalesArticuloFiltrado.skus} SKU
                            {filtroDepto ? ` · ${etiquetaDepartamento(filtroDepto)}` : ''})
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 800 }}>{totalesArticuloFiltrado.piezas}</td>
                          <td />
                          <td style={{ textAlign: 'right', fontWeight: 800 }}>{fmtMonto(totalesArticuloFiltrado.importe)}</td>
                          <td style={{ textAlign: 'right' }}>100%</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </>
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
                  <EmptyState texto="Sin operaciones en el rango (ingresos, ajustes, retiros, traspasos, cancelaciones)." />
                ) : (
                  <>
                    <p className="muted" style={{ margin: '0 0 0.35rem', fontSize: '0.8rem' }}>
                      Verifica por ticket: ingresos, ajustes, retiros, traspasos y cancelaciones. (Las ventas se consultan en Ventas.) Abre uno y usa ‹ › para navegar.
                    </p>
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
                        {docsFiltrados.map((d) => (
                          <tr key={d.id} onClick={() => setSel(d)}>
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
                        ))}
                      </tbody>
                    </table>
                  </>
                )
              )}

              {seccion === 'cajas_cortes' && (
                cortesFiltrados.length === 0 ? (
                  <EmptyState />
                ) : (
                  <table className="consultas-table">
                    <thead>
                      <tr>
                        <th>Caja de cobro</th>
                        <th>Folio</th>
                        <th>Moneda</th>
                        <th>Usuario</th>
                        <th>Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cortesFiltrados.map((c) => {
                        const id = c.id || `${c.fecha}_${c.usuario}`;
                        const folio = folioNumerico(c.id || id, 3);
                        const ok = Math.abs(Number(c.diferencia) || 0) < 0.01;
                        return (
                          <tr key={id} onClick={() => setSel({ ...c, id })}>
                            <td>
                              <div className="consultas-folio">
                                {fmtFechaCorta(c.created_at || c.fecha)}
                                <small>{c.turno_nombre || c.turno_id || etiquetaTienda(c.sucursal || c.sucursal_id)}</small>
                              </div>
                            </td>
                            <td style={{ fontWeight: 700 }}>{folio}</td>
                            <td title="Peso mexicano">🇲🇽</td>
                            <td>
                              <Avatar nombre={c.usuario} />
                            </td>
                            <td>
                              <span className="consultas-ok" title={ok ? 'Cuadre OK' : `Dif. ${fmtMonto(c.diferencia)}`}>
                                {ok ? '✓' : '!'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              )}

              {seccion === 'cajas_saldos' && (
                saldosFiltrados.length === 0 ? (
                  <EmptyState texto="Sin turnos configurados o sin datos de ventas." />
                ) : (
                  <div className="consultas-saldos">
                    <p className="muted" style={{ margin: '0 0 0.35rem', fontSize: '0.8rem' }}>
                      Venta acumulada al momento. Se actualiza sola cada 15 s. El saldo sigue visible hasta que
                      cierres el corte de ese turno (luego pasa a Cortes de caja).
                    </p>
                    {saldosFiltrados.map((s) => (
                      <div
                        key={s.id}
                        className={`consultas-saldo-card${s.corteCerrado ? ' consultas-saldo-card--cerrado' : ''}`}
                      >
                        <div>
                          <div className="consultas-saldo-nombre">
                            {s.nombreCaja}
                            {s.enCurso ? (
                              <span className="consultas-saldo-badge en-curso">En curso</span>
                            ) : (
                              <span className="consultas-saldo-badge cerrado">Corte cerrado</span>
                            )}
                          </div>
                          <div className="consultas-saldo-moneda">
                            🇲🇽 Peso mexicano-MXN
                            <span className="muted">
                              {' '}
                              · {s.fecha}
                              {!s.sinMovimiento && ` · ${s.tickets} ticket(s) · efectivo ${fmtMonto(s.efectivo)}`}
                            </span>
                          </div>
                        </div>
                        <div className="consultas-saldo-right">
                          {s.corteCerrado ? (
                            <>
                              <div className="muted" style={{ fontSize: '0.8rem', textAlign: 'right' }}>
                                Cerrado
                                {s.corte?.usuario ? ` · ${s.corte.usuario}` : ''}
                              </div>
                              <div className="consultas-saldo-monto">
                                {fmtMonto(s.corte?.total_ventas ?? s.saldo)}
                              </div>
                            </>
                          ) : s.sinMovimiento ? (
                            <div className="muted" style={{ fontSize: '0.85rem' }}>
                              Sin movimiento
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="consultas-link"
                                onClick={() => setSelSaldo(selSaldo?.id === s.id ? null : s)}
                              >
                                {selSaldo?.id === s.id ? 'Ocultar' : 'Ver detalle'}
                              </button>
                              <div className="consultas-saldo-monto">{fmtMonto(s.saldo)}</div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {sel && (seccion === 'ventas_tickets' || seccion === 'cfdi_ventas') && (
              <div className="consultas-detail">
                <h4>Ticket {folioNumerico(sel.id, 5)}</h4>
                {articulosDeVenta(sel).length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    Este ticket no tiene detalle de productos.
                  </p>
                ) : (
                  <table className="consultas-table">
                    <thead>
                      <tr>
                        <th>Piezas</th>
                        <th>Descripción</th>
                        <th>Precio</th>
                        <th>Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {articulosDeVenta(sel).map((a, i) => {
                        const piezas = Number(a.qty ?? a.cantidad ?? 1) || 1;
                        const precio = Number(a.precio) || 0;
                        const importe = Number(a.importe ?? a.subtotal) || precio * piezas;
                        return (
                          <tr key={`${a.id || a.codigo || 'art'}_${i}`}>
                            <td style={{ fontWeight: 700 }}>{piezas}</td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{a.nombre || a.descripcion || a.id || '—'}</div>
                              {(a.id || a.codigo) && (
                                <div className="muted" style={{ fontSize: '0.75rem' }}>
                                  {a.id || a.codigo}
                                </div>
                              )}
                            </td>
                            <td>{fmtMonto(precio)}</td>
                            <td style={{ fontWeight: 600 }}>{fmtMonto(importe)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <div className="consultas-detail-foot">
                  <span>
                    {sel.metodo_pago || '—'} · {etiquetaTienda(sel.sucursal_id)} · {sel.vendedor || '—'}
                  </span>
                  <strong>Total {fmtMonto(sel.total)}</strong>
                </div>
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

            {sel && seccion === 'cajas_cortes' && (
              <div className="consultas-detail">
                <h4>
                  Corte {folioNumerico(sel.id, 3)} · {sel.turno_nombre || sel.turno_id || '—'}
                </h4>
                <div className="grid-2" style={{ gap: '0.5rem', fontSize: '0.9rem' }}>
                  <div>Usuario: <strong>{sel.usuario || '—'}</strong></div>
                  <div>Sucursal: <strong>{etiquetaTienda(sel.sucursal || sel.sucursal_id)}</strong></div>
                  <div>Ventas: <strong>{fmtMonto(sel.totalVentas ?? sel.total_ventas)}</strong></div>
                  <div>Contado: <strong>{fmtMonto(sel.efectivoContado ?? sel.efectivo_contado)}</strong></div>
                  <div>Esperado: <strong>{fmtMonto(sel.efectivoEsperado ?? sel.efectivo_esperado)}</strong></div>
                  <div>Diferencia: {moneyCell(sel.diferencia)}</div>
                </div>
              </div>
            )}

            {selSaldo && seccion === 'cajas_saldos' && selSaldo.enCurso && !selSaldo.sinMovimiento && (
              <div className="consultas-detail">
                <h4>
                  {selSaldo.nombreCaja} · venta al momento ({selSaldo.fecha})
                </h4>
                <div className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  Total neto {fmtMonto(selSaldo.saldo)} · Efectivo {fmtMonto(selSaldo.efectivo)} · Electrónico{' '}
                  {fmtMonto(selSaldo.electronico)} · visible hasta cerrar el corte
                </div>
                <table className="consultas-table">
                  <thead>
                    <tr>
                      <th>Folio</th>
                      <th>Hora</th>
                      <th>Vendedor</th>
                      <th>Pago</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selSaldo.ventas || []).map((v) => (
                      <tr key={v.id}>
                        <td style={{ fontWeight: 700 }}>{folioNumerico(v.id, 5)}</td>
                        <td style={{ fontSize: '0.82rem' }}>{fmtFechaCorta(v.created_at)}</td>
                        <td>{v.vendedor || '—'}</td>
                        <td style={{ fontSize: '0.82rem' }}>{v.metodo_pago || '—'}</td>
                        <td>{fmtMonto(v.total)}</td>
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
