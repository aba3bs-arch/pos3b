import { listarSucursalesOperativas, normalizarCodigoTienda, esSucursalNoVenta } from '../constants/sucursales.js';
import { BENEFICIARIOS_VALES, slugBeneficiarioVale, AREAS_CONTABILIDAD } from './contabilidadConstants.js';
import { normalizarRol, puedeGestionarUsuarios } from './roles.js';
import { esTurnoAmbos, turnoActual, turnoIdParaUsuario } from './turnos.js';
import {
  BENEFICIARIOS_CONSUMO_PIN,
  resolverBeneficiarioConsumoPin,
} from './pinBeneficiarioConsumo.js';

/** Máximo de empleados fijos (tipo tienda) activos por sucursal operativa. */
export const MAX_EMPLEADOS_POR_TIENDA = 2;

/** Módulos de corte donde Misael / Luis Enrique aparecen en EMPLEADO (con PIN en consumo). */
export const MODULOS_CORTE_CONSUMO_PIN = new Set(['abarrotes', 'virtual']);

/** ¿Este empleado/nombre es Misael o Luis Enrique (consumo con PIN en corte)? */
export function esEmpleadoConsumoPinCorte(empleadoONombre) {
  const nombre = typeof empleadoONombre === 'string'
    ? empleadoONombre
    : (empleadoONombre?.nombre || '');
  return Boolean(resolverBeneficiarioConsumoPin(nombre));
}

/** True si el módulo de corte muestra a Misael/Luis Enrique en la lista EMPLEADO. */
export function moduloCorteIncluyeConsumoPin(modulo) {
  return MODULOS_CORTE_CONSUMO_PIN.has(String(modulo || '').toLowerCase());
}

/**
 * Turno fijo/rotación del empleado para etiquetas de gastos (diurno / nocturno / ambos).
 * No usa la hora actual: en Gastos deben verse ambos turnos de la tienda.
 */
export function turnoEmpleadoParaGastos(user, date = new Date()) {
  if (!user) return '';
  const asignado = turnoIdParaUsuario(user, date);
  if (!asignado) {
    const fijo = String(user.turno_id || '').trim().toLowerCase();
    if (!fijo) return '';
    if (esTurnoAmbos(fijo)) return 'ambos';
    if (fijo.includes('nocturn')) return 'nocturno';
    if (fijo.includes('diurn')) return 'diurno';
    return fijo;
  }
  const id = String(asignado).toLowerCase();
  if (esTurnoAmbos(id)) return 'ambos';
  if (id.includes('nocturn')) return 'nocturno';
  if (id.includes('diurn')) return 'diurno';
  return id;
}

export function etiquetaTurnoEmpleadoGastos(user, date = new Date()) {
  const t = turnoEmpleadoParaGastos(user, date);
  if (t === 'nocturno') return 'Nocturno';
  if (t === 'diurno') return 'Diurno';
  if (t === 'ambos') return 'Ambos';
  return t ? String(t) : '';
}

/** Nombre para <option> de gastos: "Ana · Nocturno". */
export function etiquetaEmpleadoSelectGastos(user, date = new Date()) {
  const nom = String(user?.nombre || '').trim() || 'Empleado';
  const et = etiquetaTurnoEmpleadoGastos(user, date);
  return et ? `${nom} · ${et}` : nom;
}

/**
 * Elige hasta 2 empleados de tienda priorizando 1 diurno + 1 nocturno
 * (evita que .slice(0,2) alfabético deje fuera al nocturno).
 */
export function elegirEmpleadosTiendaParaGastos(empleados, { max = MAX_EMPLEADOS_POR_TIENDA, date = new Date() } = {}) {
  const list = dedupeEmpleadosPorNombre(empleados || []).filter(Boolean);
  if (list.length <= max) {
    return ordenarEmpleadosTiendaPorTurno(list, date);
  }
  const diurno = list.find((e) => turnoEmpleadoParaGastos(e, date) === 'diurno');
  const nocturno = list.find((e) => turnoEmpleadoParaGastos(e, date) === 'nocturno');
  const pick = [];
  if (diurno) pick.push(diurno);
  if (nocturno && !pick.some((x) => String(x.id) === String(nocturno.id))) pick.push(nocturno);
  for (const e of ordenarEmpleadosTiendaPorTurno(list, date)) {
    if (pick.length >= max) break;
    if (pick.some((x) => String(x.id) === String(e.id))) continue;
    pick.push(e);
  }
  return pick.slice(0, max);
}

export function ordenarEmpleadosTiendaPorTurno(empleados, date = new Date()) {
  const rank = (e) => {
    const t = turnoEmpleadoParaGastos(e, date);
    if (t === 'diurno') return 0;
    if (t === 'nocturno') return 1;
    if (t === 'ambos') return 2;
    return 3;
  };
  return [...(empleados || [])].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return String(a?.nombre || '').localeCompare(String(b?.nombre || ''), 'es');
  });
}

/**
 * Empleados visibles en listas operativas (nómina, vales, etc.).
 * - Tienda activa: su personal + personal de MAIN / indirectos, sin administradores.
 * - Administrador: todos (filtrar aparte si hace falta).
 */
export function empleadosVisiblesParaTienda(empleados, sucursalActiva, actorRol = null) {
  const lista = empleados || [];
  if (puedeGestionarUsuarios(actorRol)) return lista;

  const suc = normalizarCodigoTienda(sucursalActiva);
  return lista.filter((e) => {
    if (e?.activo === false) return false;
    const rol = normalizarRol(e.rol);
    if (rol === 'Administrador') return false;
    const empSuc = normalizarCodigoTienda(e.sucursal_id);
    if (empSuc === suc) return true;
    if (esEmpleadoIndirectoOMain(e)) return true;
    return false;
  });
}

/**
 * Préstamos a empleado:
 * - Tienda operativa: solo personal tipo tienda de esa sucursal (sin MAIN/indirectos).
 * - En MAIN (admin): empleados de tienda (todas) + usuarios MAIN/indirectos
 *   (estos últimos pueden pedir préstamo solo desde MAIN; no van a corte, sí a nómina).
 */
export function empleadosParaPrestamosEmpleado(empleados, sucursalActiva, actorRol = null) {
  const suc = normalizarCodigoTienda(sucursalActiva);
  const enMain = !suc || suc === 'MAIN';
  const sortNom = (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');

  if (enMain) {
    if (!puedeGestionarUsuarios(actorRol)) return [];
    return (empleados || [])
      .filter((e) => {
        if (!e || e.activo === false) return false;
        if (normalizarRol(e.rol) === 'Administrador') return false;
        const tipo = resolverTipoEmpleado(e);
        return tipo === 'tienda' || tipo === 'indirecto';
      })
      .sort(sortNom);
  }

  return (empleados || [])
    .filter((e) => {
      if (!e || e.activo === false) return false;
      if (normalizarRol(e.rol) === 'Administrador') return false;
      if (resolverTipoEmpleado(e) !== 'tienda') return false;
      return normalizarCodigoTienda(e.sucursal_id) === suc;
    })
    .sort(sortNom);
}

/** Agrupa el selector de préstamos en MAIN: Usuarios MAIN vs Empleados de tienda. */
export function agruparEmpleadosParaSelectPrestamo(empleados) {
  const main = [];
  const tienda = [];
  for (const e of empleados || []) {
    if (esEmpleadoIndirectoOMain(e)) main.push(e);
    else tienda.push(e);
  }
  const sortNom = (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
  return { main: main.sort(sortNom), tienda: tienda.sort(sortNom) };
}

/** Préstamo a usuario MAIN/indirecto: no carga corte; cuota semanal va a nómina. */
export function prestamoEmpleadoOmiteCorte(empleado) {
  return esEmpleadoIndirectoOMain(empleado);
}

/** ¿El empleado está asignado al turno de caja actual (hoy y hora)? */
export function empleadoEnTurnoActual(user, turno = turnoActual(), date = new Date()) {
  if (!user || !turno) return false;
  const rol = normalizarRol(user.rol);
  if (!['Cajero', 'Repartidor'].includes(rol)) return false;
  const asignado = turnoIdParaUsuario(user, date);
  if (!asignado) return false;
  if (esTurnoAmbos(asignado)) return true;
  return String(asignado) === String(turno.id);
}

function esPersonalIndirectoPorNombre(user) {
  const nom = String(user?.nombre || '')
    .trim()
    .toLowerCase();
  return BENEFICIARIOS_VALES.some((b) => b.nombre.toLowerCase() === nom);
}

/**
 * Tipo de empleado para catálogo:
 * - tienda: fijo de una sucursal (máx. 2)
 * - indirecto: MAIN / aparece en todas las sucursales y cortes
 *
 * Cajero/Repartidor anclado a tienda operativa cuenta como «tienda»
 * aunque el alta diga indirecto por error (así el nocturno no desaparece de Gastos).
 */
export function resolverTipoEmpleado(e) {
  const t = String(e?.tipo_empleado || '')
    .trim()
    .toLowerCase();
  const suc = normalizarCodigoTienda(e?.sucursal_id);
  const rol = normalizarRol(e?.rol);
  if (
    (rol === 'Cajero' || rol === 'Repartidor')
    && suc
    && !esSucursalNoVenta(suc)
  ) {
    return 'tienda';
  }
  if (t === 'indirecto' || t === 'tienda') return t;
  if (esPersonalIndirectoPorNombre(e)) return 'indirecto';
  if (
    suc === 'MAIN'
    && rol !== 'Administrador'
  ) {
    return 'indirecto';
  }
  return 'tienda';
}

export function esEmpleadoIndirectoOMain(e) {
  return resolverTipoEmpleado(e) === 'indirecto';
}

/** Cuenta empleados tipo tienda activos (no admin) en una sucursal. */
export function contarEmpleadosTiendaActivos(empleados, sucursalId, { excluirId = null } = {}) {
  const suc = normalizarCodigoTienda(sucursalId);
  if (!suc || suc === 'MAIN') return 0;
  return (empleados || []).filter((e) => {
    if (!e || e.activo === false) return false;
    if (excluirId != null && String(e.id) === String(excluirId)) return false;
    if (normalizarRol(e.rol) === 'Administrador') return false;
    if (resolverTipoEmpleado(e) !== 'tienda') return false;
    return normalizarCodigoTienda(e.sucursal_id) === suc;
  }).length;
}

export function puedeAgregarEmpleadoTienda(empleados, sucursalId, opts = {}) {
  const suc = normalizarCodigoTienda(sucursalId);
  if (!suc || suc === 'MAIN') {
    return { ok: false, error: 'Elige una sucursal operativa (no MAIN) para empleados de tienda.' };
  }
  const n = contarEmpleadosTiendaActivos(empleados, suc, opts);
  if (n >= MAX_EMPLEADOS_POR_TIENDA) {
    return {
      ok: false,
      error: `Ya hay ${MAX_EMPLEADOS_POR_TIENDA} empleados de tienda activos en esa sucursal. Da de baja uno o usa tipo Indirecto/MAIN.`,
    };
  }
  return { ok: true, count: n };
}

/**
 * Agrupa para UI Empleados / cortes:
 * - porTienda: [{ sucursalId, label, empleados }]
 * - indirectos: empleados MAIN / tipo indirecto
 */
export function agruparEmpleadosCatalogo(empleados, { incluirBajas = false } = {}) {
  const porMap = new Map();
  const indirectos = [];

  for (const e of empleados || []) {
    if (!incluirBajas && e?.activo === false) continue;
    if (normalizarRol(e?.rol) === 'Administrador') continue;
    if (esEmpleadoIndirectoOMain(e)) {
      indirectos.push(e);
      continue;
    }
    const sid = normalizarCodigoTienda(e.sucursal_id) || 'MAIN';
    if (!porMap.has(sid)) porMap.set(sid, []);
    porMap.get(sid).push(e);
  }

  const sortNom = (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
  indirectos.sort(sortNom);

  const tiendas = listarSucursalesOperativas();
  const porTienda = [];
  for (const sid of tiendas) {
    const list = (porMap.get(sid) || []).sort(sortNom);
    porTienda.push({ sucursalId: sid, empleados: list });
  }
  // Sucursales extra no listadas
  for (const [sid, list] of porMap.entries()) {
    if (tiendas.includes(sid) || sid === 'MAIN') continue;
    porTienda.push({ sucursalId: sid, empleados: list.sort(sortNom) });
  }

  return { porTienda, indirectos };
}

/**
 * En cortes (Virtual / Abarrotes / Garage) la categoría EMPLEADO admite
 * personal de tienda. Además, en Abarrotes/Virtual: Misael y Luis Enrique
 * (consumo con su PIN). El resto de indirectos/MAIN sigue bloqueado.
 */
export function actorPuedeGastosAIndirectos(_actorRol, _opts = {}) {
  return false;
}

/**
 * ¿Se puede cargar este gasto de corte a este empleado?
 * - Tienda: siempre (si está en catálogo).
 * - Misael / Luis Enrique: solo en abarrotes/virtual (consumo con PIN).
 * - Otros indirectos: no.
 */
export function empleadoPermitidoEnGastoCorte(empleado, { modulo = null } = {}) {
  if (!empleado) return false;
  if (normalizarRol(empleado.rol) === 'Administrador') return false;
  if (resolverTipoEmpleado(empleado) === 'tienda' && !empleado.es_indirecto_corte) return true;
  if (esEmpleadoConsumoPinCorte(empleado) && moduloCorteIncluyeConsumoPin(modulo)) return true;
  return false;
}

/** Cualquier gasto EMPLEADO a Misael/Luis Enrique exige su PIN. */
export function gastoCorteRequierePinConsumoBeneficiario(empleado, _subcategoria = '') {
  return esEmpleadoConsumoPinCorte(empleado);
}

/** Nombres normalizados de personal indirecto / MAIN (+ beneficiarios fijos de vales). */
export function listarNombresPersonalIndirecto(empleados = []) {
  const names = new Set();
  for (const b of BENEFICIARIOS_VALES) {
    const n = normalizarNombrePersona(b.nombre);
    if (n) names.add(n);
  }
  for (const e of empleados || []) {
    if (!esEmpleadoIndirectoOMain(e)) continue;
    const n = normalizarNombrePersona(e.nombre);
    if (n) names.add(n);
  }
  return [...names];
}

/**
 * True si el texto (comentario de gasto, etc.) menciona a personal indirecto.
 * Evita cargar consumos escribiendo el nombre en el comentario.
 */
export function textoMencionaPersonalIndirecto(texto, empleados = []) {
  const t = normalizarNombrePersona(texto);
  if (!t) return false;
  const tokens = new Set(t.split(' ').filter(Boolean));
  for (const nom of listarNombresPersonalIndirecto(empleados)) {
    if (!nom) continue;
    if (t.includes(nom)) return true;
    const parts = nom.split(' ').filter(Boolean);
    if (parts.length === 1 && parts[0].length >= 4 && tokens.has(parts[0])) return true;
    if (parts.length >= 2 && parts.every((p) => p.length >= 3 && tokens.has(p))) return true;
  }
  return false;
}

/**
 * Empleados en cortes (Virtual / Abarrotes / Garage) — categoría EMPLEADO:
 * personal tipo tienda (directos) de la sucursal activa — diurno Y nocturno.
 * Nunca filtrar por hora/turno actual: los gastos se cargan a quien corresponda.
 * En Abarrotes y Virtual también aparecen Misael y Luis Enrique (consumo + PIN).
 * Sin otros indirectos / MAIN, sin administradores.
 */
export function empleadosParaCorte(empleados, sucursalActiva, modulo = null, _actorRol = null, _opts = {}) {
  const suc = normalizarCodigoTienda(sucursalActiva);
  const ids = new Set();
  const out = [];
  const enMain = !suc || suc === 'MAIN';
  const incluirConsumoPin = moduloCorteIncluyeConsumoPin(modulo);
  // _opts.turno / date se ignoran a propósito: no ocultar al nocturno de día ni viceversa.

  const pushTienda = (e) => {
    if (!e || e?.activo === false) return;
    if (normalizarRol(e.rol) === 'Administrador') return;
    if (resolverTipoEmpleado(e) !== 'tienda') return;
    const id = String(e.id);
    if (ids.has(id)) return;
    ids.add(id);
    out.push({
      ...e,
      tipo_empleado: 'tienda',
      es_indirecto_corte: false,
      requiere_pin_consumo: false,
    });
  };

  const pushConsumoPin = (e) => {
    if (!incluirConsumoPin || !e || e?.activo === false) return;
    if (normalizarRol(e.rol) === 'Administrador') return;
    const ben = resolverBeneficiarioConsumoPin(e.nombre);
    if (!ben) return;
    const id = String(e.id);
    if (ids.has(id)) return;
    const row = {
      ...e,
      tipo_empleado: resolverTipoEmpleado(e) === 'tienda' ? 'tienda' : 'indirecto',
      es_indirecto_corte: resolverTipoEmpleado(e) !== 'tienda',
      requiere_pin_consumo: true,
      consumo_pin_id: ben.id,
      etiqueta_consumo_pin: ben.etiqueta,
    };
    const idxPrev = out.findIndex((x) => x.consumo_pin_id === ben.id);
    if (idxPrev >= 0) {
      const prev = out[idxPrev];
      const prevId = String(prev.id || '');
      const prevFake = prevId.startsWith('consumo-pin:') || prevId.startsWith('indirect:');
      const nextFake = id.startsWith('consumo-pin:') || id.startsWith('indirect:');
      const mejor = (!nextFake && prevFake)
        || (nextFake === prevFake && scoreEmpleadoDedup(row) > scoreEmpleadoDedup(prev));
      if (mejor) {
        ids.delete(prevId);
        ids.add(id);
        out[idxPrev] = row;
      }
      return;
    }
    ids.add(id);
    out.push(row);
  };

  for (const e of empleados || []) {
    if (e?.activo === false) continue;
    const empSuc = normalizarCodigoTienda(e.sucursal_id);
    const rol = normalizarRol(e.rol);
    const tipo = resolverTipoEmpleado(e);
    if (rol === 'Administrador') continue;

    // Misael / Luis Enrique: siempre en grupo consumo+PIN (aunque figuren como tienda).
    if (incluirConsumoPin && esEmpleadoConsumoPinCorte(e)) {
      pushConsumoPin(e);
      continue;
    }

    if (tipo === 'tienda') {
      if (enMain || empSuc === suc) pushTienda(e);
    }
  }

  // Placeholders fijos solo si falta ese beneficiario (nunca un segundo Misael/Luis).
  if (incluirConsumoPin) {
    for (const b of BENEFICIARIOS_CONSUMO_PIN) {
      if (out.some((e) => e.consumo_pin_id === b.id || resolverBeneficiarioConsumoPin(e.nombre)?.id === b.id)) {
        continue;
      }
      const id = `consumo-pin:${b.id}`;
      if (ids.has(id)) continue;
      out.push({
        id,
        nombre: b.etiqueta,
        rol: 'Indirecto',
        sucursal_id: 'MAIN',
        tipo_empleado: 'indirecto',
        es_indirecto_corte: true,
        requiere_pin_consumo: true,
        consumo_pin_id: b.id,
        etiqueta_consumo_pin: b.etiqueta,
        activo: true,
      });
      ids.add(id);
    }
  }

  const deduped = dedupeConsumoPinYNombre(out);
  const tienda = [];
  const pin = [];
  for (const e of deduped) {
    if (e.requiere_pin_consumo || e.consumo_pin_id) pin.push(e);
    else tienda.push(e);
  }
  const pinSorted = pin.sort((a, b) =>
    String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'),
  );
  return [...ordenarEmpleadosTiendaPorTurno(tienda), ...pinSorted];
}

/** Un solo Misael / Luis Enrique + dedupe por nombre del resto. */
export function dedupeConsumoPinYNombre(lista) {
  const porPin = new Map();
  const resto = [];
  for (const e of lista || []) {
    if (!e) continue;
    const pinId = e.consumo_pin_id || resolverBeneficiarioConsumoPin(e.nombre)?.id || null;
    if (pinId) {
      const prev = porPin.get(pinId);
      if (!prev) {
        porPin.set(pinId, {
          ...e,
          consumo_pin_id: pinId,
          requiere_pin_consumo: true,
          etiqueta_consumo_pin: e.etiqueta_consumo_pin
            || resolverBeneficiarioConsumoPin(e.nombre)?.etiqueta
            || e.nombre,
        });
        continue;
      }
      // Preferir registro real (UUID) sobre placeholder consumo-pin: / indirect:
      const prevId = String(prev.id || '');
      const nextId = String(e.id || '');
      const prevFake = prevId.startsWith('consumo-pin:') || prevId.startsWith('indirect:');
      const nextFake = nextId.startsWith('consumo-pin:') || nextId.startsWith('indirect:');
      const winner = (!nextFake && prevFake)
        || (nextFake === prevFake && scoreEmpleadoDedup(e) > scoreEmpleadoDedup(prev))
        ? e
        : prev;
      porPin.set(pinId, {
        ...winner,
        consumo_pin_id: pinId,
        requiere_pin_consumo: true,
        etiqueta_consumo_pin: resolverBeneficiarioConsumoPin(winner.nombre)?.etiqueta
          || winner.etiqueta_consumo_pin
          || winner.nombre,
      });
      continue;
    }
    resto.push(e);
  }
  return [...dedupeEmpleadosPorNombre(resto), ...porPin.values()];
}

/** Agrupa la lista ya filtrada de corte para <optgroup>. */
export function agruparEmpleadosParaSelectCorte(empleados) {
  const tienda = [];
  const consumoPin = [];
  const vistosPin = new Set();
  for (const e of dedupeConsumoPinYNombre(empleados || [])) {
    const rol = normalizarRol(e.rol);
    if (rol === 'Administrador' || e.es_admin_global_corte) continue;
    if (e.requiere_pin_consumo || e.consumo_pin_id || esEmpleadoConsumoPinCorte(e)) {
      const pinId = e.consumo_pin_id || resolverBeneficiarioConsumoPin(e.nombre)?.id || String(e.id);
      if (vistosPin.has(pinId)) continue;
      vistosPin.add(pinId);
      consumoPin.push(e);
      continue;
    }
    const tipo = resolverTipoEmpleado(e);
    if (tipo === 'tienda' && !e.es_indirecto_corte) {
      tienda.push(e);
    }
  }
  const sortNom = (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
  const consumoSorted = consumoPin.sort(sortNom);
  return {
    tienda: ordenarEmpleadosTiendaPorTurno(tienda),
    /** Misael / Luis Enrique (consumo con PIN). */
    consumoPin: consumoSorted,
    indirectos: [...consumoSorted],
    admins: [],
  };
}

/** Normaliza nombre para comparar personas (Gonzalo ≈ Gonzalo Leal). */
export function normalizarNombrePersona(nombre) {
  return String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** True si parecen la misma persona (nombre corto vs nombre completo). */
export function nombresMismaPersona(a, b) {
  const na = normalizarNombrePersona(a);
  const nb = normalizarNombrePersona(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.startsWith(`${nb} `) || nb.startsWith(`${na} `)) return true;
  const ta = na.split(' ');
  const tb = nb.split(' ');
  if (ta[0] && ta[0] === tb[0] && ta[0].length >= 4) {
    if (na.startsWith(nb) || nb.startsWith(na)) return true;
    if (ta.length >= 2 && tb.length >= 2 && ta[1] === tb[1]) return true;
  }
  return false;
}

function scoreEmpleadoDedup(e) {
  let s = 0;
  const id = String(e?.id || '');
  if (id && !id.startsWith('indirect:')) s += 20;
  s += String(e?.nombre || '').trim().length;
  if (resolverTipoEmpleado(e) === 'tienda') s += 5;
  else if (e?.es_indirecto_corte || resolverTipoEmpleado(e) === 'indirecto') s += 2;
  return s;
}

/** Quita duplicados tipo Gonzalo / Gonzalo Leal; prioriza registro real y nombre más completo. */
export function dedupeEmpleadosPorNombre(lista) {
  const out = [];
  for (const e of lista || []) {
    if (!e) continue;
    const tipoE = resolverTipoEmpleado(e);
    const idx = out.findIndex((x) => {
      if (!nombresMismaPersona(x.nombre, e.nombre)) return false;
      const tipoX = resolverTipoEmpleado(x);
      // No fusionar empleado de tienda con indirecto/MAIN (pueden compartir nombre corto).
      if (tipoE === 'tienda' && tipoX !== 'tienda') return false;
      if (tipoX === 'tienda' && tipoE !== 'tienda') return false;
      return true;
    });
    if (idx < 0) {
      out.push(e);
      continue;
    }
    const prev = out[idx];
    const winner = scoreEmpleadoDedup(e) > scoreEmpleadoDedup(prev) ? e : prev;
    const tipoW = resolverTipoEmpleado(winner);
    out[idx] = {
      ...winner,
      es_admin_global_corte: Boolean(prev.es_admin_global_corte || e.es_admin_global_corte),
      es_indirecto_corte: tipoW === 'tienda' ? false : Boolean(
        prev.es_indirecto_corte || e.es_indirecto_corte || tipoW === 'indirecto',
      ),
      tipo_empleado: tipoW,
    };
  }
  return out;
}

/** Indirectos en todas las tiendas y módulos de corte (no filtrar por área). */
function mergeIndirectosTodasLasTiendas(lista, todosUsuarios) {
  const ids = new Set(lista.map((e) => String(e.id)));
  let out = [...lista];

  for (const e of out) {
    if (resolverTipoEmpleado(e) === 'indirecto') e.es_indirecto_corte = true;
    if (resolverTipoEmpleado(e) === 'tienda') e.es_indirecto_corte = false;
  }

  for (const b of BENEFICIARIOS_VALES) {
    const hit = out.find((e) => nombresMismaPersona(e.nombre, b.nombre));
    if (hit && resolverTipoEmpleado(hit) !== 'tienda') {
      hit.es_indirecto_corte = true;
      continue;
    }
    const match = (todosUsuarios || []).find(
      (u) =>
        u?.activo !== false
        && nombresMismaPersona(u.nombre, b.nombre)
        && resolverTipoEmpleado(u) !== 'tienda',
    );
    if (match) {
      if (!ids.has(String(match.id))) {
        out.push({
          ...match,
          tipo_empleado: 'indirecto',
          es_indirecto_corte: true,
        });
        ids.add(String(match.id));
      }
    } else if (!ids.has(`indirect:${b.id}`)) {
      out.push({
        id: `indirect:${b.id}`,
        nombre: b.nombre,
        rol: 'Indirecto',
        sucursal_id: 'MAIN',
        tipo_empleado: 'indirecto',
        nomina_pagador: b.area,
        es_indirecto_corte: true,
      });
      ids.add(`indirect:${b.id}`);
    }
  }

  out = dedupeEmpleadosPorNombre(out);
  // Tras dedupe, restaurar flags según tipo real (evita que un merge por nombre los mueva a Main).
  for (const e of out) {
    const tipo = resolverTipoEmpleado(e);
    if (tipo === 'tienda') e.es_indirecto_corte = false;
    else if (tipo === 'indirecto') e.es_indirecto_corte = true;
  }
  return out.sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

/** Añade placeholders de indirectos para cruce de gastos en nómina. */
export function enriquecerEmpleadosNominaIndirectos(empleados) {
  const ids = new Set((empleados || []).map((e) => String(e.id)));
  const out = [...(empleados || [])];
  for (const b of BENEFICIARIOS_VALES) {
    if (out.some((e) => nombresMismaPersona(e.nombre, b.nombre))) continue;
    const id = `indirect:${b.id}`;
    if (ids.has(id)) continue;
    out.push({
      id,
      nombre: b.nombre,
      rol: 'Indirecto',
      sucursal_id: 'MAIN',
      tipo_empleado: 'indirecto',
      nomina_pagador: b.area,
      es_indirecto: true,
    });
    ids.add(id);
  }
  return dedupeEmpleadosPorNombre(out);
}

/** Lista global para nómina: operativos + placeholders de indirectos (vales). Sin socios 3B. */
export function empleadosParaNominaGlobal(empleados) {
  const base = (empleados || []).filter((e) => {
    if (e?.activo === false) return false;
    const rol = normalizarRol(e.rol);
    if (rol === 'Administrador') return false;
    if (rol === 'Cliente') return false;
    if (e?.excluir_nomina || e?.socio_3b || e?.tipo_empleado === 'socio_3b') return false;
    return true;
  });
  return enriquecerEmpleadosNominaIndirectos(base);
}

/**
 * Catálogo de beneficiarios para vales:
 * - fijos históricos (Luis Enrique / Misael / Gonzalo) con área de corte por defecto
 * - todo el personal indirecto / MAIN activo (sin administradores)
 */
export function listarBeneficiariosVales(empleados = []) {
  const out = [];
  const seenNom = new Set();

  const push = (b) => {
    const key = normalizarNombrePersona(b.nombre);
    if (!key || seenNom.has(key)) return;
    seenNom.add(key);
    out.push(b);
  };

  for (const b of BENEFICIARIOS_VALES) {
    push({ ...b, fijo: true, usuario_id: null });
  }

  for (const e of empleados || []) {
    if (!e || e.activo === false) continue;
    if (normalizarRol(e.rol) === 'Administrador') continue;
    if (!esEmpleadoIndirectoOMain(e)) continue;
    const areaRaw = String(e.nomina_pagador || '').toLowerCase();
    const area = AREAS_CONTABILIDAD.includes(areaRaw) ? areaRaw : null;
    // Preferir id fijo si coincide con placeholder
    const fijo = BENEFICIARIOS_VALES.find((b) => nombresMismaPersona(b.nombre, e.nombre));
    if (fijo) {
      // Actualizar entrada fija con usuario_id real si aplica
      const idx = out.findIndex((x) => x.id === fijo.id);
      if (idx >= 0) {
        out[idx] = {
          ...out[idx],
          nombre: e.nombre || out[idx].nombre,
          usuario_id: String(e.id).startsWith('indirect:') ? null : e.id,
          area: out[idx].area || area,
        };
      }
      continue;
    }
    push({
      id: `usr-${slugBeneficiarioVale(e.nombre)}-${String(e.id).slice(0, 8)}`,
      nombre: e.nombre,
      area,
      usuario_id: String(e.id).startsWith('indirect:') ? null : e.id,
      fijo: false,
      esIndirectoMain: true,
    });
  }

  return out.sort((a, b) => {
    if (a.fijo && !b.fijo) return -1;
    if (!a.fijo && b.fijo) return 1;
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
  });
}

/** Pantalla Usuarios (solo admin): filtro opcional por tienda. */
export function filtrarEmpleadosAdmin(empleados, filtroSucursal) {
  if (!filtroSucursal) return empleados || [];
  const f = normalizarCodigoTienda(filtroSucursal);
  return (empleados || []).filter((e) => {
    if (esEmpleadoIndirectoOMain(e) && f !== 'MAIN') {
      // Indirectos visibles también al filtrar cualquier tienda (están en todas)
      return true;
    }
    return normalizarCodigoTienda(e.sucursal_id) === f;
  });
}

export { esPersonalIndirectoPorNombre as esPersonalIndirecto };
