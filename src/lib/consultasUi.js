/** Helpers de presentación para Consultas (estilo listado SoftRestaurant). */

export function inicialesNombre(nombre) {
  const parts = String(nombre || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

/** Color estable por nombre (avatar). */
export function colorAvatar(nombre) {
  const palette = ['#7c3aed', '#2563eb', '#059669', '#db2777', '#d97706', '#0891b2', '#4f46e5'];
  const s = String(nombre || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/** Folio numérico estable a partir de un UUID/id. */
export function folioNumerico(id, digitos = 5) {
  const raw = String(id || '').replace(/[^a-fA-F0-9]/g, '');
  if (!raw) return '—';
  const hex = raw.slice(-8) || raw;
  const n = parseInt(hex, 16);
  if (!Number.isFinite(n)) return String(id).slice(0, digitos);
  const mod = 10 ** digitos;
  return String(n % mod).padStart(digitos, '0');
}

export function fmtMonto(n) {
  const v = Number(n) || 0;
  return `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtFechaCorta(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function fmtRangoFechas(desde, hasta) {
  const a = String(desde || '').slice(0, 10);
  const b = String(hasta || '').slice(0, 10);
  if (!a || !b) return '';
  const [ay, am, ad] = a.split('-');
  const [by, bm, bd] = b.split('-');
  return `${ad}/${am}/${ay}-${bd}/${bm}/${by}`;
}

function precioDeLinea(m, precioPorId) {
  if (m.subtotal != null && Number(m.cantidad)) return Number(m.subtotal) / Number(m.cantidad);
  if (m.precio != null) return Number(m.precio) || 0;
  const p = precioPorId?.get(String(m.producto_id));
  return Number(p) || 0;
}

function valorMovimiento(m, precioPorId) {
  if (m.subtotal != null && Number.isFinite(Number(m.subtotal)) && Number(m.subtotal) !== 0) {
    return Math.abs(Number(m.subtotal));
  }
  const qty = Math.abs(Number(m.cantidad) || 0);
  const unit = precioDeLinea(m, precioPorId);
  if (unit > 0) return qty * unit;
  // Fallback: si no hay precio, al menos cuenta unidades como $1 para no quedar en cero visual.
  return 0;
}

function tituloDocumentoInv(m) {
  // Consultas · Inventarios: verificar operaciones por ticket
  if (m.modo === 'venta' || m.origen === 'ventas' || m.tipo === 'venta') return 'Egreso por venta';
  if (m.modo === 'compra' || m.origen === 'compras') return 'Ingreso de inventario';
  if (m.tipo === 'entrada' && (m.modo === 'masivo' || m.modo === 'libre' || !m.modo)) return 'Ingreso de inventario';
  if (m.modo === 'conteo_departamento' || m.modo === 'vaciado_inventario' || m.tipo === 'ajuste') {
    return 'Ajuste de inventario';
  }
  if (m.tipo === 'traspaso' || m.modo === 'ubicacion') return 'Traspaso de inventario';
  if (m.modo === 'cancelacion' || m.origen === 'cancelaciones') return 'Cancelación';
  if (m.tipo === 'cambio_precio') return 'Cambio de precio';
  if (m.tipo === 'retiro' && m.modo === 'venta') return 'Egreso por venta';
  if (m.tipo === 'retiro') return 'Retiro de inventario';
  if (m.tipo === 'entrada') return 'Ingreso de inventario';
  return 'Movimiento de inventario';
}

/**
 * Agrupa líneas de movimiento en documentos estilo SoftRestaurant
 * (Ingreso/Ajuste/Venta/Cancelación con folio, diferencia +/- y total).
 * Incluye TODOS los movimientos de inventario del POS.
 */
export function agruparDocumentosInventario(movimientos, opts = {}) {
  const { precioPorId = new Map() } = opts;
  const map = new Map();

  for (const m of movimientos || []) {
    const esVenta = m.modo === 'venta' || m.origen === 'ventas' || m.tipo === 'venta';
    const folio =
      m.folio ||
      m.meta?.folio ||
      (esVenta
        ? folioNumerico(String(m.id).replace(/^venta_/, '').split('_')[0], 5)
        : m.origen === 'compras' || m.modo === 'compra'
          ? folioNumerico(String(m.id).replace(/^compra_/, '').split('_')[0], 5)
          : m.origen === 'cancelaciones' || m.modo === 'cancelacion'
            ? folioNumerico(String(m.id).replace(/^cancel_/, '').split('_')[0], 5)
            : folioNumerico(m.cloudId || m.id, 5));

    const titulo = tituloDocumentoInv(m);
    const usuario = m.usuario || '—';
    const t = new Date(m.created_at || 0).getTime();
    const bucket = Math.floor(t / 180000); // 3 min
    const key =
      m.folio || m.meta?.folio
        ? `folio:${m.folio || m.meta.folio}`
        : esVenta
          ? `venta:${String(m.id).replace(/^venta_/, '').split('_')[0]}`
          : m.origen === 'compras' || m.modo === 'compra'
            ? `compra:${String(m.id).replace(/^compra_/, '').split('_')[0]}`
            : m.origen === 'cancelaciones' || m.modo === 'cancelacion'
              ? `cancel:${String(m.id).replace(/^cancel_/, '').split('_')[0]}`
              : `${titulo}|${usuario}|${bucket}|${m.sucursal || ''}`;

    if (!map.has(key)) {
      map.set(key, {
        id: key,
        titulo,
        folio,
        usuario,
        created_at: m.created_at,
        sucursal: m.sucursal,
        difNeg: 0,
        difPos: 0,
        lineas: [],
      });
    }
    const doc = map.get(key);
    if (new Date(m.created_at || 0) > new Date(doc.created_at || 0)) doc.created_at = m.created_at;
    const valor = valorMovimiento(m, precioPorId);
    const esEntrada =
      m.tipo === 'entrada' ||
      m.modo === 'cancelacion' ||
      m.modo === 'compra' ||
      m.origen === 'compras' ||
      (m.tipo === 'traspaso' && Number(m.stock_despues) > Number(m.stock_antes));
    const esSalida =
      esVenta ||
      m.tipo === 'retiro' ||
      (m.tipo === 'traspaso' && Number(m.stock_despues) < Number(m.stock_antes)) ||
      (m.modo === 'conteo_departamento' && Number(m.stock_despues) < Number(m.stock_antes));

    if (esEntrada && !esSalida) doc.difPos += valor;
    else if (esSalida) doc.difNeg += valor;
    else if (m.tipo === 'cambio_precio') {
      const delta = (Number(m.precio_despues) || 0) - (Number(m.precio_antes) || 0);
      if (delta >= 0) doc.difPos += Math.abs(delta);
      else doc.difNeg += Math.abs(delta);
    } else {
      doc.difPos += valor;
    }
    doc.lineas.push(m);
  }

  return [...map.values()]
    .map((d) => {
      const total = d.difPos - d.difNeg;
      return {
        ...d,
        difNeg: Math.round(d.difNeg * 100) / 100,
        difPos: Math.round(d.difPos * 100) / 100,
        total: Math.round(total * 100) / 100,
        label: `${d.titulo} - ${d.folio}`,
      };
    })
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}
