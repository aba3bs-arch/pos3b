/**
 * Resumen de días trabajados / descansos / faltas a partir de checadas.
 *
 * Un día trabajado exige par ENTRADA + SALIDA (si solo hay entrada, no cuenta).
 * Turno nocturno (p. ej. 19:00 → 07:00 del día siguiente): la salida cae al día
 * siguiente, pero el día que cuenta es el de la ENTRADA (cuando empieza a las 19 h).
 * Los días del periodo (hasta hoy) sin par completo se agrupan en rachas:
 * - 1 día suelto → 1 descanso
 * - N días seguidos sin par → 1 descanso + (N − 1) faltas
 */

import { esAlmacenCentral, normalizarCodigoTienda } from '../constants/sucursales.js'
import {
  claveDescansoAutorizado,
  listarDescansosAutorizados,
  setClavesDescansosAutorizados,
} from './descansosAutorizados.js'
import { resolverTipoEmpleado } from './empleadosVisibles.js'
import { normalizarNombreEmpleado } from './nominaMatch.js'
import { esDescansoEnPlanHorario } from './planHorario.js'
import { leerPlanHorarioLocal, sincronizarPlanHorarioDesdeNube } from './planHorarioSync.js'
import { normalizarRol } from './roles.js'
import { ymdLocal } from './semanaNomina.js'
import { parseTurnoHorario, turnoIdParaUsuario } from './turnos.js'
import { esAdministradorSinAnclaje, usuarioEstaActivo } from './usuariosAuth.js'

export function ymdLocalDesdeIso(iso) {
  if (!iso) return ''
  return ymdLocal(iso)
}

export function listarYmdInclusive(desdeYmd, hastaYmd) {
  if (!desdeYmd || !hastaYmd || desdeYmd > hastaYmd) return []
  const [y0, m0, d0] = desdeYmd.split('-').map(Number)
  const [y1, m1, d1] = hastaYmd.split('-').map(Number)
  const cur = new Date(y0, m0 - 1, d0)
  const fin = new Date(y1, m1 - 1, d1)
  const out = []
  while (cur <= fin) {
    out.push(ymdLocal(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

/** Recorta el periodo a días ya transcurridos (no cuenta el futuro). */
export function ymdHastaEfectivo(hastaYmd, ahora = new Date()) {
  const hoy = ymdLocal(ahora)
  if (!hastaYmd) return hoy
  return hastaYmd < hoy ? hastaYmd : hoy
}

export function limpiarNombreAsistencia(nombre) {
  return String(nombre || '')
    .replace(/\s*\(cubre\s*turno\)\s*$/i, '')
    .trim()
}

export function esNombreCubreTurno(nombre) {
  return /\(\s*cubre\s*turno\s*\)/i.test(String(nombre || ''))
}

export function normalizarTipoMarcaje(tipo) {
  const t = String(tipo || '').trim().toUpperCase()
  if (t === 'ENTRADA' || t === 'SALIDA') return t
  return ''
}

/** Ventana máxima para emparejar una entrada con su salida (cubre 12×12 + extra). */
export const MAX_HORAS_PAR_ENTRADA_SALIDA = 18

/**
 * Días con jornada cerrada: cada ENTRADA se empareja con la siguiente SALIDA
 * (hasta 18 h). El día cuenta el de la entrada. Solo entrada no cuenta.
 */
export function diasCompletosPorEntradaSalida(marcajes = []) {
  const sorted = [...marcajes].filter((m) => m?.created_at)
  sorted.sort((a, b) => {
    const da = new Date(a.created_at).getTime()
    const db = new Date(b.created_at).getTime()
    if (Number.isNaN(da) || Number.isNaN(db)) return 0
    if (da !== db) return da - db
    return String(a.id || '').localeCompare(String(b.id || ''))
  })
  const maxMs = MAX_HORAS_PAR_ENTRADA_SALIDA * 3600 * 1000
  const salidasUsadas = new Set()
  const dias = new Set()
  for (let i = 0; i < sorted.length; i++) {
    if (normalizarTipoMarcaje(sorted[i].tipo) !== 'ENTRADA') continue
    const tEnt = new Date(sorted[i].created_at).getTime()
    if (Number.isNaN(tEnt)) continue
    for (let j = i + 1; j < sorted.length; j++) {
      if (salidasUsadas.has(j)) continue
      if (normalizarTipoMarcaje(sorted[j].tipo) !== 'SALIDA') continue
      const tSal = new Date(sorted[j].created_at).getTime()
      if (Number.isNaN(tSal) || tSal <= tEnt) continue
      if (tSal - tEnt > maxMs) break
      salidasUsadas.add(j)
      const ymd = ymdLocalDesdeIso(sorted[i].created_at)
      if (ymd) dias.add(ymd)
      break
    }
  }
  return dias
}

/**
 * @param {Set<string>} diasTrabajadosYmd
 * @param {string[]} diasPeriodoYmd
 * @returns {{ descansos: number, faltas: number, diasDescansoYmd: string[], diasFaltaYmd: string[] }}
 */
export function clasificarHuecosSinAsistencia(diasTrabajadosYmd, diasPeriodoYmd) {
  let descansos = 0
  let faltas = 0
  /** @type {string[]} */
  const diasDescansoYmd = []
  /** @type {string[]} */
  const diasFaltaYmd = []
  /** @type {string[]} */
  let rachaDias = []
  const flush = () => {
    if (rachaDias.length <= 0) return
    descansos += 1
    diasDescansoYmd.push(rachaDias[0])
    if (rachaDias.length > 1) {
      faltas += rachaDias.length - 1
      diasFaltaYmd.push(...rachaDias.slice(1))
    }
    rachaDias = []
  }
  for (const ymd of diasPeriodoYmd) {
    if (diasTrabajadosYmd.has(ymd)) {
      flush()
    } else {
      rachaDias.push(ymd)
    }
  }
  flush()
  return { descansos, faltas, diasDescansoYmd, diasFaltaYmd }
}

/**
 * Estado de un día en el calendario de asistencia.
 * @typedef {'trabajado' | 'descanso' | 'falta' | 'fuera' | 'futuro'} EstadoDiaAsistencia
 */

/**
 * @param {object} opts
 * @param {Set<string>|string[]} opts.diasTrabajadosYmd
 * @param {string} opts.desdeYmd
 * @param {string} opts.hastaYmd
 * @param {Date} [opts.ahora]
 * @param {boolean} [opts.soloDiasRegistrados] — cubre turno: sin descanso/faltas
 */
export function resumirDiasEmpleado({
  diasTrabajadosYmd,
  desdeYmd,
  hastaYmd,
  ahora,
  soloDiasRegistrados = false,
}) {
  const setTrab = diasTrabajadosYmd instanceof Set ? diasTrabajadosYmd : new Set(diasTrabajadosYmd || [])
  const hasta = ymdHastaEfectivo(hastaYmd, ahora)
  const periodo = listarYmdInclusive(desdeYmd, hasta)
  const trabajados = periodo.filter((d) => setTrab.has(d))
  const enPeriodo = new Set(trabajados)
  if (soloDiasRegistrados) {
    return {
      dias: enPeriodo.size,
      descansos: 0,
      faltas: 0,
      diasTrabajadosYmd: trabajados,
      diasDescansoYmd: [],
      diasFaltaYmd: [],
      mapaEstado: Object.fromEntries(trabajados.map((d) => [d, 'trabajado'])),
    }
  }
  const { descansos, faltas, diasDescansoYmd, diasFaltaYmd } = clasificarHuecosSinAsistencia(
    enPeriodo,
    periodo,
  )
  /** @type {Record<string, EstadoDiaAsistencia>} */
  const mapaEstado = {}
  for (const d of trabajados) mapaEstado[d] = 'trabajado'
  for (const d of diasDescansoYmd) mapaEstado[d] = 'descanso'
  for (const d of diasFaltaYmd) mapaEstado[d] = 'falta'
  return {
    dias: enPeriodo.size,
    descansos,
    faltas,
    diasTrabajadosYmd: trabajados,
    diasDescansoYmd,
    diasFaltaYmd,
    mapaEstado,
  }
}

/**
 * Semanas (lun→dom) que cubren el rango, para pintar el calendario.
 * Celdas fuera del periodo llevan estado `fuera`.
 * @returns {{ semanas: Array<Array<{ ymd: string, dia: number, estado: EstadoDiaAsistencia }>>, desdeYmd: string, hastaYmd: string }}
 */
export function construirCalendarioAsistencia({
  desdeYmd,
  hastaYmd,
  mapaEstado = {},
  ahora = new Date(),
} = {}) {
  if (!desdeYmd || !hastaYmd || desdeYmd > hastaYmd) {
    return { semanas: [], desdeYmd: desdeYmd || '', hastaYmd: hastaYmd || '' }
  }
  const hoy = ymdLocal(ahora)
  const [y0, m0, d0] = desdeYmd.split('-').map(Number)
  const [y1, m1, d1] = hastaYmd.split('-').map(Number)
  const inicio = new Date(y0, m0 - 1, d0)
  const fin = new Date(y1, m1 - 1, d1)
  // Alinear al lunes de la semana del inicio (getDay: 0=dom … 6=sáb)
  const dowIni = inicio.getDay()
  const offsetLun = dowIni === 0 ? -6 : 1 - dowIni
  const cur = new Date(inicio)
  cur.setDate(inicio.getDate() + offsetLun)
  // Extender hasta el domingo de la semana del fin
  const dowFin = fin.getDay()
  const offsetDom = dowFin === 0 ? 0 : 7 - dowFin
  const finGrid = new Date(fin)
  finGrid.setDate(fin.getDate() + offsetDom)

  /** @type {Array<Array<{ ymd: string, dia: number, estado: EstadoDiaAsistencia }>>} */
  const semanas = []
  /** @type {Array<{ ymd: string, dia: number, estado: EstadoDiaAsistencia }>} */
  let semana = []
  while (cur <= finGrid) {
    const ymd = ymdLocal(cur)
    let estado = /** @type {EstadoDiaAsistencia} */ ('fuera')
    if (ymd >= desdeYmd && ymd <= hastaYmd) {
      if (ymd > hoy) estado = 'futuro'
      else estado = /** @type {EstadoDiaAsistencia} */ (mapaEstado[ymd] || 'fuera')
    }
    semana.push({ ymd, dia: cur.getDate(), estado })
    if (semana.length === 7) {
      semanas.push(semana)
      semana = []
    }
    cur.setDate(cur.getDate() + 1)
  }
  if (semana.length) semanas.push(semana)
  return { semanas, desdeYmd, hastaYmd }
}

export function lineaResumenEmpleado({ nombre, sucursalEtiqueta, dias, descansos, faltas }) {
  const suc = sucursalEtiqueta || '—'
  return `${nombre}: ${suc} dias ${dias} - descanso ${descansos} - faltas ${faltas}`
}

function claveNombreSucursal(nombre, sucursalId) {
  const nom = normalizarNombreEmpleado(limpiarNombreAsistencia(nombre))
  const suc = normalizarCodigoTienda(sucursalId) || ''
  if (!nom) return ''
  return `nom:${nom}|${suc}`
}

/**
 * Días con al menos una checada (ENTRADA o SALIDA).
 * Para bono: entrada sin salida O salida sin entrada → SÍ tiene bono (no es falta).
 */
export function diasConAlgunaChecada(marcajes = []) {
  const dias = new Set()
  for (const m of marcajes || []) {
    if (!normalizarTipoMarcaje(m?.tipo)) continue
    const ymd = ymdLocalDesdeIso(m.created_at)
    if (ymd) dias.add(ymd)
  }
  return dias
}

/**
 * Una falta → sin bono desde ese día; se reactiva la siguiente semana el mismo día
 * (ej. faltó lunes 14 → vuelve lunes 21), si no volvió a faltar.
 * Varias faltas antes de recuperar: se acumula la diferencia de días entre faltas
 * (= se reactiva 7 días después de la última falta de la cadena).
 */
export const DIAS_BLOQUEO_BONO_POR_FALTA = 7

export function sumarDiasYmd(ymd, dias) {
  if (!ymd) return ''
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number)
  if (![y, m, d].every((n) => Number.isFinite(n))) return ''
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + (Number(dias) || 0))
  return ymdLocal(dt)
}

export function diasInclusiveEntre(desdeYmd, hastaYmd) {
  if (!desdeYmd || !hastaYmd || desdeYmd > hastaYmd) return 0
  const [y0, m0, d0] = desdeYmd.split('-').map(Number)
  const [y1, m1, d1] = hastaYmd.split('-').map(Number)
  const a = Date.UTC(y0, m0 - 1, d0)
  const b = Date.UTC(y1, m1 - 1, d1)
  return Math.floor((b - a) / 86400000) + 1
}

/** Días calendario entre dos YMD (0 si misma fecha; no inclusivo). */
export function diasEntreYmd(desdeYmd, hastaYmd) {
  if (!desdeYmd || !hastaYmd) return 0
  const [y0, m0, d0] = String(desdeYmd).slice(0, 10).split('-').map(Number)
  const [y1, m1, d1] = String(hastaYmd).slice(0, 10).split('-').map(Number)
  if (![y0, m0, d0, y1, m1, d1].every((n) => Number.isFinite(n))) return 0
  const a = Date.UTC(y0, m0 - 1, d0)
  const b = Date.UTC(y1, m1 - 1, d1)
  return Math.floor((b - a) / 86400000)
}

/**
 * Suspensión de bono por faltas encadenadas.
 *
 * @param {string[]} faltasYmd fechas de falta (día laboral sin entrada ni salida), orden indistinto
 * @param {{ hoy: string, diasBloqueo?: number }} opts
 * @returns {null | {
 *   faltaYmd: string,
 *   primeraFaltaYmd: string,
 *   faltasYmd: string[],
 *   faltasCount: number,
 *   diasAcumuladosExtra: number,
 *   sinBonoHasta: string,
 *   vuelveBonoYmd: string,
 *   diasRestantes: number,
 * }}
 */
export function calcularSuspensionBonoPorFaltas(faltasYmd = [], { hoy, diasBloqueo = DIAS_BLOQUEO_BONO_POR_FALTA } = {}) {
  const ban = Math.max(1, Number(diasBloqueo) || DIAS_BLOQUEO_BONO_POR_FALTA)
  const sorted = [...new Set((faltasYmd || []).map((x) => String(x || '').slice(0, 10)).filter(Boolean))].sort()
  if (!sorted.length || !hoy) return null

  let cadena = []
  let vuelve = null

  for (const f of sorted) {
    if (vuelve == null || f < vuelve) {
      // Misma cadena: cada falta mueve el regreso a f+7
      // (= primera+7 + suma de diferencias entre faltas consecutivas).
      cadena.push(f)
      vuelve = sumarDiasYmd(f, ban)
    } else {
      // Ya había recuperado el bono; cadena nueva.
      cadena = [f]
      vuelve = sumarDiasYmd(f, ban)
    }
  }

  if (!vuelve || !cadena.length) return null
  const primera = cadena[0]
  const ultima = cadena[cadena.length - 1]
  if (hoy < primera || hoy >= vuelve) return null

  const sinBonoHasta = sumarDiasYmd(vuelve, -1)
  let diasAcumuladosExtra = 0
  for (let i = 1; i < cadena.length; i += 1) {
    diasAcumuladosExtra += Math.max(0, diasEntreYmd(cadena[i - 1], cadena[i]))
  }

  return {
    faltaYmd: ultima,
    primeraFaltaYmd: primera,
    faltasYmd: cadena,
    faltasCount: cadena.length,
    diasAcumuladosExtra,
    sinBonoHasta,
    vuelveBonoYmd: vuelve,
    diasRestantes: diasInclusiveEntre(hoy, sinBonoHasta),
  }
}

function dateLocalDesdeYmd(ymd) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number)
  if (![y, m, d].every((n) => Number.isFinite(n))) return null
  return new Date(y, m - 1, d, 12, 0, 0)
}

/**
 * ¿Ese día el empleado de tienda debía trabajar?
 *
 * Orden (si alguno dice descanso → NO es falta):
 * 1) Descanso autorizado ese día (cambio de descanso / permiso)
 * 2) Plan horario: celda del día de la semana = descanso
 * 3) Patrón turno_horario: día sin turno asignado
 * 4) Sin patrón ni plan: se asume laboral (hace falta autorizar o marcar en plan)
 *
 * @param {object} user
 * @param {string} ymd
 * @param {{ plan?: object, descansosAutSet?: Set<string> }} [ctx]
 */
export function diaLaborableParaBono(user, ymd, ctx = {}) {
  if (!user || !ymd) return false
  const date = dateLocalDesdeYmd(ymd)
  if (!date) return false
  const uid = user.id != null ? String(user.id) : ''

  // 1) Autorización puntual (cambio de descanso)
  if (uid && ctx.descansosAutSet?.has(claveDescansoAutorizado(uid, ymd))) {
    return false
  }

  // 2) Plan horario semanal (descansos movidos en Checador → Plan)
  if (uid && ctx.plan && esDescansoEnPlanHorario(ctx.plan, uid, date)) {
    return false
  }

  // 3) Patrón de días del empleado (6 laborales + 1 descanso típico)
  const horario = parseTurnoHorario(user?.turno_horario)
  const hasDias = Boolean(
    horario?.patron
    || (horario?.dias && typeof horario.dias === 'object' && Object.keys(horario.dias).length),
  )
  if (hasDias) return Boolean(turnoIdParaUsuario(user, date))

  // Sin patrón: si hay plan para ese usuario y el día no es descanso, es laboral.
  // Si no hay info de plan, asumir laboral (para no ocultar faltas reales).
  return true
}

/**
 * Empleados de tienda (dados de alta) con falta vigente para bono.
 * - Solo tipo tienda, activos, de la sucursal (no CT, no indirectos, no bajas).
 * - Falta = día laboral sin ENTRADA ni SALIDA.
 * - Descanso (plan / patrón / autorizado) no cuenta como falta.
 * - Entrada sola o salida sola → SÍ tiene bono.
 * - 1 falta: sin bono desde ese día; se reactiva la siguiente semana el mismo día.
 * - Varias faltas antes de recuperar: se acumula la diferencia de días entre faltas
 *   (vuelve 7 días después de la última falta de la cadena).
 *
 * @param {{ plan?: object, descansosAutorizados?: Array|Set<string> }} [opts]
 */
export function listarBloqueosBonoPorFalta({
  usuarios = [],
  marcajes = [],
  sucursalId = '',
  ahora = new Date(),
  diasBloqueo = DIAS_BLOQUEO_BONO_POR_FALTA,
  plan = null,
  descansosAutorizados = null,
} = {}) {
  const suc = normalizarCodigoTienda(sucursalId)
  const hoy = ymdLocal(ahora)
  const diasBan = Math.max(1, Number(diasBloqueo) || DIAS_BLOQUEO_BONO_POR_FALTA)
  // Mirar atrás lo suficiente para encadenar varias faltas acumuladas.
  const lookback = Math.max(45, diasBan * 6)
  const desdeYmd = sumarDiasYmd(hoy, -lookback)
  const periodo = listarYmdInclusive(desdeYmd, hoy)

  const descansosAutSet = descansosAutorizados instanceof Set
    ? descansosAutorizados
    : setClavesDescansosAutorizados(descansosAutorizados || [])

  const ctx = { plan: plan || null, descansosAutSet }

  const plantilla = (usuarios || []).filter((u) => {
    if (!usuarioEstaActivo(u)) return false
    if (esAdministradorSinAnclaje(u.rol)) return false
    if (normalizarRol(u.rol) === 'Administrador') return false
    if (resolverTipoEmpleado(u) !== 'tienda') return false
    const sucU = normalizarCodigoTienda(u.sucursal_id)
    if (!sucU || sucU === 'MAIN') return false
    if (suc && sucU !== suc) return false
    return true
  })

  /** @type {Map<string, object[]>} */
  const marcajesPorUsuario = new Map()
  for (const m of marcajes || []) {
    const uid = m.usuario_id != null ? String(m.usuario_id).trim() : ''
    if (!uid) continue
    if (!marcajesPorUsuario.has(uid)) marcajesPorUsuario.set(uid, [])
    marcajesPorUsuario.get(uid).push(m)
  }

  /** @type {Array<object>} */
  const out = []

  for (const u of plantilla) {
    const uid = String(u.id)
    const presentes = diasConAlgunaChecada(marcajesPorUsuario.get(uid) || [])
    const faltas = []
    for (const ymd of periodo) {
      if (!diaLaborableParaBono(u, ymd, ctx)) continue
      if (presentes.has(ymd)) continue
      faltas.push(ymd)
    }
    const susp = calcularSuspensionBonoPorFaltas(faltas, { hoy, diasBloqueo: diasBan })
    if (!susp) continue
    out.push({
      clave: `id:${uid}`,
      nombre: u.nombre || 'Sin nombre',
      sucursalId: normalizarCodigoTienda(u.sucursal_id) || suc,
      faltaYmd: susp.faltaYmd,
      primeraFaltaYmd: susp.primeraFaltaYmd,
      faltasYmd: susp.faltasYmd,
      faltasCount: susp.faltasCount,
      diasAcumuladosExtra: susp.diasAcumuladosExtra,
      sinBonoHasta: susp.sinBonoHasta,
      vuelveBonoYmd: susp.vuelveBonoYmd,
      diasRestantes: susp.diasRestantes,
    })
  }

  return out.sort((a, b) => {
    if (a.faltaYmd !== b.faltaYmd) return String(b.faltaYmd).localeCompare(String(a.faltaYmd))
    return String(a.nombre).localeCompare(String(b.nombre), 'es')
  })
}

/**
 * Arma el resumen por empleado: usuarios activos de la tienda + quien checó
 * (cubre turno u otros) aunque no esté en la plantilla.
 *
 * @param {'par'|'cualquier_marcaje'} [opts.modoPresencia]
 *   - par: ENTRADA+SALIDA (nómina / resumen clásico)
 *   - cualquier_marcaje: basta ENTRADA o SALIDA (bono: entrada/salida sola ≠ falta)
 */
export function construirResumenEmpleados({
  usuarios = [],
  marcajes = [],
  desdeYmd,
  hastaYmd,
  ahora = new Date(),
  filtroSucursal = '',
  modoPresencia = 'par',
} = {}) {
  const filtro = normalizarCodigoTienda(filtroSucursal)
  const map = new Map()
  const porId = new Map()
  const porNomSuc = new Map()

  const ensure = (clave, { nombre, sucursalId, usuarioId, esCubreTurno = false }) => {
    if (!map.has(clave)) {
      map.set(clave, {
        clave,
        nombre: nombre || 'Sin nombre',
        sucursalId: sucursalId || filtro || '',
        usuarioId: usuarioId || '',
        esCubreTurno: Boolean(esCubreTurno),
        marcajes: [],
      })
    }
    const row = map.get(clave)
    if (nombre && row.nombre === 'Sin nombre') row.nombre = nombre
    if (esCubreTurno) row.esCubreTurno = true
    return row
  }

  for (const u of usuarios) {
    if (!usuarioEstaActivo(u)) continue
    if (esAlmacenCentral(u.sucursal_id)) continue
    if (esAdministradorSinAnclaje(u.rol)) continue
    const sucU = normalizarCodigoTienda(u.sucursal_id)
    if (filtro && sucU !== filtro) continue
    if (!sucU) continue
    const clave = `id:${u.id}`
    ensure(clave, { nombre: u.nombre, sucursalId: sucU, usuarioId: String(u.id), esCubreTurno: false })
    porId.set(String(u.id), clave)
    const nomClave = claveNombreSucursal(u.nombre, sucU)
    if (nomClave) porNomSuc.set(nomClave, clave)
  }

  for (const m of marcajes) {
    const sucM = normalizarCodigoTienda(m.sucursal_id)
    if (filtro && sucM && sucM !== filtro) continue
    const ymd = ymdLocalDesdeIso(m.created_at)
    if (!ymd) continue
    const uid = m.usuario_id != null ? String(m.usuario_id).trim() : ''
    const cubrePorNombre = esNombreCubreTurno(m.nombre)
    let clave = uid && porId.has(uid) ? porId.get(uid) : ''
    const nomClave = claveNombreSucursal(m.nombre, sucM || filtro)
    if (!clave && nomClave && map.has(`ct:${nomClave}`)) clave = `ct:${nomClave}`
    // CT no se mezcla con la plantilla por nombre: es gente eventual.
    if (!clave && !cubrePorNombre && nomClave) clave = porNomSuc.get(nomClave) || ''
    if (!clave) {
      clave = cubrePorNombre
        ? `ct:${nomClave || map.size}`
        : uid
          ? `id:${uid}`
          : nomClave || `tmp:${map.size}`
      const nombre = limpiarNombreAsistencia(m.nombre) || 'Sin nombre'
      ensure(clave, {
        nombre,
        sucursalId: sucM || filtro,
        usuarioId: uid,
        esCubreTurno: cubrePorNombre || !uid,
      })
      if (uid && !cubrePorNombre) porId.set(uid, clave)
      if (nomClave && !cubrePorNombre) porNomSuc.set(nomClave, clave)
    }
    const row = map.get(clave)
    if (cubrePorNombre) row.esCubreTurno = true
    row.marcajes.push(m)
  }

  const sucMostrar = (row) => filtro || row.sucursalId || '—'
  const diasPresente = (marcajesEmp) => (
    modoPresencia === 'cualquier_marcaje'
      ? diasConAlgunaChecada(marcajesEmp)
      : diasCompletosPorEntradaSalida(marcajesEmp)
  )

  const lista = [...map.values()].map((row) => {
    const r = resumirDiasEmpleado({
      diasTrabajadosYmd: diasPresente(row.marcajes),
      desdeYmd,
      hastaYmd,
      ahora,
      soloDiasRegistrados: row.esCubreTurno,
    })
    const sucursalEtiqueta = sucMostrar(row)
    const calendario = construirCalendarioAsistencia({
      desdeYmd,
      hastaYmd,
      mapaEstado: r.mapaEstado,
      ahora,
    })
    return {
      clave: row.clave,
      nombre: row.nombre,
      esCubreTurno: Boolean(row.esCubreTurno),
      sucursalId: row.sucursalId,
      sucursalEtiqueta,
      dias: r.dias,
      descansos: r.descansos,
      faltas: r.faltas,
      diasTrabajadosYmd: r.diasTrabajadosYmd,
      diasDescansoYmd: r.diasDescansoYmd,
      diasFaltaYmd: r.diasFaltaYmd,
      mapaEstado: r.mapaEstado,
      calendario: calendario.semanas,
      linea: lineaResumenEmpleado({
        nombre: row.nombre,
        sucursalEtiqueta,
        dias: r.dias,
        descansos: r.descansos,
        faltas: r.faltas,
      }),
    }
  })

  lista.sort((a, b) => {
    const s = String(a.sucursalEtiqueta).localeCompare(String(b.sucursalEtiqueta), 'es')
    if (s) return s
    if (Boolean(a.esCubreTurno) !== Boolean(b.esCubreTurno)) return a.esCubreTurno ? 1 : -1
    return String(a.nombre).localeCompare(String(b.nombre), 'es')
  })
  return lista
}

const PAGE = 1000

async function fetchPaginado(supabase, table, select, apply) {
  const all = []
  let from = 0
  for (;;) {
    let q = supabase.from(table).select(select)
    if (apply) q = apply(q)
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) return { data: all, error }
    const batch = data || []
    all.push(...batch)
    if (batch.length < PAGE) return { data: all, error: null }
    from += PAGE
  }
}

export async function cargarMarcajesResumen(supabase, { desdeIso, hastaIso, sucursalId }) {
  if (!supabase) return { data: [], error: null }
  const hasta = new Date(hastaIso)
  const hastaConSalida = Number.isNaN(hasta.getTime())
    ? hastaIso
    : new Date(hasta.getTime() + MAX_HORAS_PAR_ENTRADA_SALIDA * 3600 * 1000).toISOString()
  return fetchPaginado(
    supabase,
    'asistencias',
    'id,usuario_id,nombre,sucursal_id,tipo,created_at',
    (q) => {
      let n = q
        .gte('created_at', desdeIso)
        .lte('created_at', hastaConSalida)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
      if (sucursalId) n = n.eq('sucursal_id', sucursalId)
      return n
    },
  )
}

export async function cargarUsuariosResumen(supabase, { sucursalId }) {
  if (!supabase) return { data: [], error: null }
  const apply = (q) => {
    let n = q.order('nombre', { ascending: true }).order('id', { ascending: true })
    if (sucursalId) n = n.eq('sucursal_id', sucursalId)
    return n
  }
  const full = await fetchPaginado(
    supabase,
    'usuarios',
    'id,nombre,rol,sucursal_id,activo,tipo_empleado,turno_id,turno_horario',
    apply,
  )
  if (!full.error) return full
  if (!/turno_horario|tipo_empleado|column|schema cache/i.test(String(full.error.message || full.error))) {
    return full
  }
  return fetchPaginado(supabase, 'usuarios', 'id,nombre,rol,sucursal_id,activo,turno_id', apply)
}

/**
 * Empleados de la sucursal (solo tienda, dados de alta) sin bono por falta.
 * Respeta descansos del plan horario, patrón 6+1 y descansos autorizados.
 */
export async function cargarBloqueosBonoPorFalta(supabase, {
  sucursalId,
  ahora = new Date(),
  diasBloqueo = DIAS_BLOQUEO_BONO_POR_FALTA,
} = {}) {
  if (!supabase || !sucursalId) return { ok: false, data: [], error: 'Sin sucursal.' }
  const suc = normalizarCodigoTienda(sucursalId)
  const hoy = ymdLocal(ahora)
  const lookback = Math.max(45, (Number(diasBloqueo) || 7) * 6)
  const desdeYmd = sumarDiasYmd(hoy, -lookback)
  const desdeIso = `${desdeYmd}T00:00:00`
  const hastaIso = new Date(ahora.getTime() + 24 * 3600 * 1000).toISOString()

  const [uRes, mRes, planSync, autRes] = await Promise.all([
    cargarUsuariosResumen(supabase, { sucursalId: suc }),
    cargarMarcajesResumen(supabase, { desdeIso, hastaIso, sucursalId: suc }),
    sincronizarPlanHorarioDesdeNube(supabase).catch(() => ({ ok: false })),
    listarDescansosAutorizados(supabase, { sucursalId: suc, desdeYmd, hastaYmd: hoy }),
  ])
  if (uRes.error && !uRes.data?.length) {
    return { ok: false, data: [], error: uRes.error.message || String(uRes.error) }
  }
  const plan = planSync?.plan || leerPlanHorarioLocal()
  const data = listarBloqueosBonoPorFalta({
    usuarios: uRes.data || [],
    marcajes: mRes.data || [],
    sucursalId: suc,
    ahora,
    diasBloqueo,
    plan,
    descansosAutorizados: autRes?.data || [],
  })
  return {
    ok: true,
    data,
    error: mRes.error?.message || null,
    avisoDescansos: autRes?.faltaTabla ? autRes.error : null,
  }
}
