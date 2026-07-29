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

function articulosDeVentaNorm(venta) {
  let a = venta?.articulos;
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a);
    } catch {
      a = [];
    }
  }
  return Array.isArray(a) ? a : [];
}

/**
 * Consolida ventas del periodo por artículo (código).
 * @returns {{ filas: Array, totalPiezas: number, totalImporte: number, tickets: number }}
 */
export function agruparVentaPorArticulo(ventas = [], opts = {}) {
  const { productoPorId = new Map() } = opts;
  const map = new Map();
  let ticketsConArts = 0;

  for (const v of ventas || []) {
    const arts = articulosDeVentaNorm(v);
    if (!arts.length) continue;
    ticketsConArts += 1;
    const vistosEnTicket = new Set();
    for (const a of arts) {
      const id = String(a.id ?? a.codigo ?? a.producto_id ?? '').trim();
      if (!id) continue;
      const piezas = Number(a.qty ?? a.cantidad ?? 1) || 1;
      const precio = Number(a.precio) || 0;
      const importe = Number(a.importe ?? a.subtotal);
      const lineImp = Number.isFinite(importe) && importe !== 0 ? importe : precio * piezas;
      const cat = productoPorId.get(id);
      const nombre = a.nombre || a.descripcion || cat?.nombre || id;
      const departamento = String(a.cat || a.departamento || cat?.cat || 'GENERAL')
        .trim()
        .toUpperCase() || 'GENERAL';
      if (!map.has(id)) {
        map.set(id, {
          id,
          nombre,
          departamento,
          piezas: 0,
          importe: 0,
          tickets: 0,
          precioPromedio: 0,
        });
      }
      const row = map.get(id);
      row.piezas += piezas;
      row.importe += lineImp;
      if (!vistosEnTicket.has(id)) {
        row.tickets += 1;
        vistosEnTicket.add(id);
      }
      if (cat?.nombre && (!row.nombre || row.nombre === id)) row.nombre = cat.nombre;
      if (cat?.cat) row.departamento = String(cat.cat).trim().toUpperCase() || row.departamento;
    }
  }

  const filas = [...map.values()]
    .map((r) => ({
      ...r,
      piezas: Math.round(r.piezas * 1000) / 1000,
      importe: Math.round(r.importe * 100) / 100,
      precioPromedio: r.piezas > 0 ? Math.round((r.importe / r.piezas) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.importe - a.importe || b.piezas - a.piezas);

  const totalPiezas = filas.reduce((s, r) => s + r.piezas, 0);
  const totalImporte = filas.reduce((s, r) => s + r.importe, 0);
  return {
    filas: filas.map((r) => ({
      ...r,
      pct: totalImporte > 0 ? Math.round((r.importe / totalImporte) * 10000) / 100 : 0,
    })),
    totalPiezas: Math.round(totalPiezas * 1000) / 1000,
    totalImporte: Math.round(totalImporte * 100) / 100,
    tickets: ticketsConArts,
    skus: filas.length,
  };
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
  // Consultas · Inventarios: operaciones de almacén (sin egresos por venta)
  if (m.modo === 'compra' || m.origen === 'compras') return 'Ingreso de inventario';
  if (m.tipo === 'entrada' && (m.modo === 'masivo' || m.modo === 'libre' || !m.modo)) return 'Ingreso de inventario';
  if (m.modo === 'conteo_departamento' || m.modo === 'vaciado_inventario' || m.tipo === 'ajuste') {
    return 'Ajuste de inventario';
  }
  if (m.tipo === 'traspaso' || m.modo === 'ubicacion') return 'Traspaso de inventario';
  if (m.modo === 'cancelacion' || m.origen === 'cancelaciones') return 'Cancelación';
  if (m.tipo === 'cambio_precio') return 'Cambio de precio';
  if (m.tipo === 'retiro') return 'Retiro de inventario';
  if (m.tipo === 'entrada') return 'Ingreso de inventario';
  return 'Movimiento de inventario';
}

function esMovimientoVenta(m) {
  return (
    m?.modo === 'venta' ||
    m?.origen === 'ventas' ||
    m?.tipo === 'venta' ||
    (m?.tipo === 'retiro' && m?.modo === 'venta')
  );
}

/**
 * Agrupa líneas de movimiento en documentos estilo SoftRestaurant.
 * Por defecto NO incluye egresos por venta (van en la pestaña Ventas).
 */
export function agruparDocumentosInventario(movimientos, opts = {}) {
  const { precioPorId = new Map(), incluirVentas = false } = opts;
  const map = new Map();

  for (const m of movimientos || []) {
    const esVenta = esMovimientoVenta(m);
    if (esVenta && !incluirVentas) continue;

    const esTraspaso = m.tipo === 'traspaso' || m.modo === 'ubicacion';
    const folioRaw = m.folio || m.meta?.folio || null;
    const folio =
      folioRaw ||
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
    const rutaOrigen = m.traspaso_origen || m.meta?.traspaso_origen || null;
    const rutaDestino = m.traspaso_destino || m.meta?.traspaso_destino || null;
    const key =
      folioRaw
        ? `folio:${folioRaw}`
        : esTraspaso
          ? `trp:${usuario}|${bucket}|${m.sucursal_origen || m.meta?.sucursal_origen || ''}|${m.sucursal_destino || m.meta?.sucursal_destino || ''}|${m.ubicacion_origen || ''}|${m.ubicacion_destino || ''}|${m.subtipo || ''}`
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
        esTraspaso,
        traspaso_origen: rutaOrigen,
        traspaso_destino: rutaDestino,
        sucursal_origen: m.sucursal_origen || m.meta?.sucursal_origen || null,
        sucursal_destino: m.sucursal_destino || m.meta?.sucursal_destino || null,
        difNeg: 0,
        difPos: 0,
        lineas: [],
      });
    }
    const doc = map.get(key);
    if (new Date(m.created_at || 0) > new Date(doc.created_at || 0)) doc.created_at = m.created_at;
    if (!doc.traspaso_origen && rutaOrigen) doc.traspaso_origen = rutaOrigen;
    if (!doc.traspaso_destino && rutaDestino) doc.traspaso_destino = rutaDestino;
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
      const ruta =
        d.esTraspaso && d.traspaso_origen && d.traspaso_destino
          ? `${d.traspaso_origen} → ${d.traspaso_destino}`
          : null;
      return {
        ...d,
        ruta,
        difNeg: Math.round(d.difNeg * 100) / 100,
        difPos: Math.round(d.difPos * 100) / 100,
        total: Math.round(total * 100) / 100,
        label: ruta ? `${d.titulo} - ${d.folio} · ${ruta}` : `${d.titulo} - ${d.folio}`,
      };
    })
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}
