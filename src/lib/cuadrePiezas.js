/**
 * Cuadre de piezas: tickets, consultas e inventario de piso.
 * Un ticket repetido (misma hora, vendedor, total y artículos) cuenta una sola vez.
 * El ajuste solo baja las piezas de la venta real que nunca salieron del piso.
 */
import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { stockEnUbicacion } from './inventarioMultitienda.js';
import { descontarStockPorVenta, guardarMovimientoLocal } from './inventarioMovimientos.js';

function artsOf(row) {
  let a = row?.articulos;
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a);
    } catch {
      a = [];
    }
  }
  return Array.isArray(a) ? a : [];
}

export function piezasDeLinea(a) {
  return Math.max(0, Math.floor(Number(a?.qty ?? a?.cantidad ?? 1) || 0));
}

export function firmaTicket(venta) {
  const arts = artsOf(venta)
    .map((a) => `${String(a?.id ?? '')}:${piezasDeLinea(a)}`)
    .sort()
    .join(',');
  return [
    venta?.created_at || '',
    venta?.sucursal_id || '',
    venta?.vendedor || '',
    String(venta?.total ?? ''),
    arts,
  ].join('|');
}

export function separarTicketsDuplicados(ventas) {
  const grupos = new Map();
  for (const v of ventas || []) {
    const f = firmaTicket(v);
    if (!grupos.has(f)) grupos.set(f, []);
    grupos.get(f).push(v);
  }
  const reales = [];
  const copias = [];
  for (const lista of grupos.values()) {
    const orden = [...lista].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    reales.push(orden[0]);
    for (const extra of orden.slice(1)) copias.push(extra);
  }
  return { reales, copias };
}

export function parseCodigosCuadre(texto) {
  return [...new Set(
    String(texto || '')
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  )];
}

export function parseConteosCuadre(texto) {
  const out = {};
  for (const line of String(texto || '').split(/\n/)) {
    const m = line.trim().match(/^(\S+)\s*[,: ]\s*(\d+)\s*$/);
    if (!m) continue;
    out[m[1]] = Number(m[2]);
  }
  return out;
}

function esMovimientoVenta(m) {
  const modo = String(m?.modo || '').toLowerCase();
  const tipo = String(m?.tipo || '').toLowerCase();
  return modo === 'venta' || tipo === 'venta' || modo === 'consolidacion_venta';
}

function movCubreTicket(movs, ticketId, productoId) {
  const pref = String(ticketId || '').slice(0, 8).toLowerCase();
  if (pref.length < 8) return false;
  return (movs || []).some((m) => {
    if (String(m.producto_id) !== String(productoId)) return false;
    if (!esMovimientoVenta(m)) return false;
    return String(m.motivo || '').toLowerCase().includes(pref);
  });
}

function horaPhoenix(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-MX', {
    timeZone: 'America/Phoenix',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function explicarCuadre(fila) {
  const partes = [];
  if (fila.piezasDuplicadas > 0) {
    partes.push(
      `Consultas cuenta ${fila.piezasDuplicadas} pieza(s) de más: el mismo ticket se guardó otra vez y solo una es la venta.`,
    );
  }
  if (fila.sinBaja > 0) {
    const quienes = (fila.ticketsSinBaja || [])
      .map((t) => `${t.qty} pza de ${t.vendedor || 'el cajero'} a las ${horaPhoenix(t.created_at)} (hora de Sonora), folio ${t.folio}`)
      .join('; ');
    partes.push(
      `El inventario no bajó ${fila.sinBaja} pieza(s) de la venta real${quienes ? `: ${quienes}` : ''}. El piso sigue en ${fila.stock == null ? '—' : fila.stock}.`,
    );
  } else if (fila.piezasDuplicadas === 0) {
    partes.push('Ventas, consultas e inventario coinciden en este periodo.');
  } else {
    partes.push('La venta real sí bajó el inventario. El sobrante está solo en la consulta, por el ticket repetido.');
  }
  if (fila.contado != null) {
    const base = fila.sinBaja > 0 ? fila.stock - fila.sinBaja : fila.stock;
    const gap = base - fila.contado;
    if (fila.sinBaja > 0 && gap === 0) {
      partes.push(`Al ajustar esas ${fila.sinBaja}, el piso queda en ${base}, igual que el conteo.`);
    } else if (fila.sinBaja > 0 && gap > 0) {
      partes.push(`Al ajustar esas ${fila.sinBaja}, el piso quedaría en ${base}. El conteo sigue ${gap} pieza(s) abajo: esas no están en ningún ticket.`);
    } else if (gap > 0) {
      partes.push(`El conteo tiene ${gap} pieza(s) menos que el inventario. Esas piezas no están en ningún ticket.`);
    } else if (gap < 0) {
      partes.push(`El conteo tiene ${-gap} pieza(s) más que el inventario.`);
    } else {
      partes.push('El conteo coincide con el inventario.');
    }
  }
  return partes.join(' ');
}

export function construirCuadre({
  ventas = [],
  movimientos = [],
  conteos = {},
  stocks = {},
  nombres = {},
  filtroIds = null,
} = {}) {
  const { reales, copias } = separarTicketsDuplicados(ventas);
  const filtro = filtroIds?.length ? new Set(filtroIds.map(String)) : null;
  const ids = new Set(filtro ? [...filtro] : []);
  if (!filtro) {
    for (const id of Object.keys(conteos || {})) ids.add(String(id));
  }

  const porProducto = new Map();
  const tomar = (id, nombre) => {
    const pid = String(id || '');
    if (!pid) return null;
    if (filtro && !filtro.has(pid)) return null;
    if (!porProducto.has(pid)) {
      porProducto.set(pid, {
        id: pid,
        nombre: nombres[pid] || nombre || pid,
        piezasConsulta: 0,
        piezasReales: 0,
        piezasDuplicadas: 0,
        sinBaja: 0,
        stock: stocks[pid] != null ? Number(stocks[pid]) : null,
        contado: conteos[pid] != null ? Number(conteos[pid]) : null,
        ticketsSinBaja: [],
      });
    }
    const row = porProducto.get(pid);
    if (nombre && (row.nombre === pid || !row.nombre)) row.nombre = nombre;
    if (nombres[pid]) row.nombre = nombres[pid];
    return row;
  };

  for (const v of reales) {
    for (const a of artsOf(v)) {
      const qty = piezasDeLinea(a);
      if (qty <= 0) continue;
      const row = tomar(a.id, a.nombre);
      if (!row) continue;
      row.piezasConsulta += qty;
      row.piezasReales += qty;
      if (!movCubreTicket(movimientos, v.id, a.id)) {
        row.sinBaja += qty;
        row.ticketsSinBaja.push({
          folio: String(v.id).slice(0, 8),
          qty,
          vendedor: v.vendedor || '',
          created_at: v.created_at,
        });
      }
    }
  }
  for (const v of copias) {
    for (const a of artsOf(v)) {
      const qty = piezasDeLinea(a);
      if (qty <= 0) continue;
      const row = tomar(a.id, a.nombre);
      if (!row) continue;
      row.piezasConsulta += qty;
      row.piezasDuplicadas += qty;
    }
  }

  for (const id of ids) tomar(id);

  const filas = [...porProducto.values()]
    .filter((f) => {
      if (filtro) return true;
      return f.sinBaja > 0 || f.piezasDuplicadas > 0 || f.contado != null;
    })
    .map((f) => ({ ...f, explicacion: explicarCuadre(f) }))
    .sort((a, b) => b.sinBaja - a.sinBaja || a.nombre.localeCompare(b.nombre, 'es'));

  const resumen = {
    productos: filas.length,
    conDesfase: filas.filter((f) => f.sinBaja > 0).length,
    piezasPorAjustar: filas.reduce((s, f) => s + f.sinBaja, 0),
    ticketsReales: reales.length,
    ticketsRepetidos: copias.length,
  };
  return { filas, resumen };
}

const PAGE = 1000;

async function cargarTabla(supabase, table, columns, { sucursal, desdeIso, hastaIso }) {
  const out = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select(columns).order('created_at', { ascending: true }).range(from, from + PAGE - 1);
    if (sucursal) q = q.eq('sucursal_id', sucursal);
    if (desdeIso) q = q.gte('created_at', desdeIso);
    if (hastaIso) q = q.lte('created_at', hastaIso);
    const { data, error } = await q;
    if (error) return { data: out, error: error.message };
    out.push(...(data || []));
    if ((data || []).length < PAGE) break;
    from += PAGE;
  }
  return { data: out, error: null };
}

export function rangoPhoenixIso(desdeYmd, hastaYmd) {
  const ini = desdeYmd ? new Date(`${desdeYmd}T00:00:00-07:00`).toISOString() : null;
  const fin = hastaYmd ? new Date(`${hastaYmd}T23:59:59.999-07:00`).toISOString() : null;
  return { desdeIso: ini, hastaIso: fin };
}

export function ymdPhoenix(fecha = new Date()) {
  return fecha.toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
}

export async function analizarCuadrePiezas(supabase, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', filas: [], resumen: {} };
  const sucursal = normalizarCodigoTienda(opts.sucursal);
  if (!sucursal) return { ok: false, error: 'Elige la sucursal.', filas: [], resumen: {} };
  const { desdeIso, hastaIso } = rangoPhoenixIso(opts.desde, opts.hasta);
  const [ventasRes, movRes] = await Promise.all([
    cargarTabla(supabase, 'ventas', 'id,sucursal_id,vendedor,total,articulos,created_at', {
      sucursal,
      desdeIso,
      hastaIso,
    }),
    cargarTabla(
      supabase,
      'movimientos_inventario',
      'id,tipo,modo,producto_id,producto_nombre,cantidad,sucursal_id,motivo,created_at',
      { sucursal, desdeIso, hastaIso },
    ),
  ]);
  if (ventasRes.error) return { ok: false, error: ventasRes.error, filas: [], resumen: {} };
  if (movRes.error) return { ok: false, error: movRes.error, filas: [], resumen: {} };

  const stocks = {};
  const nombres = { ...(opts.nombres || {}) };
  for (const p of opts.inventario || []) {
    const id = String(p.id);
    stocks[id] = stockEnUbicacion(p, sucursal, 'piso', sucursal);
    if (p.nombre) nombres[id] = p.nombre;
  }
  const built = construirCuadre({
    ventas: ventasRes.data,
    movimientos: movRes.data,
    conteos: opts.conteos || {},
    stocks,
    nombres,
    filtroIds: opts.codigos?.length ? opts.codigos : null,
  });
  return {
    ok: true,
    resumen: built.resumen,
    filas: built.filas.map((f) => ({ ...f, sucursal })),
  };
}

export async function ajustarCuadrePiezas(supabase, filas, { usuario } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const pendientes = (filas || []).filter((f) => Number(f.sinBaja) > 0);
  if (!pendientes.length) return { ok: true, aplicados: 0, piezas: 0, mensaje: 'No hay piezas de venta por bajar del inventario.' };
  const errores = [];
  let aplicados = 0;
  let piezas = 0;
  for (const f of pendientes) {
    const qty = Math.floor(Number(f.sinBaja) || 0);
    const r = await descontarStockPorVenta(supabase, {
      productoId: f.id,
      qty,
      sucursal: f.sucursal,
    });
    if (!r.ok) {
      errores.push(`${f.nombre}: ${r.error}`);
      continue;
    }
    aplicados += 1;
    piezas += qty;
    guardarMovimientoLocal(
      {
        tipo: 'retiro',
        modo: 'consolidacion_venta',
        producto_id: f.id,
        producto_nombre: f.nombre,
        cantidad: qty,
        stock_antes: r.antes,
        stock_despues: r.despues,
        ubicacion: 'piso',
        motivo: `Cuadre de piezas · ${qty} pza de venta que no habían bajado del piso`,
        usuario: usuario || '—',
        sucursal: f.sucursal,
        created_at: new Date().toISOString(),
      },
      supabase,
    );
  }
  return {
    ok: errores.length === 0,
    aplicados,
    piezas,
    errores,
    mensaje: errores.length
      ? `Se ajustaron ${aplicados} producto(s). ${errores.length} no se pudieron.`
      : `Ajuste aplicado: ${piezas} pieza(s) bajaron del piso.`,
  };
}
