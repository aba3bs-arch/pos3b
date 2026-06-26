export const AREAS_CONTABILIDAD = ['virtual', 'abarrotes', 'garage'];

export const ETIQUETA_AREA = {
  virtual: 'Virtual',
  abarrotes: 'Abarrotes',
  garage: 'Garage',
};

/** Únicos beneficiarios permitidos para vales. */
export const BENEFICIARIOS_VALES = [
  { id: 'luis-enrique', nombre: 'Luis Enrique', area: 'abarrotes' },
  { id: 'misael', nombre: 'Misael', area: 'virtual' },
  { id: 'gonzalo', nombre: 'Gonzalo', area: 'virtual' },
];

export function beneficiarioValePorId(id) {
  return BENEFICIARIOS_VALES.find((b) => b.id === id) || null;
}

export function beneficiarioValePermitido(nombre, area) {
  const n = String(nombre || '').trim().toLowerCase();
  return BENEFICIARIOS_VALES.some((b) => b.nombre.toLowerCase() === n && b.area === area);
}

/** Vales indirectos: libres hasta las 9:00; después requieren administrador. */
export function valeRequiereAutorizacionAdmin(fecha = new Date()) {
  return fecha.getHours() >= 9;
}

export const HORA_LIMITE_VALE = 9;
