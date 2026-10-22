const TIPOS_CREDITO = new Set(['Cobro Crédito', 'Entrega Crédito']);

/** Crédito cobrado a un cliente (no es venta de mercancía en efectivo). */
export function esCreditoCobrado(m) {
  if (!m) return false;
  if (TIPOS_CREDITO.has(m.tipo_movimiento)) return true;
  if (/^CXC-/i.test(String(m.num_traspaso || ''))) return true;
  return /cr[eé]dito\s+(cobrado|parcial|liquidado)/i.test(
    `${m.descripcion_gasto || ''} ${m.foto_url && !String(m.foto_url).startsWith('data:') ? m.foto_url : ''}`,
  );
}

export const ETIQUETA_CREDITO_COBRADO = 'Crédito cobrado';
export const ETIQUETA_EFECTIVO_MERCANCIA = 'Efectivo mercancía';

export function etiquetaCobroRecoleccion(m) {
  return esCreditoCobrado(m) ? ETIQUETA_CREDITO_COBRADO : ETIQUETA_EFECTIVO_MERCANCIA;
}

const r2 = (n) => Math.round(n * 100) / 100;

/** Separa movimientos en créditos cobrados y efectivo por mercancía vendida. */
export function separarCreditosYEfectivo(items) {
  const creditos = [];
  const efectivo = [];
  for (const m of items || []) {
    (esCreditoCobrado(m) ? creditos : efectivo).push(m);
  }
  const suma = (rows) => r2(rows.reduce((a, m) => a + Number(m.monto || 0), 0));
  return {
    creditos,
    efectivo,
    totalCreditos: suma(creditos),
    totalEfectivo: suma(efectivo),
    total: suma(items || []),
  };
}
