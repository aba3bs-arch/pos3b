import { normalizarRol } from '../roles.js';

/** Permisos de cortes contabilidad — aislados del Corte de caja del POS. */
export function permisosCorteContabilidad(rol) {
  const r = normalizarRol(rol);
  if (r === 'Administrador' || r === 'Gerente') {
    return {
      guardar: true,
      gastos: true,
      comentarios: true,
      moneda_inicial: true,
      moneda_final: true,
      folio: true,
      soloLectura: false,
    };
  }
  if (r === 'Auditor') {
    return {
      guardar: false,
      gastos: false,
      comentarios: false,
      moneda_inicial: false,
      moneda_final: false,
      folio: false,
      soloLectura: true,
    };
  }
  return {
    guardar: false,
    gastos: false,
    comentarios: false,
    moneda_inicial: false,
    moneda_final: false,
    folio: false,
    soloLectura: true,
  };
}
