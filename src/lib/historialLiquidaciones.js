import { esCreditoCobrado } from './recoleccionTipos.js';

const TIPOS_MERCANCIA = new Set(['Recolección', 'Entrega Crédito', 'Cobro Crédito', 'Venta Ruta']);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function tiendaDe(m) {
  return String(m.sucursal_origen || 'Sin tienda').trim() || 'Sin tienda';
}

/**
 * Agrupa filas selladas de transito_efectivo en liquidaciones.
 * Una liquidación = mismo `fecha_liquidacion` + mismo recolector (se sella en un solo lote).
 * Los gastos aplicados llevan el mismo sello y se restan del total; los cobros de servicio no entran
 * (se liquidan en RC Servicios).
 */
export function agruparLiquidaciones(rows) {
  const grupos = new Map();
  for (const m of rows || []) {
    if (!m?.fecha_liquidacion) continue;
    const esGasto = m.tipo_movimiento === 'Gasto';
    if (!esGasto && !TIPOS_MERCANCIA.has(m.tipo_movimiento)) continue;
    const key = `${m.fecha_liquidacion}|${m.repartidor_id || ''}`;
    if (!grupos.has(key)) {
      grupos.set(key, {
        key,
        fecha: m.fecha_liquidacion,
        repartidorId: m.repartidor_id || null,
        repartidorNombre: m.repartidores?.nombre || '',
        adminNombre: '',
        creditos: [],
        efectivo: [],
        gastos: [],
      });
    }
    const g = grupos.get(key);
    if (!g.repartidorNombre && m.repartidores?.nombre) g.repartidorNombre = m.repartidores.nombre;
    if (esGasto) {
      g.gastos.push(m);
      continue;
    }
    if (!g.adminNombre && m.usuario_liquida) g.adminNombre = m.usuario_liquida;
    (esCreditoCobrado(m) ? g.creditos : g.efectivo).push(m);
  }

  const suma = (items) => r2(items.reduce((a, m) => a + Number(m.monto || 0), 0));
  return [...grupos.values()]
    .filter((g) => g.creditos.length || g.efectivo.length)
    .map((g) => {
      const totalCreditos = suma(g.creditos);
      const totalEfectivo = suma(g.efectivo);
      const totalGastos = suma(g.gastos);
      const bruto = r2(totalCreditos + totalEfectivo);
      const porTienda = new Map();
      for (const m of [...g.creditos, ...g.efectivo]) {
        const t = tiendaDe(m);
        if (!porTienda.has(t)) porTienda.set(t, { tienda: t, creditos: 0, efectivo: 0, count: 0 });
        const row = porTienda.get(t);
        row[esCreditoCobrado(m) ? 'creditos' : 'efectivo'] = r2(row[esCreditoCobrado(m) ? 'creditos' : 'efectivo'] + Number(m.monto || 0));
        row.count += 1;
      }
      return {
        ...g,
        totalCreditos,
        totalEfectivo,
        totalGastos,
        bruto,
        neto: Math.max(0, r2(bruto - totalGastos)),
        count: g.creditos.length + g.efectivo.length,
        tiendas: [...porTienda.values()].sort((a, b) => b.creditos + b.efectivo - (a.creditos + a.efectivo)),
      };
    })
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

/**
 * Saldo de créditos por cobrar en un instante (cargos − abonos con created_at <= instante).
 * Misma regla que `saldosCxcPorCliente`. Sin instante → saldo actual.
 */
export function saldoCxcEn(movs, iso = null) {
  const limite = iso ? new Date(iso).getTime() : Infinity;
  let saldo = 0;
  for (const m of movs || []) {
    const t = m.created_at ? new Date(m.created_at).getTime() : 0;
    if (t > limite) continue;
    const monto = Number(m.monto) || 0;
    if (m.tipo === 'cargo') saldo += monto;
    else if (m.tipo === 'ajuste') saldo += monto;
    else if (m.tipo === 'abono') saldo -= monto;
  }
  return Math.max(0, r2(saldo));
}

/**
 * Agrega a cada liquidación el estado de créditos al momento de sellar:
 * quedan = saldo por cobrar después de lo cobrado; creditoTotal = quedan + cobrado.
 */
export function enriquecerConSaldoCxc(liquidaciones, movsCxc) {
  return (liquidaciones || []).map((l) => {
    const quedan = movsCxc ? saldoCxcEn(movsCxc, l.fecha) : null;
    return {
      ...l,
      creditoQuedan: quedan,
      creditoTotal: quedan == null ? null : r2(quedan + l.totalCreditos),
    };
  });
}

const COLS_LIQ =
  'id, sucursal_origen, repartidor_id, repartidores(nombre), monto, fecha_hora, num_traspaso, tipo_movimiento, descripcion_gasto, estatus, fecha_liquidacion, usuario_liquida';
const PAGINA = 1000;
const MAX_PAGINAS = 15;
const TZ_OFFSET = '-07:00';

async function leerPaginas(armarConsulta) {
  const out = [];
  for (let p = 0; p < MAX_PAGINAS; p += 1) {
    const { data, error } = await armarConsulta().range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw error;
    out.push(...(data || []));
    if ((data || []).length < PAGINA) break;
  }
  return out;
}

/** Filas selladas (movimientos + gastos aplicados) de todos los recolectores en el periodo. */
export async function listarFilasLiquidadasGlobal(supabase, { desde, hasta } = {}) {
  return leerPaginas(() => {
    let q = supabase
      .from('transito_efectivo')
      .select(COLS_LIQ)
      .not('fecha_liquidacion', 'is', null)
      .order('fecha_liquidacion', { ascending: false });
    if (desde) q = q.gte('fecha_liquidacion', `${desde}T00:00:00${TZ_OFFSET}`);
    if (hasta) q = q.lte('fecha_liquidacion', `${hasta}T23:59:59.999${TZ_OFFSET}`);
    return q;
  });
}

/** Última liquidación sellada (sin importar el filtro de periodo). */
export async function listarUltimaLiquidacionGlobal(supabase) {
  const { data, error } = await supabase
    .from('transito_efectivo')
    .select('fecha_liquidacion, repartidor_id')
    .eq('estatus', 'Liquidado')
    .not('fecha_liquidacion', 'is', null)
    .order('fecha_liquidacion', { ascending: false })
    .limit(1);
  if (error) throw error;
  const ref = data?.[0];
  if (!ref) return null;
  let q = supabase
    .from('transito_efectivo')
    .select(COLS_LIQ)
    .eq('fecha_liquidacion', ref.fecha_liquidacion);
  q = ref.repartidor_id ? q.eq('repartidor_id', ref.repartidor_id) : q.is('repartidor_id', null);
  const { data: rows, error: e2 } = await q;
  if (e2) throw e2;
  return agruparLiquidaciones(rows || [])[0] || null;
}

/** Cargos / abonos / ajustes de CxC (solo columnas necesarias para saldos). */
export async function listarMovimientosCxcParaSaldo(supabase) {
  return leerPaginas(() =>
    supabase
      .from('ruta_cxc_movimientos')
      .select('tipo, monto, created_at')
      .order('created_at', { ascending: true }),
  );
}
