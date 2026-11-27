import assert from 'node:assert/strict'
import {
  faltasTrasReactivacion,
  idDesdeClaveBloqueoBono,
  mapaReactivacionesBono,
  ymdReactivacion,
} from './bonosReactivaciones.js'

assert.equal(idDesdeClaveBloqueoBono('id:17a2deb8-ff8e-469d-b20f-048a019fefb3'), '17a2deb8-ff8e-469d-b20f-048a019fefb3')
assert.equal(idDesdeClaveBloqueoBono('abc'), 'abc')
assert.equal(ymdReactivacion({ vuelve_ymd: '2026-11-27T00:00:00' }), '2026-11-27')
assert.equal(ymdReactivacion({ vuelveYmd: '2026-11-27' }), '2026-11-27')

{
  const map = mapaReactivacionesBono([
    { usuario_id: 'sandra', sucursal_id: '3B6', vuelve_ymd: '2026-11-27' },
    { usuarioId: 'x', vuelveYmd: 'mala' },
  ])
  assert.equal(map.sandra.vuelveYmd, '2026-11-27')
  assert.equal(map['id:sandra'].usuarioId, 'sandra')
  assert.equal(map.x, undefined)
}

{
  const faltas = ['2026-11-18', '2026-11-20', '2026-11-26']
  // Fecha futura: no recorta; el ban sigue y se puede mostrar esa fecha.
  assert.deepEqual(
    faltasTrasReactivacion(faltas, { hoy: '2026-11-27', vuelveYmd: '2026-11-30' }),
    faltas,
  )
  // Reactivar hoy: se ignoran las faltas anteriores a hoy.
  assert.deepEqual(
    faltasTrasReactivacion(faltas, { hoy: '2026-11-27', vuelveYmd: '2026-11-27' }),
    [],
  )
  // Corregir a una fecha pasada: solo cuentan faltas desde esa fecha.
  assert.deepEqual(
    faltasTrasReactivacion(faltas, { hoy: '2026-11-27', vuelveYmd: '2026-11-25' }),
    ['2026-11-26'],
  )
  assert.deepEqual(
    faltasTrasReactivacion(faltas, { hoy: '2026-11-27', vuelveYmd: '' }),
    faltas,
  )
}

console.log('bonosReactivaciones.test.mjs ok')
