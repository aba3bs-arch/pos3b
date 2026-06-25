export const AREAS_CONTABILIDAD = ['virtual', 'abarrotes', 'garage'];

export const ETIQUETA_AREA = {
  virtual: 'Virtual',
  abarrotes: 'Abarrotes',
  garage: 'Garage',
};

/** Empleados indirectos con vale por área. */
export const INDIRECTOS_VALES = {
  abarrotes: ['Luis Enrique'],
  virtual: ['Misael', 'Gonzalo'],
};

export const RUTAS_PRESTAMO_INTERAREA = [
  { origen: 'abarrotes', destino: 'virtual', label: 'Abarrotes → Virtual' },
  { origen: 'virtual', destino: 'abarrotes', label: 'Virtual → Abarrotes' },
  { origen: 'virtual', destino: 'garage', label: 'Virtual → Garage' },
  { origen: 'garage', destino: 'virtual', label: 'Garage → Virtual' },
];

/** Vales indirectos: libres hasta las 9:00; después requieren administrador. */
export function valeRequiereAutorizacionAdmin(fecha = new Date()) {
  return fecha.getHours() >= 9;
}

export const HORA_LIMITE_VALE = 9;
