import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { etiquetaCuentaRt, cuentaRtMercanciaPorDefecto } from '../lib/rtCuentas.js';
import {
  armarAcreditacionesLiquidacion,
  calcularNetosLiquidacion,
  fmtMonto,
  liquidarMovimientos,
  listarEnTransitoPorRepartidor,
  listarRepartidores,
} from '../lib/controlEfectivo.js';
import { esRolRepartidor, normalizarRol } from '../lib/roles.js';
import { listarCamionesRuta, resolverCamionVendedor } from '../lib/rutaCamiones.js';
import { leerFilasInventario } from '../lib/resumenInventarioCamion.js';
import { TZ_NOGALES } from './RelojNogales.jsx';
import {
  armarTableroTiendas,
  idsMovimientosMarcados,
  incorporarVentasCredito,
  nombreCortoCamion,
  totalLiquidable,
  valoresInventarioCamion,
} from '../lib/tableroCamionPreinventario.js';

async function leerCxcDeVentas(supabase, ventas) {
  const ventaIds = [...new Set((ventas || []).map((v) => v.id).filter(Boolean).map(String))];
  if (!ventaIds.length) return [];
  const rows = [];
  const traer = async (campo, ids) => {
    for (let i = 0; i < ids.length; i += 80) {
      const slice = ids.slice(i, i + 80);
      if (!slice.length) continue;
      const { data, error } = await supabase.from('ruta_cxc_movimientos').select('*').in(campo, slice);
      if (error) throw new Error(error.message);
      rows.push(...(data || []));
    }
  };
  await traer('venta_id', ventaIds);
  const cargoIds = [...new Set(rows.filter((r) => r.tipo === 'cargo').map((r) => r.id).filter(Boolean).map(String))];
  await traer('cargo_id', cargoIds);
  const vistos = new Set();
  return rows.filter((r) => {
    const id = String(r.id);
    if (vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });
}

const formato = new Intl.DateTimeFormat('es-MX', {
  timeZone: TZ_NOGALES,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function fechaLarga(valor) {
  if (!valor) return 'Sin fecha';
  const d = new Date(valor);
  if (!Number.isFinite(d.getTime())) return 'Sin fecha';
  return formato.format(d).replace(',', '');
}

const TIPO = {
  efectivo: { label: 'Efectivo', fondo: '#15803d' },
  credito: { label: 'Crédito', fondo: '#dc2626' },
  mixto: { label: 'Mixto', fondo: '#c2410c' },
};

function Kpi({ fondo, titulo, monto, icon, children, colorMonto = '#fff' }) {
  return (
    <div style={{ background: fondo, color: '#fff', borderRadius: 14, padding: '0.75rem 0.8rem', minHeight: 118, boxShadow: '0 8px 18px rgba(8, 20, 60, 0.18)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '0.92rem' }}>
        <Icon name={icon} size={18} />
        {titulo}
      </div>
      <div style={{ marginTop: '0.35rem', fontSize: '1.35rem', fontWeight: 900, color: colorMonto, fontVariantNumeric: 'tabular-nums' }}>
        {fmtMonto(monto)}
      </div>
      {children}
    </div>
  );
}

/**
 * Tablero de Preinventario: inventario del camión a precio de ruta
 * y efectivo en tránsito por tienda, con el detalle de tickets.
 */
export default function TableroInventarioCamion({ supabase, user }) {
  const [camiones, setCamiones] = useState([]);
  const [camionId, setCamionId] = useState('');
  const [repartidores, setRepartidores] = useState([]);
  const [inventario, setInventario] = useState({ cargado: 0, disponible: 0, vendido: 0 });
  const [ultimaCarga, setUltimaCarga] = useState(null);
  const [actualizado, setActualizado] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [tablero, setTablero] = useState({ filas: [], totales: { count: 0, efectivo: 0, credito: 0, abono: 0, total: 0 } });
  const [marcas, setMarcas] = useState({});
  const [tiendaAbierta, setTiendaAbierta] = useState('');
  const [ticketAbierto, setTicketAbierto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const rol = normalizarRol(user?.rol);
  const puedeLiquidar = rol === 'Administrador' || rol === 'Gerente';
  const camion = camiones.find((c) => String(c.id) === String(camionId)) || null;
  const nombre = nombreCortoCamion(camion);
  const rep = useMemo(() => {
    const rid = String(camion?.repartidor_id || '');
    return repartidores.find((r) => String(r.id) === rid) || null;
  }, [camion, repartidores]);

  useEffect(() => {
    if (!supabase) return undefined;
    let vivo = true;
    (async () => {
      try {
        const [cams, reps] = await Promise.all([
          listarCamionesRuta(supabase, { soloActivos: true }),
          listarRepartidores(supabase),
        ]);
        if (!vivo) return;
        let lista = cams.data || [];
        if (esRolRepartidor(user?.rol) && user?.id) {
          const propio = await resolverCamionVendedor(supabase, { id: user.id, usuario_id: user.id, nombre: user.nombre });
          if (propio.data?.id) lista = lista.filter((c) => String(c.id) === String(propio.data.id));
          else if (propio.data) lista = [propio.data];
        }
        setCamiones(lista);
        setRepartidores(reps || []);
        setCamionId((prev) => prev || lista[0]?.id || '');
        if (cams.error) setError(cams.error);
      } catch (e) {
        if (vivo) setError(e.message || 'No se pudieron cargar los camiones.');
      }
    })();
    return () => { vivo = false; };
  }, [supabase, user?.rol, user?.id, user?.nombre]);

  const cargar = useCallback(async () => {
    if (!supabase || !camion) return;
    setCargando(true);
    setError('');
    try {
      const cargas = await leerFilasInventario(() => supabase.from('ruta_cargas')
        .select('id, folio, vendedor_nombre, vendedor_id')
        .eq('camion_id', camion.id)
        .eq('estado', 'en_ruta'));
      const lineas = [];
      for (let i = 0; i < cargas.length; i += 80) {
        const ids = cargas.slice(i, i + 80).map((c) => c.id);
        if (!ids.length) continue;
        lineas.push(...await leerFilasInventario(() => supabase.from('ruta_carga_lineas')
          .select('id, producto_id, precio, qty_cargada, qty_vendida, qty_devuelta')
          .in('carga_id', ids)));
      }
      const idsProducto = [...new Set(lineas.map((l) => l.producto_id).filter(Boolean))];
      const productos = [];
      for (let i = 0; i < idsProducto.length; i += 100) {
        productos.push(...await leerFilasInventario(() => supabase.from('productos')
          .select('id, precio_ruta')
          .in('id', idsProducto.slice(i, i + 100))));
      }
      const evento = await supabase.from('ruta_carga_eventos')
        .select('created_at')
        .eq('camion_id', camion.id)
        .order('created_at', { ascending: false })
        .limit(1);
      let repId = String(camion.repartidor_id || '');
      if (!repId) {
        const nombreVendedor = String(cargas[0]?.vendedor_nombre || '').trim().toLowerCase();
        const match = repartidores.find((r) => String(r.nombre || '').trim().toLowerCase() === nombreVendedor);
        repId = match?.id ? String(match.id) : '';
      }
      const movs = repId ? await listarEnTransitoPorRepartidor(supabase, repId) : [];
      let ventas = [];
      const cargaIds = cargas.map((c) => c.id);
      if (cargaIds.length) {
        const { data, error: eV } = await supabase.from('ruta_ventas')
          .select('id, folio, articulos, metodo_pago, total, created_at, cliente_id, estado, carga_id')
          .in('carga_id', cargaIds)
          .order('created_at', { ascending: false })
          .limit(400);
        if (eV) throw new Error(eV.message);
        ventas = (data || []).filter((v) => String(v.estado || '').toLowerCase() !== 'cancelada');
      }
      let cxc = [];
      try {
        cxc = await leerCxcDeVentas(supabase, ventas);
      } catch {
        cxc = [];
      }
      const next = incorporarVentasCredito(armarTableroTiendas(movs, ventas), ventas, cxc);
      setInventario(valoresInventarioCamion(lineas, productos));
      setUltimaCarga(evento.error ? null : evento.data?.[0]?.created_at || null);
      setActualizado(new Date().toISOString());
      setMovimientos(movs);
      setTablero(next);
      setMarcas(Object.fromEntries(next.filas.map((f) => [f.tienda, true])));
      setTiendaAbierta((prev) => (next.filas.some((f) => f.tienda === prev) ? prev : ''));
    } catch (e) {
      setError(e.message || 'No se pudo leer el inventario del camión.');
    } finally {
      setCargando(false);
    }
  }, [supabase, camion, repartidores]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const aLiquidar = useMemo(() => totalLiquidable(tablero.filas, marcas), [tablero.filas, marcas]);
  const abierta = tablero.filas.find((f) => f.tienda === tiendaAbierta) || null;

  const liquidar = async () => {
    if (!puedeLiquidar) {
      alert('Solo un administrador o gerente puede liquidar el efectivo en tránsito.');
      return;
    }
    const ids = idsMovimientosMarcados(tablero.filas, marcas);
    if (!ids.length) return alert('Marca al menos una tienda para liquidar.');
    const items = movimientos.filter((m) => ids.includes(m.id));
    const cuenta = cuentaRtMercanciaPorDefecto(user?.nombre);
    const { acreditaciones } = armarAcreditacionesLiquidacion({
      seleccionados: items,
      totalGastos: 0,
      cuentaRtMercancia: cuenta,
      cuentaRtServicios: null,
      repartidorNombre: rep?.nombre || nombre,
    });
    const merc = acreditaciones.filter((a) => a.tipoPartida === 'mercancia');
    if (!merc.length) return alert('No hay efectivo de mercancía para liquidar.');
    const netos = calcularNetosLiquidacion(items, 0);
    if (!window.confirm(
      `¿Liquidar ${fmtMonto(netos.netoMercancia)} de ${nombre}?\n\n`
      + `Efectivo en tránsito: ${fmtMonto(netos.netoMercancia)}\n`
      + `El crédito por cobrar no entra a esta liquidación.\n`
      + `Se acredita a ${etiquetaCuentaRt(cuenta)}.`,
    )) return;
    setGuardando(true);
    try {
      const res = await liquidarMovimientos(supabase, {
        ids,
        adminNombre: user?.nombre || rol,
        repartidorNombre: rep?.nombre || nombre,
        acreditaciones: merc,
        montoLiquidacion: netos.netoMercancia,
        omitirGastos: true,
      });
      if (!res.ok) return alert(res.error || 'No se pudo liquidar.');
      alert(`Liquidación sellada · ${fmtMonto(res.montoTotal || netos.netoMercancia)}`);
      setTiendaAbierta('');
      await cargar();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', background: 'linear-gradient(180deg, #071633 0%, #0c2a62 42%, #12357a 100%)', borderRadius: 18, padding: '0.85rem', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: 'linear-gradient(180deg,#ffe08a,#e19929)', color: '#1e3a8a', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name="truck" size={28} />
        </div>
        <div style={{ flex: '1 1 180px' }}>
          <div style={{ fontSize: '0.72rem', letterSpacing: '0.12em', fontWeight: 800, opacity: 0.75 }}>INVENTARIO</div>
          <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900 }}>
            Camión <span style={{ color: '#f6c445' }}>{nombre}</span>
          </h3>
        </div>
        {camiones.length > 1 && (
          <label className="muted" style={{ color: '#dbe7ff', fontSize: '0.75rem' }}>
            Camión
            <select className="input" value={camionId} onChange={(e) => setCamionId(e.target.value)} style={{ marginTop: 4, minWidth: 140 }}>
              {camiones.map((c) => (
                <option key={c.id} value={c.id}>{nombreCortoCamion(c)}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && <p style={{ margin: 0, color: '#fecaca', fontSize: '0.85rem' }}>{error}</p>}
      {!camion && !cargando && <p style={{ margin: 0, color: '#dbe7ff' }}>No hay un camión activo para mostrar.</p>}

      <div className="tablero-camion-kpis">
        <Kpi fondo="linear-gradient(180deg,#1f9d4a,#127a34)" titulo="Cargado en ruta" monto={inventario.cargado} icon="package">
          <div style={{ marginTop: '0.45rem', background: 'rgba(0,0,0,0.18)', borderRadius: 8, padding: '0.35rem 0.45rem', fontSize: '0.72rem' }}>
            Última carga:<br />{fechaLarga(ultimaCarga)}
          </div>
        </Kpi>
        <Kpi fondo="linear-gradient(180deg,#2f6fe4,#1d4ed8)" titulo="Disponible actual" monto={inventario.disponible} icon="refresh">
          <div style={{ marginTop: '0.45rem', background: 'rgba(0,0,0,0.18)', borderRadius: 8, padding: '0.35rem 0.45rem', fontSize: '0.72rem' }}>
            Actualizado:<br />{fechaLarga(actualizado)}
          </div>
        </Kpi>
        <Kpi fondo="linear-gradient(160deg,#f0b429,#e07a1a 55%,#d62828)" titulo="Venta total" monto={tablero.totales.total} icon="cart">
          <div style={{ display: 'grid', gap: 4, marginTop: '0.45rem' }}>
            <div style={{ background: '#15803d', borderRadius: 8, padding: '0.2rem 0.45rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 800 }}>
              <span>Efectivo:</span><span>{fmtMonto(tablero.totales.efectivo)}</span>
            </div>
            <div style={{ background: '#dc2626', borderRadius: 8, padding: '0.2rem 0.45rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 800 }}>
              <span>Crédito:</span><span>{fmtMonto(tablero.totales.credito)}</span>
            </div>
            <div style={{ background: '#166534', borderRadius: 8, padding: '0.2rem 0.45rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 800 }}>
              <span>Abonos:</span><span>{fmtMonto(tablero.totales.abono)}</span>
            </div>
          </div>
        </Kpi>
        <div style={{ background: 'linear-gradient(180deg,#123a86,#0b2f72)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 14, padding: '0.75rem 0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#f6c445', fontWeight: 900, fontSize: '1.05rem' }}>
            <Icon name="building" size={18} />
            Venta mixto
          </div>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: '#dbe7ff' }}>
            Toca una tienda para ver sus tickets.
          </p>
        </div>
      </div>

      <div className="tablero-camion-split">
        <div style={{ background: '#f4f7ff', color: '#0f172a', borderRadius: 14, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr>
                {[
                  ['Tienda', '#1d4ed8'],
                  ['Mov.', '#1d4ed8'],
                  ['Venta total', '#e07a1a'],
                  ['Efectivo', '#15803d'],
                  ['Crédito', '#dc2626'],
                  ['Abono', '#166534'],
                ].map(([label, fondo]) => (
                  <th key={label} style={{ background: fondo, color: '#fff', padding: '0.45rem 0.4rem', textAlign: label === 'Tienda' ? 'left' : 'center' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tablero.filas.map((f) => {
                const activa = f.tienda === tiendaAbierta;
                return (
                  <tr key={f.tienda} style={{ background: activa ? '#e0ecff' : '#fff' }}>
                    <td style={{ padding: '0.4rem' }}>
                      <button type="button" onClick={() => { setTiendaAbierta(f.tienda); setTicketAbierto(''); }} style={{ background: 'none', border: 'none', color: '#1d4ed8', fontWeight: 900, cursor: 'pointer', padding: 0 }}>
                        {f.tienda}
                      </button>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setMarcas((prev) => ({ ...prev, [f.tienda]: prev[f.tienda] === false }))}
                        title={marcas[f.tienda] === false ? 'Marcar para liquidar' : 'Quitar de la liquidación'}
                        style={{
                          minWidth: 28,
                          border: 'none',
                          borderRadius: 999,
                          background: marcas[f.tienda] === false ? '#94a3b8' : '#2563eb',
                          color: '#fff',
                          fontWeight: 900,
                          cursor: 'pointer',
                          padding: '0.15rem 0.45rem',
                        }}
                      >
                        {f.count}
                      </button>
                    </td>
                    <td style={{ textAlign: 'center', color: '#c2410c', fontWeight: 800 }}>{fmtMonto(f.total)}</td>
                    <td style={{ textAlign: 'center', color: '#15803d', fontWeight: 800 }}>{fmtMonto(f.efectivo)}</td>
                    <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 800 }}>{fmtMonto(f.credito)}</td>
                    <td style={{ textAlign: 'center', color: '#166534', fontWeight: 800 }}>{fmtMonto(f.abono)}</td>
                  </tr>
                );
              })}
              {!tablero.filas.length && (
                <tr>
                  <td colSpan={6} style={{ padding: '0.8rem', color: '#64748b' }}>
                    {cargando ? 'Cargando tiendas…' : 'Sin ventas de efectivo o crédito para este camión.'}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: '#123a86', color: '#fff', fontWeight: 900 }}>
                <td style={{ padding: '0.45rem' }}>Total</td>
                <td style={{ textAlign: 'center' }}>{tablero.totales.count}</td>
                <td style={{ textAlign: 'center', background: '#e07a1a' }}>{fmtMonto(tablero.totales.total)}</td>
                <td style={{ textAlign: 'center', background: '#15803d' }}>{fmtMonto(tablero.totales.efectivo)}</td>
                <td style={{ textAlign: 'center', background: '#dc2626' }}>{fmtMonto(tablero.totales.credito)}</td>
                <td style={{ textAlign: 'center', background: '#166534' }}>{fmtMonto(tablero.totales.abono)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <aside style={{ background: '#f8fbff', color: '#0f172a', borderRadius: 14, border: '1px solid rgba(37,99,235,0.25)', padding: '0.75rem', minHeight: 180 }}>
          {!abierta ? (
            <p style={{ margin: 0, color: '#475569', fontSize: '0.85rem' }}>
              Elige una tienda de la tabla. El número azul marca o quita esa tienda de la liquidación.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <strong style={{ color: '#1d4ed8', fontSize: '1.05rem' }}>{abierta.tienda}</strong>
                <span style={{ background: '#1d4ed8', color: '#fff', borderRadius: 999, padding: '0.15rem 0.55rem', fontSize: '0.75rem', fontWeight: 800 }}>
                  {abierta.count} movimiento{abierta.count === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.4rem', margin: '0.65rem 0' }}>
                <Mini label="Total tienda" valor={abierta.total} color="#1d4ed8" />
                <Mini label="Efectivo" valor={abierta.efectivo} color="#15803d" />
                <Mini label="Crédito" valor={abierta.credito} color="#dc2626" />
                <Mini label="Abono" valor={abierta.abono} color="#166534" />
              </div>
              <div style={{ fontWeight: 800, marginBottom: '0.35rem' }}>Tickets de la tienda</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {abierta.tickets.filter((t) => !t.reemplazado).map((t) => {
                  const tipo = TIPO[t.tipo] || TIPO.efectivo;
                  const abierto = ticketAbierto === t.id;
                  return (
                    <div key={t.id || t.folio} style={{ background: '#fff', border: '1px solid #dbe4f5', borderRadius: 12, padding: '0.55rem 0.65rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem', alignItems: 'center' }}>
                        <strong>Ticket {t.folio}</strong>
                        <span style={{ background: tipo.fondo, color: '#fff', borderRadius: 999, fontSize: '0.68rem', fontWeight: 800, padding: '0.1rem 0.45rem' }}>{tipo.label}</span>
                      </div>
                      <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.2rem' }}>{fechaLarga(t.fecha)}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem', gap: '0.4rem' }}>
                        <div style={{ fontSize: '0.78rem' }}>
                          {t.productos > 0 && <div>Productos: {t.productos}</div>}
                          <div>Subtotal: <strong>{fmtMonto(t.subtotal)}</strong></div>
                          {t.origen === 'credito' || t.abono > 0 ? (
                            <div>Abono: <strong>{fmtMonto(t.abono)}</strong> · Saldo: <strong>{fmtMonto(t.saldo)}</strong></div>
                          ) : null}
                        </div>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => setTicketAbierto(abierto ? '' : t.id)}>
                          {abierto ? 'Ocultar' : 'Ver ticket'}
                        </button>
                      </div>
                      {abierto && (
                        <ul style={{ margin: '0.45rem 0 0', paddingLeft: '1rem', fontSize: '0.78rem' }}>
                          {t.articulos.length ? t.articulos.map((a, i) => (
                            <li key={`${a.nombre}-${i}`}>{a.cantidad} × {a.nombre} · {fmtMonto(a.importe)}</li>
                          )) : <li>Sin desglose de productos en esta venta.</li>}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
              <button type="button" className="btn btn-ghost" style={{ marginTop: '0.65rem', width: '100%' }} onClick={() => setTiendaAbierta('')}>
                Cerrar detalle
              </button>
            </>
          )}
        </aside>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(220,252,231,0.12)', border: '1px solid rgba(134,239,172,0.45)', borderRadius: 14, padding: '0.7rem 0.8rem' }}>
        <div>
          <div style={{ fontWeight: 900 }}>Liquidar todo el efectivo en tránsito</div>
          <div style={{ fontSize: '0.78rem', color: '#dbe7ff' }}>Todas las tiendas de este recolector (solo lo marcado).</div>
        </div>
        <button type="button" onClick={liquidar} disabled={guardando || !aLiquidar} style={{ background: 'linear-gradient(180deg,#22c55e,#15803d)', color: '#fff', border: 'none', borderRadius: 12, padding: '0.55rem 0.8rem', fontWeight: 900, cursor: 'pointer', minWidth: 160 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>Total a liquidar</div>
          <div style={{ fontSize: '1.15rem' }}>{fmtMonto(aLiquidar)}</div>
        </button>
      </div>
    </section>
  );
}

function Mini({ label, valor, color }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: '0.4rem', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{label}</div>
      <div style={{ fontWeight: 900, color, fontSize: '0.85rem' }}>{fmtMonto(valor)}</div>
    </div>
  );
}
