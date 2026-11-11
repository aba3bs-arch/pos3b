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

/** Categoría limpia para agrupar el desglose. */
export function etiquetaCategoriaGasto(g) {
  return String(g?.categoria || '').trim() || 'Sin categoría';
}

/**
 * Subcategoría limpia (sin el detalle embebido con « › » que a veces trae el libro IE).
 */
export function etiquetaSubcategoriaGasto(g) {
  const fromNombre = String(g?.subcategoria_nombre || '').trim();
  if (fromNombre) return fromNombre;
  const sub = String(g?.subcategoria || '').trim();
  if (!sub) return 'Sin subcategoría';
  const det = String(g?.detalle || '').trim();
  if (det && sub.includes(' › ')) {
    const parts = sub.split(' › ');
    if (parts.length > 1 && parts[parts.length - 1] === det) {
      const limpia = parts.slice(0, -1).join(' › ').trim();
      return limpia || 'Sin subcategoría';
    }
  }
  return sub;
}

/** Detalle (3er nivel) si existe. */
export function etiquetaDetalleGasto(g) {
  return String(g?.detalle || '').trim();
}

function claveGrupo(label) {
  return String(label || '').trim().toLowerCase() || '_';
}

function pushMonto(grupo, g) {
  grupo.gastos = round2(grupo.gastos + (Number(g?.monto) || 0));
  grupo.items.push(g);
}

/**
 * Dentro de una sucursal: categoría → subcategoría → (detalle si hay) → partidas.
 * Orden: mayor monto primero.
 */
export function agruparGastosPorCatalogo(lista = []) {
  const cats = {};
  for (const g of lista || []) {
    const catLabel = etiquetaCategoriaGasto(g);
    const catId = claveGrupo(catLabel);
    if (!cats[catId]) {
      cats[catId] = { id: catId, label: catLabel, gastos: 0, items: [], subs: {} };
    }
    const cat = cats[catId];
    pushMonto(cat, g);

    const subLabel = etiquetaSubcategoriaGasto(g);
    const subId = claveGrupo(subLabel);
    if (!cat.subs[subId]) {
      cat.subs[subId] = { id: subId, label: subLabel, gastos: 0, items: [], dets: {} };
    }
    const sub = cat.subs[subId];
    pushMonto(sub, g);

    const detLabel = etiquetaDetalleGasto(g);
    if (detLabel) {
      const detId = claveGrupo(detLabel);
      if (!sub.dets[detId]) {
        sub.dets[detId] = { id: detId, label: detLabel, gastos: 0, items: [] };
      }
      pushMonto(sub.dets[detId], g);
    }
  }

  const sortGrupos = (a, b) => b.gastos - a.gastos || a.label.localeCompare(b.label, 'es');

  return Object.values(cats)
    .map((cat) => {
      const subcategorias = Object.values(cat.subs)
        .map((sub) => {
          const detalles = Object.values(sub.dets).sort(sortGrupos);
          const sinDetalle = (sub.items || []).filter((g) => !etiquetaDetalleGasto(g));
          return {
            id: sub.id,
            label: sub.label,
            gastos: sub.gastos,
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
        gastos: cat.gastos,
        items: cat.items,
        subcategorias,
      };
    })
    .sort(sortGrupos);
}

/** Motivo o comentario capturado (evita repetir el nombre del cajero cuando solo vino eso). */
export function motivoDeGasto(g) {
  const txt = String(g?.comentario || g?.descripcion || '').trim();
  return txt || '—';
}

/** Gastos de los movimientos por día, ordenados del más reciente al más antiguo. */
export function gastosDeMovimientosPorDia(porDia = []) {
  const out = [];
  for (const dia of porDia || []) {
    for (const it of dia?.items || []) {
      if (it?.tipo === 'gasto') out.push(it);
    }
  }
  return out.sort((a, b) => {
    const f = String(b.fecha || '').localeCompare(String(a.fecha || ''));
    if (f) return f;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}

export function totalGastosLista(lista = []) {
  return round2((lista || []).reduce((a, g) => a + (Number(g?.monto) || 0), 0));
}

/** Agrupa gastos por tienda (mayor monto primero); dentro de cada tienda conserva el orden de la lista. */
export function agruparGastosPorTienda(lista = []) {
  const map = {};
  for (const g of lista || []) {
    const id = normalizarCodigoTienda(g?.tienda) || 'MAIN';
    if (!map[id]) {
      map[id] = {
        id,
        label: etiquetaTienda(id),
        gastos: 0,
        items: [],
      };
    }
    map[id].gastos = round2(map[id].gastos + (Number(g?.monto) || 0));
    map[id].items.push(g);
  }
  return Object.values(map)
    .filter((t) => t.items.length > 0)
    .sort((a, b) => b.gastos - a.gastos || a.label.localeCompare(b.label, 'es'));
}
