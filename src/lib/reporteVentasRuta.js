import { esCreditoCobrado } from './recoleccionTipos.js';

const PAGE = 1000;
const TOPE = 50000;

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normNombre(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function faltaTabla(error) {
  const m = String(error?.message || error || '');
  return /does not exist|schema cache|could not find the table|relation .* does not exist/i.test(m);
}

/** Efectivo y crédito de una venta de ruta. El mixto sale del desglose guardado en artículos. */
export function montosVentaReporte(venta) {
  const total = r2(venta?.total);
  const mp = String(venta?.metodo_pago || '').toLowerCase();
  if (mp === 'credito') return { efectivo: 0, credito: total };
  if (mp === 'mixto') {
    const arts = Array.isArray(venta?.articulos) ? venta.articulos : [];
    const mix = arts.find((a) => a && (a._pago_mixto === true || a._pago_mixto === 1 || a._pago_mixto === 'true'));
    const efectivo = r2(mix?.efectivo ?? mix?.monto_efectivo);
    const credito = r2(mix?.credito ?? mix?.monto_credito);
    if (efectivo + credito > 0) return { efectivo, credito };
    return { efectivo: 0, credito: total };
  }
  return { efectivo: total, credito: 0 };
}

function vacio() {
  return {
    ventas: { total: 0, efectivo: 0, credito: 0, count: 0, filas: [] },
    recuperados: { total: 0, count: 0, filas: [] },
    servicios: { total: 0, count: 0, filas: [] },
    externos: { total: 0, count: 0, filas: [] },
  };
}

function filaVenta(venta, parte, monto) {
  return {
    id: `${venta.id || venta.folio}:${parte}`,
    folio: venta.folio || '—',
    fecha: venta.created_at || null,
    quien: venta.cliente_nombre || venta.cliente_id || '—',
    detalle: parte === 'efectivo' ? 'Efectivo' : 'Crédito (nuevo)',
    monto: r2(monto),
  };
}

function filaTransito(mov, detalle) {
  return {
    id: String(mov.id || ''),
    folio: mov.num_traspaso || mov.descripcion_gasto || '—',
    fecha: mov.fecha_hora || mov.created_at || null,
    quien: mov.sucursal_origen || '—',
    detalle,
    monto: r2(mov.monto),
  };
}

/**
 * Arma una tarjeta por recolector con las ventas del camión en curso
 * y lo que ya está en tránsito (créditos recuperados y servicios).
 *
 * Saldo = efectivo de ventas a tienda + créditos recuperados + servicios + clientes externos.
 * El crédito nuevo se ve dentro de RC/Ventas y no se suma otra vez al saldo.
 */
export function armarReporteVentas({ repartidores = [], cargas = [], ventas = [], transito = [] } = {}) {
  const activos = (repartidores || []).filter((r) => r && r.activo !== false && r.id);
  const porId = new Map(activos.map((r) => [String(r.id), r]));
  const porNombre = new Map();
  for (const r of activos) {
    const n = normNombre(r.nombre);
    if (n && !porNombre.has(n)) porNombre.set(n, r);
  }

  const cargasById = new Map((cargas || []).filter((c) => c?.id).map((c) => [String(c.id), c]));
  const abiertas = new Set(
    (cargas || [])
      .filter((c) => String(c?.estado || '').toLowerCase() === 'en_ruta' && c?.id)
      .map((c) => String(c.id)),
  );

  const grupos = new Map();
  const asegurar = (id, nombre) => {
    const key = String(id || '');
    if (!key) return null;
    if (!grupos.has(key)) {
      grupos.set(key, { id: key, nombre: nombre || key, ...vacio() });
    }
    const g = grupos.get(key);
    if (nombre && g.nombre === key) g.nombre = nombre;
    return g;
  };

  for (const r of activos) asegurar(r.id, r.nombre);

  const duenoDeCarga = (carga, venta) => {
    const vid = String(carga?.vendedor_id || '');
    if (vid && porId.has(vid)) return porId.get(vid);
    const nombre = normNombre(carga?.vendedor_nombre || venta?.vendedor_nombre);
    if (nombre && porNombre.has(nombre)) return porNombre.get(nombre);
    const etiqueta = String(carga?.vendedor_nombre || venta?.vendedor_nombre || vid || 'Sin recolector').trim();
    return { id: `extra:${normNombre(etiqueta) || 'sin'}`, nombre: etiqueta };
  };

  for (const venta of ventas || []) {
    const cargaId = String(venta?.carga_id || '');
    if (!abiertas.has(cargaId)) continue;
    const carga = cargasById.get(cargaId);
    const dueno = duenoDeCarga(carga, venta);
    const g = asegurar(dueno.id, dueno.nombre);
    if (!g) continue;
    const montos = montosVentaReporte(venta);
    const externo = String(venta.cliente_tipo || '').toLowerCase() === 'externo';
    if (externo) {
      const monto = r2(montos.efectivo + montos.credito);
      if (monto <= 0 && r2(venta.total) <= 0) continue;
      g.externos.total = r2(g.externos.total + (monto || r2(venta.total)));
      g.externos.count += 1;
      g.externos.filas.push({
        ...filaVenta(venta, 'externo', monto || venta.total),
        detalle: montos.credito > 0 && montos.efectivo > 0 ? 'Mixto' : (montos.credito > 0 ? 'Crédito' : 'Efectivo'),
      });
      continue;
    }
    if (montos.efectivo > 0) {
      g.ventas.efectivo = r2(g.ventas.efectivo + montos.efectivo);
      g.ventas.filas.push(filaVenta(venta, 'efectivo', montos.efectivo));
    }
    if (montos.credito > 0) {
      g.ventas.credito = r2(g.ventas.credito + montos.credito);
      g.ventas.filas.push(filaVenta(venta, 'credito', montos.credito));
    }
    if (montos.efectivo > 0 || montos.credito > 0) g.ventas.count += 1;
  }

  for (const mov of transito || []) {
    if (String(mov?.estatus || '') !== 'En Tránsito') continue;
    if (String(mov?.tipo_movimiento || '') === 'Gasto') continue;
    const servicio = String(mov?.tipo_movimiento || '') === 'Cobro Servicio';
    const credito = !servicio && esCreditoCobrado(mov);
    if (!servicio && !credito) continue;
    const rid = String(mov.repartidor_id || '');
    const conocido = rid && porId.get(rid);
    const nombre = conocido?.nombre || mov.repartidor_nombre || rid || 'Sin recolector';
    const g = asegurar(conocido ? conocido.id : (rid || `extra:${normNombre(nombre) || 'sin'}`), nombre);
    if (!g) continue;
    if (servicio) {
      g.servicios.total = r2(g.servicios.total + mov.monto);
      g.servicios.count += 1;
      g.servicios.filas.push(filaTransito(mov, 'Servicio'));
    } else {
      g.recuperados.total = r2(g.recuperados.total + mov.monto);
      g.recuperados.count += 1;
      g.recuperados.filas.push(filaTransito(mov, 'Crédito recuperado'));
    }
  }

  const tarjetas = [...grupos.values()].map((g) => {
    g.ventas.total = r2(g.ventas.efectivo + g.ventas.credito);
    const mov = g.ventas.count + g.recuperados.count + g.servicios.count + g.externos.count;
    const saldo = r2(g.ventas.efectivo + g.recuperados.total + g.servicios.total + g.externos.total);
    return { ...g, mov, rc: mov, saldo };
  });

  tarjetas.sort((a, b) => {
    if (b.saldo !== a.saldo) return b.saldo - a.saldo;
    return String(a.nombre).localeCompare(String(b.nombre), 'es');
  });

  return tarjetas;
}

async function leerPaginas(hacer) {
  const rows = [];
  for (let from = 0; from < TOPE; from += PAGE) {
    const { data, error } = await hacer(from, from + PAGE - 1);
    if (error) {
      if (faltaTabla(error)) return { data: rows, aviso: error.message };
      return { data: rows, error: error.message };
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: rows };
}

/**
 * Lee repartidores, cargas en ruta, sus ventas y el efectivo en tránsito.
 * No escribe nada.
 */
export async function cargarReporteVentasRuta(supabase) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', tarjetas: [] };

  const reps = await leerPaginas((from, to) => supabase
    .from('repartidores')
    .select('id, nombre, activo')
    .order('nombre')
    .range(from, to));
  if (reps.error) return { ok: false, error: reps.error, tarjetas: [] };

  const cargas = await leerPaginas((from, to) => supabase
    .from('ruta_cargas')
    .select('id, vendedor_id, vendedor_nombre, estado, folio')
    .eq('estado', 'en_ruta')
    .order('created_at', { ascending: false })
    .range(from, to));
  if (cargas.error) return { ok: false, error: cargas.error, tarjetas: [] };

  const ventas = [];
  const ids = (cargas.data || []).map((c) => c.id).filter(Boolean);
  let aviso = reps.aviso || cargas.aviso || '';
  for (let i = 0; i < ids.length; i += 80) {
    const slice = ids.slice(i, i + 80);
    const parte = await leerPaginas((from, to) => supabase
      .from('ruta_ventas')
      .select('id, carga_id, folio, cliente_tipo, cliente_id, cliente_nombre, metodo_pago, total, articulos, vendedor_nombre, created_at, estado_credito')
      .in('carga_id', slice)
      .order('created_at', { ascending: false })
      .range(from, to));
    if (parte.error) return { ok: false, error: parte.error, tarjetas: [] };
    if (parte.aviso) aviso = parte.aviso;
    ventas.push(...parte.data);
  }

  const transito = await leerPaginas((from, to) => supabase
    .from('transito_efectivo')
    .select('id, repartidor_id, monto, tipo_movimiento, estatus, num_traspaso, foto_url, descripcion_gasto, sucursal_origen, fecha_hora')
    .eq('estatus', 'En Tránsito')
    .order('fecha_hora', { ascending: false })
    .range(from, to));
  if (transito.error) return { ok: false, error: transito.error, tarjetas: [] };
  if (transito.aviso) aviso = transito.aviso;

  return {
    ok: true,
    aviso: aviso || null,
    tarjetas: armarReporteVentas({
      repartidores: reps.data,
      cargas: cargas.data,
      ventas,
      transito: transito.data,
    }),
  };
}
