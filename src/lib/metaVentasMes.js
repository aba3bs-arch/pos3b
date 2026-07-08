const LS_META = 'pos3b_meta_ventas_mes';

function claveMes(fecha = new Date()) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function leerMapa() {
  try {
    const raw = localStorage.getItem(LS_META);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function guardarMapa(map) {
  localStorage.setItem(LS_META, JSON.stringify(map));
}

/** Meta de ventas del mes para una tienda (o global si sucursal vacía). */
export function leerMetaVentasMes(sucursal, fecha = new Date()) {
  const mes = claveMes(fecha);
  const map = leerMapa();
  const entry = map[mes] || {};
  if (!sucursal) return Number(entry._global) || 0;
  return Number(entry[sucursal]) || 0;
}

export function guardarMetaVentasMes(sucursal, monto, fecha = new Date()) {
  const mes = claveMes(fecha);
  const map = leerMapa();
  if (!map[mes]) map[mes] = {};
  const val = Math.max(0, Number(monto) || 0);
  if (!sucursal) map[mes]._global = val;
  else map[mes][sucursal] = val;
  guardarMapa(map);
  return val;
}

export function claveMesActual(fecha = new Date()) {
  return claveMes(fecha);
}

export function etiquetaMesClave(clave) {
  if (!clave || !/^\d{4}-\d{2}$/.test(clave)) return clave || '—';
  const [y, m] = clave.split('-');
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${meses[Number(m) - 1]} ${y}`;
}
