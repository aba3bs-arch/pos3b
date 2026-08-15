import React, { useCallback, useEffect, useRef, useState } from 'react';
import TecladoAlfanumerico from './TecladoAlfanumerico.jsx';

function modoDesdeCampo(el) {
  const attr = el?.getAttribute?.('data-corte-teclado');
  if (attr === 'num' || attr === 'alpha') return attr;
  if (el?.tagName === 'TEXTAREA') return 'alpha';
  if (el?.inputMode === 'decimal' || el?.inputMode === 'numeric' || el?.type === 'number') return 'num';
  return 'alpha';
}

/**
 * Envuelve una pantalla de corte y muestra teclado en pantalla
 * al enfocar inputs/textareas con data-corte-teclado.
 */
export default function CorteConTeclado({ children, accent }) {
  const rootRef = useRef(null);
  const [target, setTarget] = useState(null);
  const [modo, setModo] = useState('alpha');
  const [visible, setVisible] = useState(false);

  const cerrar = useCallback(() => {
    setVisible(false);
    setTarget(null);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const onFocusIn = (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      if (!el.hasAttribute('data-corte-teclado')) return;
      if (el.readOnly || el.disabled) return;
      setTarget(el);
      setModo(modoDesdeCampo(el));
      setVisible(true);
    };

    const onPointerDown = (e) => {
      if (!visible) return;
      const el = e.target;
      if (el instanceof Element && el.closest('.corte-teclado')) return;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (el.hasAttribute('data-corte-teclado') && !el.readOnly && !el.disabled) return;
      }
      // Clic fuera del teclado y de campos con teclado → cerrar
      if (el instanceof Element && root.contains(el) && !el.closest('[data-corte-teclado]')) {
        // no cerrar al interactuar con botones/selects de la misma pantalla
        // (el teclado sigue hasta Listo/Cerrar o cambiar de módulo)
      }
    };

    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('pointerdown', onPointerDown);
    return () => {
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('pointerdown', onPointerDown);
    };
  }, [visible]);

  useEffect(() => {
    if (!target) return undefined;
    const onBlur = () => {
      // Retrasar: si el foco va al teclado (mousedown preventDefault), el input conserva foco.
      // Si el foco se pierde del todo, cerramos un poco después.
      window.setTimeout(() => {
        const activo = document.activeElement;
        if (activo === target) return;
        if (activo instanceof Element && activo.closest('.corte-teclado')) return;
        if (
          activo instanceof HTMLInputElement ||
          activo instanceof HTMLTextAreaElement
        ) {
          if (activo.hasAttribute('data-corte-teclado') && rootRef.current?.contains(activo)) {
            return;
          }
        }
        setVisible(false);
        setTarget(null);
      }, 180);
    };
    target.addEventListener('blur', onBlur);
    return () => target.removeEventListener('blur', onBlur);
  }, [target]);

  return (
    <div
      ref={rootRef}
      className={`corte-con-teclado${visible ? ' teclado-abierto' : ''}`}
    >
      {children}
      <TecladoAlfanumerico
        visible={visible}
        modo={modo}
        target={target}
        accent={accent}
        onModoChange={setModo}
        onCerrar={cerrar}
      />
    </div>
  );
}
