import React, { useEffect, useState } from 'react';
import {
  EVENTO_ALERTA_ASALTO_ORIGEN_AVISO,
  TECLAS_MIN_ASALTO,
  TEXTO_FRANJA_3_TECLAS,
} from '../lib/alertaAsalto.js';
import PortalFlotante from './PortalFlotante.jsx';

/**
 * Franja a media pantalla en la caja que activó la alarma (p. ej. 3 teclas por accidente).
 * Parpadea rojo ↔ amarillo (~2 pulgadas). Se quita al pulsar cualquier tecla
 * (después de soltar el acorde que la disparó).
 */
export default function FranjaAsaltoOrigenAviso() {
  const [visible, setVisible] = useState(false);
  const [texto, setTexto] = useState(TEXTO_FRANJA_3_TECLAS);

  useEffect(() => {
    const onAviso = (e) => {
      const d = e?.detail || {};
      const modo = d.modo || 'teclas';
      const n = Number(d.teclas) || TECLAS_MIN_ASALTO;
      if (modo === 'escape') {
        setTexto(`Presionastes Escape ×${n}`);
      } else {
        setTexto(n === 3 ? TEXTO_FRANJA_3_TECLAS : `Presionastes ${n} teclas`);
      }
      setVisible(true);
    };
    window.addEventListener(EVENTO_ALERTA_ASALTO_ORIGEN_AVISO, onAviso);
    return () => window.removeEventListener(EVENTO_ALERTA_ASALTO_ORIGEN_AVISO, onAviso);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;

    let armado = false;
    let tArmar = null;

    // Espera a que suelten las teclas del acorde (o 450 ms) antes de aceptar «cualquier tecla» para cerrar.
    const intentarArmar = () => {
      if (armado) return;
      armado = true;
      if (tArmar) {
        clearTimeout(tArmar);
        tArmar = null;
      }
    };

    tArmar = setTimeout(intentarArmar, 450);

    const onKeyUp = () => {
      // Cuando ya no hay teclas abajo, arma el cierre
      intentarArmar();
    };

    const onKeyDown = (e) => {
      if (!armado) return;
      e.preventDefault();
      e.stopPropagation();
      setVisible(false);
    };

    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      if (tArmar) clearTimeout(tArmar);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <PortalFlotante>
      <div
        className="franja-asalto-origen"
        role="alert"
        aria-live="assertive"
        aria-label={`${texto}. Pulsa cualquier tecla para quitar.`}
      >
        <div className="franja-asalto-origen__barra">
          <span className="franja-asalto-origen__texto">{texto}</span>
          <span className="franja-asalto-origen__hint">Pulsa cualquier tecla para quitar</span>
        </div>
      </div>
    </PortalFlotante>
  );
}
