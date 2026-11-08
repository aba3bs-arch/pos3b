/**
 * Guías del bot de Soporte para los módulos de oficina, contabilidad y ruta.
 * Cada guía declara en `modulos` qué módulo necesita; si el usuario no lo tiene en
 * Privilegios, el bot no le da los pasos. Las claves van sin acentos.
 */
export const GUIAS_MODULOS = [
  {
    id: 'usuarios_alta',
    tema: 'dar de alta un empleado y su PIN',
    modulos: ['Usuarios'],
    claves: [
      ['usuarios', 4], ['alta empleado', 7], ['dar de alta', 6], ['anadir empleado', 7], ['crear usuario', 7], ['nuevo cajero', 6], ['nuevo empleado', 6],
      ['cambiar pin', 6], ['ver pin', 5], ['equipo registrado', 7], ['asignar turno', 6],
    ],
    texto: 'Menú «Usuarios» (solo Administrador). En «Cómo dar de alta un empleado» llena nombre, PIN, tipo, sucursal, rol, «Nómina pagada por» y turno, y pulsa «Añadir empleado». En «Equipo registrado» cambias sucursal, rol o turno en la tabla, y con «Editar», «Cambiar PIN» o «Ver PIN» modificas al empleado. Máximo 2 empleados de tienda por sucursal.',
  },
  {
    id: 'usuarios_baja',
    tema: 'baja, reingreso y cambio de tienda de un empleado',
    modulos: ['Usuarios', 'RH ABA3B'],
    claves: [
      ['dar de baja', 7], ['baja de empleado', 7], ['baja empleado', 7], ['confirmar baja', 7], ['reingresar', 5], ['reingreso', 5], ['reingresar alta', 7],
      ['cambiar de tienda', 7], ['cambio de tienda', 7], ['traslado', 4], ['dados de baja', 7], ['recontratable', 6], ['liberar equipo', 6],
    ],
    texto: 'Baja: en «Usuarios» usa «Cómo dar de baja un empleado» o el botón «Dar de baja» de «Equipo registrado»; captura motivo, fecha y si «Puede reingresar», y «Confirmar baja». No borres el usuario: así conservas el historial. Reingreso: «Cómo reingresar un empleado» → «Reingresar alta» (si no es recontratable pide el PIN del administrador principal). Cambio de tienda: «Cambiar de tienda». El Gerente también lo hace en «RH ABA3B».',
  },
  {
    id: 'rh_aba3b',
    tema: 'expediente de empleados (RH ABA3B)',
    modulos: ['RH ABA3B'],
    claves: [
      ['rh aba3b', 7], ['rh', 3], ['recursos humanos', 6], ['alta de empleado', 6], ['registrar alta', 6], ['inactivos', 5], ['perfil del empleado', 6],
      ['crear acceso pos', 7], ['expediente', 5],
    ],
    texto: 'Contabilidad → «RH ABA3B» (Administrador o Gerente). Alta: «+ Alta de empleado» → «Registrar alta». Baja: «Dar de baja» o «Perfil» → «Confirmar baja». Reingreso: pestaña «Inactivos / bajas» → «Reingresar alta». Si el empleado no tiene PIN: «Perfil» → «Crear acceso POS». El PIN para entrar al POS también se crea en «Usuarios» (Administrador).',
  },
  {
    id: 'contratacion',
    tema: 'vacantes y postulaciones',
    modulos: ['Contratación'],
    claves: [
      ['contratacion', 5], ['vacante', 6], ['vacantes', 6], ['postulacion', 6], ['postulaciones', 6], ['aspirante', 5], ['candidato', 5], ['bolsa de trabajo', 7],
      ['copiar enlace', 6], ['marcar entrevista', 7], ['guardar seguimiento', 7],
    ],
    texto: 'Contabilidad → «Contratación» (Administrador). Marca las tiendas con vacante y usa «Copiar enlace» para compartir el portal de aspirantes. Abre una postulación y usa «Guardar seguimiento», «Marcar entrevista», «Aceptar» o «Rechazar». «Dar de alta en RH ABA3B» precarga el expediente y «Redirigir» la pasa a otro administrador.',
  },
  {
    id: 'configuracion',
    tema: 'configuración: tipo de cambio y privilegios',
    modulos: ['Configuracion'],
    claves: [
      ['configuracion', 5], ['tipo de cambio', 8], ['dar acceso a un modulo', 9], ['doy acceso', 7], ['darle acceso', 7], ['acceso a un modulo', 8], ['privilegios', 6], ['por rol', 5], ['por usuario', 5], ['modulos visibles', 7], ['dar acceso a un modulo', 8],
      ['quitar acceso', 6], ['permisos del menu', 7], ['que modulos ve', 7],
    ],
    texto: 'Menú «Configuracion». En «Operación» captura «Tipo de cambio (1 USD → MXN)» y «Guardar tipo de cambio». En «Privilegios por rol o usuario» elige «Por rol» o «Por usuario», marca los módulos y acciones que verá y se sincroniza al marcar. Cuando un empleado no ve un módulo, aquí se le activa.',
  },
  {
    id: 'configuracion_sistema',
    tema: 'turnos de caja, métodos de pago, periféricos, impresión y tiendas',
    modulos: ['Configuracion'],
    claves: [
      ['turnos de caja', 7], ['empleados por turno', 7], ['guardar y sincronizar', 7], ['metodos de pago', 7], ['agregar metodo', 6], ['perifericos', 5],
      ['lector', 3], ['impresion de documentos', 7], ['ancho de papel', 6], ['catalogo de tiendas', 7], ['agregar tienda', 7], ['tolerancia de entrada', 6],
    ],
    texto: 'Menú «Configuracion». «Turnos de caja»: elige tienda, ajusta horarios y tolerancia, «Empleados por turno» (solo el Administrador asigna) y «Guardar y sincronizar». «Métodos de pago»: activa o «Agregar método». «Periféricos»: lector y báscula. «Impresión de documentos»: ancho de papel y «Guardar impresión». «Catálogo de tiendas»: «Agregar tienda».',
  },
  {
    id: 'multitienda',
    tema: 'inventario multitienda: entradas y traspasos desde el almacén central',
    modulos: ['Configuracion'],
    claves: [
      ['inventario multitienda', 8], ['almacen central', 6], ['cedis central', 7], ['entrada multiple', 6], ['stock en todas las tiendas', 8], ['tienda donde operar', 7],
      ['aplicar traspaso', 6], ['distribuir a tiendas', 7],
    ],
    texto: '«Configuracion» → «Inventario multitienda» → «Entradas, retiros y traspasos». En «Tienda donde operar» elige la tienda o el almacén. «Entrada múltiple»: agrega productos y «Aplicar +… pieza(s)». «Traspaso» → «CEDIS central → Tienda»: elige la tienda destino, agrega líneas y «Aplicar traspaso». «Stock en todas las tiendas» muestra las existencias de cada una.',
  },
  {
    id: 'auditoria',
    tema: 'auditoría y rastreo de uso',
    modulos: ['Auditoría'],
    claves: [
      ['auditoria', 5], ['rastreo', 5], ['bitacora', 5], ['solo alertas', 7], ['eventos criticos', 7], ['quien entro', 7], ['que modulo abrio', 7],
      ['preguntas bloqueadas', 8], ['intentos de seguridad', 8],
    ],
    texto: 'Menú «Auditoría» (solo Administrador). Revisa los KPIs «Críticos» y «Alertas». Filtra por «Desde», «Hasta», «Tipo» y «Sucursal», marca «Solo alertas» y pulsa «Actualizar». Toca un evento para ver el detalle (módulo, dispositivo, PIN de administrador o la pregunta bloqueada en Soporte). Si sale un aviso de SQL, falta la tabla en Supabase.',
  },
  {
    id: 'ruta_carga',
    tema: 'cargar el camión y contar mercancía en ruta',
    modulos: ['Venta en Ruta'],
    claves: [
      ['carga de camion', 8], ['cargar camion', 8], ['carga camion', 8], ['preinventario de ruta', 7], ['preinventario ruta', 7], ['camion', 4], ['sumar a carga', 6],
      ['cerrar carga', 6], ['todo el camion', 6], ['inventario del camion', 7], ['contar mercancia del camion', 8], ['agregar recolector', 6],
    ],
    texto: 'Administrador (con el privilegio «Carga de camión»): «Venta en Ruta» → «Carga de camión». Elige el recolector o repartidor, escanea o captura el código, «Agregar», y luego «Abrir carga y descontar CEDIS» o «Sumar a carga y descontar CEDIS». Lo que sobre se regresa con «Devolver» o «Quitar», o con «Cerrar carga / limpiar historial». El repartidor cuenta con «Preinventario» → «Todo el camión» → «Actualizar». Los recolectores se dan de alta en Contabilidad → «Panel RT» → «Recolectores».',
  },
  {
    id: 'ruta_venta',
    tema: 'vender en ruta y cobrar (efectivo, crédito o mixto)',
    modulos: ['Venta en Ruta'],
    claves: [
      ['pos venta en ruta', 8], ['venta en ruta', 4], ['vender en ruta', 7], ['vendo en ruta', 8], ['vender ruta', 6], ['vender en el camion', 7], ['login vendedor', 7], ['efectivo credito mixto', 7],
      ['creditos por pagar', 7], ['solicitar cobro', 5], ['cobro de servicios', 7], ['tienda destino', 6], ['repartidor', 4],
    ],
    texto: 'Repartidor: «Venta en Ruta» → «POS venta en ruta» → «Login vendedor · POS» (elige vendedor, PIN y «Entrar»). Agrega productos y pulsa «Cobrar…»; elige «Tienda destino de la venta», «Efectivo», «Crédito» o «Mixto» y «Confirmar». Un crédito lo cobra el cajero en «Créditos por pagar» (o «Cobranza») con «Abrir con PIN» y «Solicitar cobro», y el repartidor lo aprueba con su PIN. Servicios: «Cobro servicios» → «Solicitar cobro al cajero».',
  },
  {
    id: 'ruta_cancelacion',
    tema: 'cancelar o devolver una venta de ruta',
    modulos: ['Venta en Ruta'],
    claves: [
      ['cancelacion devolucion', 8], ['cancelar venta de ruta', 8], ['cancelo venta ruta', 9], ['cancelar venta ruta', 9], ['cancelo ticket ruta', 9], ['anular venta de ruta', 8], ['solicitar cancelacion', 7], ['aprobar cancelacion', 7],
      ['pin admin para aprobar', 8], ['venta a cancelar', 7],
    ],
    texto: 'Repartidor, cajero o supervisor: «Venta en Ruta» → «Cancelación / Devolución». En «Venta a cancelar» elige el folio, escribe el «Motivo» y pulsa «Solicitar cancelación (PIN admin)». El administrador o gerente la resuelve en «Pendientes de aprobación»: captura el PIN y pulsa «Aprobar» o «Rechazar». Al aprobar se revierten camión, crédito o efectivo y compras. «Ver tutorial» muestra el flujo.',
  },
  {
    id: 'ruta_gastos_corte',
    tema: 'gastos del recolector y corte de ruta',
    modulos: ['Venta en Ruta'],
    claves: [
      ['gastos de ruta', 8], ['gasto de ruta', 8], ['corte de ruta', 8], ['guardar e imprimir corte', 7], ['login recolector', 7], ['autenticar corte', 7],
      ['usuario repartidor a cortar', 8], ['liquidar carga', 7], ['rc ventaruta', 6], ['tomar foto', 5],
    ],
    texto: 'Gastos: «Venta en Ruta» → «Gastos» → «Login recolector · Gastos de ruta»; elige categoría, monto, «Tomar / subir foto» (obligatoria) y «Registrar gasto». Corte: «Corte de caja» → «Login administrador · Corte de caja» → «Autenticar corte»; elige «Usuario / repartidor a cortar» y la carga, captura «Efectivo contado» y «Guardar e imprimir corte». En la oficina, «Consultas» tiene las pestañas «Ventas», «Cargas» y «Cancelaciones».',
  },
  {
    id: 'panel_rt',
    tema: 'Panel RT: recolectores, servicios y reportes',
    modulos: ['Panel RT'],
    claves: [
      ['panel rt', 7], ['agregar recolector', 7], ['alta de recolector', 7], ['agregar servicio', 6], ['reporte por tienda', 7], ['liberar neto', 7], ['cuentas rt', 6],
      ['gastos del recolector', 7], ['eliminar registros', 6],
    ],
    texto: 'Contabilidad → «Panel RT» (Administrador). «Recolectores»: nombre, «PIN (4 dígitos)» y «Agregar recolector». «Servicios»: «Agregar servicio» (CFE u otros; el recolector los ve en «Cobro servicios»). «Reporte por tienda»: filtra el periodo e «Imprimir». «Gastos / liberar»: registra el gasto del recolector o «Liberar neto». «Cuentas RT» y «Eliminar registros» corrigen capturas. «← Subcomandos» regresa.',
  },
  {
    id: 'liquidacion_recolecciones',
    tema: 'liquidar el efectivo en tránsito de recolectores',
    modulos: ['Liquidación recolecciones'],
    claves: [
      ['liquidacion de recolecciones', 8], ['liquidacion recolecciones', 8], ['pendientes por liquidar', 8], ['sellar todo', 7], ['fecha de sellado', 7], ['efectivo en transito', 7],
      ['liquidar recolector', 7], ['rc servicios', 6], ['liquidaciones pasadas', 7],
    ],
    texto: 'Contabilidad → «Liquidación recolecciones». En «Pendientes por liquidar» elige al recolector, define la «Fecha de sellado», marca los movimientos de cada tienda y pulsa «Sellar [tienda]», o «Liquidar todo el efectivo en tránsito» → «Sellar todo». Los cobros de servicios van en la pestaña «RC Servicios». «Liquidaciones pasadas» muestra el historial.',
  },
  {
    id: 'credito_cartera',
    tema: 'consultar la cartera de crédito',
    modulos: ['Crédito'],
    claves: [
      ['saldos de credito', 7], ['cartera', 6], ['cartera por cobrar', 8], ['saldo de cliente', 7], ['saldo del cliente', 7], ['movimientos de credito', 7], ['quien me debe', 7],
      ['cuanto me deben', 7],
    ],
    texto: 'Contabilidad → «Crédito» es solo consulta: la tabla «Cliente / sucursal» muestra el «Saldo» y al tocar una fila ves sus «Movimientos» (tipo, monto, folio). Los pagos no se registran aquí: el cajero los cobra en «Cobranza» con «Abrir con PIN» y «Solicitar cobro», y el repartidor confirma con su PIN.',
  },
  {
    id: 'auto_fin',
    tema: 'Auto Fin: financiamientos y cuotas',
    modulos: ['Auto Fin'],
    claves: [
      ['auto fin', 7], ['autofin', 7], ['financiar', 6], ['financiamiento', 6], ['nuevo credito', 6], ['cuotas semanales', 7], ['cobrar cuota', 7], ['cancelar credito', 6],
      ['plan de cuotas', 7],
    ],
    texto: 'Contabilidad → «Auto Fin». Filtra por «Tipo» y «Estado» y usa «Ver» en un crédito. Alta: «+ Nuevo crédito» o «+ Financiar préstamo», captura beneficiario, monto y frecuencia, y «Crear crédito y generar cuotas». En el detalle: «Registrar pago» → elige la cuota → «Cobrar cuota». «Cancelar crédito» si aplica y «← Lista» para regresar.',
  },
  {
    id: 'clientes',
    tema: 'directorio de clientes',
    modulos: ['Clientes'],
    claves: [
      ['clientes', 4], ['nuevo cliente', 7], ['directorio de clientes', 8], ['editar cliente', 7], ['borrar cliente', 7], ['guardar cliente', 7], ['catalogo de clientes', 7],
    ],
    texto: 'Menú «Clientes». En «Nuevo cliente» (o «Editar cliente») captura Nombre, Teléfono, Email, RFC y Notas y pulsa «Guardar» (en edición, «Cancelar edición»). En «Directorio», «Editar» carga el formulario y «Borrar» elimina tras confirmar. No es lo mismo que «Socio 3B».',
  },
  {
    id: 'socio_3b',
    tema: 'Socio 3B: socios, cortes y moneda virtual',
    modulos: ['Socio 3B'],
    claves: [
      ['socio 3b', 7], ['socios', 5], ['crear socio', 7], ['acceso cliente', 7], ['pin de acceso', 6], ['moneda virtual', 7], ['inyectar moneda', 7], ['clientes maquinas', 7],
    ],
    texto: 'Contabilidad → «Socio 3B». «Agregar socio» → «Crear socio». Dentro del socio hay pestañas «Resumen», «Corte Virtual», «Corte Garage», «Moneda virtual» y «Acceso Cliente». En «Acceso Cliente» usa «Guardar PIN de acceso». En «Moneda virtual», «Inyectar y registrar en IE». El Administrador puede «Eliminar socio».',
  },
  {
    id: 'nomina',
    tema: 'nómina semanal',
    modulos: ['Nómina'],
    claves: [
      ['nomina', 5], ['sueldo', 4], ['sueldos', 4], ['pagar empleados', 7], ['pagar a los empleados', 7], ['cerrar nomina', 8], ['semana actual', 5], ['recibos', 4],
      ['deducciones', 5], ['editar nomina', 7], ['historial de nomina', 7], ['recalcular deducciones', 8],
    ],
    texto: 'Contabilidad → «Nómina». Define «Inicio (sábado)» y «Fin (viernes)» o pulsa «Semana actual». Elige el modo «Automático» o «Manual» y filtra por «Pagador» y «Empleados». Revisa la tabla y usa «Recalcular deducciones», «Recargar todo» o «Restaurar quitados». Cierra con «Cerrar nómina» e imprime con «Imprimir nómina» o «Recibos por empleado». Para corregir: «Editar última nómina» o «Editar» / «Eliminar» en «Historial».',
  },
  {
    id: 'tesoreria',
    tema: 'tesorería',
    modulos: ['Tesorería'],
    claves: [
      ['tesoreria', 6], ['fondo de servicios', 7], ['transferir a tesoreria', 8], ['egreso de tesoreria', 8], ['saldo tesoreria', 7], ['cuenta cheche', 6],
    ],
    texto: 'Contabilidad → «Tesorería». Revisa «Saldo Tesorería (Cheche)» y «Servicios (origen)». Para mover dinero usa «Transferir a Tesorería · Servicios → Cheche»: captura monto y notas y confirma con «Enviar a Tesorería (Cheche)». Para gastar usa «Egreso desde Tesorería» → «Registrar egreso». «Movimientos Tesorería» lista todo y «Ver tutorial» explica el flujo.',
  },
  {
    id: 'conciliaciones',
    tema: 'conciliaciones de Smoking y Venta en Ruta',
    modulos: ['Conciliaciones'],
    claves: [
      ['conciliaciones', 6], ['conciliar', 6], ['conciliacion', 6], ['sellar conciliacion', 8], ['diferencia por tienda', 7], ['donde esta la discrepancia', 8], ['smoking', 5],
      ['anular conciliacion', 8],
    ],
    texto: 'Contabilidad → «Conciliaciones». En la pestaña «Conciliar» elige el periodo, «Tienda», «Repartidor» y «Estatus cobro» y pulsa «Actualizar». Marca los movimientos de «Cobros y créditos» y de «Gastos Smoking / Venta en Ruta», revisa «Dónde está la discrepancia» y «Ver ticket», agrega notas y pulsa «Sellar conciliación». En «Historial» están las selladas (con «Anular»).',
  },
  {
    id: 'consolidacion',
    tema: 'consolidación de gastos por turno',
    modulos: ['Consolidación'],
    claves: [
      ['consolidacion', 6], ['gastos por turno', 8], ['gastos del turno', 7], ['por cierre', 5], ['exportar csv', 4], ['total gastos', 5],
    ],
    texto: 'Contabilidad → «Consolidación». Elige el «Área» (Virtual, Abarrotes o Garage), el rango de fechas y la tienda y pulsa «Actualizar». Verás «Total gastos» y por turno diurno y nocturno, con las vistas «Por turno», «Por cierre», «Por tienda» y «Detalle». «Exportar CSV» descarga el detalle.',
  },
  {
    id: 'compras_vs_inventario',
    tema: 'compras contra inventario (discrepancias)',
    modulos: ['Compras vs inventario'],
    claves: [
      ['compras vs inventario', 14], ['compras contra inventario', 14], ['descuadre', 6], ['descuadrada', 6], ['descuadradas', 6], ['gasto duplicado', 7], ['monto descuadrado', 8], ['ticket sin gasto', 7], ['discrepancias de compras', 8],
      ['panorama de discrepancias', 8],
    ],
    texto: 'Contabilidad → «Compras vs inventario». Elige el rango, la tienda y el «Estado» y pulsa «Actualizar». En «Panorama de discrepancias» ves tickets sin gasto, gastos duplicados, gastos sin ingreso y montos descuadrados. Usa las pestañas «Resumen», «Por tienda», «Discrepancias» y «Detalle», y «Exportar CSV» si lo necesitas.',
  },
  {
    id: 'revision_compras',
    tema: 'revisión de tickets de compra',
    modulos: ['Revisión de compras'],
    claves: [
      ['revision de compras', 8], ['revisar tickets de compras', 14], ['reviso tickets de compras', 14], ['revisar ticket', 6], ['revisar tickets', 6], ['marcar ok', 6], ['marcar con diferencias', 8], ['quitar revision', 7], ['cantidad ingresada', 7],
    ],
    texto: 'Contabilidad → «Revisión de compras». Filtra por rango, tienda y «Pendientes», «Con diferencias», «Revisados» o «Todos», y pulsa «Actualizar». Abre un folio y compara «Cant. ticket» contra «Cant. ingresada». Pulsa «Marcar OK» o «Marcar con diferencias»; «Quitar revisión» deshace la marca.',
  },
  {
    id: 'registro_gastos',
    tema: 'registro y aprobación de gastos',
    modulos: ['Registro de gastos'],
    claves: [
      ['registro de gastos', 5], ['aprobar gasto', 7], ['por aprobar', 7], ['mis gastos', 7], ['pago recibido', 7], ['agregar a mi lista', 8], ['rechazar gasto', 7],
      ['evidencia del gasto', 7],
    ],
    texto: 'Contabilidad → «Registro de gastos». En «Registrar gasto» elige tienda, monto, categoría, subcategoría, cuenta y descripción, adjunta la «Evidencia» y usa «Agregar a mi lista». Pestañas: «Mis gastos», «Por aprobar» (quien aprueba usa «Aprobar → IE» o «Rechazar») y «Mi espacio · pagos» («Pago recibido»). «Actualizar lista» refresca.',
  },
  {
    id: 'rc_virtual',
    tema: 'recibir recolecciones de Virtual, Garage y Abarrotes',
    modulos: ['RC Virtual', 'RC Garage', 'RC Abarrotes'],
    claves: [
      ['rc virtual', 7], ['rc garage', 7], ['rc abarrotes', 7], ['recibo recolecciones', 10], ['recibir recolecciones rc', 12], ['recibir recoleccion', 8], ['recibir recolecciones', 8], ['liquidar rc', 6], ['generar gasto', 5], ['pagare rc', 6],
    ],
    texto: 'Contabilidad → «RC Virtual», «RC Garage» o «RC Abarrotes». Expande al recolector, revisa con «Ver ticket», y pulsa «Recibir $…» para agrupar la recepción; por línea puedes «Liquidar» o «Eliminar». Los pagarés están en la pestaña «Pagaré»: «Ticket», «Ticket ×2» y «Recibir» cuando llega el efectivo en tránsito. El administrador usa «Generar gasto» → «Confirmar gasto».',
  },
  {
    id: 'ie_libros',
    tema: 'libros de ingresos y egresos (IE VIRTUAL e IE ABARROTES)',
    modulos: ['IE VIRTUAL', 'IE ABARROTES'],
    claves: [
      ['ie virtual', 7], ['ie abarrotes', 7], ['ingresos y egresos', 7], ['ingreso egreso', 6], ['nuevo ingreso', 7], ['nuevo egreso', 7], ['registrar ingreso', 7], ['registrar egreso', 7],
      ['inversion proveedor', 8], ['cuentas subcuentas', 7],
    ],
    texto: 'Contabilidad → «IE VIRTUAL» o «IE ABARROTES». Barra inferior: «Trans.» («Diario», «Calendario», «Mensual», «Total», «Nota»), «Estad.», «Cuentas» y «Más» («Cuentas / subcuentas», «Exportar»; en Abarrotes también «Inversión proveedor»). El administrador captura con los botones «＋I» y «＋E»: «Nuevo ingreso» → «Registrar ingreso», «Nuevo egreso» → «Registrar egreso».',
  },
  {
    id: 'archivo',
    tema: 'archivo de cortes y registros',
    modulos: ['Archivo'],
    claves: [
      ['archivo', 5], ['archivar', 6], ['archivar dias', 7], ['restaurar registro', 8], ['carpetas por tienda', 7], ['cortes archivados', 7], ['registros archivados', 7],
    ],
    texto: 'Contabilidad → «Archivo». Se organiza en carpetas «Tienda → Evento → Depto» o «Tienda → Depto → Evento»; «← Atrás» regresa. «Actualizar» recarga y el administrador usa «Archivar +N días» para mover lo vencido. Dentro de una carpeta, en «Registros», el administrador puede «Restaurar» un registro. Los cortes recientes siguen en Corte Abarrotes, Virtual y Garage.',
  },
  {
    id: 'evaluacion_operativa',
    tema: 'evaluación operativa de tiendas',
    modulos: ['Evaluación operativa'],
    claves: [
      ['evaluacion operativa', 8], ['evaluar tienda', 7], ['evaluar al encargado', 7], ['cerrar evaluacion', 8], ['nueva evaluacion', 8], ['otras preguntas al azar', 8], ['historial de evaluaciones', 8],
    ],
    texto: 'Menú «Evaluación operativa» → «Evaluar». Recorre los pasos «Datos», «Tickets», «Piso», «Preguntas» y «Resultado»: elige tienda, encargado y fecha, compara tickets, marca «Sí» o «No» en piso y califica las preguntas (0 a 4) o usa «Otras preguntas al azar». En «Resultado y firmas» pulsa «Guardar borrador» o «Cerrar evaluación». «Historial» lista las visitas y «+ Nueva evaluación» inicia otra.',
  },
  {
    id: 'resumen_operativo',
    tema: 'resumen operativo (panel ejecutivo)',
    modulos: ['Resumen operativo'],
    claves: [
      ['resumen operativo', 8], ['meta del mes', 7], ['guardar meta', 7], ['ganancia neta', 6], ['proyeccion de fin de mes', 8], ['composicion de egresos', 8], ['merma vs inventario', 8],
    ],
    texto: 'Menú «Resumen operativo». En «Filtros» elige tienda y «Periodo» y pulsa «Actualizar». En «Meta del mes» captura el monto y «Guardar meta» para ver acumulado y proyección. Abajo están «Proyección / ventas por tienda», «Composición de egresos», «Inventario operativo por tienda» y «Merma vs inventario (costo)».',
  },
  {
    id: 'estadisticas',
    tema: 'estadísticas de Abarrotes, Virtual y Garage',
    modulos: ['Estadísticas Abarrotes', 'Estadísticas Virtual', 'Estadísticas Garage'],
    claves: [
      ['estadisticas', 7], ['estadistica', 6], ['graficas de ventas', 7], ['trafico de clientes', 7], ['pareto', 5], ['periodo rapido', 6], ['ventas por turno', 6],
    ],
    texto: 'Menú «Estadísticas». Entra a «Abarrotes», «Virtual» o «Garage». Ajusta «Tienda», «Periodo rápido» y «Agrupar»; los indicadores se recargan solos. En cada tarjeta pulsa «Ver» para el detalle (ventas, tarjeta, gastos, utilidad, promedio; en Abarrotes también merma). Revisa las gráficas Pareto, de turnos y de gastos. En Abarrotes, la sección «Venta en ruta vs recolección» dice si la ruta deja ganancia y si salió más dinero (recolección en efectivo + pago con tarjeta) de lo que la tienda generó neto; su botón «Cómo entender este análisis» abre el tutorial. Debajo, «Venta en ruta · ingresos, créditos pendientes, entrega y camión» (con filtro de periodo propio) muestra cuánto ingresó la ruta, los créditos pendientes por antigüedad, si cada recolector entrega completo («Ver qué pasó») y el inventario del camión; su tutorial con personajes está en el módulo Tutorial. «← Estadísticas» regresa.',
  },
  {
    id: 'reporte_inventario',
    tema: 'reporte de inventario, faltante neto y gráficas',
    modulos: ['Reportes'],
    claves: [
      ['reporte de inventario', 8], ['faltante neto', 8], ['guardar para bono', 8], ['resultado de inventario', 8], ['graficas de inventario', 7], ['bonificacion', 5], ['faltante de inventario', 7],
    ],
    texto: 'Menú «Reportes» → «Inventario (auditoría)» → «Reporte de inventario». Filtra «Periodo», «Tienda» y «Departamento»; «Editar» corrige un conteo. En «Resultado de inventario (para bono)» elige la tienda, captura total, faltante y bonificación (se calcula el «Faltante neto») y pulsa «Guardar para bono»: así la nómina de esa semana lo descuenta. «Gráficas» compara tiendas.',
  },
  {
    id: 'incidencias_admin',
    tema: 'atender incidencias (administrador)',
    modulos: ['Incidencias'],
    claves: [
      ['por atender', 7], ['resolver incidencia', 8], ['ver todo el buzon', 8], ['depurar duplicados', 8], ['historial de incidencias', 8], ['redirigir incidencia', 8], ['atender incidencia', 8],
      ['bandeja de incidencias', 8],
    ],
    texto: 'Menú «Incidencias» (administrador): activa «Ver todo el buzón» y abre «Por atender». Pulsa «Atender», escribe notas y «Resolver» (o «En revisión»). «Redirigir» cambia al responsable. «Pendientes» atiende notificaciones y «Historial» muestra las cerradas. «Depurar duplicados» limpia reportes repetidos.',
  },
  {
    id: 'plan_horario',
    tema: 'plan horario: descansos y cubre turnos (administrador)',
    modulos: ['Checador'],
    claves: [
      ['fijar descansos', 9], ['fijo descansos', 9], ['descansos plan horario', 12], ['mover descanso', 8], ['cambiar descanso habitual', 8], ['guardar plan', 7], ['asignar ct', 7], ['elegir ct', 7], ['arrastrar descanso', 7],
    ],
    texto: 'Menú «Checador» → «Plan horario». Marca «DESCANSO» (clic o arrastre), pulsa «Fijar descansos» y «Guardar plan». Para moverlo usa «Mover descanso esta semana» o «Cambiar descanso habitual». En una celda de descanso elige el color y «— Elegir CT —» (los CT salen en verde). El cajero puede «Solicitar este CT». «◀ Semana», «Hoy» y «Recargar» navegan el calendario.',
  },
];
