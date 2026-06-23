import React, { useEffect, useState } from 'react';
import { EVENTO_BRANDING, leerLogoUrl } from '../lib/branding.js';

export default function BrandLogo({ alt = '', style, className, maxHeight = 120 }) {
  const [src, setSrc] = useState(leerLogoUrl);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    const sync = () => {
      setSrc(leerLogoUrl());
      setFallo(false);
    };
    sync();
    window.addEventListener(EVENTO_BRANDING, sync);
    return () => window.removeEventListener(EVENTO_BRANDING, sync);
  }, []);

  if (fallo) return null;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{ maxHeight, width: 'auto', height: 'auto', objectFit: 'contain', ...style }}
      onError={() => setFallo(true)}
    />
  );
}
