import assert from 'node:assert/strict'
import {
  BONOS_CONFIG_DEFAULT,
  bonoBasePorMonto,
  bonoFinal,
  calcularPctBonoPorPenalizaciones,
  normalizarBonosConfig,
} from './bonosConfig.js'

{
  const cfg = normalizarBonosConfig(BONOS_CONFIG_DEFAULT)
  assert.equal(cfg.modoCalculo, 'penalizaciones')
  assert.equal(cfg.reglas.mermaMaxPct.maxPct, 6)
  assert.equal(cfg.reglas.evaluacionMinPct.minPct, 70)
  assert.equal(cfg.reglas.checklistDiario.diasPenalizaSiHasta, 4)
  assert.equal(cfg.reglas.checklistDiario.penalizacionPct, 20)
  assert.equal(cfg.reglas.mermaMaxPct.penalizacionPct, 60)
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
}

{
  // Con faltante → 0% (requisito)
  const r = calcularPctBonoPorPenalizaciones({
    faltanteOk: false,
    checklistDias: 6,
    evaluacionPct: 90,
    mermaPct: 1,
  })
  assert.equal(r.pct, 0)
  assert.equal(r.bloqueadoPorFaltante, true)
}

{
  // Check list < 4 días → −20%; 4–6 OK
  const r = calcularPctBonoPorPenalizaciones({
    faltanteOk: true,
    checklistDias: 3,
    evaluacionPct: 80,
    mermaPct: 3,
  })
  assert.equal(r.pct, 80)
  assert.equal(r.penalizacionTotal, 20)
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
  // 5 días checklist: no penaliza
  const r = calcularPctBonoPorPenalizaciones({
    faltanteOk: true,
    checklistDias: 5,
    evaluacionPct: 80,
    mermaPct: 3,
  })
  assert.equal(r.pct, 100)
}

{
  // Evaluación < 70 → −20%
  const r = calcularPctBonoPorPenalizaciones({
    faltanteOk: true,
    checklistDias: 6,
    evaluacionPct: 65,
    mermaPct: 2,
  })
  assert.equal(r.pct, 80)
}

{
  // Inventario merma > 6% → −60%
  const r = calcularPctBonoPorPenalizaciones({
    faltanteOk: true,
    checklistDias: 6,
    evaluacionPct: 80,
    mermaPct: 6.1,
  })
  assert.equal(r.pct, 40)
  assert.equal(r.penalizacionTotal, 60)
}

{
  // Combinado: check 4d (−20) + eval 60 (−20) + merma 7 (−60) = 0%
  const r = calcularPctBonoPorPenalizaciones({
    faltanteOk: true,
    checklistDias: 3,
    evaluacionPct: 60,
    mermaPct: 7,
  })
  assert.equal(r.pct, 0)
  assert.equal(r.penalizacionTotal, 100)
}

{
  // Bono final con tabulador (3 días checklist → −20%)
  const base = bonoBasePorMonto(8500) // rango 7001–10000 → 300
  assert.equal(base, 300)
  const pct = calcularPctBonoPorPenalizaciones({
    faltanteOk: true,
    checklistDias: 3,
    evaluacionPct: 80,
    mermaPct: 2,
  }).pct
  assert.equal(pct, 80)
  assert.equal(bonoFinal(base, pct), 240)
}

// Migración: configs viejas sin penalizacionPct → defaults nuevos + umbrales 6%/70%
{
  const cfg = normalizarBonosConfig({
    activo: true,
    reglas: {
      faltanteCero: { activo: true },
      mermaMaxPct: { activo: true, maxPct: 2.5 },
      evaluacionMinPct: { activo: true, minPct: 75 },
      checklistDiario: { activo: true },
    },
  })
  assert.equal(cfg.reglas.mermaMaxPct.maxPct, 6)
  assert.equal(cfg.reglas.evaluacionMinPct.minPct, 70)
  assert.equal(cfg.reglas.mermaMaxPct.penalizacionPct, 60)
  assert.equal(cfg.reglas.evaluacionMinPct.penalizacionPct, 20)
  assert.equal(cfg.modoCalculo, 'penalizaciones')
}

console.log('bonosPenalizaciones.test.mjs ok')
