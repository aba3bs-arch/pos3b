import React, { useEffect, useId, useState } from 'react';
import Icon from './Icon.jsx';

function soportaEnmascaradoCss() {
  try {
    return typeof CSS !== 'undefined' && CSS.supports('-webkit-text-security', 'disc');
  } catch {
    return false;
  }
}

/**
 * Campo PIN oculto con botón de ojo para mostrar/ocultar.
 * Evita que el navegador / gestores de contraseñas guarden o rellenen el PIN:
 * no usa type=password cuando el CSS puede enmascarar; nombres únicos y readOnly hasta el foco.
 */
export default function InputPin({
  value,
  onChange,
  onKeyDown,
  placeholder = 'PIN',
  disabled = false,
  autoFocus = false,
  className = 'input',
  style,
  inputMode = 'numeric',
  autoComplete = 'off',
  name,
}) {
  const uid = useId();
  const [visible, setVisible] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [maskCss, setMaskCss] = useState(true);
  const fieldName = name || `pos-pin-${uid.replace(/:/g, '')}`;

  useEffect(() => {
    setMaskCss(soportaEnmascaradoCss());
  }, []);

  // Preferir text + CSS; solo password si el navegador no enmascara (p. ej. Firefox).
  const inputType = visible || maskCss ? 'text' : 'password';

  return (
    <div className="input-pin-wrap" style={style?.marginBottom != null ? { marginBottom: style.marginBottom } : undefined}>
      <input
        type={inputType}
        name={fieldName}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-form-type="other"
        role="presentation"
        readOnly={!unlocked && !disabled}
        onFocus={() => setUnlocked(true)}
        className={`${className}${!visible && maskCss ? ' input-pin-masked' : ''}`}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        style={{
          fontSize: '1.5rem',
          textAlign: 'center',
          letterSpacing: '0.2em',
          width: '100%',
          paddingRight: '3rem',
          ...(style || {}),
        }}
      />
      <button
        type="button"
        className="input-pin-toggle"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? 'Ocultar PIN' : 'Ver PIN'}
        title={visible ? 'Ocultar PIN' : 'Ver PIN'}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} size={20} />
      </button>
    </div>
  );
}
