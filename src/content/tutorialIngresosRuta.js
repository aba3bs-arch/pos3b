/** Tutorial (con humor) · Ingresos de venta en ruta, créditos pendientes, entrega del recolector y camión. */

const IMG = '/tutorial-ingresos-ruta';

export const TUTORIAL_INGRESOS_RUTA = {
  id: 'estadisticas-ingresos-ruta',
  titulo: 'La banda de la ruta: ingresos, créditos, entrega y camión (con chistes)',
  resumen:
    'Conoce a Don Billete, Pepe, Doña Cuentas y Camionsito mientras aprendes a leer el análisis de ingresos de venta en ruta: filtro de periodo, créditos pendientes por antigüedad, si el recolector entrega completo y qué trae el camión. Con evaluación.',
  interactivo: true,
  audiencia: 'admin',
  secciones: [
    {
      id: 'banda',
      titulo: '1. Conoce a la banda',
      cuerpo: [
        'Para que esto no se sienta como leer un contrato de renta, te presentamos al elenco:',
        '**Don Billete** (el billete con monóculo): el jefe de los números. Siempre sospecha.',
        '**Pepe**: el recolector. Maneja, vende, cobra y entrega. Lleva la bolsa del dinero.',
        '**Doña Cuentas**: lleva el libro de los créditos. Nadie le debe más de 30 días sin que ella lo sepa.',
        '**Camionsito**: el camión. Muy simpático, pero cuando le abres la caja no puede mentir.',
        'El análisis responde **cuatro preguntas**: ¿cuánto ingresó la ruta?, ¿quién nos debe?, ¿Pepe entrega completo? y ¿qué trae Camionsito hoy?',
      ],
      imagen: `${IMG}/01-banda.jpg`,
      imagenAlt: 'Don Billete, Pepe, Doña Cuentas y Camionsito, los personajes del tutorial',
      notas: ['Es solo lectura: mirar el análisis no cambia ningún dato del sistema.'],
    },
    {
      id: 'filtro',
      titulo: '2. Dónde está y el filtro de periodo (el control remoto de Don Billete)',
      cuerpo: [
        'Menú **Estadísticas → Abarrotes**. Baja hasta la tarjeta **Periodo de los análisis de venta en ruta**.',
        'Tiene cinco botones: **Hoy**, **Semana actual** (de lunes a hoy), **Mes actual**, **Desde última liquidación** y **Rango de fechas** (aparecen dos calendarios).',
        '**Desde última liquidación:** para cada recolector solo cuenta lo que pasó **después de su última liquidación** (máximo 60 días atrás). Es la mejor pregunta para saber «¿qué lleva Pepe ahora mismo?».',
        'Este periodo **no depende** del periodo del tablero de arriba: puedes mirar el mes en el tablero y «Hoy» aquí.',
        '**Ojo:** los créditos pendientes (todas las fechas) y el camión (hoy) **no cambian** con el filtro. La deuda vieja no desaparece porque cambies de botón.',
      ],
      imagen: `${IMG}/02-filtro.jpg`,
      imagenAlt: 'Don Billete surfeando un calendario con un control remoto, junto a un cronómetro y un reloj de arena',
      notas: [
        'En periodos cortos (Hoy, Semana) pueden salir diferencias que son solo de calendario: una recolección puede traer dinero de días anteriores.',
        'El filtro de **Tienda** del tablero sigue aplicando a ingresos, créditos y entrega; el camión siempre se muestra completo.',
      ],
    },
    {
      id: 'ingresos',
      titulo: '3. Ingresos: ¿cuánto entró de verdad? (la báscula)',
      cuerpo: [
        '**Vendido total:** todo lo vendido en ruta en el periodo (sin canceladas).',
        '**Contado (efectivo):** lo que se pagó al momento.',
        '**Vendido a crédito:** lo que se dejó a deber. Es venta, pero **todavía no es dinero**.',
        '**Crédito ya cobrado** y **Crédito PENDIENTE:** de lo vendido a crédito, cuánto ya se cobró y cuánto sigue debiéndose.',
        '**Ingreso realizado:** contado + crédito cobrado, con su % de lo vendido.',
        'La **barra** lo resume: **verde = ya ingresó**, **rojo = por cobrar**. Si ves mucho rojo, Don Billete empieza a sudar.',
        '**Cobranza recibida en el periodo** es lo que se cobró en estos días, aunque la venta original sea de antes.',
      ],
      imagen: `${IMG}/03-ingresos.jpg`,
      imagenAlt: 'Don Billete con una báscula: monedas en el lado verde y papeles arrugados en el lado rojo',
      notas: [
        'Vender mucho a crédito se siente bonito, pero no se paga la nómina con pagarés: mira siempre el **ingreso realizado**.',
      ],
    },
    {
      id: 'creditos',
      titulo: '4. Créditos pendientes: los frascos de Doña Cuentas',
      cuerpo: [
        'Esta parte mira **toda la cartera**, de cualquier fecha. Separa dos cosas:',
        '· **Pendiente de ventas en ruta:** créditos que nacieron en Venta en Ruta.',
        '· **Créditos de recolección:** créditos que nacieron en Recolecciones; **no son venta de ruta**, pero también se deben.',
        'La antigüedad se reparte en cuatro frascos con semáforo: **0–7 días (verde)**, **8–15 (amarillo)**, **16–30 (naranja)** y **más de 30 días (rojo, con telarañas)**.',
        'Más abajo ves el resumen **por tienda** y **por vendedor**, y el listado **del más viejo al más nuevo** con una insignia de días. Se muestran los 15 más viejos; con **Ver los N créditos** ves todos.',
        'Regla de Doña Cuentas: **mientras más rojo el frasco, menos probable es cobrarlo.** Empieza por el más viejo.',
      ],
      imagen: `${IMG}/04-creditos.jpg`,
      imagenAlt: 'Doña Cuentas con su libro y cuatro frascos de créditos (verde, amarillo, naranja y rojo con telarañas)',
      notas: [
        'Un crédito «pendiente» sale de los cargos de Cuentas por Cobrar sin pagar. Cuando se cobra, deja de aparecer aquí.',
      ],
    },
    {
      id: 'entrega',
      titulo: '5. ¿Pepe entrega completo? (la investigación)',
      cuerpo: [
        'La tabla compara, por recolector, lo que **vendió en efectivo** contra lo que quedó **registrado como efectivo en tránsito**:',
        '**Vendido efvo** · **Registrado en tránsito** · **Cobros crédito** · **Entregado** (ya liquidado) · **Por entregar** (en tránsito) · **Vendido − registrado** · **Gastos** · **En tránsito hoy**.',
        '**Vendido − registrado:** si dice **Faltan $X**, Pepe vendió efectivo que nunca se registró. Si dice **Sobran $X**, hay más efectivo registrado que ventas en efectivo (suena bien, pero casi siempre es un error: registro duplicado, venta cancelada o venta de otra fecha).',
        'El **Estado** te ahorra pensar: **Completo**, **Por entregar**, **Entrega atrasada** (más de 3 días en tránsito), **Falta registrar** o **Registró de más**.',
        'Si Pepe aparece en **dos filas**, es porque estaba dado de alta dos veces en Panel RT; el análisis ya los junta por nombre en una sola fila.',
      ],
      imagen: `${IMG}/05-entrega.jpg`,
      imagenAlt: 'Don Billete detective con lupa investigando a Pepe, que lleva una bolsa de dinero con un hoyo',
      notas: [
        'Un estado rojo **no** significa que Pepe sea un villano: casi siempre es un registro que se quedó a medias. Averigua antes de acusar.',
      ],
    },
    {
      id: 'que-paso',
      titulo: '6. «Ver qué pasó»: la lupa folio por folio',
      cuerpo: [
        'En cada recolector, el botón **Ver qué pasó** compara cada renglón de efectivo en tránsito con la venta del **mismo folio** y te dice la causa de la diferencia:',
        '· **Sin venta con ese folio:** efectivo en tránsito que no corresponde a ninguna venta.',
        '· **Venta cancelada:** se canceló la venta pero su efectivo sigue en tránsito.',
        '· **Registro duplicado:** el mismo folio quedó registrado dos veces.',
        '· **La venta fue a crédito:** se registró efectivo por una venta que no fue en efectivo.',
        '· **Monto distinto:** el tránsito no es igual al efectivo de la venta (la diferencia es el excedente).',
        '· **Venta de otra fecha:** la venta existe, pero es de otro periodo.',
        '· **Venta sin efectivo en tránsito:** se vendió en efectivo y nunca pasó a tránsito (aquí sí **faltan** pesos).',
        'Primero verás el resumen con montos y debajo el listado, con los más grandes arriba. Con eso sabes **qué folio corregir**.',
      ],
      notas: [
        'Las causas «sobran» se corrigen revisando el movimiento en Recolecciones; las causas «faltan» se corrigen registrando el efectivo que quedó sin pasar a tránsito.',
      ],
    },
    {
      id: 'camion',
      titulo: '7. El camión: abre la caja de Camionsito',
      cuerpo: [
        'Por cada **carga abierta** (camión en ruta) ves: **Cargado**, **Vendido**, **Devuelto** y **En camión hoy** (cargado − vendido − devuelto).',
        'También el **valor a precio ruta** y el **valor a costo** de lo que sigue en el camión, y con **Productos** el detalle pieza por pieza.',
        '**Vendido sin venta:** compara la mercancía que salió del camión contra las ventas registradas de esa carga. Si salió mercancía y no hay venta, algo se vendió **sin registrar** (o se perdió).',
        'Si la carga lleva **más de 7 días abierta**, el análisis te sugiere liquidarla o devolverla.',
      ],
      imagen: `${IMG}/06-camion.jpg`,
      imagenAlt: 'Camionsito con la caja abierta, Pepe contando con una libreta y Don Billete con una calculadora',
      notas: [
        'Es el inventario **teórico** del sistema. No sustituye el conteo físico de **Auditoría del camión**.',
      ],
    },
    {
      id: 'receta',
      titulo: '8. La receta para leerlo en 2 minutos',
      cuerpo: [
        '**1.** Elige el periodo: «Desde última liquidación» si quieres saber qué lleva Pepe ahora.',
        '**2.** Lee los **avisos** de arriba: el rojo manda.',
        '**3.** Mira la **barra** verde/roja: ¿cuánto de lo vendido ya es dinero?',
        '**4.** Revisa el **frasco rojo** de créditos (más de 30 días) y cobra desde Cobranza.',
        '**5.** En la tabla de entrega, abre **Ver qué pasó** en cualquier fila con Faltan, Sobran o atrasada.',
        '**6.** Termina con el camión: ¿cuánto trae y hace cuántos días salió?',
      ],
    },
    {
      id: 'limites',
      titulo: '9. Cuándo NO sacar conclusiones todavía',
      cuerpo: [
        'En periodos cortos, una diferencia puede ser solo de **calendario** (la venta de ayer entregada hoy).',
        'El valor del camión usa el **precio de compra actual** del catálogo; los productos sin costo capturado no suman al valor a costo.',
        'Un recolector duplicado en Panel RT puede partir los números en dos. Si ves el mismo nombre dos veces en Panel RT, **fusiónalos** antes de confiar en el análisis.',
        'La herramienta señala **dónde mirar**; la conclusión la confirmas con Recolecciones, Cobranza y el conteo físico.',
      ],
    },
    {
      id: 'quiz',
      titulo: '10. Evaluación (Doña Cuentas te califica)',
      cuerpo: [
        'Responde las 9 preguntas. Al terminar verás **puntaje, porcentaje y calificación** (A–F).',
        'Apruebas con **70% o más** (C o mejor). Si no, reintenta tras repasar, y Doña Cuentas no se enoja (mucho).',
      ],
      quiz: [
        {
          id: 'q1',
          pregunta: '¿Qué es el «ingreso realizado»?',
          opciones: [
            'Todo lo vendido, incluso lo que se dejó a crédito',
            'Contado + crédito ya cobrado',
            'Solo el crédito pendiente',
            'Lo que hay en el camión',
          ],
          correcta: 1,
          explicacion: 'El ingreso realizado es **contado + crédito ya cobrado**: dinero que ya entró.',
        },
        {
          id: 'q2',
          pregunta: 'La barra de ingresos está casi toda en rojo. ¿Qué significa?',
          opciones: [
            'Que se vendió poco',
            'Que casi todo lo vendido está a crédito y por cobrar',
            'Que el camión está vacío',
            'Que el recolector no entregó',
          ],
          correcta: 1,
          explicacion: 'Rojo = **por cobrar**. Se vendió, pero todavía no es dinero.',
        },
        {
          id: 'q3',
          pregunta: '¿Qué cubre «Créditos pendientes»?',
          opciones: [
            'Solo los créditos del periodo elegido',
            'Toda la cartera, de cualquier fecha, separada en ruta y recolección',
            'Solo los créditos de más de 30 días',
            'Solo los créditos de hoy',
          ],
          correcta: 1,
          explicacion: 'Muestra **toda la cartera** de cualquier fecha; el filtro de periodo no la cambia.',
        },
        {
          id: 'q4',
          pregunta: '¿Qué significa el frasco rojo de Doña Cuentas?',
          opciones: [
            'Créditos de 0 a 7 días',
            'Créditos de más de 30 días: los más difíciles de cobrar',
            'Créditos ya cobrados',
            'Créditos de recolección',
          ],
          correcta: 1,
          explicacion: 'Rojo = **más de 30 días** sin cobrarse.',
        },
        {
          id: 'q5',
          pregunta: 'La tabla dice «Faltan $3,090» para un recolector. ¿Qué significa?',
          opciones: [
            'Que entregó $3,090 de más',
            'Que vendió $3,090 en efectivo que nunca se registró como efectivo en tránsito',
            'Que debe $3,090 de crédito',
            'Que el camión perdió $3,090 de mercancía',
          ],
          correcta: 1,
          explicacion: '«Faltan» = vendió efectivo que **no quedó registrado en tránsito**.',
        },
        {
          id: 'q6',
          pregunta: 'La tabla dice «Sobran $8,683». ¿Cuál es la causa más probable?',
          opciones: [
            'Que Pepe cobró propina',
            'Un registro duplicado, una venta cancelada con efectivo aún en tránsito o ventas de otra fecha',
            'Que se vendió de más a crédito',
            'Que el filtro está mal puesto',
          ],
          correcta: 1,
          explicacion: 'Sobran suele ser **error de registro**; «Ver qué pasó» te dice el folio y la causa.',
        },
        {
          id: 'q7',
          pregunta: '¿Qué hace el botón «Ver qué pasó»?',
          opciones: [
            'Borra los registros duplicados',
            'Compara cada efectivo en tránsito con la venta del mismo folio y clasifica la causa de la diferencia',
            'Cancela la venta',
            'Liquida al recolector',
          ],
          correcta: 1,
          explicacion: 'Solo **lee y clasifica**; tú corriges el folio donde corresponda.',
        },
        {
          id: 'q8',
          pregunta: '¿Qué hace «Desde última liquidación»?',
          opciones: [
            'Muestra solo el día de hoy',
            'Para cada recolector cuenta lo posterior a su última liquidación (máx. 60 días)',
            'Muestra todo el año',
            'Borra las liquidaciones viejas',
          ],
          correcta: 1,
          explicacion: 'Es el corte de **cada** recolector: lo que lleva desde su última liquidación.',
        },
        {
          id: 'q9',
          pregunta: 'Camionsito dice «Vendido sin venta» en rojo. ¿Qué significa?',
          opciones: [
            'Que salió mercancía del camión sin una venta registrada que la respalde',
            'Que el camión no ha salido',
            'Que hay créditos pendientes',
            'Que el recolector no tiene PIN',
          ],
          correcta: 0,
          explicacion: 'Salió mercancía y **no hay venta registrada**: algo se vendió sin registrar o se perdió.',
        },
      ],
    },
    {
      id: 'frase',
      titulo: 'Frase para capacitar',
      cuerpo: [
        '**Vender no es cobrar: miro el ingreso realizado, vigilo el frasco rojo, abro «Ver qué pasó» cuando Pepe no cuadra y le pido cuentas a Camionsito.**',
        'Si fallaste la evaluación: repasa qué es el ingreso realizado, los frascos de antigüedad, Faltan vs Sobran y qué hace «Ver qué pasó»; luego **Reintentar**.',
      ],
    },
  ],
};
