export function normalizarBusqueda(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Variantes simples singular/plural en español para que «recargas»
 * también encuentre «Recarga 50» (y viceversa vía includes del singular).
 */
export function variantesTokenBusqueda(palabra) {
  const p = String(palabra || '');
  if (!p) return [];
  const out = new Set([p]);
  if (p.length > 4 && p.endsWith('es')) {
    out.add(p.slice(0, -2));
    out.add(p.slice(0, -1));
  } else if (p.length > 3 && p.endsWith('s')) {
    out.add(p.slice(0, -1));
  }
  return [...out];
}

export function coincideBusqueda(textos, q) {
  const nq = normalizarBusqueda(q);
  if (!nq) return true;
  const blob = normalizarBusqueda(Array.isArray(textos) ? textos.join(' ') : textos);
  return nq.split(/\s+/).every((palabra) => (
    variantesTokenBusqueda(palabra).some((v) => blob.includes(v))
  ));
}

export function ymdLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function ymdHaceDias(n, base = new Date()) {
  return ymdLocal(new Date(base.getFullYear(), base.getMonth(), base.getDate() - n));
}

/** Ajusta el rango para que desde nunca quede después de hasta; ignora valores vacíos. */
export function ajustarRango({ desde, hasta }, cambio, valor) {
  if (!valor) return { desde, hasta };
  if (cambio === 'desde') return { desde: valor, hasta: hasta && valor > hasta ? valor : hasta };
  return { desde: desde && valor < desde ? valor : desde, hasta: valor };
}
