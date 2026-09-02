#!/usr/bin/env node
/**
 * Vincula productos de deptos CEDIS al proveedor «CEDIS LAS 3B».
 * Solo escribe en proveedor_producto (no toca productos ni stock de tiendas).
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/vincular-catalogo-cedis.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROVEEDOR_CEDIS_NOMBRE,
  esDepartamentoCatalogoCedis,
} from '../src/lib/catalogoCedis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadConfig() {
  let url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  let key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (url && key) return { url, key };
  const cfgPath = path.join(root, 'public', 'pos3b-config.js');
  if (fs.existsSync(cfgPath)) {
    const txt = fs.readFileSync(cfgPath, 'utf8');
    const u = txt.match(/url:\s*['"]([^'"]+)['"]/);
    const k = txt.match(/anonKey:\s*['"]([^'"]+)['"]/);
    if (u && k) return { url: u[1], key: k[1] };
  }
  throw new Error('Falta SUPABASE_URL / SUPABASE_ANON_KEY');
}

async function main() {
  const cfg = loadConfig();
  const headers = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  async function req(method, p, body) {
    const res = await fetch(`${cfg.url}${p}`, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${text}`);
    return data;
  }

  const provs = await req(
    'GET',
    `/rest/v1/proveedores?nombre=ilike.${encodeURIComponent(PROVEEDOR_CEDIS_NOMBRE)}&select=id,nombre`,
  );
  const proveedor =
    (provs || []).find((p) => String(p.nombre || '').trim().toUpperCase() === PROVEEDOR_CEDIS_NOMBRE) ||
    (provs || [])[0];
  if (!proveedor) throw new Error(`No existe proveedor ${PROVEEDOR_CEDIS_NOMBRE}`);

  const productos = [];
  let offset = 0;
  const page = 1000;
  for (;;) {
    const rows = await req(
      'GET',
      `/rest/v1/productos?select=id,cat&order=id&limit=${page}&offset=${offset}`,
    );
    if (!rows.length) break;
    productos.push(...rows);
    if (rows.length < page) break;
    offset += page;
  }

  const candidatos = productos.filter((p) => esDepartamentoCatalogoCedis(p.cat)).map((p) => String(p.id));
  const existentes = await req(
    'GET',
    `/rest/v1/proveedor_producto?proveedor_id=eq.${proveedor.id}&select=producto_id&limit=20000`,
  );
  const ya = new Set((existentes || []).map((r) => String(r.producto_id)));
  const faltan = candidatos.filter((id) => !ya.has(id));
  console.log({
    proveedor: proveedor.nombre,
    candidatos: candidatos.length,
    yaVinculados: [...ya].filter((id) => candidatos.includes(id)).length,
    aInsertar: faltan.length,
  });

  const chunk = 200;
  let insertados = 0;
  for (let i = 0; i < faltan.length; i += chunk) {
    const slice = faltan.slice(i, i + chunk).map((producto_id) => ({
      proveedor_id: proveedor.id,
      producto_id,
      sku_proveedor: null,
    }));
    await req('POST', '/rest/v1/proveedor_producto', slice);
    insertados += slice.length;
  }
  console.log('Insertados:', insertados);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
