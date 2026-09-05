/**
 * Corregir folio de un ticket (compra / ingreso / traspaso) en esta sucursal.
 * Así se despegan folios que se copiaron iguales en todas las tiendas.
 */
import { equivalentesCodigoTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import {
  folioInvDesdeNotas,
  folioVisibleCompra,
  notasConFolioInv,
  normalizarFolioInventario,
  sugerirFolioConSucursal,
  variantesFolioInventario,
} from './foliosInventario.js';

const LS_MOVIMIENTOS = 'pos3b_movimientos_inventario';
const LS_PENDIENTES_NUBE = 'pos3b_movimientos_inventario_pendientes';

function sucursalToca(rowSuc, sid) {
  const a = normalizarCodigoTienda(rowSuc);
  const b = normalizarCodigoTienda(sid);
  if (!b) return true;
  if (!a) return true;
  return a === b;
}

function folioDeFila(m) {
  return String(m?.folio || m?.meta?.folio || '').trim();
}

function parcheFilaFolio(m, folioNew) {
  return {
    ...m,
    folio: folioNew,
    meta: { ...(m.meta && typeof m.meta === 'object' ? m.meta : {}), folio: folioNew },
  };
}

function parcheListaLocal(lsKey, folioOld, folioNew, sucursal) {
  let n = 0;
  try {
    const raw = localStorage.getItem(lsKey);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return 0;
    const next = list.map((m) => {
      if (!sucursalToca(m.sucursal || m.sucursal_id, sucursal)) return m;
      if (folioDeFila(m) !== folioOld) return m;
      n += 1;
      return parcheFilaFolio(m, folioNew);
    });
    if (n) localStorage.setItem(lsKey, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return n;
}

async function rpcRenombrarMovimientos(supabase, sucursal, folioOld, folioNew) {
  if (!supabase?.rpc) return { ok: false, n: 0, faltaRpc: true };
  const { data, error } = await supabase.rpc('renombrar_folio_movimiento_inventario', {
    p_sucursal: sucursal,
    p_folio_old: folioOld,
    p_folio_new: folioNew,
  });
  if (error) {
    const msg = String(error.message || '');
    const falta =
      error.code === '42883' ||
      /renombrar_folio_movimiento_inventario|could not find the function|schema cache/i.test(msg);
    return { ok: false, n: 0, faltaRpc: falta, error: msg };
  }
  return { ok: true, n: Number(data) || 0 };
}

/**
 * Cambia el folio de un documento en esta sucursal (compras, movimientos, traspasos).
 */
export async function renombrarFolioInventario(supabase, opts = {}) {
  const sucursal = normalizarCodigoTienda(opts.sucursal);
  const folioOld = String(opts.folioOld || '').trim();
  const folioNewRaw = String(opts.folioNew || '').trim();
  const compraId = opts.compraId ? String(opts.compraId) : '';
  if (!sucursal) return { ok: false, error: 'Falta la sucursal del documento.' };
  if (!folioOld) return { ok: false, error: 'No hay folio actual para editar.' };
  const folioNew = normalizarFolioInventario(folioNewRaw) || folioNewRaw;
  if (!folioNew) return { ok: false, error: 'Escribe el folio nuevo.' };
  if (folioNew === folioOld) return { ok: true, skipped: true, folio: folioOld };

  const variantesOld = variantesFolioInventario(folioOld, sucursal);
  let compras = 0;
  let traspasos = 0;
  let movimientosNube = 0;

  if (supabase) {
    let qCompras = supabase.from('compras').select('id,notas,sucursal_id').eq('sucursal_id', sucursal).limit(400);
    if (compraId) qCompras = qCompras.eq('id', compraId);
    const { data: rowsComp, error: eComp } = await qCompras;
    if (eComp) return { ok: false, error: eComp.message };
    for (const c of rowsComp || []) {
      const visible = folioVisibleCompra(c);
      const enNotas = folioInvDesdeNotas(c.notas);
      const toca =
        (compraId && String(c.id) === compraId) ||
        variantesOld.some((v) => v.toUpperCase() === String(visible).toUpperCase()) ||
        variantesOld.some((v) => String(enNotas).toUpperCase() === v.toUpperCase());
      if (!toca) continue;
      const notas = notasConFolioInv(c.notas, folioNew);
      const { error: eUp } = await supabase.from('compras').update({ notas }).eq('id', c.id);
      if (eUp) return { ok: false, error: eUp.message };
      compras += 1;
    }

    const destEq = equivalentesCodigoTienda(sucursal);
    const { data: rowsTrp, error: eTrp } = await supabase
      .from('inventario_traspasos')
      .select('id,folio,origen_id,destino_id')
      .in('folio', variantesOld)
      .limit(80);
    if (eTrp && !/inventario_traspasos|42P01|schema cache/i.test(String(eTrp.message || ''))) {
      return { ok: false, error: eTrp.message };
    }
    for (const t of rowsTrp || []) {
      const orig = normalizarCodigoTienda(t.origen_id);
      const dest = normalizarCodigoTienda(t.destino_id);
      if (orig !== sucursal && dest !== sucursal && !destEq.includes(t.destino_id)) continue;
      const { error: eUp } = await supabase.from('inventario_traspasos').update({ folio: folioNew }).eq('id', t.id);
      if (eUp) return { ok: false, error: eUp.message };
      traspasos += 1;
    }

    const rpc = await rpcRenombrarMovimientos(supabase, sucursal, folioOld, folioNew);
    if (rpc.ok) {
      movimientosNube = rpc.n;
      for (const v of variantesOld) {
        if (v === folioOld) continue;
        const extra = await rpcRenombrarMovimientos(supabase, sucursal, v, folioNew);
        if (extra.ok) movimientosNube += extra.n;
      }
    } else if (!rpc.faltaRpc && rpc.error) {
      return {
        ok: false,
        error:
          `No pude actualizar el folio en inventario (${rpc.error}).\n` +
          'En Supabase → SQL Editor ejecuta: supabase/fix_renombrar_folio_inventario.sql',
      };
    }
  }

  const loc = parcheListaLocal(LS_MOVIMIENTOS, folioOld, folioNew, sucursal);
  const pend = parcheListaLocal(LS_PENDIENTES_NUBE, folioOld, folioNew, sucursal);
  for (const v of variantesOld) {
    if (v === folioOld) continue;
    parcheListaLocal(LS_MOVIMIENTOS, v, folioNew, sucursal);
    parcheListaLocal(LS_PENDIENTES_NUBE, v, folioNew, sucursal);
  }

  return {
    ok: true,
    folio: folioNew,
    compras,
    traspasos,
    movimientosLocal: loc + pend,
    movimientosNube,
    aviso:
      movimientosNube === 0 && supabase
        ? 'Folio actualizado en compras/traspasos de esta tienda. Si el gasto Smoking sigue sin hallar un ING viejo, ejecuta supabase/fix_renombrar_folio_inventario.sql en Supabase.'
        : null,
  };
}

export function pedirFolioEditado({ folioActual, sucursal, etiqueta = 'ticket' }) {
  const actual = String(folioActual || '').trim();
  const sugerido = sugerirFolioConSucursal(actual, sucursal) || actual;
  const typed = window.prompt(
    `Folio de este ${etiqueta} en ${sucursal || 'esta tienda'}.\n` +
      `Actual: ${actual || '—'}\n\n` +
      'Cámbialo para que no coincida con el de otra sucursal (ej. ING-5-0509-0001).',
    sugerido,
  );
  if (typed == null) return { ok: false, cancelled: true };
  const folioNew = String(typed || '').trim();
  if (!folioNew) return { ok: false, error: 'Folio vacío.' };
  return { ok: true, folioNew };
}
