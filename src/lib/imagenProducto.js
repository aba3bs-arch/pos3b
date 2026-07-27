/** Tamaño máx. aproximado del data URL resultante (binario). */
const MAX_BYTES_DEFAULT = 900 * 1024;

function approxBytesFromDataUrl(dataUrl) {
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.ceil((b64.length * 3) / 4);
}

function canvasToJpeg(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Lee una imagen (archivo o cámara) y la comprime a JPEG data URL
 * para caber en productos.foto_url sin superar ~1 MB.
 */
export function leerImagenProductoComoDataUrl(
  file,
  { maxSide = 720, quality = 0.78, maxBytes = MAX_BYTES_DEFAULT } = {},
) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No se eligió archivo'));
      return;
    }
    if (!String(file.type || '').startsWith('image/')) {
      reject(new Error('El archivo debe ser una imagen (PNG, JPG, WebP…).'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('No se pudo leer la imagen.'));
          return;
        }
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));

        let canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('No se pudo procesar la imagen.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(objectUrl);

        let q = quality;
        let dataUrl = canvasToJpeg(canvas, q);
        while (approxBytesFromDataUrl(dataUrl) > maxBytes && q > 0.45) {
          q = Math.round((q - 0.08) * 100) / 100;
          dataUrl = canvasToJpeg(canvas, q);
        }

        if (approxBytesFromDataUrl(dataUrl) > maxBytes) {
          const smaller = document.createElement('canvas');
          smaller.width = Math.max(1, Math.round(w * 0.7));
          smaller.height = Math.max(1, Math.round(h * 0.7));
          const sctx = smaller.getContext('2d');
          if (sctx) {
            sctx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
            canvas = smaller;
            dataUrl = canvasToJpeg(canvas, 0.65);
          }
        }

        if (approxBytesFromDataUrl(dataUrl) > 1024 * 1024) {
          reject(new Error('La foto quedó demasiado grande. Intenta con otra toma o sube una imagen más liviana.'));
          return;
        }
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen.'));
    };
    img.src = objectUrl;
  });
}
