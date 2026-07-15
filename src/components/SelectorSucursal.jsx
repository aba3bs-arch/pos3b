import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';

/** Android/iPhone (y tablets táctiles): usar selector nativo del sistema. */
function esDispositivoTactil() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return true;
    if (window.matchMedia('(max-width: 768px)').matches) return true;
  } catch {
    /* ignore */
  }
  return 'ontouchstart' in window && Math.min(window.innerWidth, window.innerHeight) <= 900;
}

/**
 * Selector de sucursal con punto verde/gris.
 * - Móvil/táctil: &lt;select&gt; nativo (abre el picker del sistema; no falla por overflow del header).
 * - Escritorio: menú custom con portal.
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
  const [tactil, setTactil] = useState(() => esDispositivoTactil());
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const listId = useId();
  const actual = normalizarCodigoTienda(value);
  const onlineActual = Boolean(presenciaMap?.[actual]?.online);

  useEffect(() => {
    const sync = () => setTactil(esDispositivoTactil());
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
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
    const onPointerDown = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setAbierto(false);
    };
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
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

  // ——— Móvil / táctil: picker nativo del SO (siempre funciona en Android e iPhone) ———
  if (tactil) {
    return (
      <div className="sucursal-select-wrap sucursal-select-wrap--native" ref={wrapRef} style={style}>
        <label className={`sucursal-select-native ${className}`} title={title}>
          <span className={`sucursal-dot ${onlineActual ? 'is-online' : 'is-offline'}`} aria-hidden />
          <span className="sucursal-select-label">{etiquetaTienda(actual)}</span>
          <span className="sucursal-select-caret" aria-hidden>
            ▾
          </span>
          <select
            className="sucursal-select-native-el"
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
        </label>
        {mostrarLeyenda && (
          <p className="muted sucursal-select-leyenda">
            {avisoPresencia || (
              <>
                <span className="sucursal-dot is-online" style={{ display: 'inline-block', verticalAlign: 'middle' }} />{' '}
                ● = en línea · ○ = sin sesión
              </>
            )}
          </p>
        )}
      </div>
    );
  }

  // ——— Escritorio: menú custom ———
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
