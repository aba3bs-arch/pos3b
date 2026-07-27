import React, { useEffect, useState } from 'react';

function inicialesDeNombre(nombre) {
  const parts = String(nombre || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** URL usable para <img>; ignora vacíos y valores no-imagen. */
export function urlFotoProducto(producto) {
  const raw = producto?.foto_url ?? producto?.foto ?? '';
  const url = String(raw).trim();
  if (!url || url === 'null' || url === 'undefined') return '';
  if (
    url.startsWith('data:image') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('blob:') ||
    url.startsWith('/')
  ) {
    return url;
  }
  // Algunos registros guardan base64 sin prefijo
  if (/^[A-Za-z0-9+/=\s]{80,}/.test(url)) {
    return `data:image/jpeg;base64,${url.replace(/\s+/g, '')}`;
  }
  return url;
}

export default function ProductoThumb({
  producto,
  nombre,
  size = 48,
  className = '',
  style,
  /** Muestra código e inventario teórico como referencia sobre la imagen */
  referencias = false,
}) {
  const src = urlFotoProducto(producto);
  const [roto, setRoto] = useState(false);

  useEffect(() => {
    setRoto(false);
  }, [src, producto?.id]);

  const label = nombre || producto?.nombre || '';
  const iniciales = inicialesDeNombre(label);
  const mostrarImg = Boolean(src) && !roto;
  const fill = size === '100%' || size === 'full';
  const px = fill ? undefined : Number(size) || 48;
  const codigo = producto?.id != null && producto.id !== '' ? String(producto.id) : '';
  const teorico = Number(producto?.stock) || 0;

  return (
    <div
      className={`producto-thumb ${fill ? 'producto-thumb--fill' : ''} ${referencias ? 'producto-thumb--refs' : ''} ${className}`.trim()}
      style={
        fill
          ? { ...style }
          : {
              width: px,
              height: px,
              minWidth: px,
              minHeight: px,
              ...style,
            }
      }
      aria-hidden
    >
      {mostrarImg ? (
        <img src={src} alt="" decoding="async" onError={() => setRoto(true)} />
      ) : (
        <span className="producto-thumb-iniciales">{iniciales}</span>
      )}
      {referencias && (
        <>
          {codigo ? (
            <span className="producto-thumb-ref producto-thumb-ref--codigo" title="Código">
              {codigo}
            </span>
          ) : null}
          <span className="producto-thumb-ref producto-thumb-ref--teorico" title="Inventario teórico">
            {teorico}
          </span>
        </>
      )}
    </div>
  );
}
