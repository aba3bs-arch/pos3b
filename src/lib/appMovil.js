import { detectarIos, detectarMobile, esPwaInstalada } from './notificacionesDispositivo.js';

export const EVENTO_PWA_INSTALABLE = 'pos3b-pwa-installable';

let deferredPrompt = null;

export function urlAppMovil() {
  if (typeof window === 'undefined') return '/';
  return `${window.location.origin}/`;
}

export function registrarCapturaInstalacionPwa() {
  if (typeof window === 'undefined') return () => {};
  const handler = (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new CustomEvent(EVENTO_PWA_INSTALABLE));
  };
  window.addEventListener('beforeinstallprompt', handler);
  return () => {
    window.removeEventListener('beforeinstallprompt', handler);
    deferredPrompt = null;
  };
}

export function instalacionPwaDisponible() {
  return Boolean(deferredPrompt);
}

export async function intentarInstalarPwa() {
  if (!deferredPrompt) return { ok: false, razon: 'no_prompt' };
  try {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return { ok: choice?.outcome === 'accepted', outcome: choice?.outcome };
  } catch {
    deferredPrompt = null;
    return { ok: false, razon: 'error' };
  }
}

export async function copiarUrlAppMovil() {
  const url = urlAppMovil();
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return { ok: true, url };
    } catch {
      /* fallback */
    }
  }
  return { ok: false, url };
}

export function mensajeInstalacionPwa() {
  if (esPwaInstalada()) {
    return 'La app ya está instalada en este dispositivo.';
  }
  if (detectarIos()) {
    return (
      'En iPhone o iPad:\n\n' +
      '1. Abra esta página en Safari.\n' +
      '2. Pulse Compartir (cuadrado con flecha).\n' +
      '3. Elija «Añadir a pantalla de inicio».\n' +
      '4. Confirme con «Añadir».\n\n' +
      `Enlace: ${urlAppMovil()}`
    );
  }
  if (detectarMobile()) {
    return (
      'En Android (Chrome):\n\n' +
      '1. Abra el menú ⋮ del navegador.\n' +
      '2. Elija «Instalar aplicación» o «Añadir a pantalla de inicio».\n\n' +
      `Enlace: ${urlAppMovil()}`
    );
  }
  return (
    'Para usar el POS en celular o tablet:\n\n' +
    '1. Abra el enlace en Chrome (Android) o Safari (iPhone).\n' +
    '2. Instale la app en pantalla de inicio.\n\n' +
    `Enlace: ${urlAppMovil()}`
  );
}
