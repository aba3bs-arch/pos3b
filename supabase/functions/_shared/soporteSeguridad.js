/**
 * Filtro de seguridad del asistente de Soporte.
 * Lo usan el navegador (src/lib/soporteBot.js) y la Edge Function soporte-ia,
 * así una llamada directa a la función tampoco se salta las reglas.
 *
 * Bloquea preguntas para robar, evadir controles, manipular registros, conocer claves
 * ajenas, subir privilegios o hacer que la IA ignore sus reglas.
 */

export function normalizarSeguridad(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const REGLAS = [
  {
    categoria: 'robo_fraude',
    etiqueta: 'Robo o fraude',
    patrones: [
      /\brob(ar|arme|arle|arse|arnos)\b/,
      /\bhurt(ar|o)\b/,
      /\bfraude\b/,
      /\bestaf(ar|a)\b/,
      /\bdesvi(ar|o) (el )?(dinero|efectivo|venta|ventas|fondo)\b/,
      /\bquedarme con (el )?(dinero|efectivo|cambio|venta)\b/,
      /\bllevarme (el )?(dinero|efectivo|caja)\b/,
      /\bsacar (dinero|efectivo) (de la caja )?sin que\b/,
      /\b(esconder|ocultar) (el |la |un |una )?(dinero|efectivo|venta|ventas|faltante|faltantes|merma|mercancia)\b/,
    ],
  },
  {
    categoria: 'evasion',
    etiqueta: 'Evadir controles',
    patrones: [
      /\bevad(ir|o|e|ier)\b/,
      /\bburlar\b/,
      /\besquivar\b/,
      /\bbypass\b/,
      /\bpasar por alto\b/,
      /\bsalt(ar|o|e|arme|arse|arnos|amos|as)? ?(me |se |nos |te )?(el |la |los |las )?(pin|candado|control|controles|seguridad|restriccion|restricciones|privilegio|privilegios|auditoria|checador|horario|autorizacion)\b/,
      /\bsin que (se |me |nos )?(enteren|vean|detecten|descubran|sepan|noten|vea|detecte|descubra|note)\b/,
      /\b(enganar|engañar) (al )?(sistema|pos|checador|auditoria)\b/,
      /\bhacer trampa\b/,
    ],
  },
  {
    categoria: 'manipulacion',
    etiqueta: 'Manipular o alterar registros',
    patrones: [
      /\bmanipul(ar|o|e)\b/,
      /\balterar\b/,
      /\bfalsific(ar|o|e)\b/,
      /\badulterar\b/,
      /\b(borrar|eliminar|quitar|limpiar) (la |el |los |las )?(auditoria|bitacora|rastro|huella|huellas|evidencia|evidencias)\b/,
      /\b(cambiar|modificar|adelantar|atrasar) (la |el )?(hora|fecha) (del |de |en el )?(checador|corte|sistema|ticket)\b/,
      /\b(checar|marcar|registrar) (por|a) (otro|otra|un companero|una companera|mi companero|mi companera)\b/,
      /\bmarcar entrada (de|por) (otro|otra|alguien)\b/,
      /\b(modificar|cambiar|editar) (el |un )?(corte|ticket|inventario|saldo|checada) (sin|para que no)\b/,
      /\b(inyeccion|injection) sql\b/,
      /\b(devtools|inspeccionar|localstorage|consola del navegador)\b.*\b(cambiar|editar|modificar|borrar|saltar)\b/,
    ],
  },
  {
    categoria: 'secretos',
    etiqueta: 'Pedir claves o credenciales',
    patrones: [
      /\b(pin|clave|contrasena|password|codigo secreto) (de|del|de la) (admin|administrador|administradora|gerente|supervisor|tesoreria|dueno|jefe|jefa|otro|otra|alguien|companero|companera|andres|amr|marrero|cajero|cajera)\b/,
      /\b(pin|clave|contrasena|password) (maestro|maestra|global|universal)\b/,
      /\b(cual|dame|dime|pasame|pasa|decime|saber|conocer|averiguar|adivinar|descubrir|ver|obtener|sacar|robar) (es )?(el |la |los |las |un |una )?(pin|pines|clave|claves|contrasena|contrasenas|password|passwords)\b(?! (mia|mio|propio|propia))/,
      /\b(api key|apikey|token|service role|credenciales|llave secreta|openai key|clave de supabase|clave supabase)\b/,
    ],
    excepto: [/\b(mi|mis) (pin|clave|contrasena)\b/, /\bolvide\b/],
  },
  {
    categoria: 'escalada',
    etiqueta: 'Acceso o privilegios que no corresponden',
    patrones: [
      /\b(darme|darle|ponerme|asignarme|otorgarme|subirme|doy|dar|pongo|poner|asigno|asignar|otorgo|subo|subir)( me| le)? (los |mas |mis )?(permiso|permisos|privilegio|privilegios|acceso|rol de admin|rol de administrador|permisos de admin)( de admin| de administrador)?\b/,
      /\bhacerme (admin|administrador|gerente|supervisor)\b/,
      /\b(cambiar|subir|modificar) (mi |el )?(rol|privilegios|permisos)\b/,
      /\b(abrir|entrar|acceder|ingresar|ver) (a |al |a la )?(modulos?|pantallas?|secciones?|paneles?|configuracion|usuarios|nomina|contabilidad|auditoria|rh) (de |del )?(admin|administrador|que no (tengo|me)|sin permiso|sin privilegio|bloqueado|oculto|restringido|prohibido)\b/,
      /\b(modulo|modulos|pantalla|seccion|pantallas|secciones) (que no tengo|bloqueado|bloqueados|oculto|ocultos|restringido|restringidos|sin permiso)\b/,
      /\b(desbloquear|habilitar|activar|destapar) (el |los |un )?(modulo|modulos|menu|menus|pantalla|configuracion|auditoria|nomina)\b/,
      /\b(entrar|entro|abrir|abro|acceder|accedo|ingresar|ingreso|hacer|hago|usar|uso)\b[^.]{0,40}\bsin (tener )?(permiso|permisos|privilegio|privilegios|autorizacion)\b/,
      /\bquitar (la |las )?(restriccion|restricciones|limite|limites|candado|candados|bloqueo|bloqueos)\b/,
    ],
  },
  {
    categoria: 'inyeccion',
    etiqueta: 'Intento de cambiar las reglas del asistente',
    patrones: [
      /\b(ignora|ignorar|olvida|olvidar|omite|omitir|desactiva|desactivar|salta|saltate) (todas |todo |tus |las |tu |lo anterior|las instrucciones)/,
      /\b(instrucciones|reglas) (anteriores|previas|del sistema)\b/,
      /\b(system prompt|prompt del sistema|prompt)\b/,
      /\b(modo|mode) (desarrollador|developer|dios|admin|root|sin restricciones|libre)\b/,
      /\b(jailbreak|dan mode|sin filtros|sin restricciones)\b/,
      /\bactua como\b/,
      /\bfinge (que )?(eres|ser)\b/,
      /\bhazte pasar por\b/,
    ],
  },
];

export const RESPUESTA_BLOQUEO =
  'Eso no te lo puedo ayudar a hacer: va contra las reglas de seguridad del POS. Si necesitas algo que tu usuario no puede hacer, pídeselo a un administrador y él lo autoriza. Esta pregunta quedó registrada en la auditoría.';

/**
 * @param {string} texto
 * @returns {{ bloqueada: boolean, categoria: string|null, etiqueta: string|null }}
 */
export function evaluarPregunta(texto) {
  const t = normalizarSeguridad(texto);
  if (!t) return { bloqueada: false, categoria: null, etiqueta: null };
  for (const regla of REGLAS) {
    if (regla.excepto?.some((r) => r.test(t))) continue;
    if (regla.patrones.some((r) => r.test(t))) {
      return { bloqueada: true, categoria: regla.categoria, etiqueta: regla.etiqueta };
    }
  }
  return { bloqueada: false, categoria: null, etiqueta: null };
}

const SALIDA_PROHIBIDA = [
  /\b(pin|clave|contrasena|password)\b[^.\n]{0,25}\b\d{3,}\b/,
  /\bsk-[a-z0-9_-]{10,}/i,
  /\b(eyJ[a-zA-Z0-9_-]{20,})/,
  /\b(service[_ ]role|api[_ ]?key|openai)\b/,
  /\b(evadir|burlar|saltarse|saltarte|esquivar|falsificar|manipular|robar|hackear)\b/,
];

/** Revisa lo que contestó la IA antes de mostrarlo. */
export function salidaSegura(texto) {
  const t = normalizarSeguridad(texto);
  const crudo = String(texto || '');
  if (!t) return false;
  return !SALIDA_PROHIBIDA.some((r) => r.test(t) || r.test(crudo));
}
