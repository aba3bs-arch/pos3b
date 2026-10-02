import assert from 'node:assert/strict'
import {
  BONOS_CONFIG_DEFAULT,
  DIAS_VENTANA_EVALUACION_BONO,
  DIAS_VENTANA_INVENTARIO_BONO,
  bonoBasePorMonto,
  bonoFinal,
  calcularPctBonoPorPenalizaciones,
  calcularPagosBonoPorEmpleado,
  normalizarBonosConfig,
} from './bonosConfig.js'
import { DIAS_BLOQUEO_BONO_POR_FALTA } from './resumenDiasAsistencia.js'
import { rangoVentanaInventarioBono } from './bonosData.js'

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
  assert.equal(cfg.reglas.faltanteCero.esRequisito, true)
  assert.equal(cfg.reglas.evaluacionMinPct.ventanaDias, DIAS_VENTANA_EVALUACION_BONO)
  assert.equal(cfg.reglas.mermaMaxPct.ventanaDias, DIAS_VENTANA_INVENTARIO_BONO)
  assert.equal(DIAS_VENTANA_EVALUACION_BONO, 15)
  assert.equal(DIAS_VENTANA_INVENTARIO_BONO, 8)
  assert.equal(DIAS_BLOQUEO_BONO_POR_FALTA, 8)
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
  // Con faltante → 0% (requisito duro: turno con faltante en esa recolección)
  const r = calcularPctBonoPorPenalizaciones({
    faltanteOk: false,
    checklistDias: 6,
    evaluacionPct: 90,
    mermaPct: 1,
  })
  assert.equal(r.pct, 0)
  assert.equal(r.bloqueadoPorFaltante, true)
  assert.equal(r.fallosLineamiento, 1)
}

{
  // Si se desactiva requisito duro → −25% como lineamiento
  const cfg = normalizarBonosConfig({
    ...BONOS_CONFIG_DEFAULT,
    reglas: {
      ...BONOS_CONFIG_DEFAULT.reglas,
      faltanteCero: { ...BONOS_CONFIG_DEFAULT.reglas.faltanteCero, esRequisito: false },
    },
  })
  const r = calcularPctBonoPorPenalizaciones({
    faltanteOk: false,
    checklistDias: 6,
    evaluacionPct: 90,
    mermaPct: 1,
  }, cfg)
  assert.equal(r.pct, 75)
  assert.equal(r.bloqueadoPorFaltante, false)
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
  // 2 fallos → 50%; 3 → 25%; 4 → 0% (sin faltante duro: solo lineamientos −25%)
  const soft = normalizarBonosConfig({
    ...BONOS_CONFIG_DEFAULT,
    reglas: {
      ...BONOS_CONFIG_DEFAULT.reglas,
      faltanteCero: { ...BONOS_CONFIG_DEFAULT.reglas.faltanteCero, esRequisito: false },
    },
  })
  assert.equal(calcularPctBonoPorPenalizaciones({
    faltanteOk: false,
    checklistDias: 3,
    evaluacionPct: 80,
    mermaPct: 2,
  }, soft).pct, 50)
  assert.equal(calcularPctBonoPorPenalizaciones({
    faltanteOk: false,
    checklistDias: 3,
    evaluacionPct: 60,
    mermaPct: 2,
  }, soft).pct, 25)
  assert.equal(calcularPctBonoPorPenalizaciones({
    faltanteOk: false,
    checklistDias: 3,
    evaluacionPct: 60,
    mermaPct: 7,
  }, soft).pct, 0)
}

{
  // Bono final con tabulador (1 fallo checklist → 75%)
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
  // Ejemplo operativo: recolección $6,900 → base $200 c/u
  // Total al 100% entre 2 empleados = $400. Al 75% → $150 c/u.
  const base = bonoBasePorMonto(6900)
  assert.equal(base, 200)
  assert.equal(bonoFinal(base, 100), 200)
  assert.equal(bonoFinal(base, 75), 150)
  const pagos100 = calcularPagosBonoPorEmpleado({
    base,
    pctTienda: 100,
    plantilla: [
      { id: 1, nombre: 'Ana TD' },
      { id: 2, nombre: 'Luis TN' },
    ],
  })
  assert.equal(pagos100[0].pago + pagos100[1].pago, 400)
  assert.equal(pagos100.every((p) => p.pago === 200), true)

  const pagos75 = calcularPagosBonoPorEmpleado({
    base,
    pctTienda: 75,
    plantilla: [
      { id: 1, nombre: 'Ana TD' },
      { id: 2, nombre: 'Luis TN' },
    ],
  })
  assert.equal(pagos75.every((p) => p.pago === 150), true)
  assert.equal(pagos75[0].pago + pagos75[1].pago, 300)
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
  assert.equal(cfg.reglas.faltanteCero.esRequisito, true)
  assert.equal(cfg.reglas.evaluacionMinPct.ventanaDias, 15)
  assert.equal(cfg.reglas.mermaMaxPct.ventanaDias, 8)
}

{
  // Ventana inventario: 3B5 = lunes → 8 días desde ese lunes
  const rango = rangoVentanaInventarioBono('3B5', {
    ventanaDias: 8,
    fecha: new Date('2026-09-16T18:00:00-07:00'), // miércoles
  })
  assert.equal(rango.fuente, 'calendario_tienda')
  assert.equal(rango.diaSemana, 1) // lunes
  assert.equal(rango.desde, '2026-09-14')
  assert.equal(rango.hasta, '2026-09-21')
}

console.log('bonosPenalizaciones.test.mjs ok')
