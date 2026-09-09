/**
 * Efectos al dar de alta un Cubre Turno:
 * - Nombre en catálogo de gastos (CUBRE TURNO → nombre) para capturar el pago.
 * - Notificación del PIN universal CT (el de Configuración por tienda).
 * No crea usuario POS ni nómina.
 */
import { etiquetaTienda, listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
import { crearNotificacion } from './contabilidadNotificaciones.js';
import {
  crearCategoriaContVirtual,
  crearSubcategoriaContVirtual,
  listarCatalogoContVirtual,
} from './contVirtualCatalogo.js';
import { refrescarPinCubreTurnoSucursal } from './cubreTurnoSync.js';

export const ID_CAT_CUBRE_TURNO = 'cubre-turno';

function nombreCtNorm(nombre) {
  return String(nombre || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Asegura categoría CUBRE TURNO y subcategoría con el nombre del CT
 * (aparece en cortes / gastos para registrar su pago fuera de nómina).
 */
export async function asegurarCategoriaGastoCt(supabase, nombreCt) {
  const nombre = nombreCtNorm(nombreCt);
  if (!nombre) return { ok: false, error: 'Nombre CT vacío.' };

  let catId = ID_CAT_CUBRE_TURNO;
  const lista = await listarCatalogoContVirtual(supabase);
  const cats = lista.data || [];
  let cat = cats.find((c) => String(c.id) === ID_CAT_CUBRE_TURNO)
    || cats.find((c) => String(c.nombre || '').trim().toUpperCase() === 'CUBRE TURNO');

  if (!cat) {
    const creada = await crearCategoriaContVirtual(supabase, {
      nombre: 'CUBRE TURNO',
      flujo: 'egreso',
      enCatalogoCortes: true,
    });
    if (!creada.ok) return creada;
    catId = creada.id || ID_CAT_CUBRE_TURNO;
  } else {
    catId = cat.id;
  }

  const ie = await listarCatalogoContVirtual(supabase);
  const ieCat = (ie.data || []).find((c) => c.id === catId);
  const existentes = new Set(
    (ieCat?.subcategorias || []).map((s) => String(s.nombre || '').trim().toUpperCase()),
  );
  if (existentes.has(nombre)) {
    return { ok: true, yaExiste: true, categoriaId: catId, subcategoria: nombre };
  }

  const sub = await crearSubcategoriaContVirtual(supabase, {
    categoriaId: catId,
    nombre,
  });
  if (!sub.ok) return sub;
  return { ok: true, categoriaId: catId, subcategoria: nombre, id: sub.id };
}

/** Lee PINs CT de las tiendas habilitadas (PIN universal por sucursal). */
export async function leerPinsCtParaNotificar(supabase, sucursales = []) {
  const lista = (sucursales?.length ? sucursales : listarSucursalesOperativas())
    .map((s) => normalizarCodigoTienda(s))
    .filter(Boolean);
  const out = [];
  for (const suc of lista) {
    const r = await refrescarPinCubreTurnoSucursal(supabase, suc);
    const pin = String(r.pin || '').trim();
    if (pin) out.push({ sucursal: suc, pin, etiqueta: etiquetaTienda(suc) });
  }
  return out;
}

export function textoNotificacionPinCt({ nombre, pins = [], soloDia = false, sucursales = [] } = {}) {
  const quien = String(nombre || 'CT').trim();
  const ambito = soloDia ? 'solo turnos de día' : 'día y noche';
  const tiendas = (sucursales || []).map((s) => etiquetaTienda(s)).join(', ') || 'las 7 sucursales';
  let cuerpo = (
    `${quien} quedó registrado como Cubre Turno (${ambito}). `
    + `Puede cubrir en: ${tiendas}. `
    + 'No entra a nómina: su pago se captura como gasto CUBRE TURNO → su nombre. '
  );
  if (!pins.length) {
    cuerpo += (
      'Aún no hay PIN CT configurado en las tiendas. '
      + 'Configúralo en Configuración → PIN cubre turno y avísale al CT.'
    );
  } else {
    const lineas = pins.map((p) => `${p.etiqueta}: ${p.pin}`).join(' · ');
    cuerpo += `PIN(es) para entrar al POS (cubre turno): ${lineas}.`;
  }
  return cuerpo;
}

/**
 * Tras el alta RH de un CT: categoría de gasto + aviso con PIN.
 */
export async function postAltaCubreTurno(supabase, empleado, extras = {}) {
  if (!supabase || !empleado) return { ok: false, error: 'Sin empleado.' };
  const nombre = String(empleado.nombre_completo || empleado.nombre || '').trim();
  const soloDia = Boolean(extras.ct_solo_dia ?? extras.solo_dia);
  const sucursales = Array.isArray(extras.ct_sucursales)
    ? extras.ct_sucursales
    : (Array.isArray(extras.sucursales_habilitadas) ? extras.sucursales_habilitadas : listarSucursalesOperativas());

  const gasto = await asegurarCategoriaGastoCt(supabase, nombre);
  const pins = await leerPinsCtParaNotificar(supabase, sucursales);
  const mensaje = textoNotificacionPinCt({ nombre, pins, soloDia, sucursales });

  const notif = await crearNotificacion(supabase, {
    sucursal_id: empleado.sucursal_id || sucursales[0] || 'MAIN',
    tipo: 'ct_alta_pin',
    ref_tabla: 'rh_empleados',
    ref_id: empleado.id,
    titulo: `Alta CT · ${nombre}`,
    mensaje,
  });

  return {
    ok: true,
    gasto,
    notificacion: notif,
    pins,
    mensaje: (
      `CT ${nombre} listo.`
      + (gasto.ok ? ' Aparece en gastos CUBRE TURNO.' : '')
      + (pins.length
        ? ` PIN notificado (${pins.length} tienda(s)).`
        : ' Configura el PIN CT en cada tienda y vuelve a avisar.')
    ),
  };
}
