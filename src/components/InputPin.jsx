import React, { useState } from 'react';
import Icon from './Icon.jsx';

/**
 * Campo PIN oculto con botón de ojo para mostrar/ocultar.
 * No usa autocomplete de contraseña del navegador para evitar que quede un PIN anterior.
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
  autoComplete = 'new-password',
  name = 'pos-pin',
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="input-pin-wrap" style={style?.marginBottom != null ? { marginBottom: style.marginBottom } : undefined}>
      <input
        type={visible ? 'text' : 'password'}
        name={name}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        data-form-type="other"
        className={className}
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
