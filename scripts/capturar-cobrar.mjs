/**
 * Captura pantallas del módulo real Ventas para el tutorial de cobro.
 */
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const base = process.env.SHOTS_BASE || 'http://127.0.0.1:5173';
const outDir = join(root, 'public/tutorial-cobrar');
const docsDir = join(root, 'docs/img/tutorial-cobrar');
mkdirSync(outDir, { recursive: true });
mkdirSync(docsDir, { recursive: true });

async function shot(page, name) {
  const dest = join(outDir, name);
  await page.screenshot({ path: dest, fullPage: false });
  copyFileSync(dest, join(docsDir, name));
  console.log('OK', name);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
page.on('dialog', async (d) => {
  console.log('dialog:', d.type(), d.message().slice(0, 80));
  if (d.type() === 'confirm') await d.accept().catch(() => {});
  else await d.dismiss().catch(() => {});
});

await page.goto(`${base}/tutorial-shots.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await shot(page, '01-ticket-cobrar.png');

await page.getByRole('button', { name: /^Cobrar$/i }).click();
await page.waitForTimeout(400);

await page.getByRole('button', { name: /^Efectivo$/i }).click();
await page.locator('.ventas-cobro-modal select').first().selectOption('MXN');
await page.locator('.ventas-cobro-modal select').nth(1).selectOption('100');
await page.waitForTimeout(200);
await shot(page, '02-efectivo-pesos.png');

await page.locator('.ventas-cobro-modal select').first().selectOption('USD');
await page.locator('.ventas-cobro-modal select').nth(1).selectOption('5');
await page.waitForTimeout(200);
await shot(page, '03-efectivo-dolares.png');

await page.getByRole('button', { name: /^Tarjeta$/i }).click();
await page.waitForTimeout(200);
const ref = page.locator('.ventas-cobro-modal input.input');
await ref.fill('45821');
await page.waitForTimeout(200);
await shot(page, '04-tarjeta.png');

await page.getByRole('button', { name: /^Efectivo$/i }).click();
await page.getByRole('button', { name: /Monto exacto/i }).click();
await page.waitForTimeout(150);
await page.getByRole('button', { name: /Finalizar venta/i }).click();
await page.waitForTimeout(900);
await shot(page, '05-venta-registrada.png');

await browser.close();
console.log('Listo', outDir);
