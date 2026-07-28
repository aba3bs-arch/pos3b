import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { consultarVentas } from '../lib/ventasQuery.js';
import { consultarCortes, etiquetaGrupoPago } from '../lib/corteCaja.js';
import { etiquetaTienda, esAlmacenCentral } from '../constants/sucursales.js';
import { etiquetaDepartamento, listarDepartamentos } from '../lib/departamentos.js';
import { mensajeErrorColumnasProducto, productoDesdeDb, productoParaGuardar } from '../lib/productoForm.js';
import CampoCodigo from '../components/CampoCodigo.jsx';
import FiltroPeriodo from '../components/FiltroPeriodo.jsx';
import {
  FILTROS_EVENTO_PRODUCTO,
  FILTROS_TIPO_MOVIMIENTO,
  buscarProductos,
  etiquetaTipoMovimiento,
  listarMovimientosInventario,
  cargarReporteMovimientosInventario,
  agruparVentasConsulta,
  timelineProducto,
  ventasConProducto,
  PRESETS_FECHA_PRODUCTO,
  rangoDesdePreset,
} from '../lib/consultasInventario.js';
import { inventarioParaSucursal } from '../lib/inventarioMultitienda.js';
import { registrarCambioPrecio } from '../lib/inventarioMovimientos.js';
import { leerTurnos, nombreTurnoLegible } from '../lib/turnos.js';

function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX');
}

function fmtDif(n) {
  const v = Number(n) || 0;
  const color = Math.abs(v) < 0.01 ? 'var(--brand-green)' : v > 0 ? 'var(--brand-blue)' : 'var(--brand-red)';
  return <span style={{ color, fontWeight: 700 }}>${v.toFixed(2)}</span>;
}

function badgeTipo(tipo, modo) {
  const colors = {
    entrada: { bg: 'rgba(34,197,94,0.15)', c: 'var(--brand-green)' },
    retiro: { bg: 'rgba(211,47,47,0.12)', c: 'var(--brand-red)' },
    traspaso: { bg: 'rgba(59,105,181,0.12)', c: 'var(--brand-blue)' },
    venta: { bg: 'rgba(225,153,41,0.2)', c: '#b45309' },
    cambio_precio: { bg: 'rgba(124,58,237,0.12)', c: '#6d28d9' },
    cancelacion: { bg: 'rgba(34,197,94,0.15)', c: 'var(--brand-green)' },
    ajuste: { bg: 'rgba(59,105,181,0.12)', c: 'var(--brand-blue)' },
  };
  const key = tipo === 'entrada' && modo === 'cancelacion' ? 'cancelacion' : tipo;
  const s = colors[key] || { bg: 'var(--surface)', c: 'var(--muted)' };
  const label = etiquetaTipoMovimiento(tipo, modo);
  return (
    <span className="badge" style={{ background: s.bg, color: s.c, fontSize: '0.72rem' }}>
      {label}
    </span>
  );
}

export default function Consultas({ supabase, inventario, sucursal, sucursalesLista, cargarDatos, user }) {
  const [pestana, setPestana] = useState('ventas');
  const [desde, setDesde] = useState(() => new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [filtroSucursal, setFiltroSucursal] = useState(() => (esAlmacenCentral(sucursal) ? '' : sucursal || ''));
  const [vendedor, setVendedor] = useState('');
  const [filtroTurnoVentas, setFiltroTurnoVentas] = useState('');
  const [grupoVentaDetalle, setGrupoVentaDetalle] = useState(null);
  const [cajero, setCajero] = useState('');
  const [tipoDiferencia, setTipoDiferencia] = useState('');
  const [corteId, setCorteId] = useState('');
  const [ventas, setVentas] = useState([]);
  const [cortes, setCortes] = useState([]);
  const [corteDetalle, setCorteDetalle] = useState(null);
  const [sku, setSku] = useState('');
  const [productoSelId, setProductoSelId] = useState('');
  const [filtroEventoProducto, setFiltroEventoProducto] = useState('todos');
  const [editando, setEditando] = useState(false);
  const [formProducto, setFormProducto] = useState(null);
  const [ventasProducto, setVentasProducto] = useState([]);
  const [tipoMovInv, setTipoMovInv] = useState('');
  const [skuMovInv, setSkuMovInv] = useState('');
  const [movimientosInv, setMovimientosInv] = useState([]);
  const [resumenMovInv, setResumenMovInv] = useState(null);
  const [avisoMovInv, setAvisoMovInv] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMov, setLoadingMov] = useState(false);
  const [avisoCortes, setAvisoCortes] = useState('');
  const [presetFechaProducto, setPresetFechaProducto] = useState('7d');
  const [desdeProducto, setDesdeProducto] = useState(() => rangoDesdePreset('7d').desde);
  const [hastaProducto, setHastaProducto] = useState(() => rangoDesdePreset('7d').hasta);
  const [presetFechaInv, setPresetFechaInv] = useState('7d');
  const [filtroEventoInv, setFiltroEventoInv] = useState('todos');

  const tiendaConsulta = filtroSucursal || sucursal || 'MAIN';
  const inventarioVista = useMemo(() => inventarioParaSucursal(inventario, tiendaConsulta), [inventario, tiendaConsulta]);

  const tiendas = sucursalesLista?.length ? sucursalesLista : [sucursal || 'MAIN'].filter(Boolean);
  const departamentos = useMemo(() => listarDepartamentos(inventarioVista), [inventarioVista]);

  const productoMatches = useMemo(() => buscarProductos(inventarioVista, sku).slice(0, 20), [inventarioVista, sku]);

  const productoActivo = useMemo(() => {
    if (productoSelId) return inventarioVista.find((p) => p.id === productoSelId) || null;
    if (sku.trim() && productoMatches.length === 1) return productoMatches[0];
    return null;
  }, [inventarioVista, productoSelId, sku, productoMatches]);

  const buscarVentas = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setGrupoVentaDetalle(null);
    const ini = new Date(`${String(desde).slice(0, 10)}T00:00:00`);
    const fin = new Date(`${String(hasta).slice(0, 10)}T23:59:59.999`);
    const { data, error, aviso } = await consultarVentas(supabase, {
      columns: 'id,total,metodo_pago,vendedor,sucursal_id,articulos,created_at,turno_id,turno_nombre',
      desde: ini,
      hasta: fin,
      sucursal: filtroSucursal || null,
      limit: 2000,
    });
    setLoading(false);
    if (error) {
      // Reintento sin columnas de turno
      if (String(error).includes('turno')) {
        const r2 = await consultarVentas(supabase, {
          columns: 'id,total,metodo_pago,vendedor,sucursal_id,articulos,created_at',
          desde: ini,
          hasta: fin,
          sucursal: filtroSucursal || null,
          limit: 2000,
        });
        if (r2.error) {
          alert(r2.error);
          setVentas([]);
          return;
        }
        let list = r2.data || [];
        if (vendedor) list = list.filter((x) => String(x.vendedor || '').toLowerCase().includes(vendedor.toLowerCase()));
        setVentas(list);
        return list;
      }
      alert(error);
      setVentas([]);
      return;
    }
    if (aviso) console.warn(aviso);
    let list = data || [];
    if (vendedor) list = list.filter((x) => String(x.vendedor || '').toLowerCase().includes(vendedor.toLowerCase()));
    setVentas(list);
    return list;
  }, [supabase, desde, hasta, filtroSucursal, vendedor]);

  const gruposVentas = useMemo(
    () => agruparVentasConsulta(ventas, { turnoFiltro: filtroTurnoVentas }),
    [ventas, filtroTurnoVentas],
  );

  const totalesVentasAgrupadas = useMemo(
    () =>
      gruposVentas.reduce(
        (a, g) => ({ tickets: a.tickets + g.tickets, total: a.total + g.total }),
        { tickets: 0, total: 0 },
      ),
    [gruposVentas],
  );

  const turnosFiltroOpts = useMemo(() => {
    const fromCfg = leerTurnos().map((t) => ({ id: t.id, label: nombreTurnoLegible(t) }));
    const fromData = new Map();
    for (const v of ventas) {
      const id = v.turno_id || v.turno_nombre;
      if (!id) continue;
      const label = v.turno_nombre || v.turno_id;
      fromData.set(String(id), label);
    }
    const merged = [...fromCfg];
    for (const [id, label] of fromData) {
      if (!merged.some((t) => String(t.id) === String(id))) merged.push({ id, label });
    }
    return merged;
  }, [ventas]);

  const cargarVentasProducto = useCallback(async () => {
    if (!supabase || !productoActivo?.id) {
      setVentasProducto([]);
      return;
    }
    const ini = new Date(desdeProducto);
    ini.setHours(0, 0, 0, 0);
    const fin = new Date(hastaProducto);
    fin.setHours(23, 59, 59, 999);
    const { data, error } = await consultarVentas(supabase, {
      columns: '*',
      desde: ini,
      hasta: fin,
      sucursal: filtroSucursal || null,
      limit: 800,
    });
    if (error) {
      console.warn(error);
      setVentasProducto([]);
      return;
    }
    setVentasProducto(data || []);
  }, [supabase, productoActivo?.id, desdeProducto, hastaProducto, filtroSucursal]);

  const buscarCortes = useCallback(async () => {
    setLoading(true);
    const { data, error, aviso, soloLocal } = await consultarCortes(supabase, {
      desde,
      hasta,
      sucursal: filtroSucursal || null,
      usuario: cajero,
      corteId: corteId || null,
      tipoDiferencia: tipoDiferencia || null,
      limit: 200,
    });
    setLoading(false);
    if (error) alert(error);
    setCortes(data || []);
    setAvisoCortes(aviso || (soloLocal ? 'Mostrando cortes guardados solo en este equipo. Ejecuta supabase/fix_cortes_caja.sql para la nube.' : ''));
    if (corteId && data?.length === 1) setCorteDetalle(data[0]);
  }, [supabase, desde, hasta, filtroSucursal, cajero, corteId, tipoDiferencia]);

  const refrescarMovimientosInv = useCallback(async () => {
    setLoadingMov(true);
    setAvisoMovInv('');
    try {
      const r = await cargarReporteMovimientosInventario(supabase, {
        desde,
        hasta,
        productoId: null,
        tipo: tipoMovInv || null,
        sucursal: filtroSucursal || null,
        q: skuMovInv.trim() || '',
      });
      let list = r.data || [];
      if (filtroEventoInv !== 'todos') {
        list = list.filter((m) => {
          if (filtroEventoInv === 'existencia') return m.stock_antes != null || m.stock_despues != null;
          if (filtroEventoInv === 'entradas') return m.tipo === 'entrada' || m.modo === 'cancelacion';
          if (filtroEventoInv === 'salidas') return m.tipo === 'retiro' || m.tipo === 'venta' || m.modo === 'venta';
          if (filtroEventoInv === 'ajustes') {
            return (
              m.tipo === 'traspaso' ||
              m.modo === 'masivo' ||
              m.modo === 'conteo_departamento' ||
              m.modo === 'vaciado_inventario'
            );
          }
          if (filtroEventoInv === 'precios') return m.tipo === 'cambio_precio';
          if (filtroEventoInv === 'cancelaciones') return m.modo === 'cancelacion' || m.tipo === 'cancelacion';
          if (filtroEventoInv === 'negativo') {
            const a = Number(m.stock_antes);
            const d = Number(m.stock_despues);
            return (Number.isFinite(a) && a < 0) || (Number.isFinite(d) && d < 0);
          }
          return true;
        });
      }
      setMovimientosInv(list);
      setResumenMovInv(r.resumen || null);
      setAvisoMovInv((r.avisos || []).join(' · '));
    } catch (e) {
      setMovimientosInv([]);
      setResumenMovInv(null);
      setAvisoMovInv(`Error: ${e?.message || e}`);
    } finally {
      setLoadingMov(false);
    }
  }, [supabase, desde, hasta, skuMovInv, tipoMovInv, filtroSucursal, filtroEventoInv]);

  useEffect(() => {
    if (pestana === 'ventas') void buscarVentas();
    if (pestana === 'cortes') void buscarCortes();
    if (pestana === 'inventario') void refrescarMovimientosInv();
  }, [pestana, supabase]);

  useEffect(() => {
    if (esAlmacenCentral(sucursal)) return;
    if (sucursal && !filtroSucursal) setFiltroSucursal(sucursal);
  }, [sucursal]);

  useEffect(() => {
    if (pestana === 'producto' && productoActivo) {
      setFormProducto({ ...productoDesdeDb(productoActivo) });
      setEditando(false);
    }
  }, [pestana, productoActivo?.id]);

  useEffect(() => {
    if (pestana === 'producto' && productoActivo) cargarVentasProducto();
  }, [pestana, productoActivo?.id, desdeProducto, hastaProducto, filtroSucursal, cargarVentasProducto]);

  const cambiarPresetFechaProducto = (preset) => {
    setPresetFechaProducto(preset);
    if (preset !== 'rango') {
      const r = rangoDesdePreset(preset);
      if (r) {
        setDesdeProducto(r.desde);
        setHastaProducto(r.hasta);
      }
    }
  };

  const cambiarPresetFechaInv = (preset) => {
    setPresetFechaInv(preset);
    if (preset !== 'rango') {
      const r = rangoDesdePreset(preset);
      if (r) {
        setDesde(r.desde);
        setHasta(r.hasta);
      }
    }
  };

  const cortesParaSelect = useMemo(() => {
    return cortes.map((c) => ({
      id: c.id,
      label: `${String(c.fecha || '').slice(0, 10)} · ${c.usuario || '—'} · ${etiquetaTienda(c.sucursal || c.sucursal_id)} · $${Number(c.efectivoContado ?? c.efectivo_contado ?? 0).toFixed(2)}`,
    }));
  }, [cortes]);

  const totalesCortes = useMemo(() => {
    return cortes.reduce(
      (acc, c) => ({
        tickets: acc.tickets + (Number(c.tickets) || 0),
        ventas: acc.ventas + (Number(c.totalVentas ?? c.total_ventas) || 0),
        faltantes: acc.faltantes + (Number(c.diferencia) < -0.01 ? 1 : 0),
      }),
      { tickets: 0, ventas: 0, faltantes: 0 },
    );
  }, [cortes]);

  const historialVentasProducto = useMemo(() => {
    if (!productoActivo) return [];
    return ventasConProducto(ventasProducto, productoActivo.id);
  }, [productoActivo, ventasProducto]);

  const timelineSinFiltro = useMemo(() => {
    if (!productoActivo) return [];
    const movs = listarMovimientosInventario({ desde: desdeProducto, hasta: hastaProducto, productoId: productoActivo.id, sucursal: filtroSucursal || null });
    return timelineProducto(productoActivo.id, ventasProducto, movs, 'todos');
  }, [productoActivo, ventasProducto, desdeProducto, hastaProducto, filtroSucursal]);

  const timeline = useMemo(() => {
    if (!productoActivo) return [];
    if (filtroEventoProducto === 'todos') return timelineSinFiltro;
    return timelineProducto(
      productoActivo.id,
      ventasProducto,
      listarMovimientosInventario({ desde: desdeProducto, hasta: hastaProducto, productoId: productoActivo.id, sucursal: filtroSucursal || null }),
      filtroEventoProducto,
    );
  }, [productoActivo, ventasProducto, desdeProducto, hastaProducto, filtroSucursal, filtroEventoProducto, timelineSinFiltro]);

  const totalesProducto = useMemo(() => {
    const vendido = historialVentasProducto.reduce((a, v) => a + Number(v.cantidad || 0), 0);
    const ingresos = historialVentasProducto.reduce((a, v) => a + Number(v.subtotal || 0), 0);
    const entradas = timelineSinFiltro.filter((e) => e.tipo === 'entrada' || (e.tipo === 'traspaso' && e.stock_despues > e.stock_antes)).reduce((a, e) => a + Number(e.cantidad || 0), 0);
    const salidas = timelineSinFiltro.filter((e) => e.tipo === 'retiro' || e.tipo === 'venta' || (e.tipo === 'traspaso' && e.stock_despues < e.stock_antes)).reduce((a, e) => a + Number(e.cantidad || 0), 0);
    return { vendido, ingresos, entradas, salidas };
  }, [historialVentasProducto, timelineSinFiltro]);

  const seleccionarProducto = (p) => {
    setProductoSelId(p.id);
    setSku(p.id);
    setEditando(false);
  };

  const guardarProducto = async () => {
    if (!supabase || !formProducto) return;
    if (!formProducto.id || !formProducto.nombre) return alert('Código y nombre son obligatorios.');
    const productoDb = inventario.find((p) => p.id === formProducto.id);
    const precioAntes = Number(productoDb?.precio);
    const precioDespues = Number(formProducto.precio);
    const payload = productoParaGuardar(formProducto, { productoDb, sucursal: tiendaConsulta });
    const { error } = await supabase.from('productos').upsert([payload]);
    if (error) {
      const aviso = mensajeErrorColumnasProducto(error);
      return alert(aviso || error.message);
    }
    if (Number.isFinite(precioAntes) && Number.isFinite(precioDespues) && precioAntes !== precioDespues) {
      await registrarCambioPrecio(supabase, {
        producto_id: formProducto.id,
        producto_nombre: formProducto.nombre,
        precio_antes: precioAntes,
        precio_despues: precioDespues,
        usuario: user?.nombre || '—',
        sucursal: tiendaConsulta,
      });
    }
    alert('Producto actualizado.');
    setEditando(false);
    cargarDatos?.();
  };

  const tabs = (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
      {[
        { id: 'ventas', label: 'Ventas' },
        { id: 'cortes', label: 'Cortes de caja' },
        { id: 'inventario', label: 'Movimientos inventario' },
        { id: 'producto', label: 'Consulta producto' },
      ].map((t) => (
        <button key={t.id} type="button" className={pestana === t.id ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setPestana(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );

  const filtrosFecha = (
    <FiltroPeriodo
      preset={presetFechaInv}
      onPresetChange={cambiarPresetFechaInv}
      desde={desde}
      hasta={hasta}
      onDesdeChange={setDesde}
      onHastaChange={setHasta}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {tabs}

      {pestana === 'ventas' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Filtros de ventas</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
              Periodo: día, semana, mes, últimos 6 meses o rango. Luego agrupa por fecha + turno (como los cortes) y usa{' '}
              <strong>Ver</strong> para el desglose de tickets.
            </p>
            {filtrosFecha}
            <div className="grid-2" style={{ marginTop: '0.75rem' }}>
              <label className="muted">
                Sucursal
                <select className="select" style={{ marginTop: '0.35rem' }} value={filtroSucursal} onChange={(e) => setFiltroSucursal(e.target.value)}>
                  <option value="">Todas</option>
                  {tiendas.map((s) => (
                    <option key={s} value={s}>
                      {etiquetaTienda(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted">
                Turno
                <select className="select" style={{ marginTop: '0.35rem' }} value={filtroTurnoVentas} onChange={(e) => setFiltroTurnoVentas(e.target.value)}>
                  <option value="">Todos los turnos</option>
                  {turnosFiltroOpts.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted">
                Vendedor (opcional)
                <input className="input" style={{ marginTop: '0.35rem' }} value={vendedor} onChange={(e) => setVendedor(e.target.value)} placeholder="Nombre parcial" />
              </label>
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={() => void buscarVentas()} disabled={loading}>
              {loading ? 'Buscando…' : 'Aplicar filtros'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
            <div className="card" style={{ padding: '0.75rem' }}>
              <div className="muted" style={{ fontSize: '0.75rem' }}>Grupos</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-blue)' }}>{gruposVentas.length}</div>
            </div>
            <div className="card" style={{ padding: '0.75rem' }}>
              <div className="muted" style={{ fontSize: '0.75rem' }}>Tickets</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{totalesVentasAgrupadas.tickets}</div>
            </div>
            <div className="card" style={{ padding: '0.75rem' }}>
              <div className="muted" style={{ fontSize: '0.75rem' }}>Total ventas</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-red)' }}>
                ${totalesVentasAgrupadas.total.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>
                Ventas agrupadas ({gruposVentas.length})
              </h3>
              <div className="table-wrap" style={{ maxHeight: '480px' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Turno</th>
                      <th>Tienda</th>
                      <th>Tickets</th>
                      <th>Total</th>
                      <th>Promedio</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {gruposVentas.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="muted">
                          {loading ? 'Cargando…' : 'Sin ventas en el rango. Elige sucursal (ej. 3B5) y periodo, luego Aplicar filtros.'}
                        </td>
                      </tr>
                    ) : (
                      gruposVentas.map((g) => (
                        <tr key={g.id} style={grupoVentaDetalle?.id === g.id ? { background: 'rgba(59,105,181,0.08)' } : undefined}>
                          <td>{g.fecha}</td>
                          <td>{g.turno_nombre}</td>
                          <td>{etiquetaTienda(g.sucursal)}</td>
                          <td>{g.tickets}</td>
                          <td style={{ fontWeight: 700 }}>${g.total.toFixed(2)}</td>
                          <td>${g.ticketPromedio.toFixed(2)}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.45rem' }}
                              onClick={() => setGrupoVentaDetalle(g)}
                            >
                              Ver
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card" style={{ borderTop: grupoVentaDetalle ? '4px solid var(--brand-green)' : undefined }}>
              <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Desglose de ventas</h3>
              {!grupoVentaDetalle ? (
                <p className="muted">Selecciona un grupo y pulsa <strong>Ver</strong> para ver los tickets del turno/día.</p>
              ) : (
                <>
                  <p className="muted" style={{ marginTop: 0, fontSize: '0.9rem' }}>
                    {grupoVentaDetalle.fecha} · {grupoVentaDetalle.turno_nombre} · {etiquetaTienda(grupoVentaDetalle.sucursal)} ·{' '}
                    {grupoVentaDetalle.tickets} ticket(s) · <strong>${grupoVentaDetalle.total.toFixed(2)}</strong>
                  </p>
                  {grupoVentaDetalle.vendedores?.length > 0 && (
                    <p className="muted" style={{ fontSize: '0.82rem' }}>
                      Vendedor(es): {grupoVentaDetalle.vendedores.join(', ')}
                    </p>
                  )}
                  {grupoVentaDetalle.detalleMetodos?.length > 0 && (
                    <ul style={{ margin: '0.5rem 0 0.75rem', paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
                      {grupoVentaDetalle.detalleMetodos.map((d) => (
                        <li key={d.metodo}>
                          {d.metodo}: <strong>${Number(d.monto).toFixed(2)}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="table-wrap" style={{ maxHeight: '360px' }}>
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Hora</th>
                          <th>Vendedor</th>
                          <th>Pago</th>
                          <th>Artículos</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupoVentaDetalle.ventas.map((v) => (
                          <tr key={v.id}>
                            <td style={{ fontSize: '0.8rem' }}>{fmtFecha(v.created_at)}</td>
                            <td>{v.vendedor}</td>
                            <td style={{ fontSize: '0.8rem' }}>{v.metodo_pago}</td>
                            <td style={{ fontSize: '0.78rem' }}>
                              {(Array.isArray(v.articulos) ? v.articulos : [])
                                .map((a) => `${a.nombre || a.id} ×${a.qty ?? 1}`)
                                .join(', ') || '—'}
                            </td>
                            <td style={{ fontWeight: 700 }}>${Number(v.total).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {pestana === 'inventario' && (
        <>
          <div className="card" style={{ borderTop: '4px solid var(--brand-green)' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Movimientos de inventario</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
              Reporte de <strong>ingresos, retiros, traspasos, ajustes/conteos, cancelaciones, ventas</strong> y{' '}
              <strong>cambios de precio</strong>. En MAIN elige <strong>Todas</strong> o <strong>3B5</strong>, periodo amplio y
              pulsa Buscar. Abajo verás un resumen de fuentes (ventas/cancelaciones/nube).
            </p>
            {filtrosFecha}
            <div className="grid-2" style={{ marginTop: '0.75rem' }}>
              <label className="muted">
                Tipo de movimiento
                <select className="select" style={{ marginTop: '0.35rem' }} value={tipoMovInv} onChange={(e) => setTipoMovInv(e.target.value)}>
                  {FILTROS_TIPO_MOVIMIENTO.map((f) => (
                    <option key={f.id || 'all'} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted">
                Producto (código o nombre)
                <div style={{ marginTop: '0.35rem' }}>
                  <CampoCodigo
                    value={skuMovInv}
                    onChange={(e) => setSkuMovInv(e.target.value)}
                    placeholder="Opcional"
                    tituloCamara="Filtrar por código"
                  />
                </div>
              </label>
              <label className="muted">
                Sucursal
                <select className="select" style={{ marginTop: '0.35rem' }} value={filtroSucursal} onChange={(e) => setFiltroSucursal(e.target.value)}>
                  <option value="">Todas</option>
                  {tiendas.map((s) => (
                    <option key={s} value={s}>
                      {etiquetaTienda(s)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <span className="muted" style={{ fontSize: '0.82rem', display: 'block', marginBottom: '0.35rem' }}>Filtrar por evento</span>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {FILTROS_EVENTO_PRODUCTO.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={filtroEventoInv === f.id ? 'btn btn-primary' : 'btn btn-ghost'}
                    style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem' }}
                    onClick={() => setFiltroEventoInv(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={() => void refrescarMovimientosInv()} disabled={loadingMov}>
              {loadingMov ? 'Buscando…' : 'Buscar movimientos'}
            </button>
            {avisoMovInv && (
              <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.82rem', color: 'var(--brand-gold-dark)' }}>
                {avisoMovInv}
              </p>
            )}
          </div>
          {resumenMovInv && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
              {[
                ['Total', resumenMovInv.total],
                ['Entradas', resumenMovInv.entradas],
                ['Salidas', resumenMovInv.salidas],
                ['Traspasos', resumenMovInv.traspasos],
                ['Ajustes', resumenMovInv.ajustes],
                ['Cancelaciones', resumenMovInv.cancelaciones],
                ['Precios', resumenMovInv.precios],
              ].map(([label, n]) => (
                <div key={label} className="card" style={{ padding: '0.65rem 0.75rem' }}>
                  <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontWeight: 800, color: 'var(--brand-blue)' }}>{n}</div>
                </div>
              ))}
            </div>
          )}
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>
              Resultados ({movimientosInv.length}){loadingMov ? ' · cargando…' : ''}
            </h3>
            <div className="table-wrap" style={{ maxHeight: '520px' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Producto</th>
                    <th>Cant.</th>
                    <th>Stock / Precio</th>
                    <th>Sucursal</th>
                    <th>Usuario</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientosInv.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="muted">
                        {loadingMov
                          ? 'Cargando movimientos…'
                          : 'Sin movimientos en el rango. Elige sucursal (ej. 3B5), amplía fechas y pulsa Buscar. Las ventas y cancelaciones de la nube sí deben aparecer aquí.'}
                      </td>
                    </tr>
                  ) : (
                    movimientosInv.map((m) => (
                      <tr key={m.id}>
                        <td style={{ fontSize: '0.82rem' }}>{fmtFecha(m.created_at)}</td>
                        <td>{badgeTipo(m.tipo, m.modo)}</td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {m.producto_nombre || m.producto_id}
                          {m.producto_destino_nombre && (
                            <span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>
                              → {m.producto_destino_nombre}
                            </span>
                          )}
                        </td>
                        <td>{m.tipo === 'cambio_precio' ? '—' : m.cantidad}</td>
                        <td style={{ fontSize: '0.8rem' }}>
                          {m.tipo === 'cambio_precio' ? (
                            <>
                              ${Number(m.precio_antes || 0).toFixed(2)} → ${Number(m.precio_despues || 0).toFixed(2)}
                            </>
                          ) : m.stock_antes != null ? (
                            `${m.stock_antes} → ${m.stock_despues}`
                          ) : (
                            '—'
                          )}
                          {m.stock_dest_despues != null && (
                            <span className="muted" style={{ display: 'block' }}>
                              dest: {m.stock_dest_antes} → {m.stock_dest_despues}
                            </span>
                          )}
                        </td>
                        <td className="muted" style={{ fontSize: '0.8rem' }}>
                          {m.sucursal ? etiquetaTienda(m.sucursal) : '—'}
                        </td>
                        <td className="muted" style={{ fontSize: '0.8rem' }}>
                          {m.usuario}
                        </td>
                        <td className="muted" style={{ fontSize: '0.78rem' }}>
                          {m.motivo || '—'}
                          {m.origen && m.origen !== 'nube' && m.origen !== 'local' && (
                            <span className="badge" style={{ marginLeft: '0.25rem' }}>{m.origen}</span>
                          )}
                          {m.modo === 'masivo' && <span className="badge" style={{ marginLeft: '0.25rem' }}>masivo</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {pestana === 'cortes' && (
        <>
          <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Filtros de cortes de caja</h3>
            {filtrosFecha}
            <div className="grid-2" style={{ marginTop: '0.75rem' }}>
              <label className="muted">
                Sucursal
                <select className="select" style={{ marginTop: '0.35rem' }} value={filtroSucursal} onChange={(e) => setFiltroSucursal(e.target.value)}>
                  <option value="">Todas</option>
                  {tiendas.map((s) => (
                    <option key={s} value={s}>
                      {etiquetaTienda(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted">
                Cajero (opcional)
                <input className="input" style={{ marginTop: '0.35rem' }} value={cajero} onChange={(e) => setCajero(e.target.value)} placeholder="Nombre parcial" />
              </label>
              <label className="muted">
                Resultado del arqueo
                <select className="select" style={{ marginTop: '0.35rem' }} value={tipoDiferencia} onChange={(e) => setTipoDiferencia(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="cuadrado">Cuadrado (sin diferencia)</option>
                  <option value="faltante">Con faltante</option>
                  <option value="sobrante">Con sobrante</option>
                </select>
              </label>
              <label className="muted">
                Corte específico
                <select
                  className="select"
                  style={{ marginTop: '0.35rem' }}
                  value={corteId}
                  onChange={(e) => {
                    setCorteId(e.target.value);
                    setCorteDetalle(null);
                  }}
                >
                  <option value="">Todos en el rango</option>
                  {cortesParaSelect.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={buscarCortes} disabled={loading}>
              {loading ? 'Buscando…' : 'Buscar cortes'}
            </button>
            {avisoCortes && (
              <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                {avisoCortes}
              </p>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
            <div className="card" style={{ padding: '0.75rem' }}>
              <div className="muted" style={{ fontSize: '0.75rem' }}>
                Cortes
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-blue)' }}>{cortes.length}</div>
            </div>
            <div className="card" style={{ padding: '0.75rem' }}>
              <div className="muted" style={{ fontSize: '0.75rem' }}>
                Tickets (suma)
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{totalesCortes.tickets}</div>
            </div>
            <div className="card" style={{ padding: '0.75rem' }}>
              <div className="muted" style={{ fontSize: '0.75rem' }}>
                Ventas en cortes
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-red)' }}>${totalesCortes.ventas.toFixed(2)}</div>
            </div>
            <div className="card" style={{ padding: '0.75rem' }}>
              <div className="muted" style={{ fontSize: '0.75rem' }}>
                Con faltante
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-red)' }}>{totalesCortes.faltantes}</div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Listado ({cortes.length})</h3>
              <div className="table-wrap" style={{ maxHeight: '420px' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Fecha corte</th>
                      <th>Turno</th>
                      <th>Hora</th>
                      <th>Cajero</th>
                      <th>Tienda</th>
                      <th>Tickets</th>
                      <th>Esperado</th>
                      <th>Contado</th>
                      <th>Dif.</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {cortes.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="muted">
                          No hay cortes en este rango. Regístralos en Corte de caja.
                        </td>
                      </tr>
                    ) : (
                      cortes.map((c) => (
                        <tr key={c.id} style={corteDetalle?.id === c.id ? { background: 'rgba(59,105,181,0.08)' } : undefined}>
                          <td>{String(c.fecha || '').slice(0, 10)}</td>
                          <td>{c.turno_nombre || c.turno_id || '—'}</td>
                          <td>{fmtFecha(c.hora || c.created_at).split(', ')[1] || fmtFecha(c.hora || c.created_at)}</td>
                          <td>{c.usuario}</td>
                          <td>{etiquetaTienda(c.sucursal || c.sucursal_id)}</td>
                          <td>{c.tickets}</td>
                          <td>${Number(c.efectivoEsperado ?? c.efectivo_esperado ?? 0).toFixed(2)}</td>
                          <td>${Number(c.efectivoContado ?? c.efectivo_contado ?? 0).toFixed(2)}</td>
                          <td>{fmtDif(c.diferencia)}</td>
                          <td>
                            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.25rem 0.45rem' }} onClick={() => setCorteDetalle(c)}>
                              Ver
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card" style={{ borderTop: corteDetalle ? '4px solid var(--brand-green)' : undefined }}>
              <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Detalle del corte</h3>
              {!corteDetalle ? (
                <p className="muted">Selecciona un corte en la tabla o elige uno en el filtro “Corte específico”.</p>
              ) : (
                <>
                  <p className="muted" style={{ marginTop: 0, fontSize: '0.9rem' }}>
                    {String(corteDetalle.fecha || '').slice(0, 10)} · {corteDetalle.usuario} · {etiquetaTienda(corteDetalle.sucursal || corteDetalle.sucursal_id)}
                    {corteDetalle.origen === 'local' && (
                      <>
                        {' '}
                        <span className="badge">Solo este equipo</span>
                      </>
                    )}
                  </p>
                  <ul style={{ margin: '0.75rem 0', paddingLeft: '1.1rem', fontSize: '0.9rem' }}>
                    <li>
                      Total vendido: <strong>${Number(corteDetalle.totalVentas ?? corteDetalle.total_ventas ?? 0).toFixed(2)}</strong> ({corteDetalle.tickets} tickets)
                    </li>
                    <li>
                      Efectivo esperado: <strong>${Number(corteDetalle.efectivoEsperado ?? corteDetalle.efectivo_esperado ?? 0).toFixed(2)}</strong>
                    </li>
                    <li>
                      Efectivo contado: <strong>${Number(corteDetalle.efectivoContado ?? corteDetalle.efectivo_contado ?? 0).toFixed(2)}</strong>
                    </li>
                    <li>
                      Diferencia: {fmtDif(corteDetalle.diferencia)}
                    </li>
                    <li>
                      Electrónico: <strong>${Number(corteDetalle.electronico ?? 0).toFixed(2)}</strong>
                    </li>
                  </ul>
                  {corteDetalle.grupos && Object.keys(corteDetalle.grupos).length > 0 && (
                    <>
                      <h4 style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>Por grupo de pago</h4>
                      <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
                        {Object.entries(corteDetalle.grupos).map(([g, m]) => (
                          <li key={g}>
                            {etiquetaGrupoPago(g)}: ${Number(m).toFixed(2)}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {(corteDetalle.detalleMetodos?.length > 0 || corteDetalle.detalle_metodos?.length > 0) && (
                    <>
                      <h4 style={{ margin: '0.75rem 0 0.35rem', fontSize: '0.9rem' }}>Por método registrado</h4>
                      <div className="table-wrap">
                        <table className="data">
                          <thead>
                            <tr>
                              <th>Método</th>
                              <th>Monto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(corteDetalle.detalleMetodos || corteDetalle.detalle_metodos || []).map((d, i) => (
                              <tr key={i}>
                                <td>{d.metodo}</td>
                                <td>${Number(d.monto).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {corteDetalle.notas && (
                    <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                      <strong>Notas:</strong> {corteDetalle.notas}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {pestana === 'producto' && (
        <>
          <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Buscar producto</h3>
            <FiltroPeriodo
              preset={presetFechaProducto}
              onPresetChange={cambiarPresetFechaProducto}
              desde={desdeProducto}
              hasta={hastaProducto}
              onDesdeChange={setDesdeProducto}
              onHastaChange={setHastaProducto}
            />
            <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
              Código o nombre
              <div style={{ marginTop: '0.35rem' }}>
                <CampoCodigo
                  value={sku}
                  onChange={(e) => {
                    setSku(e.target.value);
                    setProductoSelId('');
                  }}
                  placeholder="SKU, barras o nombre…"
                  tituloCamara="Buscar producto"
                />
              </div>
            </label>
            {sku.trim() && productoMatches.length > 0 && !productoActivo && (
              <div className="table-wrap" style={{ marginTop: '0.75rem', maxHeight: '200px' }}>
                <table className="data">
                  <tbody>
                    {productoMatches.map((p) => (
                      <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => seleccionarProducto(p)}>
                        <td>{p.id}</td>
                        <td>{p.nombre}</td>
                        <td>Stock {p.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: '0.75rem' }}
              onClick={() => productoActivo && cargarVentasProducto()}
              disabled={!productoActivo}
            >
              Actualizar historial
            </button>
          </div>

          {!productoActivo && sku.trim() && (
            <p className="muted">Sin coincidencia exacta. Elige un producto de la lista o revisa el catálogo en Productos.</p>
          )}

          {productoActivo && (
            <>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--brand-blue)' }}>{productoActivo.nombre}</strong>
                    <div className="muted" style={{ marginTop: '0.25rem' }}>
                      Código {productoActivo.id} · {etiquetaDepartamento(productoActivo.cat)} · Mín. {productoActivo.stock_minimo ?? '—'}
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-red)', marginTop: '0.5rem' }}>
                      ${Number(productoActivo.precio).toFixed(2)}
                    </div>
                    <div style={{ marginTop: '0.35rem' }}>
                      Existencia actual:{' '}
                      <strong style={Number(productoActivo.stock) < 0 ? { color: 'var(--brand-red)' } : undefined}>
                        {productoActivo.stock}
                      </strong>{' '}
                      uds.
                      {Number(productoActivo.stock) < 0 && (
                        <span className="badge" style={{ marginLeft: '0.5rem', background: 'rgba(211,47,47,0.15)', color: 'var(--brand-red)' }}>
                          Stock negativo
                        </span>
                      )}
                      {Number(productoActivo.stock) >= 0 && Number(productoActivo.stock) <= Number(productoActivo.stock_minimo ?? 6) && (
                        <span className="badge" style={{ marginLeft: '0.5rem', background: 'rgba(225,153,41,0.2)', color: '#b45309' }}>
                          Bajo mínimo
                        </span>
                      )}
                    </div>
                  </div>
                  <button type="button" className="btn btn-gold" onClick={() => setEditando((e) => !e)}>
                    {editando ? 'Cancelar edición' : 'Editar producto'}
                  </button>
                </div>

                {editando && formProducto && (
                  <div className="grid-2" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                    <label className="muted">
                      Código
                      <input className="input" style={{ marginTop: '0.35rem' }} value={formProducto.id} readOnly />
                    </label>
                    <label className="muted">
                      Nombre
                      <input className="input" style={{ marginTop: '0.35rem' }} value={formProducto.nombre} onChange={(e) => setFormProducto({ ...formProducto, nombre: e.target.value })} />
                    </label>
                    <label className="muted">
                      Precio (MXN)
                      <input className="input" type="number" step="0.01" style={{ marginTop: '0.35rem' }} value={formProducto.precio} onChange={(e) => setFormProducto({ ...formProducto, precio: parseFloat(e.target.value) || 0 })} />
                    </label>
                    <label className="muted">
                      Stock
                      <input className="input" type="number" style={{ marginTop: '0.35rem' }} value={formProducto.stock} onChange={(e) => setFormProducto({ ...formProducto, stock: parseInt(e.target.value, 10) || 0 })} />
                    </label>
                    <label className="muted">
                      Stock mínimo
                      <input className="input" type="number" style={{ marginTop: '0.35rem' }} value={formProducto.stock_minimo} onChange={(e) => setFormProducto({ ...formProducto, stock_minimo: parseInt(e.target.value, 10) || 0 })} />
                    </label>
                    <label className="muted">
                      Categoría
                      <select className="select" style={{ marginTop: '0.35rem' }} value={formProducto.cat} onChange={(e) => setFormProducto({ ...formProducto, cat: e.target.value })}>
                        {departamentos.map((d) => (
                          <option key={d} value={d}>
                            {etiquetaDepartamento(d)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <button type="button" className="btn btn-success" onClick={guardarProducto}>
                        Guardar cambios
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
                <div className="card" style={{ padding: '0.75rem' }}>
                  <div className="muted" style={{ fontSize: '0.72rem' }}>Vendido (rango)</div>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{totalesProducto.vendido} uds.</div>
                </div>
                <div className="card" style={{ padding: '0.75rem' }}>
                  <div className="muted" style={{ fontSize: '0.72rem' }}>Ingresos ventas</div>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--brand-red)' }}>${totalesProducto.ingresos.toFixed(2)}</div>
                </div>
                <div className="card" style={{ padding: '0.75rem' }}>
                  <div className="muted" style={{ fontSize: '0.72rem' }}>Entradas inv.</div>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--brand-green)' }}>{totalesProducto.entradas}</div>
                </div>
                <div className="card" style={{ padding: '0.75rem' }}>
                  <div className="muted" style={{ fontSize: '0.72rem' }}>Salidas inv.</div>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{totalesProducto.salidas}</div>
                </div>
              </div>

              <div className="card">
                <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Historial de ventas ({historialVentasProducto.length})</h3>
                <div className="table-wrap" style={{ maxHeight: '280px' }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Cant.</th>
                        <th>Subtotal</th>
                        <th>Vendedor</th>
                        <th>Sucursal</th>
                        <th>Pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historialVentasProducto.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="muted">
                            Sin ventas de este producto en el rango.
                          </td>
                        </tr>
                      ) : (
                        historialVentasProducto.map((v) => (
                          <tr key={v.id}>
                            <td style={{ fontSize: '0.82rem' }}>{fmtFecha(v.created_at)}</td>
                            <td>{v.cantidad}</td>
                            <td>${Number(v.subtotal).toFixed(2)}</td>
                            <td>{v.usuario}</td>
                            <td>{v.sucursal}</td>
                            <td style={{ fontSize: '0.8rem' }}>{v.motivo}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Movimientos del producto ({timeline.length})</h3>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {FILTROS_EVENTO_PRODUCTO.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={filtroEventoProducto === f.id ? 'btn btn-primary' : 'btn btn-ghost'}
                        style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem' }}
                        onClick={() => setFiltroEventoProducto(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.82rem' }}>
                  <strong>Todos</strong> · <strong>Existencia</strong> (stock antes/después) · <strong>Entradas</strong> · <strong>Salidas</strong> (ventas, retiros, vaciados) · <strong>Ajustes</strong> (traspasos, masivos) · <strong>Stock negativo</strong>
                </p>
                <div className="table-wrap" style={{ maxHeight: '360px' }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Cant.</th>
                        <th>Stock</th>
                        <th>Detalle</th>
                        <th>Usuario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeline.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="muted">
                            Sin movimientos con este filtro en el rango.
                          </td>
                        </tr>
                      ) : (
                        timeline.map((e) => (
                          <tr
                            key={e.id}
                            style={
                              (Number(e.stock_despues) < 0 || Number(e.stock_antes) < 0)
                                ? { background: 'rgba(211,47,47,0.06)' }
                                : undefined
                            }
                          >
                            <td style={{ fontSize: '0.82rem' }}>{fmtFecha(e.created_at)}</td>
                            <td>{badgeTipo(e.tipo, e.modo)}</td>
                            <td>{e.cantidad}</td>
                            <td style={{ fontSize: '0.8rem' }}>
                              {e.stock_antes != null ? `${e.stock_antes} → ${e.stock_despues}` : '—'}
                            </td>
                            <td style={{ fontSize: '0.85rem' }}>
                              {e.detalle || e.producto_nombre}
                              {e.motivo && <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>{e.motivo}</span>}
                            </td>
                            <td className="muted" style={{ fontSize: '0.8rem' }}>
                              {e.usuario || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
