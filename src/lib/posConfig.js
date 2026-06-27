import { sanitizarPrivilegios } from './privilegios.js';

const LS_METODOS_PAGO = 'pos3b_metodos_pago';
const LS_PERIFERICOS = 'pos3b_perifericos';
const LS_IMPRESION = 'pos3b_config_impresion';

export const EVENTO_IMPRESION = 'pos3b-impresion-updated';

export const METODOS_PAGO_BASE = [
  { id: 'efectivo', label: 'Efectivo', tipo: 'efectivo', activo: true, fijo: true },
  { id: 'tarjeta', label: 'Tarjeta', tipo: 'electronico', activo: true, fijo: true },
  { id: 'transferencia', label: 'Transferencia', tipo: 'electronico', activo: true, fijo: true },
  { id: 'qr', label: 'QR', tipo: 'electronico', activo: true, fijo: true },
];

export const TIPOS_PERIFERICO = [
  { id: 'escaner', label: 'Lector / escáner' },
  { id: 'impresora', label: 'Impresora de tickets' },
  { id: 'cajon', label: 'Cajón de dinero' },
  { id: 'terminal', label: 'Terminal bancaria' },
  { id: 'display', label: 'Pantalla cliente' },
  { id: 'otro', label: 'Otro' },
];

export const CONEXIONES_PERIFERICO = [
  { id: 'usb', label: 'USB' },
  { id: 'bluetooth', label: 'Bluetooth' },
  { id: 'red', label: 'Red (Ethernet/Wi‑Fi)' },
  { id: 'serial', label: 'Puerto serial' },
  { id: 'hdmi', label: 'HDMI / video' },
];

function parseJson(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function mergeMetodosPago(guardados) {
  const map = new Map(METODOS_PAGO_BASE.map((m) => [m.id, { ...m }]));
  for (const row of guardados) {
    if (!row?.id) continue;
    const base = map.get(row.id);
    if (base) {
      map.set(row.id, { ...base, activo: row.activo !== false, label: row.label?.trim() || base.label });
    } else if (!row.fijo) {
      map.set(row.id, {
        id: row.id,
        label: String(row.label || 'Otro').trim() || 'Otro',
        tipo: row.tipo === 'efectivo' ? 'efectivo' : 'electronico',
        activo: row.activo !== false,
        fijo: false,
      });
    }
  }
  const baseIds = new Set(METODOS_PAGO_BASE.map((m) => m.id));
  const extras = guardados.filter((r) => r?.id && !baseIds.has(r.id) && !r.fijo);
  for (const row of extras) {
    if (!map.has(row.id)) {
      map.set(row.id, {
        id: row.id,
        label: String(row.label || 'Otro').trim() || 'Otro',
        tipo: row.tipo === 'efectivo' ? 'efectivo' : 'electronico',
        activo: row.activo !== false,
        fijo: false,
      });
    }
  }
  return [...map.values()];
}

export function leerMetodosPago() {
  const guardados = parseJson(localStorage.getItem(LS_METODOS_PAGO), []);
  return mergeMetodosPago(guardados).filter((m) => m.activo);
}

export function leerMetodosPagoTodos() {
  const guardados = parseJson(localStorage.getItem(LS_METODOS_PAGO), []);
  return mergeMetodosPago(guardados);
}

export function guardarMetodosPago(lista) {
  const payload = lista.map(({ id, label, tipo, activo, fijo }) => ({
    id,
    label,
    tipo,
    activo: activo !== false,
    fijo: Boolean(fijo),
  }));
  localStorage.setItem(LS_METODOS_PAGO, JSON.stringify(payload));
}

export function etiquetaMetodoPago(metodo, monedaPago) {
  if (metodo.tipo === 'efectivo') return `Efectivo ${monedaPago}`;
  return metodo.label;
}

export function nuevoIdConfig() {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function leerPerifericos() {
  return parseJson(localStorage.getItem(LS_PERIFERICOS), []);
}

export function guardarPerifericos(lista) {
  localStorage.setItem(LS_PERIFERICOS, JSON.stringify(lista));
}

export function etiquetaTipoPeriferico(tipoId) {
  return TIPOS_PERIFERICO.find((t) => t.id === tipoId)?.label || tipoId;
}

export function etiquetaConexionPeriferico(conexionId) {
  return CONEXIONES_PERIFERICO.find((c) => c.id === conexionId)?.label || conexionId;
}

export const TIPOS_DOCUMENTO_IMPRESION = [
  { id: 'venta', label: 'Ticket de venta' },
  { id: 'pedido_compra', label: 'Orden de compra' },
  { id: 'recepcion_compra', label: 'Recepción de compra' },
  { id: 'inventario', label: 'Inventario / stock' },
  { id: 'movimiento_inventario', label: 'Movimiento de inventario' },
  { id: 'reporte', label: 'Reporte general' },
  { id: 'corte', label: 'Corte de caja' },
];

export const ANCHOS_PAPEL = [
  { id: '80mm', label: 'Ticket 80 mm (térmica)' },
  { id: '58mm', label: 'Ticket 58 mm (térmica)' },
  { id: 'carta', label: 'Carta / A4' },
];

const IMPRESION_DEFAULT = {
  ancho: '80mm',
  autoVenta: true,
  autoCorte: false,
  copias: 1,
  impresoraId: null,
  modos: {
    venta: true,
    pedido_compra: true,
    recepcion_compra: true,
    inventario: true,
    movimiento_inventario: true,
    reporte: true,
    corte: true,
  },
};

export function leerConfigImpresion() {
  try {
    const raw = localStorage.getItem(LS_IMPRESION);
    if (!raw) return { ...IMPRESION_DEFAULT, modos: { ...IMPRESION_DEFAULT.modos } };
    const v = JSON.parse(raw);
    return {
      ...IMPRESION_DEFAULT,
      ...v,
      modos: { ...IMPRESION_DEFAULT.modos, ...(v.modos || {}) },
    };
  } catch {
    return { ...IMPRESION_DEFAULT, modos: { ...IMPRESION_DEFAULT.modos } };
  }
}

export function guardarConfigImpresion(cfg) {
  localStorage.setItem(LS_IMPRESION, JSON.stringify(cfg));
  window.dispatchEvent(new CustomEvent(EVENTO_IMPRESION));
}

export function impresionHabilitada(tipoDoc) {
  const cfg = leerConfigImpresion();
  return cfg.modos?.[tipoDoc] !== false;
}

export function perifericoImpresoraActiva() {
  const cfg = leerConfigImpresion();
  const lista = leerPerifericos().filter((p) => p.activo !== false && p.tipo === 'impresora');
  if (cfg.impresoraId) return lista.find((p) => p.id === cfg.impresoraId) || lista[0] || null;
  return lista.find((p) => p.conectado) || lista[0] || null;
}

const LS_TIPO_CAMBIO = 'pos3b_tipo_cambio';
const LS_AUDIO = 'pos3b_config_audio';
const LS_PRIVILEGIOS = 'pos3b_privilegios';

export const EVENTO_PRIVILEGIOS = 'pos3b-privilegios-updated';
export const EVENTO_TIPO_CAMBIO = 'pos3b-tipo-cambio-updated';

const AUDIO_DEFAULT = { sonidoMenu: true, sonidoEscaneo: true };

export function leerTipoCambio() {
  try {
    const v = parseFloat(localStorage.getItem(LS_TIPO_CAMBIO));
    return Number.isFinite(v) && v > 0 ? v : 17.5;
  } catch {
    return 17.5;
  }
}

export function guardarTipoCambio(valor) {
  const v = Math.max(0.01, parseFloat(valor) || 17.5);
  localStorage.setItem(LS_TIPO_CAMBIO, String(v));
  window.dispatchEvent(new CustomEvent(EVENTO_TIPO_CAMBIO, { detail: v }));
  return v;
}

export function leerConfigAudio() {
  try {
    const raw = localStorage.getItem(LS_AUDIO);
    if (!raw) return { ...AUDIO_DEFAULT };
    return { ...AUDIO_DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...AUDIO_DEFAULT };
  }
}

export function guardarConfigAudio(cfg) {
  const payload = {
    sonidoMenu: cfg.sonidoMenu !== false,
    sonidoEscaneo: cfg.sonidoEscaneo !== false,
  };
  localStorage.setItem(LS_AUDIO, JSON.stringify(payload));
  return payload;
}

/** { porRol, porUsuario, acciones, _updatedAt } */
export function leerPrivilegiosLocal() {
  try {
    const raw = localStorage.getItem(LS_PRIVILEGIOS);
    if (!raw) return sanitizarPrivilegios({ porRol: {}, porUsuario: {}, acciones: {} });
    return sanitizarPrivilegios(JSON.parse(raw));
  } catch {
    return sanitizarPrivilegios({ porRol: {}, porUsuario: {}, acciones: {} });
  }
}

/** Alias usado en toda la app. */
export function leerPrivilegios() {
  return leerPrivilegiosLocal();
}

export function guardarPrivilegiosLocal(data, { silencioso = false } = {}) {
  const payload = sanitizarPrivilegios({
    ...data,
    _updatedAt: data?._updatedAt || new Date().toISOString(),
  });
  localStorage.setItem(LS_PRIVILEGIOS, JSON.stringify(payload));
  if (!silencioso) window.dispatchEvent(new CustomEvent(EVENTO_PRIVILEGIOS));
  return payload;
}

export function guardarPrivilegios(data) {
  return guardarPrivilegiosLocal(data);
}

/** Guarda local y opcionalmente sincroniza a Supabase (todas las cajas). */
export async function persistirPrivilegios(data, supabase) {
  const local = guardarPrivilegiosLocal(data);
  if (!supabase) return { ok: true, local };
  const { subirPrivilegiosANube } = await import('./privilegiosSync.js');
  const remoto = await subirPrivilegiosANube(supabase, local);
  if (remoto.ok && remoto.updated_at) {
    guardarPrivilegiosLocal({ ...local, _updatedAt: remoto.updated_at }, { silencioso: true });
  }
  return { ok: true, local, remoto };
}

export function limpiarPrivilegiosRol(rol) {
  const p = leerPrivilegios();
  delete p.porRol[rol];
  return guardarPrivilegios(p);
}

export function limpiarPrivilegiosUsuario(userId) {
  const p = leerPrivilegios();
  delete p.porUsuario[String(userId)];
  return guardarPrivilegios(p);
}

export const ACCIONES_PRIVILEGIO = [{ id: 'recoleccion_cortes', label: 'Recolección en cortes (Virtual / Abarrotes / Garage)' }];

const LS_VALES_TIENDAS = 'pos3b_vales_tiendas_permitidas';
export const EVENTO_VALES_TIENDAS = 'pos3b-vales-tiendas-updated';

/** null o [] vacío = todas las tiendas pueden generar vales. */
export function leerTiendasValesPermitidas() {
  try {
    const raw = localStorage.getItem(LS_VALES_TIENDAS);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map((c) => String(c).trim().toUpperCase()).filter(Boolean) : null;
  } catch {
    return null;
  }
}

export function guardarTiendasValesPermitidas(codigos) {
  const list = (codigos || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  localStorage.setItem(LS_VALES_TIENDAS, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVENTO_VALES_TIENDAS));
  return list;
}

export function tiendaPuedeGenerarVales(sucursal) {
  const list = leerTiendasValesPermitidas();
  if (!list || !list.length) return true;
  const s = String(sucursal || 'MAIN').trim().toUpperCase();
  return list.includes(s);
}

export function leerAccionPrivilegio(accionId, modo, key) {
  const p = leerPrivilegios();
  const acc = p.acciones?.[accionId] || {};
  const store = modo === 'usuario' ? 'porUsuario' : 'porRol';
  return Boolean(acc[store]?.[key]);
}

export function guardarAccionPrivilegio(accionId, modo, key, activo) {
  const p = leerPrivilegios();
  const acciones = { ...p.acciones };
  const acc = { porRol: {}, porUsuario: {}, ...(acciones[accionId] || {}) };
  const store = modo === 'usuario' ? 'porUsuario' : 'porRol';
  if (activo) acc[store] = { ...acc[store], [key]: true };
  else {
    const next = { ...acc[store] };
    delete next[key];
    acc[store] = next;
  }
  acciones[accionId] = acc;
  return guardarPrivilegios({ ...p, acciones });
}
