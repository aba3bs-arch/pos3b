import React from 'react';
import { dineroTablero, totalMarcado } from '../lib/tableroInventarioCamion.js';
import './TableroInventarioCamion.css';

const FECHA = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Hermosillo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function fechaTablero(valor) {
  if (!valor || !Number.isFinite(new Date(valor).getTime())) return 'Sin fecha';
  return FECHA.format(new Date(valor)).replace(',', '');
}

function etiquetaMetodo(metodo) {
  if (metodo === 'credito') return 'CRÉDITO';
  if (metodo === 'mixto') return 'MIXTO';
  return 'EFECTIVO';
}

function CamionFigura() {
  return (
    <div className="icam-truck" aria-hidden="true">
      <div className="icam-truck-box">ABB</div>
      <div className="icam-truck-cab" />
      <div className="icam-truck-wheel" />
      <div className="icam-truck-wheel-b" />
    </div>
  );
}

export default function TableroInventarioCamionVista({
  camiones = [],
  camionId,
  onElegirCamion,
  tablero,
  cargando,
  error,
  aviso,
  nombre,
  recolector,
  ultimaCarga,
  actualizado,
  sinCamiones,
  sinCargas,
  sinPrecio,
  tiendaId,
  onElegirTienda,
  marcadas,
  onMarcar,
  onLiquidar,
  liquidando,
  onImprimir,
  onCompartir,
}) {
  const tiendas = tablero?.tiendas || [];
  const tienda = tiendas.find((fila) => fila.id === tiendaId) || null;
  const marcado = totalMarcado(tiendas, marcadas);
  const venta = tablero?.venta || { total: 0, efectivo: 0, credito: 0, mov: 0 };

  return (
    <section className="icam">
      <header className="icam-head">
        <CamionFigura />
        <div>
          <h2 className="icam-titulo">
            Inventario Camión <em>{nombre || '—'}</em>
          </h2>
          <p className="icam-sub">
            {recolector ? `${recolector} · ` : ''}
            Carga abierta · precio de venta en ruta · hora de Hermosillo
          </p>
        </div>
      </header>

      {camiones.length > 1 && (
        <div className="icam-camiones">
          {camiones.map((camion) => (
            <button
              key={camion.id}
              type="button"
              className={`icam-camion-btn${camion.id === camionId ? ' is-on' : ''}`}
              onClick={() => onElegirCamion?.(camion.id)}
            >
              {camion.nombre}
            </button>
          ))}
        </div>
      )}

      {error && <p className="icam-error" role="alert">{error}</p>}
      {aviso && <p className="icam-aviso" role="status">{aviso}</p>}
      {cargando && !tablero && <p className="icam-sub">Consultando el camión…</p>}

      <div className="icam-layout">
        <div>
          <div className="icam-kpis">
            <article className="icam-kpi icam-kpi-verde">
              <span className="icam-kpi-icon icam-cubes" aria-hidden="true"><i /><i /><i /></span>
              <div className="icam-kpi-label">Cargado en ruta</div>
              <div className="icam-kpi-monto">{dineroTablero(tablero?.cargado)}</div>
              <div className="icam-kpi-meta">
                <span className="icam-cal" aria-hidden="true" />
                <span>Última carga<br />{fechaTablero(ultimaCarga)}</span>
              </div>
            </article>
            <article className="icam-kpi icam-kpi-azul">
              <span className="icam-kpi-icon" aria-hidden="true"><span className="icam-refresh" /></span>
              <div className="icam-kpi-label">Disponible actual</div>
              <div className="icam-kpi-monto">{dineroTablero(tablero?.disponible)}</div>
              <div className="icam-kpi-meta">
                <span className="icam-sync" aria-hidden="true" />
                <span>Actualizado:<br />{fechaTablero(actualizado)}</span>
              </div>
            </article>
            <article className="icam-kpi icam-kpi-oro">
              <span className="icam-kpi-icon icam-cart" aria-hidden="true">
                <span className="icam-cart-handle" />
                <span className="icam-cart-basket" />
                <i /><b />
              </span>
              <div className="icam-kpi-label">Venta total</div>
              <div className="icam-kpi-monto">{dineroTablero(venta.total)}</div>
              <div className="icam-pills">
                <div className="icam-pill icam-pill-efe"><span>Efectivo:</span><span>{dineroTablero(venta.efectivo)}</span></div>
                <div className="icam-pill icam-pill-cre"><span>Crédito:</span><span>{dineroTablero(venta.credito)}</span></div>
              </div>
            </article>
          </div>
          {sinPrecio && (
            <p className="icam-aviso">Importe parcial: hay productos sin precio de ruta.</p>
          )}

          <section className="icam-sec">
            <div className="icam-sec-head">
              <div>
                <h3><span className="icam-store" aria-hidden="true" /> Tiendas con efectivo en tránsito</h3>
                <p>Toca una tienda o un número de movimientos para ver sus tickets.</p>
              </div>
              <button type="button" className="icam-btn-lite" onClick={() => onImprimir?.('reporte')}>
                <span className="icam-print-ico" aria-hidden="true" /> Imprimir reporte
              </button>
            </div>
            <ul className="icam-fichas">
              {tiendas.length === 0 && (
                <li className="icam-ficha-vacia">
                  {sinCamiones
                    ? 'No hay camiones activos.'
                    : sinCargas
                      ? 'Sin carga abierta en este camión.'
                      : 'Sin ventas en la carga abierta.'}
                </li>
              )}
              {tiendas.map((fila) => (
                <li key={fila.id} className={fila.id === tiendaId ? 'is-on' : ''}>
                  <div className="icam-ficha-top">
                    <span className="icam-tienda">
                      <input
                        className="icam-check"
                        type="checkbox"
                        checked={marcadas?.[fila.id] !== false}
                        onChange={(ev) => onMarcar?.(fila.id, ev.target.checked)}
                        aria-label={`Marcar ${fila.etiqueta}`}
                      />
                      <button type="button" className="icam-tienda" onClick={() => onElegirTienda?.(fila.id)}>
                        <span className="icam-store" aria-hidden="true" />
                        {fila.etiqueta}
                      </button>
                    </span>
                    <button type="button" className="icam-mov" onClick={() => onElegirTienda?.(fila.id)} aria-label={`${fila.mov} movimientos de ${fila.etiqueta}`}>
                      {fila.mov}
                    </button>
                  </div>
                  <div className="icam-ficha-nums">
                    <span><small>Venta</small><b className="icam-venta">{dineroTablero(fila.venta)}</b></span>
                    <span><small>Efectivo</small><b className="icam-efe">{dineroTablero(fila.efectivo)}</b></span>
                    <span><small>Crédito</small><b className="icam-cre">{dineroTablero(fila.credito)}</b></span>
                  </div>
                </li>
              ))}
              {tiendas.length > 0 && (
                <li className="icam-ficha-total">
                  <span>Total · {marcado.mov} mov.</span>
                  <b>{dineroTablero(marcado.total)}</b>
                  <small>Efectivo {dineroTablero(marcado.efectivo)} · Crédito {dineroTablero(marcado.credito)}</small>
                </li>
              )}
            </ul>
            <div className="icam-tabla-wrap" id="icam-reporte">
              <table className="icam-tabla">
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
                  {tiendas.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'left', fontWeight: 600 }}>
                        {sinCamiones
                          ? 'No hay camiones activos.'
                          : sinCargas
                            ? 'Sin carga abierta en este camión.'
                            : 'Sin ventas en la carga abierta.'}
                      </td>
                    </tr>
                  )}
                  {tiendas.map((fila) => (
                    <tr key={fila.id} className={fila.id === tiendaId ? 'is-on' : ''}>
                      <td>
                        <span className="icam-tienda">
                          <input
                            className="icam-check"
                            type="checkbox"
                            checked={marcadas?.[fila.id] !== false}
                            onChange={(ev) => onMarcar?.(fila.id, ev.target.checked)}
                            aria-label={`Marcar ${fila.etiqueta}`}
                          />
                          <button type="button" className="icam-tienda" onClick={() => onElegirTienda?.(fila.id)}>
                            <span className="icam-store" aria-hidden="true" />
                            {fila.etiqueta}
                          </button>
                        </span>
                      </td>
                      <td>
                        <button type="button" className="icam-mov" onClick={() => onElegirTienda?.(fila.id)}>
                          {fila.mov}
                        </button>
                      </td>
                      <td className="icam-venta">{dineroTablero(fila.venta)}</td>
                      <td className="icam-efe">{dineroTablero(fila.efectivo)}</td>
                      <td className="icam-cre">{dineroTablero(fila.credito)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td>{marcado.mov}</td>
                    <td>{dineroTablero(marcado.total)}</td>
                    <td>{dineroTablero(marcado.efectivo)}</td>
                    <td>{dineroTablero(marcado.credito)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="icam-liq">
              <button type="button" className="icam-liq-btn" onClick={onLiquidar} disabled={liquidando}>
                <span className="icam-bag" aria-hidden="true" />
                <span>
                  <strong>{liquidando ? 'Liquidando…' : 'Liquidar todo el efectivo en tránsito'}</strong>
                  <span>Estas las tiendas de este recolector (solo lo marcado).</span>
                </span>
              </button>
              <div className="icam-liq-total">
                <span className="icam-coin" aria-hidden="true" />
                <span>
                  <span>Total a liquidar</span>
                  <b>{dineroTablero(marcado.total)}</b>
                </span>
              </div>
            </div>
          </section>
        </div>

        <aside className="icam-panel" id="icam-tickets">
          <div className="icam-panel-top">
            <div>
              <h3>Movimientos</h3>
              <p className="icam-sub" style={{ color: '#4b5e86' }}>Tickets de ventas</p>
            </div>
            {tienda && (
              <button type="button" className="icam-x" onClick={() => onElegirTienda?.(null)} aria-label="Cerrar tickets">×</button>
            )}
          </div>
          {!tienda && <p className="icam-vacio">Elige una tienda para ver sus tickets de la carga abierta.</p>}
          {tienda && (
            <>
              <div className="icam-panel-tienda">
                <span><span className="icam-store" aria-hidden="true" /> Tienda: {tienda.etiqueta}</span>
                <span className="icam-chip">{tienda.mov} movimientos</span>
              </div>
              {tienda.tickets.map((ticket) => (
                <article key={ticket.id} className="icam-ticket">
                  <div className="icam-ticket-top">
                    <span>Ticket #{ticket.folio}</span>
                    <span className={`icam-badge icam-badge-${ticket.metodo}`}>{etiquetaMetodo(ticket.metodo)}</span>
                  </div>
                  <p>{fechaTablero(ticket.fecha)}</p>
                  <dl>
                    <div><dt>Productos:</dt><dd>{ticket.piezas}</dd></div>
                    <div><dt>Subtotal:</dt><dd>{dineroTablero(ticket.total)}</dd></div>
                    <div><dt>Total:</dt><dd>{dineroTablero(ticket.total)}</dd></div>
                  </dl>
                </article>
              ))}
              <div className="icam-resumen">
                <h4>Resumen {tienda.etiqueta}</h4>
                <div><span>Venta total:</span><span>{dineroTablero(tienda.venta)}</span></div>
                <div><span>Efectivo:</span><span className="icam-efe">{dineroTablero(tienda.efectivo)}</span></div>
                <div><span>Crédito:</span><span className="icam-cre">{dineroTablero(tienda.credito)}</span></div>
                <div><span>Movimientos:</span><span>{tienda.mov}</span></div>
              </div>
              <div className="icam-acciones">
                <button type="button" className="icam-print" onClick={() => onImprimir?.('tickets')}>
                  <span className="icam-print-ico" aria-hidden="true" /> Imprimir tickets
                </button>
                <button type="button" className="icam-share" onClick={() => onCompartir?.(tienda)}>
                  <span className="icam-share-ico" aria-hidden="true" /> Compartir
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
