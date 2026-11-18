/**
 * Dejar mercancía de fin de año descuenta el camión del recolector
 * igual que una venta: sube qty_vendida en la carga en ruta.
 * Retirar (si se equivocó) devuelve esa cantidad al camión.
 */

import { resolverRepartidorId } from './rutaTransito.js';
import {
  asignarVentaALineasProducto,
  disponibleEnLineaCarga,
  lineasDeVariasCargas,
  listarCargasRuta,
  precioRutaEspecial,
} from './ventaEnRuta.js';

function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function precioLinea(lin) {
  const n = Number(lin?.precio) || 0;
  return n > 0 ? n : 0;
}

export function agruparInventarioCamion(cargas, lineas) {
  const porCarga = new Map((cargas || []).map((c) => [String(c.id), c]));
  const grupos = new Map();
  for (const lin of lineas || []) {
    const carga = porCarga.get(String(lin.carga_id)) || {};
    const key = String(carga.vendedor_id || carga.camion_id || carga.id || 'camion');
    if (!grupos.has(key)) {
      grupos.set(key, {
        id: key,
        nombre: carga.vendedor_nombre || carga.camion_etiqueta || 'Camión',
        camion: carga.camion_etiqueta || '',
        piezas: 0,
        valorTotal: 0,
        valorReal: 0,
        productos: new Map(),
      });
    }
    const g = grupos.get(key);
    const precio = precioLinea(lin);
    const cargada = Math.max(0, Number(lin.qty_cargada) || 0);
    const disp = disponibleEnLineaCarga(lin);
    g.valorTotal = round2(g.valorTotal + cargada * precio);
    g.valorReal = round2(g.valorReal + disp * precio);
    if (!(disp > 0)) continue;
    const pid = String(lin.producto_id || '');
    if (!pid) continue;
    const prev = g.productos.get(pid) || { id: pid, nombre: lin.producto_nombre || pid, disponible: 0 };
    prev.disponible = round3(prev.disponible + disp);
    g.productos.set(pid, prev);
    g.piezas = round3(g.piezas + disp);
  }
  return [...grupos.values()]
    .map((g) => ({
      id: g.id,
      nombre: g.nombre,
      camion: g.camion,
      piezas: g.piezas,
      valorTotal: g.valorTotal,
      valorReal: g.valorReal,
      productos: [...g.productos.values()].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')),
    }))
    .filter((g) => g.valorTotal > 0 || g.piezas > 0);
}

/** El camión también carga cigarro. En este módulo solo cuenta el departamento CUETES. */
export function esProductoCuete(producto) {
  return String(producto?.cat || '').trim().toUpperCase() === 'CUETES';
}

/**
 * Deja solo líneas de cuetes. El precio de ruta del catálogo manda sobre el precio
 * sellado en la carga. No modifica las líneas originales.
 */
export function lineasInventarioCuetes(lineas, productos) {
  const porId = new Map((productos || []).map((p) => [String(p.id), p]));
  const out = [];
  for (const lin of lineas || []) {
    const producto = porId.get(String(lin.producto_id));
    if (!esProductoCuete(producto)) continue;
    const ruta = precioRutaEspecial(producto);
    out.push(ruta ? { ...lin, precio: ruta } : lin);
  }
  return out;
}

async function productosDeLineas(supabase, lineas) {
  const ids = [...new Set((lineas || []).map((l) => String(l.producto_id || '').trim()).filter(Boolean))];
  if (!ids.length) return { data: [] };
  const data = [];
  for (let i = 0; i < ids.length; i += 80) {
    const slice = ids.slice(i, i + 80);
    const { data: rows, error } = await supabase
      .from('productos')
      .select('id, cat, precio_ruta')
      .in('id', slice);
    if (error) return { data, error: error.message || 'No se pudo leer el departamento de los productos.' };
    data.push(...(rows || []));
  }
  return { data };
}

/** Un solo par de cifras: lo cargado y lo que queda después de vender o dejar a crédito. */
export function cifrasInventarioCamion(grupos) {
  return {
    valorTotal: round2((grupos || []).reduce((s, g) => s + (Number(g.valorTotal) || 0), 0)),
    valorReal: round2((grupos || []).reduce((s, g) => s + (Number(g.valorReal) || 0), 0)),
  };
}

/** Devuelve piezas al camión bajando qty_vendida, de la línea más reciente hacia atrás. */
export function planDevolucionCamion(lineas, productoId, cantidad) {
  let rest = Math.floor(Math.abs(Number(cantidad) || 0));
  const asignaciones = [];
  const propias = (lineas || []).filter((l) => String(l.producto_id) === String(productoId));
  for (const lin of [...propias].reverse()) {
    if (rest <= 0) break;
    const vendida = Number(lin.qty_vendida) || 0;
    if (!(vendida > 0)) continue;
    const take = Math.min(Math.floor(vendida), rest);
    if (!(take > 0)) continue;
    asignaciones.push({ linea: lin, qty: take, antes: vendida, nueva: round3(vendida - take) });
    rest -= take;
  }
  return { ok: true, asignaciones, pendiente: rest };
}

async function idsDeRecolector(supabase, user) {
  const ids = [];
  const push = (id) => {
    const s = String(id || '').trim();
    if (s && !ids.includes(s)) ids.push(s);
  };
  push(user?.id);
  push(user?.repartidor_id);
  try {
    const r = await resolverRepartidorId(supabase, user?.id, user?.nombre, { repartidorId: user?.repartidor_id });
    if (r?.ok) push(r.id);
  } catch {
    /* sin tabla de repartidores */
  }
  return ids;
}

async function cargasYLineasDelRecolector(supabase, user) {
  const ids = await idsDeRecolector(supabase, user);
  let cargas = [];
  for (const id of ids) {
    const c = await listarCargasRuta(supabase, { estado: 'en_ruta', vendedorId: id, limit: 20 });
    if (c.error) return { ok: false, error: c.error };
    if ((c.data || []).length) {
      cargas = c.data;
      break;
    }
  }
  if (!cargas.length) {
    return { ok: false, error: 'No hay carga en el camión. Cárgalo igual que el cigarro.' };
  }
  const lr = await lineasDeVariasCargas(supabase, cargas);
  if (lr.error) return { ok: false, error: lr.error };
  return { ok: true, cargas, lineas: lr.data || [] };
}

async function aplicarQtyVendida(supabase, cambios) {
  const hechos = [];
  for (const c of cambios) {
    const id = c.linea?.id;
    if (!id) continue;
    const { data, error } = await supabase
      .from('ruta_carga_lineas')
      .update({ qty_vendida: c.nueva })
      .eq('id', id)
      .eq('qty_vendida', c.antes)
      .select('id');
    if (error || !data?.length) {
      for (const h of hechos.reverse()) {
        await supabase.from('ruta_carga_lineas').update({ qty_vendida: h.antes }).eq('id', h.linea.id);
      }
      return {
        ok: false,
        error: error?.message || 'El inventario del camión cambió. Vuelve a intentar.',
      };
    }
    hechos.push(c);
  }
  return { ok: true, cambios: hechos };
}

export async function descontarProductoDelCamion(supabase, { user, productoId, cantidad }) {
  const pid = String(productoId || '').trim();
  if (!pid) return { ok: false, error: 'Falta el código del producto.' };
  const base = await cargasYLineasDelRecolector(supabase, user);
  if (!base.ok) return base;
  const propias = base.lineas.filter((l) => String(l.producto_id) === pid);
  const asg = asignarVentaALineasProducto(propias, cantidad);
  if (!asg.ok) {
    return { ok: false, error: asg.error === 'Cantidad inválida.' ? asg.error : `En el camión ${asg.error}` };
  }
  const cambios = asg.asignaciones.map((x) => {
    const antes = Number(x.linea.qty_vendida) || 0;
    return { linea: x.linea, qty: x.qty, antes, nueva: round3(antes + x.qty) };
  });
  const aplicado = await aplicarQtyVendida(supabase, cambios);
  if (!aplicado.ok) return aplicado;
  return { ok: true, cambios };
}

export async function devolverProductoAlCamion(supabase, { user, productoId, cantidad }) {
  const pid = String(productoId || '').trim();
  if (!pid) return { ok: true, cambios: [] };
  const base = await cargasYLineasDelRecolector(supabase, user);
  if (!base.ok) return { ok: true, cambios: [], aviso: base.error };
  const plan = planDevolucionCamion(base.lineas, pid, cantidad);
  if (!plan.asignaciones.length) return { ok: true, cambios: [] };
  const aplicado = await aplicarQtyVendida(supabase, plan.asignaciones);
  if (!aplicado.ok) return aplicado;
  return { ok: true, cambios: plan.asignaciones };
}

export async function revertirAjusteCamion(supabase, cambios) {
  const inversos = (cambios || []).map((c) => ({
    linea: c.linea,
    antes: c.nueva,
    nueva: c.antes,
  }));
  return aplicarQtyVendida(supabase, inversos);
}

/** Aplica un plan ya armado (baja qty_vendida). No busca el camión del usuario. */
export async function aplicarPlanDevolucionCamion(supabase, asignaciones) {
  if (!asignaciones?.length) return { ok: false, error: 'No hay piezas para devolver al camión.' };
  return aplicarQtyVendida(supabase, asignaciones);
}

export async function listarInventarioCamiones(supabase) {
  if (!supabase) return { ok: false, camiones: [], error: 'Sin conexión.' };
  const c = await listarCargasRuta(supabase, { estado: 'en_ruta', limit: 40 });
  if (c.error) return { ok: false, camiones: [], error: c.error };
  const lr = await lineasDeVariasCargas(supabase, c.data || []);
  if (lr.error) return { ok: false, camiones: [], error: lr.error };
  const prods = await productosDeLineas(supabase, lr.data || []);
  if (prods.error) return { ok: false, camiones: [], valorTotal: 0, valorReal: 0, error: prods.error };
  const cuetes = lineasInventarioCuetes(lr.data || [], prods.data);
  const camiones = agruparInventarioCamion(c.data || [], cuetes);
  return { ok: true, camiones, ...cifrasInventarioCamion(camiones) };
}
