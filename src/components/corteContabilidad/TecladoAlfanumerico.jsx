import React, { useCallback, useEffect, useState } from 'react';

const FILAS_ALPHA = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '-', '.', '/'],
];

const FILAS_NUM = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['0', '.', '00'],
];

function setNativeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  desc?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertarEnCampo(el, texto, { reemplazarSeleccion = true } = {}) {
  if (!el || el.readOnly || el.disabled) return;
  const start = el.selectionStart ?? String(el.value || '').length;
  const end = el.selectionEnd ?? start;
  const actual = String(el.value ?? '');
  const desde = reemplazarSeleccion ? start : end;
  const hasta = reemplazarSeleccion ? end : end;
  const next = actual.slice(0, desde) + texto + actual.slice(hasta);
  setNativeValue(el, next);
  const caret = desde + texto.length;
  try {
    el.setSelectionRange(caret, caret);
  } catch {
    /* ignore */
  }
}

function borrarEnCampo(el) {
  if (!el || el.readOnly || el.disabled) return;
  const start = el.selectionStart ?? String(el.value || '').length;
  const end = el.selectionEnd ?? start;
  const actual = String(el.value ?? '');
  let next;
  let caret;
  if (start !== end) {
    next = actual.slice(0, start) + actual.slice(end);
    caret = start;
  } else if (start > 0) {
    next = actual.slice(0, start - 1) + actual.slice(start);
    caret = start - 1;
  } else {
    return;
  }
  setNativeValue(el, next);
  try {
    el.setSelectionRange(caret, caret);
  } catch {
    /* ignore */
  }
}

function limpiarCampo(el) {
  if (!el || el.readOnly || el.disabled) return;
  setNativeValue(el, '');
  try {
    el.setSelectionRange(0, 0);
  } catch {
    /* ignore */
  }
}

/**
 * Teclado en pantalla para capturar en tablets / POS sin teclado físico.
 * modo: 'alpha' | 'num'
 */
export default function TecladoAlfanumerico({
  visible,
  modo = 'alpha',
  target,
  onModoChange,
  onCerrar,
  accent,
}) {
  const [mayus, setMayus] = useState(true);

  useEffect(() => {
    if (visible) setMayus(modo === 'alpha');
  }, [visible, modo, target]);

  const keepFocus = useCallback((e) => {
    e.preventDefault();
  }, []);

  const aplicarTecla = useCallback(
    (raw) => {
      if (!target) return;
      const esNum = modo === 'num';
      let texto = raw;
      if (!esNum && /[A-ZÑ]/.test(raw)) {
        texto = mayus ? raw : raw.toLowerCase();
      }
      if (esNum) {
        const actual = String(target.value ?? '');
        const start = target.selectionStart ?? actual.length;
        const end = target.selectionEnd ?? start;
        const selected = start !== end;
        if (texto === '.' && !selected && actual.includes('.')) return;
        if (texto === '00' && (selected ? false : actual === '' || actual === '0')) {
          texto = '0';
        }
      }
      insertarEnCampo(target, texto);
      target.focus({ preventScroll: true });
    },
    [target, modo, mayus],
  );

  if (!visible) return null;

  const filas = modo === 'num' ? FILAS_NUM : FILAS_ALPHA;
  const borderColor = accent || 'var(--brand-blue)';

  return (
    <div
      className="corte-teclado"
      style={{ '--corte-teclado-accent': borderColor }}
      onMouseDown={keepFocus}
      role="group"
      aria-label="Teclado en pantalla"
    >
      <div className="corte-teclado-bar">
        <div className="corte-teclado-modos">
          <button
            type="button"
            className={`corte-teclado-modo${modo === 'alpha' ? ' is-active' : ''}`}
            onClick={() => onModoChange?.('alpha')}
          >
            ABC
          </button>
          <button
            type="button"
            className={`corte-teclado-modo${modo === 'num' ? ' is-active' : ''}`}
            onClick={() => onModoChange?.('num')}
          >
            123
          </button>
        </div>
        <span className="corte-teclado-hint muted">
          {modo === 'num' ? 'Teclado numérico' : 'Teclado alfanumérico'}
        </span>
        <button type="button" className="corte-teclado-cerrar" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <div className={`corte-teclado-grid${modo === 'num' ? ' is-num' : ''}`}>
        {filas.map((fila, i) => (
          <div key={i} className="corte-teclado-fila">
            {fila.map((k) => {
              const label = modo === 'alpha' && /[A-ZÑ]/.test(k) ? (mayus ? k : k.toLowerCase()) : k;
              return (
                <button
                  key={k}
                  type="button"
                  className="corte-teclado-key"
                  onClick={() => aplicarTecla(k)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ))}

        <div className="corte-teclado-fila corte-teclado-fila-acciones">
          {modo === 'alpha' && (
            <button
              type="button"
              className={`corte-teclado-key corte-teclado-key-wide${mayus ? ' is-active' : ''}`}
              onClick={() => setMayus((v) => !v)}
              aria-pressed={mayus}
            >
              ⇧ Mayús
            </button>
          )}
          <button
            type="button"
            className="corte-teclado-key corte-teclado-key-wide"
            onClick={() => {
              if (target) {
                borrarEnCampo(target);
                target.focus({ preventScroll: true });
              }
            }}
          >
            ⌫ Borrar
          </button>
          {modo === 'alpha' && (
            <button
              type="button"
              className="corte-teclado-key corte-teclado-key-space"
              onClick={() => aplicarTecla(' ')}
            >
              Espacio
            </button>
          )}
          <button
            type="button"
            className="corte-teclado-key corte-teclado-key-wide"
            onClick={() => {
              if (target) {
                limpiarCampo(target);
                target.focus({ preventScroll: true });
              }
            }}
          >
            Limpiar
          </button>
          <button
            type="button"
            className="corte-teclado-key corte-teclado-key-wide corte-teclado-key-ok"
            onClick={onCerrar}
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

export { insertarEnCampo, borrarEnCampo, limpiarCampo, setNativeValue };
