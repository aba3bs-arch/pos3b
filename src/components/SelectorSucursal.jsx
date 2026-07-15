import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';

/** Teléfono / tablet táctil (no PC con mouse). */
export function esSelectorTactil() {
  if (typeof window === 'undefined') return false;
  try {
    // Prioridad: viewport estrecho (layout móvil del POS).
    if (window.matchMedia('(max-width: 768px)').matches) return true;
    // iPhone/Android suelen reportar pointer coarse.
    if (window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(hover: none)').matches) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Selector de sucursal.
 *
 * Móvil: &lt;select&gt; VISIBLE (opacity:0 en móvil bloquea el picker del SO).
 * Escritorio: menú custom con portal + puntos en línea.
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
  const selectRef = useRef(null);
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
    const onKey = (e) => {
      if (e.key === 'Escape') setAbierto(false);
    };
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
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      removePd();
      document.removeEventListener('keydown', onKey);
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

  const menuPortal =
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

  // ——— Móvil: select VISIBLE (opacity:0 rompe el picker en Android/iOS) ———
  if (tactil) {
    return (
      <div className="sucursal-select-wrap sucursal-select-wrap--native" ref={wrapRef} style={style}>
        <div className={`sucursal-select-native-visible ${className}`} title={title}>
          <span className={`sucursal-dot ${onlineActual ? 'is-online' : 'is-offline'}`} aria-hidden />
          <select
            ref={selectRef}
            className="sucursal-select-native-visible-el"
            value={actual}
            disabled={disabled}
            aria-label={title}
            onChange={(e) => onChange?.(normalizarCodigoTienda(e.target.value))}
          >
            {(lista || []).map((s) => {
              const id = normalizarCodigoTienda(s);
              const online = Boolean(presenciaMap?.[id]?.online);
              const base = etiquetaTienda(id);
              return (
                <option key={id} value={id}>
                  {online ? `● ${base}` : `○ ${base}`}
                </option>
              );
            })}
          </select>
        </div>
        {mostrarLeyenda && (
          <p className="muted sucursal-select-leyenda">
            {avisoPresencia || '● en línea · ○ sin sesión · toca para cambiar de tienda'}
          </p>
        )}
      </div>
    );
  }

  // ——— Escritorio ———
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
      {menuPortal}
      {mostrarLeyenda && (
        <p className="muted sucursal-select-leyenda">
          {avisoPresencia || (
            <>
              <span className="sucursal-dot is-online" style={{ display: 'inline-block', verticalAlign: 'middle' }} />{' '}
              = POS / central abierto · gris = sin sesión
            </>
          )}
        </p>
      )}
    </div>
  );
}
