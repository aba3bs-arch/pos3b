/**
 * Contenido del manual impreso · Cómo leer el Libro diario de Abarrotes.
 * Mismo elenco que el manual de compras: Beto y Lulú (Las 3B), Ángel y Chispita (invitados).
 * Los ejemplos numéricos son ficticios; los pasos, botones y columnas son los del módulo Libro diario.
 * El PDF se genera con generar-pdf.mjs; este archivo no forma parte de la app.
 */

const IMG = 'imagenes';

const BETO = 'Beto · Las 3B';
const LULU = 'Lulú · Las 3B';
const ANGEL = 'Ángel · Cajero de turno';
const CHISPITA = 'Chispita · Proveedora';

const t = (quien, texto) => ({ quien, texto, lado: 'tienda' });
const p = (quien, texto) => ({ quien, texto, lado: 'proveedor' });

export const MANUAL_LIBRO_DIARIO = {
  id: 'manual-capacitacion-libro-diario',
  titulo: 'Manual de capacitación: cómo leer el Libro diario de Abarrotes',
  secciones: [
    {
      id: 'portada',
      titulo: '1. Para qué es este manual',
      cuerpo: [
        '**Objetivo:** que cada persona con acceso a Contabilidad sepa **leer el Libro diario**: qué entró, qué salió, cuánto quedó cada día y por qué el libro a veces no se parece a lo que ve en el POS en ese momento.',
        '**Al terminar sabrás:** elegir tienda y periodo (semana, mes, año o rango), leer el resumen de todas las tiendas, abrir un día y entender cada bloque, comprobar la **caja chica** contra el ticket del corte, interpretar **PCT ABA** y **PCT VIRTUAL**, distinguir lo que **sí cuenta** en el resultado de lo que es solo informativo (**Venta POS hoy en vivo**, **Gastos sin corte**, **Otros egresos de IE**) y saber qué hacer cuando algo no cuadra.',
        '**Cómo se usa:** lee cada sección (los personajes platican en globos), haz las cuentas de la hoja de práctica y presenta la **evaluación final** (se aprueba con 70% o más).',
      ],
      imagen: `${IMG}/01-portada.jpg`,
      imagenAlt: 'Beto señala un libro gigante con flechas verdes y rojas mientras Lulú levanta la mano y Ángel y Chispita toman notas en sus pupitres',
      dialogo: [
        t(BETO, 'Bienvenidos. Hoy aprenden a leer el **Libro diario**: el cuaderno donde se ve día por día cómo le fue a cada tienda.'),
        t(LULU, '¿Es lo mismo que el corte de caja, Beto?'),
        t(BETO, 'Se parecen, pero no. El corte lo hace el cajero; el libro junta **todos los cortes y gastos** y los ordena por día.'),
        p(ANGEL, 'Yo cierro mi turno todos los días. ¿Mi corte sale ahí?'),
        t(BETO, 'Tu corte alimenta el día, sí, pero el libro se arma con el **corte general de medianoche**. Ya lo verás.'),
      ],
    },
    {
      id: 'donde',
      titulo: '2. Dónde está y quién lo ve',
      cuerpo: [
        '**Ruta:** menú **Contabilidad → Libro diario** (tarjeta «Abarrotes por tienda · día por día»). Arriba está el botón **← Contabilidad** para regresar.',
        '**Quién lo ve:** solo quien tenga el módulo **Libro diario** en sus privilegios (administración y gerencia). Si no te aparece en Contabilidad, pide al administrador que te lo active.',
        '**Solo lectura:** el libro **no captura nada**. Muestra lo que ya registraron los cortes, los gastos y las ventas del POS. Si algo está mal, se corrige en el módulo donde nació (Corte Abarrotes, IE ABARROTES, etc.), no aquí.',
      ],
      dialogo: [
        t(LULU, 'Entonces si veo un gasto raro en el libro, ¿lo borro desde ahí?'),
        t(BETO, 'No. El libro es de **consulta**. Anota el folio y el cajero, y se corrige en el corte o en IE.'),
        p(CHISPITA, 'Como cuando mi factura sale mal: se corrige en compras, no en el reporte.'),
      ],
      notas: [
        'Este libro es de **Abarrotes**, por tienda: toma los cortes, los gastos y las ventas del POS de cada sucursal.',
      ],
    },
    {
      id: 'idea',
      titulo: '3. La idea central: lo que entró y lo que salió',
      cuerpo: [
        '**Entró (verde):** la **venta en efectivo** de la tienda (venta total del corte **menos** lo cobrado con tarjeta) más los otros ingresos capturados a mano.',
        '**Salió (rojo):** los **gastos** que guardó el corte (los mismos del ticket): compras, servicios, consumos, **faltantes de caja**, **créditos cobrados**, etc.',
        '**Resultado del día** = **Entró − Salió**. **Acumulado** = suma de los resultados desde el primer día del periodo que estás consultando.',
        '**Ojo:** los **créditos cobrados** cuentan como **egreso (Salió)**, no como ingreso. Y el **faltante** de un cajero ya viene como gasto del turno (**EMPLEADO › FALTANTE**), así que no se resta dos veces.',
      ],
      imagen: `${IMG}/02-entra-sale.jpg`,
      imagenAlt: 'Lulú echa dinero a una canasta verde con flecha hacia arriba y Beto echa recibos a una canasta roja con flecha hacia abajo sobre una báscula',
      dialogo: [
        t(LULU, 'Verde es lo que entró en efectivo y rojo lo que salió. ¿Y la tarjeta?'),
        t(BETO, 'La tarjeta **no entra a la caja**, así que no está en Entró. Tiene su propio bloque: **PCT ABA** y **PCT VIRTUAL**. Lo vemos en la sección 8.'),
        p(CHISPITA, 'Y cuando me pagan una compra de contado, esa compra aparece en **Salió**.'),
        t(BETO, 'Exacto. Entró menos Salió es el **Resultado del día**.'),
      ],
      notas: [
        '**No es utilidad.** El libro no incluye el costo de la mercancía ni la nómina del periodo si aún no se registran en IE. Es un reporte de **flujo de efectivo de la tienda**.',
      ],
    },
    {
      id: 'periodo',
      titulo: '4. Elegir tienda y periodo',
      cuerpo: [
        '**Tienda:** elige **Todas las tiendas (resumen)** o una sola tienda.',
        '**Ver por:** cuatro botones.',
        '**Semana:** de **sábado a viernes**. Usa **← Anterior**, **Esta semana**, **Siguiente →** o **Ir a la semana de…** (cualquier fecha te lleva a su semana).',
        '**Mes:** del día **1 al último día** del mes. Elige mes y año. Con la casilla **Empezar en el sábado de la semana (y cerrar en el viernes)** el mes se extiende para que empiece en sábado y termine en viernes (útil para cuadrar con la nómina semanal).',
        '**Año:** del **1 de enero al 31 de diciembre**. Con **← Anterior / Este año / Siguiente →**.',
        '**Rango de fechas:** elige **Desde** y **Hasta** (máximo **400 días**). También acepta la casilla de empezar en sábado.',
        'Pulsa **Actualizar** para volver a leer los datos y **Imprimir** para sacar el reporte de lo que estás viendo.',
      ],
      imagen: `${IMG}/03-periodos.jpg`,
      imagenAlt: 'Beto y Lulú sostienen una tableta con un calendario con una semana resaltada y cuatro botones de colores',
      dialogo: [
        t(LULU, 'Quiero ver todo noviembre pero empezando en sábado, para que cuadre con la nómina.'),
        t(BETO, 'Elige **Mes**, noviembre, y marca **Empezar en el sábado de la semana**. El periodo arranca el sábado anterior al día 1.'),
        t(LULU, 'Y si el periodo es largo, ¿se carga todo junto?'),
        t(BETO, 'Se carga por **tramos de 31 días** y verás «Cargando 2 de 5 tramos». Solo espera a que termine.'),
      ],
      notas: [
        'Con más de **35 días** el libro agrega un **Resumen por mes**; con más de **7 días** (hasta 120) agrega un **Resumen por semana (sábado a viernes)**. Toca un mes del resumen para abrir su detalle.',
        'El detalle **día por día** se muestra hasta **100 días**. Si el periodo es más largo, elige un mes o un rango menor.',
      ],
    },
    {
      id: 'resumen',
      titulo: '5. El resumen de «Todas las tiendas»',
      cuerpo: [
        'Al elegir **Todas las tiendas** ves una fila por tienda y un renglón de **Total**. Toca una tienda para abrir su libro día por día.',
        '**Ventas:** lo que entró (venta en efectivo + otros ingresos).',
        '**PCT ABA / PCT VIRTUAL:** pagos con tarjeta del periodo, divididos en dos (sección 8).',
        '**Gastos de cortes:** lo que salió, guardado en los cortes.',
        '**Resultado:** Ventas − Gastos de cortes. En verde si es positivo, en rojo si es negativo.',
        '**Venta POS hoy (en vivo):** solo aparece si el periodo incluye **hoy**. Es informativa (sección 9).',
        '**Gastos sin corte** y **Otros IE:** egresos que se muestran aparte y **no** se restan del resultado (sección 9).',
      ],
      dialogo: [
        t(LULU, 'Una tienda sale en rojo en Resultado. ¿Ya hay problema?'),
        t(BETO, 'No siempre. Un día con una compra grande puede salir negativo. Mira el **periodo completo** y la **categoría** del gasto.'),
        t(LULU, 'O sea que abro la tienda y reviso en qué se gastó.'),
        t(BETO, 'Exacto. Al final de la página está **¿En qué se gastó en el periodo?**, con cada categoría y su porcentaje.'),
      ],
    },
    {
      id: 'dia',
      titulo: '6. Abrir un día: qué trae cada bloque',
      cuerpo: [
        'Cada día es una tarjeta. Cerrada muestra **Entró**, **Salió** y **Resultado**. Al tocarla se abre y muestra, en este orden:',
        '**ENTRADAS:** las ventas del día (con el cajero) y otros ingresos capturados a mano.',
        '**SALIDAS:** cada gasto con **categoría › subcategoría**, concepto y la persona.',
        '**CAJA CHICA:** cómo cerró cada corte (sección 7).',
        '**PAGOS CON TARJETA:** PCT ABA y PCT VIRTUAL (sección 8).',
        '**GASTOS SIN CORTE** y **OTROS EGRESOS DE IE:** solo si hay (sección 9).',
        '**Resultado del día** y **Acumulado del periodo**, al final.',
        'Los días sin movimiento aparecen en gris con **Sin movimientos**. Usa **Abrir todos** o **Cerrar todos** para desplegar o plegar todo.',
      ],
      dialogo: [
        t(LULU, 'El lunes dice Entró $2,000, Salió $350 y Resultado $1,650.'),
        t(BETO, 'Y el acumulado del lunes incluye el sábado y el domingo. Es el **corrido** del periodo, no del mes.'),
        p(ANGEL, 'Si mi faltante de $50 sale en Salió, ¿es mi culpa?'),
        t(BETO, 'Sale a tu nombre en **EMPLEADO › FALTANTE** para que el gasto cuadre con el ticket. Es el mismo dato que ya viste al cerrar.'),
      ],
      notas: [
        'Si el **Acumulado** parece raro, revisa desde dónde empieza: siempre suma **desde el primer día del periodo elegido**, no desde el inicio del año.',
      ],
    },
    {
      id: 'caja',
      titulo: '7. Caja chica: igual que el ticket',
      cuerpo: [
        'Para cada corte del día el libro muestra:',
        '**Caja anterior + venta en efectivo − gastos = caja al cerrar**',
        'Esa caja al cerrar **debe ser igual a la del ticket** del corte (por ejemplo AB-210). Es la forma de confirmar que el libro y el corte hablan de lo mismo.',
        '**Ejemplo:** caja anterior **$500** + venta en efectivo **$1,800** − gastos **$350** = **$1,950**.',
        'Si no coinciden, el libro lo marca en rojo con **«(calculado $X, revisa este corte)»**. Eso significa que el corte guardó una caja distinta a la que sale de la suma.',
      ],
      imagen: `${IMG}/04-caja-chica.jpg`,
      imagenAlt: 'Beto compara un ticket largo con una tableta usando una lupa y una palomita verde; Lulú abre una caja con billetes',
      dialogo: [
        t(BETO, 'Mi ticket dice caja al cierre **$1,950**. ¿Qué dice el libro?'),
        t(LULU, 'Caja anterior 500, más venta en efectivo 1,800, menos gastos 350: **1,950**. ¡Cuadra!'),
        p(ANGEL, '¿Y si el libro dice otra cosa?'),
        t(BETO, 'Entonces **no se corrige el libro**: se revisa el corte. Mira los gastos del turno y el faltante, y si hace falta, se corrige en Corte Abarrotes.'),
      ],
      notas: [
        'La **venta en efectivo** del corte es la **venta total menos lo cobrado con tarjeta, transferencia y QR**.',
      ],
    },
    {
      id: 'tarjeta',
      titulo: '8. PCT ABA y PCT VIRTUAL: la tarjeta se divide en dos',
      cuerpo: [
        'El cajero captura en el corte **cuánto cobró con tarjeta**. Ese dinero **no es efectivo de la caja**, así que no cuenta en Entró; pero sirve para saber de qué rubro viene.',
        'El libro lo divide en dos:',
        '**PCT ABA:** lo que ya está registrado como tarjeta en las **ventas del POS** de la tienda (venta de abarrotes).',
        '**PCT VIRTUAL:** la **diferencia**: tarjeta del corte menos lo que está en el POS. Son cobros que no pasaron por el POS (servicios, por ejemplo).',
        '**Ejemplo:** el corte dice tarjeta **$700** y el POS tiene **$500** con tarjeta → **PCT ABA $500**, **PCT VIRTUAL $200**.',
        'Si el POS tuviera **más** tarjeta que el corte, PCT ABA es igual a la tarjeta del corte y PCT VIRTUAL queda en **$0**.',
      ],
      imagen: `${IMG}/05-tarjeta.jpg`,
      imagenAlt: 'Una terminal de tarjeta reparte el dinero en dos montones: uno junto a una canasta de compras y otro junto a un celular con un rayo',
      dialogo: [
        t(LULU, 'El corte dice $700 de tarjeta. En el POS veo $500 con tarjeta.'),
        t(BETO, 'Entonces PCT ABA es $500, lo registrado en el POS de la tienda. La diferencia, $200, es PCT VIRTUAL.'),
        p(CHISPITA, 'Y ninguno de los dos se suma a Entró, ¿verdad?'),
        t(BETO, 'Correcto: no es efectivo en caja. Se muestran **aparte** y no cambian el Resultado.'),
      ],
    },
    {
      id: 'vivo',
      titulo: '9. Lo informativo: lo que NO se suma al resultado',
      cuerpo: [
        'Hay tres datos que verás en el libro pero que **no cambian** el Resultado ni el Acumulado:',
        '**Venta POS hoy (en vivo):** la venta del POS de **hoy**, todo el día (de 00:00 a 23:59, hora Nogales), ya descontadas las cancelaciones. Se actualiza **cada minuto** y con el botón **Actualizar**. Aparece en una columna del resumen y en una tarjeta cuando eliges una tienda. **No se suma:** el libro usa la venta del corte general de medianoche. Al pasar la medianoche, ese día entra al libro por su corte y la columna en vivo empieza con el día nuevo.',
        '**Gastos sin corte:** gastos ya capturados que todavía no entran al corte general de medianoche. Son **egresos, no ventas**. Pasan a Salió cuando se genera el corte.',
        '**Otros egresos de IE:** vales, evidencias, préstamos o capturas manuales en IE que **no salen de la caja del corte**. Se muestran aparte.',
        '**Por qué no coincide con el POS:** la venta en vivo es de **todo el día**; el libro cerrado solo trae los cortes ya generados. Y el POS de un turno nocturno puede repartir sus ventas en dos días: las de madrugada cuentan en el día en que ocurren.',
      ],
      dialogo: [
        t(LULU, 'Son las 8 pm y el libro dice Ventas $1,500 pero la venta en vivo marca $1,800. ¿Cuál es la buena?'),
        t(BETO, 'Las dos. **Ventas** es lo ya cerrado en cortes; **en vivo** es todo lo que ha pasado por el POS hoy. La diferencia son turnos que aún no cierran.'),
        p(ANGEL, 'Y mañana, ¿esos $1,800 ya cuentan?'),
        t(BETO, 'Mañana el día de hoy estará en **Ventas**, con el valor del corte general. La columna en vivo empezará en cero para el día nuevo.'),
      ],
      notas: [
        'La venta en vivo es una **ayuda para ver cómo va el día**. Para cerrar números del periodo, usa siempre **Ventas** y **Resultado**.',
      ],
    },
    {
      id: 'medianoche',
      titulo: '10. El corte general de medianoche y su recibo (CGA)',
      cuerpo: [
        'A partir del **13 de noviembre de 2026** el libro se alimenta del **corte general automático** de medianoche, uno por tienda y por día. Antes de esa fecha el libro sigue leyendo los cierres de turno del cajero.',
        'Cada corte general lleva un **folio consecutivo por tienda**: **CGA-00001**, **CGA-00002**… No afecta a los cierres del cajero (folios **AB-…**).',
        'El corte general reúne **todo el día calendario**: ventas del POS, caja anterior, caja al cierre, **gastos por categoría**, consumos y cargos a empleados y otros egresos de IE.',
        '**Recibo:** en el **historial de cierres de Corte Abarrotes** el corte general tiene el botón **Imprimir recibo** (ticket térmico).',
        '**Cuándo se genera:** no hay un proceso en el servidor. Se genera la **primera vez que alguien abre la app (o abre el libro) después de medianoche**. Si una tienda deja el POS abierto toda la noche, su corte puede tardar hasta que alguien vuelva a entrar. Es normal.',
      ],
      imagen: `${IMG}/06-medianoche.jpg`,
      imagenAlt: 'Beto con gorro de dormir ve salir un recibo larguísimo de la impresora mientras un reloj marca las doce y Lulú se despide',
      dialogo: [
        t(BETO, 'Ya pasó la medianoche y el libro de ayer sigue sin la última tienda.'),
        t(LULU, 'Seguro nadie ha abierto la app en esa sucursal. En cuanto abran, se genera.'),
        p(ANGEL, 'Yo entro a las 7 am. ¿Me toca avisar?'),
        t(BETO, 'No. Solo **inicia sesión** como siempre. El corte se hace en segundo plano y tú sigues vendiendo sin esperar nada.'),
      ],
      notas: [
        'Cada sucursal debe tener la **app actualizada** para generar el corte con el formato nuevo. Si te aparece el aviso de actualización pendiente, acéptalo.',
      ],
    },
    {
      id: 'imprimir',
      titulo: '11. Imprimir y ver en qué se gastó',
      cuerpo: [
        '**Imprimir:** el botón saca el reporte de la **tienda y periodo** que estás viendo, con el resumen, el día por día y las cajas de cada corte.',
        '**¿En qué se gastó en el periodo?:** al final de la página, cada **categoría** con su monto y el **% de los gastos**, y una barra para compararlas.',
        'Úsalo para detectar **dónde se va el dinero**: si «Gastos operativos» sube de una semana a otra, abre los días de esa semana y revisa las **subcategorías**.',
        'Si ves un aviso de que hay movimientos **fuera del periodo consultado**, significa que algún gasto o ingreso tiene fecha de otro periodo; no se suma aquí.',
      ],
      dialogo: [
        t(LULU, 'Esta semana «Gastos operativos» pasó de 8% a 25%.'),
        t(BETO, 'Abre los días y mira las subcategorías: renta, limpieza, artículos de limpieza… alguna creció.'),
        p(CHISPITA, 'Y si fue una compra a proveedor, ¡ahí estoy yo!'),
      ],
    },
    {
      id: 'revisar',
      titulo: '12. Si algo no cuadra: revisa en este orden',
      cuerpo: [
        '**1. ¿Es hoy?** Hoy todavía no hay corte general. Lo que ves es parcial; compara contra la venta en vivo y espera a mañana.',
        '**2. Caja chica del corte:** ¿**caja anterior + venta en efectivo − gastos** da lo mismo que el ticket? Si el libro marca «revisa este corte», el problema está en ese corte.',
        '**3. Gastos del día:** abre SALIDAS y busca duplicados, faltantes de más o conceptos mal puestos (categoría equivocada).',
        '**4. Tarjeta:** si PCT VIRTUAL es muy alto, el cajero capturó más tarjeta que la registrada en el POS. Pregunta qué cobros se hicieron fuera del POS.',
        '**5. Periodo correcto:** confirma que estás en la semana, el mes o el rango que quieres y que la **tienda** es la correcta.',
        '**6. ¿Falta una tienda?** Puede que su corte aún no se genere (sección 10). Pide que abran la app en esa sucursal o actualiza el libro.',
      ],
      dialogo: [
        t(LULU, 'Una tienda dice −$568 el jueves. ¿Qué reviso primero?'),
        t(BETO, '¿Fue hoy? Si fue hoy, es parcial. Si no, abre el día: ¿qué gasto es grande? ¿está en la categoría correcta?'),
        t(LULU, 'Tenía una compra de $2,300 de refrescos.'),
        p(CHISPITA, '¡Esa fui yo! Pero está bien: el día sale negativo porque la compra se pagó de caja.'),
        t(BETO, 'Exacto. Negativo **no** quiere decir error: quiere decir **salió más de lo que entró ese día**.'),
      ],
    },
    {
      id: 'tarjeta-bolsillo',
      titulo: '13. Tarjeta de bolsillo',
      cuerpo: [
        '**1.** Contabilidad → **Libro diario** → elige **tienda** y **Ver por** (semana sáb–vie, mes, año o rango).',
        '**2.** **Entró** = venta en efectivo (venta − tarjeta) + otros ingresos. **Salió** = gastos del corte (incluye faltantes y créditos cobrados).',
        '**3.** **Resultado** = Entró − Salió. **Acumulado** = suma desde el primer día del periodo.',
        '**4.** **Caja chica** = caja anterior + venta en efectivo − gastos = caja del ticket.',
        '**5.** **PCT ABA** = tarjeta que ya está en el POS. **PCT VIRTUAL** = tarjeta del corte − PCT ABA.',
        '**6.** **Venta POS hoy (en vivo)**, **Gastos sin corte** y **Otros egresos de IE** son informativos: **no** cambian el Resultado.',
        '**7.** Si no cuadra: ¿es hoy? → caja chica → gastos → tarjeta → periodo → ¿falta el corte de una tienda?',
        '**Frase:** *el libro es de consulta: si algo está mal, se corrige en el corte o en IE.*',
      ],
    },
    {
      id: 'quiz',
      titulo: '14. Evaluación final (Beto y Lulú te califican)',
      cuerpo: [
        'Responde las 14 preguntas. Se aprueba con **70% o más** (10 aciertos). Si no, repasa las secciones 3 a 12 y vuelve a intentarlo.',
      ],
      imagen: `${IMG}/07-graduacion.jpg`,
      imagenAlt: 'Beto entrega un diploma a Lulú con birrete mientras Ángel y Chispita celebran con un trofeo y confeti',
      quiz: [
        {
          id: 'q1',
          pregunta: '¿Cómo se calcula «Entró» en el Libro diario?',
          opciones: [
            'Venta en efectivo (venta total menos tarjeta) más otros ingresos capturados',
            'Venta total incluyendo tarjeta',
            'Solo los ingresos capturados a mano',
            'Venta total menos gastos',
          ],
          correcta: 0,
          explicacion: 'La tarjeta no entra a la caja de efectivo; Entró es la venta en efectivo más los otros ingresos.',
        },
        {
          id: 'q2',
          pregunta: 'Un crédito cobrado en el turno aparece en el libro como…',
          opciones: ['Ingreso (Entró)', 'Egreso (Salió)', 'PCT VIRTUAL', 'No aparece'],
          correcta: 1,
          explicacion: 'Los créditos cobrados cuentan como egreso, no como ingreso.',
        },
        {
          id: 'q3',
          pregunta: '¿Cómo inicia y termina una semana en el Libro diario?',
          opciones: ['Lunes a domingo', 'Domingo a sábado', 'Sábado a viernes', 'Viernes a jueves'],
          correcta: 2,
          explicacion: 'La semana es de sábado a viernes, igual que la nómina.',
        },
        {
          id: 'q4',
          pregunta: 'Quieres ver noviembre completo pero empezando en sábado. ¿Qué haces?',
          opciones: [
            'Eliges «Año»',
            'Eliges «Mes», noviembre, y marcas «Empezar en el sábado de la semana»',
            'Eliges «Semana» cuatro veces',
            'No se puede',
          ],
          correcta: 1,
          explicacion: 'La casilla extiende el mes para que empiece en sábado y termine en viernes.',
        },
        {
          id: 'q5',
          pregunta: 'El día tuvo Entró $2,000 y Salió $350. ¿Cuál es el Resultado del día?',
          opciones: ['$2,350', '$1,650', '$350', '$2,000'],
          correcta: 1,
          explicacion: 'Resultado = Entró − Salió = 2,000 − 350 = 1,650.',
        },
        {
          id: 'q6',
          pregunta: 'Caja anterior $500, venta en efectivo $1,800 y gastos $350. ¿Cuánto debe marcar la caja al cerrar?',
          opciones: ['$1,450', '$1,950', '$2,650', '$2,300'],
          correcta: 1,
          explicacion: '500 + 1,800 − 350 = 1,950. Debe ser igual al ticket del corte.',
        },
        {
          id: 'q7',
          pregunta: 'El libro marca en rojo «(calculado $X, revisa este corte)». ¿Qué significa?',
          opciones: [
            'Que el libro tiene un error y hay que borrarlo',
            'Que la caja guardada en el corte no coincide con la suma caja anterior + venta efectivo − gastos',
            'Que ya se hizo el corte general',
            'Que la tienda no vendió',
          ],
          correcta: 1,
          explicacion: 'Es una alerta de que ese corte guardó una caja distinta a la calculada; se revisa en el corte, no en el libro.',
        },
        {
          id: 'q8',
          pregunta: 'El corte dice tarjeta $700 y el POS tiene $500 con tarjeta. ¿Cuánto es PCT VIRTUAL?',
          opciones: ['$0', '$200', '$500', '$700'],
          correcta: 1,
          explicacion: 'PCT ABA = lo del POS ($500); PCT VIRTUAL = la diferencia ($700 − $500 = $200).',
        },
        {
          id: 'q9',
          pregunta: '¿La columna «Venta POS hoy (en vivo)» se suma al Resultado?',
          opciones: [
            'Sí, siempre',
            'Solo si el día ya terminó',
            'No: es informativa; el libro usa la venta del corte general de medianoche',
            'Solo en la vista de una tienda',
          ],
          correcta: 2,
          explicacion: 'La venta en vivo no se suma. Al pasar la medianoche el día entra por su corte general.',
        },
        {
          id: 'q10',
          pregunta: 'Son las 8 pm. Ventas dice $1,500 y la venta en vivo $1,800. ¿Cuál es la explicación más probable?',
          opciones: [
            'El libro está mal',
            'Hay turnos que todavía no cierran: Ventas solo trae lo ya cerrado',
            'El POS duplicó ventas',
            'La venta en vivo ya incluye la de mañana',
          ],
          correcta: 1,
          explicacion: 'La venta en vivo es de todo el día; el libro cerrado solo trae cortes ya generados.',
        },
        {
          id: 'q11',
          pregunta: '¿Qué son los «Gastos sin corte»?',
          opciones: [
            'Ventas que faltan por cobrar',
            'Gastos ya capturados que aún no entran al corte general; son egresos, no ventas',
            'Gastos cancelados',
            'El faltante del cajero',
          ],
          correcta: 1,
          explicacion: 'Son egresos ya capturados que pasan a Salió cuando se genera el corte; no cuentan en el resultado antes.',
        },
        {
          id: 'q12',
          pregunta: '¿Qué folio lleva el corte general de medianoche y dónde se imprime su recibo?',
          opciones: [
            'AB-00001, en la pantalla de ventas',
            'CGA-00001, con «Imprimir recibo» en el historial de cierres de Corte Abarrotes',
            'CGA-00001, en el Libro diario',
            'No lleva folio',
          ],
          correcta: 1,
          explicacion: 'El corte general usa folios CGA consecutivos por tienda y su recibo se imprime desde el historial de cierres.',
        },
        {
          id: 'q13',
          pregunta: '¿Cuándo se genera el corte general de ayer?',
          opciones: [
            'A las 12:00 exactas por un proceso del servidor',
            'La primera vez que alguien abre la app (o el libro) después de medianoche',
            'Solo cuando el administrador lo pide',
            'Cuando el cajero cierra su turno',
          ],
          correcta: 1,
          explicacion: 'No hay proceso en servidor: se genera en segundo plano al abrir la app o el libro después de medianoche.',
        },
        {
          id: 'q14',
          pregunta: 'Ves un error en un gasto dentro del libro. ¿Dónde se corrige?',
          opciones: [
            'En el mismo libro, tocando el gasto',
            'En el módulo donde se registró (Corte Abarrotes o IE); el libro es solo de consulta',
            'No se puede corregir',
            'Borrando la tienda',
          ],
          correcta: 1,
          explicacion: 'El libro no captura ni edita: se corrige en el corte o en IE y el libro se actualiza.',
        },
      ],
    },
    {
      id: 'frase',
      titulo: 'La frase para recordar',
      cuerpo: [
        'El libro es de **consulta**: entró − salió = resultado, la caja cuadra con el ticket, y lo «en vivo» no se suma.',
        'Cuando algo no cuadra: **¿es hoy? → caja chica → gastos → tarjeta → periodo → ¿falta un corte?**',
      ],
    },
  ],
};

/**
 * Hoja de práctica: el alumno calcula Entró, Resultado, caja al cerrar y PCT ABA / PCT VIRTUAL.
 * `tarjeta` = tarjeta capturada en el corte; `tarjetaPos` = tarjeta registrada en las ventas del POS.
 */
export const PRACTICAS = [
  { producto: 'Tienda A · día normal', nota: 'Tarjeta registrada completa en el POS', venta: 3000, tarjeta: 800, tarjetaPos: 800, gastos: 500, cajaAnterior: 400 },
  { producto: 'Tienda B · todo con tarjeta', nota: 'Día de pagos con tarjeta; hay gastos', venta: 1200, tarjeta: 1200, tarjetaPos: 1000, gastos: 300, cajaAnterior: 250 },
  { producto: 'Tienda C · tarjeta con servicios', nota: 'Parte de la tarjeta no está en el POS', venta: 2500, tarjeta: 700, tarjetaPos: 500, gastos: 1000, cajaAnterior: 300 },
  { producto: 'Tienda D · POS con más tarjeta', nota: 'El POS registró más tarjeta que el corte', venta: 2000, tarjeta: 300, tarjetaPos: 400, gastos: 0, cajaAnterior: 150 },
];

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function resolverPractica(c) {
  const entro = r2(c.venta - c.tarjeta);
  const resultado = r2(entro - c.gastos);
  const cajaCierre = r2(c.cajaAnterior + entro - c.gastos);
  const pctAba = r2(Math.min(c.tarjeta, c.tarjetaPos));
  const pctVirtual = r2(c.tarjeta - pctAba);
  return { entro, resultado, cajaCierre, pctAba, pctVirtual };
}
