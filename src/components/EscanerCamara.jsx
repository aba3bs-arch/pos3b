import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import {
  camaraEscaneoDisponible,
  FORMATOS_BARRAS,
  perfilEscaneoCamara,
  elegirMejorCamaraTrasera,
  listarCamaras,
  abrirStreamCamara,
  aplicarEnfoqueContinuo,
  torchSoportado,
  setTorch,
  vibrarEscaneoOk,
  crearBarcodeDetector,
} from '../lib/escanerCamara.js';
import { prepararAudioPos, sonidoEscaneoProducto } from '../lib/sonidosPos.js';
import './EscanerCamara.css';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function esErrorTransicion(err) {
  return /under transition|Cannot transition|transition/i.test(String(err?.message || err || ''));
}

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

function detenerTracks(stream) {
  try {
    stream?.getTracks?.().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
}

/**
 * Escáner optimizado para iPhone/Android (BarcodeDetector nativo) + fallback html5-qrcode.
 */
export default function EscanerCamara({ abierto, onCerrar, onCodigo, titulo = 'Escanear código' }) {
  const reactId = useId().replace(/:/g, '');
  const containerId = `escaner-cam-${reactId}`;
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const scannerRef = useRef(null);
  const loopRef = useRef(0);
  const leidoRef = useRef(false);
  const cerrandoRef = useRef(false);
  const onCodigoRef = useRef(onCodigo);
  const onCerrarRef = useRef(onCerrar);
  const camaraElegidaRef = useRef('');

  const [error, setError] = useState('');
  const [iniciando, setIniciando] = useState(false);
  const [motor, setMotor] = useState('');
  const [camaras, setCamaras] = useState([]);
  const [camaraUi, setCamaraUi] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchOk, setTorchOk] = useState(false);
  const [sesion, setSesion] = useState(0);

  useEffect(() => {
    onCodigoRef.current = onCodigo;
    onCerrarRef.current = onCerrar;
  }, [onCodigo, onCerrar]);

  const entregarCodigo = useCallback(async (textoRaw) => {
    if (leidoRef.current || cerrandoRef.current) return;
    const texto = String(textoRaw || '').trim();
    if (!texto) return;
    leidoRef.current = true;
    cerrandoRef.current = true;
    vibrarEscaneoOk();
    sonidoEscaneoProducto();
    onCodigoRef.current?.(texto);
    detenerTracks(streamRef.current);
    streamRef.current = null;
    await limpiarSeguro(scannerRef.current);
    scannerRef.current = null;
    onCerrarRef.current?.();
  }, []);

  useEffect(() => {
    if (!abierto) return undefined;

    const perfil = perfilEscaneoCamara();
    leidoRef.current = false;
    cerrandoRef.current = false;
    setError('');
    setIniciando(true);
    setTorchOn(false);
    setTorchOk(false);
    setMotor('');

    let cancelado = false;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const loopId = ++loopRef.current;

    const cleanupStreams = async () => {
      if (videoRef.current) {
        try {
          videoRef.current.srcObject = null;
        } catch {
          /* ignore */
        }
      }
      detenerTracks(streamRef.current);
      streamRef.current = null;
      trackRef.current = null;
      await limpiarSeguro(scannerRef.current);
      scannerRef.current = null;
    };

    (async () => {
      try {
        await sleep(60);
        if (cancelado || loopRef.current !== loopId) return;

        let devices = await listarCamaras();
        const preferidaPre = elegirMejorCamaraTrasera(devices, camaraElegidaRef.current);

        const stream = await abrirStreamCamara({
          deviceId: preferidaPre?.id || camaraElegidaRef.current || '',
        });
        if (cancelado || loopRef.current !== loopId) {
          detenerTracks(stream);
          return;
        }

        streamRef.current = stream;
        const track = stream.getVideoTracks?.()[0] || null;
        trackRef.current = track;
        await aplicarEnfoqueContinuo(track);
        const tieneTorch = await torchSoportado(track);
        if (!cancelado) setTorchOk(tieneTorch);

        devices = await listarCamaras();
        if (!cancelado) {
          setCamaras(devices);
          const settingsId = track?.getSettings?.()?.deviceId || '';
          if (settingsId) {
            camaraElegidaRef.current = settingsId;
            setCamaraUi(settingsId);
          }
        }

        const detector = perfil.preferirNativo ? await crearBarcodeDetector() : null;
        if (detector && videoRef.current) {
          setMotor(perfil.ios ? 'iPhone · nativo' : perfil.android ? 'Android · nativo' : 'Nativo');
          const video = videoRef.current;
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.muted = true;
          await video.play().catch(() => {});

          const tick = async () => {
            if (cancelado || loopRef.current !== loopId || leidoRef.current) return;
            try {
              if (video.readyState >= 2) {
                const codes = await detector.detect(video);
                const raw = codes?.[0]?.rawValue;
                if (raw) {
                  await entregarCodigo(raw);
                  return;
                }
              }
            } catch {
              /* frame fallido */
            }
            window.setTimeout(() => {
              if (!cancelado && loopRef.current === loopId) void tick();
            }, perfil.detectIntervalMs);
          };
          void tick();
          return;
        }

        setMotor(perfil.mobile ? 'Móvil · compat' : 'Escáner web');
        detenerTracks(stream);
        streamRef.current = null;

        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (cancelado || loopRef.current !== loopId) return;

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
        const devicesHtml = (await Html5Qrcode.getCameras().catch(() => [])) || [];
        if (devicesHtml.length) setCamaras(devicesHtml);
        const best = elegirMejorCamaraTrasera(devicesHtml, camaraElegidaRef.current);

        const scanner = new Html5Qrcode(containerId, {
          verbose: false,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
        scannerRef.current = scanner;

        const configCam = {
          fps: perfil.fps,
          formatsToSupport,
          disableFlip: false,
        };

        const onScan = (decoded) => {
          void entregarCodigo(decoded);
        };

        const intentos = [];
        if (best?.id) intentos.push(best.id);
        for (const d of devicesHtml) {
          if (d.id && !intentos.includes(d.id)) intentos.push(d.id);
        }
        intentos.push({ facingMode: 'environment' }, { facingMode: 'user' });

        let ok = false;
        let lastErr = null;
        for (const fuente of intentos) {
          if (cancelado) return;
          try {
            await scanner.start(fuente, configCam, onScan, () => {});
            ok = true;
            if (typeof fuente === 'string') {
              camaraElegidaRef.current = fuente;
              setCamaraUi(fuente);
            }
            break;
          } catch (err) {
            lastErr = err;
            await detenerSeguro(scanner);
            await sleep(160);
          }
        }
        if (!ok) throw lastErr || new Error('No se pudo abrir la cámara.');

        requestAnimationFrame(() => {
          const root = document.getElementById(containerId);
          if (!root) return;
          root.querySelectorAll('video, canvas').forEach((el) => {
            el.style.width = '100%';
            el.style.height = '100%';
            el.style.objectFit = 'cover';
            el.removeAttribute('width');
            el.removeAttribute('height');
          });
          const v = root.querySelector('video');
          if (v) {
            v.setAttribute('playsinline', 'true');
            v.setAttribute('webkit-playsinline', 'true');
            v.muted = true;
            const t = v.srcObject?.getVideoTracks?.()?.[0];
            trackRef.current = t || null;
            void aplicarEnfoqueContinuo(t);
            void torchSoportado(t).then((tOk) => {
              if (!cancelado) setTorchOk(tOk);
            });
          }
        });
      } catch (e) {
        if (!cancelado) {
          const perfilErr = perfilEscaneoCamara();
          const msg = String(e?.message || e || '');
          setError(
            /NotAllowed|Permission|denied/i.test(msg)
              ? perfilErr.ios
                ? 'Permiso de cámara denegado. Ajustes → Safari → Cámara → Permitir (HTTPS).'
                : 'Permiso de cámara denegado. Permite la cámara en el navegador (HTTPS).'
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
      void cleanupStreams();
    };
  }, [abierto, sesion, containerId, entregarCodigo]);

  const perfilUi = perfilEscaneoCamara();

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    const ok = await setTorch(track, next);
    if (ok) setTorchOn(next);
  }, [torchOn]);

  const cambiarCamara = useCallback(async (nextId) => {
    if (!nextId || nextId === camaraElegidaRef.current) return;
    camaraElegidaRef.current = nextId;
    setCamaraUi(nextId);
    setError('');
    setIniciando(true);
    detenerTracks(streamRef.current);
    streamRef.current = null;
    await limpiarSeguro(scannerRef.current);
    scannerRef.current = null;
    await sleep(200);
    setSesion((n) => n + 1);
  }, []);

  const reintentar = useCallback(async () => {
    setError('');
    setIniciando(true);
    detenerTracks(streamRef.current);
    streamRef.current = null;
    await limpiarSeguro(scannerRef.current);
    scannerRef.current = null;
    await sleep(200);
    setSesion((n) => n + 1);
  }, []);

  const cerrar = useCallback(async () => {
    cerrandoRef.current = true;
    detenerTracks(streamRef.current);
    streamRef.current = null;
    await limpiarSeguro(scannerRef.current);
    scannerRef.current = null;
    onCerrarRef.current?.();
  }, []);

  if (!abierto) return null;

  const usandoVideoNativo = motor.includes('nativo');

  return (
    <div className={`escaner-overlay${perfilUi.mobile ? ' escaner-overlay--mobile' : ''}`} role="dialog" aria-modal="true">
      <div className="escaner-top">
        <div>
          <h3 className="escaner-titulo">{titulo}</h3>
          <p className="escaner-hint">
            {perfilUi.mobile
              ? 'Apunta al código · lectura en vivo en toda la pantalla · no toma fotos'
              : 'Escaneo en vivo · acerca/aleja si no enfoca'}
            {motor ? ` · ${motor}` : ''}
          </p>
        </div>
        <div className="escaner-top-actions">
          {torchOk && (
            <button type="button" className={`btn btn-ghost escaner-torch${torchOn ? ' on' : ''}`} onClick={() => void toggleTorch()}>
              {torchOn ? 'Linterna on' : 'Linterna'}
            </button>
          )}
          <button type="button" className="btn btn-ghost escaner-cerrar" onClick={() => void cerrar()}>
            Cerrar
          </button>
        </div>
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
      {iniciando && !error ? <p className="escaner-loading">Abriendo mejor cámara…</p> : null}

      <div className="escaner-stage">
        {/* Video nativo (iPhone/Android con BarcodeDetector) */}
        <video
          ref={videoRef}
          className={`escaner-video-nativo${usandoVideoNativo ? ' visible' : ''}`}
          playsInline
          muted
          autoPlay
        />
        {/* Host html5-qrcode (fallback) */}
        <div id={containerId} className={`escaner-video-host${usandoVideoNativo ? ' hidden' : ''}`} />
        <div className="escaner-guia" aria-hidden>
          <span className="escaner-corner tl" />
          <span className="escaner-corner tr" />
          <span className="escaner-corner bl" />
          <span className="escaner-corner br" />
        </div>
        {perfilUi.mobile && !iniciando && !error && (
          <p className="escaner-mobile-tip">Mueve el código despacio · funciona en cualquier ángulo</p>
        )}
      </div>
    </div>
  );
}

export function BotonEscanerCamara({
  onCodigo,
  titulo,
  label = 'Escanear',
  /** Solo ícono (recomendado en móvil / barras compactas). */
  soloIcono = true,
  className = 'btn btn-camera',
  style,
}) {
  const [abierto, setAbierto] = useState(false);
  if (!camaraEscaneoDisponible()) return null;

  return (
    <>
      <button
        type="button"
        className={`${className}${soloIcono ? ' btn-camera--icon' : ''}`}
        style={style}
        onClick={() => {
          prepararAudioPos();
          setAbierto(true);
        }}
        title={label}
        aria-label={label}
      >
        <Icon name="camera" size={soloIcono ? 22 : 18} />
        {!soloIcono ? <span>{label}</span> : null}
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
