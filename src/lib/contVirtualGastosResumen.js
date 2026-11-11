import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const CUENTAS = { abarrotes: 'Abarrotes', virtual: 'Virtual', garage: 'Garage' };

/** Origen del gasto: de qué corte (o módulo) viene. */
export function corteDeGasto(g) {
  const fuente = String(g?.fuente || '').toLowerCase();
  const cuenta = CUENTAS[String(g?.cuenta || g?.modulo || '').toLowerCase()] || '';
  if (fuente === 'corte' || fuente === 'nom_corte') {
    const base = cuenta ? `Corte ${cuenta}` : 'Corte';
    return fuente === 'nom_corte' ? `${base} (nómina)` : base;
  }
  if (fuente === 'vale') return cuenta ? `Vale · ${cuenta}` : 'Vale';
  if (fuente === 'prestamo' || fuente === 'préstamo') return 'Préstamo';
  if (fuente === 'payroll') return 'Nómina';
  if (fuente === 'manual') return cuenta ? `Captura IE · ${cuenta}` : 'Captura IE';
  return [g?.fuente, cuenta].filter(Boolean).join(' · ') || '—';
}

export function cajeroDeGasto(g) {
  return String(g?.empleado || g?.solicitado_por || '').trim() || '—';
}

export function conceptoDeGasto(g) {
  const partes = [g?.categoria, g?.subcategoria].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'Gasto';
}

function detalleTextoLimpio(valor) {
  if (valor == null) return '';
  if (typeof valor === 'object') return '';
  return String(valor).trim();
}

function subcategoriaSinDetalleEmbebido(subRaw, detRaw) {
  const fromNombre = String(subRaw?.nombre || '').trim();
  if (fromNombre) return fromNombre;
  const sub = String(subRaw?.texto || '').trim();
  if (!sub) return '';
  const det = detalleTextoLimpio(detRaw);
  if (det && sub.includes(' › ')) {
    const parts = sub.split(' › ');
    if (parts.length > 1 && parts[parts.length - 1] === det) {
      return parts.slice(0, -1).join(' › ').trim();
    }
  }
  return sub;
}

/** Categoría limpia para agrupar el desglose. */
export function etiquetaCategoriaGasto(g) {
  return String(g?.categoria || '').trim() || 'Sin categoría';
}

/**
 * Subcategoría limpia (sin el detalle embebido con « › » que a veces trae el libro IE).
 */
export function etiquetaSubcategoriaGasto(g) {
  const limpia = subcategoriaSinDetalleEmbebido(
    { nombre: g?.subcategoria_nombre, texto: g?.subcategoria },
    g?.detalle,
  );
  return limpia || 'Sin subcategoría';
}

/** Detalle (3er nivel) si existe. */
export function etiquetaDetalleGasto(g) {
  return detalleTextoLimpio(g?.detalle);
}

/** Categoría de ingreso: catálogo o tipo de movimiento (recolección, ventas…). */
export function etiquetaCategoriaIngreso(it) {
  const cat = String(it?.categoria || '').trim();
  if (cat) return cat;
  const tipo = String(it?.tipo_mov || '').toLowerCase();
  if (tipo === 'recoleccion') return 'Recolección';
  if (tipo === 'venta_cierre') return 'Ventas de cierre';
  if (tipo === 'cobro_credito') return 'Cobro de crédito';
  if (tipo === 'manual') return 'Ingreso manual';
  return 'Sin categoría';
}

/** Subcategoría de ingreso: catálogo o cuenta (Virtual / Garage / Abarrotes). */
export function etiquetaSubcategoriaIngreso(it) {
  const limpia = subcategoriaSinDetalleEmbebido(
    { nombre: it?.subcategoria_nombre, texto: it?.subcategoria },
    it?.detalle,
  );
  if (limpia) return limpia;
  const cuenta = CUENTAS[String(it?.cuenta || '').toLowerCase()];
  if (cuenta) return cuenta;
  return 'Sin subcategoría';
}

export function etiquetaDetalleIngreso(it) {
  return detalleTextoLimpio(it?.detalle);
}

function claveGrupo(label) {
  return String(label || '').trim().toLowerCase() || '_';
}

function pushMonto(grupo, g) {
  grupo.total = round2(grupo.total + (Number(g?.monto) || 0));
  grupo.items.push(g);
}

/**
 * Dentro de una sucursal: categoría → subcategoría → (detalle si hay) → partidas.
 * Orden: mayor monto primero. Usa `total` en cada nodo.
 */
export function agruparPorCatalogo(lista = [], etiquetas = {}) {
  const etiquetaCategoria = etiquetas.categoria || etiquetaCategoriaGasto;
  const etiquetaSubcategoria = etiquetas.subcategoria || etiquetaSubcategoriaGasto;
  const etiquetaDetalle = etiquetas.detalle || etiquetaDetalleGasto;
  const cats = {};
  for (const g of lista || []) {
    const catLabel = etiquetaCategoria(g);
    const catId = claveGrupo(catLabel);
    if (!cats[catId]) {
      cats[catId] = { id: catId, label: catLabel, total: 0, items: [], subs: {} };
    }
    const cat = cats[catId];
    pushMonto(cat, g);

    const subLabel = etiquetaSubcategoria(g);
    const subId = claveGrupo(subLabel);
    if (!cat.subs[subId]) {
      cat.subs[subId] = { id: subId, label: subLabel, total: 0, items: [], dets: {} };
    }
    const sub = cat.subs[subId];
    pushMonto(sub, g);

    const detLabel = etiquetaDetalle(g);
    if (detLabel) {
      const detId = claveGrupo(detLabel);
      if (!sub.dets[detId]) {
        sub.dets[detId] = { id: detId, label: detLabel, total: 0, items: [] };
      }
      pushMonto(sub.dets[detId], g);
    }
  }

  const sortGrupos = (a, b) => b.total - a.total || a.label.localeCompare(b.label, 'es');

  return Object.values(cats)
    .map((cat) => {
      const subcategorias = Object.values(cat.subs)
        .map((sub) => {
          const detalles = Object.values(sub.dets).sort(sortGrupos);
          const sinDetalle = (sub.items || []).filter((g) => !etiquetaDetalle(g));
          return {
            id: sub.id,
            label: sub.label,
            total: sub.total,
            gastos: sub.total,
            items: sub.items,
            detalles,
            sinDetalle,
            tieneDetalle: detalles.length > 0,
          };
        })
        .sort(sortGrupos);
      return {
        id: cat.id,
        label: cat.label,
        total: cat.total,
        gastos: cat.total,
        items: cat.items,
        subcategorias,
      };
    })
    .sort(sortGrupos);
}

/** Alias con etiquetas de egreso (mantiene `gastos` = `total` por compatibilidad). */
export function agruparGastosPorCatalogo(lista = []) {
  return agruparPorCatalogo(lista).map((cat) => ({
    ...cat,
    subcategorias: (cat.subcategorias || []).map((sub) => ({
      ...sub,
      detalles: (sub.detalles || []).map((d) => ({ ...d, gastos: d.total })),
    })),
  }));
}

/** Misma jerarquía para ingresos (catálogo o tipo de movimiento / cuenta). */
export function agruparIngresosPorCatalogo(lista = []) {
  return agruparPorCatalogo(lista, {
    categoria: etiquetaCategoriaIngreso,
    subcategoria: etiquetaSubcategoriaIngreso,
    detalle: etiquetaDetalleIngreso,
  });
}

/** Motivo o comentario capturado (evita repetir el nombre del cajero cuando solo vino eso). */
export function motivoDeGasto(g) {
  const txt = String(g?.comentario || g?.descripcion || '').trim();
  return txt || '—';
}

function ordenRecientePrimero(a, b) {
  const f = String(b.fecha || '').localeCompare(String(a.fecha || ''));
  if (f) return f;
  return String(b.created_at || '').localeCompare(String(a.created_at || ''));
}

/** Gastos de los movimientos por día, ordenados del más reciente al más antiguo. */
export function gastosDeMovimientosPorDia(porDia = []) {
  const out = [];
  for (const dia of porDia || []) {
    for (const it of dia?.items || []) {
      if (it?.tipo === 'gasto') out.push(it);
    }
  }
  return out.sort(ordenRecientePrimero);
}

/** Ingresos de los movimientos por día, ordenados del más reciente al más antiguo. */
export function ingresosDeMovimientosPorDia(porDia = []) {
  const out = [];
  for (const dia of porDia || []) {
    for (const it of dia?.items || []) {
      if (it?.tipo === 'ingreso') out.push(it);
    }
  }
  return out.sort(ordenRecientePrimero);
}

export function totalGastosLista(lista = []) {
  return round2((lista || []).reduce((a, g) => a + (Number(g?.monto) || 0), 0));
}

export const totalIngresosLista = totalGastosLista;

function agruparMovimientosPorTienda(lista = [], totalKey = 'total') {
  const map = {};
  for (const g of lista || []) {
    const id = normalizarCodigoTienda(g?.tienda) || 'MAIN';
    if (!map[id]) {
      map[id] = {
        id,
        label: etiquetaTienda(id),
        [totalKey]: 0,
        items: [],
      };
    }
    map[id][totalKey] = round2(map[id][totalKey] + (Number(g?.monto) || 0));
    map[id].items.push(g);
  }
  return Object.values(map)
    .filter((t) => t.items.length > 0)
    .sort((a, b) => b[totalKey] - a[totalKey] || a.label.localeCompare(b.label, 'es'));
}

/** Agrupa gastos por tienda (mayor monto primero); dentro de cada tienda conserva el orden de la lista. */
export function agruparGastosPorTienda(lista = []) {
  return agruparMovimientosPorTienda(lista, 'gastos');
}

/** Agrupa ingresos por tienda (mayor monto primero). */
export function agruparIngresosPorTienda(lista = []) {
  return agruparMovimientosPorTienda(lista, 'ingresos');
}
