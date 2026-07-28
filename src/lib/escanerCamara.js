import { detectarMobile } from './notificacionesDispositivo.js';

/** true si se puede escanear: cámara nativa (móvil) o stream getUserMedia. */
export function camaraEscaneoDisponible() {
  if (typeof navigator === 'undefined') return false;
  if (detectarMobile()) return true;
  return Boolean(navigator.mediaDevices?.getUserMedia);
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

const FORMATOS_BARCODE_DETECTOR = [
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

/**
 * Decodifica un código de barras desde una foto (cámara nativa del iPhone / galería).
 * No abre el stream en vivo del POS.
 */
export async function decodificarCodigoDesdeArchivo(file) {
  if (!file) return { ok: false, error: 'Sin imagen.' };

  // Safari/Chrome modernos: API nativa, más rápida en iPhone.
  if (typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function') {
    try {
      const detector = new window.BarcodeDetector({ formats: FORMATOS_BARCODE_DETECTOR });
      const bitmap = await createImageBitmap(file);
      const codes = await detector.detect(bitmap);
      bitmap.close?.();
      const texto = String(codes?.[0]?.rawValue || '').trim();
      if (texto) return { ok: true, codigo: texto, motor: 'BarcodeDetector' };
    } catch {
      /* caer a html5-qrcode */
    }
  }

  try {
    const { Html5Qrcode } = await import('html5-qrcode');
    const hostId = `escaner-file-${Date.now()}`;
    const host = document.createElement('div');
    host.id = hostId;
    host.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(host);
    try {
      const scanner = new Html5Qrcode(hostId, { verbose: false });
      const texto = String((await scanner.scanFile(file, false)) || '').trim();
      try {
        scanner.clear();
      } catch {
        /* ignore */
      }
      if (texto) return { ok: true, codigo: texto, motor: 'html5-qrcode' };
      return { ok: false, error: 'No se leyó ningún código en la foto. Enfoca de cerca y vuelve a intentar.' };
    } finally {
      host.remove();
    }
  } catch (e) {
    return {
      ok: false,
      error: String(e?.message || e || 'No se pudo leer el código de la foto.'),
    };
  }
}
