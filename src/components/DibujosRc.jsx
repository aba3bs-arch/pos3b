/** Dibujos a color de la carátula RC. Trazo relleno, no fotos. */

function Svg({ size = 36, children, label }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : 'presentation'}
      aria-label={label || undefined}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {children}
    </svg>
  );
}

export function DibujoCamion({ size = 72 }) {
  return (
    <svg viewBox="0 0 88 64" width={size} height={size * 0.72} aria-hidden style={{ display: 'block' }}>
      <rect x="4" y="16" width="46" height="28" rx="4" fill="#f6c445" stroke="#1e3a8a" strokeWidth="2.4" />
      <text x="27" y="34" textAnchor="middle" fontSize="13" fontWeight="800" fill="#1e3a8a" fontFamily="sans-serif">ABB</text>
      <path d="M50 24h14l12 10v10H50z" fill="#eef3ff" stroke="#1e3a8a" strokeWidth="2.4" strokeLinejoin="round" />
      <rect x="66" y="28" width="7" height="6" rx="1" fill="#93c5fd" stroke="#1e3a8a" strokeWidth="1.4" />
      <circle cx="20" cy="48" r="7" fill="#0f172a" />
      <circle cx="20" cy="48" r="3" fill="#e2e8f0" />
      <circle cx="66" cy="48" r="7" fill="#0f172a" />
      <circle cx="66" cy="48" r="3" fill="#e2e8f0" />
      <rect x="8" y="20" width="10" height="4" rx="1" fill="#fde68a" />
    </svg>
  );
}

export function DibujoTarjeta({ size = 40 }) {
  return (
    <Svg size={size} label="Tarjeta">
      <path d="M18 40c0-8 6-12 14-12h16c4 0 8 3 8 8v6c0 8-8 14-20 14S18 50 18 40z" fill="#fde68a" stroke="#92400e" strokeWidth="2" />
      <rect x="6" y="14" width="40" height="26" rx="4" fill="#f8fafc" stroke="#1e3a8a" strokeWidth="2.4" transform="rotate(-12 26 27)" />
      <rect x="8" y="20" width="36" height="6" fill="#1d4ed8" transform="rotate(-12 26 23)" />
      <rect x="12" y="30" width="12" height="4" rx="1" fill="#fbbf24" transform="rotate(-12 18 32)" />
    </Svg>
  );
}

export function DibujoBilletes({ size = 40 }) {
  return (
    <Svg size={size} label="Billetes">
      <rect x="10" y="28" width="42" height="22" rx="3" fill="#86efac" stroke="#166534" strokeWidth="2" />
      <rect x="12" y="20" width="42" height="22" rx="3" fill="#4ade80" stroke="#166534" strokeWidth="2" />
      <rect x="14" y="12" width="42" height="22" rx="3" fill="#22c55e" stroke="#14532d" strokeWidth="2" />
      <circle cx="35" cy="23" r="6" fill="#fde68a" stroke="#166534" strokeWidth="1.6" />
      <text x="35" y="26" textAnchor="middle" fontSize="9" fontWeight="800" fill="#166534" fontFamily="sans-serif">$</text>
    </Svg>
  );
}

export function DibujoRefresco({ size = 40, tono = 'azul' }) {
  const aro = tono === 'claro' ? '#fff' : '#1d4ed8';
  const flecha = tono === 'claro' ? '#dbeafe' : '#1e3a8a';
  return (
    <Svg size={size} label="Actualizado">
      <circle cx="32" cy="32" r="16" fill={tono === 'claro' ? 'rgba(255,255,255,0.18)' : '#dbeafe'} />
      <path d="M32 16a16 16 0 0 1 14 22" fill="none" stroke={aro} strokeWidth="4" strokeLinecap="round" />
      <path d="M32 48a16 16 0 0 1-14-22" fill="none" stroke={aro} strokeWidth="4" strokeLinecap="round" />
      <path d="M44 14v10h8" fill="none" stroke={flecha} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 50v-10h-8" fill="none" stroke={flecha} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function DibujoTienda({ size = 28 }) {
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} aria-hidden style={{ display: 'block', flexShrink: 0 }}>
      <path d="M4 14h28l-2 6H6z" fill="#fb7185" stroke="#9f1239" strokeWidth="1.4" />
      <path d="M6 8h24v6H6z" fill="#e11d48" />
      <path d="M6 8l3 6M12 8l3 6M18 8l3 6M24 8l3 6" stroke="#fff" strokeWidth="1.4" />
      <rect x="7" y="20" width="22" height="13" rx="1.5" fill="#fff7ed" stroke="#1e3a8a" strokeWidth="1.4" />
      <rect x="15" y="24" width="6" height="9" rx="0.5" fill="#1d4ed8" />
      <rect x="9" y="23" width="4" height="4" fill="#93c5fd" />
      <rect x="23" y="23" width="4" height="4" fill="#93c5fd" />
    </svg>
  );
}

export function DibujoGrafica({ size = 22 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden style={{ display: 'block' }}>
      <rect x="4" y="18" width="6" height="10" rx="1" fill="#93c5fd" />
      <rect x="13" y="10" width="6" height="18" rx="1" fill="#fde68a" />
      <rect x="22" y="6" width="6" height="22" rx="1" fill="#86efac" />
    </svg>
  );
}

export function DibujoDocumento({ size = 22 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden style={{ display: 'block' }}>
      <path d="M8 4h12l6 6v18a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#fff" stroke="#1e3a8a" strokeWidth="1.6" />
      <path d="M20 4v6h6" fill="#dbeafe" stroke="#1e3a8a" strokeWidth="1.4" />
      <path d="M10 16h12M10 20h12M10 24h8" stroke="#1d4ed8" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function DibujoCalculadora({ size = 26 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden style={{ display: 'block' }}>
      <rect x="6" y="3" width="20" height="26" rx="3" fill="#1e3a8a" />
      <rect x="9" y="6" width="14" height="6" rx="1" fill="#bbf7d0" />
      <circle cx="11" cy="17" r="1.4" fill="#fff" />
      <circle cx="16" cy="17" r="1.4" fill="#fff" />
      <circle cx="21" cy="17" r="1.4" fill="#fde68a" />
      <circle cx="11" cy="22" r="1.4" fill="#fff" />
      <circle cx="16" cy="22" r="1.4" fill="#fff" />
      <circle cx="21" cy="22" r="1.4" fill="#86efac" />
      <circle cx="11" cy="26" r="1.3" fill="#fff" />
      <circle cx="16" cy="26" r="1.3" fill="#fff" />
    </svg>
  );
}

export function DibujoPalomita({ size = 22 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden style={{ display: 'block' }}>
      <circle cx="16" cy="16" r="12" fill="#fff" />
      <path d="M9 16.5l4.5 4.5L23 11" fill="none" stroke="#15803d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DibujoBandera({ size = 22 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden style={{ display: 'block' }}>
      <path d="M8 4v24" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M8 6h14l-3 5 3 5H8z" fill="#fde68a" stroke="#fff" strokeWidth="1.4" />
    </svg>
  );
}

export function DibujoReloj({ size = 20 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden style={{ display: 'block' }}>
      <circle cx="16" cy="17" r="10" fill="#fff" stroke="#1d4ed8" strokeWidth="2" />
      <path d="M16 12v6l4 2" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 5h8" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function DibujoImpresora({ size = 20 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden style={{ display: 'block' }}>
      <rect x="8" y="4" width="16" height="8" rx="1" fill="#fff" stroke="#6d28d9" strokeWidth="1.6" />
      <rect x="5" y="12" width="22" height="10" rx="2" fill="#c4b5fd" stroke="#5b21b6" strokeWidth="1.6" />
      <rect x="9" y="18" width="14" height="10" rx="1" fill="#fff" stroke="#5b21b6" strokeWidth="1.6" />
      <circle cx="23" cy="16" r="1.2" fill="#5b21b6" />
    </svg>
  );
}
