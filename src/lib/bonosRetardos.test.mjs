import assert from 'node:assert/strict'
import { contarRetardosPeriodo, esRetardoBono } from './bonosRetardos.js'

const turnos = [{ id: 'diurno', hora_inicio: '07:00', hora_fin: '19:00' }]
const empleado = { id: '1', nombre: 'Ana', turno_id: 'diurno' }

assert.equal(esRetardoBono('07:00', '2026-11-16T07:15:00-07:00', 15), false)
assert.equal(esRetardoBono('07:00', '2026-11-16T07:16:00-07:00', 15), true)
assert.equal(esRetardoBono('07:00', '2026-11-16T07:00:00-07:00', 15), false)
assert.equal(esRetardoBono('19:00', '2026-11-17T00:10:00-07:00', 15), true)

{
  const c = contarRetardosPeriodo({
    empleado,
    desde: '2026-11-16',
    hasta: '2026-11-18',
    turnos,
    toleranciaMin: 15,
    hoy: '2026-11-18',
    marcajes: [
      { tipo: 'ENTRADA', created_at: '2026-11-16T07:10:00-07:00' },
      { tipo: 'ENTRADA', created_at: '2026-11-17T07:20:00-07:00' },
      { tipo: 'ENTRADA', created_at: '2026-11-18T07:16:00-07:00' },
    ],
  })
  assert.equal(c.retardos, 2)
}

{
  const c = contarRetardosPeriodo({
    empleado,
    desde: '2026-11-16',
    hasta: '2026-11-18',
    turnos,
    toleranciaMin: 15,
    hoy: '2026-11-18',
    marcajes: [
      { tipo: 'ENTRADA', created_at: '2026-11-16T07:30:00-07:00' },
      { tipo: 'ENTRADA', created_at: '2026-11-17T07:20:00-07:00' },
      { tipo: 'ENTRADA', created_at: '2026-11-18T07:16:00-07:00' },
    ],
  })
  assert.equal(c.retardos, 3)
}

console.log('bonosRetardos.test.mjs ok')
