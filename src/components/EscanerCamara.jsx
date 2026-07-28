import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { camaraEscaneoDisponible, FORMATOS_BARRAS } from '../lib/escanerCamara.js';
import { prepararAudioPos, sonidoEscaneoProducto } from '../lib/sonidosPos.js';
import './EscanerCamara.css';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function esErrorTransicion(err) {
  return /under transition|Cannot transition|transition/i.test(String(err?.message || err || ''));
}

/** stop + pausa para salir del estado “under transition” de html5-qrcode. */
async function detenerSeguro(scanner) {
  if (!scanner) return;
  for (let i = 0; i < 5; i += 1) {
    try {
      if (scanner.isScanning) await scanner.stop();
      return;
    } catch (err) {
      if (!esErrorTransicion(err) && i >= 2) return;
      await sleep(100 + i * 100);
    }
  }
}

async function limpiarSeguro(scanner) {
  if (!scanner) return;
  await detenerSeguro(scanner);
  try {
    scanner.clear();
  } catch {
    /* ignore */
  }
}

async function mejorarEnfoqueCamara(rootEl) {
  const video = rootEl?.querySelector?.('video');
  const track = video?.srcObject?.getVideoTracks?.()?.[0];
  if (!track?.applyConstraints) return;
  for (const c of [
    { width: { ideal: 1280 }, height: { ideal: 720 }, advanced: [{ focusMode: 'continuous' }] },
    { advanced: [{ focusMode: 'continuous' }] },
    { advanced: [{ focusMode: 'auto' }] },
  ]) {
    try {
      await track.applyConstraints(c);
      return;
    } catch {
      /* ignore */
    }
  }
}

function estilizarVideo(containerId) {
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
  root.querySelectorAll('#qr-shaded-region').forEach((el) => {
    el.style.border = 'none';
    el.style.boxShadow = 'none';
    el.style.outline = 'none';
  });
  void mejorarEnfoqueCamara(root);
}

/**
 * Escáner en vivo. Evita “Cannot transition… already under transition”
 * (start/stop solapados en html5-qrcode, típico en laptop / Strict Mode).
 */
export default function EscanerCamara({ abierto, onCerrar, onCodigo, titulo = 'Escanear código' }) {
  const reactId = useId().replace(/:/g, '');
  const containerId = `escaner-cam-${reactId}`;
  const scannerRef = useRef(null);
  const leidoRef = useRef(false);
  const cerrandoRef = useRef(false);
  const onCodigoRef = useRef(onCodigo);
  const onCerrarRef = useRef(onCerrar);
  const camaraElegidaRef = useRef('');
  const [error, setError] = useState('');
  const [iniciando, setIniciando] = useState(false);
  const [camaras, setCamaras] = useState([]);
  const [camaraUi, setCamaraUi] = useState('');
  const [sesion, setSesion] = useState(0);

  useEffect(() => {
    onCodigoRef.current = onCodigo;
    onCerrarRef.current = onCerrar;
  }, [onCodigo, onCerrar]);

  useEffect(() => {
    if (!abierto) return undefined;

    leidoRef.current = false;
    cerrandoRef.current = false;
    setError('');
    setIniciando(true);

    let cancelado = false;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    (async () => {
      let scanner = null;
      try {
        // Evita pelear con un stop() anterior aún en transición.
        await sleep(80);
        if (cancelado) return;

        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (cancelado) return;

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

        let devices = [];
        try {
          devices = (await Html5Qrcode.getCameras()) || [];
        } catch {
          devices = [];
        }
        if (cancelado) return;
        setCamaras(devices);

        const preferida =
          devices.find((d) => d.id === camaraElegidaRef.current) ||
          devices.find((d) => /back|rear|environment|trasera|usb|logitech|hd webcam/i.test(d.label || '')) ||
          devices[0] ||
          null;

        const configCam = {
          fps: 14,
          formatsToSupport,
          disableFlip: false,
        };

        const onScan = async (decoded) => {
          if (leidoRef.current || cerrandoRef.current || cancelado) return;
          const texto = String(decoded || '').trim();
          if (!texto) return;
          leidoRef.current = true;
          cerrandoRef.current = true;
          sonidoEscaneoProducto();
          onCodigoRef.current?.(texto);
          await detenerSeguro(scannerRef.current);
          if (!cancelado) onCerrarRef.current?.();
        };

        scanner = new Html5Qrcode(containerId, {
          verbose: false,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
        scannerRef.current = scanner;

        const intentos = [];
        if (preferida?.id) intentos.push(preferida.id);
        for (const d of devices) {
          if (d.id && !intentos.includes(d.id)) intentos.push(d.id);
        }
        intentos.push({ facingMode: 'environment' }, { facingMode: 'user' });

        let arrancada = false;
        let ultimoError = null;
        for (const fuente of intentos) {
          if (cancelado) return;
          try {
            await scanner.start(fuente, configCam, onScan, () => {});
            arrancada = true;
            if (typeof fuente === 'string') {
              camaraElegidaRef.current = fuente;
              setCamaraUi(fuente);
            }
            break;
          } catch (err) {
            ultimoError = err;
            await detenerSeguro(scanner);
            await sleep(180);
          }
        }

        if (!arrancada) throw ultimoError || new Error('No se pudo abrir la cámara.');
        if (cancelado) {
          await limpiarSeguro(scanner);
          return;
        }
        requestAnimationFrame(() => estilizarVideo(containerId));
      } catch (e) {
        if (!cancelado) {
          const msg = String(e?.message || e || '');
          setError(
            /NotAllowed|Permission|denied/i.test(msg)
              ? 'Permiso de cámara denegado. Permite la cámara en el navegador y recarga (HTTPS).'
              : esErrorTransicion(e)
                ? 'La cámara estaba ocupada. Pulsa Reintentar.'
                : msg || 'No se pudo abrir la cámara.',
          );
        }
      } finally {
        if (!cancelado) setIniciando(false);
      }
    })();

    return () => {
      cancelado = true;
      document.body.style.overflow = prevOverflow;
      const s = scannerRef.current;
      scannerRef.current = null;
      void limpiarSeguro(s);
    };
  }, [abierto, sesion, containerId]);

  const cambiarCamara = useCallback(async (nextId) => {
    if (!nextId || nextId === camaraElegidaRef.current) return;
    camaraElegidaRef.current = nextId;
    setCamaraUi(nextId);
    setError('');
    setIniciando(true);
    await limpiarSeguro(scannerRef.current);
    scannerRef.current = null;
    await sleep(200);
    setSesion((n) => n + 1);
  }, []);

  const reintentar = useCallback(async () => {
    setError('');
    setIniciando(true);
    await limpiarSeguro(scannerRef.current);
    scannerRef.current = null;
    await sleep(200);
    setSesion((n) => n + 1);
  }, []);

  const cerrar = useCallback(async () => {
    cerrandoRef.current = true;
    await limpiarSeguro(scannerRef.current);
    scannerRef.current = null;
    onCerrarRef.current?.();
  }, []);

  if (!abierto) return null;

  return (
    <div className="escaner-overlay" role="dialog" aria-modal="true">
      <div className="escaner-top">
        <div>
          <h3 className="escaner-titulo">{titulo}</h3>
          <p className="escaner-hint">
            Escaneo en vivo · cualquier zona de la pantalla · acerca/aleja si no enfoca
          </p>
        </div>
        <button type="button" className="btn btn-ghost escaner-cerrar" onClick={() => void cerrar()}>
          Cerrar
        </button>
      </div>

      {camaras.length > 1 && (
        <div className="escaner-cam-select">
          <label>
            Cámara
            <select value={camaraUi} onChange={(e) => void cambiarCamara(e.target.value)} disabled={iniciando}>
              {camaras.map((c, i) => (
                <option key={c.id} value={c.id}>
                  {c.label || `Cámara ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {error ? (
        <div className="escaner-error">
          <span>{error}</span>
          <button type="button" className="btn btn-ghost escaner-reintentar" onClick={() => void reintentar()}>
            Reintentar
          </button>
        </div>
      ) : null}
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
