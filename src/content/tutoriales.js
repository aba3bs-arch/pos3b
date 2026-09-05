/** Contenido del módulo Tutorial (POS). Imágenes en /public/tutorial-... */

import { TUTORIAL_CORTE_ABARROTES } from './tutorialCorteAbarrotes.js';
import { TUTORIAL_VALES_MAIN } from './tutorialValesMain.js';

export const TUTORIALES = [
  TUTORIAL_CORTE_ABARROTES,
  TUTORIAL_VALES_MAIN,
  {
    id: 'baja-empleado',
    titulo: 'Cómo dar de baja un empleado',
    resumen:
      'Usuarios o RH ABA3B: elige el nombre, motivo y Confirmar baja. El PIN deja de funcionar; sale de nómina y turnos.',
    secciones: [
      {
        id: 'quien',
        titulo: '1. Quién puede dar de baja',
        cuerpo: [
          '**Administrador:** menú **Usuarios** (el camino más directo).',
          '**Gerente o Administrador:** menú **RH ABA3B**.',
          'No uses «eliminar» el usuario: la **baja** conserva historial y permite reingreso.',
        ],
      },
      {
        id: 'usuarios',
        titulo: '2. Desde Usuarios (Administrador)',
        cuerpo: [
          'Abre **Usuarios**. Arriba verás **Cómo dar de baja un empleado**.',
          'Elige el nombre en la lista y pulsa **Dar de baja**.',
          'También puedes buscarlo en **Equipo registrado** y pulsar el botón rojo **Dar de baja** de su fila.',
        ],
      },
      {
        id: 'rh',
        titulo: '3. Desde RH ABA3B (Gerente o Admin)',
        cuerpo: [
          'Abre **RH ABA3B** → pestaña **Activos**.',
          'Elige el nombre arriba o pulsa **Dar de baja** en la fila (o abre **Perfil** y luego **Dar de baja**).',
        ],
      },
      {
        id: 'formulario',
        titulo: '4. Motivo, fecha y reingreso',
        cuerpo: [
          '**Motivo:** renuncia, despido, abandono, fin de contrato, etc.',
          '**Fecha** de baja.',
          'Marca si **puede reingresar** (recontratable). Si no, escribe el motivo: un futuro alta pedirá el **PIN del administrador principal**.',
          'Pulsa **Confirmar baja**.',
        ],
      },
      {
        id: 'efecto',
        titulo: '5. Qué pasa al confirmar',
        cuerpo: [
          'El empleado **ya no entra** al POS con su PIN.',
          'Desaparece de **nómina**, **empleados por turno** y de la lista de Usuarios (salvo que marques *Ver dados de baja*).',
          'El expediente queda en **RH ABA3B → Inactivos / bajas**.',
        ],
      },
      {
        id: 'reingreso',
        titulo: '6. Cómo reactivar / reingresar',
        cuerpo: [
          'En **Usuarios**, marca **Ver dados de baja** y pulsa **Reactivar**.',
          'En **RH ABA3B**, pestaña **Inactivos / bajas** → **Perfil** → **Reingresar alta**.',
          'Si estaba marcado **no recontratable**, hace falta el PIN del administrador principal.',
        ],
        notas: [
          'Frase para capacitar: **Usuarios o RH ABA3B → elegir nombre → Dar de baja → Confirmar baja.**',
        ],
      },
    ],
  },
  {
    id: 'cobrar-pos',
    titulo: 'Cómo cobrar en el POS',
    resumen:
      'Ticket en Ventas → Cobrar → efectivo (pesos o dólares) o tarjeta → Finalizar. Capturas de la pantalla real.',
    secciones: [
      {
        id: 'ticket',
        titulo: '1. Arma el ticket y pulsa Cobrar',
        cuerpo: [
          'En **Ventas**, agrega productos (escaneo o catálogo).',
          'Revisa el ticket a la derecha (líneas y total).',
          'Pulsa el botón verde **Cobrar**.',
        ],
        imagen: '/tutorial-cobrar/01-ticket-cobrar.png',
        imagenAlt: 'Ticket con productos y botón Cobrar',
      },
      {
        id: 'efectivo-mxn',
        titulo: '2. Efectivo en pesos (MXN)',
        cuerpo: [
          'Elige **Efectivo** y moneda **MXN**.',
          'Indica el billete / monto recibido (o usa **Monto exacto**).',
          'Revisa el **cambio** y pulsa **Finalizar venta**.',
        ],
        imagen: '/tutorial-cobrar/02-efectivo-pesos.png',
        imagenAlt: 'Modal de cobro · Efectivo MXN',
      },
      {
        id: 'efectivo-usd',
        titulo: '3. Efectivo en dólares (USD)',
        cuerpo: [
          '**Efectivo** → moneda **USD**.',
          'El POS usa el tipo de cambio del día (arriba: *Dólar*).',
          'Elige el monto en dólares; el sistema calcula el equivalente y el cambio en MXN.',
          'Pulsa **Finalizar venta**.',
        ],
        imagen: '/tutorial-cobrar/03-efectivo-dolares.png',
        imagenAlt: 'Modal de cobro · Efectivo USD',
      },
      {
        id: 'tarjeta',
        titulo: '4. Tarjeta',
        cuerpo: [
          'Cobra primero en la **terminal**.',
          'En el POS elige **Tarjeta**.',
          'En **Referencia / folio** anota los **últimos 4 o 5 dígitos** del ticket de la terminal.',
          'Pulsa **Finalizar venta**.',
        ],
        imagen: '/tutorial-cobrar/04-tarjeta.png',
        imagenAlt: 'Modal de cobro · Tarjeta con últimos dígitos',
        notas: [
          'El aviso en pantalla: *Cobra primero en la terminal y anota aquí los últimos 4 o 5 dígitos del ticket.*',
        ],
      },
      {
        id: 'registrada',
        titulo: '5. Venta registrada',
        cuerpo: [
          'Aparece **Venta registrada** con método, total y cambio.',
          'Pulsa **Cerrar**. El ticket se imprime según la configuración de la tienda.',
        ],
        imagen: '/tutorial-cobrar/05-venta-registrada.png',
        imagenAlt: 'Modal Venta registrada',
      },
      {
        id: 'errores-cobrar',
        titulo: '6. Errores frecuentes',
        cuerpo: [
          '· Cobrar sin revisar el ticket (producto o cantidad incorrecta).',
          '· En tarjeta: olvidar cobrar en la terminal o no anotar los últimos dígitos.',
          '· En dólares: no verificar el tipo de cambio del día.',
        ],
      },
      {
        id: 'frase-cobrar',
        titulo: 'Frase para capacitar',
        cuerpo: [
          '**Ventas → ticket → Cobrar → Efectivo (MXN/USD) o Tarjeta (últimos 4–5 dígitos) → Finalizar.**',
        ],
      },
    ],
  },
  {
    id: 'negativos-pagare',
    titulo: 'Negativos, Pagaré, Abonos y Liquidaciones',
    resumen:
      'Cómo manejar la alerta DINERO EN RECUPERACIÓN: abono, liquidar, pagaré solo en recolección, y qué no puede hacer el cubre turno.',
    secciones: [
      {
        id: 'flujo',
        titulo: '1. El mapa completo',
        cuerpo: [
          'Cuando la caja o una deuda queda en rojo, el flujo correcto es:',
          '1. Aparece la alerta **DINERO EN RECUPERACIÓN** (**Negativo**).',
          '2. Si aún falta dinero → **Abono** (pago parcial) — lo hace el **cajero**.',
          '3. Cuando ya se recuperó todo (**Negativo = $0**) → **Liquidar** — lo hace el **cajero**.',
          '4. **Pagaré** (al final): **únicamente** si el negativo **sigue presente durante una recolección**. Documenta la deuda (2 tickets); no la cierra.',
        ],
        imagen: '/tutorial-negativos/tutorial-01-flujo-negativos.png',
        imagenAlt: 'Flujo Negativo → Abono → Liquidar → Pagaré',
        notas: [
          '**Después de una recolección:** el **cajero** es el **responsable de la recuperación** (abonar / liquidar lo pendiente).',
          'Esto es el *negativo de dinero* (caja / deuda). El inventario negativo en Productos es otro tema (solo Admin).',
        ],
      },
      {
        id: 'negativo',
        titulo: '2. Qué es el “Negativo”',
        cuerpo: [
          'En el corte verás una alerta parpadeante cuando hay un **pagaré** o **préstamo de área** abierto, o la **caja chica** está en negativo.',
          '**Negativo** = lo que aún falta recuperar. **Recuperado** = lo que ya cubrió la venta del corte.',
          'La venta del corte (efectivo) va reduciendo el negativo sola: cada venta suma a Recuperado y baja Negativo.',
        ],
        imagen: '/tutorial-negativos/tutorial-02-alerta-dinero-recuperacion.png',
        imagenAlt: 'Alerta DINERO EN RECUPERACIÓN',
      },
      {
        id: 'roles',
        titulo: '3. Quién hace qué',
        cuerpo: [
          '**Cajero:** Abono y Liquidar.',
          '**Admin / Gerente:** Abono, Liquidar y Pagaré (en recolección).',
          '**Recolector:** Pagaré en recolección (no abona/liquida en el corte).',
          '**Cubre turno (CT):** solo **ve** la alerta. **No** puede Abonar, Liquidar ni Pagaré.',
        ],
        imagen: '/tutorial-negativos/tutorial-04-roles-quien-hace-que.png',
        imagenAlt: 'Tabla de roles',
      },
      {
        id: 'cubre-turno',
        titulo: '4. Cubre turno: no abona ni liquida',
        cuerpo: [
          'El **cubre turno** puede ver la alerta, pero **no** puede pulsar **Abono** ni **Liquidar**.',
          'Eso lo hace el **cajero** cuando **recibe el turno del CT** (entra con su sesión de cajero).',
          'Mensaje típico para CT: *NEGATIVO RECUPERADO — EL CAJERO DEBE LIQUIDAR O ABONAR EN SU SESIÓN*.',
        ],
        imagen: '/tutorial-negativos/tutorial-07-cubre-turno-cajero.png',
        imagenAlt: 'Cubre turno vs cajero',
        notas: [
          '**Después de una recolección, el cajero es el responsable de la recuperación.**',
        ],
      },
      {
        id: 'abono',
        titulo: '5. Abono (pago parcial)',
        cuerpo: [
          'Usa **Abono** cuando todavía hay **Negativo > $0**.',
          '1. Entra como **cajero** (si venía un CT, el cajero retoma el turno).',
          '2. En la alerta pulsa **Abono** y captura el monto.',
          '3. El saldo baja. Si llega a $0, se liquida solo.',
          'También puedes abonar en **Vales y Préstamos → Pagaré** (y otros documentos).',
        ],
        imagen: '/tutorial-negativos/tutorial-05-abono-vs-liquidar.png',
        imagenAlt: 'Abono vs Liquidar',
      },
      {
        id: 'liquidar',
        titulo: '6. Liquidar (cerrar la deuda)',
        cuerpo: [
          'Usa **Liquidar** cuando el **Negativo ya está en $0** pero la alerta sigue visible.',
          'Verás: **NEGATIVO RECUPERADO, FAVOR DE LIQUIDAR Y PAGAR PRÉSTAMO**.',
          'El **cajero** (nunca el CT) pulsa **Liquidar**. La alerta desaparece; no se imprime ticket nuevo.',
        ],
        imagen: '/tutorial-negativos/tutorial-03-negativo-recuperado-liquidar.png',
        imagenAlt: 'Negativo recuperado — Liquidar',
      },
      {
        id: 'pagare',
        titulo: '7. Pagaré (solo en recolección, al final)',
        cuerpo: [
          '**Regla de oro:** el Pagaré se genera **únicamente** cuando el negativo está presente **durante una recolección**.',
          'Va **al final** del flujo: primero recupera (venta / abono / liquidar); si al recolectar **aún** hay negativo, entonces se documenta.',
          'Lo genera **Admin / Gerente / Recolector**. Imprime **2 tickets**.',
          'Generar el pagaré **no liquida** la deuda: solo la documenta.',
          'Después, el **cajero** hace el seguimiento en **Vales y Préstamos → Pagaré** (Abonar / Liquidar).',
        ],
        imagen: '/tutorial-negativos/tutorial-06-pagare-ticket.png',
        imagenAlt: 'Ticket Pagaré ×2',
        notas: [
          '**Después de la recolección, el cajero es el responsable de la recuperación.**',
        ],
      },
      {
        id: 'orden',
        titulo: '8. Orden correcto en tienda',
        cuerpo: [
          '1. Capturar **todos** los gastos del turno (incl. bonos pagados de caja).',
          '2. Atender **DINERO EN RECUPERACIÓN**: Abono / Liquidar (**cajero**).',
          '3. **Cerrar corte**.',
          '4. **Recolectar** — si el negativo sigue presente → **Pagaré**.',
          '5. Después de la recolección → el **cajero** es responsable de la recuperación.',
        ],
      },
      {
        id: 'frase',
        titulo: 'Frase para capacitar',
        cuerpo: [
          'Primero recupera: **Abono** o **Liquidar** (siempre el **cajero**, nunca el cubre turno).',
          'El **Pagaré** va **al final** y **solo** si el negativo está presente **durante la recolección**.',
          'Después de recolectar, el **cajero** es el **responsable de la recuperación**.',
        ],
      },
    ],
  },
  {
    id: 'compras',
    titulo: 'Ingresar compras al sistema (Ingreso de inventario)',
    resumen:
      'Así se ingresa la mercancía del ticket del proveedor: Productos → menú ⋮ → Ajuste de inventario → Ingreso de inventario → escanear y anotar cantidad (validando el producto físico).',
    secciones: [
      {
        id: 'mapa-ingreso',
        titulo: '1. Camino en el POS',
        cuerpo: [
          '**Productos** → menú **⋮** → **Ajuste de inventario** → **Ingreso de inventario**.',
          'Luego: **escaneas** cada producto, anotas la **cantidad del ticket** y **validas** contra el producto físico.',
          'Al terminar: **Aplicar +N pieza(s)** para sumar al stock.',
        ],
        imagen: '/tutorial-ingreso-inventario/ingreso-00-mapa.png',
        imagenAlt: 'Mapa: Productos → ⋮ → Ajuste → Ingreso → Escanear + cantidad',
      },
      {
        id: 'abrir-productos',
        titulo: '2. Entra a Productos y abre el menú ⋮',
        cuerpo: [
          '1. En el menú lateral abre **Productos**.',
          '2. Arriba a la derecha toca el menú de **tres puntos (⋮)**.',
          '3. Elige **Ajuste de inventario**.',
        ],
        imagen: '/tutorial-ingreso-inventario/ingreso-01-productos-menu.png',
        imagenAlt: 'Productos · menú ⋮ · Ajuste de inventario',
        notas: [
          'El cajero también puede usar este camino (ingreso / ajuste), aunque el catálogo sea solo consulta.',
        ],
      },
      {
        id: 'elegir-ingreso',
        titulo: '3. Elige Ingreso de inventario',
        cuerpo: [
          'Se abre el modal **Ajuste de inventario**.',
          'En la lista de la izquierda toca **Ingreso de inventario** (*Dar entrada a productos en almacén*).',
          'Eso abre la pantalla **Ingreso de inventarios**.',
        ],
        imagen: '/tutorial-ingreso-inventario/ingreso-02-modal-ingreso.png',
        imagenAlt: 'Modal Ajuste de inventario · Ingreso de inventario',
        notas: [
          'No confundir con **Retiro de inventario** (resta piezas) ni con **Nuevo ajuste** (conteo).',
        ],
      },
      {
        id: 'escanear',
        titulo: '4. Escanea el producto',
        cuerpo: [
          'En **Productos a ingresar**, pon el cursor en el campo de búsqueda / escaneo (*Nombre o código…*).',
          '**Escanea el código de barras** del producto (o búscale por nombre / cámara).',
          'Ten a la mano el **ticket del proveedor** y el producto físico.',
        ],
        imagen: '/tutorial-ingreso-inventario/ingreso-03-pantalla-escanear.png',
        imagenAlt: 'Pantalla Ingreso de inventarios · campo para escanear',
      },
      {
        id: 'cantidad',
        titulo: '5. Anota la cantidad del ticket (valida el físico)',
        cuerpo: [
          'Aparece el cuadro **¿Cuántas piezas entran?** con el nombre del producto.',
          '1. Cuenta / revisa el **producto físico**.',
          '2. Compara con la **cantidad del ticket** del proveedor.',
          '3. Escribe esa cantidad en **Cantidad (piezas)** (ej. 12).',
          '4. Pulsa **Aceptar**.',
          'El producto queda en la lista. Si lo vuelves a escanear, lo que escribas se **suma** a lo ya capturado.',
        ],
        imagen: '/tutorial-ingreso-inventario/ingreso-04-cantidad.png',
        imagenAlt: 'Diálogo ¿Cuántas piezas entran?',
        notas: [
          'Las cantidades **SUMAN** al stock actual (ej. 10 + 12 = 22). No reemplazan la existencia.',
          'En tienda el ingreso va al **piso**; en CEDIS al almacén central.',
        ],
      },
      {
        id: 'aplicar',
        titulo: '6. Revisa la lista y aplica',
        cuerpo: [
          'Repite escaneo + cantidad por cada línea del ticket.',
          'Opcional: en **Motivo / referencia** escribe algo como *Recepción proveedor ticket 458*.',
          'Revisa la lista (cantidades vs ticket físico).',
          'Pulsa **Aplicar +N pieza(s)** para guardar el ingreso en el inventario.',
        ],
        imagen: '/tutorial-ingreso-inventario/ingreso-05-aplicar.png',
        imagenAlt: 'Lista de ingreso y botón Aplicar',
      },
      {
        id: 'errores-ingreso',
        titulo: '7. Errores frecuentes',
        cuerpo: [
          '· Ir al módulo **Compras** en lugar de **Productos → ⋮ → Ingreso**.',
          '· Elegir **Retiro** por error (resta en vez de sumar).',
          '· Anotar cantidad sin validar el producto físico vs el ticket.',
          '· Aplicar sin revisar la lista completa.',
          '· Olvidar el motivo/referencia del ticket del proveedor.',
        ],
      },
      {
        id: 'frase-ingreso',
        titulo: 'Frase para capacitar',
        cuerpo: [
          '**Productos → ⋮ → Ajuste de inventario → Ingreso de inventario.**',
          'Escanea → anota la cantidad del **ticket** → valida el **físico** → **Aplicar**.',
        ],
      },
    ],
  },
];
