/** Figuritas a color de la carátula RC / Créditos por cobrar. */

function Lienzo({ size = 48, vb = '0 0 64 64', w, h, children, label }) {
  return (
    <svg
      viewBox={vb}
      width={w || size}
      height={h || size}
      role={label ? 'img' : 'presentation'}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      style={{ display: 'block', flexShrink: 0, filter: 'drop-shadow(0 2px 0 rgba(15,23,42,0.18))' }}
    >
      {children}
    </svg>
  );
}

export function DibujoCamion({ size = 92 }) {
  return (
    <Lienzo size={size} vb="0 0 104 72" w={size} h={Math.round(size * 0.7)} label="Camión ABB">
      <ellipse cx="52" cy="66" rx="40" ry="4" fill="rgba(15,23,42,0.25)" />
      <rect x="4" y="16" width="58" height="36" rx="6" fill="#f6c445" stroke="#b45309" strokeWidth="2.5" />
      <rect x="8" y="20" width="50" height="18" rx="3" fill="#ffe58a" />
      <text x="33" y="34" textAnchor="middle" fontSize="14" fontWeight="800" fill="#1e3a8a" fontFamily="sans-serif">ABB</text>
      <path d="M62 28h16c6 0 12 5 16 12v12H62z" fill="#f8fafc" stroke="#1e3a8a" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M80 32h8c3 0 6 3 7 6" fill="none" stroke="#93c5fd" strokeWidth="4" strokeLinecap="round" />
      <rect x="78" y="34" width="12" height="8" rx="2" fill="#38bdf8" stroke="#1e3a8a" strokeWidth="1.6" />
      <circle cx="24" cy="54" r="9" fill="#0f172a" />
      <circle cx="24" cy="54" r="4" fill="#e2e8f0" />
      <circle cx="78" cy="54" r="9" fill="#0f172a" />
      <circle cx="78" cy="54" r="4" fill="#e2e8f0" />
      <circle cx="92" cy="40" r="2.2" fill="#fde68a" />
    </Lienzo>
  );
}

export function DibujoTarjeta({ size = 48 }) {
  return (
    <Lienzo size={size} label="Tarjeta">
      <path d="M20 38c1-8 8-14 16-14h6c7 0 14 5 14 13 0 11-9 19-20 19-11 0-17-8-16-18z" fill="#f6c445" stroke="#b45309" strokeWidth="2" />
      <path d="M16 42c-6 1-9 8-6 13 5 2 10-2 12-7" fill="#f6c445" stroke="#b45309" strokeWidth="2" strokeLinejoin="round" />
      <g transform="rotate(-16 30 26)">
        <rect x="6" y="10" width="42" height="28" rx="4" fill="#fff" stroke="#1e3a8a" strokeWidth="2.4" />
        <rect x="6" y="17" width="42" height="7" fill="#2563eb" />
        <rect x="11" y="28" width="12" height="6" rx="1.5" fill="#fbbf24" stroke="#b45309" strokeWidth="1" />
        <rect x="26" y="29" width="16" height="2" rx="1" fill="#cbd5e1" />
        <rect x="26" y="33" width="12" height="2" rx="1" fill="#e2e8f0" />
      </g>
    </Lienzo>
  );
}

export function DibujoBilletes({ size = 48 }) {
  return (
    <Lienzo size={size} label="Billetes">
      <rect x="16" y="34" width="38" height="18" rx="3" fill="#86efac" stroke="#166534" strokeWidth="2" />
      <rect x="13" y="24" width="38" height="18" rx="3" fill="#4ade80" stroke="#166534" strokeWidth="2" />
      <rect x="10" y="14" width="40" height="20" rx="3" fill="#22c55e" stroke="#14532d" strokeWidth="2.4" />
      <rect x="8" y="16" width="8" height="16" rx="1" fill="#bbf7d0" stroke="#166534" strokeWidth="1.4" />
      <circle cx="30" cy="24" r="6.5" fill="#fef9c3" stroke="#166534" strokeWidth="1.6" />
      <text x="30" y="27.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#166534" fontFamily="sans-serif">$</text>
    </Lienzo>
  );
}

export function DibujoRefresco({ size = 48, tono = 'azul' }) {
  const c = tono === 'claro' ? '#ffffff' : '#1d4ed8';
  return (
    <Lienzo size={size} label="Actualizado">
      <path d="M34 10a22 22 0 0 1 18 30" fill="none" stroke={c} strokeWidth="7" strokeLinecap="round" />
      <path d="M30 54a22 22 0 0 1-18-30" fill="none" stroke={c} strokeWidth="7" strokeLinecap="round" />
      <polygon points="46,6 62,16 44,20" fill={c} />
      <polygon points="18,58 2,48 20,44" fill={c} />
    </Lienzo>
  );
}

export function DibujoTienda({ size = 40 }) {
  return (
    <Lienzo size={size} label="Tienda">
      <path d="M6 22h52l-3 8H9z" fill="#fb7185" />
      <rect x="6" y="8" width="52" height="16" rx="2" fill="#e11d48" />
      <rect x="8" y="8" width="7" height="16" fill="#fff" />
      <rect x="20" y="8" width="7" height="16" fill="#fff" />
      <rect x="32" y="8" width="7" height="16" fill="#fff" />
      <rect x="44" y="8" width="7" height="16" fill="#fff" />
      <rect x="10" y="30" width="44" height="26" rx="3" fill="#fff7ed" stroke="#1e3a8a" strokeWidth="2.2" />
      <rect x="15" y="34" width="10" height="8" rx="1" fill="#38bdf8" stroke="#1e3a8a" strokeWidth="1.2" />
      <rect x="39" y="34" width="10" height="8" rx="1" fill="#38bdf8" stroke="#1e3a8a" strokeWidth="1.2" />
      <rect x="27" y="40" width="10" height="16" rx="1" fill="#1d4ed8" />
      <circle cx="35" cy="48" r="1" fill="#fde68a" />
    </Lienzo>
  );
}

export function DibujoGrafica({ size = 32 }) {
  return (
    <Lienzo size={size} label="Reporte">
      <rect x="6" y="34" width="12" height="22" rx="3" fill="#60a5fa" stroke="#1e3a8a" strokeWidth="1.6" />
      <rect x="26" y="18" width="12" height="38" rx="3" fill="#f6c445" stroke="#b45309" strokeWidth="1.6" />
      <rect x="46" y="8" width="12" height="48" rx="3" fill="#4ade80" stroke="#166534" strokeWidth="1.6" />
    </Lienzo>
  );
}

export function DibujoDocumento({ size = 32 }) {
  return (
    <Lienzo size={size} label="Documento">
      <rect x="14" y="8" width="36" height="48" rx="4" fill="#fff" stroke="#1e3a8a" strokeWidth="2.4" />
      <rect x="14" y="8" width="36" height="12" rx="4" fill="#2563eb" />
      <rect x="22" y="4" width="20" height="8" rx="2" fill="#93c5fd" stroke="#1e3a8a" strokeWidth="1.4" />
      <rect x="20" y="26" width="24" height="3" rx="1.5" fill="#93c5fd" />
      <rect x="20" y="33" width="24" height="3" rx="1.5" fill="#bfdbfe" />
      <rect x="20" y="40" width="16" height="3" rx="1.5" fill="#bfdbfe" />
    </Lienzo>
  );
}

export function DibujoCalculadora({ size = 44 }) {
  return (
    <Lienzo size={size} label="Calculadora">
      <rect x="10" y="4" width="44" height="56" rx="6" fill="#1e3a8a" stroke="#0f172a" strokeWidth="2" />
      <rect x="16" y="10" width="32" height="12" rx="2" fill="#bbf7d0" />
      <g fill="#fff">
        <rect x="16" y="28" width="8" height="6" rx="1.5" />
        <rect x="28" y="28" width="8" height="6" rx="1.5" />
        <rect x="40" y="28" width="8" height="6" rx="1.5" fill="#fde68a" />
        <rect x="16" y="38" width="8" height="6" rx="1.5" />
        <rect x="28" y="38" width="8" height="6" rx="1.5" />
        <rect x="40" y="38" width="8" height="6" rx="1.5" fill="#86efac" />
        <rect x="16" y="48" width="8" height="6" rx="1.5" />
        <rect x="28" y="48" width="20" height="6" rx="1.5" fill="#fb7185" />
      </g>
    </Lienzo>
  );
}

export function DibujoPalomita({ size = 28 }) {
  return (
    <Lienzo size={size} label="Listo">
      <circle cx="32" cy="32" r="22" fill="#fff" stroke="#15803d" strokeWidth="3" />
      <path d="M18 33l10 10 18-20" fill="none" stroke="#15803d" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </Lienzo>
  );
}

export function DibujoBandera({ size = 28 }) {
  return (
    <Lienzo size={size} label="Liquidar">
      <path d="M16 6v52" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <path d="M16 10h34l-8 12 8 12H16z" fill="#f6c445" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="28" cy="22" r="3" fill="#e11d48" />
    </Lienzo>
  );
}

export function DibujoReloj({ size = 28 }) {
  return (
    <Lienzo size={size} label="Historial">
      <circle cx="32" cy="34" r="20" fill="#fff" stroke="#1d4ed8" strokeWidth="3" />
      <path d="M32 20v16l10 6" fill="none" stroke="#1d4ed8" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="24" y="8" width="16" height="6" rx="2" fill="#1d4ed8" />
      <circle cx="32" cy="34" r="2.4" fill="#1d4ed8" />
    </Lienzo>
  );
}

export function DibujoImpresora({ size = 28 }) {
  return (
    <Lienzo size={size} label="Imprimir">
      <rect x="18" y="6" width="28" height="14" rx="2" fill="#fff" stroke="#6d28d9" strokeWidth="2" />
      <rect x="10" y="18" width="44" height="22" rx="4" fill="#c4b5fd" stroke="#5b21b6" strokeWidth="2.2" />
      <circle cx="46" cy="28" r="2.2" fill="#5b21b6" />
      <rect x="18" y="32" width="28" height="22" rx="2" fill="#fff" stroke="#5b21b6" strokeWidth="2" />
      <rect x="24" y="38" width="16" height="2.4" rx="1" fill="#c4b5fd" />
      <rect x="24" y="44" width="12" height="2.4" rx="1" fill="#ddd6fe" />
    </Lienzo>
  );
}
