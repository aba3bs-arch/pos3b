import React, { useState } from 'react';
import { BtnLabel } from './Icon.jsx';
import { limpiarCacheTemporal, formatoBytesAprox, TEXTO_AYUDA_LIMPIEZA } from '../lib/limpiarCache.js';

export default function BotonLimpiarCache({ className = 'btn btn-ghost', style }) {
  const [limpiando, setLimpiando] = useState(false);

  const manejarClick = async () => {
    if (!confirm(`¿Limpiar caché y archivos temporales?\n\n${TEXTO_AYUDA_LIMPIEZA}`)) return;
    setLimpiando(true);
    try {
      const res = await limpiarCacheTemporal();
      const msg =
        `Listo.\n\n` +
        `• ${res.claves} dato(s) temporal(es) eliminados (~${formatoBytesAprox(res.bytes)})\n` +
        (res.session > 0 ? `• ${res.session} dato(s) de sesión del navegador\n` : '') +
        `\nPuedes seguir trabajando con normalidad.`;
      alert(msg);
    } catch (e) {
      alert(`No se pudo completar la limpieza: ${e?.message || e}`);
      setLimpiando(false);
    }
  };

  return (
    <button
      type="button"
      className={className}
      style={style}
      disabled={limpiando}
      onClick={manejarClick}
      title="Borra datos temporales locales para mejorar el rendimiento"
    >
      <BtnLabel icon="refresh">{limpiando ? 'Limpiando…' : 'Limpiar caché'}</BtnLabel>
    </button>
  );
}
