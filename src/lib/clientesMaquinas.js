/**
 * Socio 3B (externos): renta, moneda virtual 60/40, cortes por cliente.
 * Sucursal sintética CE-{slug} aísla Corte Virtual/Garage sin mezclar con tiendas 3B.
 */
import { hoyYmdNogales } from './corteCaja.js';
import { registrarEgresoContVirtual } from './contVirtualEgresos.js';
import { registrarIngresoContVirtual } from './contVirtualIngresos.js';

export const AVISO_FALTA_CLIENTES_MAQUINAS =
  'Ejecuta supabase/fix_clientes_maquinas.sql en Supabase para habilitar Socio 3B.';

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

/**
 * Desglose Socio 3B en cada recolección (ticket + IE).
 * - Virtual: recolección → −15% → Socio 40% / Ganancia 60% → IE VIRTUAL
 * - Garage: base (venta o recolección) → Socio 40% / Ganancia 60% → IE VIRTUAL · Garage
 */
export function calcularPagoClienteRecoleccion({
  modulo = 'virtual',
  venta = 0,
  recoleccion = 0,
  pctDescuento = 0.15,
  pctCliente = 0.4,
  pctEmpresa = 0.6,
} = {}) {
  const mod = String(modulo || 'virtual').toLowerCase();
  const ventaN = round2(venta);
  const recN = round2(recoleccion);
  const pc = Number(pctCliente) || 0.4;
  const pe = Number(pctEmpresa) > 0 ? Number(pctEmpresa) : Math.max(0, round2(1 - pc));
  const desc = Number(pctDescuento) || 0.15;

  if (mod === 'garage') {
    // Garage: sin descuento 15%; 40% socio / 60% ganancia → IE Virtual-Garage
    const base = recN > 0 ? recN : ventaN;
    const pago = round2(base * pc);
    const ganancia = round2(base * pe);
    return {
      modulo: 'garage',
      base,
      base_etiqueta: 'Recolección',
      pct_descuento: 0,
      descuento_monto: 0,
      tras_descuento: base,
      pct_cliente: pc,
      pct_empresa: pe,
      pago_cliente: pago,
      ganancia_empresa: ganancia,
      ie_destino: 'IE VIRTUAL · Garage',
      formula: `Socio 40% / Ganancia 60% de ${fmtMonedaCliente(base)} → IE VIRTUAL · Garage`,
    };
  }

  // Virtual: recolección → −15% → 40% socio / 60% ganancia → IE VIRTUAL
  const base = recN > 0 ? recN : ventaN;
  const descuentoMonto = round2(base * desc);
  const tras = round2(base - descuentoMonto);
  const pago = round2(tras * pc);
  const ganancia = round2(tras * pe);
  return {
    modulo: 'virtual',
    base,
    base_etiqueta: 'Recolección',
    pct_descuento: desc,
    descuento_monto: descuentoMonto,
    tras_descuento: tras,
    pct_cliente: pc,
    pct_empresa: pe,
    pago_cliente: pago,
    ganancia_empresa: ganancia,
    ie_destino: 'IE VIRTUAL',
    formula: `−${Math.round(desc * 100)}% luego Socio 40% / Ganancia 60% → IE VIRTUAL`,
  };
}

/**
 * Pie del ticket Socio 3B:
 * Recolección · Descuento 15% (solo Virtual) · Rec con descuento · Socio 40% · Ganancia 60% · firma.
 */
export function htmlBloquePagoClienteTicket(pago) {
  if (!pago || !(Number(pago.pago_cliente) > 0 || Number(pago.base) > 0)) return '';
  const pct = Math.round((Number(pago.pct_cliente) || 0.4) * 100);
  const pctEmp = Math.round((Number(pago.pct_empresa) || 0.6) * 100);
  const descPct = Math.round((Number(pago.pct_descuento) || 0) * 100);
  const esGarage = String(pago.modulo || '').toLowerCase() === 'garage';
  const ieDestino = pago.ie_destino || (esGarage ? 'IE VIRTUAL · Garage' : 'IE VIRTUAL');

  const lineasVirtual = `
      <tr><td>Recolección</td><td class="r"><strong>${fmtMonedaCliente(pago.base)}</strong></td></tr>
      <tr><td>Descuento ${descPct}%</td><td class="r">${fmtMonedaCliente(pago.descuento_monto ?? round2((pago.base || 0) * (pago.pct_descuento || 0)))}</td></tr>
      <tr><td>Rec con descuento</td><td class="r"><strong>${fmtMonedaCliente(pago.tras_descuento)}</strong></td></tr>
      <tr><td>Socio 3B ${pct}%</td><td class="r"><strong>${fmtMonedaCliente(pago.pago_cliente)}</strong></td></tr>
      <tr><td>Ganancia ${pctEmp}%</td><td class="r"><strong>${fmtMonedaCliente(pago.ganancia_empresa)}</strong></td></tr>`;

  const lineasGarage = `
      <tr><td>Recolección</td><td class="r"><strong>${fmtMonedaCliente(pago.base)}</strong></td></tr>
      <tr><td>Socio 3B ${pct}%</td><td class="r"><strong>${fmtMonedaCliente(pago.pago_cliente)}</strong></td></tr>
      <tr><td>Ganancia ${pctEmp}%</td><td class="r"><strong>${fmtMonedaCliente(pago.ganancia_empresa)}</strong></td></tr>`;

  return `
    <div class="sep"></div>
    <div style="border:3px solid #1d4ed8;padding:10px 8px;background:#eff6ff;margin:10px 0">
      <p style="margin:0 0 8px;font-size:12px;font-weight:900;color:#1d4ed8;text-align:center">DESGLOSE SOCIO 3B</p>
      <table style="margin:0">${esGarage ? lineasGarage : lineasVirtual}</table>
      <p style="margin:8px 0 0;font-size:10px;font-weight:700;color:#334155;text-align:center">
        Ganancia ${pctEmp}% → ${escHtml(ieDestino)}
      </p>
    </div>
    <div style="margin:18px 8px 6px;text-align:center">
      <div style="border-bottom:2px solid #000;height:36px;margin:0 12px"></div>
      <p style="margin:6px 0 0;font-size:11px;font-weight:800">Firma del socio</p>
      <p style="margin:2px 0 0;font-size:9px;color:#475569">Al recolectar · Socio 3B ${pct}%</p>
    </div>`;
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Registra en IE el egreso «Pago cliente» tras recolección de un cliente máquinas. */
export async function registrarPagoClienteRecoleccionIe(supabase, {
  clienteNombre,
  clienteSlug,
  sucursalId,
  pago,
  folio,
  user,
  modulo,
} = {}) {
  const monto = round2(pago?.pago_cliente);
  if (!(monto > 0)) return { ok: true, skipped: true };
  return registrarEgresoContVirtual(supabase, {
    sucursal_id: sucursalId || 'MAIN',
    fecha: hoyYmdNogales(),
    categoria_id: 'clientes-maquinas',
    categoria_nombre: 'Socio 3B',
    subcategoria_id: clienteSlug || 'pago-cliente',
    subcategoria_nombre: clienteNombre || 'Cliente',
    detalle_id: 'pago-recoleccion',
    detalle_nombre: 'Pago cliente recolección',
    monto,
    descripcion: `Pago cliente ${modulo || ''} · ${clienteNombre || '—'} · folio ${folio || '—'} · ${pago?.formula || ''}`.trim(),
    fuente: 'cliente_maquinas_recoleccion',
    ref_tabla: 'cortes_contabilidad_cierres',
    ref_id: folio || null,
    usuario_nombre: user?.nombre || null,
    cuenta: String(modulo || '').toLowerCase() === 'garage' ? 'garage' : 'virtual',
  });
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

/** Baja lógica del cliente (activo=false). Opcionalmente desactiva el usuario vinculado. */
export async function eliminarClienteMaquinas(supabase, cliente, { desactivarUsuario = true } = {}) {
  if (!cliente?.id) return { ok: false, error: 'Cliente inválido.' };
  const id = cliente.id;

  if (desactivarUsuario && cliente.usuario_id && supabase && !String(cliente.usuario_id).startsWith('local-')) {
    await supabase.from('usuarios').update({ activo: false }).eq('id', cliente.usuario_id);
  }

  if (!supabase || String(id).startsWith('local-')) {
    const lista = leerLocalClientes().map((c) =>
      String(c.id) === String(id)
        ? { ...c, activo: false, updated_at: new Date().toISOString() }
        : c,
    );
    guardarLocalClientes(lista);
    return { ok: true, data: lista.find((c) => String(c.id) === String(id)), aviso: !supabase ? AVISO_FALTA_CLIENTES_MAQUINAS : null };
  }

  const { data, error } = await supabase
    .from('clientes_maquinas')
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    if (faltaTabla(error)) {
      const lista = leerLocalClientes().map((c) =>
        String(c.id) === String(id) ? { ...c, activo: false, updated_at: new Date().toISOString() } : c,
      );
      guardarLocalClientes(lista);
      return { ok: true, data: lista.find((c) => String(c.id) === String(id)), aviso: AVISO_FALTA_CLIENTES_MAQUINAS };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

export async function obtenerClientePorUsuarioId(supabase, usuarioId) {
  const uid = String(usuarioId || '').trim();
  if (!uid) return { data: null };
  if (!supabase || uid.startsWith('local-') || uid.startsWith('socio-')) {
    const found = leerLocalClientes().find(
      (c) =>
        (String(c.usuario_id) === uid || String(c.id) === uid.replace(/^socio-/, '')) &&
        c.activo !== false,
    );
    return { data: found || null };
  }
  const { data, error } = await supabase
    .from('clientes_maquinas')
    .select('*')
    .eq('usuario_id', uid)
    .eq('activo', true)
    .limit(1)
    .maybeSingle();
  if (error) {
    if (faltaTabla(error)) {
      const found = leerLocalClientes().find((c) => String(c.usuario_id) === uid && c.activo !== false);
      return { data: found || null, aviso: AVISO_FALTA_CLIENTES_MAQUINAS };
    }
    // Columna usuario_id aún no existe
    if (String(error.message || '').toLowerCase().includes('usuario_id')) {
      return { data: null, aviso: 'Ejecuta supabase/fix_clientes_maquinas_usuario.sql en Supabase.' };
    }
    return { data: null, error: error.message };
  }
  return { data: data || null };
}

/** Resuelve el socio ligado a la sesión (por socio_3b_id o usuario_id). */
export async function obtenerClienteParaSesion(supabase, user) {
  const socioId = String(user?.socio_3b_id || '').trim();
  if (socioId) {
    const r = await obtenerClienteMaquinas(supabase, socioId);
    if (r.data) return r;
  }
  return obtenerClientePorUsuarioId(supabase, user?.id);
}

export function esUsuarioSocio3B(user) {
  if (!user) return false;
  if (user.socio_3b === true || user.excluir_nomina === true) return true;
  if (user.socio_3b_id) return true;
  return String(user?.rol || '').trim().toLowerCase() === 'cliente';
}

/** Usuario de sesión para login con PIN de Socio 3B (sin RH / sin nómina). */
export function usuarioSesionDesdeSocio3B(cliente) {
  if (!cliente?.id) return null;
  return {
    id: cliente.usuario_id || `socio-${cliente.id}`,
    nombre: cliente.nombre || 'Socio 3B',
    rol: 'Cliente',
    sucursal_id: 'MAIN',
    activo: true,
    tipo_empleado: 'socio_3b',
    socio_3b: true,
    socio_3b_id: cliente.id,
    excluir_nomina: true,
    pin: cliente.pin_acceso || null,
  };
}

function normalizarPinAcceso(pin) {
  return String(pin || '').trim().replace(/\s+/g, '');
}

/**
 * Guarda PIN de acceso del socio (Configuración → PIN Socio 3B).
 * No crea usuario RH ni lo mete a nómina.
 */
export async function guardarPinAccesoSocio(supabase, clienteId, pinRaw) {
  if (!clienteId) return { ok: false, error: 'Socio inválido.' };
  const pin = normalizarPinAcceso(pinRaw);
  if (pin && pin.length < 4) return { ok: false, error: 'El PIN debe tener al menos 4 caracteres (o vacío para quitarlo).' };

  if (pin && supabase) {
    const choque = await supabase
      .from('clientes_maquinas')
      .select('id,nombre')
      .eq('pin_acceso', pin)
      .neq('id', clienteId)
      .limit(1)
      .maybeSingle();
    if (!choque.error && choque.data) {
      return { ok: false, error: `Ese PIN ya lo usa el socio «${choque.data.nombre}».` };
    }
    // También no chocar con usuarios MAIN
    try {
      const { pinUsuarioOcupadoEnSucursal } = await import('./usuariosAuth.js');
      const u = await pinUsuarioOcupadoEnSucursal(supabase, pin, 'MAIN');
      if (u.ocupado) {
        return {
          ok: false,
          error: `Ese PIN ya lo usa el empleado «${u.usuario?.nombre || 'usuario'}» en MAIN.`,
        };
      }
    } catch {
      /* ignore */
    }
  }

  const patch = { pin_acceso: pin || null, updated_at: new Date().toISOString() };

  if (!supabase || String(clienteId).startsWith('local-')) {
    const lista = leerLocalClientes().map((c) =>
      String(c.id) === String(clienteId) ? { ...c, ...patch } : c,
    );
    guardarLocalClientes(lista);
    return {
      ok: true,
      data: lista.find((c) => String(c.id) === String(clienteId)),
      aviso: !supabase ? AVISO_FALTA_CLIENTES_MAQUINAS : null,
    };
  }

  const { data, error } = await supabase
    .from('clientes_maquinas')
    .update(patch)
    .eq('id', clienteId)
    .select('*')
    .single();
  if (error) {
    if (String(error.message || '').toLowerCase().includes('pin_acceso')) {
      return {
        ok: false,
        error: 'Falta la columna pin_acceso. Ejecuta supabase/fix_clientes_maquinas_pin.sql en Supabase.',
      };
    }
    if (error.code === '23505' || String(error.message || '').toLowerCase().includes('duplicate')) {
      return { ok: false, error: 'Ese PIN ya está asignado a otro socio.' };
    }
    if (faltaTabla(error)) {
      const lista = leerLocalClientes().map((c) =>
        String(c.id) === String(clienteId) ? { ...c, ...patch } : c,
      );
      guardarLocalClientes(lista);
      return {
        ok: true,
        data: lista.find((c) => String(c.id) === String(clienteId)),
        aviso: AVISO_FALTA_CLIENTES_MAQUINAS,
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

/** Busca socio activo por PIN de acceso (login). */
export async function buscarSocioPorPinAcceso(supabase, pinRaw) {
  const pin = normalizarPinAcceso(pinRaw);
  if (!pin) return { data: null };

  if (!supabase) {
    const found = leerLocalClientes().find(
      (c) => c.activo !== false && normalizarPinAcceso(c.pin_acceso) === pin,
    );
    return { data: found || null };
  }

  const { data, error } = await supabase
    .from('clientes_maquinas')
    .select('*')
    .eq('pin_acceso', pin)
    .eq('activo', true)
    .limit(1)
    .maybeSingle();
  if (error) {
    if (faltaTabla(error)) {
      const found = leerLocalClientes().find(
        (c) => c.activo !== false && normalizarPinAcceso(c.pin_acceso) === pin,
      );
      return { data: found || null, aviso: AVISO_FALTA_CLIENTES_MAQUINAS };
    }
    if (String(error.message || '').toLowerCase().includes('pin_acceso')) {
      return {
        data: null,
        aviso: 'Ejecuta supabase/fix_clientes_maquinas_pin.sql en Supabase para habilitar PIN Socio 3B.',
      };
    }
    return { data: null, error: error.message };
  }
  return { data: data || null };
}

/**
 * Define PIN de acceso del socio (sin crear usuario de nómina/RH).
 * Sustituye el alta con rol Cliente en tabla usuarios.
 */
export async function darAltaUsuarioClienteMaquinas(supabase, cliente, { pin, nombre } = {}) {
  if (!cliente?.id) return { ok: false, error: 'Socio inválido.' };
  const pinStr = normalizarPinAcceso(pin);
  if (pinStr.length < 4) return { ok: false, error: 'El PIN debe tener al menos 4 caracteres.' };
  const nom = String(nombre || cliente.nombre || '').trim();
  if (nom && nom !== cliente.nombre) {
    await actualizarClienteMaquinas(supabase, cliente.id, { nombre: nom });
  }
  const r = await guardarPinAccesoSocio(supabase, cliente.id, pinStr);
  if (!r.ok) return r;
  return {
    ok: true,
    data: usuarioSesionDesdeSocio3B(r.data),
    cliente: r.data,
    aviso: r.aviso || null,
    sinNomina: true,
  };
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
    categoria_nombre: 'Socio 3B',
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
    categoria_nombre: 'Socio 3B',
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
  return found ? `Socio 3B · ${found.nombre}` : `Socio 3B · ${slug}`;
}
