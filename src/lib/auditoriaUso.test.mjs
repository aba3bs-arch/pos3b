import assert from 'node:assert/strict'
import {
  TIPOS_AUDITORIA,
  detectarEsMovil,
  puedeVerModuloAuditoria,
  registrarEventoAuditoria,
  resumenEventoAuditoria,
  resumenUserAgent,
  snapshotDispositivo,
  auditarPinAdmin,
  listarEventosAuditoria,
} from './auditoriaUso.js'

{
  assert.equal(detectarEsMovil('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true)
  assert.equal(detectarEsMovil('Mozilla/5.0 (Linux; Android 13) Chrome/120'), true)
  assert.equal(detectarEsMovil('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'), false)
}

{
  assert.match(resumenUserAgent('Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36'), /Chrome/)
  assert.match(resumenUserAgent('Mozilla/5.0 Firefox/121.0'), /Firefox/)
}

{
  assert.equal(puedeVerModuloAuditoria('Administrador'), true)
  assert.equal(puedeVerModuloAuditoria('Gerente'), false)
  assert.equal(puedeVerModuloAuditoria('Cajero'), false)
}

{
  const txt = resumenEventoAuditoria({
    tipo: TIPOS_AUDITORIA.PIN_ADMIN,
    accion: 'segundo_dispositivo',
    usuario_nombre: 'Andrés',
    sucursal_id: '3B5',
    dispositivo_corto: 'abc…xyz',
    es_movil: true,
    dispositivo_reconocido: false,
  })
  assert.match(txt, /PIN de administrador/)
  assert.match(txt, /Andrés/)
  assert.match(txt, /3B5/)
  assert.match(txt, /móvil/)
  assert.match(txt, /no reconocido/)
}

{
  const snap = snapshotDispositivo(null)
  assert.ok(snap.dispositivo_id)
  assert.ok(snap.dispositivo_corto)
  assert.equal(typeof snap.es_movil, 'boolean')
  assert.equal(typeof snap.terminal_tienda, 'boolean')
}

{
  // Sin supabase: el registro local sigue siendo ok (buffer puede fallar sin DOM)
  const res = await registrarEventoAuditoria(null, {
    tipo: TIPOS_AUDITORIA.CORTE_DELETE,
    accion: 'Borrar cierre F-1',
    usuario: { id: 'u1', nombre: 'Admin', rol: 'Administrador' },
    sucursal: '3B5',
    detalle: { folio: 'F-1' },
  })
  assert.equal(res.ok, true)
  assert.equal(res.registro.tipo, 'CORTE_DELETE')
  assert.equal(res.registro.severidad, 'critical')
  assert.equal(res.registro.sucursal_id, '3B5')
  assert.equal(res.soloLocal, true)
}

{
  const res = await auditarPinAdmin(null, {
    admin: { id: 'a1', nombre: 'Andrés', rol: 'Administrador' },
    usuarioObjetivo: { id: 'c1', nombre: 'Cajero' },
    sucursal: '3B2',
    motivo: 'segundo_dispositivo',
  })
  assert.equal(res.ok, true)
  assert.equal(res.registro.tipo, 'PIN_ADMIN')
  assert.equal(res.registro.severidad, 'warning')
  assert.equal(res.registro.detalle.motivo, 'segundo_dispositivo')
}

{
  // Mock mínimo de localStorage para listar buffer
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
  }
  await registrarEventoAuditoria(null, {
    tipo: TIPOS_AUDITORIA.VISTA,
    accion: 'Abrir Ventas',
    usuario: { id: 'u2', nombre: 'Caja', rol: 'Cajero' },
    sucursal: '3B5',
    vista: 'Ventas',
  })
  const list = await listarEventosAuditoria(null, { limit: 50, sucursal: '3B5' })
  assert.equal(list.ok, true)
  assert.ok(Array.isArray(list.data))
  assert.ok(list.data.some((r) => r.tipo === 'VISTA' && r.vista === 'Ventas'))
}

console.log('auditoriaUso.test.mjs ok')
