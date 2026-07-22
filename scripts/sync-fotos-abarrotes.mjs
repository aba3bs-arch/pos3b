/**
 * Jalá fotos priorizando códigos mexicanos (750…) y barcodes reales.
 * Uso: node scripts/sync-fotos-abarrotes.mjs [--limite=500] [--delay=200] [--offset=0]
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { sincronizarFotosCatalogo, tieneFoto } from '../src/lib/fotosCatalogo.js';

function loadEnv() {
  try {
    let raw = readFileSync('.env', 'utf8');
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return env;
  } catch {
    return {};
  }
}

function argNum(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return def;
  const n = Number(hit.split('=')[1]);
  return Number.isFinite(n) ? n : def;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key || url.includes('tu-proyecto')) {
  console.error('Falta .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY reales.');
  process.exit(1);
}

const limite = argNum('limite', 500);
const delayMs = argNum('delay', 200);
const offset = argNum('offset', 0);
const supabase = createClient(url, key);

console.log(`Cargando productos sin foto (prioridad abarrotes MX 750…, offset ${offset})…`);

const PAGE = 1000;
let from = 0;
const sinFoto = [];
for (;;) {
  const { data, error } = await supabase
    .from('productos')
    .select('id,nombre,foto_url')
    .order('id')
    .range(from, from + PAGE - 1);
  if (error) {
    console.error('Error leyendo productos:', error.message);
    process.exit(1);
  }
  const batch = data || [];
  for (const p of batch) {
    if (!tieneFoto(p)) sinFoto.push(p);
  }
  if (batch.length < PAGE) break;
  from += PAGE;
}

const esBarcode = (id) => /^\d{8,18}$/.test(String(id || '').trim());
const esMx = (id) => String(id || '').trim().startsWith('750');

const mx = sinFoto.filter((p) => esMx(p.id));
const otrosBar = sinFoto.filter((p) => esBarcode(p.id) && !esMx(p.id));
const priorizados = [...mx, ...otrosBar];
const cola = priorizados.slice(Math.max(0, offset), Math.max(0, offset) + limite);

console.log(
  `Sin foto: ${sinFoto.length} · MX750: ${mx.length} · otros barcode: ${otrosBar.length} · procesando: ${cola.length} (offset ${offset})`
);

const r = await sincronizarFotosCatalogo(supabase, cola, {
  soloSinFoto: true,
  limite: cola.length,
  delayMs,
  buscarNombre: true,
  onProgress: ({ actual, total, id, nombre, actualizados, sinFoto: sf }) => {
    if (actual % 10 === 0 || actual === total) {
      console.log(
        `[${actual}/${total}] +${actualizados} ok · ${sf} sin img · ${id} ${String(nombre || '').slice(0, 40)}`
      );
    }
  },
});

console.log(r.mensaje || r.error || r);
