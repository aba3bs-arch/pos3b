import { etiquetaTienda, listarSucursalesOperativas } from '../constants/sucursales.js';

export const MODULOS_GASTO = ['virtual', 'abarrotes', 'garage'];

export const ETIQUETA_MODULO_GASTO = {
  virtual: 'Virtual',
  abarrotes: 'Abarrotes',
  garage: 'Garage',
};

const CAMPOS_GASTO =
  'id, sucursal_id, modulo, categoria, subcategoria, comentario, monto, usuario_id, usuario_nombre, created_at, estado_aprobacion, descontado_nomina';

function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtFechaCorta(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX');
}

function fmtMonto(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

/** Normaliza un gasto de corte a fila de reporte. */
export function filaReporteGasto(g) {
  const nombre = String(g.comentario || '').trim() || String(g.subcategoria || '').trim() || String(g.categoria || '').trim() || '—';
  const partesConcepto = [g.categoria, g.subcategoria].map((x) => String(x || '').trim()).filter(Boolean);
  const concepto = partesConcepto.join(' · ') || '—';
  return {
    id: g.id,
    tienda_id: g.sucursal_id || 'MAIN',
    tienda: etiquetaTienda(g.sucursal_id),
    modulo: g.modulo || '—',
    modulo_label: ETIQUETA_MODULO_GASTO[g.modulo] || g.modulo || '—',
    empleado: String(g.usuario_nombre || '').trim() || '—',
    usuario_id: g.usuario_id || null,
    fecha: g.created_at,
    fecha_texto: fmtFecha(g.created_at),
    fecha_corta: fmtFechaCorta(g.created_at),
    nombre,
    cantidad: 1,
    monto: Number(g.monto) || 0,
    concepto,
    estado: g.estado_aprobacion || 'aprobado',
    descontado_nomina: Boolean(g.descontado_nomina),
  };
}

/** Lista gastos detallados de cortes contabilidad en un rango. */
export async function cargarGastosDetalle(supabase, { desde, hasta, sucursal = '', modulo = '', empleado = '', soloAprobados = true } = {}) {
  if (!supabase) return { filas: [], error: 'Sin conexión.' };

  const ini = `${desde}T00:00:00`;
  const fin = `${hasta}T23:59:59`;

  let q = supabase
    .from('cortes_contabilidad_gastos')
    .select(CAMPOS_GASTO)
    .gte('created_at', ini)
    .lte('created_at', fin)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (sucursal) q = q.eq('sucursal_id', sucursal);
  if (modulo) q = q.eq('modulo', modulo);

  const { data, error } = await q;
  if (error) {
    if (error.code === '42P01') return { filas: [], error: null, aviso: 'Tabla cortes_contabilidad_gastos no disponible.' };
    const msg = String(error.message || '');
    if (msg.includes('descontado_nomina') || msg.includes('estado_aprobacion')) {
      let q2 = supabase
        .from('cortes_contabilidad_gastos')
        .select(
          'id, sucursal_id, modulo, categoria, subcategoria, comentario, monto, usuario_id, usuario_nombre, created_at',
        )
        .gte('created_at', ini)
        .lte('created_at', fin)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (sucursal) q2 = q2.eq('sucursal_id', sucursal);
      if (modulo) q2 = q2.eq('modulo', modulo);
      const { data: d2, error: e2 } = await q2;
      if (e2) return { filas: [], error: e2.message };
      let filas = (d2 || []).map((g) => filaReporteGasto({ ...g, estado_aprobacion: 'aprobado', descontado_nomina: false }));
      if (empleado) {
        const qEmp = empleado.trim().toLowerCase();
        filas = filas.filter((f) => f.empleado.toLowerCase().includes(qEmp));
      }
      return { filas, error: null };
    }
    return { filas: [], error: error.message };
  }

  let filas = (data || []).map(filaReporteGasto);
  if (soloAprobados) filas = filas.filter((f) => f.estado === 'aprobado');
  if (empleado) {
    const qEmp = empleado.trim().toLowerCase();
    filas = filas.filter((f) => f.empleado.toLowerCase().includes(qEmp));
  }

  return { filas, error: null };
}

export function totalMontoFilas(filas) {
  return (filas || []).reduce((a, f) => a + (Number(f.monto) || 0), 0);
}

/** Agrupa filas por tienda con subtotales. */
export function agruparPorTienda(filas) {
  const map = {};
  for (const f of filas || []) {
    const k = f.tienda_id || 'MAIN';
    if (!map[k]) map[k] = { id: k, label: f.tienda, filas: [], total: 0 };
    map[k].filas.push(f);
    map[k].total += Number(f.monto) || 0;
  }
  return Object.values(map).sort((a, b) => b.total - a.total);
}

/** Agrupa filas por empleado con subtotales. */
export function agruparPorEmpleado(filas) {
  const map = {};
  for (const f of filas || []) {
    const k = f.empleado || '—';
    if (!map[k]) map[k] = { id: k, label: k, filas: [], total: 0 };
    map[k].filas.push(f);
    map[k].total += Number(f.monto) || 0;
  }
  return Object.values(map).sort((a, b) => b.total - a.total);
}

export function empleadosUnicos(filas) {
  const set = new Set();
  for (const f of filas || []) {
    if (f.empleado && f.empleado !== '—') set.add(f.empleado);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

export function columnasCsvGastos() {
  return [
    { label: 'tienda', value: (f) => f.tienda },
    { label: 'modulo', value: (f) => f.modulo_label },
    { label: 'empleado', value: (f) => f.empleado },
    { label: 'fecha', value: (f) => f.fecha_texto },
    { label: 'nombre', value: (f) => f.nombre },
    { label: 'cantidad', value: (f) => f.cantidad },
    { label: 'monto', value: (f) => f.monto },
    { label: 'concepto', value: (f) => f.concepto },
    { label: 'descontado_nomina', value: (f) => (f.descontado_nomina ? 'si' : 'no') },
  ];
}

export function tiendasFiltroGastos() {
  return listarSucursalesOperativas();
}

export { fmtMonto };
