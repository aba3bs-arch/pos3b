/**
 * Clientes máquinas (externos): renta, moneda virtual 60/40, cortes por cliente.
 * Sucursal sintética CE-{slug} aísla Corte Virtual/Garage sin mezclar con tiendas 3B.
 */
import { hoyYmdNogales } from './corteCaja.js';
import { registrarEgresoContVirtual } from './contVirtualEgresos.js';
import { registrarIngresoContVirtual } from './contVirtualIngresos.js';

export const AVISO_FALTA_CLIENTES_MAQUINAS =
  'Ejecuta supabase/fix_clientes_maquinas.sql en Supabase para habilitar Clientes máquinas.';

export const PREFIJO_SUCURSAL_CLIENTE = 'CE-';

const LS_CLIENTES = 'pos3b_clientes_maquinas';
const LS_MONEDA = 'pos3b_clientes_maquinas_moneda';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function faltaTabla(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    msg.includes('clientes_maquinas') ||
    (msg.includes('schema cache') && msg.includes('clientes_maquinas'))
  );
}

function leerLocalClientes() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_CLIENTES) || '[]');
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function guardarLocalClientes(lista) {
  localStorage.setItem(LS_CLIENTES, JSON.stringify(lista || []));
}

function leerLocalMoneda() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_MONEDA) || '[]');
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function guardarLocalMoneda(lista) {
  localStorage.setItem(LS_MONEDA, JSON.stringify(lista || []));
}

export function slugClienteMaquinas(nombre) {
  return String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'cliente';
}

/** Código de sucursal sintético para aislar cortes del cliente. */
export function codigoSucursalClienteMaquinas(cliente) {
  const slug = String(cliente?.slug || slugClienteMaquinas(cliente?.nombre || '')).toUpperCase();
  return `${PREFIJO_SUCURSAL_CLIENTE}${slug}`.slice(0, 40);
}

export function esSucursalClienteMaquinas(codigo) {
  return String(codigo || '').toUpperCase().startsWith(PREFIJO_SUCURSAL_CLIENTE);
}

export function slugDesdeSucursalCliente(codigo) {
  const c = String(codigo || '').toUpperCase();
  if (!c.startsWith(PREFIJO_SUCURSAL_CLIENTE)) return '';
  return c.slice(PREFIJO_SUCURSAL_CLIENTE.length).toLowerCase();
}

/**
 * Moneda virtual:
 * base 10000 → −15% = 8500 → empresa 60% (5100) + cliente 40% (3400).
 */
export function calcularMonedaVirtualCliente({
  montoBase = 10000,
  pctDescuento = 0.15,
  pctEmpresa = 0.6,
  pctCliente = 0.4,
} = {}) {
  const base = round2(montoBase);
  const desc = Number(pctDescuento) || 0;
  const pe = Number(pctEmpresa) || 0;
  const pc = Number(pctCliente) || 0;
  const tras = round2(base * (1 - desc));
  const empresa = round2(tras * pe);
  const cliente = round2(tras * pc);
  return {
    monto_base: base,
    pct_descuento: desc,
    pct_empresa: pe,
    pct_cliente: pc,
    tras_descuento: tras,
    monto_empresa: empresa,
    monto_cliente: cliente,
  };
}

export function fmtMonedaCliente(n) {
  return `$${round2(n).toFixed(2)}`;
}

export async function listarClientesMaquinas(supabase, { soloActivos = true } = {}) {
  if (!supabase) {
    let lista = leerLocalClientes();
    if (soloActivos) lista = lista.filter((c) => c.activo !== false);
    return { data: lista.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')) };
  }

  let q = supabase.from('clientes_maquinas').select('*').order('nombre', { ascending: true });
  if (soloActivos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) {
    if (faltaTabla(error)) {
      let lista = leerLocalClientes();
      if (soloActivos) lista = lista.filter((c) => c.activo !== false);
      return { data: lista, aviso: AVISO_FALTA_CLIENTES_MAQUINAS };
    }
    return { data: [], error: error.message };
  }
  return { data: data || [] };
}

export async function obtenerClienteMaquinas(supabase, idOrSlug) {
  const key = String(idOrSlug || '').trim();
  if (!key) return { data: null, error: 'Cliente inválido.' };
  if (!supabase) {
    const lista = leerLocalClientes();
    const found = lista.find((c) => String(c.id) === key || String(c.slug) === key.toLowerCase());
    return { data: found || null };
  }
  let q = supabase.from('clientes_maquinas').select('*');
  q = key.includes('-') && key.length < 40 && !key.includes(' ')
    ? q.or(`id.eq.${key},slug.eq.${key.toLowerCase()}`)
    : q.eq('id', key);
  const { data, error } = await q.maybeSingle?.() ? await q.limit(1).maybeSingle() : await q.limit(1).single();
  if (error) {
    if (faltaTabla(error)) {
      const lista = leerLocalClientes();
      return { data: lista.find((c) => String(c.id) === key || c.slug === key.toLowerCase()) || null, aviso: AVISO_FALTA_CLIENTES_MAQUINAS };
    }
    // fallback: by slug
    const bySlug = await supabase.from('clientes_maquinas').select('*').eq('slug', key.toLowerCase()).maybeSingle();
    if (!bySlug.error) return { data: bySlug.data };
    return { data: null, error: error.message };
  }
  return { data: data || null };
}

export async function crearClienteMaquinas(supabase, row = {}) {
  const nombre = String(row.nombre || '').trim();
  if (!nombre) return { ok: false, error: 'Indica el nombre del cliente.' };
  let slug = slugClienteMaquinas(row.slug || nombre);
  const payload = {
    slug,
    nombre,
    negocio: String(row.negocio || '').trim() || null,
    contacto: String(row.contacto || '').trim() || null,
    telefono: String(row.telefono || '').trim() || null,
    notas: String(row.notas || '').trim() || null,
    activo: row.activo !== false,
    moneda_base: round2(row.moneda_base ?? 10000),
    pct_descuento: Number(row.pct_descuento ?? 0.15),
    pct_empresa: Number(row.pct_empresa ?? 0.6),
    pct_cliente: Number(row.pct_cliente ?? 0.4),
    updated_at: new Date().toISOString(),
  };

  if (!supabase) {
    const lista = leerLocalClientes();
    if (lista.some((c) => c.slug === slug)) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const item = { ...payload, slug, id: `local-${Date.now()}`, created_at: new Date().toISOString() };
    lista.push(item);
    guardarLocalClientes(lista);
    return { ok: true, data: item, soloLocal: true, aviso: AVISO_FALTA_CLIENTES_MAQUINAS };
  }

  const { data, error } = await supabase.from('clientes_maquinas').insert([payload]).select('*').single();
  if (error) {
    if (faltaTabla(error)) {
      const lista = leerLocalClientes();
      const item = { ...payload, id: `local-${Date.now()}`, created_at: new Date().toISOString() };
      lista.push(item);
      guardarLocalClientes(lista);
      return { ok: true, data: item, soloLocal: true, aviso: AVISO_FALTA_CLIENTES_MAQUINAS };
    }
    if (String(error.message || '').toLowerCase().includes('duplicate') || error.code === '23505') {
      payload.slug = `${slug}-${Date.now().toString(36).slice(-3)}`;
      const r2 = await supabase.from('clientes_maquinas').insert([payload]).select('*').single();
      if (r2.error) return { ok: false, error: r2.error.message };
      return { ok: true, data: r2.data };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

export async function actualizarClienteMaquinas(supabase, id, patch = {}) {
  if (!id) return { ok: false, error: 'Cliente inválido.' };
  const clean = {
    ...patch,
    updated_at: new Date().toISOString(),
  };
  if (clean.nombre != null) clean.nombre = String(clean.nombre).trim();
  if (!supabase || String(id).startsWith('local-')) {
    const lista = leerLocalClientes().map((c) => (String(c.id) === String(id) ? { ...c, ...clean } : c));
    guardarLocalClientes(lista);
    return { ok: true, data: lista.find((c) => String(c.id) === String(id)) };
  }
  const { data, error } = await supabase.from('clientes_maquinas').update(clean).eq('id', id).select('*').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/** Inyecta moneda virtual y registra split en IE VIRTUAL (categoría Clientes). */
export async function inyectarMonedaVirtualCliente(supabase, cliente, { montoBase, notas, user } = {}) {
  if (!cliente?.id) return { ok: false, error: 'Cliente inválido.' };
  const calc = calcularMonedaVirtualCliente({
    montoBase: montoBase ?? cliente.moneda_base ?? 10000,
    pctDescuento: cliente.pct_descuento ?? 0.15,
    pctEmpresa: cliente.pct_empresa ?? 0.6,
    pctCliente: cliente.pct_cliente ?? 0.4,
  });

  const fecha = hoyYmdNogales();
  const suc = codigoSucursalClienteMaquinas(cliente);
  const descBase = `Moneda virtual · ${cliente.nombre}`;

  // Empresa (60% del restante) → egreso/ingreso contable bajo Clientes
  const egresoEmp = await registrarEgresoContVirtual(supabase, {
    sucursal_id: suc,
    fecha,
    categoria_id: 'clientes-maquinas',
    categoria_nombre: 'Clientes máquinas',
    subcategoria_id: cliente.slug,
    subcategoria_nombre: cliente.nombre,
    monto: calc.monto_empresa,
    descripcion: `${descBase} · empresa ${Math.round((cliente.pct_empresa ?? 0.6) * 100)}%`,
    fuente: 'cliente_maquinas_moneda',
    ref_tabla: 'clientes_maquinas_moneda',
    ref_id: null,
    usuario_nombre: user?.nombre || null,
    cuenta: 'virtual',
  });

  const ingresoCli = await registrarIngresoContVirtual(supabase, {
    sucursal_id: suc,
    fecha,
    categoria_id: 'ing-clientes-maquinas',
    categoria_nombre: 'Clientes máquinas',
    subcategoria_id: cliente.slug,
    subcategoria_nombre: cliente.nombre,
    monto: calc.monto_cliente,
    descripcion: `${descBase} · cliente ${Math.round((cliente.pct_cliente ?? 0.4) * 100)}%`,
    fuente: 'cliente_maquinas_moneda',
    ref_tabla: 'clientes_maquinas_moneda',
    usuario_nombre: user?.nombre || null,
    cuenta: 'virtual',
  });

  const row = {
    cliente_id: cliente.id,
    fecha,
    monto_base: calc.monto_base,
    pct_descuento: calc.pct_descuento,
    tras_descuento: calc.tras_descuento,
    monto_empresa: calc.monto_empresa,
    monto_cliente: calc.monto_cliente,
    notas: String(notas || '').trim() || null,
    usuario_nombre: user?.nombre || null,
    ie_egreso_empresa_id: egresoEmp.id || null,
    ie_ingreso_cliente_id: ingresoCli.id || null,
  };

  if (!supabase || String(cliente.id).startsWith('local-')) {
    const id = `local-mon-${Date.now()}`;
    const lista = leerLocalMoneda();
    lista.unshift({ ...row, id, created_at: new Date().toISOString() });
    guardarLocalMoneda(lista);
    return { ok: true, data: { ...row, id }, calc, aviso: !supabase ? AVISO_FALTA_CLIENTES_MAQUINAS : null };
  }

  const { data, error } = await supabase.from('clientes_maquinas_moneda').insert([row]).select('*').single();
  if (error) {
    if (faltaTabla(error)) {
      const id = `local-mon-${Date.now()}`;
      const lista = leerLocalMoneda();
      lista.unshift({ ...row, id, created_at: new Date().toISOString() });
      guardarLocalMoneda(lista);
      return { ok: true, data: { ...row, id }, calc, aviso: AVISO_FALTA_CLIENTES_MAQUINAS };
    }
    return { ok: false, error: error.message, calc };
  }
  return { ok: true, data, calc };
}

export async function listarMonedaCliente(supabase, clienteId, { limite = 50 } = {}) {
  if (!clienteId) return { data: [] };
  if (!supabase || String(clienteId).startsWith('local-')) {
    return {
      data: leerLocalMoneda()
        .filter((m) => String(m.cliente_id) === String(clienteId))
        .slice(0, limite),
    };
  }
  const { data, error } = await supabase
    .from('clientes_maquinas_moneda')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) {
    if (faltaTabla(error)) {
      return {
        data: leerLocalMoneda().filter((m) => String(m.cliente_id) === String(clienteId)).slice(0, limite),
        aviso: AVISO_FALTA_CLIENTES_MAQUINAS,
      };
    }
    return { data: [], error: error.message };
  }
  return { data: data || [] };
}

/** Etiqueta amigable para CE-* en pantallas IE / cortes. */
export function etiquetaSucursalClienteMaquinas(codigo, clientes = []) {
  const slug = slugDesdeSucursalCliente(codigo);
  if (!slug) return null;
  const found = (clientes || []).find((c) => String(c.slug).toLowerCase() === slug);
  return found ? `Cliente · ${found.nombre}` : `Cliente · ${slug}`;
}
