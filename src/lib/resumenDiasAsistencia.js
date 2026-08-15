/**
 * Resumen de días trabajados / descansos / faltas a partir de checadas.
 *
 * Un día trabajado exige par ENTRADA + SALIDA (si solo hay entrada, no cuenta).
 * Turno nocturno: la salida puede ser al día siguiente; el día es el de la entrada.
 * Los días del periodo (hasta hoy) sin par completo se agrupan en rachas:
 * - 1 día suelto → 1 descanso
 * - N días seguidos sin par → 1 descanso + (N − 1) faltas
 */

import { esAlmacenCentral, normalizarCodigoTienda } from '../constants/sucursales.js'
import { normalizarNombreEmpleado } from './nominaMatch.js'
import { ymdLocal } from './semanaNomina.js'
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
 */
export function clasificarHuecosSinAsistencia(diasTrabajadosYmd, diasPeriodoYmd) {
  let descansos = 0
  let faltas = 0
  let racha = 0
  const flush = () => {
    if (racha <= 0) return
    descansos += 1
    if (racha > 1) faltas += racha - 1
    racha = 0
  }
  for (const ymd of diasPeriodoYmd) {
    if (diasTrabajadosYmd.has(ymd)) {
      flush()
    } else {
      racha += 1
    }
  }
  flush()
  return { descansos, faltas }
}

export function resumirDiasEmpleado({
  diasTrabajadosYmd,
  desdeYmd,
  hastaYmd,
  ahora,
  soloDiasRegistrados = false,
}) {
  const hasta = ymdHastaEfectivo(hastaYmd, ahora)
  const periodo = listarYmdInclusive(desdeYmd, hasta)
  const enPeriodo = new Set(periodo.filter((d) => diasTrabajadosYmd.has(d)))
  if (soloDiasRegistrados) {
    return { dias: enPeriodo.size, descansos: 0, faltas: 0 }
  }
  const { descansos, faltas } = clasificarHuecosSinAsistencia(enPeriodo, periodo)
  return {
    dias: enPeriodo.size,
    descansos,
    faltas,
  }
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
 * Arma el resumen por empleado: usuarios activos de la tienda + quien checó
 * (cubre turno u otros) aunque no esté en la plantilla.
 */
export function construirResumenEmpleados({
  usuarios = [],
  marcajes = [],
  desdeYmd,
  hastaYmd,
  ahora = new Date(),
  filtroSucursal = '',
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

  const lista = [...map.values()].map((row) => {
    const r = resumirDiasEmpleado({
      diasTrabajadosYmd: diasCompletosPorEntradaSalida(row.marcajes),
      desdeYmd,
      hastaYmd,
      ahora,
      soloDiasRegistrados: row.esCubreTurno,
    })
    const sucursalEtiqueta = sucMostrar(row)
    return {
      clave: row.clave,
      nombre: row.nombre,
      esCubreTurno: Boolean(row.esCubreTurno),
      sucursalId: row.sucursalId,
      sucursalEtiqueta,
      dias: r.dias,
      descansos: r.descansos,
      faltas: r.faltas,
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
  return fetchPaginado(supabase, 'usuarios', 'id,nombre,rol,sucursal_id,activo', (q) => {
    let n = q.order('nombre', { ascending: true }).order('id', { ascending: true })
    if (sucursalId) n = n.eq('sucursal_id', sucursalId)
    return n
  })
}
