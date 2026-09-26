/**
 * Consumo a nombre de Luis Enrique / Misael: exige su PIN (invisible)
 * para que nadie les cargue gastos sin su autorización.
 */
import { tipoValeLogico } from './valesCatalogoIe.js';
import { normalizarNombreMatch } from './contabilidadConstants.js';
import { usuarioEstaActivo } from './usuariosAuth.js';

/** Beneficiarios que deben confirmar consumo con su propio PIN. */
export const BENEFICIARIOS_CONSUMO_PIN = [
  {
    id: 'luis-enrique',
    etiqueta: 'Luis Enrique',
    patrones: ['luis enrique mada osuna', 'luis enrique mada', 'luis enrique osuna', 'luis enrique'],
  },
  {
    id: 'misael',
    etiqueta: 'Misael',
    patrones: ['misael'],
  },
];

export function esValeConsumo(categoria, subcategoria, detalle) {
  return tipoValeLogico(categoria, subcategoria, detalle) === 'consumo';
}

/** ¿Este nombre (beneficiario) requiere PIN al pedir consumo? */
export function beneficiarioRequierePinConsumo(nombre) {
  return Boolean(resolverBeneficiarioConsumoPin(nombre));
}

/**
 * Coincide el nombre con un patrón de beneficiario PIN.
 * - Exacto, o el patrón es el inicio del nombre («Misael …»).
 * - NO matchea si el patrón solo aparece como segundo nombre/apellido
 *   (evita que «Leyver Misael» se confunda con el Misael de MAIN).
 */
export function nombreCoincidePatronBeneficiario(nombreNorm, patronNorm) {
  const n = String(nombreNorm || '').trim();
  const pat = String(patronNorm || '').trim();
  if (!n || !pat) return false;
  if (n === pat) return true;
  // "misael garcia" / "luis enrique mada" — patrón como nombre de pila al inicio
  if (n.startsWith(`${pat} `)) return true;
  // Nombre corto guardado vs patrón más largo: "luis enrique" vs "luis enrique mada"
  if (pat.startsWith(`${n} `) && n.length >= 4) return true;
  return false;
}

export function resolverBeneficiarioConsumoPin(nombre) {
  const n = normalizarNombreMatch(nombre);
  if (!n) return null;
  for (const b of BENEFICIARIOS_CONSUMO_PIN) {
    for (const p of b.patrones) {
      const pat = normalizarNombreMatch(p);
      if (!pat) continue;
      if (nombreCoincidePatronBeneficiario(n, pat)) return b;
    }
  }
  return null;
}

/**
 * True si al generar este vale hay que pedir PIN del beneficiario.
 */
export function valeConsumoRequierePinBeneficiario({
  nombreEmpleado,
  categoria,
  subcategoria,
  detalle,
} = {}) {
  if (!esValeConsumo(categoria, subcategoria, detalle)) return false;
  return beneficiarioRequierePinConsumo(nombreEmpleado);
}

function nombreCoincideBeneficiario(nombreUsuario, beneficiario) {
  const n = normalizarNombreMatch(nombreUsuario);
  if (!n || !beneficiario) return false;
  for (const p of beneficiario.patrones) {
    const pat = normalizarNombreMatch(p);
    if (!pat) continue;
    if (nombreCoincidePatronBeneficiario(n, pat)) return true;
  }
  return false;
}

/**
 * Verifica que el PIN corresponda al beneficiario (Luis Enrique / Misael),
 * buscando en cualquier sucursal (son personal MAIN / indirecto).
 */
export async function verificarPinBeneficiarioConsumo(supabase, pin, nombreBeneficiario) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const ben = resolverBeneficiarioConsumoPin(nombreBeneficiario);
  if (!ben) {
    return { ok: false, error: 'Este beneficiario no requiere PIN de consumo.' };
  }
  const p = String(pin || '').trim();
  if (!p) {
    return {
      ok: false,
      error: `Indica el PIN de ${ben.etiqueta}. Solo él puede autorizar este consumo.`,
    };
  }

  const { data, error } = await supabase.from('usuarios').select('id, nombre, pin, rol, sucursal_id, activo, tipo_empleado').eq('pin', p);
  if (error) return { ok: false, error: error.message };

  const candidatos = (data || []).filter((u) => usuarioEstaActivo(u));
  if (!candidatos.length) {
    return { ok: false, error: 'PIN incorrecto.' };
  }

  const match = candidatos.find((u) => nombreCoincideBeneficiario(u.nombre, ben));
  if (!match) {
    return {
      ok: false,
      error: `PIN no corresponde a ${ben.etiqueta}. Debe ingresarlo él mismo.`,
    };
  }

  return {
    ok: true,
    usuario: match,
    beneficiario: ben,
  };
}
