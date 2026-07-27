import { useEffect, useState } from 'react';

const QUERY = '(max-width: 768px)';

/** Detecta celular/tablet aunque el navegador pida “sitio de escritorio”. */
export function esLayoutMovil() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia(QUERY).matches) return true;
  const ladoCorto = Math.min(window.screen?.width || 0, window.screen?.height || 0);
  const tactil =
    (navigator.maxTouchPoints || 0) > 0 || window.matchMedia('(pointer: coarse)').matches;
  // Teléfonos típicos ≤ 520 CSS px en el lado corto; evita layout PC (sidebar 250px) en el POS móvil.
  return Boolean(tactil && ladoCorto > 0 && ladoCorto <= 520);
}

export function useMobileLayout() {
  const [mobile, setMobile] = useState(() => esLayoutMovil());

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const sync = () => setMobile(esLayoutMovil());
    sync();
    mq.addEventListener('change', sync);
    window.addEventListener('orientationchange', sync);
    window.addEventListener('resize', sync);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('orientationchange', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  return mobile;
}
