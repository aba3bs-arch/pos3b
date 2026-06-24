import React, { useEffect, useId, useRef, useState } from 'react';
import { camaraEscaneoDisponible, FORMATOS_BARRAS } from '../lib/escanerCamara.js';

/**
 * Modal de escaneo con cámara trasera (móvil / tablet).
 * onCodigo(texto) se dispara una vez por apertura al leer un código.
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

        const scanner = new Html5Qrcode(containerId, { verbose: false });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 12,
            qrbox: (w, h) => {
              const ancho = Math.min(w * 0.92, 320);
              const alto = Math.min(h * 0.35, 160);
              return { width: ancho, height: alto };
            },
            formatsToSupport,
            aspectRatio: 1.777778,
          },
          (decoded) => {
            if (leidoRef.current) return;
            leidoRef.current = true;
            const texto = String(decoded || '').trim();
            if (!texto) return;
            onCodigo?.(texto);
            scanner
              .stop()
              .catch(() => {})
              .finally(() => onCerrar?.());
          },
          () => {},
        );
      } catch (e) {
        if (activo) {
          setError(
            e?.message?.includes('NotAllowed')
              ? 'Permiso de cámara denegado. Actívalo en ajustes del navegador.'
              : e?.message || 'No se pudo abrir la cámara.',
          );
        }
      } finally {
        if (activo) setIniciando(false);
      }
    })();

    return () => {
      activo = false;
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
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.92)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>{titulo}</h3>
        <button type="button" className="btn btn-ghost" onClick={onCerrar} style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}>
          Cerrar
        </button>
      </div>
      <p style={{ margin: '0 0 0.75rem', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>
        Apunta al código de barras dentro del recuadro. Funciona en celular y tablet (HTTPS).
      </p>
      {error ? (
        <div className="card" style={{ color: 'var(--brand-red)', marginBottom: '0.75rem' }}>
          {error}
        </div>
      ) : null}
      {iniciando && !error ? (
        <p style={{ color: '#fff', textAlign: 'center', margin: '0.5rem 0' }}>Iniciando cámara…</p>
      ) : null}
      <div
        id={containerId}
        style={{
          flex: 1,
          minHeight: 240,
          borderRadius: 12,
          overflow: 'hidden',
          background: '#000',
        }}
      />
    </div>
  );
}

export function BotonEscanerCamara({ onCodigo, titulo, label = 'Cámara', className = 'btn btn-gold', style }) {
  const [abierto, setAbierto] = useState(false);
  if (!camaraEscaneoDisponible()) return null;

  return (
    <>
      <button type="button" className={className} style={style} onClick={() => setAbierto(true)}>
        {label}
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
