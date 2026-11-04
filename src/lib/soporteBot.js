/**
 * Respuestas del asistente en el chat de soporte.
 * Cubre las dudas de operación del POS. Si no reconoce la pregunta,
 * la solicitud sigue abierta para un administrador.
 */

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function tieneFrase(texto, frase) {
  return normalizar(texto).includes(normalizar(frase));
}

function tienePalabra(texto, palabra) {
  const n = normalizar(palabra).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${n}([^a-z0-9]|$)`).test(normalizar(texto));
}

const GUIAS = [
  {
    id: 'equipo',
    prueba: (t) => ['impresora', 'imprime', 'imprimir', 'bascula', 'papel', 'atora'].some((k) => tieneFrase(t, k)),
    texto: 'Si no imprime: revisa que tenga papel, que esté encendida y reiníciala. En la báscula, apágala y vuelve a encenderla. Si sigue igual, un administrador da seguimiento en esta solicitud.',
  },
  {
    id: 'pin',
    prueba: (t) => tienePalabra(t, 'pin') || tieneFrase(t, 'no puedo entrar') || tieneFrase(t, 'no entra'),
    texto: 'El PIN es el de tu usuario en esta sucursal. Si el PIN es de otra tienda, el POS lo dice. En cubre turno se usa el PIN de cubre y se capturan nombre y teléfono. Si aún no entra, un administrador lo revisa en Usuarios.',
  },
  {
    id: 'turno',
    prueba: (t) => tieneFrase(t, 'fuera de horario') || tieneFrase(t, 'extension') || tieneFrase(t, 'más tiempo') || tieneFrase(t, 'mas tiempo') || tienePalabra(t, 'turno'),
    texto: 'Fuera de horario la caja pide autorización. En la pantalla de entrada puedes solicitar más tiempo y un administrador aprueba la extensión.',
  },
  {
    id: 'checador',
    prueba: (t) => ['checador', 'reloj', 'entrada', 'salida', 'asistencia'].some((k) => tienePalabra(t, k)),
    texto: 'Checador → Reloj empleados → PIN de la tienda → Entrada o Salida. Si estás fuera de horario, pide el PIN de un administrador.',
  },
  {
    id: 'cubre',
    prueba: (t) => tieneFrase(t, 'cubre') || tienePalabra(t, 'ct'),
    texto: 'En el plan horario, el día de descanso usa Pedir CT y elige un cubre en verde. Cuando acepta, sale un PIN temporal solo para esa tienda y ese día. El PIN móvil lo genera un administrador en RH ABA3B.',
  },
  {
    id: 'cobrar',
    prueba: (t) => ['cobrar', 'cobro', 'tarjeta', 'dolar', 'dolares', 'terminal', 'cambio'].some((k) => tienePalabra(t, k) || tieneFrase(t, k))
      || tieneFrase(t, 'como vendo') || tieneFrase(t, 'registrar venta'),
    texto: 'Ventas → arma el ticket → Cobrar. Efectivo: MXN o USD (el dólar del día sale arriba). Tarjeta: cobra primero en la terminal y anota los últimos 4 o 5 dígitos → Finalizar venta.',
  },
  {
    id: 'ingreso',
    prueba: (t) => ['ingreso', 'compra', 'mercancia', 'inventario', 'stock', 'ajuste'].some((k) => tienePalabra(t, k)),
    texto: 'Productos → menú ⋮ → Ajuste de inventario → Ingreso de inventario. Escanea, anota la cantidad del ticket y valida el producto físico. Al final pulsa Aplicar para sumar al stock.',
  },
  {
    id: 'corte',
    prueba: (t) => tienePalabra(t, 'corte') || tieneFrase(t, 'cuadre') || tieneFrase(t, 'no cuadra'),
    texto: 'El corte del turno está en Corte de caja, con el usuario que tiene la caja. Si no cuadra, escribe aquí el monto y un administrador lo revisa.',
  },
  {
    id: 'mensajes',
    prueba: (t) => tienePalabra(t, 'chat') || tienePalabra(t, 'mensajes') || tieneFrase(t, 'mensaje'),
    texto: 'Mensajes está en el menú: chat de tu sucursal, grupo de la cadena y este soporte. Cada mensaje lleva tu nombre y tu turno. Los chats de todas las tiendas solo los abre el administrador principal.',
  },
  {
    id: 'red',
    prueba: (t) => ['internet', 'wifi', 'red', 'offline', 'nube', 'no carga'].some((k) => tieneFrase(t, k)),
    texto: 'Si la caja no sube a la nube, revisa el internet del módem. Ventas puede seguir en modo offline y se sincroniza cuando vuelve la red. Si sigue sin conexión, déjalo anotado en esta solicitud.',
  },
];

export function responderDuda(texto) {
  const t = String(texto || '');
  const guia = GUIAS.find((g) => g.prueba(t));
  if (!guia) {
    return {
      conocida: false,
      texto: 'No tengo el paso exacto para esa duda. La dejo como solicitud abierta para que un administrador la atienda en este chat.',
    };
  }
  return {
    conocida: true,
    texto: `${guia.texto} Quedó como solicitud abierta. Un administrador confirma y la marca resuelta.`,
  };
}
