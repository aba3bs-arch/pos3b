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

function CuboOro({ x, y, s = 14 }) {
  const h = s * 0.78;
  const top = `${x + s},${y} ${x + 2 * s},${y + s * 0.46} ${x + s},${y + s * 0.92} ${x},${y + s * 0.46}`;
  const izq = `${x},${y + s * 0.46} ${x + s},${y + s * 0.92} ${x + s},${y + s * 0.92 + h} ${x},${y + s * 0.46 + h}`;
  const der = `${x + s},${y + s * 0.92} ${x + 2 * s},${y + s * 0.46} ${x + 2 * s},${y + s * 0.46 + h} ${x + s},${y + s * 0.92 + h}`;
  return (
    <g>
      <polygon points={top} fill="#ffe14a" stroke="#e6ae00" strokeWidth="0.8" strokeLinejoin="round" />
      <polygon points={izq} fill="#f6c31a" stroke="#d9a000" strokeWidth="0.8" strokeLinejoin="round" />
      <polygon points={der} fill="#e39a00" stroke="#c78400" strokeWidth="0.8" strokeLinejoin="round" />
    </g>
  );
}

function IconoBarras() {
  const s = 13;
  const dy = s * 0.78 + 1.5;
  const dx = s * 1.72;
  return (
    <svg width="58" height="50" viewBox="0 0 92 72" aria-hidden="true">
      <CuboOro x={dx} y={1} s={s} />
      <CuboOro x={dx * 0.15} y={1 + dy} s={s} />
      <CuboOro x={dx * 0.15 + dx} y={1 + dy} s={s} />
      <CuboOro x={0} y={1 + dy * 2} s={s} />
      <CuboOro x={dx} y={1 + dy * 2} s={s} />
      <CuboOro x={dx * 2} y={1 + dy * 2} s={s} />
    </svg>
  );
}

function IconoCarrito({ size = 36, linea = false }) {
  if (linea) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h2.2l1.8 9.2h10.2l1.8-6.2H8" fill="none" stroke="#64748b" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="10" cy="18.2" r="1.35" fill="#64748b" />
        <circle cx="16.5" cy="18.2" r="1.35" fill="#64748b" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M7 9h8l2.4 5.2" fill="none" stroke="#1f2937" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M15.5 15h23.5l-4.4 15.2H18.4z" fill="#facc15" stroke="#eab308" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M18.5 21h17M19.4 26h14.2" stroke="#fde68a" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="22" cy="36.5" r="3.1" fill="#111827" />
      <circle cx="34" cy="36.5" r="3.1" fill="#111827" />
    </svg>
  );
}

function IconoTienda({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M4 20h56l-3 16H7z" fill="#ef3b3b" />
      <path d="M8 20h10l-1 16H7zM22 20h10l-1 16H21zM36 20h10l-1 16H35zM50 20h8l-1 16H49z" fill="#fff" />
      <path d="M4 33c5 8 9 8 14 0s9-8 14 0 9 8 14 0 9 8 14 0v5H4z" fill="#ef3b3b" />
      <rect x="8" y="38" width="48" height="16" fill="#3b82f6" />
      <rect x="13" y="42" width="16" height="12" rx="1.5" fill="#7dd3fc" />
      <path d="M21 42v12" stroke="#fff" strokeWidth="1.3" />
      <path d="M13 48h16" stroke="#e0f2fe" strokeWidth="1" />
      <rect x="36" y="43" width="14" height="11" rx="1.2" fill="#dbeafe" />
      <rect x="6" y="54" width="52" height="6" rx="1.5" fill="#94a3b8" />
    </svg>
  );
}

function IconoCalendario({ color = '#16a34a', size = 20, linea = false }) {
  if (linea) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="#64748b" strokeWidth="1.7" />
        <path d="M4 9.5h16M8 3.2v4M16 3.2v4" stroke="#64748b" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  const celdas = [];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      celdas.push(<rect key={`${r}-${c}`} x={6.4 + c * 3.9} y={10.3 + r * 2.7} width="2.3" height="1.7" rx="0.3" fill={color} />);
    }
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16.5" rx="3" fill={color} />
      <rect x="5" y="8.6" width="14" height="10.4" rx="1.4" fill="#fff" />
      <rect x="7" y="2.4" width="2.2" height="4" rx="1" fill={color} />
      <rect x="14.8" y="2.4" width="2.2" height="4" rx="1" fill={color} />
      {celdas}
    </svg>
  );
}

function IconoRefresh() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.5 11.2A7.6 7.6 0 0 0 6.8 6.2" fill="none" stroke="#2563eb" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M4.5 12.8A7.6 7.6 0 0 0 17.2 17.8" fill="none" stroke="#2563eb" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M19.2 4.2v5.2h-5.2" fill="none" stroke="#2563eb" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.8 19.8v-5.2h5.2" fill="none" stroke="#2563eb" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconoBilletes() {
  const billete = (y, claro, medio, oscuro) => (
    <g key={y} transform={`translate(2,${y})`}>
      <polygon points="10,14 28,5 58,14 40,23" fill={claro} stroke="#16a34a" strokeWidth="0.6" />
      <polygon points="10,14 10,24 40,33 40,23" fill={medio} />
      <polygon points="40,23 40,33 58,24 58,14" fill={oscuro} />
      <ellipse cx="34" cy="18" rx="6" ry="3.2" fill="none" stroke="#f0fdf4" strokeWidth="1.5" />
    </g>
  );
  return (
    <svg width="44" height="36" viewBox="0 0 68 52" aria-hidden="true">
      {billete(14, '#86efac', '#4ade80', '#16a34a')}
      {billete(7, '#bbf7d0', '#4ade80', '#22c55e')}
      {billete(0, '#dcfce7', '#86efac', '#4ade80')}
      <polygon points="30,6 36,4 40,36 34,38" fill="#f5c518" />
      <polygon points="36,4 40,8 44,40 40,36" fill="#e0a800" />
    </svg>
  );
}

function IconoBolsa() {
  return (
    <svg width="34" height="34" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 3c-1 4-6 6-6 8 0 1 2 1 6 1s6 0 6-1c0-2-5-4-6-8z" fill="#f8d34a" />
      <path d="M16 11c-6 2-10 10-10 18 0 9 6 15 18 15s18-6 18-15c0-8-4-16-10-18-2 2-4 3-8 3s-6-1-8-3z" fill="#f6c431" stroke="#e0a800" strokeWidth="0.7" />
      <ellipse cx="24" cy="13" rx="8" ry="2.6" fill="#e8b000" />
      <path d="M18 12c2 3 10 3 12 0" fill="none" stroke="#c88800" strokeWidth="1" />
      <circle cx="24" cy="28" r="7.2" fill="#16a34a" />
      <text x="24" y="32.2" textAnchor="middle" fontSize="12" fontWeight="800" fill="#f6c431">$</text>
    </svg>
  );
}

function Azulejo({ color, size = 28, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="6" fill={color} />
      {children}
    </svg>
  );
}

function IconoLista({ size = 28 }) {
  return (
    <Azulejo color="#3b82f6" size={size}>
      <rect x="7" y="6" width="14" height="16" rx="2" fill="#fff" />
      <path d="M9.5 11h9M9.5 14.5h9M9.5 18h6" stroke="#3b82f6" strokeWidth="1.4" strokeLinecap="round" />
    </Azulejo>
  );
}

function IconoBilleteMini({ size = 28 }) {
  return (
    <Azulejo color="#22c55e" size={size}>
      <rect x="5" y="8" width="18" height="12" rx="2" fill="#fff" />
      <circle cx="14" cy="14" r="2.6" fill="none" stroke="#22c55e" strokeWidth="1.5" />
    </Azulejo>
  );
}

function IconoTarjeta({ size = 28 }) {
  return (
    <Azulejo color="#ef4444" size={size}>
      <rect x="5" y="7" width="18" height="14" rx="2" fill="#fff" />
      <path d="M5 12h18" stroke="#ef4444" strokeWidth="1.6" />
      <path d="M8 16.5h5" stroke="#ef4444" strokeWidth="1.4" strokeLinecap="round" />
    </Azulejo>
  );
}

function IconoCasa({ size = 18, linea = false }) {
  if (linea) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11.2 12 4.5 20 11.2V20H4z" fill="none" stroke="#64748b" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M10 20v-5h4v5" fill="none" stroke="#64748b" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 11.5 12 3.2 21.5 11.5V21H2.5z" fill="#3b82f6" />
      <rect x="10" y="14" width="4" height="7" fill="#fff" />
    </svg>
  );
}

function IconoDocumento({ size = 22 }) {
  return <IconoLista size={size} />;
}

function IconoOjo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s4-6.5 10-6.5S22 12 22 12s-4 6.5-10 6.5S2 12 2 12z" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="12" cy="12" r="2.6" fill="#fff" />
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
  const [tiendaId, setTiendaId] = useState(null);
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

  useEffect(() => {
    if (tiendaId != null) return;
    const primera = tablero?.tiendas?.[0]?.id;
    if (primera) setTiendaId(primera);
  }, [tablero, tiendaId]);

  const tienda = tablero?.tiendas.find((t) => t.id === tiendaId) || null;
  const marcado = totalMarcado(tablero);
  const ticket = tienda?.tickets.find((t) => t.id === ticketId) || null;

  const cambiarRepartidor = (id) => {
    setRepartidorId(id);
    setMarcas(null);
    setTiendaId(null);
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
              pie={<><IconoCalendario size={18} /> <span>Última carga: {fmtFecha(tablero.ultimaCarga)}</span></>}
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
            <div className="table-wrap consulta-tienda-tabla-wrap">
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
              <span className="consulta-tienda-liq-div" aria-hidden="true" />
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
                        <p><IconoCalendario linea size={16} /> {fmtFecha(tk.fecha)}</p>
                        <p><IconoCarrito linea size={16} /> Productos: {tk.productos}</p>
                        <p><IconoCasa linea size={16} /> Subtotal: {fmtMonto(tk.subtotal)}</p>
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
