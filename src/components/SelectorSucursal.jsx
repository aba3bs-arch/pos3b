import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';

function esMovilViewport() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 768px)').matches;
}

/**
 * Selector de sucursal con punto verde/gris.
 * En móvil: hoja inferior (bottom sheet) vía portal — no depende del overflow del header.
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
  const [sheetMovil, setSheetMovil] = useState(() => esMovilViewport());
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const touchRef = useRef({ x: 0, y: 0, moved: false });
  const ignoreClickRef = useRef(false);
  const listId = useId();
  const actual = normalizarCodigoTienda(value);
  const onlineActual = Boolean(presenciaMap?.[actual]?.online);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => setSheetMovil(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const actualizarPosicionEscritorio = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;
    const width = Math.min(Math.max(r.width, 240), vw - 16);
    let left = r.left;
    if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
    const espacioAbajo = vh - r.bottom - 12;
    const espacioArriba = r.top - 12;
    const preferAbajo = espacioAbajo >= 140 || espacioAbajo >= espacioArriba;
    const maxH = Math.min(360, Math.max(160, preferAbajo ? espacioAbajo : espacioArriba));
    const top = preferAbajo ? r.bottom + 4 : Math.max(8, r.top - 4 - maxH);
    setMenuPos({ top, left, width, maxHeight: maxH });
  };

  useLayoutEffect(() => {
    if (!abierto || sheetMovil) {
      if (!abierto) setMenuPos(null);
      return undefined;
    }
    actualizarPosicionEscritorio();
    const onReposition = () => actualizarPosicionEscritorio();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, { passive: true });
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition);
    };
  }, [abierto, sheetMovil]);

  useEffect(() => {
    if (!abierto) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    if (sheetMovil) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [abierto, sheetMovil]);

  const cerrar = () => setAbierto(false);

  const toggleDesdeClick = (e) => {
    e.stopPropagation();
    if (ignoreClickRef.current) {
      ignoreClickRef.current = false;
      return;
    }
    if (disabled) return;
    setAbierto((v) => !v);
  };

  const elegir = (codigo) => {
    onChange?.(codigo);
    setAbierto(false);
  };

  const items = (lista || []).map((s) => {
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
  });

  const menuPortal =
    abierto && typeof document !== 'undefined'
      ? createPortal(
          sheetMovil ? (
            <div className="sucursal-sheet" role="presentation">
              <button type="button" className="sucursal-sheet-backdrop" aria-label="Cerrar" onClick={cerrar} />
              <div
                className="sucursal-sheet-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${listId}-title`}
                ref={menuRef}
              >
                <div className="sucursal-sheet-handle" aria-hidden />
                <div className="sucursal-sheet-head">
                  <h3 id={`${listId}-title`}>Elegir sucursal</h3>
                  <button type="button" className="btn btn-ghost sucursal-sheet-close" onClick={cerrar}>
                    Cerrar
                  </button>
                </div>
                <ul id={listId} className="sucursal-sheet-list" role="listbox">
                  {items}
                </ul>
              </div>
            </div>
          ) : menuPos ? (
            <>
              <button type="button" className="sucursal-select-backdrop" aria-label="Cerrar lista" onClick={cerrar} />
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
                {items}
              </ul>
            </>
          ) : null,
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
        onClick={toggleDesdeClick}
        onTouchStart={(e) => {
          const t = e.touches?.[0];
          if (!t) return;
          touchRef.current = { x: t.clientX, y: t.clientY, moved: false };
        }}
        onTouchMove={(e) => {
          const t = e.touches?.[0];
          if (!t) return;
          const dx = Math.abs(t.clientX - touchRef.current.x);
          const dy = Math.abs(t.clientY - touchRef.current.y);
          if (dx > 10 || dy > 10) touchRef.current.moved = true;
        }}
        onTouchEnd={(e) => {
          if (disabled || touchRef.current.moved) return;
          // Evita que el click sintético cierre al instante lo que acabamos de abrir.
          ignoreClickRef.current = true;
          e.preventDefault();
          e.stopPropagation();
          setAbierto(true);
        }}
      >
        <span className={`sucursal-dot ${onlineActual ? 'is-online' : 'is-offline'}`} aria-hidden />
        <span className="sucursal-select-label">{etiquetaTienda(actual)}</span>
        <span className="sucursal-select-caret" aria-hidden>
          ▾
        </span>
      </button>
      {menuPortal}
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
