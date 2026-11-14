/**
 * Respuestas del asistente en el chat de soporte.
 * Cubre las dudas de operación del POS y tolera faltas de ortografía
 * ("preimventario", "pre inventario", "inpresora"). Cada guía suma puntos por las palabras
 * que reconoce y gana la que más puntos tenga. Si no reconoce nada, nunca responde
 * "no sé": confirma que quedó registrada y ofrece los temas que sí domina.
 */
import { RESPUESTA_BLOQUEO, evaluarPregunta } from './soporteSeguridad.js';
import { GUIAS_MODULOS } from './soporteGuiasAdmin.js';

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

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'a', 'al', 'en', 'mi', 'mis', 'que', 'para', 'con', 'por', 'y', 'o', 'se', 'lo', 'le']);

/** Frase: aparece tal cual, o están todas sus palabras (sin artículos) aunque en otro orden. */
function claveCoincide(texto, toks, clave) {
  const k = normalizar(clave);
  if (!k.includes(' ')) return toks.some((t) => palabraCoincide(t, k));
  if (texto.includes(k)) return true;
  const palabras = k.split(' ').filter((w) => !PALABRAS_VACIAS.has(w));
  return palabras.length >= 2 && palabras.every((w) => toks.some((t) => palabraCoincide(t, w)));
}

const GUIAS = [
  {
    id: 'olvide_marcar',
    tema: 'olvidé marcar entrada o salida',
    claves: [
      ['olvide marcar', 8], ['olvide mi salida', 8], ['olvide mi entrada', 8], ['no marque', 8], ['no marcaron', 6],
      ['falta mi salida', 8], ['falta mi entrada', 8], ['no aparece mi salida', 8], ['no aparece mi entrada', 8],
      ['me falta salida', 7], ['sin salida', 6], ['sin entrada', 6], ['no registro mi salida', 8], ['no registro mi entrada', 8],
    ],
    texto: 'Si olvidaste marcar la entrada o la salida, avisa a un administrador: solo él puede usar «Registrar marcaje manual» en Checador → Historial entradas/salidas. Ahí puede buscarte con tu PIN aunque seas de otra tienda, y puede registrar o corregir más de una entrada y una salida el mismo día. El empleado en el reloj sigue limitado a una entrada y una salida por día. Mientras no se corrija, ese día no cuenta como trabajado, porque cada día necesita Entrada y Salida (la salida debe quedar máximo 18 horas después de la entrada). Para ver qué checadas tienes ve a Checador → Resumen días → «Ver checadas».',
  },
  {
    id: 'resumen_dias',
    tema: 'resumen de días y faltas',
    claves: [
      ['resumen de dias', 7], ['resumen dias', 7], ['dias trabajados', 6], ['aparece como falta', 8], ['me marca falta', 8],
      ['me pone falta', 8], ['faltas', 4], ['falta', 3], ['descansos', 3],
    ],
    texto: 'Checador → Resumen días muestra un calendario por persona. Un día cuenta cuando hay Entrada y Salida; en turno nocturno cuenta el día en que empezó. Pasa el mouse sobre un día en rojo para ver el motivo y abre «Ver checadas» para ver cada marca y si quedó sin pareja. Los descansos del plan horario no son falta. Si falta una salida, un administrador la corrige con «Registrar marcaje manual».',
  },
  {
    id: 'checador',
    tema: 'checador: marcar entrada y salida',
    claves: [
      ['checador', 4], ['checar', 4], ['checada', 4], ['reloj', 4], ['marcar entrada', 6], ['marcar salida', 6], ['entrada', 3], ['salida', 3],
      ['asistencia', 4], ['checador de precios', 6], ['marcar', 2],
    ],
    texto: 'Checador → Reloj empleados → escribe el PIN de esta tienda → Continuar → Entrada o Salida (debe decir «Entrada registrada.» o «Salida registrada.»). Fuera de horario pide el PIN de un administrador o gerente → Autorizar. Si eres cubre turno usa tu PIN de cubre y captura nombre y teléfono. En la misma pantalla están Checador de precios (escanea para ver precio y existencias), Resumen días e Historial entradas/salidas.',
  },
  {
    id: 'cubre',
    tema: 'cubre turno y plan horario',
    claves: [
      ['cubre', 4], ['cubre turno', 6], ['ct', 4], ['pedir ct', 6], ['solicitar ct', 6], ['plan horario', 5], ['descanso', 3], ['dia de descanso', 5], ['cambio de turno', 5], ['cubrir turno', 6], ['quien me cubre', 6],
    ],
    texto: 'Plan horario (en Checador, si tu usuario lo tiene) → en el día de descanso pulsa «Solicitar este CT» y elige un cubre en verde. Cuando el cubre acepta, le sale un PIN temporal solo para esa tienda y ese día. En el reloj, el cubre entra con su PIN de cubre y captura nombre y teléfono. El PIN móvil del cubre lo genera un administrador en RH ABA3B.',
  },
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
    id: 'ingreso',
    tema: 'ingreso, retiro y ajuste de inventario',
    claves: [
      ['ingreso', 4], ['ingresar', 4], ['ajuste', 4], ['ajustar', 4], ['entrada de mercancia', 6], ['meter mercancia', 4], ['retiro', 4], ['merma', 4],
      ['stock', 3], ['existencias', 3], ['existencia', 3], ['inventario', 3], ['contar departamento', 5], ['mercancia', 1],
    ],
    texto: 'Productos → menú ⋮ → Ajuste de inventario. Para sumar mercancía usa «Ingreso de inventario»: escanea o captura las piezas, confirma la cantidad del ticket, valida el producto físico y pulsa «Aplicar +N pieza(s)» (genera un folio). «Retiro de inventario» resta piezas. Para contar por «Por departamento» o «Por categoría» marca y pulsa SIGUIENTE hasta aplicar el ajuste.',
  },
  {
    id: 'productos',
    tema: 'buscar productos, precios y existencias',
    claves: [
      ['producto', 3], ['productos', 3], ['catalogo', 4], ['precio', 3], ['precios', 3], ['codigo', 2], ['favoritos', 2], ['alta de producto', 5], ['nuevo producto', 5],
      ['editar producto', 5], ['cambiar precio', 5], ['ver inventario', 5], ['veo el inventario', 6], ['veo inventario', 6], ['cuanto hay', 4], ['hay en existencia', 5],
    ],
    texto: 'Productos: escribe o escanea en «Buscar o escanear con cámara…» y elige el producto para ver precio y existencias; «Filtros» ayuda a filtrar. El cajero solo consulta el catálogo: no da de alta ni cambia precios (eso lo hace un administrador). Con el menú ⋮ puedes usar Ajuste de inventario, Traspasos y Preinventario si tu usuario lo tiene.',
  },
  {
    id: 'cancelar_venta',
    tema: 'cancelar un ticket o devolución',
    claves: [
      ['cancelar ticket', 7], ['cancelar venta', 7], ['cancelar un ticket', 7], ['cancelar una venta', 7], ['borrar venta', 6], ['cancelacion', 4], ['cancelaciones', 4],
      ['cancelar', 3], ['cancelo', 4], ['cancele', 3], ['devolucion', 4], ['devolver', 3], ['anular', 4], ['me equivoque', 3],
    ],
    texto: 'Para cancelar productos de un ticket del día: Corte de caja → pestaña Cancelaciones → elige el «Ticket del día» → indica la cantidad a cancelar por producto → «Registrar cancelación». Se devuelve al inventario y se resta del corte. Si solo quieres salir del cobro antes de finalizar, pulsa Cancelar o Salir del cobro en la ventana de Cobrar venta.',
  },
  {
    id: 'cobrar',
    tema: 'ventas y cobro',
    claves: [
      ['cobrar', 4], ['cobro', 3], ['tarjeta', 4], ['baucher', 4], ['voucher', 4], ['dolar', 4], ['dolares', 4], ['terminal', 3], ['cambio', 2], ['como vendo', 5],
      ['registrar venta', 5], ['vender', 3], ['venta', 2], ['ventas', 2], ['finalizar', 3], ['carrito', 3], ['reimprimir', 4], ['imprimir ticket', 4], ['transferencia', 3], ['en la venta', 4], ['agregar al ticket', 5], ['escanear producto', 4],
    ],
    texto: 'Ventas → busca o escanea el producto en «Escanear · buscar» (o toca Favoritos, Todos o un departamento; para varias piezas escribe 5* y el código) → revisa el Ticket → Cobrar. Elige la Forma de pago: efectivo en Pesos (MXN) o Dólares (USD) con «Monto exacto» o el billete; tarjeta u otros piden los últimos 4 o 5 dígitos del baucher (obligatorio). Pulsa «Finalizar venta» → «Imprimir ticket». «Reimprimir último ticket» saca otra vez el último de la sesión.',
  },
  {
    id: 'escaner',
    tema: 'escáner caja (celular)',
    claves: [['escaner caja', 6], ['escaner movil', 6], ['escaner', 3], ['celular', 2], ['camara', 2], ['codigo de barras', 2]],
    texto: 'Escáner caja: en el menú abre «Escáner caja» desde el celular con el mismo PIN y deja abierta Ventas en la computadora. En el celular apunta al código de barras y pulsa «Enviar al carrito»; en Ventas aparece el aviso verde «Escáner móvil: + …». «Salir del escáner» regresa a Ventas.',
  },
  {
    id: 'cortes_conta',
    tema: 'Corte Virtual, Abarrotes o Garage (gastos y recolección)',
    claves: [
      ['corte virtual', 7], ['corte abarrotes', 7], ['corte garage', 7], ['virtual', 3], ['abarrotes', 3], ['garage', 3], ['caja chica', 5], ['recolectar', 4],
      ['recoleccion', 4], ['folio', 2], ['gasto', 3], ['gastos', 3], ['cerrar corte', 5], ['lectura de maquinas', 5], ['maquinas', 3], ['imprimir corte', 3],
    ],
    texto: 'Corte Virtual, Corte Abarrotes y Corte Garage son independientes del Corte de caja: ábrelo desde el menú, revisa turno y folio (en Abarrotes captura el Folio), registra cada gasto en «Gastos del turno» con Agregar, y al terminar pulsa «Cerrar corte» y «Imprimir corte». La recolección de efectivo (botón Recolectar; en Garage «Generar recolección») solo la hace un administrador o recolector. En Garage captura primero la Lectura máquinas.',
  },
  {
    id: 'corte',
    tema: 'corte de caja',
    claves: [
      ['corte de caja', 6], ['corte', 3], ['cortes', 3], ['cuadre', 4], ['no cuadra', 5], ['arqueo', 5], ['cerrar caja', 5], ['cierre de caja', 5],
      ['efectivo contado', 5], ['corroboracion', 4], ['corregir corte', 6], ['cerrar turno', 3], ['cerrar el corte', 5],
    ],
    texto: 'Corte de caja (no es el Corte Virtual/Abarrotes/Garage): elige Turno y Fecha → «Actualizar día» → en la pestaña Corte cuenta el efectivo y captura «Efectivo contado en caja (MXN)» en el Arqueo. Si hubo Tarjeta, Transferencia o QR, llena la Corroboración otros rubros. Pulsa «Guardar corte»; si ya existe, «Corregir corte actual» → «Guardar corrección». Luego «Imprimir corte». Solo cierras tu turno; si falta o sobra, anótalo y avisa, no ajustes el contado.',
  },
  {
    id: 'cobranza',
    tema: 'cobranza de créditos de ruta',
    claves: [
      ['cobranza', 6], ['credito', 3], ['creditos', 3], ['cobrar credito', 6], ['cobro de credito', 6], ['pagar folios', 5], ['solicitar cobro', 5], ['pin cajero', 4],
      ['repartidor', 2], ['por pagar', 3],
    ],
    texto: 'Cobranza · créditos ruta: abre Cobranza, captura tu PIN cajero → «Abrir con PIN». Abre la tienda (▸), marca los folios a pagar (o «Marcar todos»), opcionalmente captura el Monto y pulsa «Solicitar cobro $…». El vendedor de ruta recibe el aviso y el pago se registra cuando lo aprueba con su PIN; sigue el estado en «Solicitudes de cobro» (Esperando al vendedor, Aprobada y cobrada, Rechazada).',
  },
  {
    id: 'compras',
    tema: 'compras y pedidos',
    claves: [
      ['compras', 4], ['compra', 3], ['pedido', 4], ['pedidos', 4], ['recibir mercancia', 6], ['recepcion', 4], ['por recibir', 5], ['ticket de compra', 5],
      ['orden de compra', 5], ['mayorista', 2], ['pedir mercancia', 6], ['pedir producto', 5], ['surtir', 4],
    ],
    texto: 'Compras → pestaña Herramienta de compra → elige el Proveedor → llena la columna Pedido → «Generar pedido (sin tocar inventario)»: queda en «Por recibir». Cuando llegue la mercancía: Por recibir → Recibir → captura la columna Recepción → «Recibir mercancía» y escribe el total del ticket; suma al inventario y queda en el Historial de compras. Si el proveedor es de entrega directa usa «Registrar entrega e inventario». Una compra a crédito no genera gasto en el corte hasta que se cobra el crédito en Cobranza.',
  },
  {
    id: 'proveedores',
    tema: 'proveedores y días de entrega',
    claves: [['proveedor', 4], ['proveedores', 4], ['dias de entrega', 6], ['que dia viene', 5], ['matriz', 3]],
    texto: 'Proveedores: en «Días de entrega por sucursal» → «Ver matriz» ves qué proveedor llega cada día (Lun a Dom). En «Catálogo de proveedores» puedes editar los datos de un proveedor existente; dar de alta o eliminar proveedores solo lo hace el administrador.',
  },
  {
    id: 'consultas',
    tema: 'consultas (tickets, cortes, movimientos)',
    claves: [
      ['consultas', 5], ['consultar', 4], ['buscar ticket', 5], ['ticket de ayer', 5], ['ventas de ayer', 4], ['movimientos de inventario', 5], ['historial', 2],
      ['saldo de caja', 5], ['corte pasado', 4], ['cortes anteriores', 4], ['ver ventas', 3],
    ],
    texto: 'Consultas: en la barra lateral elige Ventas (Tickets o Venta por artículo), Cajas de cobro (Saldos de caja, Cortes de caja), Compras, Inventarios (movimientos: Ingreso, Retiro, Ajuste de inventario, Traspaso) o Precios. Usa el buscador, las fechas y «Todas las sucursales», y «Actualizar» (↻). Toca una fila para ver el detalle.',
  },
  {
    id: 'reportes',
    tema: 'reportes y descargas',
    claves: [['reporte', 4], ['reportes', 4], ['descargar', 3], ['excel', 3], ['csv', 4], ['exportar', 4], ['imprimir inventario', 5]],
    texto: 'Reportes: aquí descargas «Descargar inventario (CSV)», «Imprimir inventario», las ventas de un rango («Descargar ventas del rango», «Imprimir reporte de ventas»), el Reporte de inventario (con filtro de Periodo) y los Gastos por tienda y empleado («Exportar CSV» o «Imprimir»).',
  },
  {
    id: 'inicio',
    tema: 'pantalla de inicio',
    claves: [['inicio', 3], ['pantalla principal', 5], ['panel de inicio', 5], ['stock bajo', 5], ['alertas stock', 4], ['accesos rapidos', 5], ['ventas del dia', 3]],
    texto: 'Inicio es el panel del día: Ventas hoy, Ticket promedio, Alertas stock, Accesos rápidos a Ventas, Corte de caja, Checador y otros módulos, el listado de Stock bajo (menos de 5 piezas) y las últimas ventas del día.',
  },
  {
    id: 'vales',
    tema: 'vales',
    claves: [['vale', 7], ['vales', 7], ['gasolina', 4], ['imprimir vale', 6], ['consumo', 2], ['herramienta', 2]],
    texto: 'Vales y Préstamos → pestaña Vales → «Nuevo vale»: beneficiario, Corte destino y categoría, y «Registrar vale» (o «Solicitar vale (requiere autorización)»). El cajero solo imprime los vales ya aprobados («Imprimir»); editar o borrar es del administrador. La gasolina solo se genera en tienda y dentro de la ventana de horario; después va a Pendientes del administrador.',
  },
  {
    id: 'pagare',
    tema: 'pagaré',
    claves: [['pagare', 6], ['abonar', 4], ['abono', 4], ['liquidar', 4], ['negativo', 3]],
    texto: 'Pagaré (Vales y Préstamos → Pagaré): documenta un negativo de caja que sigue presente durante una recolección. El cajero solo ve «Abonar» y «Liquidar»; el pagaré no cierra la deuda, solo deja constancia para su seguimiento.',
  },
  {
    id: 'prestamos',
    tema: 'préstamos y RIF',
    claves: [['prestamo', 5], ['prestamos', 5], ['rif', 5], ['fondos', 3], ['requisicion', 4]],
    texto: 'Vales y Préstamos tiene las pestañas «RIF · fondos» (requisición de dinero entre tiendas o en la misma tienda; con Abonar, Liquidar e Imprimir firma), «Préstamos área / sucursal» y «Préstamos empleados». Abonar o liquidar lo puede hacer el cajero; aprobar es del administrador (los montos mayores a $1,000 piden PIN).',
  },
  {
    id: 'checklist',
    tema: 'check list del turno',
    claves: [['check list', 6], ['checklist', 6], ['lista de verificacion', 4], ['fa3b', 3]],
    texto: 'Check List operativo: pestaña «Llenar turno» → elige Fecha y Turno → marca cada punto con ✔ Cumple, ✘ No cumple o R Reportar (se guarda solo; si es ✘ o R agrega comentario). Al terminar pulsa «Cerrar checklist (X/Y)». En «Historial» abres los anteriores.',
  },
  {
    id: 'incidencias',
    tema: 'incidencias',
    claves: [['incidencia', 5], ['incidencias', 5], ['reportar', 3], ['falla', 3], ['reporte de incidencia', 6], ['avisar al administrador', 3]],
    texto: 'Incidencias: llena el «Reporte de incidencia» (Área, Título, Descripción, Responsable, Categoría, Subcategoría y Prioridad) y pulsa «Enviar reporte». Si ya existe uno abierto igual, espera a que se resuelva o cierre. Los estados son Abierta, En revisión, Resuelta y Cerrada.',
  },
  {
    id: 'mensajes',
    tema: 'mensajes y soporte',
    claves: [['chat', 4], ['mensajes', 4], ['mensaje', 4], ['soporte', 3], ['grupo 3b', 4]],
    texto: 'Mensajes está en el menú: chat de tu sucursal, Grupo 3B y Soporte. Cada mensaje lleva tu nombre y tu turno. En Soporte, tu primer mensaje abre una solicitud; el asistente responde y un administrador la marca resuelta.',
  },
  {
    id: 'tutorial',
    tema: 'tutoriales y ayuda',
    claves: [['tutorial', 5], ['tutoriales', 5], ['capacitacion', 4], ['manual', 3], ['centro de ayuda', 5], ['ayuda', 1]],
    texto: 'En el menú Tutorial hay guías con imágenes: cómo cobrar en el POS, cómo cerrar el corte de caja, Corte Abarrotes, Vales y Préstamos, ingresar compras, reloj checador, cubre turnos y más. En Ayuda → Centro de ayuda están las guías rápidas y la sección de turnos diurno y nocturno.',
  },
  {
    id: 'login',
    tema: 'PIN, tienda y turno de entrada',
    claves: [
      ['pin', 3], ['no puedo entrar', 5], ['no me deja entrar', 6], ['no entra', 4], ['pin incorrecto', 6], ['contrasena', 3], ['clave', 2], ['fijar tienda', 6],
      ['tienda fijada', 5], ['segundo dispositivo', 6], ['otro equipo', 3], ['fuera de horario', 5], ['mas tiempo', 4], ['extension', 3], ['solicitar mas tiempo', 6], ['turno', 1],
    ],
    texto: 'Entra con tu PIN y pulsa «Entrar con PIN»; el PIN debe ser el de tu usuario en esta tienda. Si la caja no tiene tienda, elige «Fijar tienda en este equipo» (solo un administrador la desbloquea). Si dice «Fuera de horario de turno», pulsa «Solicitar más tiempo» y espera la aprobación del administrador. Un segundo equipo se autoriza con «Segundo dispositivo» + PIN del administrador. Cubre turno: entra con el PIN de cubre → «Entrar a cubrir turno».',
  },
  {
    id: 'equipo',
    tema: 'impresora o báscula',
    claves: [['impresora', 4], ['imprime', 3], ['imprimir', 2], ['impresion', 3], ['bascula', 4], ['papel', 3], ['atora', 3], ['atorado', 3]],
    texto: 'Si no imprime: revisa que tenga papel, que esté encendida y reiníciala. En la báscula, apágala y vuelve a encenderla. Si sigue igual, un administrador da seguimiento en esta solicitud.',
  },
  {
    id: 'red',
    tema: 'internet y modo offline',
    claves: [['internet', 4], ['wifi', 4], ['red', 3], ['offline', 4], ['nube', 3], ['no carga', 4], ['sin conexion', 4], ['sin internet', 5]],
    texto: 'Si no hay internet, la caja pasa a MODO OFFLINE y solo puedes usar Ventas; se sincroniza cuando vuelve la red. Revisa el módem y el cable o Wi‑Fi, y si sigue sin conexión déjalo anotado en esta solicitud.',
  },
];

GUIAS.push(...GUIAS_MODULOS);

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

const TEMAS_MENU = [
  'ventas y cobro', 'cancelar un ticket', 'corte de caja', 'cortes Virtual/Abarrotes/Garage', 'productos e inventario', 'preinventario', 'traspasos',
  'compras', 'proveedores', 'consultas', 'reportes', 'vales y préstamos', 'pagaré', 'cobranza', 'checador', 'check list', 'incidencias', 'mensajes', 'tutoriales',
];

/** Módulo del POS que necesita cada guía; si el usuario no lo tiene, no se le explica. */
const MODULO_POR_GUIA = {
  olvide_marcar: ['Checador'],
  resumen_dias: ['Checador'],
  checador: ['Checador'],
  cubre: ['Checador'],
  preinventario: ['Productos'],
  traspaso: ['Productos'],
  ingreso: ['Productos'],
  productos: ['Productos'],
  cancelar_venta: ['Corte de caja'],
  cobrar: ['Ventas'],
  escaner: ['Escáner caja'],
  cortes_conta: ['Corte Virtual', 'Corte Abarrotes', 'Corte Garage'],
  corte: ['Corte de caja'],
  cobranza: ['Cobranza'],
  compras: ['Compras'],
  proveedores: ['Proveedores'],
  consultas: ['Consultas'],
  reportes: ['Reportes'],
  inicio: ['Inicio'],
  vales: ['Vales y Préstamos'],
  pagare: ['Vales y Préstamos'],
  prestamos: ['Vales y Préstamos'],
  checklist: ['Check List'],
  incidencias: ['Incidencias'],
  mensajes: ['Mensajes'],
  tutorial: ['Tutorial'],
};

for (const g of GUIAS_MODULOS) MODULO_POR_GUIA[g.id] = g.modulos;

export function modulosDeGuia(id) {
  return MODULO_POR_GUIA[id] || [];
}

export const CIERRE_SOLICITUD = ' Quedó como solicitud abierta. Un administrador confirma y la marca resuelta.';

/**
 * @param {string} texto
 * @param {{ puedeVerModulo?: (modulo: string) => boolean }} [opciones]
 *   puedeVerModulo: privilegios reales del usuario. Sin él no se filtra por módulo.
 */
const TEMAS_OFICINA = ['usuarios y bajas', 'nómina', 'tesorería', 'conciliaciones', 'configuración y privilegios', 'estadísticas', 'venta en ruta', 'recolecciones', 'IE Virtual y Abarrotes'];

function menuTemas(puedeVerModulo) {
  const oficina = typeof puedeVerModulo !== 'function' || ['Usuarios', 'Nómina', 'Configuracion', 'Venta en Ruta'].some((m) => puedeVerModulo(m));
  return (oficina ? [...TEMAS_MENU, ...TEMAS_OFICINA] : TEMAS_MENU).join(', ');
}

export function responderDuda(texto, { puedeVerModulo } = {}) {
  const seguridad = evaluarPregunta(texto);
  if (seguridad.bloqueada) {
    return {
      conocida: false,
      bloqueada: true,
      categoria: seguridad.categoria,
      etiqueta: seguridad.etiqueta,
      texto: RESPUESTA_BLOQUEO,
    };
  }

  const ranking = puntuar(texto);
  if (!ranking.length) {
    return {
      conocida: false,
      puntos: 0,
      texto: `Recibí tu duda y quedó registrada como solicitud abierta; un administrador te responde en este chat. Mientras tanto puedo orientarte al instante sobre: ${menuTemas(puedeVerModulo)}. Escribe una de esas palabras (por ejemplo «preinventario» o «corte») y te doy los pasos.`,
    };
  }

  const permitido = (g) => {
    const mods = MODULO_POR_GUIA[g.id];
    if (!mods?.length || typeof puedeVerModulo !== 'function') return true;
    return mods.some((m) => puedeVerModulo(m));
  };

  const mejorPermitida = ranking.find((r) => permitido(r.guia));
  const mejorBloqueada = ranking.find((r) => !permitido(r.guia));
  if (mejorBloqueada && mejorBloqueada.puntos >= 5 && (!mejorPermitida || mejorBloqueada.puntos > mejorPermitida.puntos * 1.3)) {
    const modulo = MODULO_POR_GUIA[mejorBloqueada.guia.id].join(' / ');
    return {
      conocida: true,
      sinPermiso: true,
      guia: mejorBloqueada.guia.id,
      puntos: mejorBloqueada.puntos,
      texto: `Tu usuario no tiene el módulo «${modulo}», así que no te puedo dar esos pasos. Si lo necesitas para tu trabajo, un administrador lo activa en Configuración → Privilegios.${CIERRE_SOLICITUD}`,
    };
  }
  if (!mejorPermitida) {
    return {
      conocida: false,
      puntos: 0,
      texto: `Recibí tu duda y quedó registrada como solicitud abierta; un administrador te responde en este chat. Mientras tanto puedo orientarte al instante sobre: ${menuTemas(puedeVerModulo)}.`,
    };
  }
  const { guia, puntos } = mejorPermitida;
  const segunda = ranking.find((r) => r !== mejorPermitida && permitido(r.guia));
  const parecida = segunda && segunda.puntos >= 3 && segunda.puntos >= puntos * 0.7;
  const extra = parecida ? ` Si buscabas «${segunda.guia.tema}», escríbelo y te doy esos pasos.` : '';
  return {
    conocida: true,
    guia: guia.id,
    puntos,
    texto: `${guia.texto}${extra}${CIERRE_SOLICITUD}`,
  };
}
