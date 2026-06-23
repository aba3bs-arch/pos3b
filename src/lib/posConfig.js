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
