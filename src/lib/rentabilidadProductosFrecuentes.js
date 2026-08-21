/**
 * Estadísticas · rentabilidad y margen de productos de alta frecuencia,
 * con alerta de stock para no dejar que se agoten en tienda.
 */
import { esAlmacenCentral, listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
import { inicioDia, finDia } from './corteCaja.js';
import { stockEnUbicacion } from './inventarioMultitienda.js';
import { costoUnitarioInventario } from './valorInventario.js';
import { consultarVentasPaginadas } from './ventasQuery.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function articulosDeVenta(venta) {
  let a = venta?.articulos;
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a);
    } catch {
      a = [];
    }
  }
  return Array.isArray(a) ? a : [];
}

function diasInclusive(desde, hasta) {
  const a = String(desde || '').slice(0, 10);
  const b = String(hasta || '').slice(0, 10);
  if (!a || !b) return 1;
  const d0 = new Date(`${a}T12:00:00`);
  const d1 = new Date(`${b}T12:00:00`);
  const diff = Math.round((d1 - d0) / 86400000);
  return Math.max(1, diff + 1);
}

function stockPisoProducto(prod, sucursalFiltro) {
  if (!prod) return 0;
  if (sucursalFiltro) {
    return stockEnUbicacion(prod, sucursalFiltro, 'piso', sucursalFiltro);
  }
  const tiendas = listarSucursalesOperativas().filter((t) => !esAlmacenCentral(t));
  return tiendas.reduce((s, t) => s + stockEnUbicacion(prod, t, 'piso', t), 0);
}

/**
 * @param {object} opts
 * @param {string} opts.desde YYYY-MM-DD
 * @param {string} opts.hasta YYYY-MM-DD
 * @param {string|null} [opts.sucursal]
 * @param {Array} [opts.inventario] productos con stock_sucursales
 * @param {number} [opts.topN] productos de alta frecuencia a mostrar (default 25)
 * @param {number} [opts.diasAlerta] umbral de días de cobertura (default 3)
 */
export async function cargarRentabilidadProductosFrecuentes(supabase, {
  desde,
  hasta,
  sucursal = null,
  inventario = [],
  topN = 25,
  diasAlerta = 3,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!desde || !hasta) return { ok: false, error: 'Indica el periodo.' };

  const suc = sucursal ? normalizarCodigoTienda(sucursal) : null;
  const desdeDt = inicioDia(desde);
  const hastaDt = finDia(hasta);
  const dias = diasInclusive(desde, hasta);
  const avisos = [];

  const [ventasRes, productosRes, cancRes] = await Promise.all([
    consultarVentasPaginadas(supabase, {
      columns: 'id,total,sucursal_id,articulos,created_at',
      desde: desdeDt,
      hasta: hastaDt,
      sucursal: suc,
      orderAsc: false,
    }),
    supabase
      .from('productos')
      .select('id, nombre, cat, precio, precio_compra_sin, precio_compra_con, impuesto, stock_sucursales, stock')
      .limit(20000),
    (async () => {
      try {
        let q = supabase
          .from('cancelaciones')
          .select('id,sucursal_id,articulos,total,created_at')
          .gte('created_at', desdeDt.toISOString())
          .lte('created_at', hastaDt.toISOString())
          .limit(2000);
        if (suc) q = q.eq('sucursal_id', suc);
        return q;
      } catch {
        return { data: [], error: null };
      }
    })(),
  ]);

  if (ventasRes.error) return { ok: false, error: String(ventasRes.error) };
  if (ventasRes.aviso) avisos.push(ventasRes.aviso);
  if (productosRes.error) avisos.push(`Productos: ${productosRes.error.message}`);

  const invById = new Map();
  for (const p of inventario || []) invById.set(String(p.id), p);
  for (const p of productosRes.data || []) {
    const id = String(p.id);
    if (!invById.has(id)) invById.set(id, p);
    else invById.set(id, { ...p, ...invById.get(id) });
  }

  const cancelByProd = new Map();
  for (const c of cancRes.error ? [] : cancRes.data || []) {
    if (suc && normalizarCodigoTienda(c.sucursal_id) !== suc) continue;
    if (esAlmacenCentral(c.sucursal_id)) continue;
    for (const a of articulosDeVenta(c)) {
      const id = String(a.id ?? a.codigo ?? a.producto_id ?? '').trim();
      if (!id) continue;
      const piezas = Number(a.qty ?? a.cantidad ?? 1) || 1;
      const precio = Number(a.precio) || 0;
      const importe = Number(a.importe ?? a.subtotal);
      const lineImp = Number.isFinite(importe) && importe !== 0 ? importe : precio * piezas;
      const prev = cancelByProd.get(id) || { piezas: 0, importe: 0 };
      cancelByProd.set(id, {
        piezas: prev.piezas + piezas,
        importe: prev.importe + lineImp,
      });
    }
  }

  const map = new Map();
  let ticketsConArts = 0;

  const ventas = (ventasRes.data || []).filter((v) => {
    if (esAlmacenCentral(v.sucursal_id)) return false;
    if (suc && normalizarCodigoTienda(v.sucursal_id) !== suc) return false;
    return true;
  });

  for (const v of ventas) {
    const arts = articulosDeVenta(v);
    if (!arts.length) continue;
    ticketsConArts += 1;
    const vistos = new Set();
    for (const a of arts) {
      const id = String(a.id ?? a.codigo ?? a.producto_id ?? '').trim();
      if (!id) continue;
      let piezas = Number(a.qty ?? a.cantidad ?? 1) || 1;
      const precio = Number(a.precio) || 0;
      const importeRaw = Number(a.importe ?? a.subtotal);
      let lineImp = Number.isFinite(importeRaw) && importeRaw !== 0 ? importeRaw : precio * piezas;

      const canc = cancelByProd.get(id);
      if (canc && canc.piezas > 0) {
        const restPiezas = Math.min(piezas, canc.piezas);
        const ratio = piezas > 0 ? restPiezas / piezas : 0;
        piezas -= restPiezas;
        lineImp -= lineImp * ratio;
        canc.piezas -= restPiezas;
        canc.importe = Math.max(0, (canc.importe || 0) - lineImp * ratio);
      }
      if (piezas <= 0 && lineImp <= 0) continue;

      const prod = invById.get(id);
      const costoU = prod ? costoUnitarioInventario(prod) : 0;
      if (!map.has(id)) {
        map.set(id, {
          id,
          nombre: a.nombre || a.descripcion || prod?.nombre || id,
          departamento: String(a.cat || a.departamento || prod?.cat || 'GENERAL').trim().toUpperCase() || 'GENERAL',
          piezas: 0,
          ventas: 0,
          costo: 0,
          tickets: 0,
        });
      }
      const row = map.get(id);
      row.piezas = round3(row.piezas + piezas);
      row.ventas = round2(row.ventas + lineImp);
      row.costo = round2(row.costo + costoU * piezas);
      if (!vistos.has(id)) {
        row.tickets += 1;
        vistos.add(id);
      }
      if (prod?.nombre) row.nombre = prod.nombre;
      if (prod?.cat) row.departamento = String(prod.cat).trim().toUpperCase() || row.departamento;
    }
  }

  const todos = [...map.values()].map((r) => {
    const utilidad = round2(r.ventas - r.costo);
    const margenPct = r.ventas > 0 ? round2((utilidad / r.ventas) * 100) : 0;
    const ritmoDiario = round3(r.piezas / dias);
    const prod = invById.get(r.id);
    const stock = stockPisoProducto(prod, suc);
    const diasCobertura = ritmoDiario > 0 ? round2(stock / ritmoDiario) : (stock > 0 ? 999 : 0);
    const alertaStock = r.tickets >= 2 && (stock <= 0 || (ritmoDiario > 0 && diasCobertura < diasAlerta));
    // Frecuencia: prioriza apariciones en tickets, luego volumen
    const frecuencia = r.tickets * 1000 + r.piezas;
    return {
      ...r,
      utilidad,
      margen_pct: margenPct,
      ritmo_diario: ritmoDiario,
      stock,
      dias_cobertura: diasCobertura > 900 ? null : diasCobertura,
      alerta_stock: alertaStock,
      frecuencia,
    };
  });

  todos.sort((a, b) => b.frecuencia - a.frecuencia || b.ventas - a.ventas);

  const top = todos.slice(0, Math.max(5, Number(topN) || 25));
  const atencionStock = top.filter((p) => p.alerta_stock);

  const ventasTop = round2(top.reduce((s, p) => s + p.ventas, 0));
  const costoTop = round2(top.reduce((s, p) => s + p.costo, 0));
  const utilidadTop = round2(ventasTop - costoTop);
  const margenTop = ventasTop > 0 ? round2((utilidadTop / ventasTop) * 100) : 0;

  return {
    ok: true,
    desde,
    hasta,
    dias,
    sucursal: suc,
    avisos,
    top,
    atencionStock,
    totales: {
      skus_vendidos: todos.length,
      top_count: top.length,
      ventas: ventasTop,
      costo: costoTop,
      utilidad: utilidadTop,
      margen_pct: margenTop,
      alertas_stock: atencionStock.length,
      tickets: ticketsConArts,
      dias_alerta: diasAlerta,
    },
  };
}
