import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CORE_FILES = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-lstm.wasm',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm',
];

function copiar(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

/**
 * Copia worker + core LSTM de tesseract.js a public/ para que el OCR del INE
 * no dependa de CDNs (si no bajan, la UI se queda en «Leyendo…»).
 */
export function copyTesseractAssets() {
  const destDir = path.join(ROOT, 'public', 'tesseract');
  const coreDest = path.join(destDir, 'core');
  const workerSrc = path.join(ROOT, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
  const coreSrcDir = path.join(ROOT, 'node_modules', 'tesseract.js-core');

  if (!fs.existsSync(workerSrc) || !fs.existsSync(coreSrcDir)) {
    console.warn('[tesseract] Falta node_modules/tesseract.js; omite copia de assets OCR.');
    return { ok: false };
  }

  fs.mkdirSync(coreDest, { recursive: true });
  copiar(workerSrc, path.join(destDir, 'worker.min.js'));
  for (const name of CORE_FILES) {
    const src = path.join(coreSrcDir, name);
    if (!fs.existsSync(src)) {
      console.warn(`[tesseract] No está ${name}`);
      continue;
    }
    copiar(src, path.join(coreDest, name));
  }
  return { ok: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  copyTesseractAssets();
}
