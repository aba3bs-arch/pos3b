import React, { useState } from 'react';
import Icon from './Icon.jsx';

/**
 * Campo PIN oculto con botón de ojo para mostrar/ocultar.
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
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="input-pin-wrap" style={style?.marginBottom != null ? { marginBottom: style.marginBottom } : undefined}>
      <input
        type={visible ? 'text' : 'password'}
        inputMode={inputMode}
        autoComplete={autoComplete}
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
