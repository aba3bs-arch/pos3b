import assert from 'node:assert/strict'
import { setClavesDescansosAutorizados } from './descansosAutorizados.js'
import {
  calcularSuspensionBonoPorFaltas,
  clasificarHuecosSinAsistencia,
  construirCalendarioAsistencia,
  construirResumenEmpleados,
  diaLaborableParaBono,
  diasCompletosPorEntradaSalida,
  diasConAlgunaChecada,
  listarBloqueosBonoPorFalta,
  listarYmdInclusive,
  lineaResumenEmpleado,
  resumirDiasEmpleado,
  sumarDiasYmd,
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

// Turno nocturno 19:00 → 07:00: cuenta el día de la entrada (19 h), no el de la salida
{
  const noche19 = [
    { tipo: 'ENTRADA', created_at: '2026-08-10T19:00:00' },
    { tipo: 'SALIDA', created_at: '2026-08-11T07:00:00' },
  ]
  const dias = diasCompletosPorEntradaSalida(noche19)
  assert.equal(dias.size, 1)
  assert.ok(dias.has('2026-08-10'))
  assert.equal(dias.has('2026-08-11'), false)
}

{
  const { descansos, faltas, diasDescansoYmd, diasFaltaYmd } = clasificarHuecosSinAsistencia(
    new Set(['2026-08-10', '2026-08-16']),
    semana,
  )
  assert.equal(descansos, 1)
  assert.equal(faltas, 4)
  assert.deepEqual(diasDescansoYmd, ['2026-08-11'])
  assert.deepEqual(diasFaltaYmd, ['2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15'])
}

{
  const r = resumirDiasEmpleado({
    diasTrabajadosYmd: new Set(['2026-08-10', '2026-08-12']),
    desdeYmd: '2026-08-10',
    hastaYmd: '2026-08-16',
    ahora: new Date(2026, 7, 16, 20, 0, 0),
  })
  assert.deepEqual(r.diasTrabajadosYmd, ['2026-08-10', '2026-08-12'])
  assert.equal(r.mapaEstado['2026-08-10'], 'trabajado')
  assert.equal(r.mapaEstado['2026-08-11'], 'descanso')
  assert.equal(r.mapaEstado['2026-08-12'], 'trabajado')
  assert.equal(r.mapaEstado['2026-08-13'], 'descanso')
  assert.equal(r.mapaEstado['2026-08-14'], 'falta')
  assert.equal(r.mapaEstado['2026-08-15'], 'falta')
  assert.equal(r.mapaEstado['2026-08-16'], 'falta')
  assert.equal(r.descansos, 2)
  assert.equal(r.faltas, 3)
}

{
  const cal = construirCalendarioAsistencia({
    desdeYmd: '2026-08-10',
    hastaYmd: '2026-08-16',
    mapaEstado: {
      '2026-08-10': 'trabajado',
      '2026-08-11': 'descanso',
      '2026-08-12': 'trabajado',
    },
    ahora: new Date(2026, 7, 16, 12, 0, 0),
  })
  assert.ok(cal.semanas.length >= 1)
  const flat = cal.semanas.flat()
  const d10 = flat.find((c) => c.ymd === '2026-08-10')
  assert.equal(d10.estado, 'trabajado')
  // Lunes 10 ago 2026 → la primera celda de esa semana es lunes
  assert.equal(cal.semanas[0][0].ymd, '2026-08-10')
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
  // Sin plan: domingo habitual = descanso; miércoles sin checada = falta
  assert.equal(sandra.linea, 'sandra martinez: 3B10 dias 5 - descanso 1 - faltas 1')
  assert.equal(sandra.mapaEstado['2026-08-16'], 'descanso')
  assert.equal(sandra.mapaEstado['2026-08-12'], 'falta')
  // Liz: trabajó lun y dom; mar–sáb laborales sin checada = 5 faltas
  assert.equal(liz.linea, 'lizbeth selene lopez: FUSION dias 2 - descanso 0 - faltas 5')
}

{
  // Con plan horario: miércoles DESCANSO → no se marca como falta
  const ahora = new Date(2026, 7, 16, 20, 0, 0)
  const planMie = {
    version: 1,
    filas: [{
      id: 'emp:3B10:1',
      sucursal_id: '3B10',
      tipo: 'empleado',
      usuario_id: '1',
      nombre: 'sandra martinez',
      celdas: {
        0: { tipo: 'turno' },
        1: { tipo: 'turno' },
        2: { tipo: 'turno' },
        3: { tipo: 'descanso' },
        4: { tipo: 'turno' },
        5: { tipo: 'turno' },
        6: { tipo: 'turno' },
      },
    }],
  }
  const filas = construirResumenEmpleados({
    usuarios: [{ id: '1', nombre: 'sandra martinez', sucursal_id: '3B10', activo: true, rol: 'Cajero' }],
    marcajes: ['2026-08-10', '2026-08-11', '2026-08-13', '2026-08-14', '2026-08-15'].flatMap((d) =>
      parDia('1', 'sandra martinez', '3B10', d),
    ),
    desdeYmd: '2026-08-10',
    hastaYmd: '2026-08-16',
    ahora,
    plan: planMie,
  })
  const sandra = filas.find((f) => f.nombre === 'sandra martinez')
  assert.equal(sandra.mapaEstado['2026-08-12'], 'descanso', 'mié plan ≠ falta')
  // Plantilla con domingo = turno: si no checó, sí es falta (el descanso ya no es domingo)
  assert.equal(sandra.mapaEstado['2026-08-16'], 'falta')
  assert.equal(sandra.faltas, 1)
  assert.equal(sandra.descansos, 1)

  // Descanso autorizado en domingo → tampoco es falta
  const filasAut = construirResumenEmpleados({
    usuarios: [{ id: '1', nombre: 'sandra martinez', sucursal_id: '3B10', activo: true, rol: 'Cajero' }],
    marcajes: ['2026-08-10', '2026-08-11', '2026-08-13', '2026-08-14', '2026-08-15'].flatMap((d) =>
      parDia('1', 'sandra martinez', '3B10', d),
    ),
    desdeYmd: '2026-08-10',
    hastaYmd: '2026-08-16',
    ahora,
    plan: planMie,
    descansosAutorizados: [{ usuario_id: '1', fecha: '2026-08-16' }],
  })
  const s2 = filasAut.find((f) => f.nombre === 'sandra martinez')
  assert.equal(s2.mapaEstado['2026-08-16'], 'descanso', 'autorizado ≠ falta')
  assert.equal(s2.faltas, 0)
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

{
  // Bono: solo empleados de tienda dados de alta.
  // Entrada sola o salida sola → SÍ bono. Sin ambas en día laboral → falta.
  // Faltó lunes → sin bono 7 días; vuelve el próximo lunes.
  const dias = diasConAlgunaChecada([
    { tipo: 'ENTRADA', created_at: '2026-09-10T08:00:00' },
    { tipo: 'SALIDA', created_at: '2026-09-11T20:00:00' },
  ])
  assert.equal(dias.has('2026-09-10'), true)
  assert.equal(dias.has('2026-09-11'), true)

  const ahora = new Date(2026, 8, 16, 12, 0, 0) // miércoles 16 sep
  // Lun=1 Mar=2 Mié=3 — solo esos días laborales en el patrón de prueba
  const horarioLM = {
    tipo: 'personalizado',
    dias: { 1: 'diurno', 2: 'diurno', 3: 'diurno' },
  }

  // Manuel faltó lunes 14 (sin entrada ni salida). Hoy 16 → bloqueado; vuelve lunes 21.
  const bloqueos = listarBloqueosBonoPorFalta({
    usuarios: [{
      id: 'm1',
      nombre: 'Manuel',
      rol: 'Cajero',
      sucursal_id: '3B5',
      activo: true,
      tipo_empleado: 'tienda',
      turno_horario: horarioLM,
    }],
    marcajes: [
      ...parDia('m1', 'Manuel', '3B5', '2026-09-15'),
      ...parDia('m1', 'Manuel', '3B5', '2026-09-16'),
    ],
    sucursalId: '3B5',
    ahora,
    diasBloqueo: 7,
  })
  const manuel = bloqueos.find((b) => b.nombre === 'Manuel')
  assert.ok(manuel, 'Manuel debe estar bloqueado')
  assert.equal(manuel.faltaYmd, '2026-09-14')
  assert.equal(manuel.sinBonoHasta, '2026-09-20')
  assert.equal(manuel.vuelveBonoYmd, '2026-09-21')
  assert.equal(manuel.diasRestantes, 5)

  // María: solo entrada el lunes 14 → SÍ tiene bono
  const mariaOk = listarBloqueosBonoPorFalta({
    usuarios: [{
      id: 'ma1',
      nombre: 'Maria',
      rol: 'Cajero',
      sucursal_id: '3B5',
      activo: true,
      tipo_empleado: 'tienda',
      turno_horario: horarioLM,
    }],
    marcajes: [
      { usuario_id: 'ma1', nombre: 'Maria', sucursal_id: '3B5', tipo: 'ENTRADA', created_at: '2026-09-14T08:00:00' },
      ...parDia('ma1', 'Maria', '3B5', '2026-09-15'),
      ...parDia('ma1', 'Maria', '3B5', '2026-09-16'),
    ],
    sucursalId: '3B5',
    ahora,
    diasBloqueo: 7,
  })
  assert.equal(mariaOk.find((b) => b.nombre === 'Maria'), undefined)

  // Solo salida el lunes (olvidó entrada) → también tiene bono
  const soloSalida = listarBloqueosBonoPorFalta({
    usuarios: [{
      id: 's1',
      nombre: 'Sara',
      rol: 'Cajero',
      sucursal_id: '3B5',
      activo: true,
      tipo_empleado: 'tienda',
      turno_horario: horarioLM,
    }],
    marcajes: [
      { usuario_id: 's1', nombre: 'Sara', sucursal_id: '3B5', tipo: 'SALIDA', created_at: '2026-09-14T20:00:00' },
      ...parDia('s1', 'Sara', '3B5', '2026-09-15'),
      ...parDia('s1', 'Sara', '3B5', '2026-09-16'),
    ],
    sucursalId: '3B5',
    ahora,
    diasBloqueo: 7,
  })
  assert.equal(soloSalida.find((b) => b.nombre === 'Sara'), undefined)

  // Indirecto / baja no aparecen aunque no chequen
  const noPlantilla = listarBloqueosBonoPorFalta({
    usuarios: [
      {
        id: 'ind1',
        nombre: 'Indirecto Main',
        rol: 'Cajero',
        sucursal_id: 'MAIN',
        activo: true,
        tipo_empleado: 'indirecto',
        turno_horario: horarioLM,
      },
      {
        id: 'baja1',
        nombre: 'Baja Tienda',
        rol: 'Cajero',
        sucursal_id: '3B5',
        activo: false,
        tipo_empleado: 'tienda',
        turno_horario: horarioLM,
      },
    ],
    marcajes: [],
    sucursalId: '3B5',
    ahora,
    diasBloqueo: 7,
  })
  assert.equal(noPlantilla.length, 0)

  // Descanso del plan horario (día de la semana) no es falta
  const planDescansoLunes = {
    version: 1,
    filas: [{
      id: 'emp:3B5:d1',
      sucursal_id: '3B5',
      tipo: 'empleado',
      usuario_id: 'd1',
      nombre: 'Diana',
      celdas: {
        0: { tipo: 'turno' },
        1: { tipo: 'descanso' }, // lunes
        2: { tipo: 'turno' },
        3: { tipo: 'turno' },
        4: { tipo: 'turno' },
        5: { tipo: 'turno' },
        6: { tipo: 'turno' },
      },
    }],
  }
  const conPlan = listarBloqueosBonoPorFalta({
    usuarios: [{
      id: 'd1',
      nombre: 'Diana',
      rol: 'Cajero',
      sucursal_id: '3B5',
      activo: true,
      tipo_empleado: 'tienda',
      turno_id: 'diurno', // sin patrón: todos laborales salvo plan
    }],
    marcajes: [
      ...parDia('d1', 'Diana', '3B5', '2026-09-15'),
      ...parDia('d1', 'Diana', '3B5', '2026-09-16'),
    ],
    sucursalId: '3B5',
    ahora,
    diasBloqueo: 7,
    plan: planDescansoLunes,
  })
  // Lunes 14 es descanso en plan → no falta aunque no checó
  assert.equal(conPlan.find((b) => b.nombre === 'Diana' && b.faltaYmd === '2026-09-14'), undefined)

  // Cambio de descanso autorizado (fecha concreta) no es falta
  const conAut = listarBloqueosBonoPorFalta({
    usuarios: [{
      id: 'c1',
      nombre: 'Carlos',
      rol: 'Cajero',
      sucursal_id: '3B5',
      activo: true,
      tipo_empleado: 'tienda',
      turno_horario: horarioLM,
    }],
    marcajes: [
      ...parDia('c1', 'Carlos', '3B5', '2026-09-15'),
      ...parDia('c1', 'Carlos', '3B5', '2026-09-16'),
    ],
    sucursalId: '3B5',
    ahora,
    diasBloqueo: 7,
    descansosAutorizados: [{ usuario_id: 'c1', fecha: '2026-09-14' }],
  })
  assert.equal(conAut.find((b) => b.nombre === 'Carlos'), undefined)
}

{
  // 3B2 diurno: descanso habitual domingo. Movieron el descanso a miércoles en el plan.
  const planMie = {
    version: 1,
    filas: [{
      id: 'emp:3B2:e1',
      sucursal_id: '3B2',
      tipo: 'empleado',
      usuario_id: 'e1',
      nombre: 'Ana 3B2',
      celdas: {
        0: { tipo: 'turno' },
        1: { tipo: 'turno' },
        2: { tipo: 'turno' },
        3: { tipo: 'descanso' }, // miércoles
        4: { tipo: 'turno' },
        5: { tipo: 'turno' },
        6: { tipo: 'turno' },
      },
    }],
  }
  const user = {
    id: 'e1',
    nombre: 'Ana 3B2',
    rol: 'Cajero',
    sucursal_id: '3B2',
    activo: true,
    tipo_empleado: 'tienda',
    turno_id: 'diurno',
  }
  const ctx = { plan: planMie, hoy: '2026-09-16' }
  // Miércoles (nuevo descanso en plan) → no laboral
  assert.equal(diaLaborableParaBono(user, '2026-09-16', ctx), false)
  // Domingo previo (habitual) → no laboral (no ban falso)
  assert.equal(diaLaborableParaBono(user, '2026-09-13', ctx), false)
  // Martes → sí laboral
  assert.equal(diaLaborableParaBono(user, '2026-09-15', ctx), true)

  // Con checadas lun–mar y sin miércoles: no debe haber bloqueo
  const ahora = new Date(2026, 8, 16, 12, 0, 0)
  const marcajes = [
    ...parDia('e1', 'Ana 3B2', '3B2', '2026-09-14'),
    ...parDia('e1', 'Ana 3B2', '3B2', '2026-09-15'),
  ]
  // Rellenar lookback Lun–Sáb (domingo = habitual)
  for (let i = 1; i <= 50; i += 1) {
    const dt = new Date(2026, 8, 16)
    dt.setDate(dt.getDate() - i)
    if (dt.getDay() === 0) continue
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, '0')
    const d = String(dt.getDate()).padStart(2, '0')
    const ymd = `${y}-${m}-${d}`
    if (ymd === '2026-09-14' || ymd === '2026-09-15') continue
    marcajes.push(...parDia('e1', 'Ana 3B2', '3B2', ymd))
  }
  const bloqueos = listarBloqueosBonoPorFalta({
    usuarios: [user],
    marcajes,
    sucursalId: '3B2',
    ahora,
    diasBloqueo: 7,
    plan: planMie,
  })
  assert.equal(
    bloqueos.find((b) => b.nombre === 'Ana 3B2'),
    undefined,
    'Cambio de descanso a miércoles no debe aplicar ban',
  )
}

{
  // Semana pasada: plantilla con descanso miércoles debe respetarse aunque hoy esté en otra semana
  const planMie = {
    version: 1,
    filas: [{
      id: 'emp:3B2:p1',
      sucursal_id: '3B2',
      tipo: 'empleado',
      usuario_id: 'p1',
      nombre: 'Pedro Plan',
      celdas: {
        0: { tipo: 'turno' },
        1: { tipo: 'turno' },
        2: { tipo: 'turno' },
        3: { tipo: 'descanso' },
        4: { tipo: 'turno' },
        5: { tipo: 'turno' },
        6: { tipo: 'turno' },
      },
    }],
  }
  const user = {
    id: 'p1',
    nombre: 'Pedro Plan',
    rol: 'Cajero',
    sucursal_id: '3B2',
    activo: true,
    tipo_empleado: 'tienda',
    turno_id: 'diurno',
  }
  // Hoy = miércoles 23 sep; miércoles 16 es semana pasada sin override
  const ctxPasado = { plan: planMie, hoy: '2026-09-23' }
  assert.equal(diaLaborableParaBono(user, '2026-09-16', ctxPasado), false, 'mié plan pasado ≠ falta')
  assert.equal(diaLaborableParaBono(user, '2026-09-13', ctxPasado), false, 'dom habitual ≠ falta')
  assert.equal(diaLaborableParaBono(user, '2026-09-15', ctxPasado), true, 'mar laboral')

  // Override semana: descanso movido a jueves solo esa semana
  const planOv = {
    ...planMie,
    overridesSemana: {
      '2026-09-14': {
        'emp:3B2:p1': {
          0: { tipo: 'turno' },
          1: { tipo: 'turno' },
          2: { tipo: 'turno' },
          3: { tipo: 'turno' },
          4: { tipo: 'descanso' }, // jueves
          5: { tipo: 'turno' },
          6: { tipo: 'turno' },
        },
      },
    },
  }
  const ctxOv = { plan: planOv, hoy: '2026-09-23' }
  assert.equal(diaLaborableParaBono(user, '2026-09-17', ctxOv), false, 'jue override ≠ falta')
  assert.equal(diaLaborableParaBono(user, '2026-09-16', ctxOv), true, 'mié override = laboral')

  // Autorizado puntual siempre gana
  const autSet = setClavesDescansosAutorizados([{ usuario_id: 'p1', fecha: '2026-09-15' }])
  assert.equal(
    diaLaborableParaBono(user, '2026-09-15', { plan: planMie, hoy: '2026-09-23', descansosAutSet: autSet }),
    false,
    'descanso autorizado ≠ falta',
  )
}

{
  // Una falta lunes 14 → sin bono hasta dom 20; se reactiva lunes 21.
  const una = calcularSuspensionBonoPorFaltas(['2026-09-14'], { hoy: '2026-09-16', diasBloqueo: 7 })
  assert.ok(una)
  assert.equal(una.faltaYmd, '2026-09-14')
  assert.equal(una.primeraFaltaYmd, '2026-09-14')
  assert.equal(una.faltasCount, 1)
  assert.equal(una.diasAcumuladosExtra, 0)
  assert.equal(una.sinBonoHasta, '2026-09-20')
  assert.equal(una.vuelveBonoYmd, '2026-09-21')
  assert.equal(una.diasRestantes, 5)

  // El lunes 21 ya recuperó (si no faltó de nuevo).
  assert.equal(
    calcularSuspensionBonoPorFaltas(['2026-09-14'], { hoy: '2026-09-21', diasBloqueo: 7 }),
    null,
  )

  // Dos faltas (lun 14 y mié 16): se acumula la diferencia (2d) → vuelve mié 23 (= 16+7).
  const dos = calcularSuspensionBonoPorFaltas(['2026-09-14', '2026-09-16'], {
    hoy: '2026-09-17',
    diasBloqueo: 7,
  })
  assert.ok(dos)
  assert.equal(dos.faltasCount, 2)
  assert.equal(dos.primeraFaltaYmd, '2026-09-14')
  assert.equal(dos.faltaYmd, '2026-09-16')
  assert.equal(dos.diasAcumuladosExtra, 2)
  assert.equal(dos.vuelveBonoYmd, '2026-09-23')
  assert.equal(dos.sinBonoHasta, '2026-09-22')

  // Tras recuperar, una falta nueva empieza cadena limpia.
  const nueva = calcularSuspensionBonoPorFaltas(['2026-09-14', '2026-09-28'], {
    hoy: '2026-09-29',
    diasBloqueo: 7,
  })
  assert.ok(nueva)
  assert.equal(nueva.faltasCount, 1)
  assert.equal(nueva.faltaYmd, '2026-09-28')
  assert.equal(nueva.vuelveBonoYmd, '2026-10-05')
  assert.equal(nueva.diasAcumuladosExtra, 0)
}

{
  // Integración: dos faltas laborales (lun+mié) con patrón LM → bloqueo hasta mié+7.
  const horarioLM = {
    tipo: 'personalizado',
    dias: { 1: 'diurno', 2: 'diurno', 3: 'diurno' },
  }
  const ahora = new Date(2026, 8, 17, 12, 0, 0) // jueves 17 sep
  // Presencia en semanas previas para que solo cuenten las faltas recientes 14 y 16.
  const marcajesPrev = []
  for (const ymd of [
    '2026-08-10', '2026-08-11', '2026-08-12',
    '2026-08-17', '2026-08-18', '2026-08-19',
    '2026-08-24', '2026-08-25', '2026-08-26',
    '2026-08-31', '2026-09-01', '2026-09-02',
    '2026-09-07', '2026-09-08', '2026-09-09',
    '2026-09-15', // martes sí; lun 14 y mié 16 faltan
  ]) {
    marcajesPrev.push(...parDia('m2', 'Pedro', '3B5', ymd))
  }
  const bloqueos = listarBloqueosBonoPorFalta({
    usuarios: [{
      id: 'm2',
      nombre: 'Pedro',
      rol: 'Cajero',
      sucursal_id: '3B5',
      activo: true,
      tipo_empleado: 'tienda',
      turno_horario: horarioLM,
    }],
    marcajes: marcajesPrev,
    sucursalId: '3B5',
    ahora,
    diasBloqueo: 7,
  })
  const pedro = bloqueos.find((b) => b.nombre === 'Pedro')
  assert.ok(pedro)
  assert.equal(pedro.faltasCount, 2)
  assert.equal(pedro.primeraFaltaYmd, '2026-09-14')
  assert.equal(pedro.faltaYmd, '2026-09-16')
  assert.equal(pedro.diasAcumuladosExtra, 2)
  assert.equal(pedro.vuelveBonoYmd, '2026-09-23')
}

console.log('resumenDiasAsistencia.test.mjs ok')
