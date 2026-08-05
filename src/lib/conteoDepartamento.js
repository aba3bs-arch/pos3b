import { costoUnitarioInventario } from './valorInventario.js';
import {
  guardarMovimientoLocal,
  leerMovimientosLocal,
  leerProductoInventarioFresco,
  aplicarSetStockAtomico,
} from './inventarioMovimientos.js';
import {
  stockEnUbicacion,
  ubicacionEntradaDefault,
  esAlmacenCentral,
  etiquetaCedisEmpresa,
} from './inventarioMultitienda.js';
import { round2 } from './productoForm.js';
import { normalizarCodigoTienda } from '../constants/sucursales.js';

const LS_FOLIO_SEQ = 'pos3b_folio_ajuste_seq';
const LS_AJUSTES = 'pos3b_ajustes_inventario';
const LS_CORRECCIONES_LINEAS = 'pos3b_correcciones_lineas_inventario';

export function claveCorreccionLinea(folio, sucursal, codigo) {
  return `${String(folio || '')}|${normalizarCodigoTienda(sucursal) || '—'}|${String(codigo)}`;
}

export function leerCorreccionesLineasInventario() {
  try {
    const raw = localStorage.getItem(LS_CORRECCIONES_LINEAS);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

export function guardarCorreccionLineaInventario(entry) {
  const map = leerCorreccionesLineasInventario();
  const key = claveCorreccionLinea(entry.folio, entry.sucursal, entry.codigo);
  map[key] = { ...entry, updated_at: new Date().toISOString() };
  localStorage.setItem(LS_CORRECCIONES_LINEAS, JSON.stringify(map));
  return map[key];
}

function lineasParaResumenDesdeAjuste(lineas) {
  return (lineas || []).map((l) => ({
    existencia: Number(l.existencia) || 0,
    contadaNum:
      l.contada != null && l.contada !== '' && !Number.isNaN(Number(l.contada)) ? Number(l.contada) : l.contadaNum,
    diferencia: l.diferencia != null && l.diferencia !== '' ? Number(l.diferencia) : null,
    precioVenta: Number(l.precioVenta) || 0,
  }));
}

/** Actualiza una línea dentro del ajuste guardado en este equipo (si existe). */
export function actualizarLineaAjusteLocal(folio, codigo, patch) {
  const list = leerAjustesInventario();
  const idx = list.findIndex((a) => String(a.folio) === String(folio));
  if (idx < 0) return false;
  const aj = { ...list[idx], lineas: [...(list[idx].lineas || [])] };
  const j = aj.lineas.findIndex((l) => String(l.codigo) === String(codigo));
  if (j < 0) return false;
  aj.lineas[j] = { ...aj.lineas[j], ...patch };
  aj.resumen = resumirConteoDepartamento(lineasParaResumenDesdeAjuste(aj.lineas));
  aj.ultima_correccion_at = new Date().toISOString();
  list[idx] = aj;
  localStorage.setItem(LS_AJUSTES, JSON.stringify(list));
  return true;
}

/** En MAIN el conteo/ingreso opera sobre CEDIS; en tiendas, sobre piso de venta. */
export function ubicacionConteo(sucursal) {
  return ubicacionEntradaDefault(sucursal);
}

export function etiquetaUbicacionConteo(sucursal) {
  return ubicacionConteo(sucursal) === 'cedis'
    ? etiquetaCedisEmpresa()
    : esAlmacenCentral(sucursal)
      ? 'piso de venta · MAIN'
      : 'piso de venta';
}

export function productosEnDepartamento(inventario, departamento) {
  const dept = String(departamento || 'GENERAL').toUpperCase();
  return (inventario || [])
    .filter((p) => String(p.cat || 'GENERAL').toUpperCase() === dept)
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

/**
 * @param {object} producto
 * @param {string|number} contadaRaw cantidad CONTADA (existencia final), no “a sumar”
 * @param {string} [sucursal] tienda activa (MAIN → CEDIS; tienda → piso)
 */
export function construirLineaConteo(producto, contadaRaw = '', sucursal = '') {
  const suc = sucursal || producto?._sucursalVista || '';
  const ubi = ubicacionConteo(suc);
  const existencia = suc
    ? Math.max(0, stockEnUbicacion(producto, suc, ubi, suc))
    : Math.max(0, Number(producto?.stock) || 0);
  const raw = contadaRaw === null || contadaRaw === undefined ? '' : String(contadaRaw);
  const contadaNum = raw.trim() === '' ? null : Math.max(0, Math.floor(Number(raw)));
  const diferencia = contadaNum == null ? null : contadaNum - existencia;
  let estado = 'pendiente';
  if (contadaNum != null) {
    if (diferencia === 0) estado = 'ok';
    else if (diferencia > 0) estado = 'sobrante';
    else estado = 'faltante';
  }
  const costoUnitario = costoUnitarioInventario(producto);
  const precioVenta = Number(producto?.precio) || 0;
  return {
    productoId: producto.id,
    codigo: producto.id,
    nombre: producto.nombre,
    existencia,
    contada: raw,
    contadaNum,
    diferencia,
    costoUnitario,
    precioVenta,
    valorDiferencia: contadaNum == null || diferencia === 0 ? 0 : round2(Math.abs(diferencia) * precioVenta),
    estado,
  };
}

export function resumirConteoDepartamento(lineas = []) {
  let piezasExistencia = 0;
  let piezasContadas = 0;
  let piezasFaltantes = 0;
  let piezasSobrantes = 0;
  let valorFaltante = 0;
  let valorSobrante = 0;
  let skusPendientes = 0;
  let skusOk = 0;
  let skusFaltante = 0;
  let skusSobrante = 0;

  for (const l of lineas) {
    piezasExistencia += l.existencia;
    if (l.contadaNum == null) {
      skusPendientes += 1;
      continue;
    }
    piezasContadas += l.contadaNum;
    if (l.diferencia === 0) {
      skusOk += 1;
    } else if (l.diferencia < 0) {
      skusFaltante += 1;
      piezasFaltantes += Math.abs(l.diferencia);
      valorFaltante += Math.abs(l.diferencia) * (Number(l.precioVenta) || 0);
    } else {
      skusSobrante += 1;
      piezasSobrantes += l.diferencia;
      valorSobrante += l.diferencia * (Number(l.precioVenta) || 0);
    }
  }

  return {
    totalSkus: lineas.length,
    skusPendientes,
    skusOk,
    skusFaltante,
    skusSobrante,
    piezasExistencia,
    piezasContadas,
    piezasFaltantes,
    piezasSobrantes,
    valorFaltante: round2(valorFaltante),
    valorSobrante: round2(valorSobrante),
    hayDiferencias: piezasFaltantes > 0 || piezasSobrantes > 0,
    listoParaAplicar: skusPendientes === 0 && lineas.length > 0,
  };
}

export function generarFolioAjuste() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let seq = 1;
  try {
    const raw = localStorage.getItem(LS_FOLIO_SEQ);
    const prev = raw ? JSON.parse(raw) : {};
    if (prev.fecha === today) seq = (prev.seq || 0) + 1;
    localStorage.setItem(LS_FOLIO_SEQ, JSON.stringify({ fecha: today, seq }));
  } catch {
    /* ignore */
  }
  return `AJU-${today}-${String(seq).padStart(4, '0')}`;
}

export function leerAjustesInventario() {
  try {
    const raw = localStorage.getItem(LS_AJUSTES);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function guardarAjusteInventario(ajuste) {
  const prev = leerAjustesInventario();
  const next = [{ ...ajuste, id: ajuste.id || `aj_${Date.now()}` }, ...prev].slice(0, 100);
  localStorage.setItem(LS_AJUSTES, JSON.stringify(next));
  return next;
}

/** Aplica conteo: stock = cantidad contada (existencia final); genera folio y movimientos. */
export async function aplicarConteoDepartamento(supabase, opts) {
  const { lineas, inventario, departamento, usuario, sucursal, permitirPendientes = false } = opts;
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };

  const contadas = (lineas || []).filter((l) => l.contadaNum != null);
  if (!contadas.length) {
    return { ok: false, error: 'No hay productos contados para aplicar.' };
  }

  const resumen = resumirConteoDepartamento(lineas);
  if (!permitirPendientes && !resumen.listoParaAplicar) {
    return { ok: false, error: `Faltan ${resumen.skusPendientes} producto(s) por contar.` };
  }

  const folio = generarFolioAjuste();
  const motivo = `Conteo físico ${departamento} · ${folio}`;
  let log = leerMovimientosLocal();
  const aplicadas = [];
  const errores = [];
  const suc = sucursal || '';

  for (const l of contadas) {
    const fresco = await leerProductoInventarioFresco(supabase, l.productoId);
    if (!fresco.ok) {
      errores.push(`${l.codigo || l.productoId}: ${fresco.error}`);
      continue;
    }
    const producto = fresco.producto;

    const ubi = ubicacionConteo(suc);
    const tienda = normalizarCodigoTienda(suc) || 'MAIN';
    const existenciaReal = stockEnUbicacion(producto, tienda, ubi, tienda);
    const contada = Math.max(0, Math.floor(Number(l.contadaNum)));
    const diferencia = contada - existenciaReal;
    const ts = new Date().toISOString();

    if (diferencia !== 0) {
      const setR = await aplicarSetStockAtomico(supabase, {
        productoId: producto.id,
        sucursal: tienda,
        ubicacion: ubi,
        valor: contada,
      });
      if (!setR.ok) {
        errores.push(`${l.nombre || producto.nombre}: ${setR.error}`);
        continue;
      }

      log = guardarMovimientoLocal(
        {
          tipo: diferencia > 0 ? 'entrada' : 'retiro',
          modo: 'conteo_departamento',
          folio,
          departamento,
          producto_id: producto.id,
          producto_nombre: l.nombre || producto.nombre,
          cantidad: Math.abs(diferencia),
          stock_antes: setR.antes,
          stock_despues: setR.despues,
          motivo: `${motivo} · ${etiquetaUbicacionConteo(suc)}`,
          usuario: usuario || '—',
          sucursal: suc,
          ubicacion: ubi,
          created_at: ts,
        },
        supabase,
      );
    } else {
      log = guardarMovimientoLocal(
        {
          tipo: 'conteo_registro',
          modo: 'conteo_departamento',
          folio,
          departamento,
          producto_id: producto.id,
          producto_nombre: l.nombre || producto.nombre,
          cantidad: 0,
          stock_antes: existenciaReal,
          stock_despues: contada,
          motivo: `${motivo} · sin diferencia · ${etiquetaUbicacionConteo(suc)}`,
          usuario: usuario || '—',
          sucursal: suc,
          ubicacion: ubi,
          created_at: ts,
        },
        supabase,
      );
    }

    aplicadas.push({
      ...l,
      existencia: existenciaReal,
      contadaNum: contada,
      diferencia,
      precioVenta: l.precioVenta,
      valorDiferencia:
        diferencia === 0 ? 0 : round2(Math.abs(diferencia) * (Number(l.precioVenta) || 0)),
    });
  }

  const ajuste = {
    folio,
    departamento,
    sucursal: suc,
    usuario: usuario || '—',
    resumen: resumirConteoDepartamento(aplicadas),
    lineas: aplicadas.map((l) => ({
      codigo: l.codigo,
      nombre: l.nombre,
      existencia: l.existencia,
      contada: l.contadaNum,
      diferencia: l.diferencia,
      costoUnitario: l.costoUnitario,
      precioVenta: l.precioVenta,
      valorDiferencia: l.valorDiferencia,
      estado: l.diferencia === 0 ? 'ok' : l.diferencia < 0 ? 'faltante' : 'sobrante',
    })),
    movimientos: aplicadas.filter((l) => l.diferencia !== 0).length,
    errores,
    created_at: new Date().toISOString(),
  };
  guardarAjusteInventario(ajuste);

  guardarMovimientoLocal(
    {
      tipo: 'conteo_snapshot',
      modo: 'conteo_snapshot',
      folio,
      departamento,
      producto_id: null,
      producto_nombre: `Snapshot conteo ${departamento}`,
      cantidad: 0,
      motivo: `${motivo} · snapshot completo`,
      usuario: usuario || '—',
      sucursal: suc,
      ubicacion: ubicacionConteo(suc),
      meta: {
        folio,
        ajuste_snapshot: {
          folio,
          departamento,
          sucursal: suc,
          usuario: usuario || '—',
          resumen: ajuste.resumen,
          lineas: ajuste.lineas,
          created_at: ajuste.created_at,
        },
      },
      created_at: ajuste.created_at,
    },
    supabase,
  );

  if (errores.length && !aplicadas.length) {
    return { ok: false, error: errores.join('\n') };
  }

  return {
    ok: true,
    folio,
    ajuste,
    resumen: ajuste.resumen,
    movimientos: ajuste.movimientos,
    errores,
    log,
    mensaje:
      errores.length > 0
        ? `Ajuste ${folio} parcial: ${ajuste.lineas.length} contado(s), ${ajuste.movimientos} movimiento(s) en ${etiquetaUbicacionConteo(suc)}. ${errores.length} error(es):\n${errores.join('\n')}`
        : ajuste.lineas.length > 0
          ? `Conteo ${folio} aplicado: ${ajuste.lineas.length} artículo(s) registrado(s)${ajuste.movimientos > 0 ? `, ${ajuste.movimientos} ajuste(s) de stock` : ''} en ${etiquetaUbicacionConteo(suc)}.`
          : `Conteo ${folio} sin artículos en ${etiquetaUbicacionConteo(suc)}.`,
  };
}

/**
 * Corrige la cantidad contada de un SKU desde el reporte: ajusta stock y guarda la corrección.
 */
export async function corregirLineaConteoInventario(supabase, opts = {}) {
  const { linea, nuevaContada, usuario, nota = '' } = opts;
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };

  const codigo = String(linea?.codigo || '').trim();
  const folioOrigen = linea?.numeroAjuste || linea?.folio;
  const suc = normalizarCodigoTienda(linea?.sucursal || opts.sucursal);
  if (!codigo || !folioOrigen || folioOrigen === '—') {
    return { ok: false, error: 'Línea sin folio o código válido.' };
  }

  const raw = nuevaContada === null || nuevaContada === undefined ? '' : String(nuevaContada).trim();
  if (raw === '' || Number.isNaN(Number(raw))) {
    return { ok: false, error: 'Indica la cantidad contada (entero ≥ 0).' };
  }
  const contada = Math.max(0, Math.floor(Number(raw)));

  const fresco = await leerProductoInventarioFresco(supabase, codigo);
  if (!fresco.ok) return { ok: false, error: fresco.error };
  const producto = fresco.producto;

  const ubi = ubicacionConteo(suc);
  const tienda = suc || 'MAIN';
  const existenciaReal = stockEnUbicacion(producto, tienda, ubi, tienda);
  const diferencia = contada - existenciaReal;
  const precioVenta = Number(linea.precioVenta) || Number(producto.precio) || 0;
  const costoUnitario = costoUnitarioInventario(producto);
  const ts = new Date().toISOString();
  const motivoBase = `Corrección conteo ${folioOrigen} · ${linea.nombre || codigo}`;

  if (diferencia !== 0) {
    const setR = await aplicarSetStockAtomico(supabase, {
      productoId: producto.id,
      sucursal: tienda,
      ubicacion: ubi,
      valor: contada,
    });
    if (!setR.ok) return { ok: false, error: setR.error };
  }

  const folioCor = generarFolioAjuste();
  guardarMovimientoLocal(
    {
      tipo: diferencia !== 0 ? (diferencia > 0 ? 'entrada' : 'retiro') : 'conteo_registro',
      modo: 'conteo_correccion',
      folio: folioCor,
      departamento: linea.departamentoKey || linea.departamento,
      producto_id: producto.id,
      producto_nombre: linea.nombre || producto.nombre,
      cantidad: Math.abs(diferencia),
      stock_antes: existenciaReal,
      stock_despues: contada,
      motivo: nota ? `${motivoBase} · ${nota}` : motivoBase,
      usuario: usuario || '—',
      sucursal: suc,
      ubicacion: ubi,
      meta: {
        folio: folioCor,
        folio_origen: folioOrigen,
        correccion: true,
        nota: nota || null,
      },
      created_at: ts,
    },
    supabase,
  );

  const lineaPatch = {
    codigo,
    nombre: linea.nombre || producto.nombre,
    existencia: existenciaReal,
    contada,
    diferencia,
    costoUnitario,
    precioVenta,
    valorDiferencia: diferencia === 0 ? 0 : round2(Math.abs(diferencia) * precioVenta),
    estado: diferencia === 0 ? 'ok' : diferencia < 0 ? 'faltante' : 'sobrante',
  };

  actualizarLineaAjusteLocal(folioOrigen, codigo, lineaPatch);
  guardarCorreccionLineaInventario({
    folio: folioOrigen,
    sucursal: suc,
    codigo,
    ...lineaPatch,
    folio_correccion: folioCor,
    corregido_por: usuario || '—',
    nota,
  });

  return {
    ok: true,
    folio: folioCor,
    folioOrigen,
    lineaPatch,
    sucursal: suc,
    departamento: linea.departamentoKey || linea.departamento,
    created_at: linea.created_at,
    mensaje: `Corrección ${folioCor}: ${linea.nombre || codigo} → ${contada} pzas (${diferencia > 0 ? '+' : ''}${diferencia}).`,
  };
}
