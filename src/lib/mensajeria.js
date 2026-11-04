/**
 * Mensajería del POS.
 * - Un chat por sucursal (quien está en ese turno).
 * - Grupo de toda la cadena.
 * - Soporte (cada sucursal abre una solicitud; la atienden los administradores).
 * - Mensaje directo entre dos usuarios.
 * Solo el administrador principal ve todos los chats.
 * Cualquier administrador ve y cierra el soporte de todas las sucursales.
 *
 * La caja entra con la clave anónima de Supabase (igual que el resto del POS),
 * así que el acceso se aplica al armar la consulta y al pintar la pantalla.
 */
import { esAdministradorPrincipal, normalizarNombrePersona } from './adminPrincipal.js';
import { normalizarRol } from './roles.js';
import { esUsuarioCubreTurno } from './cubreTurno.js';
import { leerTurnos, turnoActual } from './turnos.js';
import {
  etiquetaTienda,
  equivalentesCodigoTienda,
  listarSucursales,
  normalizarCodigoTienda,
} from '../constants/sucursales.js';

export const EVENTO_MENSAJES = 'pos3b-mensajes';
export const EVENTO_SOPORTE = 'pos3b-soporte-solicitudes';
export const CANAL_GRUPO = 'grupo';
export const USUARIO_BOT = {
  id: 'bot-soporte-3b',
  nombre: 'Asistente 3B',
  rol: 'Soporte',
  sucursal_id: 'MAIN',
};
const LS_CACHE = 'pos3b_mensajes_cache_v1';
const LS_SOLICITUDES = 'pos3b_soporte_solicitudes_v1';
const MAX_MENSAJES = 600;
const MAX_TEXTO = 1000;
const TZ = 'America/Hermosillo';

let tablaDisponible = null;
let tablaSolicitudes = null;

function nuevoId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function idChatUsuario(user) {
  const id = String(user?.id || '').trim();
  if (id) return id;
  if (esUsuarioCubreTurno(user)) {
    const n = normalizarNombrePersona(user?.nombre).replace(/\s+/g, '-');
    const t = String(user?.telefono || '').replace(/\D/g, '').slice(-4);
    return `cubre:${n || 'sin-nombre'}:${t || '0000'}`;
  }
  const n = normalizarNombrePersona(user?.nombre).replace(/\s+/g, '-');
  return n ? `nombre:${n}` : 'anon';
}

/** Sucursal del chat de esta sesión: la tienda que se está cubriendo, o la del usuario. */
export function sucursalDeSesionChat(user, sucursalSesion) {
  const sesion = normalizarCodigoTienda(sucursalSesion);
  if (esUsuarioCubreTurno(user) && sesion) return sesion;
  const casa = normalizarCodigoTienda(user?.sucursal_id);
  return casa || sesion || 'MAIN';
}

export function puedeVerTodosLosChats(user) {
  return esAdministradorPrincipal(user);
}

export function esRolTecnico(user) {
  return normalizarRol(user?.rol) === 'Técnico';
}

export function esAdministrador(user) {
  return normalizarRol(user?.rol) === 'Administrador';
}

/** Ve el soporte de todas las sucursales y puede contestar. */
export function atiendeSoporte(user) {
  return esAdministrador(user) || esRolTecnico(user);
}

/** Cierra o reabre la solicitud. Solo administradores. */
export function puedeResolverSoporte(user) {
  return esAdministrador(user);
}

export function esBotSoporte(user) {
  return idChatUsuario(user) === USUARIO_BOT.id;
}

/** Un mensaje de sucursal abre o reabre la solicitud. */
export function abreSolicitudSoporte(user) {
  return Boolean(user) && !esBotSoporte(user) && !atiendeSoporte(user);
}

export function canalSucursal(codigo) {
  return `sucursal__${normalizarCodigoTienda(codigo)}`;
}

export function canalSoporte(codigo) {
  return `soporte__${normalizarCodigoTienda(codigo)}`;
}

export function canalDirecto(idA, idB) {
  const a = String(idA || '').trim();
  const b = String(idB || '').trim();
  if (!a || !b || a === b) return '';
  const [x, y] = [a, b].sort();
  return `dm__${x}__${y}`;
}

export function participantesDirecto(canal) {
  const m = String(canal || '').match(/^dm__(.+)__(.+)$/);
  if (!m) return null;
  return [m[1], m[2]];
}

export function puedeVerCanal(user, sucursalSesion, canal) {
  const id = String(canal || '');
  if (!user || !id) return false;
  if (normalizarRol(user.rol) === 'Cliente') return false;
  if (esBotSoporte(user)) return id.startsWith('soporte__');
  if (puedeVerTodosLosChats(user)) return true;
  const mia = sucursalDeSesionChat(user, sucursalSesion);
  if (id === CANAL_GRUPO) return true;
  if (id === canalSucursal(mia)) return true;
  if (id === canalSoporte(mia)) return true;
  if (id.startsWith('soporte__') && atiendeSoporte(user)) return true;
  if (id.startsWith('dm__')) {
    const partes = participantesDirecto(id);
    const yo = idChatUsuario(user);
    return Boolean(partes && partes.includes(yo));
  }
  return false;
}

export function turnoParaMensaje(user, sucursal) {
  const lista = leerTurnos(sucursalDeSesionChat(user, sucursal));
  const t = turnoActual(lista);
  return {
    turno_id: t?.id ? String(t.id) : '',
    turno_nombre: t?.nombre ? String(t.nombre) : 'Turno',
  };
}

function leerCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_CACHE) || '{}');
    return {
      mensajes: Array.isArray(raw.mensajes) ? raw.mensajes : [],
      leidos: raw.leidos && typeof raw.leidos === 'object' ? raw.leidos : {},
    };
  } catch {
    return { mensajes: [], leidos: {} };
  }
}

function escribirCache(next) {
  const prev = leerCache();
  const mensajes = [...(next.mensajes || prev.mensajes)]
    .filter((m) => m && m.id && m.canal)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(-MAX_MENSAJES);
  const leidos = next.leidos || prev.leidos;
  const json = JSON.stringify({ mensajes, leidos });
  if (localStorage.getItem(LS_CACHE) === json) return mensajes;
  localStorage.setItem(LS_CACHE, json);
  window.dispatchEvent(new CustomEvent(EVENTO_MENSAJES));
  return mensajes;
}

export function fusionarMensajes(lista, extras) {
  const map = new Map();
  for (const m of [...(lista || []), ...(extras || [])]) {
    if (!m?.id) continue;
    const prev = map.get(m.id);
    map.set(m.id, prev ? { ...prev, ...m, pendiente: m.pendiente === false ? false : Boolean(prev.pendiente && m.pendiente !== false) } : m);
  }
  return [...map.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

function tablaFalta(error) {
  const msg = String(error?.message || error?.details || '').toLowerCase();
  const deTabla = msg.includes('pos_mensajes') || msg.includes('pos_soporte_solicitudes');
  return error?.code === '42P01'
    || (deTabla && (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find')));
}

function filtroPostgrest(valor) {
  const s = String(valor ?? '');
  if (/^[a-zA-Z0-9_-]+$/.test(s)) return s;
  return `"${s.replace(/"/g, '')}"`;
}

function filtroConsulta(user, sucursalSesion) {
  if (puedeVerTodosLosChats(user)) return null;
  const yo = idChatUsuario(user);
  const mia = sucursalDeSesionChat(user, sucursalSesion);
  const partes = [
    `canal.eq.${filtroPostgrest(CANAL_GRUPO)}`,
    `canal.eq.${filtroPostgrest(canalSucursal(mia))}`,
    `canal.eq.${filtroPostgrest(canalSoporte(mia))}`,
    `and(canal.like.dm__%,autor_id.eq.${filtroPostgrest(yo)})`,
    `and(canal.like.dm__%,destinatario_id.eq.${filtroPostgrest(yo)})`,
  ];
  if (atiendeSoporte(user)) partes.push('canal.like.soporte__%');
  return partes.join(',');
}

export async function cargarMensajes(supabase, { user, sucursal }) {
  const cache = leerCache();
  let locales = cache.mensajes.filter((m) => puedeVerCanal(user, sucursal, m.canal));
  if (!puedeVerTodosLosChats(user) && locales.length !== cache.mensajes.length) {
    escribirCache({ mensajes: locales, leidos: cache.leidos });
  }
  if (!supabase) {
    return { mensajes: locales, aviso: 'Sin conexión a la nube: el chat queda guardado en esta caja.', tabla: false };
  }
  let q = supabase.from('pos_mensajes').select('*').order('created_at', { ascending: false }).limit(400);
  const filtro = filtroConsulta(user, sucursal);
  if (filtro) q = q.or(filtro);
  const { data, error } = await q;
  if (error) {
    if (tablaFalta(error)) {
      tablaDisponible = false;
      return {
        mensajes: locales,
        aviso: 'Falta crear la tabla en Supabase (archivo supabase/fix_mensajeria.sql). Mientras tanto el chat se guarda en esta caja.',
        tabla: false,
      };
    }
    return { mensajes: locales, aviso: 'No se pudo leer la nube. Se muestran los mensajes de esta caja.', tabla: tablaDisponible !== false };
  }
  tablaDisponible = true;
  const remotos = (data || []).map((row) => ({ ...row, pendiente: false }));
  const fusion = fusionarMensajes(remotos, locales.filter((m) => m.pendiente)).filter((m) => puedeVerCanal(user, sucursal, m.canal));
  escribirCache({ mensajes: fusionarMensajes(leerCache().mensajes, fusion), leidos: leerCache().leidos });
  return { mensajes: fusion, aviso: '', tabla: true };
}

function armarFila(user, sucursal, canal, texto, extra = {}) {
  const turno = turnoParaMensaje(user, sucursal);
  const limpio = String(texto || '').replace(/\s+$/g, '').replace(/^\s+/g, '');
  return {
    id: nuevoId(),
    canal,
    texto: limpio.slice(0, MAX_TEXTO),
    autor_id: idChatUsuario(user),
    autor_nombre: String(user?.nombre || 'Usuario').trim() || 'Usuario',
    autor_rol: esBotSoporte(user) ? 'Soporte' : normalizarRol(user?.rol),
    autor_sucursal: sucursalDeSesionChat(user, sucursal),
    turno_id: extra.turno_id || turno.turno_id,
    turno_nombre: extra.turno_nombre || turno.turno_nombre,
    destinatario_id: extra.destinatario_id || null,
    destinatario_nombre: extra.destinatario_nombre || null,
    created_at: new Date().toISOString(),
    pendiente: true,
  };
}

async function publicarEnCanal(supabase, msg) {
  if (!supabase) return;
  const nombre = `pos-msg:${msg.canal}`;
  const ch = supabase.channel(nombre);
  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') finish();
    });
    setTimeout(finish, 1500);
  });
  try {
    await ch.send({ type: 'broadcast', event: 'mensaje', payload: msg });
  } catch {
    /* la otra caja lo verá en el siguiente refresco */
  }
}

export async function enviarMensaje(supabase, { user, sucursal, canal, texto, destinatario, turnoEtiqueta }) {
  const cuerpo = String(texto || '').trim();
  if (!cuerpo) return { ok: false, error: 'Escribe un mensaje.' };
  if (cuerpo.length > MAX_TEXTO) return { ok: false, error: `Máximo ${MAX_TEXTO} caracteres.` };
  if (!puedeVerCanal(user, sucursal, canal)) return { ok: false, error: 'No tienes acceso a este chat.' };
  const msg = armarFila(user, sucursal, canal, cuerpo, {
    destinatario_id: destinatario?.id || null,
    destinatario_nombre: destinatario?.nombre || null,
    turno_nombre: turnoEtiqueta || null,
  });
  const cache = leerCache();
  escribirCache({ mensajes: fusionarMensajes(cache.mensajes, [msg]), leidos: cache.leidos });

  if (!supabase || tablaDisponible === false) {
    return { ok: true, mensaje: msg, aviso: tablaDisponible === false ? 'Guardado en esta caja. Falta la tabla en Supabase.' : '' };
  }

  const { error } = await supabase.from('pos_mensajes').insert({
    id: msg.id,
    canal: msg.canal,
    texto: msg.texto,
    autor_id: msg.autor_id,
    autor_nombre: msg.autor_nombre,
    autor_rol: msg.autor_rol,
    autor_sucursal: msg.autor_sucursal,
    turno_id: msg.turno_id,
    turno_nombre: msg.turno_nombre,
    destinatario_id: msg.destinatario_id,
    destinatario_nombre: msg.destinatario_nombre,
    created_at: msg.created_at,
  });
  if (error) {
    if (tablaFalta(error)) tablaDisponible = false;
    return { ok: true, mensaje: msg, aviso: tablaFalta(error) ? 'Guardado en esta caja. Falta la tabla en Supabase.' : 'Guardado en esta caja. No se pudo subir a la nube.' };
  }
  tablaDisponible = true;
  const listo = { ...msg, pendiente: false };
  const actual = leerCache();
  escribirCache({ mensajes: fusionarMensajes(actual.mensajes, [listo]), leidos: actual.leidos });
  publicarEnCanal(supabase, listo);
  return { ok: true, mensaje: listo, aviso: '' };
}

const realtime = new Map();

export function suscribirCanales(supabase, canales, onMensaje) {
  if (!supabase) return () => {};
  const ids = [...new Set((canales || []).filter(Boolean))];
  const propios = [];
  for (const canal of ids) {
    if (realtime.has(canal)) {
      realtime.get(canal).handlers.add(onMensaje);
      propios.push(canal);
      continue;
    }
    const handlers = new Set([onMensaje]);
    const ch = supabase.channel(`pos-msg:${canal}`);
    const entregar = (row) => {
      if (!row || row.canal !== canal) return;
      for (const fn of handlers) fn(row);
    };
    ch.on('broadcast', { event: 'mensaje' }, ({ payload }) => entregar(payload));
    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pos_mensajes', filter: `canal=eq.${canal}` },
      (payload) => entregar(payload?.new),
    );
    ch.subscribe();
    realtime.set(canal, { ch, handlers });
    propios.push(canal);
  }
  return () => {
    for (const canal of propios) {
      const slot = realtime.get(canal);
      if (!slot) continue;
      slot.handlers.delete(onMensaje);
      if (slot.handlers.size === 0) {
        supabase.removeChannel(slot.ch);
        realtime.delete(canal);
      }
    }
  };
}

export function leerLeidos(user) {
  const yo = idChatUsuario(user);
  return leerCache().leidos[yo] || {};
}

export function marcarCanalLeido(user, canal) {
  if (!user || !canal) return;
  const yo = idChatUsuario(user);
  const cache = leerCache();
  const delUsuario = { ...(cache.leidos[yo] || {}), [canal]: new Date().toISOString() };
  escribirCache({ mensajes: cache.mensajes, leidos: { ...cache.leidos, [yo]: delUsuario } });
}

export function mensajesNoLeidos(mensajes, user, canal) {
  const yo = idChatUsuario(user);
  const desde = leerLeidos(user)[canal];
  return (mensajes || []).filter((m) => {
    if (m.canal !== canal) return false;
    if (m.autor_id === yo) return false;
    if (!desde) return true;
    return String(m.created_at) > String(desde);
  }).length;
}

export function ultimoMensaje(mensajes, canal) {
  const lista = (mensajes || []).filter((m) => m.canal === canal);
  return lista.length ? lista[lista.length - 1] : null;
}

function tituloSucursalCorto(codigo) {
  const etiqueta = etiquetaTienda(codigo);
  return etiqueta.length > 28 ? `${normalizarCodigoTienda(codigo)}` : etiqueta;
}

export function listarCanales({ user, sucursal, mensajes = [], directosExtra = [] }) {
  const mia = sucursalDeSesionChat(user, sucursal);
  const todos = puedeVerTodosLosChats(user);
  const atiende = atiendeSoporte(user);
  const tiendas = todos ? listarSucursales() : [mia];
  const soportes = todos || atiende ? listarSucursales() : [mia];
  const canales = [
    {
      id: CANAL_GRUPO,
      tipo: 'grupo',
      seccion: 'General',
      titulo: 'Grupo 3B',
      subtitulo: 'Todas las sucursales',
    },
  ];
  for (const codigo of tiendas) {
    const propio = codigo === mia;
    canales.push({
      id: canalSucursal(codigo),
      tipo: 'sucursal',
      seccion: todos ? 'Sucursales' : 'Tu sucursal',
      titulo: tituloSucursalCorto(codigo),
      subtitulo: propio ? 'Chat de tu turno' : 'Chat de la sucursal',
      sucursal: codigo,
    });
  }
  for (const codigo of soportes) {
    canales.push({
      id: canalSoporte(codigo),
      tipo: 'soporte',
      seccion: 'Soporte',
      titulo: soportes.length > 1 ? `Soporte ${normalizarCodigoTienda(codigo)}` : 'Soporte',
      subtitulo: 'Lo atienden los administradores',
      sucursal: codigo,
    });
  }

  const vistos = new Set(canales.map((c) => c.id));
  const yo = idChatUsuario(user);
  const directos = new Map();
  for (const extra of directosExtra) {
    if (extra?.id) directos.set(extra.id, extra);
  }
  for (const m of mensajes) {
    if (!String(m.canal || '').startsWith('dm__')) continue;
    if (!puedeVerCanal(user, sucursal, m.canal)) continue;
    const partes = participantesDirecto(m.canal);
    const otroId = partes?.find((p) => p !== yo) || partes?.[0];
    const yoEsAutor = m.autor_id === yo;
    const vigilando = puedeVerTodosLosChats(user) && partes && !partes.includes(yo);
    const nombre = vigilando
      ? `${m.autor_nombre || 'Alguien'} · ${m.destinatario_nombre || 'directo'}`
      : (yoEsAutor ? (m.destinatario_nombre || 'Conversación') : (m.autor_nombre || 'Conversación'));
    const prev = directos.get(m.canal);
    directos.set(m.canal, {
      id: m.canal,
      tipo: 'directo',
      seccion: 'Directos',
      titulo: prev?.titulo && prev.titulo !== 'Conversación' ? prev.titulo : nombre,
      subtitulo: vigilando ? 'Visible solo para el admin principal' : 'Mensaje directo',
      destinatario_id: vigilando ? (m.destinatario_id || otroId) : (yoEsAutor ? (m.destinatario_id || otroId) : m.autor_id),
      destinatario_nombre: vigilando ? (m.destinatario_nombre || nombre) : (yoEsAutor ? (m.destinatario_nombre || nombre) : m.autor_nombre),
    });
  }
  for (const d of directos.values()) {
    if (!vistos.has(d.id) && puedeVerCanal(user, sucursal, d.id)) canales.push(d);
  }
  return canales.filter((c) => puedeVerCanal(user, sucursal, c.id));
}

export async function listarCompaneros(supabase, { user, sucursal }) {
  if (!supabase) return [];
  const todos = puedeVerTodosLosChats(user) || esRolTecnico(user);
  const mia = sucursalDeSesionChat(user, sucursal);
  const columnas = 'id,nombre,rol,sucursal_id,activo';
  let q = supabase.from('usuarios').select(columnas).limit(400);
  if (!todos) q = q.in('sucursal_id', equivalentesCodigoTienda(mia));
  let { data, error } = await q;
  if (error && /activo|column/i.test(String(error.message || ''))) {
    q = supabase.from('usuarios').select('id,nombre,rol,sucursal_id').limit(400);
    if (!todos) q = q.in('sucursal_id', equivalentesCodigoTienda(mia));
    ({ data, error } = await q);
  }
  if (error) return [];
  const yo = idChatUsuario(user);
  return (data || [])
    .filter((u) => u && String(u.id || '') && String(u.id) !== yo)
    .filter((u) => u.activo !== false)
    .filter((u) => normalizarRol(u.rol) !== 'Cliente')
    .map((u) => ({
      id: String(u.id),
      nombre: String(u.nombre || 'Sin nombre').trim(),
      rol: normalizarRol(u.rol),
      sucursal_id: normalizarCodigoTienda(u.sucursal_id),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function formatearHoraMensaje(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function claveDiaMensaje(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function etiquetaDiaMensaje(iso) {
  const clave = claveDiaMensaje(iso);
  const hoy = claveDiaMensaje(new Date().toISOString());
  if (clave && clave === hoy) return 'Hoy';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
  }).format(d);
}

export function leerMensajesLocales(user, sucursal) {
  return leerCache().mensajes.filter((m) => puedeVerCanal(user, sucursal, m.canal));
}

function leerSolicitudesCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_SOLICITUDES) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function escribirSolicitudesCache(mapa) {
  localStorage.setItem(LS_SOLICITUDES, JSON.stringify(mapa || {}));
  window.dispatchEvent(new CustomEvent(EVENTO_SOPORTE));
}

function solicitudVisible(user, sucursal, sol) {
  return Boolean(sol?.canal) && puedeVerCanal(user, sucursal, sol.canal);
}

export function leerSolicitudesLocales(user, sucursal) {
  const mapa = leerSolicitudesCache();
  return Object.values(mapa).filter((sol) => solicitudVisible(user, sucursal, sol));
}

function guardarSolicitud(sol) {
  const mapa = leerSolicitudesCache();
  mapa[sol.canal] = sol;
  escribirSolicitudesCache(mapa);
  return sol;
}

async function subirSolicitud(supabase, sol) {
  if (!supabase || tablaSolicitudes === false) return;
  const { error } = await supabase.from('pos_soporte_solicitudes').upsert({
    canal: sol.canal,
    sucursal_id: sol.sucursal_id,
    estado: sol.estado,
    texto: sol.texto,
    solicitante_nombre: sol.solicitante_nombre,
    solicitante_turno: sol.solicitante_turno,
    resuelta_por: sol.resuelta_por,
    resuelta_at: sol.resuelta_at,
    updated_at: sol.updated_at,
  }, { onConflict: 'canal' });
  if (error && tablaFalta(error)) tablaSolicitudes = false;
  else if (!error) tablaSolicitudes = true;
}

export async function sincronizarSolicitudes(supabase, { user, sucursal }) {
  const mapa = { ...leerSolicitudesCache() };
  if (supabase && tablaSolicitudes !== false) {
    let q = supabase.from('pos_soporte_solicitudes').select('*');
    if (!atiendeSoporte(user) && !puedeVerTodosLosChats(user)) {
      q = q.eq('canal', canalSoporte(sucursalDeSesionChat(user, sucursal)));
    }
    const { data, error } = await q;
    if (error) {
      if (tablaFalta(error)) tablaSolicitudes = false;
    } else {
      tablaSolicitudes = true;
      for (const row of data || []) {
        if (!row?.canal || !solicitudVisible(user, sucursal, row)) continue;
        const prev = mapa[row.canal];
        if (!prev || String(row.updated_at || '') >= String(prev.updated_at || '')) mapa[row.canal] = row;
      }
      escribirSolicitudesCache(mapa);
    }
  }
  return Object.values(mapa).filter((sol) => solicitudVisible(user, sucursal, sol));
}

export async function abrirSolicitudSoporte(supabase, { user, sucursal, canal, texto }) {
  if (!String(canal || '').startsWith('soporte__') || !abreSolicitudSoporte(user)) return null;
  const turno = turnoParaMensaje(user, sucursal);
  const sol = guardarSolicitud({
    canal,
    sucursal_id: canal.slice('soporte__'.length),
    estado: 'abierta',
    texto: String(texto || '').trim().slice(0, 280),
    solicitante_nombre: String(user?.nombre || 'Sucursal').trim(),
    solicitante_turno: turno.turno_nombre,
    resuelta_por: null,
    resuelta_at: null,
    updated_at: new Date().toISOString(),
  });
  await subirSolicitud(supabase, sol);
  return sol;
}

export async function cambiarEstadoSolicitud(supabase, { user, sucursal, canal, estado }) {
  if (!puedeResolverSoporte(user)) return { ok: false, error: 'Solo un administrador puede resolver la solicitud.' };
  if (!puedeVerCanal(user, sucursal, canal)) return { ok: false, error: 'No tienes acceso a este soporte.' };
  const previa = leerSolicitudesCache()[canal] || {};
  const resuelta = estado === 'resuelta';
  const sol = guardarSolicitud({
    ...previa,
    canal,
    sucursal_id: previa.sucursal_id || canal.slice('soporte__'.length),
    estado: resuelta ? 'resuelta' : 'abierta',
    texto: previa.texto || '',
    solicitante_nombre: previa.solicitante_nombre || '',
    solicitante_turno: previa.solicitante_turno || '',
    resuelta_por: resuelta ? String(user?.nombre || 'Administrador') : null,
    resuelta_at: resuelta ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  await subirSolicitud(supabase, sol);
  const nota = resuelta
    ? 'Marqué esta solicitud como resuelta.'
    : 'Reabrí la solicitud. Sigue pendiente de un administrador.';
  const envio = await enviarMensaje(supabase, { user, sucursal, canal, texto: nota, turnoEtiqueta: 'Administrador' });
  return { ok: true, solicitud: sol, aviso: envio.aviso || '' };
}
