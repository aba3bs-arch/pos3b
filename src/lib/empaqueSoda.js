/**
 * Empaque típico Pepsi / Coca-Cola para validar cantidades en ingreso/ajuste.
 * Advertencia suave (no bloquea): evita meter 10 cuando el paquete es de 12, etc.
 */

const EMPAQUES_COMUNES = [6, 8, 12, 24];

/** Detecta Pepsi o Coca-Cola por nombre / marca / categoría. */
export function esSodaPepsiOCoca(producto) {
  if (!producto) return false;
  const blob = `${producto.nombre || ''} ${producto.marca || ''} ${producto.descripcion || ''} ${producto.cat || ''} ${producto.categoria || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/\bpepsi\b/.test(blob)) return true;
  if (/\bcoca[\s-]?cola\b/.test(blob) || /\bcoke\b/.test(blob)) return true;
  // "COCA" solo si parece refresco (evita falsos positivos raros)
  if (/\bcoca\b/.test(blob) && /(cola|refresco|soda|lt|l\b|ml)/.test(blob)) return true;
  return false;
}

/**
 * Piezas por paquete del producto.
 * Prioridad: campo explícito → heurística por presentación → null (usar comunes).
 */
export function empaqueSodaPiezas(producto) {
  const explicit = Number(
    producto?.piezas_paquete ?? producto?.piezas_empaque ?? producto?.empaque ?? producto?.unidades_caja,
  );
  if (Number.isFinite(explicit) && explicit >= 2) return Math.floor(explicit);

  const n = String(producto?.nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Family / retornable grandes: suelen ir de 6 u 8
  if (/2[\s.,]*5\s*(l|lt|litro)/.test(n) || /2\.5l/.test(n)) return 8;
  if (/\b3\s*(l|lt|litro)/.test(n) || /\b3l\b/.test(n)) return 6;
  if (/1[\s.,]*5\s*(l|lt|litro)/.test(n) || /1\.5l/.test(n)) return 6;
  // Individuales PET
  if (/(600|500|355|355)\s*ml/.test(n)) return 12;
  if (/\b1\s*(l|lt|litro)\b/.test(n) || /\b1l\b/.test(n)) return 12;

  return null;
}

/**
 * @returns {{ ok: true } | { ok: false, empaque: number|null, sugeridos: number[], mensaje: string }}
 */
export function validarCantidadEmpaqueSoda(producto, cantidad) {
  const qty = Math.floor(Number(cantidad) || 0);
  if (!(qty > 0) || !esSodaPepsiOCoca(producto)) return { ok: true };

  const empaque = empaqueSodaPiezas(producto);
  if (empaque && qty % empaque === 0) return { ok: true, empaque };

  if (!empaque) {
    const encaja = EMPAQUES_COMUNES.some((e) => qty % e === 0);
    if (encaja) return { ok: true, empaque: null };
    return {
      ok: false,
      empaque: null,
      sugeridos: EMPAQUES_COMUNES,
      mensaje:
        `«${producto.nombre || 'Producto'}» es Pepsi/Coca-Cola.\n` +
        `La cantidad ${qty} no coincide con un paquete típico (6, 8, 12 o 24 piezas).\n\n` +
        `Ejemplos válidos: 6, 8, 12, 16, 18, 24…\n` +
        `¿Registrar ${qty} de todos modos?`,
    };
  }

  const multiplos = [empaque, empaque * 2, empaque * 3, empaque * 4]
    .filter((n) => n !== qty)
    .slice(0, 4);
  return {
    ok: false,
    empaque,
    sugeridos: multiplos,
    mensaje:
      `«${producto.nombre || 'Producto'}» suele venir en paquetes de ${empaque} piezas.\n` +
      `Ingresaste ${qty}, que no es múltiplo de ${empaque}.\n\n` +
      `Ejemplos: ${multiplos.join(', ')}…\n` +
      `¿Registrar ${qty} de todos modos?`,
  };
}

/** true = el usuario confirma seguir; false = canceló. */
export function confirmarSiCantidadFueraDeEmpaque(producto, cantidad) {
  const v = validarCantidadEmpaqueSoda(producto, cantidad);
  if (v.ok) return true;
  return confirm(v.mensaje);
}
