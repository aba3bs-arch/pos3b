import React from 'react';

/**
 * Iconos SVG inline (estilo línea, sin dependencias externas).
 * paths: array de atributos d para <path> o elementos { tag, ...props }
 */
const ICONS = {
  home: [
    'M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z',
    'M9 21V12h6v9',
  ],
  cart: [
    'M6 6h15l-1.5 9h-12L6 6z',
    'M6 6 5 3H2',
    'M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    'M18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  ],
  register: [
    'M4 4h16v16H4z',
    'M8 8h8',
    'M8 12h8',
    'M8 16h5',
    'M16 16h.01',
  ],
  package: [
    'M12 3 20 7v10l-8 4-8-4V7l8-4z',
    'M12 3v18',
    'M20 7 12 11 4 7',
  ],
  truck: [
    'M3 7h11v8H3z',
    'M14 10h4l3 3v2h-7v-5z',
    'M6 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    'M18 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  ],
  scan: [
    'M4 7V4h3',
    'M17 4h3v3',
    'M21 17v3h-3',
    'M7 21H4v-3',
    'M7 12h10',
  ],
  camera: [
    'M4 8h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
    'M12 17a3 3 0 1 0-3-3 3 3 0 0 0 3 3z',
  ],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z', 'M12 15a3 3 0 1 0-3-3 3 3 0 0 0 3 3z'],
  eyeOff: [
    'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94',
    'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19',
    'M1 1l22 22',
    'M14.12 14.12a3 3 0 0 1-4.24-4.24',
  ],
  building: [
    'M4 21V5l8-2v18',
    'M12 21h8V9l-8-2',
    'M8 9h.01',
    'M8 13h.01',
    'M8 17h.01',
    'M16 13h.01',
    'M16 17h.01',
  ],
  users: [
    'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1',
    'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M22 19v-1a3 3 0 0 0-2-2.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  userCog: [
    'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z',
    'M6 20v-1a6 6 0 0 1 12 0v1',
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  ],
  search: [
    'M11 19a8 8 0 1 0-8-8 8 8 0 0 0 8 8z',
    'M21 21l-4.3-4.3',
  ],
  chart: [
    'M4 20V10',
    'M10 20V4',
    'M16 20v-6',
    'M22 20V8',
  ],
  file: [
    'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z',
    'M14 3v6h6',
  ],
  settings: [
    'M12 15a3 3 0 1 0-3-3 3 3 0 0 0 3 3z',
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  ],
  help: [
    'M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10z',
    'M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-.8.7-1.2 1.1-1.2 2.2',
    'M12 17h.01',
  ],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  logIn: ['M15 3h4v18h-4', 'M10 12H3', 'M6 9l-4 3 4 3'],
  logOut: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  save: ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z', 'M17 21v-8H7v8', 'M7 3v5h8'],
  plus: ['M12 5v14', 'M5 12h14'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M10 11v6', 'M14 11v6'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
  print: ['M6 9V3h12v6', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v7H6z'],
  check: ['M20 6 9 17l-5-5'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  refresh: ['M21 12a9 9 0 1 1-3-6.7', 'M21 3v6h-6'],
  circle: ['M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0'],
  dollar: ['M12 2v20', 'M17 7.5a4 4 0 0 0-4-4h-1a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-1a4 4 0 0 1-4-4'],
  alert: ['M12 9v4', 'M12 17h.01', 'M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z'],
};

export default function Icon({ name, size = 18, strokeWidth = 2, className = '', style, title }) {
  const paths = ICONS[name] || ICONS.circle;
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={{ flexShrink: 0, ...style }}
    >
      {title && <title>{title}</title>}
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** Texto + icono para botones */
export function BtnLabel({ icon, children, iconSize = 18, iconColor }) {
  if (!icon) return children;
  return (
    <>
      <Icon name={icon} size={iconSize} style={iconColor ? { color: iconColor } : undefined} />
      {children != null && children !== '' && <span>{children}</span>}
    </>
  );
}
