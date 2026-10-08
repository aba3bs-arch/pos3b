/**
 * Archivo operativo (plazo configurable; default 15 días).
 * Soft-archive con `archived_at`: los módulos operativos ocultan filas;
 * IE VIRTUAL / IE ABARROTES (y Garage en IE VIRTUAL) NO filtran archived_at
 * → la contabilidad no cambia.
 *
 * El admin ajusta los días en Configuración → Operación.
 */

/** Default de fábrica; el valor efectivo lo da leerDiasArchivoOperativo(). */
export const DIAS_ARCHIVO_DEFAULT = 15;
/** @deprecated usar DIAS_ARCHIVO_DEFAULT o leerDiasArchivoOperativo() */
export const DIAS_ARCHIVO_OPERATIVO = DIAS_ARCHIVO_DEFAULT;

const LS_DIAS_ARCHIVO = 'pos3b_archivo_dias_retencion';
export const EVENTO_DIAS_ARCHIVO = 'pos3b-archivo-dias-updated';

/** Memoria de respaldo cuando no hay localStorage (tests Node). */
let diasArchivoMemoria = DIAS_ARCHIVO_DEFAULT;

export const AVISO_FALTA_ARCHIVO =
  'Falta la columna archived_at. Ejecuta supabase/fix_archivo_operativo.sql en Supabase.';

function storageGet(key) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      return localStorage.getItem(key);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function storageSet(key, value) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(key, value);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Días de retención en módulos (1–365). Default 15. */
export function leerDiasArchivoOperativo() {
  const raw = storageGet(LS_DIAS_ARCHIVO);
  if (raw != null) {
    const v = parseInt(raw, 10);
    if (Number.isFinite(v) && v >= 1 && v <= 365) return v;
  }
  return diasArchivoMemoria;
}

export function guardarDiasArchivoOperativo(dias, { silencioso = false } = {}) {
  const raw = Number(dias);
  const base = Number.isFinite(raw) ? Math.round(raw) : DIAS_ARCHIVO_DEFAULT;
  const n = Math.min(365, Math.max(1, base));
  diasArchivoMemoria = n;
  storageSet(LS_DIAS_ARCHIVO, String(n));
  if (!silencioso && typeof window !== 'undefined' && window.dispatchEvent) {
    window.dispatchEvent(new CustomEvent(EVENTO_DIAS_ARCHIVO, { detail: n }));
  }
  return n;
}

/** Tipos consultables en el módulo Archivo (sucursal · depto · fecha). */
export const TIPOS_ARCHIVO = [
  { id: 'cierres', label: 'Cortes (cierres)', tabla: 'cortes_contabilidad_cierres', deptoCol: 'modulo', fechaCol: 'created_at' },
  { id: 'gastos', label: 'Gastos de corte', tabla: 'cortes_contabilidad_gastos', deptoCol: 'modulo', fechaCol: 'created_at' },
  { id: 'vales', label: 'Vales', tabla: 'vales', deptoCol: 'area', fechaCol: 'fecha' },
  { id: 'prestamos', label: 'Préstamos personales', tabla: 'prestamos', deptoCol: 'area_corte', fechaCol: 'created_at' },
  { id: 'pagares', label: 'Pagarés', tabla: 'pagares', deptoCol: 'area', fechaCol: 'created_at' },
  { id: 'nominas', label: 'Nóminas', tabla: 'nomina_periodos', deptoCol: 'pagador_filtro', fechaCol: 'periodo_fin' },
];

export function faltaColumnaArchivedAt(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes('archived_at')
    && (msg.includes('does not exist')
      || msg.includes('could not find')
      || msg.includes('schema cache')
      || msg.includes('column'))
  );
}

/**
 * Fecha/hora ISO umbral: registros anteriores se archivan.
 * @param {Date} [ahora]
 * @param {number} [dias] si se omite, lee Configuración (localStorage)
 */
export function fechaUmbralArchivo(ahora = new Date(), dias = null) {
  const n = dias != null ? Number(dias) : leerDiasArchivoOperativo();
  const ret = Number.isFinite(n) && n >= 1 ? Math.min(365, Math.round(n)) : DIAS_ARCHIVO_DEFAULT;
  const d = new Date(ahora);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ret);
  return d.toISOString();
}

export function ymdUmbralArchivo(ahora = new Date(), dias = null) {
  return fechaUmbralArchivo(ahora, dias).slice(0, 10);
}

/** Aplica .is('archived_at', null) a una query Supabase. */
export function excluirArchivados(query) {
  if (!query || typeof query.is !== 'function') return query;
  return query.is('archived_at', null);
}

function metaTipo(tipoId) {
  return TIPOS_ARCHIVO.find((t) => t.id === tipoId) || null;
}

function etiquetaDepto(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return '—';
  if (s === 'virtual') return 'Virtual';
  if (s === 'abarrotes') return 'Abarrotes';
  if (s === 'garage') return 'Garage';
  return String(v);
}

function filaArchivo(tipo, row) {
  const meta = metaTipo(tipo);
  const depto = meta ? row?.[meta.deptoCol] : null;
  const fechaRaw = meta ? row?.[meta.fechaCol] : row?.created_at;
  return {
    tipo,
    tipoLabel: meta?.label || tipo,
    id: row.id,
    sucursal_id: row.sucursal_id || '—',
    departamento: etiquetaDepto(depto),
    departamento_raw: depto || null,
    fecha: fechaRaw ? String(fechaRaw).slice(0, 10) : '—',
    archived_at: row.archived_at || null,
    archived_by: row.archived_by || null,
    resumen: resumenFila(tipo, row),
    raw: row,
  };
}

function resumenFila(tipo, row) {
  if (tipo === 'cierres') {
    return `Cierre ${row.turno || ''} · caja $${Number(row.caja_actual || 0).toFixed(2)}`.trim();
  }
  if (tipo === 'gastos') {
    const cat = [row.categoria, row.subcategoria].filter(Boolean).join(' / ');
    return `${cat || 'Gasto'} · $${Number(row.monto || 0).toFixed(2)} · ${row.usuario_nombre || ''}`.trim();
  }
  if (tipo === 'vales') {
    return `${row.categoria || 'Vale'} · $${Number(row.monto || 0).toFixed(2)} · ${row.beneficiario || row.empleado_nombre || ''}`.trim();
  }
  if (tipo === 'prestamos') {
    return `${row.empleado_nombre || row.beneficiario || 'Préstamo'} · $${Number(row.monto || row.saldo || 0).toFixed(2)} · ${row.estado || ''}`.trim();
  }
  if (tipo === 'pagares') {
    return `Folio ${row.folio || row.id} · $${Number(row.monto || 0).toFixed(2)} · ${row.estado || ''}`.trim();
  }
  if (tipo === 'nominas') {
    return `Periodo ${row.periodo_inicio || ''} → ${row.periodo_fin || ''} · $${Number(row.total || 0).toFixed(2)}`.trim();
  }
  return String(row.id || '');
}

/**
 * Archiva en lote registros elegibles (> 15 días).
 * No toca cont_virtual_ingresos / cont_virtual_egresos.
 * No archiva deudas abiertas (pagarés/préstamos activos).
 */
export async function archivarPendientesOperativos(supabase, { user } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', conteos: {} };
  const dias = leerDiasArchivoOperativo();
  const umbralIso = fechaUmbralArchivo(new Date(), dias);
  const umbralYmd = ymdUmbralArchivo(new Date(), dias);
  const by = String(user?.nombre || user?.id || 'sistema').trim() || 'sistema';
  const patch = { archived_at: new Date().toISOString(), archived_by: by };
  const conteos = {};
  const errores = [];

  const mark = async (key, run) => {
    try {
      const n = await run();
      conteos[key] = n;
    } catch (e) {
      if (faltaColumnaArchivedAt(e)) {
        return { fatal: AVISO_FALTA_ARCHIVO };
      }
      errores.push(`${key}: ${e?.message || e}`);
      conteos[key] = 0;
    }
    return null;
  };

  // Cierres (no borrados)
  {
    const fatal = await mark('cierres', async () => {
      const { data, error } = await supabase
        .from('cortes_contabilidad_cierres')
        .update(patch)
        .lt('created_at', umbralIso)
        .is('archived_at', null)
        .is('deleted_at', null)
        .select('id');
      if (error) {
        if (faltaColumnaArchivedAt(error)) throw error;
        // deleted_at puede faltar en instalaciones viejas
        if (String(error.message || '').includes('deleted_at')) {
          const retry = await supabase
            .from('cortes_contabilidad_cierres')
            .update(patch)
            .lt('created_at', umbralIso)
            .is('archived_at', null)
            .select('id');
          if (retry.error) throw retry.error;
          return (retry.data || []).length;
        }
        throw error;
      }
      return (data || []).length;
    });
    if (fatal?.fatal) return { ok: false, error: fatal.fatal, conteos };
  }

  // Gastos de corte (cerrados / históricos)
  {
    const fatal = await mark('gastos', async () => {
      const { data, error } = await supabase
        .from('cortes_contabilidad_gastos')
        .update(patch)
        .lt('created_at', umbralIso)
        .is('archived_at', null)
        .eq('cerrado', true)
        .select('id');
      if (error) {
        if (faltaColumnaArchivedAt(error)) throw error;
        // sin columna cerrado: archivar por fecha
        if (String(error.message || '').toLowerCase().includes('cerrado')) {
          const retry = await supabase
            .from('cortes_contabilidad_gastos')
            .update(patch)
            .lt('created_at', umbralIso)
            .is('archived_at', null)
            .select('id');
          if (retry.error) throw retry.error;
          return (retry.data || []).length;
        }
        throw error;
      }
      return (data || []).length;
    });
    if (fatal?.fatal) return { ok: false, error: fatal.fatal, conteos };
  }

  // Vales por fecha
  {
    const fatal = await mark('vales', async () => {
      const { data, error } = await supabase
        .from('vales')
        .update(patch)
        .lt('fecha', umbralYmd)
        .is('archived_at', null)
        .select('id');
      if (error) throw error;
      return (data || []).length;
    });
    if (fatal?.fatal) return { ok: false, error: fatal.fatal, conteos };
  }

  // Préstamos liquidados / rechazados (nunca activos ni pendientes)
  {
    const fatal = await mark('prestamos', async () => {
      const { data, error } = await supabase
        .from('prestamos')
        .update(patch)
        .lt('created_at', umbralIso)
        .is('archived_at', null)
        .in('estado', ['liquidado', 'rechazado', 'cancelado', 'pagado'])
        .select('id');
      if (error) throw error;
      return (data || []).length;
    });
    if (fatal?.fatal) return { ok: false, error: fatal.fatal, conteos };
  }

  // Pagarés cerrados (nunca abiertos / por recolectar)
  {
    const fatal = await mark('pagares', async () => {
      const { data, error } = await supabase
        .from('pagares')
        .update(patch)
        .lt('created_at', umbralIso)
        .is('archived_at', null)
        .in('estado', ['liquidado', 'cancelado', 'recolectado'])
        .select('id');
      if (error) throw error;
      return (data || []).length;
    });
    if (fatal?.fatal) return { ok: false, error: fatal.fatal, conteos };
  }

  // Nóminas: periodos cuyo fin ya pasó el umbral
  {
    const fatal = await mark('nominas', async () => {
      const { data, error } = await supabase
        .from('nomina_periodos')
        .update(patch)
        .lt('periodo_fin', umbralYmd)
        .is('archived_at', null)
        .select('id');
      if (error) throw error;
      return (data || []).length;
    });
    if (fatal?.fatal) return { ok: false, error: fatal.fatal, conteos };
  }

  const total = Object.values(conteos).reduce((a, n) => a + (Number(n) || 0), 0);
  return {
    ok: errores.length === 0,
    conteos,
    total,
    umbral: umbralYmd,
    dias,
    errores,
    mensaje:
      total > 0
        ? `Archivados ${total} registro(s) anteriores a ${umbralYmd} (retenidos ${dias} días en módulos). IE no se modifica.`
        : `Nada nuevo que archivar (umbral ${umbralYmd}, retención ${dias} días).`,
  };
}

/**
 * Lista registros ya archivados, filtrables por sucursal / departamento / fecha / tipo.
 */
export async function listarArchivoOperativo(supabase, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', filas: [] };
  const tipos = opts.tipo
    ? TIPOS_ARCHIVO.filter((t) => t.id === opts.tipo)
    : TIPOS_ARCHIVO;
  const filas = [];
  const avisos = [];

  for (const meta of tipos) {
    let q = supabase
      .from(meta.tabla)
      .select('*')
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
      .limit(opts.limit || 300);
    if (opts.sucursal) q = q.eq('sucursal_id', String(opts.sucursal).toUpperCase());
    if (opts.departamento && meta.deptoCol) {
      q = q.eq(meta.deptoCol, String(opts.departamento).toLowerCase());
    }
    if (opts.desde) {
      if (meta.fechaCol === 'fecha' || meta.fechaCol === 'periodo_fin') {
        q = q.gte(meta.fechaCol, opts.desde);
      } else {
        q = q.gte(meta.fechaCol, `${opts.desde}T00:00:00`);
      }
    }
    if (opts.hasta) {
      if (meta.fechaCol === 'fecha' || meta.fechaCol === 'periodo_fin') {
        q = q.lte(meta.fechaCol, opts.hasta);
      } else {
        q = q.lte(meta.fechaCol, `${opts.hasta}T23:59:59`);
      }
    }
    const { data, error } = await q;
    if (error) {
      if (faltaColumnaArchivedAt(error)) {
        return { ok: false, error: AVISO_FALTA_ARCHIVO, filas: [], faltaSql: true };
      }
      avisos.push(`${meta.label}: ${error.message}`);
      continue;
    }
    for (const row of data || []) {
      filas.push(filaArchivo(meta.id, row));
    }
  }

  filas.sort((a, b) => String(b.archived_at || '').localeCompare(String(a.archived_at || '')));
  return { ok: true, filas, avisos, umbral: ymdUmbralArchivo() };
}

/** Restaura un registro al módulo operativo (quita archived_at). */
export async function restaurarDesdeArchivo(supabase, tipo, id, { user } = {}) {
  if (!supabase || !id) return { ok: false, error: 'Datos inválidos.' };
  const meta = metaTipo(tipo);
  if (!meta) return { ok: false, error: 'Tipo de archivo inválido.' };
  const { error } = await supabase
    .from(meta.tabla)
    .update({ archived_at: null, archived_by: null })
    .eq('id', id);
  if (error) {
    if (faltaColumnaArchivedAt(error)) return { ok: false, error: AVISO_FALTA_ARCHIVO };
    return { ok: false, error: error.message };
  }
  return {
    ok: true,
    mensaje: `Registro restaurado a ${meta.label}${user?.nombre ? ` · ${user.nombre}` : ''}.`,
  };
}

/** Agrupa filas archivadas por sucursal → departamento → fecha. */
export function agruparArchivoPorSucursalDeptoFecha(filas = []) {
  const map = new Map();
  for (const f of filas) {
    const suc = f.sucursal_id || '—';
    const dep = f.departamento || '—';
    const fec = f.fecha || '—';
    const key = `${suc}|${dep}|${fec}`;
    if (!map.has(key)) {
      map.set(key, { sucursal_id: suc, departamento: dep, fecha: fec, items: [] });
    }
    map.get(key).items.push(f);
  }
  return [...map.values()].sort((a, b) => {
    const c1 = String(a.sucursal_id).localeCompare(String(b.sucursal_id), 'es');
    if (c1) return c1;
    const c2 = String(a.departamento).localeCompare(String(b.departamento), 'es');
    if (c2) return c2;
    return String(b.fecha).localeCompare(String(a.fecha));
  });
}

function etiquetaTipoArchivo(tipoId) {
  return metaTipo(tipoId)?.label || tipoId || 'Otros';
}

function sortByLabel(a, b) {
  return String(a.label || '').localeCompare(String(b.label || ''), 'es');
}

/**
 * Árbol de carpetas: Tienda → Evento (cortes/vales/…) → Departamento → registros.
 * Para UI tipo explorador de archivos.
 */
export function construirArbolArchivoPorEvento(filas = []) {
  const tiendas = new Map();
  for (const f of filas || []) {
    const suc = String(f.sucursal_id || '—');
    if (!tiendas.has(suc)) {
      tiendas.set(suc, { id: suc, label: suc, count: 0, eventos: new Map() });
    }
    const t = tiendas.get(suc);
    t.count += 1;
    const tipo = String(f.tipo || 'otros');
    if (!t.eventos.has(tipo)) {
      t.eventos.set(tipo, {
        id: tipo,
        label: f.tipoLabel || etiquetaTipoArchivo(tipo),
        count: 0,
        departamentos: new Map(),
      });
    }
    const ev = t.eventos.get(tipo);
    ev.count += 1;
    const depKey = String(f.departamento_raw || f.departamento || '—').toLowerCase() || '—';
    const depLabel = f.departamento || '—';
    if (!ev.departamentos.has(depKey)) {
      ev.departamentos.set(depKey, { id: depKey, label: depLabel, count: 0, items: [] });
    }
    const dep = ev.departamentos.get(depKey);
    dep.count += 1;
    dep.items.push(f);
  }

  return [...tiendas.values()]
    .map((t) => ({
      ...t,
      eventos: [...t.eventos.values()]
        .map((ev) => ({
          ...ev,
          departamentos: [...ev.departamentos.values()]
            .map((d) => ({
              ...d,
              items: [...d.items].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))),
            }))
            .sort(sortByLabel),
        }))
        .sort(sortByLabel),
    }))
    .sort(sortByLabel);
}

/**
 * Árbol alterno: Tienda → Departamento → Evento → registros.
 */
export function construirArbolArchivoPorDepartamento(filas = []) {
  const tiendas = new Map();
  for (const f of filas || []) {
    const suc = String(f.sucursal_id || '—');
    if (!tiendas.has(suc)) {
      tiendas.set(suc, { id: suc, label: suc, count: 0, departamentos: new Map() });
    }
    const t = tiendas.get(suc);
    t.count += 1;
    const depKey = String(f.departamento_raw || f.departamento || '—').toLowerCase() || '—';
    const depLabel = f.departamento || '—';
    if (!t.departamentos.has(depKey)) {
      t.departamentos.set(depKey, { id: depKey, label: depLabel, count: 0, eventos: new Map() });
    }
    const dep = t.departamentos.get(depKey);
    dep.count += 1;
    const tipo = String(f.tipo || 'otros');
    if (!dep.eventos.has(tipo)) {
      dep.eventos.set(tipo, {
        id: tipo,
        label: f.tipoLabel || etiquetaTipoArchivo(tipo),
        count: 0,
        items: [],
      });
    }
    const ev = dep.eventos.get(tipo);
    ev.count += 1;
    ev.items.push(f);
  }

  return [...tiendas.values()]
    .map((t) => ({
      ...t,
      departamentos: [...t.departamentos.values()]
        .map((d) => ({
          ...d,
          eventos: [...d.eventos.values()]
            .map((ev) => ({
              ...ev,
              items: [...ev.items].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))),
            }))
            .sort(sortByLabel),
        }))
        .sort(sortByLabel),
    }))
    .sort(sortByLabel);
}
