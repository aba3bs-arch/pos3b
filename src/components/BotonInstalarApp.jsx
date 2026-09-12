import React, { useEffect, useState } from 'react';
import Icon, { BtnLabel } from './Icon.jsx';
import { detectarMobile, esPwaInstalada } from '../lib/notificacionesDispositivo.js';
import {
  EVENTO_PWA_INSTALABLE,
  instalacionPwaDisponible,
  intentarInstalarPwa,
  mensajeInstalacionPwa,
} from '../lib/appMovil.js';

/**
 * Botón / tarjeta para instalar la PWA en el celular.
 * Pensado para cubre turno (CT): que deje la app en la pantalla de inicio.
 * La captura de beforeinstallprompt ya la hace App.jsx (no re-registrar aquí).
 *
 * @param {'banner'|'compact'} [variant]
 */
export default function BotonInstalarApp({
  variant = 'banner',
  titulo = 'Instalar app en tu celular',
  texto = 'Así abres más rápido tus solicitudes CT, sin buscar el enlace en el navegador.',
  className = '',
  style = {},
}) {
  const [instalable, setInstalable] = useState(() => instalacionPwaDisponible());
  const [instalada, setInstalada] = useState(() => esPwaInstalada());
  const esMovil = detectarMobile();

  useEffect(() => {
    const onInstalable = () => setInstalable(true);
    const onDisplay = () => setInstalada(esPwaInstalada());
    window.addEventListener(EVENTO_PWA_INSTALABLE, onInstalable);
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener?.('change', onDisplay);
    setInstalable(instalacionPwaDisponible());
    setInstalada(esPwaInstalada());
    return () => {
      window.removeEventListener(EVENTO_PWA_INSTALABLE, onInstalable);
      mq.removeEventListener?.('change', onDisplay);
    };
  }, []);

  if (instalada) {
    if (variant === 'compact') return null;
    return (
      <div
        className={`card ${className}`.trim()}
        style={{
          borderLeft: '4px solid #2e7d32',
          background: 'rgba(46,125,50,0.06)',
          padding: '0.75rem 1rem',
          ...style,
        }}
      >
        <strong style={{ color: '#1b5e20', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="smartphone" size={16} /> App instalada en este celular
        </strong>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
          Ábrela desde el icono en tu pantalla de inicio e ingresa con tu PIN móvil.
        </p>
      </div>
    );
  }

  const instalar = async () => {
    if (instalable) {
      const r = await intentarInstalarPwa();
      if (r.ok) {
        setInstalable(false);
        setInstalada(true);
        return;
      }
    }
    alert(mensajeInstalacionPwa());
  };

  if (variant === 'compact') {
    if (!esMovil && !instalable) return null;
    return (
      <button
        type="button"
        className={`btn btn-primary ${className}`.trim()}
        onClick={() => void instalar()}
        style={style}
      >
        <BtnLabel icon="download">{instalable ? 'Instalar app' : 'Cómo instalar la app'}</BtnLabel>
      </button>
    );
  }

  return (
    <div
      className={`card ${className}`.trim()}
      style={{
        borderLeft: '5px solid var(--brand-gold)',
        background: 'linear-gradient(135deg, rgba(225,153,41,0.12) 0%, #fff 70%)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        ...style,
      }}
    >
      <div style={{ flex: '1 1 200px' }}>
        <h4
          style={{
            margin: 0,
            color: 'var(--brand-blue-dark)',
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Icon name="smartphone" size={18} />
          {titulo}
        </h4>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.84rem' }}>
          {texto}
        </p>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => void instalar()} style={{ flexShrink: 0 }}>
        <BtnLabel icon="download">{instalable ? 'Instalar app' : 'Cómo instalar'}</BtnLabel>
      </button>
    </div>
  );
}
