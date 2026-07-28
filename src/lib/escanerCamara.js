/** true si el navegador puede pedir cámara (celular, tablet, laptop con cámara). */
export function camaraEscaneoDisponible() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

export const FORMATOS_BARRAS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'codabar',
  'itf',
];
