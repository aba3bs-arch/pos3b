/** Cómo entra mercancía de este proveedor al inventario. */
export const MODOS_COMPRA_PROVEEDOR = [
  { id: 'pedido', label: 'Pedido + recepción', hint: 'Generas pedido y recibes después (mayorista).' },
  { id: 'directa', label: 'Entrega directa', hint: 'Preventa / repartidor: entra al inventario al registrar la entrega.' },
];

export function normalizarModoCompraProveedor(raw) {
  const v = String(raw || 'pedido').trim().toLowerCase();
  return v === 'directa' ? 'directa' : 'pedido';
}

export function etiquetaModoCompraProveedor(raw) {
  return MODOS_COMPRA_PROVEEDOR.find((m) => m.id === normalizarModoCompraProveedor(raw))?.label || 'Pedido + recepción';
}

export function proveedorUsaEntregaDirecta(proveedor) {
  return normalizarModoCompraProveedor(proveedor?.modo_compra) === 'directa';
}
