/**
 * Prueba: leer ticket de proveedor → líneas → confirmar en Compras.
 * Para quitar: pon PRUEBA_LEER_TICKET_COMPRA = false o elimina
 * este archivo, ocrTicketCompra.js, ModalLeerTicketCompra.jsx
 * y el botón en Compras.jsx.
 */
import { buscarProductoInventario } from './comprasRecepcion.js';

/** Apaga toda la UI de «Leer ticket» sin borrar código. */
export const PRUEBA_LEER_TICKET_COMPRA = true;

const RE_CODIGO = /\b(\d{8,14})\b/g;
const RE_TOTAL =
  /(?:total|importe|monto|suma|pagar|pagó|pago)\s*[:=]?\s*\$?\s*([\d]{1,3}(?:,\d{3})*(?:\.\d{2})?|[\d]+(?:\.\d{2})?)/i;
const RE_QTY_PRECIO =
  /(?:^|\s)(\d{1,4})\s*[x×*]\s*\$?\s*([\d]+(?:[.,]\d{1,2})?)/i;
const RE_IMPORTE_FINAL = /\$?\s*([\d]{1,3}(?:,\d{3})*(?:\.\d{2})|[\d]+\.\d{2})\s*$/;

function normalizarEspacios(s) {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function parseNumeroMx(raw) {
  let s = String(raw || '').trim().replace(/[^\d.,\-]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    // 1,847.50 → 1847.50
    s = s.replace(/,/g, '');
  } else if (s.includes(',') && !s.includes('.')) {
    // 12,50 → 12.50
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function limpiarDescripcion(s) {
  return normalizarEspacios(s)
    .replace(RE_CODIGO, ' ')
    .replace(RE_QTY_PRECIO, ' ')
    .replace(RE_IMPORTE_FINAL, ' ')
    .replace(/\b\d{1,4}\s+[\d]+(?:[.,]\d{1,2})?\s+[\d]+(?:[.,]\d{1,2})?\b/g, ' ')
    .replace(/\b\d{1,4}\s+[\d]+(?:[.,]\d{1,2})?\b/g, ' ')
    .replace(/\$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * Extrae líneas candidatas y total desde texto OCR / pegado.
 * @returns {{ lineas: Array<{codigo:?string, descripcion:string, qty:number, precio_unit:?number, importe:?number}>, total_ticket:?number, texto:string }}
 */
export function parsearTextoTicket(textoRaw) {
  const texto = String(textoRaw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const lineasRaw = texto
    .split('\n')
    .map(normalizarEspacios)
    .filter((l) => l.length >= 3);

  let total_ticket = null;
  const totalMatch = texto.match(RE_TOTAL);
  if (totalMatch) total_ticket = parseNumeroMx(totalMatch[1]);

  const lineas = [];
  const vistos = new Set();

  for (const linea of lineasRaw) {
    if (/^(total|subtotal|iva|cambio|efectivo|tarjeta|folio|fecha|hora|rfc|vendedor|caja)\b/i.test(linea)) {
      continue;
    }
    if (/total|subtotal|cambio|efectivo|tarjeta/i.test(linea) && !RE_CODIGO.test(linea)) {
      RE_CODIGO.lastIndex = 0;
      continue;
    }
    RE_CODIGO.lastIndex = 0;

    const codigos = [...linea.matchAll(RE_CODIGO)].map((m) => m[1]);
    const codigo = codigos.find((c) => c.length >= 8) || null;
    // Quitar códigos de barras para no confundirlos con cantidades
    const lineaSinCodigos = normalizarEspacios(linea.replace(RE_CODIGO, ' '));

    let qty = 1;
    let precio_unit = null;
    let importe = null;

    const qp = lineaSinCodigos.match(RE_QTY_PRECIO) || linea.match(RE_QTY_PRECIO);
    if (qp) {
      qty = Math.max(1, parseInt(qp[1], 10) || 1);
      precio_unit = parseNumeroMx(qp[2]);
    } else {
      // Patrones: "SABRITAS 45G 10 15.00 150.00" (qty precio importe)
      const nums = [...lineaSinCodigos.matchAll(/(\d+(?:[.,]\d{1,2})?)/g)].map((m) => m[1]);
      if (nums.length >= 2) {
        const last = parseNumeroMx(nums[nums.length - 1]);
        const prev = parseNumeroMx(nums[nums.length - 2]);
        // qty = primer entero corto de la cola (antes de precios con decimales)
        let maybeQty = null;
        for (let i = nums.length - 3; i >= 0; i -= 1) {
          const raw = nums[i];
          if (!/^\d{1,4}$/.test(raw)) continue;
          const n = parseInt(raw, 10);
          if (n > 0 && n <= 9999) {
            maybeQty = n;
            break;
          }
        }
        if (maybeQty == null && /^\d{1,4}$/.test(nums[0])) {
          const n = parseInt(nums[0], 10);
          if (n > 0 && n <= 9999) maybeQty = n;
        }
        if (maybeQty != null) qty = maybeQty;
        if (last != null && prev != null && last >= prev) {
          importe = last;
          precio_unit = prev;
        } else if (last != null) {
          precio_unit = last;
        }
      }
    }

    const importeMatch = lineaSinCodigos.match(RE_IMPORTE_FINAL);
    if (importeMatch && importe == null) importe = parseNumeroMx(importeMatch[1]);

    const descripcion = limpiarDescripcion(linea);
    if (!codigo && descripcion.length < 4) continue;
    if (!codigo && !/\p{L}/u.test(descripcion)) continue;
    // Sin código ni montos: probablemente encabezado (nombre proveedor)
    if (!codigo && precio_unit == null && importe == null && !RE_QTY_PRECIO.test(linea)) {
      continue;
    }

    const key = `${codigo || ''}|${descripcion.toLowerCase()}|${qty}`;
    if (vistos.has(key)) continue;
    vistos.add(key);

    lineas.push({
      codigo: codigo || null,
      descripcion: descripcion || codigo || 'Sin descripción',
      qty,
      precio_unit,
      importe: importe ?? (precio_unit != null ? precio_unit * qty : null),
    });
  }

  // Si no hubo total explícito, suma importes
  if (total_ticket == null && lineas.length) {
    const sum = lineas.reduce((a, l) => a + (Number(l.importe) || 0), 0);
    if (sum > 0) total_ticket = Math.round(sum * 100) / 100;
  }

  return { lineas, total_ticket, texto };
}

/**
 * Cruza líneas OCR con el inventario.
 * @returns {Array<{...linea, match:'ok'|'ambiguo'|'no', producto:?object, candidatos:object[]}>}
 */
export function cruzarLineasConInventario(lineasOcr, inventario) {
  return (lineasOcr || []).map((l) => {
    if (l.codigo) {
      const r = buscarProductoInventario(inventario, l.codigo);
      if (r.producto) {
        return { ...l, match: 'ok', producto: r.producto, candidatos: [r.producto] };
      }
      if (r.ambiguo) {
        return { ...l, match: 'ambiguo', producto: null, candidatos: r.candidatos || [] };
      }
    }

    const nombre = String(l.descripcion || '').trim();
    if (nombre.length >= 4) {
      const r = buscarProductoInventario(inventario, nombre);
      if (r.producto) {
        return { ...l, match: 'ok', producto: r.producto, candidatos: [r.producto], matchPor: 'nombre' };
      }
      if (r.ambiguo) {
        return { ...l, match: 'ambiguo', producto: null, candidatos: r.candidatos || [], matchPor: 'nombre' };
      }
    }

    return { ...l, match: 'no', producto: null, candidatos: [] };
  });
}

/**
 * Aplica líneas confirmadas a las filas de Compras.
 * @param {'recepcion'|'entrega'} modo
 */
export function aplicarLineasTicketACompras(lineasActuales, lineasConfirmadas, modo) {
  const next = [...(lineasActuales || [])];
  const campoQty = modo === 'entrega' ? 'qty_pedido' : 'qty_recibido';
  let aplicadas = 0;
  const omitidas = [];

  for (const l of lineasConfirmadas || []) {
    const producto = l.producto;
    if (!producto?.id) {
      omitidas.push(l.descripcion || l.codigo || '?');
      continue;
    }
    const qty = Math.max(0, Math.round(Number(l.qty) || 0));
    if (!qty) {
      omitidas.push(producto.nombre || producto.id);
      continue;
    }

    const idx = next.findIndex((x) => String(x.id) === String(producto.id));
    const costo = Number(l.precio_unit);
    if (idx >= 0) {
      const patch = { [campoQty]: qty };
      if (Number.isFinite(costo) && costo > 0) patch.costo_est = costo;
      next[idx] = { ...next[idx], ...patch };
    } else {
      next.push({
        id: producto.id,
        nombre: producto.nombre || l.descripcion || producto.id,
        precio: Number(producto.precio) || 0,
        teorico: Number(producto.stock) || 0,
        sugerido: 0,
        vendido14: 0,
        costo_est: Number.isFinite(costo) && costo > 0 ? costo : 0,
        qty_pedido: modo === 'entrega' ? qty : 0,
        qty_recibido: modo === 'recepcion' ? qty : 0,
      });
    }
    aplicadas += 1;
  }

  return { lineas: next, aplicadas, omitidas };
}
