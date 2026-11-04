export function normalizarBusqueda(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function coincideBusqueda(textos, q) {
  const nq = normalizarBusqueda(q);
  if (!nq) return true;
  const blob = normalizarBusqueda(Array.isArray(textos) ? textos.join(' ') : textos);
  return nq.split(/\s+/).every((palabra) => blob.includes(palabra));
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
