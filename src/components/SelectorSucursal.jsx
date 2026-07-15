import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';

/** Layout estrecho o teléfono (sin mouse con hover). */
export function esSelectorTactil() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(max-width: 768px)').matches) return true;
    if (window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(hover: none)').matches) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Selector de sucursal para Central / header.
 *
 * Causa raíz de fallos en móvil (historial):
 * 1) Menú absolute dentro de header con overflow → se recorta.
 * 2) touchEnd + click sintético → abre y cierra al instante.
 * 3) &lt;select&gt; con opacity:0 → Android/iOS no abren el picker.
 *
 * Solución móvil: botón simple + hoja modal (portal a body) con lista de botones.
 * Escritorio: menú flotante con portal.
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
  const [tactil, setTactil] = useState(() => esSelectorTactil());
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const listId = useId();
  const actual = normalizarCodigoTienda(value);
  const onlineActual = Boolean(presenciaMap?.[actual]?.online);

  useEffect(() => {
    const sync = () => setTactil(esSelectorTactil());
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);

  useEffect(() => {
    if (!abierto) return undefined;
    const prev = document.body.style.overflow;
    if (tactil) document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [abierto, tactil]);

  const actualizarPosicionEscritorio = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;
    const width = Math.min(Math.max(r.width, 260), vw - 16);
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
    if (!abierto || tactil) {
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
  }, [abierto, tactil]);

  useEffect(() => {
    if (!abierto || tactil) return undefined;
    let removePd = () => {};
    const t = window.setTimeout(() => {
      const onPointerDown = (e) => {
        if (wrapRef.current?.contains(e.target)) return;
        if (menuRef.current?.contains(e.target)) return;
        setAbierto(false);
      };
      document.addEventListener('pointerdown', onPointerDown, true);
      removePd = () => document.removeEventListener('pointerdown', onPointerDown, true);
    }, 10);
    return () => {
      window.clearTimeout(t);
      removePd();
    };
  }, [abierto, tactil]);

  const elegir = (codigo) => {
    onChange?.(normalizarCodigoTienda(codigo));
    setAbierto(false);
  };

  const itemsLista = (lista || []).map((s) => {
    const id = normalizarCodigoTienda(s);
    const online = Boolean(presenciaMap?.[id]?.online);
    const activo = id === actual;
    return (
      <li key={id} role="option" aria-selected={activo}>
        <button type="button" className={`sucursal-select-item${activo ? ' is-active' : ''}`} onClick={() => elegir(id)}>
          <span className={`sucursal-dot ${online ? 'is-online' : 'is-offline'}`} aria-hidden />
          <span className="sucursal-select-item-label">{etiquetaTienda(id)}</span>
          {online && <span className="sucursal-select-online-tag">en línea</span>}
        </button>
      </li>
    );
  });

  const portalMovil =
    tactil && abierto && typeof document !== 'undefined'
      ? createPortal(
          <div className="sucursal-sheet" role="presentation">
            <button type="button" className="sucursal-sheet-backdrop" aria-label="Cerrar" onClick={() => setAbierto(false)} />
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
                <button type="button" className="btn btn-ghost sucursal-sheet-close" onClick={() => setAbierto(false)}>
                  Cerrar
                </button>
              </div>
              <ul id={listId} className="sucursal-sheet-list" role="listbox">
                {itemsLista}
              </ul>
            </div>
          </div>,
          document.body,
        )
      : null;

  const portalEscritorio =
    !tactil && abierto && menuPos && typeof document !== 'undefined'
      ? createPortal(
          <>
            <button type="button" className="sucursal-select-backdrop" aria-label="Cerrar lista" onClick={() => setAbierto(false)} />
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
              {itemsLista}
            </ul>
          </>,
          document.body,
        )
      : null;

  return (
    <div className={`sucursal-select-wrap${tactil ? ' sucursal-select-wrap--touch' : ''}`} ref={wrapRef} style={style}>
      <button
        ref={triggerRef}
        type="button"
        className={`sucursal-select-trigger ${className}`}
        disabled={disabled}
        title={title}
        aria-haspopup={tactil ? 'dialog' : 'listbox'}
        aria-expanded={abierto}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setAbierto((v) => !v);
        }}
      >
        <span className={`sucursal-dot ${onlineActual ? 'is-online' : 'is-offline'}`} aria-hidden />
        <span className="sucursal-select-label">{etiquetaTienda(actual)}</span>
        <span className="sucursal-select-caret" aria-hidden>
          ▾
        </span>
      </button>
      {portalMovil}
      {portalEscritorio}
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
