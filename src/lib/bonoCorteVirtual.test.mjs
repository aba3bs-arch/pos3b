import assert from 'node:assert/strict'
import {
  BONOS_CONFIG_DEFAULT,
  bonoBasePorMonto,
  bonoFinal,
  calcularPctBonoPorPenalizaciones,
} from './bonosConfig.js'
import { esGastoBonoRecoleccion, GASTO_BONO_RECOLECCION } from './bonosData.js'

{
  // Venta corte = tope − MF → tabulador (ej. 15000 − 8000 = 7000 → $200)
  const venta = 15000 - 8000
  assert.equal(venta, 7000)
  const base = bonoBasePorMonto(venta, BONOS_CONFIG_DEFAULT)
  assert.equal(base, 200) // rango 4001–7000
  const pct = calcularPctBonoPorPenalizaciones({
    faltanteOk: true,
    checklistDias: 6,
    evaluacionPct: 80,
    mermaPct: 2,
  }).pct
  assert.equal(pct, 100)
  assert.equal(bonoFinal(base, pct), 200)
}

{
  const venta = 7000
  const base = bonoBasePorMonto(venta)
  const pct = calcularPctBonoPorPenalizaciones({
    faltanteOk: true,
    checklistDias: 4,
    evaluacionPct: 80,
    mermaPct: 2,
  }).pct
  assert.equal(pct, 80)
  assert.equal(bonoFinal(base, pct), 160)
}

{
  assert.equal(GASTO_BONO_RECOLECCION.categoria, 'BONO RECOLECCION')
  assert.equal(esGastoBonoRecoleccion({ categoria: 'BONO RECOLECCION', monto: 100 }), true)
  assert.equal(esGastoBonoRecoleccion({ categoria: 'EMPLEADO', monto: 100 }), false)
}

console.log('bonoCorteVirtual.test.mjs ok')
