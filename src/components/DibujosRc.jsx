/** Figuritas de la carátula. Emoji en una placa, para que se vean en el celular. */

function Placa({ size = 48, fondo = '#fff', emoji, label, extra }) {
  const caja = Math.max(36, size);
  return (
    <span
      role="img"
      aria-label={label}
      style={{
        width: caja,
        height: caja,
        minWidth: caja,
        minHeight: caja,
        borderRadius: Math.round(caja * 0.28),
        background: fondo,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        lineHeight: 1,
        boxShadow: '0 3px 0 rgba(15,23,42,0.22)',
        border: '3px solid #fff',
        overflow: 'visible',
      }}
    >
      <span style={{ fontSize: Math.round(caja * 0.62), lineHeight: 1 }}>{emoji}</span>
      {extra}
    </span>
  );
}

export function DibujoCamion({ size = 92 }) {
  const caja = Math.max(72, size);
  return (
    <span
      role="img"
      aria-label="Camión ABB"
      style={{
        width: caja,
        height: Math.round(caja * 0.72),
        minWidth: caja,
        borderRadius: 18,
        background: 'linear-gradient(180deg,#ffe58a,#f6c445)',
        border: '3px solid #fff',
        boxShadow: '0 3px 0 rgba(15,23,42,0.22)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: Math.round(caja * 0.42), lineHeight: 1 }}>🚚</span>
      <strong style={{ color: '#1e3a8a', fontSize: Math.round(caja * 0.16), letterSpacing: '-0.03em' }}>ABB</strong>
    </span>
  );
}

export function DibujoTarjeta({ size = 48 }) {
  return <Placa size={size} emoji="💳" label="Tarjeta" fondo="#fff7d6" />;
}

export function DibujoBilletes({ size = 48 }) {
  return <Placa size={size} emoji="💵" label="Billetes" fondo="#dcfce7" />;
}

export function DibujoRefresco({ size = 48 }) {
  return <Placa size={size} emoji="🔄" label="Actualizado" fondo="#dbeafe" />;
}

export function DibujoTienda({ size = 40 }) {
  return <Placa size={size} emoji="🏪" label="Tienda" fondo="#fff1f2" />;
}

export function DibujoGrafica({ size = 32 }) {
  return <Placa size={size} emoji="📊" label="Reporte" fondo="#eff6ff" />;
}

export function DibujoDocumento({ size = 32 }) {
  return <Placa size={size} emoji="📋" label="Documento" fondo="#eff6ff" />;
}

export function DibujoCalculadora({ size = 44 }) {
  return <Placa size={size} emoji="🧮" label="Calculadora" fondo="#e0e7ff" />;
}

export function DibujoPalomita({ size = 28 }) {
  return <Placa size={size} emoji="✅" label="Listo" fondo="#dcfce7" />;
}

export function DibujoBandera({ size = 28 }) {
  return <Placa size={size} emoji="🚩" label="Liquidar" fondo="#fee2e2" />;
}

export function DibujoReloj({ size = 28 }) {
  return <Placa size={size} emoji="🕒" label="Historial" fondo="#eff6ff" />;
}

export function DibujoImpresora({ size = 28 }) {
  return <Placa size={size} emoji="🖨️" label="Imprimir" fondo="#f3e8ff" />;
}
