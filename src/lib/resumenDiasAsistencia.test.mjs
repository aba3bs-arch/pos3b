import assert from 'node:assert/strict'
import {
  clasificarHuecosSinAsistencia,
  construirResumenEmpleados,
  diasCompletosPorEntradaSalida,
  listarYmdInclusive,
  lineaResumenEmpleado,
  resumirDiasEmpleado,
} from './resumenDiasAsistencia.js'

const semana = listarYmdInclusive('2026-08-10', '2026-08-16')
assert.deepEqual(semana, [
  '2026-08-10',
  '2026-08-11',
  '2026-08-12',
  '2026-08-13',
  '2026-08-14',
  '2026-08-15',
  '2026-08-16',
])

function parDia(usuario_id, nombre, sucursal_id, ymd) {
  return [
    {
      usuario_id,
      nombre,
      sucursal_id,
      tipo: 'ENTRADA',
      created_at: `${ymd}T08:00:00`,
    },
    {
      usuario_id,
      nombre,
      sucursal_id,
      tipo: 'SALIDA',
      created_at: `${ymd}T16:00:00`,
    },
  ]
}

// Sandra: 5 días + 2 descansos aislados (p. ej. mié y dom)
{
  const trab = new Set(['2026-08-10', '2026-08-11', '2026-08-13', '2026-08-14', '2026-08-15'])
  const { descansos, faltas } = clasificarHuecosSinAsistencia(trab, semana)
  assert.equal(trab.size, 5)
  assert.equal(descansos, 2)
  assert.equal(faltas, 0)
}

// Lizbeth: 2 días + racha de 5 sin checada → 1 descanso + 4 faltas
{
  const trab = new Set(['2026-08-10', '2026-08-16'])
  const { descansos, faltas } = clasificarHuecosSinAsistencia(trab, semana)
  assert.equal(trab.size, 2)
  assert.equal(descansos, 1)
  assert.equal(faltas, 4)
}

// Racha al inicio (lun-mar) y al final (jue-dom)
{
  const trab = new Set(['2026-08-12'])
  const { descansos, faltas } = clasificarHuecosSinAsistencia(trab, semana)
  assert.equal(descansos, 2)
  assert.equal(faltas, 4) // 1 + 3
}

{
  const r = resumirDiasEmpleado({
    diasTrabajadosYmd: new Set(['2026-08-10']),
    desdeYmd: '2026-08-10',
    hastaYmd: '2026-08-20',
    ahora: new Date(2026, 7, 12), // 12 ago: periodo efectivo lun-mié
  })
  assert.equal(r.dias, 1)
  assert.equal(r.descansos, 1)
  assert.equal(r.faltas, 1) // 11 y 12 sin checada = 1 descanso + 1 falta
}

assert.equal(
  lineaResumenEmpleado({
    nombre: 'sandra martinez',
    sucursalEtiqueta: '3B10',
    dias: 5,
    descansos: 2,
    faltas: 0,
  }),
  'sandra martinez: 3B10 dias 5 - descanso 2 - faltas 0',
)

{
  const soloEntrada = [
    { tipo: 'ENTRADA', created_at: '2026-08-10T08:00:00' },
    { tipo: 'ENTRADA', created_at: '2026-08-11T08:00:00' },
  ]
  assert.equal(diasCompletosPorEntradaSalida(soloEntrada).size, 0)
}

{
  const noche = [
    { tipo: 'ENTRADA', created_at: '2026-08-10T22:00:00' },
    { tipo: 'SALIDA', created_at: '2026-08-11T06:00:00' },
  ]
  const dias = diasCompletosPorEntradaSalida(noche)
  assert.equal(dias.size, 1)
  assert.ok(dias.has('2026-08-10'))
  assert.equal(dias.has('2026-08-11'), false)
}

{
  const ahora = new Date(2026, 7, 16, 20, 0, 0)
  const usuarios = [
    { id: '1', nombre: 'sandra martinez', sucursal_id: '3B10', activo: true, rol: 'Cajero' },
    { id: '2', nombre: 'lizbeth selene lopez', sucursal_id: 'FUSION', activo: true, rol: 'Cajero' },
  ]
  const marcajes = [
    ...['2026-08-10', '2026-08-11', '2026-08-13', '2026-08-14', '2026-08-15'].flatMap((d) =>
      parDia('1', 'sandra martinez', '3B10', d),
    ),
    ...['2026-08-10', '2026-08-16'].flatMap((d) => parDia('2', 'lizbeth selene lopez', 'FUSION', d)),
  ]
  const filas = construirResumenEmpleados({
    usuarios,
    marcajes,
    desdeYmd: '2026-08-10',
    hastaYmd: '2026-08-16',
    ahora,
  })
  assert.equal(filas.length, 2)
  const sandra = filas.find((f) => f.nombre === 'sandra martinez')
  const liz = filas.find((f) => f.nombre === 'lizbeth selene lopez')
  assert.equal(sandra.linea, 'sandra martinez: 3B10 dias 5 - descanso 2 - faltas 0')
  assert.equal(liz.linea, 'lizbeth selene lopez: FUSION dias 2 - descanso 1 - faltas 4')
}

{
  const ahora = new Date(2026, 7, 16, 20, 0, 0)
  const filas = construirResumenEmpleados({
    usuarios: [{ id: '1', nombre: 'sandra martinez', sucursal_id: '3B10', activo: true, rol: 'Cajero' }],
    marcajes: [
      {
        usuario_id: null,
        nombre: 'juan perez (cubre turno)',
        sucursal_id: '3B10',
        tipo: 'ENTRADA',
        created_at: '2026-08-11T08:00:00',
      },
      {
        usuario_id: null,
        nombre: 'juan perez (cubre turno)',
        sucursal_id: '3B10',
        tipo: 'SALIDA',
        created_at: '2026-08-11T16:00:00',
      },
      {
        usuario_id: null,
        nombre: 'juan perez (cubre turno)',
        sucursal_id: '3B10',
        tipo: 'ENTRADA',
        created_at: '2026-08-13T08:00:00',
      },
      {
        usuario_id: null,
        nombre: 'juan perez (cubre turno)',
        sucursal_id: '3B10',
        tipo: 'SALIDA',
        created_at: '2026-08-13T16:00:00',
      },
    ],
    desdeYmd: '2026-08-10',
    hastaYmd: '2026-08-16',
    ahora,
    filtroSucursal: '3B10',
  })
  const ct = filas.find((f) => f.esCubreTurno)
  assert.ok(ct)
  assert.equal(ct.nombre, 'juan perez')
  assert.equal(ct.dias, 2)
  assert.equal(ct.descansos, 0)
  assert.equal(ct.faltas, 0)
}

// Solo entradas (p. ej. María Milagros / Luz Elena): no es día trabajado
{
  const ahora = new Date(2026, 7, 16, 20, 0, 0)
  const filas = construirResumenEmpleados({
    usuarios: [{ id: '9', nombre: 'maria milagros', sucursal_id: '3B10', activo: true, rol: 'Cajero' }],
    marcajes: ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16'].map(
      (d) => ({
        usuario_id: '9',
        nombre: 'maria milagros',
        sucursal_id: '3B10',
        tipo: 'ENTRADA',
        created_at: `${d}T08:00:00`,
      }),
    ),
    desdeYmd: '2026-08-10',
    hastaYmd: '2026-08-16',
    ahora,
    filtroSucursal: '3B10',
  })
  const maria = filas.find((f) => f.nombre === 'maria milagros')
  assert.equal(maria.dias, 0)
  assert.equal(maria.descansos, 1)
  assert.equal(maria.faltas, 6)
}

console.log('resumenDiasAsistencia.test.mjs ok')
