import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';

/**
 * Selector de sucursal con punto verde/gris (Windows no muestra emojis bien en &lt;option&gt;).
 * En móvil el menú va fixed para que no lo recorte el scroll del header.
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
  const [menuPos, setMenuPos] = useState(null);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const listId = useId();
  const actual = normalizarCodigoTienda(value);
  const onlineActual = Boolean(presenciaMap?.[actual]?.online);

  const actualizarPosicion = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxH = Math.min(320, Math.max(160, window.innerHeight - r.bottom - 12));
    const width = Math.min(Math.max(r.width, 240), window.innerWidth - 16);
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    setMenuPos({
      top: r.bottom + 4,
      left,
      width,
      maxHeight: maxH,
    });
  };

  useLayoutEffect(() => {
    if (!abierto) return undefined;
    actualizarPosicion();
    const onScroll = () => actualizarPosicion();
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setAbierto(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
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
        ref={triggerRef}
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
      {abierto && menuPos && (
        <ul
          id={listId}
          className="sucursal-select-menu sucursal-select-menu--fixed"
          role="listbox"
          style={{
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            maxHeight: menuPos.maxHeight,
          }}
        >
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
