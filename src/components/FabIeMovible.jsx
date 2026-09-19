import React, { useCallback, useEffect, useRef, useState } from 'react';
import PortalFlotante from './PortalFlotante.jsx';

const LS_POS = 'pos3b_ie_fab_pos';
const FAB_W = 56;
const FAB_GAP = 10;
const GROUP_H = FAB_W * 2 + FAB_GAP;
const DRAG_THRESHOLD = 8;

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
 * Botones ＋I / ＋E flotantes (fijos al viewport) y arrastrables.
 * La posición se recuerda por libro (IE VIRTUAL / IE ABARROTES).
 */
export default function FabIeMovible({
  libro = 'antonio',
  onIngreso,
  onEgreso,
  visible = true,
}) {
  const clave = String(libro || 'antonio');
  const [pos, setPos] = useState(() => leerPos(clave) || posDefault());
  const dragRef = useRef(null);
  const movedRef = useRef(false);

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
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    movedRef.current = false;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };
  }, [pos.x, pos.y]);

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!movedRef.current && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      movedRef.current = true;
    }
    if (!movedRef.current) return;
    e.preventDefault();
    setPos(clampPos(d.origX + dx, d.origY + dy));
  }, []);

  const onPointerUp = useCallback((e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (movedRef.current) {
      setPos((p) => {
        const next = clampPos(p.x, p.y);
        guardarPos(clave, next);
        return next;
      });
    }
  }, [clave]);

  const clickSafe = useCallback((fn) => (e) => {
    if (movedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      movedRef.current = false;
      return;
    }
    fn?.(e);
  }, []);

  if (!visible) return null;

  return (
    <PortalFlotante>
      <div
        className="cv-fab-float"
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="toolbar"
        aria-label="Ingreso y egreso (arrastra para mover)"
        title="Mantén y arrastra para mover"
      >
        <button
          type="button"
          className="cv-fab ingreso"
          aria-label="Agregar ingreso"
          title="Ingreso manual"
          onClick={clickSafe(onIngreso)}
        >
          ＋I
        </button>
        <button
          type="button"
          className="cv-fab"
          aria-label="Agregar egreso"
          title="Egreso manual"
          onClick={clickSafe(onEgreso)}
        >
          ＋E
        </button>
      </div>
    </PortalFlotante>
  );
}
