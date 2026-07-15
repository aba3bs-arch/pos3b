import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';

/**
 * Panel visible en Inicio (Central): cambiar de tienda sin depender solo del header.
 */
export default function PanelCambiarTiendaCentral({
  sucursal,
  lista = [],
  presenciaMap = {},
  onCambiar,
  habilitado = true,
}) {
  const [abierto, setAbierto] = useState(false);
  if (!habilitado || typeof onCambiar !== 'function') return null;

  const actual = normalizarCodigoTienda(sucursal);
  const onlineActual = Boolean(presenciaMap?.[actual]?.online);

  const portal =
    abierto && typeof document !== 'undefined'
      ? createPortal(
          <div className="sucursal-sheet" role="presentation">
            <button type="button" className="sucursal-sheet-backdrop" aria-label="Cerrar" onClick={() => setAbierto(false)} />
            <div className="sucursal-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="panel-tienda-central-title">
              <div className="sucursal-sheet-handle" aria-hidden />
              <div className="sucursal-sheet-head">
                <h3 id="panel-tienda-central-title">Consultar / operar tienda</h3>
                <button type="button" className="btn btn-ghost sucursal-sheet-close" onClick={() => setAbierto(false)}>
                  Cerrar
                </button>
              </div>
              <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', padding: '0 0.15rem' }}>
                Elige una sucursal para ver su inventario, aprobar vales/gastos o revisar el día. Central (MAIN) sigue siendo el panel admin.
              </p>
              <ul className="sucursal-sheet-list" role="listbox">
                {(lista || []).map((s) => {
                  const id = normalizarCodigoTienda(s);
                  const online = Boolean(presenciaMap?.[id]?.online);
                  const activo = id === actual;
                  return (
                    <li key={id} role="option" aria-selected={activo}>
                      <button
                        type="button"
                        className={`sucursal-select-item${activo ? ' is-active' : ''}`}
                        onClick={() => {
                          onCambiar(id);
                          setAbierto(false);
                        }}
                      >
                        <span className={`sucursal-dot ${online ? 'is-online' : 'is-offline'}`} aria-hidden />
                        <span className="sucursal-select-item-label">{etiquetaTienda(id)}</span>
                        {online && <span className="sucursal-select-online-tag">en línea</span>}
                        {activo && <span className="muted" style={{ fontSize: '0.75rem', marginLeft: '0.35rem' }}>actual</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className="card"
      style={{
        borderLeft: '5px solid var(--brand-blue)',
        padding: '1rem 1.15rem',
        background: 'linear-gradient(135deg, rgba(59,105,181,0.08) 0%, #fff 55%)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ flex: '1 1 200px' }}>
          <p className="muted" style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
            Tienda activa ahora
          </p>
          <p style={{ margin: '0.25rem 0 0', fontSize: '1.15rem', fontWeight: 800, color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span className={`sucursal-dot ${onlineActual ? 'is-online' : 'is-offline'}`} aria-hidden />
            {etiquetaTienda(actual)}
          </p>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
            Para aprobar un vale o gasto de una caja, cambia a esa sucursal (ej. 3B5) y entra a Vales / Incidencias.
          </p>
        </div>
        <button type="button" className="btn btn-primary" style={{ minHeight: 48, fontWeight: 700 }} onClick={() => setAbierto(true)}>
          Cambiar de tienda
        </button>
      </div>
      {portal}
    </div>
  );
}
