import assert from 'node:assert/strict'
import {
  BONOS_CONFIG_DEFAULT,
  bonoBasePorMonto,
  bonoFinal,
  calcularPctBonoPorPenalizaciones,
  calcularPagosBonoPorEmpleado,
  normalizarBonosConfig,
} from './bonosConfig.js'

{
  const cfg = normalizarBonosConfig(BONOS_CONFIG_DEFAULT)
  assert.equal(cfg.modoCalculo, 'penalizaciones')
  assert.equal(cfg.reglas.mermaMaxPct.maxPct, 6)
  assert.equal(cfg.reglas.evaluacionMinPct.minPct, 70)
  assert.equal(cfg.reglas.checklistDiario.diasPenalizaSiHasta, 4)
  assert.equal(cfg.reglas.checklistDiario.penalizacionPct, 25)
  assert.equal(cfg.reglas.evaluacionMinPct.penalizacionPct, 25)
  assert.equal(cfg.reglas.mermaMaxPct.penalizacionPct, 25)
  assert.equal(cfg.reglas.faltanteCero.penalizacionPct, 25)
  assert.equal(cfg.reglas.faltanteCero.esRequisito, false)
}

{
  // Todo OK → 100% del tabulador
  const r = calcularPctBonoPorPenalizaciones({
    faltanteOk: true,
    checklistDias: 6,
    evaluacionPct: 85,
    mermaPct: 2,
  })
  assert.equal(r.pct, 100)
  assert.equal(r.bloqueadoPorFaltante, false)
  assert.equal(r.penalizacionTotal, 0)
  assert.equal(r.fallosLineamiento, 0)
}

{
  // Con faltante → −25% (lineamiento, no requisito duro)
  const r = calcularPctBonoPorPenalizaciones({
    faltanteOk: false,
    checklistDias: 6,
    evaluacionPct: 90,
    mermaPct: 1,
  })
  assert.equal(r.pct, 75)
  assert.equal(r.bloqueadoPorFaltante, false)
  assert.equal(r.fallosLineamiento, 1)
}

{
  // Check list < 4 días → −25%; 4–6 OK
  const r = calcularPctBonoPorPenalizaciones({
    faltanteOk: true,
    checklistDias: 3,
    evaluacionPct: 80,
    mermaPct: 3,
  })
  assert.equal(r.pct, 75)
  assert.equal(r.penalizacionTotal, 25)
}

{
  // 4 días checklist: no penaliza (mínimo 4)
  const r = calcularPctBonoPorPenalizaciones({
    faltanteOk: true,
    checklistDias: 4,
    evaluacionPct: 80,
    mermaPct: 3,
  })
  assert.equal(r.pct, 100)
}

{
  // Evaluación < 70 → −25%
  const r = calcularPctBonoPorPenalizaciones({
    faltanteOk: true,
    checklistDias: 6,
    evaluacionPct: 65,
    mermaPct: 2,
  })
  assert.equal(r.pct, 75)
}

{
  // Inventario merma > 6% → −25%
  const r = calcularPctBonoPorPenalizaciones({
    faltanteOk: true,
    checklistDias: 6,
    evaluacionPct: 80,
    mermaPct: 6.1,
  })
  assert.equal(r.pct, 75)
  assert.equal(r.penalizacionTotal, 25)
}

{
  // 2 fallos → 50%; 3 → 25%; 4 → 0%
  assert.equal(calcularPctBonoPorPenalizaciones({
    faltanteOk: false,
    checklistDias: 3,
    evaluacionPct: 80,
    mermaPct: 2,
  }).pct, 50)
  assert.equal(calcularPctBonoPorPenalizaciones({
    faltanteOk: false,
    checklistDias: 3,
    evaluacionPct: 60,
    mermaPct: 2,
  }).pct, 25)
  assert.equal(calcularPctBonoPorPenalizaciones({
    faltanteOk: false,
    checklistDias: 3,
    evaluacionPct: 60,
    mermaPct: 7,
  }).pct, 0)
}

{
  // Bono final con tabulador (1 fallo → 75%)
  const base = bonoBasePorMonto(8500) // rango 7001–10000 → 300
  assert.equal(base, 300)
  const pct = calcularPctBonoPorPenalizaciones({
    faltanteOk: true,
    checklistDias: 3,
    evaluacionPct: 80,
    mermaPct: 2,
  }).pct
  assert.equal(pct, 75)
  assert.equal(bonoFinal(base, pct), 225)
}

{
  // Ecuación por empleado: falta → 0%; sin falta → pct tienda
  const pagos = calcularPagosBonoPorEmpleado({
    base: 300,
    pctTienda: 75,
    plantilla: [
      { id: 1, nombre: 'Ana' },
      { id: 2, nombre: 'Luis' },
    ],
    bloqueosFalta: [{ clave: 'id:2', nombre: 'Luis' }],
  })
  assert.equal(pagos.length, 2)
  assert.equal(pagos[0].nombre, 'Ana')
  assert.equal(pagos[0].pct, 75)
  assert.equal(pagos[0].pago, 225)
  assert.match(pagos[0].ecuacion, /Ana · \$300 × 75% = \$225/)
  assert.equal(pagos[1].nombre, 'Luis')
  assert.equal(pagos[1].conFalta, true)
  assert.equal(pagos[1].pct, 0)
  assert.equal(pagos[1].pago, 0)
  assert.match(pagos[1].ecuacion, /0% \(falta\)/)
}

// Migración: castigos viejos 20/60 → 25 (umbrales solo migran si no había penalizacionPct)
{
  const cfg = normalizarBonosConfig({
    activo: true,
    reglas: {
      faltanteCero: { activo: true },
      mermaMaxPct: { activo: true, maxPct: 6, penalizacionPct: 60 },
      evaluacionMinPct: { activo: true, minPct: 70, penalizacionPct: 20 },
      checklistDiario: { activo: true, penalizacionPct: 20 },
    },
  })
  assert.equal(cfg.reglas.mermaMaxPct.penalizacionPct, 25)
  assert.equal(cfg.reglas.evaluacionMinPct.penalizacionPct, 25)
  assert.equal(cfg.reglas.checklistDiario.penalizacionPct, 25)
  assert.equal(cfg.modoCalculo, 'penalizaciones')
}

console.log('bonosPenalizaciones.test.mjs ok')
