import React, { useEffect, useId, useRef, useState } from 'react';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';

/**
 * Selector de sucursal con punto verde/gris (Windows no muestra emojis bien en &lt;option&gt;).
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
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setAbierto(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [abierto]);

  const elegir = (codigo) => {
    onChange?.(codigo);
    setAbierto(false);
  };

  return (
    <div className="sucursal-select-wrap" ref={wrapRef} style={style}>
      <button
        type="button"
        className={`sucursal-select-trigger ${className}`}
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={listId}
        onClick={() => !disabled && setAbierto((v) => !v)}
      >
        <span className={`sucursal-dot ${onlineActual ? 'is-online' : 'is-offline'}`} aria-hidden />
        <span className="sucursal-select-label">{etiquetaTienda(actual)}</span>
        <span className="sucursal-select-caret" aria-hidden>
          ▾
        </span>
      </button>
      {abierto && (
        <ul id={listId} className="sucursal-select-menu" role="listbox">
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
                  <span>{etiquetaTienda(id)}</span>
                  {online && <span className="sucursal-select-online-tag">en línea</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {mostrarLeyenda && (
        <p className="muted sucursal-select-leyenda">
          {avisoPresencia || (
            <>
              <span className="sucursal-dot is-online" style={{ display: 'inline-block', verticalAlign: 'middle' }} />{' '}
              = POS abierto · gris = sin sesión
            </>
          )}
        </p>
      )}
    </div>
  );
}
