import assert from 'node:assert/strict';
import { esCategoriaProveedores } from './corteContabilidad/catalogoGastos.js';

// Smoke: proveedores se detectan y se excluyen de “gastos del negocio”
assert.equal(esCategoriaProveedores('PROVEEDORES'), true);
assert.equal(esCategoriaProveedores('proveedores'), true);
assert.equal(esCategoriaProveedores('NOMINA'), false);
assert.equal(esCategoriaProveedores('TAXIS'), false);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Réplica mínima de la separación panorama (sin Supabase). */
function simularPanorama({ ventas, costo, egresosIe, detalleGastosIe }) {
  const utilidadBruta = round2(ventas - costo);
  const egresosProvEnIe = round2(
    detalleGastosIe
      .filter((d) => esCategoriaProveedores(d.categoria))
      .reduce((s, d) => s + (Number(d.monto) || 0), 0),
  );
  const gastosOpMap = new Map();
  for (const d of detalleGastosIe) {
    if (esCategoriaProveedores(d.categoria)) continue;
    const cat = d.categoria || 'Otros';
    gastosOpMap.set(cat, round2((gastosOpMap.get(cat) || 0) + Number(d.monto)));
  }
  const gastosOperativos = round2([...gastosOpMap.values()].reduce((s, v) => s + v, 0)
    || Math.max(0, egresosIe - egresosProvEnIe));
  const gananciaNeta = round2(utilidadBruta - gastosOperativos);
  return { utilidadBruta, egresosProvEnIe, gastosOperativos, gananciaNeta, gastosOpMap };
}

{
  const r = simularPanorama({
    ventas: 1000,
    costo: 600,
    egresosIe: 450,
    detalleGastosIe: [
      { categoria: 'PROVEEDORES', monto: 250 },
      { categoria: 'NOMINA', monto: 120 },
      { categoria: 'TAXIS', monto: 80 },
    ],
  });
  // Proveedor NO entra en gastos del negocio
  assert.equal(r.egresosProvEnIe, 250);
  assert.equal(r.gastosOperativos, 200); // 120+80
  assert.equal(r.utilidadBruta, 400); // 1000-600
  assert.equal(r.gananciaNeta, 200); // 400-200
  assert.equal(r.gastosOpMap.has('PROVEEDORES'), false);
  assert.equal(r.gastosOpMap.get('NOMINA'), 120);
}

console.log('ieAbarrotesPanorama.test.mjs ok');
