import React from 'react';
import { BotonEscanerCamara } from './EscanerCamara.jsx';

/**
 * Input de código de barras / SKU con botón de cámara (móvil).
 */
export default function CampoCodigo({
  value,
  onChange,
  onKeyDown,
  placeholder = 'Código de barras…',
  disabled = false,
  autoFocus = false,
  inputRef,
  className = 'input',
  inputStyle,
  tituloCamara = 'Escanear código',
  onEscanear,
  children,
  type = 'text',
}) {
  const aplicarCodigo = (codigo) => {
    const c = String(codigo || '').trim();
    if (!c) return;
    if (onEscanear) onEscanear(c);
    else onChange?.({ target: { value: c } });
  };

  return (
    <div className="campo-codigo-row">
      <input
        ref={inputRef}
        type={type}
        className={`${className} campo-codigo-input`}
        style={inputStyle}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      <BotonEscanerCamara titulo={tituloCamara} onCodigo={aplicarCodigo} />
      {children}
    </div>
  );
}
