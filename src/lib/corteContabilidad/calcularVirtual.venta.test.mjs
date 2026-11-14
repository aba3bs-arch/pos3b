import assert from 'node:assert/strict'
import { calcularVirtual } from './calc.js'
import { bonoBasePorMonto } from '../bonosConfig.js'

// Moneda final vacía, aunque el flag quede encendido, no es un conteo en cero.
const abierto = calcularVirtual({
  moneda_inicial: 15000,
  moneda_inicial_turno: 12267,
  moneda_final: '',
  moneda_final_editada: true,
  caja_anterior: 2733,
})
assert.equal(abierto.venta, 0)
assert.equal(bonoBasePorMonto(abierto.venta), 0)

// Conteo real: la venta del turno es MI − MF, no toda la moneda en caja.
const contado = calcularVirtual({
  moneda_inicial: 15000,
  moneda_inicial_turno: 13111,
  moneda_final: 12267,
  moneda_final_editada: true,
})
assert.equal(contado.venta, 844)
assert.equal(bonoBasePorMonto(contado.venta), 0)
assert.equal(bonoBasePorMonto(12267), 400)

console.log('calcularVirtual.venta.test.mjs ok')
