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
  const parts = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: TZ,
  }).formatToParts(d);
  const p = (tipo) => parts.find((x) => x.type === tipo)?.value || '00';
  return `${p('day')}/${p('month')}/${p('year')} ${p('hour')}:${p('minute')}:${p('second')}`;
}

function IconoBarras() {
  return (
    <svg width="46" height="40" viewBox="0 0 64 56" aria-hidden="true">
      <polygon points="6,34 22,26 50,26 34,34" fill="#ffe56a" />
      <polygon points="6,34 6,44 22,52 22,42" fill="#e2a61c" />
      <polygon points="22,42 22,52 50,44 50,34" fill="#f6c43a" />
      <polygon points="14,24 30,16 58,16 42,24" fill="#fff1a3" />
      <polygon points="14,24 14,34 30,42 30,32" fill="#f0be34" />
      <polygon points="30,32 30,42 58,34 58,24" fill="#ffe27a" />
      <polygon points="10,16 26,8 54,8 38,16" fill="#fff8d0" />
      <polygon points="10,16 10,24 26,32 26,24" fill="#f8d35a" />
      <polygon points="26,24 26,32 54,24 54,16" fill="#fff0b0" />
    </svg>
  );
}

function IconoCarrito({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 10h6l2 4h22l-4 14H18L14 14" fill="#fb923c" stroke="#ea580c" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 10h6l2 4" fill="none" stroke="#ea580c" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="20" cy="36" r="3.2" fill="#9a3412" />
      <circle cx="34" cy="36" r="3.2" fill="#9a3412" />
      <path d="M18 28h16" stroke="#fff7ed" strokeWidth="2" />
    </svg>
  );
}

function IconoTienda({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M6 20 L24 8 L42 20 V23 H6 Z" fill="#ef4444" />
      <path d="M8 16.5 h6.2 l-1.6 6.5 H6.6z M16.2 15.2 h6.2 l-1.2 7.8 h-6.2z M24.4 14.4 h6.2 l-.6 8.6 h-6.2z M32.4 15.2 h6.2 l.8 7.8 h-6.2z" fill="#fff" />
      <rect x="10" y="23" width="28" height="17" rx="1.5" fill="#3b82f6" />
      <rect x="14" y="27" width="7" height="6" rx="1" fill="#dbeafe" />
      <rect x="20.5" y="28" width="7" height="12" rx="1" fill="#f8fafc" />
    </svg>
  );
}

function IconoCalendario({ color = '#16a34a', size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" fill={color} />
      <rect x="3" y="5" width="18" height="5" rx="2" fill="#166534" opacity="0.25" />
      <rect x="7" y="3" width="2" height="4" rx="1" fill={color} />
      <rect x="15" y="3" width="2" height="4" rx="1" fill={color} />
      <circle cx="8" cy="14" r="1" fill="#fff" />
      <circle cx="12" cy="14" r="1" fill="#fff" />
      <circle cx="16" cy="14" r="1" fill="#fff" />
      <circle cx="8" cy="17.5" r="1" fill="#fff" />
      <circle cx="12" cy="17.5" r="1" fill="#fff" />
    </svg>
  );
}

function IconoRefresh() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 12a7 7 0 1 1-2-4.9" fill="none" stroke="#2563eb" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M19 4.5V9h-4.5" fill="none" stroke="#2563eb" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconoBilletes() {
  return (
    <svg width="28" height="22" viewBox="0 0 36 28" aria-hidden="true">
      <rect x="6" y="8" width="24" height="14" rx="2" fill="#86efac" stroke="#166534" transform="rotate(-8 18 15)" />
      <rect x="4" y="10" width="24" height="14" rx="2" fill="#4ade80" stroke="#166534" />
      <circle cx="16" cy="17" r="3" fill="none" stroke="#166534" strokeWidth="1.4" />
    </svg>
  );
}

function IconoBolsa() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M12 12c0-3 2-6 4-6s4 3 4 6" fill="none" stroke="#14532d" strokeWidth="1.8" />
      <path d="M7 13h18l-2 14H9z" fill="#4ade80" stroke="#14532d" strokeWidth="1.4" />
      <text x="16" y="24" textAnchor="middle" fontSize="10" fontWeight="700" fill="#14532d">$</text>
    </svg>
  );
}

function IconoLista() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.6" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconoBilleteMini() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" fill="#dcfce7" stroke="#16a34a" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.4" fill="none" stroke="#16a34a" strokeWidth="1.4" />
    </svg>
  );
}

function IconoTarjeta() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" fill="#fee2e2" stroke="#dc2626" strokeWidth="1.6" />
      <path d="M2 9h20" stroke="#dc2626" strokeWidth="1.6" />
      <path d="M6 14h5" stroke="#dc2626" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconoCasa() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 11 L12 4 L20 11 V20 H4 Z" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="10" y="14" width="4" height="6" fill="#2563eb" />
    </svg>
  );
}

function IconoDocumento({ color = '#2563eb', size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h7l5 5v13H7z" fill="#eff6ff" stroke={color} strokeWidth="1.6" />
      <path d="M14 3v5h5" fill="none" stroke={color} strokeWidth="1.6" />
      <path d="M10 13h6M10 17h4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconoOjo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.4" fill="#fff" />
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

  const varios = (paquete?.repartidores || []).length > 1;

  return (
    <div className="consulta-tienda">
      {varios ? (
        <label className="consulta-tienda-recolector">
          Recolector
          <select value={repartidorId} onChange={(e) => cambiarRepartidor(e.target.value)}>
            {paquete.repartidores.map((r) => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
          </select>
        </label>
      ) : null}
      {error ? <p className="consulta-tienda-error">{error}</p> : null}
      {cargando && !tablero ? <p className="muted">Cargando consultas por tienda…</p> : null}
      {tablero && (
        <div className="consulta-tienda-layout">
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

          <div className="consulta-tienda-mixto-head">
            <IconoTienda size={52} />
            <div>
              <strong>Venta Mixto</strong>
              <span>Toca una tienda para ver sus tickets.</span>
            </div>
          </div>

          <div className="consulta-tienda-main">
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
                          <IconoTienda size={26} /> {t.codigo}
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
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td><span className="consulta-tienda-mov consulta-tienda-mov--on">{tablero.mov}</span></td>
                    <td><span className="consulta-tienda-total-pill consulta-tienda-total-pill--venta">{fmtMonto(tablero.venta)}</span></td>
                    <td><span className="consulta-tienda-total-pill consulta-tienda-total-pill--efe">{fmtMonto(tablero.efectivo)}</span></td>
                    <td><span className="consulta-tienda-total-pill consulta-tienda-total-pill--cre">{fmtMonto(tablero.credito)}</span></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="consulta-tienda-liquidar">
              <button type="button" onClick={consultarLiquidacion}>
                <IconoBilletes />
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
          </div>

          {tienda ? (
            <aside className="consulta-tienda-detalle">
              <div className="consulta-tienda-mixto-tienda">
                <button type="button" className="consulta-tienda-atras" onClick={() => { setTiendaId(''); setTicketId(''); }} aria-label="Cerrar tienda">‹</button>
                <IconoTienda size={28} />
                <strong>{tienda.codigo}</strong>
                <span>{tienda.mov} movimientos</span>
              </div>
              <div className="consulta-tienda-mini">
                <div>
                  <IconoLista />
                  <span><small>Total tienda</small><b>{fmtMonto(tienda.venta)}</b></span>
                </div>
                <div>
                  <IconoBilleteMini />
                  <span><small>Efectivo</small><b className="consulta-tienda-num--efe">{fmtMonto(tienda.efectivo)}</b></span>
                </div>
                <div>
                  <IconoTarjeta />
                  <span><small>Crédito</small><b className="consulta-tienda-num--cre">{fmtMonto(tienda.credito)}</b></span>
                </div>
              </div>
              <h4><IconoCasa /> Tickets de la tienda</h4>
              {tienda.tickets.map((tk) => {
                const badge = badgeMetodo(tk.metodo);
                const abierto = ticket?.id === tk.id;
                return (
                  <article key={tk.id} className="consulta-tienda-ticket">
                    <header>
                      <IconoDocumento />
                      <span>Ticket #{tk.folio}</span>
                      <em style={{ background: badge.fondo }}>{badge.texto}</em>
                    </header>
                    <div className="consulta-tienda-ticket-cuerpo">
                      <div>
                        <p><IconoCalendario size={15} /> {fmtFecha(tk.fecha)}</p>
                        <p><IconoCarrito size={15} /> Productos: {tk.productos}</p>
                        <p><IconoCasa /> Subtotal: {fmtMonto(tk.subtotal)}</p>
                      </div>
                      <button type="button" onClick={() => setTicketId(abierto ? '' : tk.id)}>
                        <IconoOjo /> Ver ticket
                      </button>
                    </div>
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
              <button type="button" className="consulta-tienda-cerrar" onClick={() => { setTiendaId(''); setTicketId(''); }}>
                <IconoDocumento /> Cerrar detalle
              </button>
            </aside>
          ) : <aside className="consulta-tienda-detalle consulta-tienda-detalle--vacio" />}
        </div>
      )}
    </div>
  );
}
