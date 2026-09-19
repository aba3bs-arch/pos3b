import React, { useCallback, useEffect, useRef, useState } from 'react';
import PortalFlotante from './PortalFlotante.jsx';

const LS_POS = 'pos3b_ie_fab_pos';
const FAB_W = 56;
const FAB_GAP = 10;
const GROUP_H = FAB_W * 2 + FAB_GAP;
const DRAG_THRESHOLD = 10;

function leerPos(clave) {
  try {
    const raw = localStorage.getItem(`${LS_POS}:${clave}`);
    if (!raw) return null;
    const j = JSON.parse(raw);
    const x = Number(j?.x);
    const y = Number(j?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

function guardarPos(clave, pos) {
  try {
    localStorage.setItem(`${LS_POS}:${clave}`, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

function clampPos(x, y) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 700;
  const pad = 8;
  const maxX = Math.max(pad, vw - FAB_W - pad);
  const maxY = Math.max(pad, vh - GROUP_H - pad);
  return {
    x: Math.min(maxX, Math.max(pad, x)),
    y: Math.min(maxY, Math.max(pad, y)),
  };
}

function posDefault() {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 700;
  return clampPos(vw - FAB_W - 16, vh - GROUP_H - 88);
}

/**
 * Botones ＋I / ＋E flotantes y arrastrables.
 * Importante: no capturar el pointer hasta superar el umbral de arrastre,
 * si no el click del botón nunca llega (iOS / Chrome).
 */
export default function FabIeMovible({
  libro = 'antonio',
  onIngreso,
  onEgreso,
  visible = true,
}) {
  const clave = String(libro || 'antonio');
  const [pos, setPos] = useState(() => leerPos(clave) || posDefault());
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const posRef = useRef(pos);
  const rootRef = useRef(null);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    setPos(leerPos(clave) || posDefault());
  }, [clave]);

  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p.x, p.y));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = useCallback((e) => {
    if (e.button != null && e.button !== 0) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: posRef.current.x,
      origY: posRef.current.y,
      moved: false,
    };
  }, []);

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      d.moved = true;
      setDragging(true);
      suppressClickRef.current = true;
      try {
        rootRef.current?.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (!d.moved) return;
    e.preventDefault();
    setPos(clampPos(d.origX + dx, d.origY + dy));
  }, []);

  const onPointerUp = useCallback((e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const moved = d.moved;
    dragRef.current = null;
    setDragging(false);
    try {
      rootRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    if (moved) {
      setPos((p) => {
        const next = clampPos(p.x, p.y);
        guardarPos(clave, next);
        return next;
      });
      window.setTimeout(() => { suppressClickRef.current = false; }, 300);
    }
  }, [clave]);

  const onBtnClick = useCallback((fn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (suppressClickRef.current) return;
    if (dragRef.current?.moved) return;
    fn?.();
  }, []);

  if (!visible) return null;

  return (
    <PortalFlotante>
      <div
        ref={rootRef}
        className={`cv-fab-float${dragging ? ' dragging' : ''}`}
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="toolbar"
        aria-label="Ingreso y egreso (arrastra para mover)"
        title="Toca para abrir · arrastra para mover"
      >
        <button
          type="button"
          className="cv-fab ingreso"
          aria-label="Agregar ingreso"
          title="Ingreso manual"
          onClick={onBtnClick(onIngreso)}
        >
          ＋I
        </button>
        <button
          type="button"
          className="cv-fab"
          aria-label="Agregar egreso"
          title="Egreso manual"
          onClick={onBtnClick(onEgreso)}
        >
          ＋E
        </button>
      </div>
    </PortalFlotante>
  );
}
