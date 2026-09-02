#!/usr/bin/env node
/**
 * Repara ruta_ventas incompletas (compra_id / transito_id / estado_credito).
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/reparar-ruta-ventas-incompletas.mjs
 *
 * Si no hay env, intenta leer public/pos3b-config.js (window.__POS3B_CONFIG__).
 *
 * Por defecto repara los 6 folios del incidente 2026-09-02.
 * Pasa FOLIOS=VR-XXX,VR-YYY para otros.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const DEFAULT_FOLIOS = [
  'VR-MTHRKPJY',
  'VR-MSI5OJCK',
  'VR-MSHZZEH0',
  'VR-MSHWW24U',
  'VR-MSHWRL9Y',
  'VR-MSHWR0PK',
];

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
  throw new Error('Falta SUPABASE_URL / SUPABASE_ANON_KEY (o public/pos3b-config.js).');
}

function client(cfg) {
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
  return {
    get: (p) => req('GET', p),
    post: (p, body) => req('POST', p, body),
    patch: (p, body) => req('PATCH', p, body),
  };
}

async function main() {
  const cfg = loadConfig();
  const api = client(cfg);
  const folios = (process.env.FOLIOS || DEFAULT_FOLIOS.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const inFolios = folios.map((f) => `"${f}"`).join(',');
  const ventas = await api.get(
    `/rest/v1/ruta_ventas?folio=in.(${folios.join(',')})&select=*&order=created_at.asc`,
  );
  if (!ventas.length) {
    console.log('No se encontraron ventas para', folios);
    return;
  }

  const cargaIds = [...new Set(ventas.map((v) => v.carga_id).filter(Boolean))];
  const cargas = cargaIds.length
    ? await api.get(`/rest/v1/ruta_cargas?id=in.(${cargaIds.join(',')})&select=*`)
    : [];
  const byCarga = Object.fromEntries(cargas.map((c) => [c.id, c]));

  // Créditos ya saldados (abonos o carga liquidada sin CxC histórico)
  const creditPagado = new Set(
    (process.env.CREDIT_PAGADO_FOLIOS || 'VR-MSI5OJCK,VR-MSHZZEH0,VR-MSHWW24U')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const log = [];

  async function findCompra(folio) {
    const rows = await api.get(`/rest/v1/compras?notas=ilike.*${encodeURIComponent(folio)}*&select=id,estado,notas`);
    return rows[0] || null;
  }

  async function ensureCompra(venta) {
    const existing = await findCompra(venta.folio);
    if (existing) {
      log.push(`${venta.folio}: compra existente ${existing.id}`);
      return existing.id;
    }
    const carga = byCarga[venta.carga_id] || {};
    const estado = carga.estado === 'liquidada' ? 'recibida' : 'pedido';
    const items_pedido = (venta.articulos || []).map((a) => ({
      id: a.producto_id,
      nombre: a.nombre,
      qty_pedido: Math.floor(Number(a.cantidad) || 0),
      costo_est: Number(a.precio) || 0,
      stock_teorico: 0,
    }));
    const items =
      estado === 'recibida'
        ? items_pedido.map((i) => ({ id: i.id, nombre: i.nombre, qty: i.qty_pedido, costo: i.costo_est }))
        : [];
    const created = await api.post('/rest/v1/compras', [
      {
        proveedor_id: null,
        sucursal_id: venta.cliente_id,
        total: Number(venta.total),
        notas: `Venta en ruta ${venta.folio} · ${venta.vendedor_nombre || ''} · repair backfill`.trim(),
        estado,
        items_pedido,
        items,
      },
    ]);
    log.push(`${venta.folio}: compra creada ${created[0].id} (${estado})`);
    return created[0].id;
  }

  async function ensureTransito(venta) {
    const rows = await api.get(
      `/rest/v1/transito_efectivo?num_traspaso=eq.${encodeURIComponent(venta.folio)}&select=id,estatus`,
    );
    if (rows[0]) {
      log.push(`${venta.folio}: tránsito existente ${rows[0].id}`);
      return String(rows[0].id);
    }
    const carga = byCarga[venta.carga_id] || {};
    const liquidado = carga.estado === 'liquidada';
    const row = {
      sucursal_origen: venta.cliente_id,
      repartidor_id: 'rep_luis',
      cajero_nombre: String(venta.vendedor_nombre || 'Vendedor ruta'),
      monto: Number(venta.total),
      num_traspaso: venta.folio,
      foto_url: `Venta ruta ${venta.folio} · efectivo · ${venta.cliente_nombre || venta.cliente_id} · repair backfill`,
      estatus: liquidado ? 'Liquidado' : 'En Tránsito',
      tipo_movimiento: 'Venta Ruta',
      descripcion_gasto: liquidado
        ? 'Venta en ruta · efectivo · backfill liquidado'
        : 'Venta en ruta · efectivo en tránsito',
      fecha_hora: venta.created_at,
      usuario_liquida: liquidado ? 'REPAIR' : 'No Leído',
    };
    if (liquidado) row.fecha_liquidacion = carga.liquidada_at || venta.created_at;
    const created = await api.post('/rest/v1/transito_efectivo', [row]);
    log.push(`${venta.folio}: tránsito creado ${created[0].id} (${row.estatus})`);
    return String(created[0].id);
  }

  async function ensureCxc(venta, estatus) {
    const rows = await api.get(
      `/rest/v1/ruta_cxc_movimientos?venta_id=eq.${venta.id}&tipo=eq.cargo&select=*`,
    );
    if (rows[0]) {
      const cargo = rows[0];
      const patch = {};
      if (!cargo.folio_venta) patch.folio_venta = venta.folio;
      if (cargo.estatus !== estatus) {
        patch.estatus = estatus;
        if (estatus === 'pagado') {
          patch.pagado_por = 'REPAIR';
          patch.pagado_at = new Date().toISOString();
        }
      }
      if (Object.keys(patch).length) {
        await api.patch(`/rest/v1/ruta_cxc_movimientos?id=eq.${cargo.id}`, patch);
        log.push(`${venta.folio}: cxc ${cargo.id} → ${JSON.stringify(patch)}`);
      } else {
        log.push(`${venta.folio}: cxc ${cargo.id} ok`);
      }
      return cargo.id;
    }
    const row = {
      cliente_tipo: 'sucursal',
      cliente_id: venta.cliente_id,
      cliente_nombre: venta.cliente_nombre || venta.cliente_id,
      tipo: 'cargo',
      monto: Number(venta.total),
      saldo_despues: estatus === 'pendiente' ? Number(venta.total) : 0,
      venta_id: venta.id,
      carga_id: venta.carga_id,
      folio_venta: venta.folio,
      estatus,
      notas: `Venta ${venta.folio} · repair backfill`,
      usuario_nombre: venta.vendedor_nombre || 'AMR',
    };
    if (estatus === 'pagado') {
      row.pagado_por = 'REPAIR';
      row.pagado_at = new Date().toISOString();
    }
    const created = await api.post('/rest/v1/ruta_cxc_movimientos', [row]);
    log.push(`${venta.folio}: cxc creado ${created[0].id} (${estatus})`);
    return created[0].id;
  }

  for (const venta of ventas) {
    const patchV = {};
    if (venta.cliente_tipo === 'sucursal') {
      const compraId = await ensureCompra(venta);
      if (venta.compra_id !== compraId) patchV.compra_id = compraId;
    }
    if (venta.metodo_pago === 'efectivo') {
      const tid = await ensureTransito(venta);
      if (String(venta.transito_id || '') !== tid) patchV.transito_id = tid;
    } else if (venta.metodo_pago === 'credito') {
      const estatus = creditPagado.has(venta.folio) ? 'pagado' : 'pendiente';
      await ensureCxc(venta, estatus);
      if (venta.estado_credito !== estatus) patchV.estado_credito = estatus;
    }
    if (Object.keys(patchV).length) {
      await api.patch(`/rest/v1/ruta_ventas?id=eq.${venta.id}`, patchV);
      log.push(`${venta.folio}: venta ← ${JSON.stringify(patchV)}`);
    } else {
      log.push(`${venta.folio}: sin cambios de enlace`);
    }
  }

  console.log(log.join('\n'));
  const final = await api.get(
    `/rest/v1/ruta_ventas?folio=in.(${folios.join(',')})&select=folio,metodo_pago,cliente_id,total,compra_id,transito_id,estado_credito&order=created_at.desc`,
  );
  console.log('\nResultado:\n', JSON.stringify(final, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
