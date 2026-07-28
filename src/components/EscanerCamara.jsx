import React, { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { camaraEscaneoDisponible, FORMATOS_BARRAS } from '../lib/escanerCamara.js';
import { prepararAudioPos, sonidoEscaneoProducto } from '../lib/sonidosPos.js';
import './EscanerCamara.css';

/**
 * Modal de escaneo a pantalla completa (cámara trasera).
 * En iPhone/Safari el video llena la pantalla; no graba, solo lee el código.
 */
export default function EscanerCamara({ abierto, onCerrar, onCodigo, titulo = 'Escanear código' }) {
  const reactId = useId().replace(/:/g, '');
  const containerId = `escaner-cam-${reactId}`;
  const scannerRef = useRef(null);
  const leidoRef = useRef(false);
  const [error, setError] = useState('');
  const [iniciando, setIniciando] = useState(false);

  useEffect(() => {
    if (!abierto) return undefined;

    leidoRef.current = false;
    setError('');
    setIniciando(true);

    let activo = true;
    // Evita que iOS haga scroll/zoom detrás del modal
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (!activo) return;

        const mapa = {
          ean_13: Html5QrcodeSupportedFormats.EAN_13,
          ean_8: Html5QrcodeSupportedFormats.EAN_8,
          upc_a: Html5QrcodeSupportedFormats.UPC_A,
          upc_e: Html5QrcodeSupportedFormats.UPC_E,
          code_128: Html5QrcodeSupportedFormats.CODE_128,
          code_39: Html5QrcodeSupportedFormats.CODE_39,
          codabar: Html5QrcodeSupportedFormats.CODABAR,
          itf: Html5QrcodeSupportedFormats.ITF,
        };
        const formatsToSupport = FORMATOS_BARRAS.map((f) => mapa[f]).filter(Boolean);

        const scanner = new Html5Qrcode(containerId, {
          verbose: false,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
        scannerRef.current = scanner;

        const vw = Math.max(window.innerWidth || 360, 320);
        const vh = Math.max(window.innerHeight || 640, 480);

        await scanner.start(
          { facingMode: { ideal: 'environment' } },
          {
            fps: 15,
            qrbox: (viewW, viewH) => {
              const w = Math.floor(Math.min(viewW, vw) * 0.92);
              const h = Math.floor(Math.min(Math.max(viewH * 0.28, 140), 240));
              return { width: Math.max(220, w), height: Math.max(120, h) };
            },
            formatsToSupport,
            aspectRatio: vw / Math.max(vh * 0.72, 1),
            disableFlip: false,
          },
          (decoded) => {
            if (leidoRef.current) return;
            leidoRef.current = true;
            const texto = String(decoded || '').trim();
            if (!texto) return;
            sonidoEscaneoProducto();
            onCodigo?.(texto);
            scanner
              .stop()
              .catch(() => {})
              .finally(() => onCerrar?.());
          },
          () => {},
        );

        // Forzar video a pantalla completa (html5-qrcode pone tamaños fijos pequeños)
        requestAnimationFrame(() => {
          const root = document.getElementById(containerId);
          if (!root) return;
          root.querySelectorAll('video, canvas').forEach((el) => {
            el.style.width = '100%';
            el.style.height = '100%';
            el.style.objectFit = 'cover';
            el.style.maxWidth = '100%';
            el.removeAttribute('width');
            el.removeAttribute('height');
          });
          const video = root.querySelector('video');
          if (video) {
            video.setAttribute('playsinline', 'true');
            video.setAttribute('webkit-playsinline', 'true');
            video.muted = true;
          }
        });
      } catch (e) {
        if (activo) {
          const msg = String(e?.message || e || '');
          setError(
            /NotAllowed|Permission|denied/i.test(msg)
              ? 'Permiso de cámara denegado. En iPhone: Ajustes → Safari → Cámara → Permitir, y recarga con HTTPS.'
              : msg || 'No se pudo abrir la cámara.',
          );
        }
      } finally {
        if (activo) setIniciando(false);
      }
    })();

    return () => {
      activo = false;
      document.body.style.overflow = prevOverflow;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner?.isScanning) {
        scanner.stop().catch(() => {});
      }
      try {
        scanner?.clear();
      } catch {
        /* ignore */
      }
    };
  }, [abierto, onCodigo, onCerrar, containerId]);

  if (!abierto) return null;

  return (
    <div className="escaner-overlay" role="dialog" aria-modal="true">
      <div className="escaner-top">
        <div>
          <h3 className="escaner-titulo">{titulo}</h3>
          <p className="escaner-hint">Vista previa en vivo · no graba video · al leer el código se cierra solo</p>
        </div>
        <button type="button" className="btn btn-ghost escaner-cerrar" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      {error ? <div className="escaner-error">{error}</div> : null}
      {iniciando && !error ? <p className="escaner-loading">Abriendo cámara a pantalla completa…</p> : null}

      <div className="escaner-stage">
        <div id={containerId} className="escaner-video-host" />
        <div className="escaner-frame" aria-hidden />
      </div>
    </div>
  );
}

export function BotonEscanerCamara({ onCodigo, titulo, label = 'Escanear', className = 'btn btn-camera', style }) {
  const [abierto, setAbierto] = useState(false);
  if (!camaraEscaneoDisponible()) return null;

  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        onClick={() => {
          prepararAudioPos();
          setAbierto(true);
        }}
        title="Escanear con cámara (pantalla completa)"
      >
        <Icon name="camera" size={18} />
        <span>{label}</span>
      </button>
      <EscanerCamara
        abierto={abierto}
        titulo={titulo}
        onCerrar={() => setAbierto(false)}
        onCodigo={(codigo) => {
          setAbierto(false);
          onCodigo?.(codigo);
        }}
      />
    </>
  );
}
