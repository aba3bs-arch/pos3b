import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtMonto } from '../lib/consultasUi.js';
import {
  armarConsultaPorTienda,
  cargarConsultaPorTienda,
  recolectorInicial,
  totalMarcado,
} from '../lib/consultaPorTienda.js';

const TZ = 'America/Hermosillo';

function fmtFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: TZ,
  });
}

function IconoBarras() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="14" width="16" height="8" rx="1" fill="#f5c542" stroke="#d4a017" />
      <rect x="8" y="8" width="16" height="8" rx="1" fill="#ffe08a" stroke="#d4a017" />
      <rect x="12" y="4" width="16" height="8" rx="1" fill="#fff4cc" stroke="#d4a017" />
    </svg>
  );
}

function IconoCarrito() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="20" r="1.4" fill="#ea580c" />
      <circle cx="17" cy="20" r="1.4" fill="#ea580c" />
      <path d="M3 4h2l2.2 10.2a1 1 0 0 0 1 .8H17a1 1 0 0 0 1-.8L20 7H7" fill="none" stroke="#ea580c" strokeWidth="1.8" />
    </svg>
  );
}

function IconoTienda({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 14 L16 6 L28 14 V16 H4 Z" fill="#ef4444" />
      <path d="M6 14 h4 v2 H6z M12 14 h4 v2 h-4z M18 14 h4 v2 h-4z M24 14 h3 v2 h-3z" fill="#fff" />
      <rect x="8" y="16" width="16" height="10" fill="#3b82f6" />
      <rect x="13" y="19" width="6" height="7" fill="#f8fafc" />
    </svg>
  );
}

function IconoCalendario() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="#16a34a" strokeWidth="2" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="#16a34a" strokeWidth="2" />
    </svg>
  );
}

function IconoRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.2-5.5" fill="none" stroke="#2563eb" strokeWidth="2" />
      <path d="M20 4v5h-5" fill="none" stroke="#2563eb" strokeWidth="2" />
    </svg>
  );
}

function IconoBillete() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" fill="#86efac" stroke="#166534" />
      <circle cx="12" cy="12" r="2.2" fill="none" stroke="#166534" strokeWidth="1.6" />
    </svg>
  );
}

function IconoBolsa() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 8V7a4 4 0 0 1 8 0v1" fill="none" stroke="#166534" strokeWidth="1.8" />
      <rect x="4" y="8" width="16" height="12" rx="2" fill="#4ade80" stroke="#166534" />
      <path d="M12 12v4M10 14h4" stroke="#166534" strokeWidth="1.6" />
    </svg>
  );
}

function badgeMetodo(metodo) {
  const m = String(metodo || '').toLowerCase();
  if (m === 'credito') return { texto: 'CRÉDITO', fondo: '#dc2626' };
  if (m === 'mixto') return { texto: 'MIXTO', fondo: '#ea580c' };
  return { texto: 'EFECTIVO', fondo: '#16a34a' };
}

function Kpi({ clase, icono, titulo, monto, pie }) {
  return (
    <div className={`consulta-tienda-kpi ${clase}`}>
      <div className="consulta-tienda-kpi-top">
        {icono}
        <div>
          <div className="consulta-tienda-kpi-titulo">{titulo}</div>
          <div className="consulta-tienda-kpi-monto">{fmtMonto(monto)}</div>
        </div>
      </div>
      <div className="consulta-tienda-kpi-pie">{pie}</div>
    </div>
  );
}

export default function ConsultaPorTienda({ supabase, inventario = [] }) {
  const [paquete, setPaquete] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [repartidorId, setRepartidorId] = useState('');
  const [marcas, setMarcas] = useState(null);
  const [tiendaId, setTiendaId] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [ahora, setAhora] = useState(null);

  const cargar = useCallback(async (inicial) => {
    if (inicial) setCargando(true);
    const r = await cargarConsultaPorTienda(supabase);
    if (!r.ok) {
      setError(r.error || 'No se pudo leer las consultas por tienda.');
      setPaquete(null);
    } else {
      setError(r.aviso || '');
      setPaquete(r);
      setAhora(new Date().toISOString());
      setRepartidorId((prev) => {
        if (prev && (r.repartidores || []).some((x) => String(x.id) === String(prev))) return prev;
        return recolectorInicial(r.repartidores, r.cargas);
      });
    }
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    void cargar(true);
    const t = setInterval(() => { void cargar(false); }, 15000);
    return () => clearInterval(t);
  }, [cargar]);

  const tablero = useMemo(() => {
    if (!paquete || !repartidorId) return null;
    const base = armarConsultaPorTienda({
      repartidorId,
      repartidores: paquete.repartidores,
      cargas: paquete.cargas,
      ventas: paquete.ventas,
      lineas: paquete.lineas,
      productos: inventario,
      transito: paquete.transito,
      ahora,
    });
    if (!marcas) return base;
    return {
      ...base,
      tiendas: base.tiendas.map((t) => ({ ...t, marcada: marcas.has(t.id) })),
    };
  }, [paquete, repartidorId, inventario, ahora, marcas]);

  const tienda = tablero?.tiendas.find((t) => t.id === tiendaId) || null;
  const marcado = totalMarcado(tablero);
  const ticket = tienda?.tickets.find((t) => t.id === ticketId) || null;

  const cambiarRepartidor = (id) => {
    setRepartidorId(id);
    setMarcas(null);
    setTiendaId('');
    setTicketId('');
  };

  const toggleMarca = (id) => {
    const ids = new Set((tablero?.tiendas || []).filter((t) => t.marcada).map((t) => t.id));
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    setMarcas(ids);
  };

  const consultarLiquidacion = () => {
    if (!tablero) return;
    const lineas = (tablero.tiendas || []).filter((t) => t.marcada).map((t) => `${t.codigo}: venta ${fmtMonto(t.venta)} · efectivo ${fmtMonto(t.efectivo)} · crédito ${fmtMonto(t.credito)}`);
    window.alert(
      `Consulta de ${tablero.nombre}\n`
      + `${marcado.tiendas} tienda(s) marcada(s)\n`
      + `Venta ${fmtMonto(marcado.venta)} · efectivo ${fmtMonto(marcado.efectivo)} · crédito ${fmtMonto(marcado.credito)}\n`
      + `Efectivo ya en tránsito: ${fmtMonto(marcado.transitoEfectivo)}\n\n`
      + (lineas.join('\n') || 'Ninguna tienda marcada.')
      + '\n\nEsta pantalla solo consulta. La liquidación sigue en RC/VentaRuta.',
    );
  };

  return (
    <div className="consulta-tienda">
      <div className="consulta-tienda-barra">
        <label>
          Recolector
          <select value={repartidorId} onChange={(e) => cambiarRepartidor(e.target.value)}>
            {(paquete?.repartidores || []).map((r) => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
          </select>
        </label>
        <span className="muted">Cargado y disponible salen de la carga abierta. La venta es la suma de sus tickets. El tránsito se lista aparte y no se vuelve a sumar. Se actualiza cada 15 segundos.</span>
      </div>
      {error ? <p className="consulta-tienda-error">{error}</p> : null}
      {cargando && !tablero ? <p className="muted">Cargando consultas por tienda…</p> : null}
      {tablero && (
        <div className="consulta-tienda-layout">
          <div className="consulta-tienda-main">
            <div className="consulta-tienda-kpis">
              <Kpi
                clase="consulta-tienda-kpi--carga"
                icono={<IconoBarras />}
                titulo="Cargado en ruta"
                monto={tablero.cargado}
                pie={<><IconoCalendario /> Última carga: {fmtFecha(tablero.ultimaCarga)}</>}
              />
              <Kpi
                clase="consulta-tienda-kpi--disp"
                icono={<IconoBarras />}
                titulo="Disponible actual"
                monto={tablero.disponible}
                pie={<><IconoRefresh /> Actualizado: {fmtFecha(tablero.actualizado)}</>}
              />
              <div className="consulta-tienda-kpi consulta-tienda-kpi--venta">
                <div className="consulta-tienda-kpi-top">
                  <IconoCarrito />
                  <div>
                    <div className="consulta-tienda-kpi-titulo">Venta total</div>
                    <div className="consulta-tienda-kpi-monto">{fmtMonto(tablero.venta)}</div>
                  </div>
                </div>
                <div className="consulta-tienda-pills">
                  <span className="consulta-tienda-pill consulta-tienda-pill--efe">Efectivo: {fmtMonto(tablero.efectivo)}</span>
                  <span className="consulta-tienda-pill consulta-tienda-pill--cre">Crédito: {fmtMonto(tablero.credito)}</span>
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table className="consultas-table consulta-tienda-tabla">
                <thead>
                  <tr>
                    <th>Tienda</th>
                    <th>Mov.</th>
                    <th>Venta total</th>
                    <th>Efectivo</th>
                    <th>Crédito</th>
                  </tr>
                </thead>
                <tbody>
                  {tablero.tiendas.map((t) => (
                    <tr key={t.id} className={t.id === tiendaId ? 'consulta-tienda-fila--abierta' : ''}>
                      <td>
                        <button type="button" className="consulta-tienda-nombre" onClick={() => { setTiendaId(t.id); setTicketId(''); }}>
                          <IconoTienda size={18} /> {t.codigo}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`consulta-tienda-mov ${t.marcada ? 'consulta-tienda-mov--on' : ''}`}
                          onClick={() => toggleMarca(t.id)}
                          aria-pressed={t.marcada}
                        >
                          {t.mov}
                        </button>
                      </td>
                      <td className="consulta-tienda-num consulta-tienda-num--venta">{fmtMonto(t.venta)}</td>
                      <td className="consulta-tienda-num consulta-tienda-num--efe">{fmtMonto(t.efectivo)}</td>
                      <td className="consulta-tienda-num consulta-tienda-num--cre">{fmtMonto(t.credito)}</td>
                    </tr>
                  ))}
                  {!tablero.tiendas.length && (
                    <tr><td colSpan={5} className="muted">Este recolector no tiene ventas en la carga abierta.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td><span className="consulta-tienda-mov consulta-tienda-mov--on">{tablero.mov}</span></td>
                    <td className="consulta-tienda-num consulta-tienda-num--venta">{fmtMonto(tablero.venta)}</td>
                    <td className="consulta-tienda-num consulta-tienda-num--efe">{fmtMonto(tablero.efectivo)}</td>
                    <td className="consulta-tienda-num consulta-tienda-num--cre">{fmtMonto(tablero.credito)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="consulta-tienda-liquidar">
              <button type="button" onClick={consultarLiquidacion}>
                <IconoBillete />
                <span>
                  <strong>Liquidar todo el efectivo en tránsito</strong>
                  <small>Todas las tiendas de este recolector (solo lo marcado).</small>
                </span>
              </button>
              <div className="consulta-tienda-total-liq">
                <IconoBolsa />
                <span>
                  <small>Total a liquidar</small>
                  <strong>{fmtMonto(marcado.venta)}</strong>
                </span>
              </div>
            </div>
            {tablero.sinPrecio ? <p className="muted">Hay mercancía cargada sin precio de ruta. Ese importe quedó en cero.</p> : null}
          </div>

          <aside className="consulta-tienda-mixto">
            <div className="consulta-tienda-mixto-head">
              <IconoTienda />
              <div>
                <strong>Venta Mixto</strong>
                <span>Toca una tienda para ver sus tickets.</span>
              </div>
            </div>
            {!tienda ? (
              <p className="muted">Ninguna tienda abierta.</p>
            ) : (
              <>
                <div className="consulta-tienda-mixto-tienda">
                  <button type="button" className="consulta-tienda-atras" onClick={() => { setTiendaId(''); setTicketId(''); }}>‹</button>
                  <IconoTienda size={22} />
                  <strong>{tienda.codigo}</strong>
                  <span>{tienda.mov} movimientos</span>
                </div>
                <div className="consulta-tienda-mini">
                  <div><small>Total tienda</small><b>{fmtMonto(tienda.venta)}</b></div>
                  <div><small>Efectivo</small><b className="consulta-tienda-num--efe">{fmtMonto(tienda.efectivo)}</b></div>
                  <div><small>Crédito</small><b className="consulta-tienda-num--cre">{fmtMonto(tienda.credito)}</b></div>
                </div>
                <h4>Tickets de la tienda</h4>
                {tienda.tickets.map((tk) => {
                  const badge = badgeMetodo(tk.metodo);
                  const abierto = ticket?.id === tk.id;
                  return (
                    <article key={tk.id} className="consulta-tienda-ticket">
                      <header>
                        <span>Ticket #{tk.folio}</span>
                        <em style={{ background: badge.fondo }}>{badge.texto}</em>
                      </header>
                      <p>{fmtFecha(tk.fecha)}</p>
                      <p>Productos: {tk.productos}</p>
                      <p>Subtotal: {fmtMonto(tk.subtotal)}</p>
                      <button type="button" onClick={() => setTicketId(abierto ? '' : tk.id)}>Ver ticket</button>
                      {abierto && (
                        <ul>
                          {tk.lineas.length ? tk.lineas.map((ln, i) => (
                            <li key={`${tk.id}-${i}`}>{ln.cantidad} × {ln.nombre} · {fmtMonto(ln.importe)}</li>
                          )) : <li>Sin desglose de productos.</li>}
                        </ul>
                      )}
                    </article>
                  );
                })}
                {!tienda.tickets.length ? <p className="muted">Sin tickets de venta. Hay {tienda.transito.length} movimiento(s) en tránsito.</p> : null}
                {tienda.transito.length > 0 && (
                  <>
                    <h4>En tránsito</h4>
                    <ul className="consulta-tienda-transito">
                      {tienda.transito.map((m) => (
                        <li key={m.id}>{m.folio} · {m.tipo} · {fmtMonto(m.monto)}</li>
                      ))}
                    </ul>
                  </>
                )}
                <button type="button" className="consulta-tienda-cerrar" onClick={() => { setTiendaId(''); setTicketId(''); }}>
                  Cerrar detalle
                </button>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
