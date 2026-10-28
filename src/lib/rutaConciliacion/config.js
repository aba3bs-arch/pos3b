export const TOLERANCIA_MXN = 0.01;

/** Mientras no se cumpla la ventana, lo pendiente se muestra "en proceso" y no genera alerta. */
export const VENTANAS_GRACIA_HORAS = {
  recepcion: 24,
  transito: 48,
};
export const DIAS_CREDITO_VENCIDO = 15;

export const SEVERIDADES = ['critica', 'alta', 'media', 'baja'];
export const ORDEN_SEVERIDAD = { critica: 0, alta: 1, media: 2, baja: 3 };

export const ESTADOS_ALERTA = ['abierta', 'en_revision', 'justificada', 'resuelta', 'auto_resuelta'];
export const ESTADOS_ACTIVOS = ['abierta', 'en_revision'];

export const TIPO_NOTIFICACION_CONCILIACION = 'ruta_conciliacion';

export const CONTROLES = {
  C0: { nombre: 'Diferencia sin clasificar', severidad: 'media' },
  C1: { nombre: 'Efectivo vendido contra efectivo en tránsito', severidad: 'alta', unidad: 'MXN' },
  C2: { nombre: 'Efectivo vendido contra gasto de Abarrotes', severidad: 'critica', unidad: 'MXN' },
  C4: { nombre: 'Registros duplicados', severidad: 'media' },
  C5: { nombre: 'Crédito vendido contra cargos', severidad: 'critica', unidad: 'MXN' },
  C6: { nombre: 'Cobro de crédito contra gasto de Abarrotes', severidad: 'critica', unidad: 'MXN' },
  C7: { nombre: 'Cobro de crédito contra efectivo en tránsito', severidad: 'alta', unidad: 'MXN' },
  C9: { nombre: 'Mercancía vendida contra ingresada', severidad: 'alta', unidad: 'pzas' },
  C10: { nombre: 'Recepción de pedido', severidad: 'media' },
  C13: { nombre: 'Desglose de pago', severidad: 'alta' },
};

/** Texto emitido por consolidarRuta → control de la conciliación. */
export const CONTROL_POR_ALERTA = {
  'Pago sin desglose verificable': 'C13',
  'El desglose de pago no coincide con la venta': 'C13',
  'Crédito registrado distinto al vendido': 'C5',
  'Revisar múltiples cargos de crédito': 'C4',
  'Efectivo en tránsito distinto al vendido': 'C1',
  'Cobros de crédito sin efectivo en tránsito coincidente': 'C7',
  'Revisar múltiples registros de efectivo': 'C4',
  'Sin pedido de recepción enlazado': 'C10',
  'Múltiples pedidos enlazados': 'C4',
  'Recepción pendiente': 'C10',
  'Gasto por cobro de crédito distinto al crédito cobrado': 'C6',
  'Gasto de tienda distinto al efectivo de la venta': 'C2',
  'Revisar múltiples gastos enlazados': 'C4',
  'Sin ingreso de inventario comprobado': 'C9',
  'Mercancía vendida distinta a la ingresada': 'C9',
};

/** Solo dependen de que el pedido ya se haya recibido; dentro de la ventana no son alerta. */
export const ALERTAS_POSTERIORES_A_RECEPCION = new Set([
  'Recepción pendiente',
  'Gasto de tienda distinto al efectivo de la venta',
  'Sin ingreso de inventario comprobado',
  'Mercancía vendida distinta a la ingresada',
]);
