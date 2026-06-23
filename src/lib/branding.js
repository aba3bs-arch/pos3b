/** Logo por defecto (Abarrotes Las 3B) servido desde /public */
export const LOGO_DEFAULT = '/logo-3b.png';

const LS_NEGOCIO = 'pos3b_negocio';
const LS_TICKET = 'pos3b_ticket_footer';
const LS_LOGO = 'pos3b_logo_url';

export const EVENTO_BRANDING = 'pos3b-branding-updated';

export function leerNombreNegocio() {
  try {
    return localStorage.getItem(LS_NEGOCIO) || 'ABARROTES LAS 3B';
  } catch {
    return 'ABARROTES LAS 3B';
  }
}

export function guardarNombreNegocio(nombre) {
  localStorage.setItem(LS_NEGOCIO, String(nombre || '').trim() || 'ABARROTES LAS 3B');
  notificarCambio();
}

export function leerPieTicket() {
  try {
    return localStorage.getItem(LS_TICKET) || 'Gracias por su compra';
  } catch {
    return 'Gracias por su compra';
  }
}

export function guardarPieTicket(texto) {
  localStorage.setItem(LS_TICKET, String(texto || '').trim() || 'Gracias por su compra');
  notificarCambio();
}

/** URL del logo: personalizado en localStorage o el logo 3B por defecto */
export function leerLogoUrl() {
  try {
    const custom = localStorage.getItem(LS_LOGO);
    if (custom && custom.trim()) return custom.trim();
  } catch {
    /* ignore */
  }
  return LOGO_DEFAULT;
}

export function guardarLogoUrl(url) {
  const v = String(url || '').trim();
  if (v) localStorage.setItem(LS_LOGO, v);
  else localStorage.removeItem(LS_LOGO);
  notificarCambio();
}

export function restaurarLogoPorDefecto() {
  localStorage.removeItem(LS_LOGO);
  notificarCambio();
}

export function logoEsPersonalizado() {
  try {
    return Boolean(localStorage.getItem(LS_LOGO)?.trim());
  } catch {
    return false;
  }
}

export function notificarCambio() {
  window.dispatchEvent(new CustomEvent(EVENTO_BRANDING));
}

/** Convierte archivo de imagen a data URL para guardar en localStorage */
export function leerArchivoComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No se eligió archivo'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      reject(new Error('El archivo debe ser una imagen (PNG, JPG, WebP…).'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error('La imagen no debe superar 2 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}
