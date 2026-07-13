/**
 * Al enfocar un campo de cantidad/número, selecciona todo el valor
 * para que al teclear se reemplace el cero (o el dato anterior).
 */

function esCampoCantidad(el) {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
  if (el.readOnly || el.disabled) return false;
  if (el.dataset.noSelectOnFocus === '1' || el.dataset.noSelectOnFocus === 'true') return false;
  if (el.dataset.selectOnFocus === '1' || el.dataset.selectOnFocus === 'true') return true;

  const type = String(el.type || 'text').toLowerCase();
  if (type === 'number') return true;
  // Teléfonos y fechas no son cantidades.
  if (type === 'tel' || type === 'email' || type === 'date' || type === 'time' || type === 'datetime-local') {
    return false;
  }
  if (type === 'search' || type === 'url') return false;

  const mode = String(el.inputMode || '').toLowerCase();
  if (mode === 'decimal' || mode === 'numeric') return true;

  if (el.classList.contains('input-cantidad') || el.classList.contains('corte-campo-editable')) return true;
  return false;
}

function seleccionarAhora(el) {
  try {
    if (typeof el.select === 'function') el.select();
  } catch {
    /* ignore */
  }
}

/** Handler reutilizable: onFocus={seleccionarAlEnfocar} */
export function seleccionarAlEnfocar(e) {
  const el = e?.currentTarget || e?.target;
  if (!el) return;
  // En móvil/escritorio el click a veces mueve el caret después del focus.
  requestAnimationFrame(() => seleccionarAhora(el));
}

/**
 * Instala listener global. Devuelve cleanup.
 * Llamar una vez desde App.
 */
export function instalarSeleccionCamposCantidad() {
  const pending = new WeakSet();

  const programarSelect = (el) => {
    if (!esCampoCantidad(el) || pending.has(el)) return;
    pending.add(el);
    const run = () => {
      pending.delete(el);
      if (document.activeElement === el) seleccionarAhora(el);
    };
    // Doble rAF + timeout corto: en Chrome el mouseup mueve el caret después del focus.
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
      setTimeout(run, 0);
    });
  };

  const onFocusIn = (e) => programarSelect(e.target);

  const onMouseUp = (e) => {
    const el = e.target;
    if (document.activeElement === el) programarSelect(el);
  };

  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('mouseup', onMouseUp, true);
  return () => {
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('mouseup', onMouseUp, true);
  };
}
