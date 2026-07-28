import React, { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { camaraEscaneoDisponible, FORMATOS_BARRAS } from '../lib/escanerCamara.js';
import { prepararAudioPos, sonidoEscaneoProducto } from '../lib/sonidosPos.js';
import './EscanerCamara.css';

/** Intenta enfoque continuo / mejor resolución tras abrir el stream. */
async function mejorarEnfoqueCamara(rootEl) {
  const video = rootEl?.querySelector?.('video');
  const stream = video?.srcObject;
  const track = stream?.getVideoTracks?.()?.[0];
  if (!track?.applyConstraints) return;

  const intents = [
    {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      advanced: [{ focusMode: 'continuous' }, { focusDistance: 0 }],
    },
    { advanced: [{ focusMode: 'continuous' }] },
    { advanced: [{ focusMode: 'auto' }] },
  ];
  for (const c of intents) {
    try {
      await track.applyConstraints(c);
      return;
    } catch {
      /* siguiente intento */
    }
  }
}

/**
 * Escáner en vivo a pantalla completa.
 * Lee en toda el área (no solo un recuadro central) para códigos en cualquier posición/ángulo.
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

        // Sin qrbox = lee TODA la imagen (cualquier zona / ángulo en pantalla).
        const configCam = {
          fps: 20,
          formatsToSupport,
          disableFlip: false,
          rememberLastUsedCamera: true,
        };

        const onScan = (decoded) => {
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
        };

        // Constraints: cámara trasera + buena resolución (sin { ideal } en facingMode).
        const constraintsList = [
          {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          { facingMode: 'environment' },
          { facingMode: 'user' },
        ];

        let arrancada = false;
        let ultimoError = null;
        for (const constraints of constraintsList) {
          try {
            await scanner.start(constraints, configCam, onScan, () => {});
            arrancada = true;
            break;
          } catch (err) {
            ultimoError = err;
            try {
              if (scanner.isScanning) await scanner.stop();
            } catch {
              /* ignore */
            }
          }
        }
        if (!arrancada) throw ultimoError || new Error('No se pudo abrir la cámara.');

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
          // Quitar sombreado del lib si aparece
          root.querySelectorAll('#qr-shaded-region').forEach((el) => {
            el.style.border = 'none';
            el.style.boxShadow = 'none';
            el.style.outline = 'none';
          });
          void mejorarEnfoqueCamara(root);
        });
      } catch (e) {
        if (activo) {
          const msg = String(e?.message || e || '');
          setError(
            /NotAllowed|Permission|denied/i.test(msg)
              ? 'Permiso de cámara denegado. En iPhone: Ajustes → Safari → Cámara → Permitir (HTTPS).'
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
          <p className="escaner-hint">
            Muestra el código en cualquier parte de la pantalla · no hace falta centrarlo · no toma fotos
          </p>
        </div>
        <button type="button" className="btn btn-ghost escaner-cerrar" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      {error ? <div className="escaner-error">{error}</div> : null}
      {iniciando && !error ? <p className="escaner-loading">Abriendo cámara…</p> : null}

      <div className="escaner-stage">
        <div id={containerId} className="escaner-video-host" />
        <div className="escaner-guia" aria-hidden>
          <span className="escaner-corner tl" />
          <span className="escaner-corner tr" />
          <span className="escaner-corner bl" />
          <span className="escaner-corner br" />
        </div>
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
        title="Escanear con cámara (en vivo)"
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
