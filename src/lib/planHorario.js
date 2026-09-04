/**
 * Plan horario semanal (plantilla L–D) por tienda.
 * Bloques de turno / descanso, color y relación con CT (cubre turnos).
 * Nombres de empleados directos: módulo Usuarios (tipo tienda).
 */
import { listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
import { MAX_EMPLEADOS_POR_TIENDA, resolverTipoEmpleado } from './empleadosVisibles.js';
import { normalizarRol } from './roles.js';

export const DIAS_PLAN_HORARIO = [
  { id: 1, label: 'LUNES', corto: 'Lun' },
  { id: 2, label: 'MARTES', corto: 'Mar' },
  { id: 3, label: 'MIÉRCOLES', corto: 'Mié' },
  { id: 4, label: 'JUEVES', corto: 'Jue' },
  { id: 5, label: 'VIERNES', corto: 'Vie' },
  { id: 6, label: 'SÁBADO', corto: 'Sáb' },
  { id: 0, label: 'DOMINGO', corto: 'Dom' },
];

export const COLOR_DESCANSO_DEFAULT = '#ffe566';

export const COLORES_PLAN_HORARIO = [
  { id: 'turno', hex: '#ffffff', label: 'Turno (blanco)' },
  { id: 'descanso', hex: COLOR_DESCANSO_DEFAULT, label: 'Descanso / CT' },
  { id: 'verde', hex: '#c8e6c9', label: 'Verde' },
  { id: 'azul', hex: '#bbdefb', label: 'Azul' },
  { id: 'naranja', hex: '#ffe0b2', label: 'Naranja' },
  { id: 'rosa', hex: '#f8bbd0', label: 'Rosa' },
  { id: 'lila', hex: '#e1bee7', label: 'Lila' },
  { id: 'gris', hex: '#eceff1', label: 'Gris' },
];

/** Encabezados de tienda (colores del plan de hoja de cálculo). */
export const COLORES_TIENDA_PLAN = {
  FUSION: '#9ccc65',
  '3B2': '#81d4fa',
  '3B5': '#c4a35a',
  '3B6': '#4dd0e1',
  '3B7': '#aed581',
  '3B9': '#64b5f6',
  '3B10': '#7e57c2',
};

export const NOMBRES_TIENDA_PLAN = {
  FUSION: 'ABARROTES FUSION',
  '3B2': 'ABARROTES 3B2 PUEBLO NUEVO',
  '3B5': 'ABARROTES 3B5 LOMAS DOS',
  '3B6': 'ABARROTES 3B6 SOLIDARIDAD',
  '3B7': 'ABARROTES 3B7 COLONIA DEL VALLE',
  '3B9': 'ABARROTES 3B9 BUENOS AIRES',
  '3B10': 'ABARROTES 3B10 EL MEZQUITE',
};

export function tituloTiendaPlan(codigo) {
  const c = normalizarCodigoTienda(codigo);
  if (NOMBRES_TIENDA_PLAN[c]) return NOMBRES_TIENDA_PLAN[c];
  return c ? `ABARROTES ${c}` : 'ABARROTES';
}

export function colorTiendaPlan(codigo) {
  const c = normalizarCodigoTienda(codigo);
  return COLORES_TIENDA_PLAN[c] || '#bdbdbd';
}

export function idFilaEmpleado(sucursal, usuarioId) {
  return `emp:${normalizarCodigoTienda(sucursal)}:${usuarioId}`;
}

export function idFilaCt(sucursal) {
  return `ct:${normalizarCodigoTienda(sucursal)}`;
}

export function idFilaVacia(sucursal) {
  return `emp:${normalizarCodigoTienda(sucursal)}:vacio`;
}

/** 07:00 → 7:00 AM; 19:00 se queda en 24 h (como la hoja). */
export function formatoHoraPlan(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return String(hhmm || '').trim() || '—';
  const h = parseInt(m[1], 10);
  const min = m[2];
  if (h === 0) return `12:${min} AM`;
  if (h < 12) return `${h}:${min} AM`;
  if (h === 12) return `12:${min} PM`;
  return `${h}:${min}`;
}

export function formatoBloqueHorario(horaInicio, horaFin) {
  return `${formatoHoraPlan(horaInicio)} A ${formatoHoraPlan(horaFin)}`;
}

export function celdaTurno(extra = {}) {
  return {
    tipo: 'turno',
    color: extra.color || null,
    ctId: extra.ctId || null,
    ctNombre: extra.ctNombre || null,
    ctTelefono: extra.ctTelefono || null,
  };
}

export function celdaDescanso(extra = {}) {
  return {
    tipo: 'descanso',
    color: extra.color || COLOR_DESCANSO_DEFAULT,
    ctId: extra.ctId || null,
    ctNombre: extra.ctNombre || null,
    ctTelefono: extra.ctTelefono || null,
  };
}

export function normalizarCelda(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const tipo = r.tipo === 'descanso' ? 'descanso' : 'turno';
  const color = r.color == null || r.color === '' ? (tipo === 'descanso' ? COLOR_DESCANSO_DEFAULT : null) : String(r.color);
  const ctNombre = String(r.ctNombre || '').trim() || null;
  const ctId = r.ctId == null || r.ctId === '' ? null : String(r.ctId);
  const ctTelefono = String(r.ctTelefono || '').replace(/\D/g, '') || null;
  return { tipo, color, ctId, ctNombre, ctTelefono };
}

function celdasCompletas(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const d of DIAS_PLAN_HORARIO) {
    out[String(d.id)] = normalizarCelda(src[String(d.id)] ?? src[d.id]);
  }
  return out;
}

export function normalizarFila(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const sucursal_id = normalizarCodigoTienda(r.sucursal_id);
  const tipo = r.tipo === 'ct' ? 'ct' : 'empleado';
  const orden = Number.isFinite(Number(r.orden)) ? Number(r.orden) : (tipo === 'ct' ? 90 : 0);
  return {
    id: String(r.id || (tipo === 'ct' ? idFilaCt(sucursal_id) : idFilaVacia(sucursal_id))),
    sucursal_id,
    tipo,
    usuario_id: r.usuario_id == null || r.usuario_id === '' ? null : r.usuario_id,
    nombre: String(r.nombre || (tipo === 'ct' ? 'CT' : 'SIN EMPLEADO')).trim() || (tipo === 'ct' ? 'CT' : 'SIN EMPLEADO'),
    orden,
    turno_id: r.turno_id ? String(r.turno_id) : (tipo === 'ct' || orden === 0 ? 'diurno' : 'nocturno'),
    celdas: celdasCompletas(r.celdas),
  };
}

export function planVacio() {
  return { version: 1, filas: [] };
}

export function normalizarPlan(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const filas = Array.isArray(r.filas) ? r.filas.map(normalizarFila).filter((f) => f.sucursal_id) : [];
  return { version: 1, filas };
}

export function etiquetaNombreEmpleado(usuario, rhMatch = null) {
  const nom = String(usuario?.nombre || rhMatch?.nombre_completo || '').trim();
  const tel = String(rhMatch?.telefono || usuario?.telefono || '').replace(/\D/g, '');
  const base = nom.toUpperCase();
  if (tel.length >= 10) return `${base} ${tel.slice(-10)}`;
  return base || 'SIN NOMBRE';
}

function esEmpleadoDirectoTienda(u) {
  if (!u || u.activo === false) return false;
  if (normalizarRol(u.rol) === 'Administrador') return false;
  return resolverTipoEmpleado(u) === 'tienda';
}

function pesoTurno(u) {
  const id = String(u?.turno_id || '').toLowerCase();
  if (id === 'diurno' || id === 'manana' || id === 'mañana') return 0;
  if (id === 'nocturno' || id === 'noche') return 2;
  if (id === 'tarde') return 1;
  if (id === 'ambos') return 0;
  return 1;
}

/** Empleados fijos de tienda (Usuarios), máx. 2 por sucursal, diurno primero. */
export function empleadosPorTiendaParaPlan(usuarios) {
  const map = new Map();
  for (const suc of listarSucursalesOperativas()) map.set(suc, []);
  for (const u of usuarios || []) {
    if (!esEmpleadoDirectoTienda(u)) continue;
    const suc = normalizarCodigoTienda(u.sucursal_id);
    if (!map.has(suc)) continue;
    map.get(suc).push(u);
  }
  for (const [suc, list] of map) {
    list.sort((a, b) => {
      const pt = pesoTurno(a) - pesoTurno(b);
      if (pt !== 0) return pt;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
    });
    map.set(suc, list.slice(0, MAX_EMPLEADOS_POR_TIENDA));
  }
  return map;
}

function rhDeUsuario(usuario, rhPorUsuarioId, rhPorNombre) {
  if (!usuario) return null;
  if (usuario.id != null && rhPorUsuarioId?.has(String(usuario.id))) {
    return rhPorUsuarioId.get(String(usuario.id));
  }
  const n = String(usuario.nombre || '').trim().toLowerCase();
  if (n && rhPorNombre?.has(n)) return rhPorNombre.get(n);
  return null;
}

/**
 * Reconstruye filas del calendario: empleados actuales de Usuarios + fila CT por tienda.
 * Conserva celdas (descansos, colores, CT) de filas que siguen existiendo.
 */
export function fusionarPlanConUsuarios(plan, usuarios, opts = {}) {
  const prev = normalizarPlan(plan);
  const porId = new Map(prev.filas.map((f) => [f.id, f]));
  const porTienda = empleadosPorTiendaParaPlan(usuarios);
  const rhPorUsuarioId = opts.rhPorUsuarioId || new Map();
  const rhPorNombre = opts.rhPorNombre || new Map();
  const filas = [];

  for (const suc of listarSucursalesOperativas()) {
    const emps = porTienda.get(suc) || [];
    if (emps.length) {
      emps.forEach((u, i) => {
        const id = idFilaEmpleado(suc, u.id);
        const prevF = porId.get(id);
        const rh = rhDeUsuario(u, rhPorUsuarioId, rhPorNombre);
        filas.push(normalizarFila({
          ...prevF,
          id,
          sucursal_id: suc,
          tipo: 'empleado',
          usuario_id: u.id,
          nombre: etiquetaNombreEmpleado(u, rh),
          orden: i,
          turno_id: u.turno_id || (i === 1 ? 'nocturno' : 'diurno'),
          celdas: prevF?.celdas,
        }));
      });
    } else {
      const id = idFilaVacia(suc);
      const prevF = porId.get(id);
      filas.push(normalizarFila({
        ...prevF,
        id,
        sucursal_id: suc,
        tipo: 'empleado',
        usuario_id: null,
        nombre: 'SIN EMPLEADO',
        orden: 0,
        turno_id: 'diurno',
        celdas: prevF?.celdas,
      }));
    }

    const ctId = idFilaCt(suc);
    const prevCt = porId.get(ctId);
    filas.push(normalizarFila({
      ...prevCt,
      id: ctId,
      sucursal_id: suc,
      tipo: 'ct',
      usuario_id: null,
      nombre: 'CT',
      orden: 90,
      turno_id: prevCt?.turno_id || 'diurno',
      celdas: prevCt?.celdas,
    }));
  }

  return { version: 1, filas };
}

export function agruparFilasPorTienda(plan) {
  const filas = normalizarPlan(plan).filas;
  const porSuc = new Map();
  for (const f of filas) {
    if (!porSuc.has(f.sucursal_id)) porSuc.set(f.sucursal_id, []);
    porSuc.get(f.sucursal_id).push(f);
  }
  const grupos = [];
  const orden = listarSucursalesOperativas();
  const seen = new Set();
  for (const suc of orden) {
    const list = porSuc.get(suc);
    if (!list?.length) continue;
    seen.add(suc);
    grupos.push({
      sucursalId: suc,
      titulo: tituloTiendaPlan(suc),
      color: colorTiendaPlan(suc),
      filas: [...list].sort((a, b) => a.orden - b.orden),
    });
  }
  for (const [suc, list] of porSuc) {
    if (seen.has(suc)) continue;
    grupos.push({
      sucursalId: suc,
      titulo: tituloTiendaPlan(suc),
      color: colorTiendaPlan(suc),
      filas: [...list].sort((a, b) => a.orden - b.orden),
    });
  }
  return grupos;
}

export function turnoDeFila(fila, turnosLista = []) {
  const list = Array.isArray(turnosLista) ? turnosLista : [];
  const prefer = String(fila?.turno_id || (fila?.orden === 1 ? 'nocturno' : 'diurno'));
  const hit = list.find((t) => String(t.id) === prefer);
  if (hit) return hit;
  if (prefer === 'nocturno' || fila?.orden === 1) {
    return list.find((t) => /nocturno|noche/i.test(String(t.id))) || list[1] || list[0] || { hora_inicio: '19:00', hora_fin: '07:00' };
  }
  return list.find((t) => /diurno|manana|mañana/i.test(String(t.id))) || list[0] || { hora_inicio: '07:00', hora_fin: '19:00' };
}

export function textoCelda(celda, horasLabel) {
  const c = normalizarCelda(celda);
  if (c.tipo === 'descanso') return (c.ctNombre || 'DESCANSO').toUpperCase();
  if (c.ctNombre) return c.ctNombre.toUpperCase();
  return horasLabel || '—';
}

export function colorFondoCelda(celda) {
  const c = normalizarCelda(celda);
  if (c.color) return c.color;
  return '#ffffff';
}

/** Intercambia dos bloques (mover descanso / cobertura entre días o filas). */
export function moverCelda(plan, fromFilaId, fromDia, toFilaId, toDia) {
  const fromKey = String(fromDia);
  const toKey = String(toDia);
  if (fromFilaId === toFilaId && fromKey === toKey) return normalizarPlan(plan);
  const next = normalizarPlan(plan);
  const from = next.filas.find((f) => f.id === fromFilaId);
  const to = next.filas.find((f) => f.id === toFilaId);
  if (!from || !to) return next;
  const a = from.celdas[fromKey];
  const b = to.celdas[toKey];
  from.celdas[fromKey] = normalizarCelda(b);
  to.celdas[toKey] = normalizarCelda(a);
  return next;
}

export function parchearCelda(plan, filaId, dia, patch) {
  const key = String(dia);
  const p = patch && typeof patch === 'object' ? patch : {};
  return {
    version: 1,
    filas: normalizarPlan(plan).filas.map((f) => {
      if (f.id !== filaId) return f;
      const prev = normalizarCelda(f.celdas[key]);
      let merged = { ...prev, ...p };
      if (p.tipo === 'descanso' && (p.color == null || p.color === '') && !prev.color) {
        merged.color = COLOR_DESCANSO_DEFAULT;
      }
      if (p.tipo === 'turno' && p.ctId === undefined && p.ctNombre === undefined) {
        merged.ctId = null;
        merged.ctNombre = null;
        merged.ctTelefono = null;
        if (p.color === undefined) merged.color = null;
      }
      if (p.ctNombre != null) merged.ctNombre = String(p.ctNombre).trim() || null;
      return { ...f, celdas: { ...f.celdas, [key]: normalizarCelda(merged) } };
    }),
  };
}

export function asignarDescansoConCt(plan, filaId, dia, ct) {
  return parchearCelda(plan, filaId, dia, {
    tipo: 'descanso',
    color: COLOR_DESCANSO_DEFAULT,
    ctId: ct?.id || null,
    ctNombre: ct?.nombre || null,
    ctTelefono: ct?.telefono || null,
  });
}

export function quitarDescanso(plan, filaId, dia) {
  return parchearCelda(plan, filaId, dia, {
    tipo: 'turno',
    color: null,
    ctId: null,
    ctNombre: null,
    ctTelefono: null,
  });
}

function nombreRh(e) {
  if (e?.nombre_completo) return String(e.nombre_completo).trim();
  return [e?.nombre, e?.apellidos].filter(Boolean).join(' ').trim();
}

/** CT de RH + empleados de tienda (pueden cubrirse entre sucursales). */
export function listarCandidatosCt({ usuarios = [], rhCubre = [] } = {}) {
  const out = [];
  const seen = new Set();

  for (const e of rhCubre || []) {
    if (!e || e.estado === 'baja') continue;
    const nombre = nombreRh(e);
    if (!nombre) continue;
    const key = nombre.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `rh:${e.id}`,
      nombre,
      telefono: String(e.telefono || '').replace(/\D/g, '') || null,
      origen: 'rh',
      sucursal_id: e.sucursal_id || null,
    });
  }

  for (const u of usuarios || []) {
    if (!esEmpleadoDirectoTienda(u)) continue;
    const nombre = String(u.nombre || '').trim();
    if (!nombre) continue;
    const key = nombre.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `usr:${u.id}`,
      nombre,
      telefono: String(u.telefono || '').replace(/\D/g, '') || null,
      origen: 'usuario',
      sucursal_id: u.sucursal_id || null,
      usuario_id: u.id,
    });
  }

  out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return out;
}

export function mapasRhParaPlan(rhEmpleados) {
  const rhPorUsuarioId = new Map();
  const rhPorNombre = new Map();
  for (const e of rhEmpleados || []) {
    if (e?.usuario_id != null) rhPorUsuarioId.set(String(e.usuario_id), e);
    const n = nombreRh(e).toLowerCase();
    if (n) rhPorNombre.set(n, e);
  }
  return { rhPorUsuarioId, rhPorNombre };
}

/** Lunes 00:00 local + offset de semanas. */
export function inicioSemanaPlan(offset = 0, from = new Date()) {
  const hoy = new Date(from);
  const day = hoy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const ini = new Date(hoy);
  ini.setDate(hoy.getDate() + diff + offset * 7);
  ini.setHours(0, 0, 0, 0);
  return ini;
}

export function fechasSemanaPlan(offset = 0, from = new Date()) {
  const ini = inicioSemanaPlan(offset, from);
  return DIAS_PLAN_HORARIO.map((d, i) => {
    const dt = new Date(ini);
    dt.setDate(ini.getDate() + i);
    return { diaId: d.id, fecha: dt };
  });
}

export function etiquetaFechaCorta(date) {
  try {
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}
