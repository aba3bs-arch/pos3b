/**
 * Tráfico de clientes por tienda (tickets POS reales).
 * Fuente: tabla ventas (created_at), no cierres de corte.
 */
import { etiquetaTienda, listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
import { finDia, inicioDia, ymdNogalesFromDate } from './corteCaja.js';
import { COLORES_TIENDA, acotarDesdeOperativo, FECHA_INICIO_ESTADISTICAS } from './estadisticasData.js';
import { consultarVentasPaginadas } from './ventasQuery.js';

const TZ_NOGALES = 'America/Hermosillo';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Hora local Nogales (0–23) desde ISO. */
export function horaNogalesDeIso(iso) {
  if (!iso) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ_NOGALES,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date(iso));
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    if (!Number.isFinite(h)) return null;
    // hour12:false a veces da 24
    return h === 24 ? 0 : h;
  } catch {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.getHours();
  }
}

export function ymdNogalesDeIso(iso) {
  if (!iso) return null;
  try {
    return ymdNogalesFromDate(new Date(iso));
  } catch {
    return null;
  }
}

export function etiquetaHora(h) {
  const n = Number(h);
  if (!Number.isFinite(n) || n < 0 || n > 23) return '—';
  return `${String(n).padStart(2, '0')}:00`;
}

/**
 * Agrega tickets POS → totales, por tienda, por día, por hora.
 * @param {Array} ventas
 * @param {string[]} [tiendas]
 */
export function agregarTraficoClientes(ventas, tiendas = null) {
  const listaTiendas = (tiendas && tiendas.length)
    ? tiendas.map(normalizarCodigoTienda).filter(Boolean)
    : listarSucursalesOperativas();

  const porTienda = {};
  for (const t of listaTiendas) {
    porTienda[t] = {
      id: t,
      label: etiquetaTienda(t),
      tickets: 0,
      monto: 0,
    };
  }

  const porDia = {};
  const porHora = {};
  for (let h = 0; h < 24; h++) {
    porHora[h] = { id: h, label: etiquetaHora(h), tickets: 0, monto: 0 };
  }

  let tickets = 0;
  let monto = 0;
  let conFecha = 0;

  for (const v of ventas || []) {
    const suc = normalizarCodigoTienda(v.sucursal_id);
    if (!suc) continue;
    if (listaTiendas.length && !porTienda[suc] && tiendas) continue;
    if (!porTienda[suc]) {
      porTienda[suc] = { id: suc, label: etiquetaTienda(suc), tickets: 0, monto: 0 };
    }
    const tot = Number(v.total) || 0;
    tickets += 1;
    monto += tot;
    porTienda[suc].tickets += 1;
    porTienda[suc].monto += tot;

    const ymd = ymdNogalesDeIso(v.created_at);
    if (ymd) {
      conFecha += 1;
      if (!porDia[ymd]) porDia[ymd] = { id: ymd, label: ymd.slice(5), tickets: 0, monto: 0 };
      porDia[ymd].tickets += 1;
      porDia[ymd].monto += tot;
    }
    const hora = horaNogalesDeIso(v.created_at);
    if (hora != null && porHora[hora]) {
      porHora[hora].tickets += 1;
      porHora[hora].monto += tot;
    }
  }

  const tiendasOrden = Object.values(porTienda)
    .map((row, i) => ({
      ...row,
      monto: round2(row.monto),
      ticket_promedio: row.tickets > 0 ? round2(row.monto / row.tickets) : 0,
      color: COLORES_TIENDA[i % COLORES_TIENDA.length],
    }))
    .sort((a, b) => b.tickets - a.tickets)
    .map((row, i) => ({ ...row, color: COLORES_TIENDA[i % COLORES_TIENDA.length] }));

  const diasOrden = Object.values(porDia)
    .map((d) => ({ ...d, monto: round2(d.monto) }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const horasOrden = Object.values(porHora).map((h) => ({
    ...h,
    monto: round2(h.monto),
  }));

  const horaPico = [...horasOrden].sort((a, b) => b.tickets - a.tickets)[0] || null;
  const tiendaTop = tiendasOrden[0] || null;
  const diasConTrafico = diasOrden.filter((d) => d.tickets > 0).length || 1;

  return {
    tickets,
    monto: round2(monto),
    ticket_promedio: tickets > 0 ? round2(monto / tickets) : 0,
    tickets_por_dia: round2(tickets / diasConTrafico),
    con_fecha: conFecha,
    hora_pico: horaPico && horaPico.tickets > 0 ? horaPico : null,
    tienda_top: tiendaTop && tiendaTop.tickets > 0 ? tiendaTop : null,
    por_tienda: tiendasOrden,
    por_dia: diasOrden,
    por_hora: horasOrden,
  };
}

/** Pareto de tickets (para barras estilo Estadísticas). */
export function paretoTickets(items, { valueKey = 'tickets', limit = 12 } = {}) {
  const rows = (items || [])
    .filter((x) => (Number(x[valueKey]) || 0) > 0)
    .slice()
    .sort((a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0));
  const sum = rows.reduce((a, x) => a + (Number(x[valueKey]) || 0), 0) || 1;
  let acum = 0;
  return rows.slice(0, limit).map((x, i) => {
    const val = Number(x[valueKey]) || 0;
    acum += val;
    return {
      id: x.id,
      label: x.label,
      total: val,
      monto: round2(x.monto || 0),
      pct: (val / sum) * 100,
      acumPct: (acum / sum) * 100,
      color: x.color || COLORES_TIENDA[i % COLORES_TIENDA.length],
    };
  });
}

/**
 * Carga tickets POS del rango y arma el resumen de tráfico.
 */
export async function cargarTraficoClientes(supabase, { desde, hasta, sucursal = null } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', trafico: null };
  const desdeYmd = acotarDesdeOperativo(desde);
  const hastaYmd = String(hasta || '').slice(0, 10);
  if (!desdeYmd || !hastaYmd) return { ok: false, error: 'Rango de fechas inválido.', trafico: null };

  const tiendas = sucursal
    ? [normalizarCodigoTienda(sucursal)].filter(Boolean)
    : listarSucursalesOperativas();

  const res = await consultarVentasPaginadas(supabase, {
    columns: 'id,total,sucursal_id,created_at,metodo_pago',
    desde: inicioDia(desdeYmd),
    hasta: finDia(hastaYmd),
    sucursal: sucursal || null,
    orderAsc: true,
  });

  if (res.error) return { ok: false, error: res.error, trafico: null };

  const trafico = agregarTraficoClientes(res.data || [], tiendas);
  const avisos = [];
  if (desde && String(desde).slice(0, 10) < FECHA_INICIO_ESTADISTICAS) {
    avisos.push(`Tráfico desde ${FECHA_INICIO_ESTADISTICAS} (arranque operativo).`);
  }
  if (res.sinFecha || res.aviso) {
    avisos.push(res.aviso || 'Sin created_at en ventas: el desglose por hora/día puede ser incompleto.');
  }

  return {
    ok: true,
    trafico,
    avisos,
    n_ventas: (res.data || []).length,
  };
}
