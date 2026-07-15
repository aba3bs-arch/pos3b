import React, { useState } from 'react';
import { BtnLabel } from './Icon.jsx';
import { limpiarCacheTemporal, formatoBytesAprox, TEXTO_AYUDA_LIMPIEZA } from '../lib/limpiarCache.js';

export default function BotonLimpiarCache({ className = 'btn btn-ghost', style }) {
  const [limpiando, setLimpiando] = useState(false);

  const manejarClick = async () => {
    if (!confirm(`¿Limpiar caché y recargar la app?\n\n${TEXTO_AYUDA_LIMPIEZA}`)) return;
    setLimpiando(true);
    try {
      const res = await limpiarCacheTemporal();
      alert(
        `Listo.\n\n` +
          `• ${res.claves} dato(s) temporal(es) (~${formatoBytesAprox(res.bytes)})\n` +
          (res.cachesBorrados ? `• ${res.cachesBorrados} caché(s) del navegador\n` : '') +
          `\nLa app se va a recargar ahora.`,
      );
      window.location.reload();
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
      title="Borra caché y recarga para usar la versión nueva"
    >
      <BtnLabel icon="refresh">{limpiando ? 'Limpiando…' : 'Limpiar caché'}</BtnLabel>
    </button>
  );
}
