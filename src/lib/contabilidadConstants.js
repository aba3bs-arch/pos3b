export const AREAS_CONTABILIDAD = ['virtual', 'abarrotes', 'garage'];

export const PAGADORES_NOMINA = ['virtual', 'abarrotes', 'garage', 'ambos'];

export const ETIQUETA_AREA = {
  virtual: 'Virtual',
  abarrotes: 'Abarrotes',
  garage: 'Garage',
  ambos: 'Abarrotes y Virtual',
};

/** Únicos beneficiarios permitidos para vales. */
export const BENEFICIARIOS_VALES = [
  { id: 'luis-enrique', nombre: 'Luis Enrique', area: 'abarrotes' },
  { id: 'misael', nombre: 'Misael', area: 'virtual' },
  { id: 'gonzalo', nombre: 'Gonzalo', area: 'virtual' },
];

export const CATEGORIAS_VALE = [
  { id: 'consumo', label: 'Consumo / personal', descuentaNomina: true },
  { id: 'gasolina', label: 'Gasolina', descuentaNomina: false },
  { id: 'herramienta', label: 'Herramienta', descuentaNomina: false },
  { id: 'accesorios', label: 'Accesorios', descuentaNomina: false },
];

export const MONTO_PRESTAMO_REQUIERE_SOCIO = 1000;
export const CUOTA_SEMANAL_MINIMA = 500;

/** Socios que autorizan préstamos mayores a $1,000 (PIN en usuarios). */
export const SOCIOS_APROBADORES_PRESTAMO = [
  { id: 'antonio', etiqueta: 'Antonio', patrones: ['antonio'] },
  { id: 'francisco', etiqueta: 'Francisco', patrones: ['francisco'] },
  { id: 'jose-luis', etiqueta: 'José Luis', patrones: ['jose luis', 'josé luis', 'jose luis'] },
];

export const ESTADOS_VALE_APROBADO = new Set(['aprobado']);
export const ESTADOS_PRESTAMO_ACTIVO = new Set(['activo']);
export const ESTADOS_PRESTAMO_PENDIENTE = new Set(['pendiente_admin', 'pendiente_socio']);

export function beneficiarioValePorId(id) {
  return BENEFICIARIOS_VALES.find((b) => b.id === id) || null;
}

export function beneficiarioValePermitido(nombre, area) {
  const n = String(nombre || '').trim().toLowerCase();
  return BENEFICIARIOS_VALES.some((b) => b.nombre.toLowerCase() === n && b.area === area);
}

export function categoriaValePorId(id) {
  return CATEGORIAS_VALE.find((c) => c.id === id) || CATEGORIAS_VALE[0];
}

export function valeDescuentaNomina(categoria) {
  return categoriaValePorId(categoria).descuentaNomina;
}

export function etiquetaCategoriaVale(categoria) {
  return categoriaValePorId(categoria).label;
}

/** Vales indirectos: antes de las 9:00 se liberan con firma; después requieren admin. */
export function valeRequiereAutorizacionAdmin(fecha = new Date()) {
  return fecha.getHours() >= 9;
}

export const HORA_LIMITE_VALE = 9;

export function cuotaSemanalPrestamo(saldo, cuotaPropuesta) {
  const s = Math.max(0, Number(saldo) || 0);
  if (s <= 0) return 0;
  const prop = Number(cuotaPropuesta);
  if (prop >= CUOTA_SEMANAL_MINIMA) return Math.min(s, prop);
  if (s < CUOTA_SEMANAL_MINIMA) return s;
  return CUOTA_SEMANAL_MINIMA;
}

export function prestamoRequiereSocio(monto) {
  return (Number(monto) || 0) > MONTO_PRESTAMO_REQUIERE_SOCIO;
}

export function esSocioAprobadorPrestamo(nombre) {
  const n = String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return SOCIOS_APROBADORES_PRESTAMO.some((s) => s.patrones.some((p) => n.includes(p.replace(/í/g, 'i')) || p.includes(n)));
}

export function valePuedeImprimir(vale) {
  if (!vale) return false;
  const est = vale.estado_aprobacion || 'aprobado';
  if (est === 'cancelado' || est === 'rechazado') return false;
  return ESTADOS_VALE_APROBADO.has(est);
}

export function valePuedeCancelar(vale) {
  if (!vale) return false;
  const est = vale.estado_aprobacion || 'aprobado';
  return est === 'pendiente_admin' || est === 'aprobado';
}

export function prestamoPuedeImprimir(p) {
  if (!p) return false;
  return ESTADOS_PRESTAMO_ACTIVO.has(p.estado);
}

export function etiquetaEstadoVale(v) {
  const e = v?.estado_aprobacion || 'aprobado';
  if (e === 'pendiente_admin') return 'Pendiente admin';
  if (e === 'rechazado') return 'Rechazado';
  if (e === 'cancelado') return 'Cancelado';
  return 'Aprobado';
}

export function etiquetaEstadoPrestamo(p) {
  const e = p?.estado;
  if (e === 'pendiente_admin') return 'Pendiente admin';
  if (e === 'pendiente_socio') return 'Pendiente socio (+$1,000)';
  if (e === 'rechazado') return 'Rechazado';
  if (e === 'liquidado') return 'Liquidado';
  if (e === 'activo') return 'Activo';
  return e || '—';
}
