/** IDs de módulo válidos (menú + submódulos de Contabilidad; alinear con roles.js MODULOS_ORDEN). */
export const MODULOS_IDS = [
  'Inicio',
  'Incidencias',
  'Ventas',
  'Escáner caja',
  'Corte de caja',
  'Recolecciones',
  'Liquidación recolecciones',
  'Corte Virtual',
  'Corte Abarrotes',
  'Corte Garage',
  'Productos',
  'Venta en Ruta',
  'Compras',
  'Checador',
  'Check List',
  'Proveedores',
  'Clientes',
  'Usuarios',
  'Consultas',
  'Estadisticas',
  'Resumen operativo',
  'Reportes',
  'Vales y Préstamos',
  'Nómina',
  'Panel RT',
  'IE VIRTUAL',
  'IE ABARROTES',
  'Auto Fin',
  'Crédito',
  'Cobranza',
  'Configuracion',
  'Ayuda',
];

const VALIDOS = new Set(MODULOS_IDS);

const ALIAS_MODULO = {
  'Recolecciones y traspasos': 'Panel RT',
  Buzón: 'Incidencias',
  Estadísticas: 'Estadisticas',
  Configuración: 'Configuracion',
  'Corte de Caja': 'Corte de caja',
  'Cont Virtual': 'IE VIRTUAL',
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

/** Módulos nuevos que se agregan a listas personalizadas si faltan (una vez). */
const MODULOS_MIGRA_PRIVILEGIOS = ['Check List'];

function conModulosMigrados(lista) {
  const set = new Set(normalizarListaModulos(lista));
  for (const m of MODULOS_MIGRA_PRIVILEGIOS) {
    if (VALIDOS.has(m)) set.add(m);
  }
  return MODULOS_IDS.filter((m) => set.has(m));
}

export function sanitizarPrivilegios(data) {
  const porRol = {};
  const porUsuario = {};
  const migrados = new Set(
    Array.isArray(data?._migratedModulos) ? data._migratedModulos.map(String) : [],
  );
  const faltaMigra = MODULOS_MIGRA_PRIVILEGIOS.some((m) => !migrados.has(m));

  if (data?.porRol && typeof data.porRol === 'object') {
    for (const [rol, lista] of Object.entries(data.porRol)) {
      if (Array.isArray(lista)) {
        porRol[rol] = faltaMigra ? conModulosMigrados(lista) : normalizarListaModulos(lista);
      }
    }
  }
  if (data?.porUsuario && typeof data.porUsuario === 'object') {
    for (const [uid, lista] of Object.entries(data.porUsuario)) {
      if (Array.isArray(lista)) {
        porUsuario[String(uid)] = faltaMigra
          ? conModulosMigrados(lista)
          : normalizarListaModulos(lista);
      }
    }
  }
  for (const m of MODULOS_MIGRA_PRIVILEGIOS) migrados.add(m);
  return {
    porRol,
    porUsuario,
    acciones: data?.acciones && typeof data.acciones === 'object' ? data.acciones : {},
    _updatedAt: data?._updatedAt || null,
    _migratedModulos: [...migrados],
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
