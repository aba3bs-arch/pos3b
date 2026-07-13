import React from 'react';
import { BotonEscanerCamara } from './EscanerCamara.jsx';
import { prepararAudioPos, sonidoEscaneoProducto } from '../lib/sonidosPos.js';

/**
 * Input de código de barras / SKU con botón de cámara (móvil) y beep al confirmar.
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
  /** Si true, Enter (lector USB/Bluetooth) dispara beep + onEscanear. */
  beepAlEnter = false,
  children,
  type = 'text',
}) {
  const aplicarCodigo = (codigo, { conSonido = true } = {}) => {
    const c = String(codigo || '').trim();
    if (!c) return;
    if (conSonido) sonidoEscaneoProducto();
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
        onFocus={() => prepararAudioPos()}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented) return;
          if (e.key !== 'Enter' || !beepAlEnter) return;
          const c = String(e.currentTarget?.value || value || '').trim();
          if (!c) return;
          e.preventDefault();
          // Lector HID: beep + apply. La cámara ya emite beep en EscanerCamara.
          aplicarCodigo(c, { conSonido: true });
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        enterKeyHint="done"
      />
      <BotonEscanerCamara
        titulo={tituloCamara}
        label="Cámara"
        onCodigo={(codigo) => {
          // El beep ya lo emite EscanerCamara al leer el código.
          const c = String(codigo || '').trim();
          if (!c) return;
          if (onEscanear) onEscanear(c);
          else onChange?.({ target: { value: c } });
        }}
      />
      {children}
    </div>
  );
}
