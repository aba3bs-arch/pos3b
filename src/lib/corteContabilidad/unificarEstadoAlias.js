/**
 * Varias filas de la misma tienda (Fusión / FUSIÓN / Fusion / fusion / FUSION)
 * quedan en un solo estado. No se suman las ventas: manda el registro más
 * reciente que tenga datos. Si ese registro no trae caja chica, se conserva
 * la caja de otra variante.
 */

function tieneMonto(n) {
  return (Number(n) || 0) > 0.001;
}

export function estadoAliasTieneDatos(estado) {
  if (!estado || typeof estado !== 'object') return false;
  if (tieneMonto(estado.caja_anterior)) return true;
  if (tieneMonto(estado.fondo_fijo)) return true;
  if (tieneMonto(estado.fondo)) return true;
  if (tieneMonto(estado.moneda_inicial)) return true;
  if (tieneMonto(estado.moneda_final)) return true;
  if (tieneMonto(estado.venta)) return true;
  if (tieneMonto(estado.tarjeta)) return true;
  if (tieneMonto(estado.recoleccion)) return true;
  if (String(estado.folio || '').trim()) return true;
  if (String(estado.comentarios || '').trim()) return true;
  const map = estado.venta_pos_por_corte;
  if (map && typeof map === 'object' && Object.keys(map).length > 0) return true;
  return false;
}

function porReciente(a, b, sid) {
  const tb = new Date(b.updated_at || 0).getTime();
  const ta = new Date(a.updated_at || 0).getTime();
  if (tb !== ta) return tb - ta;
  if (a.sucursal_id === sid) return -1;
  if (b.sucursal_id === sid) return 1;
  return 0;
}

/**
 * @param {string} sid código canónico (FUSION)
 * @param {{ sucursal_id?: string, estado?: object, updated_at?: string }[]} rows
 */
export function unificarEstadosAlias(sid, rows = []) {
  const lista = (rows || []).filter((r) => r && typeof r === 'object');
  const variantes = [...new Set(
    lista.map((r) => r.sucursal_id).filter((id) => id && id !== sid),
  )];
  const conDatos = lista.filter((r) => estadoAliasTieneDatos(r.estado));
  const ordenados = [...(conDatos.length ? conDatos : lista)].sort((a, b) => porReciente(a, b, sid));
  const base = ordenados[0] || null;
  let estado = base?.estado && typeof base.estado === 'object' ? { ...base.estado } : null;
  let cajaDesde = null;

  if (estado && !tieneMonto(estado.caja_anterior)) {
    const conCaja = [...lista]
      .filter((r) => tieneMonto(r.estado?.caja_anterior))
      .sort((a, b) => porReciente(a, b, sid))[0];
    if (conCaja) {
      estado = {
        ...estado,
        caja_anterior: Number(conCaja.estado.caja_anterior) || 0,
        fondo_fijo: tieneMonto(estado.fondo_fijo)
          ? estado.fondo_fijo
          : (Number(conCaja.estado.fondo_fijo) || 0),
      };
      cajaDesde = conCaja.sucursal_id || null;
    }
  }

  return {
    estado,
    desde: base?.sucursal_id || null,
    variantes,
    cajaDesde,
  };
}
