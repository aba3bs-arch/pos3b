import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';

/**
 * Selector de sucursal.
 * Siempre abre un panel modal en document.body (funciona en PC, Android e iPhone).
 * Evita: overflow del header, select invisible, races touch/click.
 */
export default function SelectorSucursal({
  value,
  onChange,
  lista = [],
  presenciaMap = {},
  className = 'select',
  style,
  title = 'Tienda',
  disabled = false,
  mostrarLeyenda = false,
  avisoPresencia = '',
}) {
  const [abierto, setAbierto] = useState(false);
  const wrapRef = useRef(null);
  const listId = useId();
  const actual = normalizarCodigoTienda(value);
  const onlineActual = Boolean(presenciaMap?.[actual]?.online);

  useEffect(() => {
    if (!abierto) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [abierto]);

  const elegir = (codigo) => {
    onChange?.(normalizarCodigoTienda(codigo));
    setAbierto(false);
  };

  const portal =
    abierto && typeof document !== 'undefined'
      ? createPortal(
          <div className="sucursal-sheet" role="presentation">
            <button type="button" className="sucursal-sheet-backdrop" aria-label="Cerrar" onClick={() => setAbierto(false)} />
            <div className="sucursal-sheet-panel" role="dialog" aria-modal="true" aria-labelledby={`${listId}-title`}>
              <div className="sucursal-sheet-handle" aria-hidden />
              <div className="sucursal-sheet-head">
                <h3 id={`${listId}-title`}>Elegir sucursal</h3>
                <button type="button" className="btn btn-ghost sucursal-sheet-close" onClick={() => setAbierto(false)}>
                  Cerrar
                </button>
              </div>
              <ul id={listId} className="sucursal-sheet-list" role="listbox">
                {(lista || []).map((s) => {
                  const id = normalizarCodigoTienda(s);
                  const online = Boolean(presenciaMap?.[id]?.online);
                  const activo = id === actual;
                  return (
                    <li key={id} role="option" aria-selected={activo}>
                      <button
                        type="button"
                        className={`sucursal-select-item${activo ? ' is-active' : ''}`}
                        onClick={() => elegir(id)}
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
    <div className="sucursal-select-wrap" ref={wrapRef} style={style}>
      <button
        type="button"
        className={`sucursal-select-trigger ${className}`}
        disabled={disabled}
        title={title}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={listId}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setAbierto(true);
        }}
      >
        <span className={`sucursal-dot ${onlineActual ? 'is-online' : 'is-offline'}`} aria-hidden />
        <span className="sucursal-select-label">{etiquetaTienda(actual)}</span>
        <span className="sucursal-select-caret" aria-hidden>
          ▾
        </span>
      </button>
      {portal}
      {mostrarLeyenda && (
        <p className="muted sucursal-select-leyenda">
          {avisoPresencia || (
            <>
              <span className="sucursal-dot is-online" style={{ display: 'inline-block', verticalAlign: 'middle' }} />{' '}
              = en línea · toca para cambiar de tienda
            </>
          )}
        </p>
      )}
    </div>
  );
}
