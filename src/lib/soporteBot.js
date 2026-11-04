/**
 * Respuestas del asistente en el chat de soporte.
 * Cubre las dudas de operación del POS y tolera faltas de ortografía
 * ("preimventario", "pre inventario", "inpresora"). Cada guía suma puntos por las palabras
 * que reconoce y gana la que más puntos tenga. Si no reconoce nada, nunca responde
 * "no sé": confirma que quedó registrada y ofrece los temas que sí domina.
 */

export function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bpre[\s\-_.]+(?=[a-z])/g, 'pre')
    .replace(/\bcubre[\s\-_.]*turno\b/g, 'cubre turno');
}

function tokens(texto) {
  return normalizar(texto).split(/[^a-z0-9]+/).filter(Boolean);
}

function distancia(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Palabras cortas (≤4) deben coincidir exacto; las largas toleran 1 o 2 letras mal escritas. */
function palabraCoincide(token, clave) {
  if (token === clave) return true;
  if (clave.length <= 4 || token.length <= 4) return false;
  const tolerancia = clave.length >= 9 ? 2 : 1;
  return distancia(token, clave) <= tolerancia;
}

function claveCoincide(texto, toks, clave) {
  const k = normalizar(clave);
  if (k.includes(' ')) return texto.includes(k);
  return toks.some((t) => palabraCoincide(t, k));
}

const GUIAS = [
  {
    id: 'preinventario',
    tema: 'preinventario',
    claves: [
      ['preinventario', 5], ['preinventarios', 5], ['conteo previo', 4], ['plantilla', 3], ['conteo', 2], ['contar', 2],
    ],
    texto: 'Preinventario: Productos → menú ⋮ → Preinventario. Pulsa «Nueva plantilla» (personal o por departamento), elige los productos y «Guardar plantilla»; o abre una que ya tengas con «Contar». Escanea o escribe el código para sumar +1 por producto, o captura la cantidad. Al terminar pulsa «Cerrar e imprimir». Es un conteo de control: no modifica el inventario del sistema.',
  },
  {
    id: 'traspaso',
    tema: 'traspasos',
    claves: [['traspaso', 5], ['traspasos', 5], ['pasar mercancia', 3], ['mandar mercancia', 3], ['enviar mercancia', 3], ['mover mercancia', 3]],
    texto: 'Traspasos: Productos → menú ⋮ → Traspasos. Tiene tres opciones: Enviar productos (eliges la tienda destino, añades los productos y confirmas), Recibir productos (abres el envío pendiente y confirmas la recepción para que entre al piso de tu tienda) y Solicitar (pides mercancía a otra tienda).',
  },
  {
    id: 'equipo',
    tema: 'impresora o báscula',
    claves: [['impresora', 4], ['imprime', 3], ['imprimir', 3], ['impresion', 3], ['ticket', 1], ['bascula', 4], ['papel', 3], ['atora', 3], ['atorado', 3]],
    texto: 'Si no imprime: revisa que tenga papel, que esté encendida y reiníciala. En la báscula, apágala y vuelve a encenderla. Si sigue igual, un administrador da seguimiento en esta solicitud.',
  },
  {
    id: 'pin',
    tema: 'PIN y acceso',
    claves: [['pin', 4], ['no puedo entrar', 4], ['no entra', 4], ['contrasena', 3], ['clave', 2]],
    texto: 'El PIN es el de tu usuario en esta sucursal. Si el PIN es de otra tienda, el POS lo dice. En cubre turno se usa el PIN de cubre y se capturan nombre y teléfono. Si aún no entra, un administrador lo revisa en Usuarios.',
  },
  {
    id: 'turno',
    tema: 'fuera de horario',
    claves: [['fuera de horario', 5], ['extension', 4], ['mas tiempo', 4], ['turno', 1]],
    texto: 'Fuera de horario la caja pide autorización. En la pantalla de entrada puedes solicitar más tiempo y un administrador aprueba la extensión.',
  },
  {
    id: 'checador',
    tema: 'checador (entrada y salida)',
    claves: [['checador', 4], ['checar', 4], ['reloj', 4], ['entrada', 3], ['salida', 3], ['asistencia', 4]],
    texto: 'Checador → Reloj empleados → PIN de la tienda → Entrada o Salida. Si estás fuera de horario, pide el PIN de un administrador.',
  },
  {
    id: 'cubre',
    tema: 'cubre turno',
    claves: [['cubre', 4], ['cubre turno', 5], ['ct', 4]],
    texto: 'En el plan horario, el día de descanso usa Pedir CT y elige un cubre en verde. Cuando acepta, sale un PIN temporal solo para esa tienda y ese día. El PIN móvil lo genera un administrador en RH ABA3B.',
  },
  {
    id: 'cobrar',
    tema: 'ventas y cobro',
    claves: [
      ['cobrar', 4], ['cobro', 4], ['tarjeta', 4], ['dolar', 4], ['dolares', 4], ['terminal', 3], ['cambio', 3],
      ['como vendo', 5], ['registrar venta', 5], ['vender', 3], ['venta', 2], ['ventas', 2],
    ],
    texto: 'Ventas → arma el ticket → Cobrar. Efectivo: MXN o USD (el dólar del día sale arriba). Tarjeta: cobra primero en la terminal y anota los últimos 4 o 5 dígitos → Finalizar venta.',
  },
  {
    id: 'ingreso',
    tema: 'ingreso o ajuste de inventario',
    claves: [['ingreso', 4], ['ingresar', 4], ['compra', 3], ['compras', 3], ['mercancia', 3], ['inventario', 3], ['stock', 3], ['ajuste', 4], ['ajustar', 4]],
    texto: 'Productos → menú ⋮ → Ajuste de inventario → Ingreso de inventario. Escanea, anota la cantidad del ticket y valida el producto físico. Al final pulsa Aplicar para sumar al stock.',
  },
  {
    id: 'corte',
    tema: 'corte de caja',
    claves: [['corte', 4], ['cortes', 4], ['cuadre', 4], ['no cuadra', 5], ['cerrar caja', 4]],
    texto: 'El corte del turno está en Corte de caja, con el usuario que tiene la caja. Si no cuadra, escribe aquí el monto y un administrador lo revisa.',
  },
  {
    id: 'mensajes',
    tema: 'mensajes',
    claves: [['chat', 4], ['mensajes', 4], ['mensaje', 4]],
    texto: 'Mensajes está en el menú: chat de tu sucursal, grupo de la cadena y este soporte. Cada mensaje lleva tu nombre y tu turno. Los chats de todas las tiendas solo los abre el administrador principal.',
  },
  {
    id: 'red',
    tema: 'internet',
    claves: [['internet', 4], ['wifi', 4], ['red', 3], ['offline', 4], ['nube', 3], ['no carga', 4], ['sin conexion', 4]],
    texto: 'Si la caja no sube a la nube, revisa el internet del módem. Ventas puede seguir en modo offline y se sincroniza cuando vuelve la red. Si sigue sin conexión, déjalo anotado en esta solicitud.',
  },
];

function puntuar(texto) {
  const t = normalizar(texto);
  const toks = tokens(texto);
  return GUIAS.map((g, orden) => ({
    guia: g,
    orden,
    puntos: g.claves.reduce((a, [clave, peso]) => a + (claveCoincide(t, toks, clave) ? peso : 0), 0),
  }))
    .filter((r) => r.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.orden - b.orden);
}

const TEMAS = GUIAS.map((g) => g.tema);

export function responderDuda(texto) {
  const ranking = puntuar(texto);
  if (!ranking.length) {
    return {
      conocida: false,
      texto: `Recibí tu duda y quedó registrada como solicitud abierta; un administrador te responde en este chat. Mientras tanto puedo orientarte al instante sobre: ${TEMAS.join(', ')}. Escribe una de esas palabras (por ejemplo «preinventario» o «corte») y te doy los pasos.`,
    };
  }
  const { guia } = ranking[0];
  return {
    conocida: true,
    guia: guia.id,
    texto: `${guia.texto} Quedó como solicitud abierta. Un administrador confirma y la marca resuelta.`,
  };
}
