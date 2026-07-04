import React, { useEffect, useState } from 'react';
import Icon, { BtnLabel } from './Icon.jsx';
import { etiquetaTienda } from '../constants/sucursales.js';
import { esPwaInstalada } from '../lib/notificacionesDispositivo.js';
import {
  EVENTO_PWA_INSTALABLE,
  copiarUrlAppMovil,
  detectarEscritorio,
  intentarInstalarPwa,
  mensajeInstalacionPwa,
  registrarCapturaInstalacionPwa,
  urlAppMovil,
  instalacionPwaDisponible,
} from '../lib/appMovil.js';

export default function PanelAppMovilInicio({ sucursal }) {
  const esPc = detectarEscritorio();
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
    if (r.ok) {
      alert(
        esPc
          ? 'Enlace copiado. Ábralo en Chrome o Edge de la PC de la sucursal e instale la app.'
          : 'Enlace copiado. Ábralo en el celular para instalar la app.',
      );
    } else alert(mensajeInstalacionPwa());
  };

  const nombreTienda = sucursal ? etiquetaTienda(sucursal) : 'esta tienda';

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
          <Icon name={esPc ? 'register' : 'smartphone'} size={18} />
          {esPc ? 'Instalar POS en esta computadora' : 'App móvil POS'}
        </h3>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.88rem' }}>
          {esPc
            ? `Descargue el POS como aplicación de escritorio en ${nombreTienda}. Se enlaza a la misma nube (Supabase) que la versión web.`
            : 'Instale el punto de venta en celular o tablet para cobrar, consultar inventario y recibir alertas.'}
        </p>
        <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', wordBreak: 'break-all' }}>
          {urlAppMovil()}
        </p>
        {esPc && !instalada && (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.78rem' }}>
            Tras instalar, fije la sucursal en <strong>Configuración → Tienda</strong> para que esta PC quede ligada a {nombreTienda}.
          </p>
        )}
        {instalada && (
          <span className="badge" style={{ marginTop: '0.5rem', display: 'inline-block', background: 'rgba(46,125,50,0.12)', color: 'var(--brand-green)' }}>
            App instalada en este equipo
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
