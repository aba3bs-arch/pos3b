import React, { useEffect, useState } from 'react';
import {
  EVENTO_ALERTA_ASALTO_ORIGEN_AVISO,
  STORAGE_FRANJA_ORIGEN,
  TEXTO_FRANJA_HINT,
  TEXTO_FRANJA_ORIGEN,
} from '../lib/alertaAsalto.js';
import PortalFlotante from './PortalFlotante.jsx';

function leerFranjaPersistida() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_FRANJA_ORIGEN);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.at) return null;
    // Máx. 8 h (turno); si quedó olvidada, igual se quita con una tecla.
    if (Date.now() - Number(data.at) > 1000 * 60 * 60 * 8) {
      sessionStorage.removeItem(STORAGE_FRANJA_ORIGEN);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function guardarFranjaPersistida(texto) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      STORAGE_FRANJA_ORIGEN,
      JSON.stringify({ texto: texto || TEXTO_FRANJA_ORIGEN, at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

function limpiarFranjaPersistida() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_FRANJA_ORIGEN);
  } catch {
    /* ignore */
  }
}

/**
 * Franja a media pantalla en la caja que activó la alarma.
 * Texto discreto («Sistema en mantenimiento»). Parpadea rojo ↔ amarillo.
 * Permanece hasta una tecla NUEVA (ignora key-repeat y el acorde que la disparó).
 */
export default function FranjaAsaltoOrigenAviso() {
  const persistida = typeof window !== 'undefined' ? leerFranjaPersistida() : null;
  const [visible, setVisible] = useState(Boolean(persistida));
  const [texto, setTexto] = useState(persistida?.texto || TEXTO_FRANJA_ORIGEN);

  useEffect(() => {
    const onAviso = () => {
      // Siempre el mismo copy discreto (no mencionar teclas / asalto).
      setTexto(TEXTO_FRANJA_ORIGEN);
      guardarFranjaPersistida(TEXTO_FRANJA_ORIGEN);
      setVisible(true);
    };
    window.addEventListener(EVENTO_ALERTA_ASALTO_ORIGEN_AVISO, onAviso);
    return () => window.removeEventListener(EVENTO_ALERTA_ASALTO_ORIGEN_AVISO, onAviso);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;

    const pressed = new Set();
    let soltoAcorde = false;
    let armado = false;

    const onKeyDown = (e) => {
      if (e.repeat) return; // no cerrar por hold/repeat del acorde
      const code = e.code || e.key;
      if (code) pressed.add(code);

      // Solo tras haber soltado el acorde completo, la siguiente tecla nueva cierra.
      if (!armado) return;
      e.preventDefault();
      e.stopPropagation();
      limpiarFranjaPersistida();
      setVisible(false);
    };

    const onKeyUp = (e) => {
      const code = e.code || e.key;
      if (code) pressed.delete(code);
      if (pressed.size === 0) {
        soltoAcorde = true;
        armado = true;
      }
    };

    // Si al montar no hay teclas abajo (p. ej. restauró de sessionStorage), arma ya.
    // Si el acorde sigue abajo, espera keyup hasta vaciar.
    const tArmarSiVacio = setTimeout(() => {
      if (pressed.size === 0 && !soltoAcorde) {
        armado = true;
      }
    }, 80);

    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(tArmarSiVacio);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <PortalFlotante>
      <div
        className="franja-asalto-origen"
        role="status"
        aria-live="polite"
        aria-label={`${texto}. ${TEXTO_FRANJA_HINT}`}
      >
        <div className="franja-asalto-origen__barra">
          <span className="franja-asalto-origen__texto">{texto}</span>
          <span className="franja-asalto-origen__hint">{TEXTO_FRANJA_HINT}</span>
        </div>
      </div>
    </PortalFlotante>
  );
}
