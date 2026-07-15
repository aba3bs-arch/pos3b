import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';

/**
 * Selector de sucursal con punto verde/gris.
 * El menú se renderiza en document.body (portal) para que en móvil
 * no lo tape ni recorte el overflow-x del header.
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
  const menuRef = useRef(null);
  const listId = useId();
  const actual = normalizarCodigoTienda(value);
  const onlineActual = Boolean(presenciaMap?.[actual]?.online);

  const actualizarPosicion = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;
    const isNarrow = vw <= 768;
    const width = isNarrow
      ? Math.min(vw - 16, Math.max(r.width, Math.min(320, vw - 16)))
      : Math.min(Math.max(r.width, 240), vw - 16);
    let left = isNarrow ? Math.max(8, (vw - width) / 2) : r.left;
    if (left + width > vw - 8) left = Math.max(8, vw - width - 8);

    const espacioAbajo = vh - r.bottom - 12;
    const espacioArriba = r.top - 12;
    const preferAbajo = espacioAbajo >= 140 || espacioAbajo >= espacioArriba;
    const maxH = Math.min(360, Math.max(160, preferAbajo ? espacioAbajo : espacioArriba));
    const top = preferAbajo ? r.bottom + 4 : Math.max(8, r.top - 4 - maxH);

    setMenuPos({ top, left, width, maxHeight: maxH });
  };

  useLayoutEffect(() => {
    if (!abierto) {
      setMenuPos(null);
      return undefined;
    }
    actualizarPosicion();
    const onReposition = () => actualizarPosicion();
    window.addEventListener('resize', onReposition);
    window.visualViewport?.addEventListener('resize', onReposition);
    window.visualViewport?.addEventListener('scroll', onReposition);
    // No capturar scroll de contenedores: en móvil el header tiene overflow-x
    // y mover un pelo el dedo cerraba/reposicionaba mal el menú.
    window.addEventListener('scroll', onReposition, { passive: true });
    return () => {
      window.removeEventListener('resize', onReposition);
      window.visualViewport?.removeEventListener('resize', onReposition);
      window.visualViewport?.removeEventListener('scroll', onReposition);
      window.removeEventListener('scroll', onReposition);
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    // Diferir el cierre por fuera: el mismo toque que abre no debe cerrar al instante.
    let removeOutside = () => {};
    const t = window.setTimeout(() => {
      const onPointerDown = (e) => {
        const tEl = e.target;
        if (wrapRef.current?.contains(tEl)) return;
        if (menuRef.current?.contains(tEl)) return;
        setAbierto(false);
      };
      document.addEventListener('pointerdown', onPointerDown, true);
      removeOutside = () => document.removeEventListener('pointerdown', onPointerDown, true);
    }, 50);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      removeOutside();
      document.removeEventListener('keydown', onKey);
    };
  }, [abierto]);

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setAbierto((v) => !v);
  };

  const elegir = (codigo) => {
    onChange?.(codigo);
    setAbierto(false);
  };

  const menu =
    abierto && menuPos && typeof document !== 'undefined'
      ? createPortal(
          <>
            <button
              type="button"
              className="sucursal-select-backdrop"
              aria-label="Cerrar lista de sucursales"
              onClick={() => setAbierto(false)}
            />
            <ul
              ref={menuRef}
              id={listId}
              className="sucursal-select-menu sucursal-select-menu--portal"
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
          </>,
          document.body,
        )
      : null;

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
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className={`sucursal-dot ${onlineActual ? 'is-online' : 'is-offline'}`} aria-hidden />
        <span className="sucursal-select-label">{etiquetaTienda(actual)}</span>
        <span className="sucursal-select-caret" aria-hidden>
          ▾
        </span>
      </button>
      {menu}
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
