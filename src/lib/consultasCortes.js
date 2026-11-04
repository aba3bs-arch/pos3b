/**
 * Desglose de ventas por forma de pago de un corte (Consultas → Cajas de cobro → Cortes de caja).
 * Efectivo = venta cobrada en efectivo; tarjeta; otros electrónicos = transferencia, QR y demás.
 */
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function desgloseCorte(corte) {
  const g = corte?.grupos && typeof corte.grupos === 'object' ? corte.grupos : {};
  const efectivo = r2(g.efectivo ?? corte?.efectivoEsperado ?? corte?.efectivo_esperado ?? 0);
  const esTarjetaAbarrotes = corte?.tipoCaja === 'abarrotes_tarjeta';
  const tarjeta = r2(esTarjetaAbarrotes
    ? (corte.tarjetaAbarrotes ?? corte.electronico ?? g.tarjeta)
    : g.tarjeta);
  const electronicoTotal = r2(corte?.electronico ?? ((Number(g.tarjeta) || 0) + (Number(g.transferencia) || 0) + (Number(g.qr) || 0) + (Number(g.otros) || 0)));
  const otrosElectronicos = r2(Math.max(0, electronicoTotal - tarjeta));
  const total = r2(efectivo + tarjeta + otrosElectronicos);
  return { efectivo, tarjeta, otrosElectronicos, electronico: r2(tarjeta + otrosElectronicos), total };
}

const VENTANA_DUPLICADO_MS = 36 * 3600e3;

/**
 * Un cierre de Abarrotes cuya venta total es la misma de un corte POS de la misma tienda
 * (mismo monto, mismo día o contiguo) es la misma venta: se muestra pero no se suma dos veces.
 * Devuelve copias con `incluidoEnId` en los cierres duplicados.
 */
export function marcarCierresAbarrotesDuplicados(cortes) {
  const lista = cortes || [];
  const pos = lista.filter((c) => c?.tipoCaja !== 'abarrotes_tarjeta');
  const usados = new Set();
  return lista.map((c) => {
    if (c?.tipoCaja !== 'abarrotes_tarjeta' || !(Number(c.ventasCierre) > 0)) return c;
    const suc = String(c.sucursal_id || c.sucursal || '').toUpperCase();
    const t = new Date(c.created_at || c.hora || 0).getTime();
    const par = pos.find((p) => {
      if (usados.has(p.id)) return false;
      if (String(p.sucursal_id || p.sucursal || '').toUpperCase() !== suc) return false;
      if (Math.abs(r2(p.totalVentas ?? p.total_ventas) - r2(c.ventasCierre)) >= 0.01) return false;
      const tp = new Date(p.created_at || p.hora || 0).getTime();
      return Math.abs(tp - t) <= VENTANA_DUPLICADO_MS;
    });
    if (!par) return c;
    usados.add(par.id);
    return { ...c, incluidoEnId: par.id };
  });
}

export function totalesCortes(cortes) {
  const t = { efectivo: 0, tarjeta: 0, otrosElectronicos: 0, electronico: 0, total: 0, cortes: 0 };
  for (const c of cortes || []) {
    if (c?.incluidoEnId) continue;
    const d = desgloseCorte(c);
    t.efectivo += d.efectivo;
    t.tarjeta += d.tarjeta;
    t.otrosElectronicos += d.otrosElectronicos;
    t.cortes += 1;
  }
  t.efectivo = r2(t.efectivo);
  t.tarjeta = r2(t.tarjeta);
  t.otrosElectronicos = r2(t.otrosElectronicos);
  t.electronico = r2(t.tarjeta + t.otrosElectronicos);
  t.total = r2(t.efectivo + t.electronico);
  return t;
}
