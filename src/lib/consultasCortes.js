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

export function totalesCortes(cortes) {
  const t = { efectivo: 0, tarjeta: 0, otrosElectronicos: 0, electronico: 0, total: 0, cortes: 0 };
  for (const c of cortes || []) {
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
