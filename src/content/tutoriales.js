/** Contenido del módulo Tutorial (POS). Imágenes en /public/tutorial-... */

import { TUTORIAL_CORTE_ABARROTES } from './tutorialCorteAbarrotes.js';
import { TUTORIAL_CORTE_CAJA } from './tutorialCorteCaja.js';
import { TUTORIAL_VALES_MAIN } from './tutorialValesMain.js';
import { TUTORIAL_CONFIG_OPERACION } from './tutorialConfigOperacion.js';
import { TUTORIAL_SOLICITAR_CT } from './tutorialSolicitarCt.js';
import { TUTORIAL_PORTAL_CT } from './tutorialPortalCt.js';
import { TUTORIAL_ADMIN_CT } from './tutorialAdminCt.js';
import { TUTORIAL_RELOJ_EMPLEADO } from './tutorialRelojEmpleado.js';
import { TUTORIAL_CEDIS } from './tutorialCedis.js';

export const TUTORIALES = [
  TUTORIAL_CEDIS,
  TUTORIAL_RELOJ_EMPLEADO,
  TUTORIAL_PORTAL_CT,
  TUTORIAL_SOLICITAR_CT,
  TUTORIAL_ADMIN_CT,
  TUTORIAL_CORTE_CAJA,
  TUTORIAL_CORTE_ABARROTES,
  TUTORIAL_VALES_MAIN,
  TUTORIAL_CONFIG_OPERACION,
  {
    id: 'alta-reingreso-empleado',
    titulo: 'Cómo dar de alta o reingresar un empleado',
    resumen:
      'Alta nueva: Usuarios (nombre + PIN). Reingreso: elige a quien ya tuvo baja y pulsa Reingresar alta. No dupliques el usuario.',
    secciones: [
      {
        id: 'diferencia',
        titulo: '1. Alta vs reingreso',
        cuerpo: [
          '**Alta** = persona que **nunca** ha estado en el sistema (o no tiene usuario).',
          '**Reingreso** = alguien que ya se dio de **baja**. Usa su expediente; no lo des de alta otra vez.',
        ],
      },
      {
        id: 'alta-usuarios',
        titulo: '2. Alta nueva en Usuarios (Administrador)',
        cuerpo: [
          'Menú **Usuarios** → recuadro verde **Cómo dar de alta un empleado**.',
          'Captura **nombre**, **PIN**, tipo, sucursal, rol y turno.',
          'Pulsa **Añadir empleado**. Ya puede entrar al POS. El expediente se crea en **RH ABA3B**.',
        ],
      },
      {
        id: 'alta-rh',
        titulo: '3. Alta de expediente en RH ABA3B',
        cuerpo: [
          'Menú **RH ABA3B** → **+ Alta de empleado**.',
          'Nombre, tipo (tienda / cubre / indirecto), sucursal, puesto. Opcional: CURP, RFC, salario.',
          '**Registrar alta**. Si debe cobrar en caja, el Admin le crea el PIN en **Usuarios**.',
        ],
      },
      {
        id: 'reingreso',
        titulo: '4. Reingreso (ex-empleado)',
        cuerpo: [
          '**Usuarios:** recuadro **Cómo reingresar un empleado** → elige el nombre dado de baja → **Reingresar alta**.',
          '**RH ABA3B:** pestaña **Inactivos / bajas** → **Reingresar alta** en la fila (o Perfil).',
          'Si está **no recontratable**, captura el PIN del administrador principal.',
        ],
      },
      {
        id: 'efecto',
        titulo: '5. Qué pasa al reingresar',
        cuerpo: [
          'Vuelve a **nómina**, **empleados por turno** y **Usuarios**.',
          'Puede entrar otra vez con su PIN.',
          'El expediente pasa de Inactivos a **Activos** en RH ABA3B.',
        ],
        notas: [
          'Frase: **Persona nueva → Usuarios (PIN). Ya trabajó aquí → Reingresar alta. Nunca dupliques.**',
        ],
      },
    ],
  },
  {
    id: 'cambio-tienda-empleado',
    titulo: 'Cómo cambiar de tienda a un empleado',
    resumen:
      'Usuarios o RH ABA3B: elige el empleado y la tienda destino. El PIN pasa a valer ahí. Máx. 2 por sucursal; indirectos/MAIN no se mueven.',
    secciones: [
      {
        id: 'quien',
        titulo: '1. Quién puede y límites',
        cuerpo: [
          '**Administrador:** menú **Usuarios**.',
          '**Gerente o Administrador:** menú **RH ABA3B**.',
          'Máximo **2** empleados de tienda activos por sucursal. Los **indirectos / MAIN** aparecen en todas las tiendas: no se les cambia sucursal.',
        ],
      },
      {
        id: 'usuarios',
        titulo: '2. Desde Usuarios',
        cuerpo: [
          'Menú **Usuarios** → recuadro **Cómo cambiar de tienda a un empleado**.',
          'Elige el nombre y la **tienda destino**. Pulsa **Cambiar de tienda**.',
          'También: en **Equipo registrado**, columna **Sucursal**.',
        ],
      },
      {
        id: 'rh',
        titulo: '3. Desde RH ABA3B',
        cuerpo: [
          'Elige empleado y tienda destino → **Cambiar de tienda**.',
          'O abre **Perfil**, cambia sucursal y **Guardar cambios**.',
        ],
      },
      {
        id: 'efecto',
        titulo: '4. Qué pasa',
        cuerpo: [
          'El PIN **solo vale** en la tienda nueva.',
          'El expediente de RH queda con esa sucursal.',
          'Si tenía equipo anclado, se **libera** para que ancle en la tienda nueva. Si no puede entrar, pulsa **Liberar equipo**.',
        ],
        notas: [
          'Si el PIN ya existe en la tienda destino, cámbialo antes de moverlo.',
        ],
      },
    ],
  },
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
          'En **Usuarios**, recuadro **Cómo reingresar un empleado** (o marca **Ver dados de baja** y pulsa **Reingresar alta**).',
          'En **RH ABA3B**, pestaña **Inactivos / bajas** → **Reingresar alta**.',
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
