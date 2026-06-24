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

export function sonidoEscaneoProducto() {
  if (!leerConfigAudio().sonidoEscaneo) return;
  tono(880, 0.05, 0.14, 'square');
  setTimeout(() => tono(1100, 0.04, 0.1, 'square'), 35);
}
