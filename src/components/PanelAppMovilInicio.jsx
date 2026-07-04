import React, { useEffect, useState } from 'react';
import Icon, { BtnLabel } from './Icon.jsx';
import { esPwaInstalada } from '../lib/notificacionesDispositivo.js';
import {
  EVENTO_PWA_INSTALABLE,
  copiarUrlAppMovil,
  intentarInstalarPwa,
  mensajeInstalacionPwa,
  registrarCapturaInstalacionPwa,
  urlAppMovil,
  instalacionPwaDisponible,
} from '../lib/appMovil.js';

export default function PanelAppMovilInicio() {
  const [instalable, setInstalable] = useState(() => instalacionPwaDisponible());
  const [instalada, setInstalada] = useState(() => esPwaInstalada());

  useEffect(() => {
    const cleanup = registrarCapturaInstalacionPwa();
    const onInstalable = () => setInstalable(true);
    const onDisplay = () => setInstalada(esPwaInstalada());
    window.addEventListener(EVENTO_PWA_INSTALABLE, onInstalable);
    window.matchMedia('(display-mode: standalone)').addEventListener('change', onDisplay);
    return () => {
      cleanup();
      window.removeEventListener(EVENTO_PWA_INSTALABLE, onInstalable);
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', onDisplay);
    };
  }, []);

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

  const copiar = async () => {
    const r = await copiarUrlAppMovil();
    if (r.ok) alert('Enlace copiado. Ábralo en el celular para instalar la app.');
    else alert(mensajeInstalacionPwa());
  };

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        borderLeft: '5px solid var(--brand-gold)',
        background: 'linear-gradient(135deg, rgba(225,153,41,0.08) 0%, #fff 65%)',
      }}
    >
      <div style={{ flex: '1 1 240px' }}>
        <h3 style={{ margin: 0, color: 'var(--brand-blue-dark)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Icon name="smartphone" size={18} />
          App móvil POS
        </h3>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.88rem' }}>
          Instale el punto de venta en celular o tablet para cobrar, consultar inventario y recibir alertas.
        </p>
        <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', wordBreak: 'break-all' }}>
          {urlAppMovil()}
        </p>
        {instalada && (
          <span className="badge" style={{ marginTop: '0.5rem', display: 'inline-block', background: 'rgba(46,125,50,0.12)', color: 'var(--brand-green)' }}>
            App instalada en este dispositivo
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', flexShrink: 0 }}>
        <button type="button" className="btn btn-primary" onClick={instalar}>
          <BtnLabel icon="download">{instalable ? 'Instalar app' : 'Cómo instalar'}</BtnLabel>
        </button>
        <button type="button" className="btn btn-gold" onClick={copiar}>
          <BtnLabel icon="link">Copiar enlace</BtnLabel>
        </button>
      </div>
    </div>
  );
}
