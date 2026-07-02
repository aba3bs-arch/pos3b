/** IDs de módulo válidos (debe coincidir con roles.js MODULOS_ORDEN). */
export const MODULOS_IDS = [
  'Inicio',
  'Incidencias',
  'Ventas',
  'Corte de caja',
  'Recolecciones',
  'Liquidación recolecciones',
  'Corte Virtual',
  'Corte Abarrotes',
  'Corte Garage',
  'Productos',
  'Compras',
  'Checador',
  'Proveedores',
  'Clientes',
  'Usuarios',
  'Consultas',
  'Estadisticas',
  'Reportes',
  'Vales y Préstamos',
  'Nómina',
  'Recolecciones y traspasos',
  'Configuracion',
  'Ayuda',
];

const VALIDOS = new Set(MODULOS_IDS);

const ALIAS_MODULO = {
  Buzón: 'Incidencias',
  Estadísticas: 'Estadisticas',
  Configuración: 'Configuracion',
  'Corte de Caja': 'Corte de caja',
};

export function normalizarListaModulos(lista) {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set();
  const out = [];
  for (const raw of lista) {
    const m = ALIAS_MODULO[raw] || raw;
    if (!VALIDOS.has(m) || vistos.has(m)) continue;
    vistos.add(m);
    out.push(m);
  }
  return MODULOS_IDS.filter((m) => vistos.has(m));
}

export function sanitizarPrivilegios(data) {
  const porRol = {};
  const porUsuario = {};
  if (data?.porRol && typeof data.porRol === 'object') {
    for (const [rol, lista] of Object.entries(data.porRol)) {
      if (Array.isArray(lista)) porRol[rol] = normalizarListaModulos(lista);
    }
  }
  if (data?.porUsuario && typeof data.porUsuario === 'object') {
    for (const [uid, lista] of Object.entries(data.porUsuario)) {
      if (Array.isArray(lista)) porUsuario[String(uid)] = normalizarListaModulos(lista);
    }
  }
  return {
    porRol,
    porUsuario,
    acciones: data?.acciones && typeof data.acciones === 'object' ? data.acciones : {},
    _updatedAt: data?._updatedAt || null,
  };
}

export function tieneListaPersonalizada(store, key, data) {
  if (!key || !data?.[store]) return false;
  return Object.prototype.hasOwnProperty.call(data[store], key);
}

export function modulosEnEdicionPrivilegios({ privilegios, store, key, defaults }) {
  if (key && tieneListaPersonalizada(store, key, privilegios)) {
    return normalizarListaModulos(privilegios[store][key]);
  }
  return normalizarListaModulos(defaults);
}

export function modulosPermitidosDesde(privilegios, rol, userId, defaultsRol) {
  const uid = userId != null ? String(userId) : '';
  if (uid && tieneListaPersonalizada('porUsuario', uid, privilegios)) {
    return normalizarListaModulos(privilegios.porUsuario[uid]);
  }
  if (tieneListaPersonalizada('porRol', rol, privilegios)) {
    return normalizarListaModulos(privilegios.porRol[rol]);
  }
  return normalizarListaModulos(defaultsRol);
}

export function origenPrivilegios(rol, userId, privilegios, esAdmin = false) {
  if (esAdmin) return 'administrador';
  const uid = userId != null ? String(userId) : '';
  if (uid && tieneListaPersonalizada('porUsuario', uid, privilegios)) return 'usuario';
  if (tieneListaPersonalizada('porRol', rol, privilegios)) return 'rol';
  return 'defecto';
}

export function describeOrigenPrivilegios(rol, userId, privilegios, esAdmin = false) {
  const o = origenPrivilegios(rol, userId, privilegios, esAdmin);
  if (o === 'administrador') return 'Acceso total (Administrador)';
  if (o === 'usuario') return 'Lista personalizada de este empleado (tiene prioridad sobre el rol)';
  if (o === 'rol') return `Lista personalizada del rol ${rol}`;
  return `Permisos por defecto del rol ${rol}`;
}
