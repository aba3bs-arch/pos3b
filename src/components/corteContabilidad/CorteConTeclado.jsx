import React from 'react';

/**
 * Antes mostraba teclado en pantalla; se quitó para usar el teclado nativo del dispositivo.
 * Se mantiene el wrapper para no romper los cortes que ya lo envuelven.
 */
export default function CorteConTeclado({ children }) {
  return <div className="corte-con-teclado">{children}</div>;
}
