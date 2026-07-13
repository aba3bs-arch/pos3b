import { leerConfigAudio } from './posConfig.js';

let audioCtx = null;

function ctx() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tono(freq, dur = 0.08, vol = 0.12, type = 'sine') {
  const c = ctx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g);
  g.connect(c.destination);
  const t = c.currentTime;
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t);
  o.stop(t + dur);
}

export function sonidoMenuNavegacion() {
  if (!leerConfigAudio().sonidoMenu) return;
  tono(520, 0.06, 0.1);
  setTimeout(() => tono(680, 0.05, 0.08), 40);
}

/** Desbloquea AudioContext tras un gesto (abrir cámara); en iOS/Android hace falta. */
export function prepararAudioPos() {
  ctx();
}

function vibrarEscaneo() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(35);
    }
  } catch {
    /* ignore */
  }
}

export function sonidoEscaneoProducto() {
  if (!leerConfigAudio().sonidoEscaneo) {
    vibrarEscaneo();
    return;
  }
  const c = ctx();
  vibrarEscaneo();
  if (!c) return;
  // Un poco más audible en celulares con volumen medio.
  tono(880, 0.07, 0.2, 'square');
  setTimeout(() => tono(1175, 0.06, 0.14, 'square'), 40);
}
