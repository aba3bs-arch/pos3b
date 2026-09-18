import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Eleva el contenido a document.body para que la ventana flote
 * sobre scroll/overflow (iOS no recorta position:fixed dentro de padres).
 *
 * No cambia la UI interna: solo monta `children` fuera del árbol local.
 * Uso mínimo:
 *   {abierto && (
 *     <PortalFlotante>
 *       <div className="prod-modal-backdrop">…</div>
 *     </PortalFlotante>
 *   )}
 */
export default function PortalFlotante({ children, disabled = false }) {
  if (disabled || children == null) return null;
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

/**
 * Ventana flotante estándar (backdrop + panel).
 * Preferir cuando el modal no tenga ya su propio backdrop.
 */
export function VentanaFlotante({
  abierto = true,
  onClose,
  children,
  className = '',
  panelClassName = 'card ventana-flotante-panel',
  labelledBy,
  label,
  cerrarConBackdrop = true,
  zIndex,
}) {
  if (!abierto) return null;

  const style = zIndex != null ? { zIndex } : undefined;

  return (
    <PortalFlotante>
      <div
        className={`ventana-flotante-backdrop ${className}`.trim()}
        role="presentation"
        style={style}
        onClick={() => {
          if (cerrarConBackdrop) onClose?.();
        }}
      >
        <div
          className={panelClassName}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </PortalFlotante>
  );
}
