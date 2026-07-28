import { detectarIos, detectarMobile } from './notificacionesDispositivo.js';

/** true si el navegador puede pedir cámara. */
export function camaraEscaneoDisponible() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function detectarAndroid() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export const FORMATOS_BARRAS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'codabar',
  'itf',
];

/** Formatos nativos BarcodeDetector (Chrome Android / Safari iOS 17+). */
export const FORMATOS_BARCODE_DETECTOR = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'codabar',
  'itf',
  'qr_code',
];

export function barcodeDetectorDisponible() {
  return typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function';
}

/** Perfil de escaneo: móvil necesita más resolución/FPS y cámara trasera. */
export function perfilEscaneoCamara() {
  const mobile = detectarMobile();
  const ios = detectarIos();
  const android = detectarAndroid();
  return {
    mobile,
    ios,
    android,
    /** Preferir API nativa en iPhone/Android (mucho mejor con códigos 1D). */
    preferirNativo: mobile && barcodeDetectorDisponible(),
    fps: mobile ? 24 : 14,
    detectIntervalMs: mobile ? 40 : 70,
    videoConstraints: mobile
      ? {
          facingMode: { ideal: 'environment' },
          width: { ideal: ios ? 1920 : 1280 },
          height: { ideal: ios ? 1080 : 720 },
          frameRate: { ideal: 30, max: 30 },
        }
      : {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24 },
        },
  };
}

/** Elige la mejor cámara trasera (evita frontal / virtual). */
export function elegirMejorCamaraTrasera(devices = [], preferidaId = '') {
  const list = Array.isArray(devices) ? devices.filter((d) => d?.id) : [];
  if (!list.length) return null;
  if (preferidaId) {
    const hit = list.find((d) => d.id === preferidaId);
    if (hit) return hit;
  }

  const score = (d) => {
    const l = String(d.label || '').toLowerCase();
    let s = 0;
    if (/back|rear|environment|trasera|posterior|camera2 0|facing back/i.test(l)) s += 50;
    if (/ultra.?wide|0\.5|wide angle/i.test(l)) s += 8; // útil de cerca
    if (/tele|zoom|front|frontal|user|face|continuity/i.test(l)) s -= 40;
    if (/logitech|usb|webcam|hd/i.test(l)) s += 5;
    if (!l) s += 5; // iOS a veces oculta labels hasta permiso
    return s;
  };

  return [...list].sort((a, b) => score(b) - score(a))[0] || list[0];
}

export async function listarCamaras() {
  if (!navigator?.mediaDevices?.enumerateDevices) return [];
  try {
    // En iOS a veces hace falta un getUserMedia previo para ver labels.
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d) => ({ id: d.deviceId, label: d.label || '' }));
  } catch {
    return [];
  }
}

export async function abrirStreamCamara({ deviceId = '' } = {}) {
  const perfil = perfilEscaneoCamara();
  const attempts = [];

  if (deviceId) {
    attempts.push({
      audio: false,
      video: {
        deviceId: { exact: deviceId },
        width: perfil.videoConstraints.width,
        height: perfil.videoConstraints.height,
        frameRate: perfil.videoConstraints.frameRate,
      },
    });
  }

  if (perfil.mobile) {
    attempts.push({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: perfil.videoConstraints.width,
        height: perfil.videoConstraints.height,
        frameRate: perfil.videoConstraints.frameRate,
      },
    });
    attempts.push({ audio: false, video: { facingMode: 'environment' } });
    attempts.push({ audio: false, video: true });
  } else {
    attempts.push({ audio: false, video: { ...perfil.videoConstraints } });
    if (deviceId) {
      attempts.push({ audio: false, video: { deviceId: { ideal: deviceId } } });
    }
    attempts.push({ audio: false, video: true });
  }

  let lastErr = null;
  for (const c of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('No se pudo abrir la cámara.');
}

export async function aplicarEnfoqueContinuo(track) {
  if (!track?.applyConstraints) return false;
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
      return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export async function torchSoportado(track) {
  try {
    const caps = track?.getCapabilities?.() || {};
    return Boolean(caps.torch);
  } catch {
    return false;
  }
}

export async function setTorch(track, on) {
  if (!track?.applyConstraints) return false;
  try {
    await track.applyConstraints({ advanced: [{ torch: Boolean(on) }] });
    return true;
  } catch {
    try {
      await track.applyConstraints({ torch: Boolean(on) });
      return true;
    } catch {
      return false;
    }
  }
}

/** Feedback háptico en Android / algunos iPhone. */
export function vibrarEscaneoOk() {
  try {
    navigator.vibrate?.(40);
  } catch {
    /* ignore */
  }
}

export async function crearBarcodeDetector() {
  if (!barcodeDetectorDisponible()) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats?.();
    const formats = (supported || FORMATOS_BARCODE_DETECTOR).filter((f) =>
      FORMATOS_BARCODE_DETECTOR.includes(f),
    );
    return new window.BarcodeDetector({
      formats: formats.length ? formats : FORMATOS_BARCODE_DETECTOR,
    });
  } catch {
    try {
      return new window.BarcodeDetector({ formats: FORMATOS_BARCODE_DETECTOR });
    } catch {
      return null;
    }
  }
}
