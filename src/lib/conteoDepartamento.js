import { costoUnitarioInventario } from './valorInventario.js';
import { guardarMovimientoLocal, leerMovimientosLocal } from './inventarioMovimientos.js';
import { buildPatchStock, stockEnUbicacion } from './inventarioMultitienda.js';
import { round2 } from './productoForm.js';

const LS_FOLIO_SEQ = 'pos3b_folio_ajuste_seq';
const LS_AJUSTES = 'pos3b_ajustes_inventario';

export function productosEnDepartamento(inventario, departamento) {
  const dept = String(departamento || 'GENERAL').toUpperCase();
  return (inventario || [])
    .filter((p) => String(p.cat || 'GENERAL').toUpperCase() === dept)
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

export function construirLineaConteo(producto, contadaRaw = '') {
  const existencia = Math.max(0, Number(producto?.stock) || 0);
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
  return {
    productoId: producto.id,
    codigo: producto.id,
    nombre: producto.nombre,
    existencia,
    contada: raw,
    contadaNum,
    diferencia,
    costoUnitario,
    precioVenta: Number(producto?.precio) || 0,
    valorDiferencia: contadaNum == null || diferencia === 0 ? 0 : round2(Math.abs(diferencia) * costoUnitario),
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
      valorFaltante += Math.abs(l.diferencia) * l.costoUnitario;
    } else {
      skusSobrante += 1;
      piezasSobrantes += l.diferencia;
      valorSobrante += l.diferencia * l.costoUnitario;
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

/** Aplica conteo: stock = cantidad contada; genera folio y registra movimientos. */
export async function aplicarConteoDepartamento(supabase, opts) {
  const { lineas, inventario, departamento, usuario, sucursal } = opts;
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };

  const resumen = resumirConteoDepartamento(lineas);
  if (!resumen.listoParaAplicar) {
    return { ok: false, error: `Faltan ${resumen.skusPendientes} producto(s) por contar.` };
  }

  const folio = generarFolioAjuste();
  const motivo = `Conteo físico ${departamento} · ${folio}`;
  let log = leerMovimientosLocal();
  const aplicadas = [];
  const errores = [];

  for (const l of lineas) {
    if (l.contadaNum == null) continue;
    const producto = (inventario || []).find((p) => p.id === l.productoId);
    if (!producto) {
      errores.push(`${l.codigo}: no encontrado`);
      continue;
    }
    if (l.diferencia === 0) continue;

    const { error } = await supabase
      .from('productos')
      .update(buildPatchStock(producto, sucursal, 'piso', l.contadaNum, sucursal))
      .eq('id', l.productoId);
    if (error) {
      errores.push(`${l.nombre}: ${error.message}`);
      continue;
    }

    log = guardarMovimientoLocal({
      tipo: l.diferencia > 0 ? 'entrada' : 'retiro',
      modo: 'conteo_departamento',
      folio,
      departamento,
      producto_id: l.productoId,
      producto_nombre: l.nombre,
      cantidad: Math.abs(l.diferencia),
      stock_antes: l.existencia,
      stock_despues: l.contadaNum,
      motivo,
      usuario: usuario || '—',
      sucursal: sucursal || '',
      created_at: new Date().toISOString(),
    });

    producto.stock = l.contadaNum;
    aplicadas.push(l);
  }

  const ajuste = {
    folio,
    departamento,
    sucursal: sucursal || '',
    usuario: usuario || '—',
    resumen,
    lineas: lineas.map((l) => ({
      codigo: l.codigo,
      nombre: l.nombre,
      existencia: l.existencia,
      contada: l.contadaNum,
      diferencia: l.diferencia,
      costoUnitario: l.costoUnitario,
      valorDiferencia: l.valorDiferencia,
      estado: l.estado,
    })),
    movimientos: aplicadas.length,
    errores,
    created_at: new Date().toISOString(),
  };
  guardarAjusteInventario(ajuste);

  if (errores.length && !aplicadas.length) {
    return { ok: false, error: errores.join('\n') };
  }

  return {
    ok: true,
    folio,
    ajuste,
    resumen,
    movimientos: aplicadas.length,
    errores,
    log,
    mensaje:
      errores.length > 0
        ? `Ajuste ${folio} parcial: ${aplicadas.length} línea(s). ${errores.length} error(es).`
        : resumen.hayDiferencias
          ? `Ajuste ${folio} aplicado: ${aplicadas.length} movimiento(s).`
          : `Conteo ${folio} cerrado sin diferencias.`,
  };
}
