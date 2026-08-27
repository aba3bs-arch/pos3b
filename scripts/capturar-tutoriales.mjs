/**
 * Captura pantallas reales (CSS/UI del POS) para tutoriales.
 * Uso: node scripts/capturar-tutoriales.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const base = process.env.SHOTS_BASE || 'http://127.0.0.1:5173';

const shots = [
  { scene: 'ventas-ticket', out: 'public/tutorial-cobros/cobro-01-ticket-cobrar.png' },
  { scene: 'cobro-mxn', out: 'public/tutorial-cobros/cobro-02-efectivo-pesos.png' },
  { scene: 'cobro-usd', out: 'public/tutorial-cobros/cobro-03-efectivo-dolares.png' },
  { scene: 'cobro-tarjeta', out: 'public/tutorial-cobros/cobro-04-tarjeta.png' },
  { scene: 'venta-ok', out: 'public/tutorial-cobros/cobro-06-venta-registrada.png' },
];

mkdirSync(join(root, 'public/tutorial-cobros'), { recursive: true });
mkdirSync(join(root, 'docs/img/tutorial-cobros'), { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

for (const s of shots) {
  const url = `${base}/tutorial-shots.html?scene=${s.scene}`;
  console.log('Capturando', s.scene, '→', s.out);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const dest = join(root, s.out);
  await page.screenshot({ path: dest, fullPage: false });
  // copia a docs
  const docsOut = s.out.replace('public/', 'docs/img/');
  await page.screenshot({ path: join(root, docsOut), fullPage: false });
}

await browser.close();
console.log('Listo.');
