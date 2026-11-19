import React, { useEffect, useMemo, useState } from 'react';
import { fmtMonto } from '../lib/controlEfectivo.js';
import { filasTiendaDesdeVentas } from '../lib/tableroCamionRc.js';
import { resolverCamionDeRecolector } from '../lib/auditoriaCamionRuta.js';
import CreditosPorCobrarRc from './CreditosPorCobrarRc.jsx';

function fechaCorta(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    timeZone: 'America/Hermosillo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

/**
 * Tablero del camión como en el diseño: cargado, disponible, venta,
 * tiendas y tickets. Liquidar sigue usando el efectivo que ya está en tránsito.
 */
export default function TableroCamionRc({
  supabase,
  repId,
  repNombre,
  inventario,
  onLiquidar,
  guardando,
}) {
  const [ventas, setVentas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [tienda, setTienda] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [verCreditos, setVerCreditos] = useState(false);

  useEffect(() => {
    if (!supabase || !repId) return undefined;
    let vivo = true;
    setCargando(true);
    setTienda(null);
    setTicket(null);
    void (async () => {
      const camiones = await supabase
        .from('ruta_camiones')
        .select('id, codigo, alias, usuario_id, repartidor_id, activo')
        .eq('activo', true);
      const camion = resolverCamionDeRecolector(camiones.data || [], { id: repId, repartidor_id: repId });
      let cargaIds = [];
      if (camion?.id) {
        const cargas = await supabase
          .from('ruta_cargas')
          .select('id')
          .eq('camion_id', camion.id)
          .eq('estado', 'en_ruta');
        cargaIds = (cargas.data || []).map((c) => c.id);
      }
      let rows = [];
      if (cargaIds.length) {
        const v = await supabase
          .from('ruta_ventas')
          .select('id,folio,cliente_id,cliente_tipo,cliente_nombre,metodo_pago,total,articulos,created_at,estado,estado_credito,carga_id')
          .in('carga_id', cargaIds)
          .order('created_at', { ascending: false })
          .limit(400);
        rows = v.data || [];
      }
      if (vivo) {
        setVentas(rows);
        setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [supabase, repId]);

  const tablero = useMemo(() => filasTiendaDesdeVentas(ventas), [ventas]);
  const abierta = tablero.filas.find((f) => f.clave === tienda) || null;
  const cargado = Number(inventario?.cargado) || 0;
  const disponible = Number(inventario?.disponible) || 0;
  const vendidoCamion = Math.max(0, Math.round((cargado - disponible) * 100) / 100);
  const camionNombre = inventario?.camion || 'Camión';

  if (verCreditos) {
    return (
      <CreditosPorCobrarRc
        supabase={supabase}
        onCerrar={() => setVerCreditos(false)}
      />
    );
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{
        background: 'linear-gradient(180deg, #0b3a86 0%, #08275c 100%)',
        color: '#fff',
        borderRadius: 14,
        padding: '0.85rem',
      }}
      >
        <div style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.02em', marginBottom: '0.65rem' }}>
          Inventario Camión {camionNombre}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' }}>
          <Tarjeta tono="#166534" titulo="Cargado en ruta" valor={fmtMonto(cargado)} nota={`Última carga: ${fechaCorta(inventario?.ultimaCarga)}`} />
          <Tarjeta tono="#1d4ed8" titulo="Disponible actual" valor={fmtMonto(disponible)} nota={`Actualizado: ${fechaCorta(inventario?.actualizado)}`} />
          <Tarjeta tono="#a16207" titulo="Venta total" valor={fmtMonto(vendidoCamion)} nota={`Efectivo ${fmtMonto(tablero.total.efectivo)} · Crédito ${fmtMonto(tablero.total.credito)}`} />
        </div>
      </div>

      <div style={{
        marginTop: '0.7rem',
        border: '1px solid #bfdbfe',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#fff',
      }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', padding: '0.65rem 0.75rem' }}>
          <div>
            <strong style={{ color: '#1d4ed8' }}>Tiendas con efectivo en tránsito</strong>
            <div className="muted" style={{ fontSize: '0.75rem' }}>
              {repNombre}. Toca una tienda para ver sus tickets. Total de ventas recibidas: {fmtMonto(tablero.total.venta)} · {tablero.total.mov} movimiento(s).
            </div>
          </div>
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => setVerCreditos(true)}>
            RC / Créditos
          </button>
        </div>
        {cargando ? <p className="muted" style={{ padding: '0 0.75rem' }}>Cargando ventas del camión…</p> : null}
        <div style={{ overflowX: 'auto' }}>
          <table className="data" style={{ margin: 0, fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th style={{ background: '#1d4ed8', color: '#fff' }}>Tienda</th>
                <th style={{ background: '#1e3a8a', color: '#fff' }}>Mov.</th>
                <th style={{ background: '#d97706', color: '#fff' }}>Venta total</th>
                <th style={{ background: '#15803d', color: '#fff' }}>Efectivo</th>
                <th style={{ background: '#b91c1c', color: '#fff' }}>Crédito</th>
              </tr>
            </thead>
            <tbody>
              {tablero.filas.map((f) => (
                <tr
                  key={f.clave}
                  onClick={() => { setTienda(f.clave); setTicket(null); }}
                  style={{ cursor: 'pointer', background: tienda === f.clave ? '#eff6ff' : undefined }}
                >
                  <td style={{ fontWeight: 800 }}>{f.clave}</td>
                  <td>{f.mov}</td>
                  <td>{fmtMonto(f.venta)}</td>
                  <td style={{ color: '#15803d', fontWeight: 700 }}>{fmtMonto(f.efectivo)}</td>
                  <td style={{ color: '#b91c1c', fontWeight: 700 }}>{fmtMonto(f.credito)}</td>
                </tr>
              ))}
              <tr style={{ background: '#0f2744', color: '#fff', fontWeight: 800 }}>
                <td>Total</td>
                <td>{tablero.total.mov}</td>
                <td>{fmtMonto(tablero.total.venta)}</td>
                <td>{fmtMonto(tablero.total.efectivo)}</td>
                <td>{fmtMonto(tablero.total.credito)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {abierta ? (
        <div style={{ marginTop: '0.7rem', border: '1px solid #bfdbfe', borderRadius: 12, padding: '0.75rem', background: '#f8fbff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
            <strong>{abierta.nombre} · {abierta.mov} movimientos</strong>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => { setTienda(null); setTicket(null); }}>
              Cerrar detalle
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', margin: '0.45rem 0' }}>
            <Dato label="Total tienda" valor={fmtMonto(abierta.venta)} />
            <Dato label="Efectivo" valor={fmtMonto(abierta.efectivo)} color="#15803d" />
            <Dato label="Crédito" valor={fmtMonto(abierta.credito)} color="#b91c1c" />
          </div>
          {abierta.tickets.map((tk) => (
            <button
              key={tk.id}
              type="button"
              onClick={() => setTicket(tk)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                marginTop: '0.4rem',
                border: '1px solid #dbeafe',
                borderRadius: 10,
                background: '#fff',
                padding: '0.55rem 0.7rem',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <strong>Ticket {tk.folio}</strong>
                <span style={{
                  background: tk.metodo === 'Efectivo' ? '#15803d' : tk.metodo === 'Crédito' ? '#b91c1c' : '#1d4ed8',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '0.05rem 0.4rem',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                }}
                >
                  {tk.metodo}
                </span>
              </div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>{fechaCorta(tk.fecha)} · {tk.productos} productos</div>
              <div style={{ fontWeight: 800 }}>{fmtMonto(tk.total)}</div>
            </button>
          ))}
          {ticket ? (
            <div style={{ marginTop: '0.6rem' }}>
              <strong>Productos de {ticket.folio}</strong>
              <table className="data" style={{ fontSize: '0.78rem' }}>
                <thead>
                  <tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Importe</th></tr>
                </thead>
                <tbody>
                  {ticket.lineas.map((l, i) => (
                    <tr key={`${l.nombre}-${i}`}>
                      <td>{l.nombre}</td>
                      <td>{l.cantidad}</td>
                      <td>{fmtMonto(l.precio)}</td>
                      <td>{fmtMonto(l.importe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{
        marginTop: '0.7rem',
        background: '#ecfdf3',
        border: '1px solid #86efac',
        borderRadius: 12,
        padding: '0.75rem',
      }}
      >
        <strong>LIQUIDAR TODO EL EFECTIVO EN TRÁNSITO</strong>
        <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.45rem' }}>
          Tiendas de {repNombre || 'este recolector'}. El botón liquida el efectivo que ya está en tránsito.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.4rem' }}>
          <Dato label="Venta total" valor={fmtMonto(tablero.total.venta)} />
          <Dato label="Efectivo" valor={fmtMonto(tablero.total.efectivo)} color="#15803d" />
          <Dato label="Crédito" valor={fmtMonto(tablero.total.credito)} color="#b91c1c" />
          <button
            type="button"
            disabled={guardando}
            onClick={onLiquidar}
            style={{
              border: 'none',
              borderRadius: 10,
              background: '#166534',
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer',
              padding: '0.45rem',
            }}
          >
            Total a liquidar
            <div style={{ fontSize: '1rem' }}>{fmtMonto(tablero.total.efectivo)}</div>
          </button>
        </div>
      </div>
    </div>
  );
}

function Tarjeta({ tono, titulo, valor, nota }) {
  return (
    <div style={{ background: tono, color: '#fff', borderRadius: 10, padding: '0.55rem 0.65rem' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>{titulo}</div>
      <div style={{ fontSize: '1.15rem', fontWeight: 900 }}>{valor}</div>
      <div style={{ fontSize: '0.68rem', opacity: 0.9 }}>{nota}</div>
    </div>
  );
}

function Dato({ label, valor, color }) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: '0.35rem 0.5rem', border: '1px solid #e5e7eb' }}>
      <div className="muted" style={{ fontSize: '0.68rem' }}>{label}</div>
      <div style={{ fontWeight: 800, color: color || '#111' }}>{valor}</div>
    </div>
  );
}
