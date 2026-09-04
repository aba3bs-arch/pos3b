/**
 * Sustento de inventario para gastos Smoking en Corte Abarrotes.
 * Evita gastos “fantasma” (mismo monto varias veces sin ingreso real).
 *
 * Folios aceptados (los que ve el operador):
 * - ING-YYYYMMDD-####  → entrega directa / ingreso ligado a compra (notas)
 * - CMP-XXXXXXXX       → recepción de compra
 * - trp-XXXX           → traspaso recibido en la tienda
 * - UUID de compra     → legacy (historial)
 */
import { etiquetaTienda, normalizarCodigoTienda } from '../../constants/sucursales.js';
import { folioDesdeCompraId } from '../inventarioMovimientos.js';
import { normalizarNombreProveedorClave, nombreProveedorDesdeGasto } from '../proveedorEntregas.js';

export const MARKER_SMOK_INV = 'SMOK_INV:';
/** Marcador del intento anterior (sigue contando como “ya usado”). */
export const MARKER_TICKET_INV_LEGACY = 'TICKET_INV:';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function fmtMonto(n) {
  return `$${round2(n).toFixed(2)}`;
}

export function parseFoliosInventarioSmoking(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))];
  }
  if (raw == null) return [];
  return [
    ...new Set(
      String(raw)
        .split(/[\s,;\n]+/g)
        .map((x) => String(x || '').trim())
        .filter(Boolean),
    ),
  ];
}

export function normalizarFolioSustentoSmoking(raw) {
  const s0 = String(raw || '').trim();
  if (!s0) return '';
  const s = s0.replace(/\s+/g, '');
  // trp-0020
  const mTrp = s.match(/^trp-?(\d+)$/i);
  if (mTrp) {
    const digits = mTrp[1];
    const ancho = digits.length <= 4 ? 4 : digits.length;
    return `trp-${digits.padStart(ancho, '0')}`;
  }
  // ING- / CMP- / RET-
  if (/^(ING|CMP|RET)-/i.test(s)) return s.toUpperCase();
  // UUID compra
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return s.toLowerCase();
  }
  // Prefijo corto de UUID (8+ hex) → se resuelve contra compras
  if (/^[0-9a-f]{8,32}$/i.test(s) && !/^(ing|cmp|ret|trp)/i.test(s)) {
    return s.toLowerCase();
  }
  return s.toUpperCase();
}

export function esProveedorSmokingGasto(gasto) {
  const sub = gasto?.subcategoria || '';
  const com = gasto?.comentario || '';
  const cat = gasto?.categoria || '';
  const prov1 = nombreProveedorDesdeGasto(sub);
  const prov2 = nombreProveedorDesdeGasto(com);
  const raw = `${cat} ${prov1 || sub} ${prov2 || com} ${sub} ${com}`;
  const k = normalizarNombreProveedorClave(raw);
  return /(SMOKING|MARLBORO|CIGARR|CIGARRO|ESMOKING)/.test(k);
}

export function esGastoSmokingAbarrotes(modulo, gasto) {
  if (String(modulo || '').toLowerCase() !== 'abarrotes') return false;
  const cat = String(gasto?.categoria || '').toUpperCase();
  if (!cat.includes('PROVEEDOR')) return false;
  return esProveedorSmokingGasto(gasto);
}

function esProveedorSmokingNombre(nombre) {
  const k = normalizarNombreProveedorClave(nombre);
  return /(SMOKING|MARLBORO|CIGARR|CIGARRO|ESMOKING)/.test(k);
}

function totalTraspasoLineas(lineas, campo = 'precio') {
  const arr = Array.isArray(lineas) ? lineas : [];
  return round2(
    arr.reduce((a, l) => {
      const qty = Math.max(0, Math.floor(Number(l?.cantidad) || 0));
      const val = Number(l?.[campo]) || 0;
      return a + val * qty;
    }, 0),
  );
}

function compraRecibida(c) {
  const est = String(c?.estado || '').toLowerCase();
  return !est || est === 'recibida' || est === 'recibido' || est === 'cerrada';
}

/**
 * Carga compras recientes de la tienda para resolver CMP-/ING-/prefijos sin ilike en UUID.
 */
async function listarComprasRecientes(supabase, sid, { dias = 21, limit = 400 } = {}) {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('compras')
    .select('id,total,estado,notas,sucursal_id,created_at,proveedor_id,proveedores(nombre),items')
    .eq('sucursal_id', sid)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message, data: [] };
  return { ok: true, data: data || [] };
}

function matchCompraPorFolio(compras, folio) {
  const f = String(folio || '');
  const fUp = f.toUpperCase();
  const fLow = f.toLowerCase().replace(/-/g, '');

  for (const c of compras || []) {
    if (!c?.id) continue;
    if (String(c.id).toLowerCase() === f.toLowerCase()) return c;
    if (folioDesdeCompraId(c.id).toUpperCase() === fUp) return c;
    const notas = String(c.notas || '');
    if (notas.toUpperCase().includes(`FOLIO INV ${fUp}`)) return c;
    if (notas.toUpperCase().includes(fUp) && /^(ING|CMP)-/i.test(fUp)) return c;
    // Prefijo hex del UUID (sin guiones)
    const idCompact = String(c.id).toLowerCase().replace(/-/g, '');
    if (fLow.length >= 8 && idCompact.startsWith(fLow)) return c;
  }
  return null;
}

async function resolverTraspaso(supabase, folio, sid) {
  const { data: doc, error } = await supabase
    .from('inventario_traspasos')
    .select('id,folio,estado,tipo,origen_id,destino_id,lineas')
    .eq('folio', folio)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!doc) {
    return {
      ok: false,
      error: `No existe traspaso ${folio}. Confirma en Productos → Traspasos.`,
    };
  }
  if (String(doc.tipo || '') !== 'envio') {
    return { ok: false, error: `${folio} no es un envío despachado.` };
  }
  const est = String(doc.estado || '').toLowerCase();
  if (est !== 'enviado' && est !== 'recibido') {
    return { ok: false, error: `Traspaso ${folio} no está listo (estado: ${doc.estado}).` };
  }
  const dest = normalizarCodigoTienda(doc.destino_id);
  if (dest !== sid) {
    return {
      ok: false,
      error: `Traspaso ${folio} es para ${etiquetaTienda(dest)}, no para ${etiquetaTienda(sid)}.`,
    };
  }
  return {
    ok: true,
    tipo: 'traspaso',
    folio,
    totalPrecio: totalTraspasoLineas(doc.lineas, 'precio'),
    totalCosto: totalTraspasoLineas(doc.lineas, 'costo'),
    total: totalTraspasoLineas(doc.lineas, 'costo') || totalTraspasoLineas(doc.lineas, 'precio'),
  };
}

async function resolverCompra(supabase, folio, sid, comprasCache) {
  let compra = matchCompraPorFolio(comprasCache, folio);
  if (!compra && /^[0-9a-f-]{36}$/i.test(folio)) {
    const { data, error } = await supabase
      .from('compras')
      .select('id,total,estado,notas,sucursal_id,proveedor_id,proveedores(nombre),items')
      .eq('id', folio)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    compra = data;
  }
  if (!compra) {
    return {
      ok: false,
      error:
        `No encontré inventario/compra para ${folio}.\n\n` +
        'Usa el folio que sale al recibir mercancía:\n' +
        '• CMP-XXXXXXXX (pedido + recepción)\n' +
        '• ING-YYYYMMDD-#### (entrega directa)\n' +
        '• o el UUID del historial de Compras.\n\n' +
        'Si solo hiciste “Ingreso de inventario” libre sin Compras, primero registra la entrega en Herramienta de compra.',
    };
  }
  if (normalizarCodigoTienda(compra.sucursal_id) !== sid) {
    return {
      ok: false,
      error: `El folio ${folio} es de otra tienda (${etiquetaTienda(compra.sucursal_id)}).`,
    };
  }
  if (!compraRecibida(compra)) {
    return {
      ok: false,
      error: `${folio} aún no está como recibida (estado: ${compra.estado}).`,
    };
  }
  const nombreProv = compra.proveedores?.nombre || '';
  if (nombreProv && !esProveedorSmokingNombre(nombreProv)) {
    return {
      ok: false,
      error:
        `El folio ${folio} no es de Smoking.\n` +
        `Proveedor en Compras: ${nombreProv || '—'}\n\n` +
        'Captura el folio de la recepción Smoking.',
    };
  }
  return {
    ok: true,
    tipo: 'compra',
    folio,
    compraId: compra.id,
    total: round2(compra.total),
    proveedor: nombreProv || 'Smoking',
  };
}

/**
 * Resuelve un folio humano a un sustento con monto.
 */
export async function resolverFolioSustentoSmoking(supabase, { folio, sucursal, comprasCache = null } = {}) {
  const sid = normalizarCodigoTienda(sucursal) || 'MAIN';
  const f = normalizarFolioSustentoSmoking(folio);
  if (!f) return { ok: false, error: 'Folio vacío.' };
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };

  if (/^trp-\d+/i.test(f)) {
    return resolverTraspaso(supabase, f, sid);
  }

  let cache = comprasCache;
  if (!cache) {
    const r = await listarComprasRecientes(supabase, sid);
    if (!r.ok) return { ok: false, error: r.error };
    cache = r.data;
  }
  return resolverCompra(supabase, f, sid, cache);
}

/**
 * Valida lista de folios vs monto del gasto Smoking.
 * @returns {{ ok: true, folios: string[], marker: string } | { ok: false, error: string }}
 */
export async function validarSustentoSmokingGasto(supabase, {
  sucursal,
  modulo,
  gasto,
  foliosRaw,
} = {}) {
  if (!esGastoSmokingAbarrotes(modulo, gasto)) {
    return { ok: true, skipped: true };
  }

  const folios = parseFoliosInventarioSmoking(foliosRaw)
    .map(normalizarFolioSustentoSmoking)
    .filter(Boolean);
  const uniq = [...new Set(folios)];

  if (!uniq.length) {
    return {
      ok: false,
      error:
        'Smoking requiere folio de inventario (sustento).\n\n' +
        'Sin folio se pueden crear gastos fantasma ($1080 varias veces sin mercancía).\n\n' +
        'Copia el folio de:\n' +
        '• Compras → recepción / entrega directa (CMP-… o ING-…)\n' +
        '• o Traspaso recibido (trp-…)\n\n' +
        'Lo ves en Consultas → Inventario o al imprimir la recepción.',
    };
  }

  if (!supabase) {
    return { ok: false, error: 'Sin conexión: no se puede validar el folio Smoking.' };
  }

  const sid = normalizarCodigoTienda(sucursal) || 'MAIN';
  const comprasRes = await listarComprasRecientes(supabase, sid);
  if (!comprasRes.ok) return { ok: false, error: comprasRes.error };
  const comprasCache = comprasRes.data;

  const resueltos = [];
  for (const folio of uniq) {
    const r = await resolverFolioSustentoSmoking(supabase, {
      folio,
      sucursal: sid,
      comprasCache,
    });
    if (!r.ok) return r;
    resueltos.push(r);
  }

  const montoGasto = round2(Number(gasto.monto) || 0);
  let sumTickets = 0;
  for (const r of resueltos) {
    if (r.tipo === 'traspaso') {
      const cuadraUno =
        Math.abs(round2(r.totalPrecio) - montoGasto) <= 0.01
        || Math.abs(round2(r.totalCosto) - montoGasto) <= 0.01;
      // Para multi-folio se suma costo preferente, luego precio.
      sumTickets = round2(sumTickets + (Number(r.totalCosto) || Number(r.totalPrecio) || 0));
      if (uniq.length === 1 && !cuadraUno) {
        return {
          ok: false,
          error:
            'El monto del gasto no cuadra con el traspaso.\n\n' +
            `Folio: ${r.folio}\n` +
            `Traspaso precio: ${fmtMonto(r.totalPrecio)} · costo: ${fmtMonto(r.totalCosto)}\n` +
            `Gasto: ${fmtMonto(montoGasto)}`,
        };
      }
    } else {
      sumTickets = round2(sumTickets + (Number(r.total) || 0));
    }
  }

  if (Math.abs(sumTickets - montoGasto) > 0.01) {
    return {
      ok: false,
      error:
        'Folio(s) incompletos o monto no coincide (evita gastos fantasma).\n\n' +
        `Folios: ${uniq.join(', ')}\n` +
        `Suma inventario/compras: ${fmtMonto(sumTickets)}\n` +
        `Gasto capturado: ${fmtMonto(montoGasto)}\n\n` +
        'Si la entrega fue parcial, agrega todos los folios hasta que sume el ticket.',
    };
  }

  // Anti-reuso: mismo folio ya ligado a otro gasto Smoking.
  const { data: gastosPrev, error: ePrev } = await supabase
    .from('cortes_contabilidad_gastos')
    .select('id,comentario,monto,created_at')
    .eq('sucursal_id', sid)
    .eq('modulo', 'abarrotes')
    .ilike('categoria', '%PROVEEDOR%')
    .or(`comentario.ilike.%${MARKER_SMOK_INV}%,comentario.ilike.%${MARKER_TICKET_INV_LEGACY}%`)
    .limit(2000);
  if (ePrev) return { ok: false, error: ePrev.message };

  const usados = new Map();
  for (const g of gastosPrev || []) {
    const str = String(g?.comentario || '');
    const up = str.toUpperCase();
    for (const marker of [MARKER_SMOK_INV, MARKER_TICKET_INV_LEGACY]) {
      const idx = up.indexOf(marker);
      if (idx < 0) continue;
      const rest = str.slice(idx + marker.length);
      for (const f of parseFoliosInventarioSmoking(rest).map(normalizarFolioSustentoSmoking)) {
        if (f && !usados.has(f)) usados.set(f, g.id);
      }
    }
  }

  const repetidos = uniq.filter((f) => usados.has(f));
  if (repetidos.length) {
    const first = usados.get(repetidos[0]);
    return {
      ok: false,
      error:
        'Esos folios ya se usaron en un gasto Smoking anterior (posible duplicado/fantasma).\n\n' +
        `Repite: ${repetidos.join(', ')}\n` +
        (first ? `Gasto existente: ${first}\n\n` : '\n') +
        'Cada recepción solo puede respaldar un gasto.',
    };
  }

  const marker = `${MARKER_SMOK_INV}${uniq.join(',')}`;
  return {
    ok: true,
    folios: uniq,
    marker,
    sumTickets,
    resueltos,
  };
}

export function aplicarMarkerSmokingComentario(comentario, marker) {
  const base = String(comentario || '').trim();
  const m = String(marker || '').trim();
  if (!m) return base;
  return (base ? `${base} · ${m}` : m).toUpperCase();
}
