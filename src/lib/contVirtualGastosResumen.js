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

/** Etiquetas cortas para la pestaña Gasto. */
export const ETIQUETAS_CONCEPTO_GASTO = {
  'cubre-turno': 'CT',
  bono: 'Bono',
  limpieza: 'Limpieza',
  taxis: 'Taxis',
  'credito-autorizado': 'Crédito autorizado',
};

/** Aliases de texto para emparejar gastos históricos sin categoria_id (o mal mapeados). */
export const ALIASES_CONCEPTO_GASTO = {
  'cubre-turno': ['cubre turno', 'cubre-turno', 'cubreturno', 'ct'],
  bono: ['bono', 'bonos', 'bonificación', 'bonificacion'],
  limpieza: ['limpieza', 'limpiar', 'aseo'],
  taxis: ['taxi', 'taxis'],
  'credito-autorizado': [
    'credito autorizado',
    'crédito autorizado',
    'credito ruta',
    'crédito ruta',
    'credito cobrado',
    'crédito cobrado',
    'credito',
    'crédito',
  ],
};

export function etiquetaConceptoGasto(cat) {
  const id = String(cat?.id || '').toLowerCase();
  if (ETIQUETAS_CONCEPTO_GASTO[id]) return ETIQUETAS_CONCEPTO_GASTO[id];
  const nombre = String(cat?.nombre || '').trim();
  if (!nombre) return id || 'Gasto';
  // Quitar emojis decorativos del catálogo Empleado, etc.
  return nombre.replace(/\s*[^\wÀ-ÿ./+\-()%$]+$/u, '').replace(/^[^\wÀ-ÿ]+/u, '').trim() || nombre;
}

function textoGastoParaMatch(g) {
  return [
    g?.categoria_id,
    g?.categoria,
    g?.categoria_raw,
    g?.subcategoria_id,
    g?.subcategoria,
    g?.subcategoria_raw,
    g?.comentario,
    g?.descripcion,
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' | ');
}

function coincideAliasGasto(g, aliases) {
  if (!aliases?.length) return false;
  const blob = textoGastoParaMatch(g);
  const raw = String(g?.categoria_raw || g?.categoria || '').trim().toLowerCase();
  return aliases.some((a) => {
    const al = String(a || '').toLowerCase();
    if (!al) return false;
    if (raw === al) return true;
    if (al.length <= 2) {
      return new RegExp(`(?:^|[^a-z0-9áéíóúñ])${al}(?:[^a-z0-9áéíóúñ]|$)`, 'i').test(blob);
    }
    return blob.includes(al);
  });
}

/** ¿El gasto pertenece al concepto (categoría) seleccionado? */
export function gastoCoincideConcepto(g, concepto) {
  if (!g || !concepto) return false;
  const id = String(concepto.id || '').toLowerCase();
  const catId = String(g.categoria_id || '').toLowerCase();
  if (id && catId && catId === id) return true;

  const aliases = [
    ...(ALIASES_CONCEPTO_GASTO[id] || []),
    ...(concepto.aliases || []),
  ].map((a) => String(a || '').toLowerCase()).filter(Boolean);

  // Si ya trae categoria_id de otra cuenta (no manual/otros), no mezclar por alias.
  if (id && catId && catId !== id && catId !== 'manual' && catId !== 'otros') {
    return false;
  }

  const nombre = String(concepto.nombre || '').trim().toLowerCase();
  const etiqueta = String(concepto.label || '').trim().toLowerCase();
  const catNom = String(g.categoria || g.categoria_raw || '').trim().toLowerCase();
  if (nombre && catNom && catNom === nombre) return true;
  if (etiqueta && catNom && catNom === etiqueta) return true;

  return coincideAliasGasto(g, aliases);
}

/**
 * Lista de conceptos de gasto para el selector (catálogo egreso + categorías vistas en el periodo).
 * Cada ítem: { id, nombre, label, orden, total, items, porTienda }.
 */
export function listarConceptosGastoPeriodo({ catalogoEgreso = [], detalleGastos = [] } = {}) {
  const map = new Map();

  for (const c of catalogoEgreso || []) {
    if (!c || c.activo === false) continue;
    const id = String(c.id || '').trim();
    if (!id) continue;
    map.set(id, {
      id,
      nombre: c.nombre || id,
      label: etiquetaConceptoGasto(c),
      orden: Number(c.orden) || 999,
      aliases: ALIASES_CONCEPTO_GASTO[id] || [],
    });
  }

  // Categorías presentes en el periodo que no están en el catálogo cargado.
  for (const g of detalleGastos || []) {
    const id = String(g.categoria_id || '').trim() || slugConceptoDesdeNombre(g.categoria);
    if (!id || map.has(id)) continue;
    const nombre = String(g.categoria || id).trim() || id;
    map.set(id, {
      id,
      nombre,
      label: etiquetaConceptoGasto({ id, nombre }),
      orden: 500,
      aliases: ALIASES_CONCEPTO_GASTO[id] || [],
    });
  }

  const conceptos = [...map.values()]
    .map((c) => {
      const items = (detalleGastos || []).filter((g) => gastoCoincideConcepto(g, c));
      return {
        ...c,
        total: totalGastosLista(items),
        items,
        porTienda: agruparGastosPorTienda(items),
      };
    })
    .sort((a, b) => {
      // Con monto primero, luego orden de catálogo, luego etiqueta.
      if ((b.total > 0) !== (a.total > 0)) return b.total > 0 ? 1 : -1;
      if (a.orden !== b.orden) return a.orden - b.orden;
      return a.label.localeCompare(b.label, 'es');
    });

  return conceptos;
}

function slugConceptoDesdeNombre(nombre) {
  const s = String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s || '';
}
