import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';

/**
 * Cambio de tienda desde Central (Inicio).
 * Incluye botón + lista modal, y un <select> nativo visible por si el modal falla en algún teléfono.
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
  const opciones = lista || [];

  const portal =
    abierto && typeof document !== 'undefined'
      ? createPortal(
          <div className="sucursal-sheet" role="presentation">
            <button type="button" className="sucursal-sheet-backdrop" aria-label="Cerrar" onClick={() => setAbierto(false)} />
            <div className="sucursal-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="panel-tienda-central-title">
              <div className="sucursal-sheet-handle" aria-hidden />
              <div className="sucursal-sheet-head">
                <h3 id="panel-tienda-central-title">Elegir tienda</h3>
                <button type="button" className="btn btn-ghost sucursal-sheet-close" onClick={() => setAbierto(false)}>
                  Cerrar
                </button>
              </div>
              <ul className="sucursal-sheet-list" role="listbox">
                {opciones.map((s) => {
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
        background: 'linear-gradient(135deg, rgba(59,105,181,0.1) 0%, #fff 60%)',
      }}
    >
      <p className="muted" style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
        Tienda activa
      </p>
      <p style={{ margin: '0.35rem 0 0', fontSize: '1.2rem', fontWeight: 800, color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <span className={`sucursal-dot ${onlineActual ? 'is-online' : 'is-offline'}`} aria-hidden />
        {etiquetaTienda(actual)}
      </p>
      <p className="muted" style={{ margin: '0.45rem 0 0.85rem', fontSize: '0.88rem' }}>
        Para ver datos o aprobar vales/gastos de una caja, selecciona esa sucursal aquí.
      </p>

      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', minHeight: 52, fontWeight: 800, fontSize: '1.05rem', marginBottom: '0.75rem' }}
        onClick={() => setAbierto(true)}
      >
        Cambiar de tienda
      </button>

      {/* Fallback nativo: en Android/iPhone abre el picker del sistema (siempre visible). */}
      <label className="muted" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700 }}>
        O elige directamente (lista del teléfono)
        <select
          className="select"
          style={{ marginTop: '0.4rem', minHeight: 48, fontSize: 16, fontWeight: 700, width: '100%' }}
          value={actual}
          onChange={(e) => onCambiar(normalizarCodigoTienda(e.target.value))}
          aria-label="Elegir sucursal"
        >
          {opciones.map((s) => {
            const id = normalizarCodigoTienda(s);
            const online = Boolean(presenciaMap?.[id]?.online);
            return (
              <option key={id} value={id}>
                {online ? `● ${etiquetaTienda(id)}` : `○ ${etiquetaTienda(id)}`}
              </option>
            );
          })}
        </select>
      </label>

      {portal}
    </div>
  );
}
