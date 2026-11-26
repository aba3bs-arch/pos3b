/**
 * Al guardar/corregir Corte de caja, empuja el Total sistema (neto registrado)
 * al campo «venta» del Corte Abarrotes abierto (misma sucursal).
 *
 * Un turno = una clave. Corregir reemplaza el monto; no suma otra vez.
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function sumaMapa(map) {
  return round2(
    Object.values(map || {}).reduce((a, v) => a + (Number(v) || 0), 0),
  );
}

/** Fecha de negocio Nogales; no usar slice UTC de un timestamptz (≥17:00 salta de día). */
export function ymdClaveVentaPos(fecha) {
  const s = String(fecha || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Datetime sin zona: conservar el calendario escrito (tests / inputs locales).
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    return s.slice(0, 10);
  }
  if (!s) return '';
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-CA', { timeZone: 'America/Hermosillo' });
    }
  } catch {
    /* ignore */
  }
  return s.slice(0, 10);
}

/**
 * Familia estable del turno (diurno / nocturno / …).
 * «Turno diurno», «diurno» y mayúsculas son el mismo turno.
 */
export function turnoCanonVentaPos(turnoId, turnoNombre = '') {
  const id = String(turnoId || '').trim();
  const idl = id.toLowerCase();
  const nom = String(turnoNombre || id).toLowerCase();
  if (idl === 'diurno' || nom.includes('diurno')) return 'diurno';
  if (idl === 'nocturno' || nom.includes('nocturn')) return 'nocturno';
  if (idl === 'manana' || idl === 'mañana' || nom.includes('mañana') || nom.includes('manana')) return 'manana';
  if (idl === 'tarde' || nom.includes('tarde')) return 'tarde';
  if (idl === 'noche' || nom.includes('noche')) return 'noche';
  return id || 'sin-turno';
}

function parseClaveVentaPos(clave) {
  const raw = String(clave || '').trim();
  const pipe = raw.indexOf('|');
  if (pipe < 0) return { fecha: '', turnoId: raw };
  return { fecha: raw.slice(0, pipe), turnoId: raw.slice(pipe + 1) };
}

/** Clave estable por fecha+turno (corregir reemplaza, no duplica). */
export function claveVentaPosCorteCaja({ fecha, turnoId, turnoNombre } = {}) {
  const f = ymdClaveVentaPos(fecha);
  const t = turnoCanonVentaPos(turnoId, turnoNombre);
  return `${f}|${t}`;
}

export function canonicalizarClaveVentaPos(clave, turnoNombre = '') {
  const { fecha, turnoId } = parseClaveVentaPos(clave);
  if (!fecha && !turnoId) return '';
  return claveVentaPosCorteCaja({ fecha, turnoId, turnoNombre });
}

/**
 * Unifica alias del mismo turno. No suma: si «diurno» y «Turno diurno»
 * aparecen juntos, queda un solo monto (el de la clave canónica, o el último).
 */
export function compactarMapaVentaPos(map = {}) {
  const next = {};
  if (!map || typeof map !== 'object' || Array.isArray(map)) return next;
  for (const [k, v] of Object.entries(map)) {
    const ck = canonicalizarClaveVentaPos(k);
    if (!ck || ck.startsWith('|')) continue;
    next[ck] = round2(v);
  }
  return next;
}

function mapasVentaPosIguales(a, b) {
  const ka = Object.keys(a || {});
  const kb = Object.keys(b || {});
  if (ka.length !== kb.length) return false;
  return ka.every((k) => round2(a[k]) === round2(b[k]));
}

/**
 * Repara un estado ya duplicado (alias de turno o venta = 2× el corte).
 * Si el mapa está vacío, no toca una venta capturada a mano.
 */
export function repararVentaPosEnEstado(estado = {}) {
  const raw = estado.venta_pos_por_corte;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length === 0) {
    return { estado: { ...estado }, cambio: false };
  }
  const compact = compactarMapaVentaPos(raw);
  const sumaRaw = sumaMapa(raw);
  const suma = sumaMapa(compact);
  const prev = round2(estado.venta);
  const unTurno = Object.keys(compact).length === 1;
  const keysCambiaron = !mapasVentaPosIguales(raw, compact);
  let venta = prev;
  let ventaCambio = false;
  if (Object.keys(compact).length > 0) {
    if (Math.abs(prev - sumaRaw) < 0.01 && Math.abs(sumaRaw - suma) > 0.009) {
      venta = suma;
      ventaCambio = true;
    } else if (unTurno && Math.abs(prev - 2 * suma) < 0.01) {
      venta = suma;
      ventaCambio = true;
    } else if (Math.abs(prev - suma) < 0.01) {
      venta = suma;
    }
  }
  const cambio = keysCambiaron || ventaCambio;
  return {
    estado: {
      ...estado,
      venta_pos_por_corte: compact,
      venta,
    },
    cambio,
  };
}

/**
 * Arma el mapa a partir de cortes de caja: un monto por fecha+turno (el más reciente).
 */
export function mapaVentaPosDesdeCortes(cortes = []) {
  const latestTs = {};
  const map = {};
  for (const c of cortes || []) {
    const fecha = ymdClaveVentaPos(c.fecha);
    if (!fecha) continue;
    const clave = claveVentaPosCorteCaja({
      fecha,
      turnoId: c.turno_id || c.turnoId,
      turnoNombre: c.turno_nombre || c.turnoNombre,
    });
    const ts = new Date(c.corregido_at || c.updated_at || c.created_at || c.hora || 0).getTime();
    const t = Number.isFinite(ts) ? ts : 0;
    if (latestTs[clave] != null && t < latestTs[clave]) continue;
    latestTs[clave] = t;
    map[clave] = round2(c.total_ventas ?? c.totalVentas);
  }
  return map;
}

/**
 * Actualiza el mapa venta_pos_por_corte y recalcula estado.venta = suma.
 * Corregir el mismo turno reemplaza el monto; no agrega otra clave.
 * @param {object} estado
 * @param {{ clave?: string, fecha?: string, turnoId?: string, turnoNombre?: string, totalVentas?: number, clavesReemplazar?: string[] }} aporte
 */
export function aplicarVentaPosEnEstadoAbarrotes(estado = {}, aporte = {}) {
  const clave = canonicalizarClaveVentaPos(
    String(aporte.clave || claveVentaPosCorteCaja(aporte) || '').trim(),
    aporte.turnoNombre,
  );
  if (!clave) return { ...estado };
  const map = compactarMapaVentaPos(estado.venta_pos_por_corte);
  for (const old of aporte.clavesReemplazar || []) {
    const ck = canonicalizarClaveVentaPos(old, aporte.turnoNombre);
    if (ck) delete map[ck];
    if (old) delete map[old];
  }
  const monto = aporte.totalVentas ?? aporte.efectivoEsperado;
  map[clave] = round2(monto);
  return {
    ...estado,
    venta_pos_por_corte: map,
    venta: sumaMapa(map),
  };
}

/**
 * Suma el ajuste del candado (opción registrar venta) a la venta de abarrotes
 * para el cierre/ticket, sin esperar a guardar el Corte de caja.
 */
export function aplicarAjusteRecargaMpEnVentaAbarrotes(estado = {}, montoAjuste, {
  fecha,
  turnoId,
  turnoNombre,
} = {}) {
  const monto = round2(montoAjuste);
  if (!(monto > 0.009)) {
    return { ...estado, venta: round2(estado.venta) };
  }
  const map = compactarMapaVentaPos(estado.venta_pos_por_corte);
  if (Object.keys(map).length > 0) {
    const clave = claveVentaPosCorteCaja({ fecha, turnoId, turnoNombre });
    map[clave] = round2((Number(map[clave]) || 0) + monto);
    return {
      ...estado,
      venta_pos_por_corte: map,
      venta: sumaMapa(map),
    };
  }
  return {
    ...estado,
    venta: round2((Number(estado.venta) || 0) + monto),
  };
}

async function listarCortesPosDeFechas(supabase, sucursal, fechas) {
  const fechasArr = [...new Set((fechas || []).map((f) => ymdClaveVentaPos(f)).filter(Boolean))];
  if (!supabase || !sucursal || !fechasArr.length) return [];
  try {
    const { equivalentesCodigoTienda, normalizarCodigoTienda } = await import('../constants/sucursales.js');
    const vars = equivalentesCodigoTienda(sucursal);
    const sid = vars[0] || normalizarCodigoTienda(sucursal) || sucursal;
    let q = supabase
      .from('cortes_caja')
      .select('id,fecha,turno_id,turno_nombre,total_ventas,created_at,sucursal_id')
      .in('fecha', fechasArr)
      .order('created_at', { ascending: false })
      .limit(80);
    q = vars.length > 1 ? q.in('sucursal_id', vars) : q.eq('sucursal_id', sid);
    const { data, error } = await q;
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

function fechasDesdeMapaYAporte(map, fecha) {
  const out = new Set();
  const f = ymdClaveVentaPos(fecha);
  if (f) out.add(f);
  for (const k of Object.keys(map || {})) {
    const { fecha: fk } = parseClaveVentaPos(k);
    const ymd = ymdClaveVentaPos(fk);
    if (ymd) out.add(ymd);
  }
  return [...out];
}

/**
 * Carga el estado abierto de abarrotes, aplica el Total sistema del corte de caja y guarda.
 * No debe tumbar el guardado del corte de caja si falla.
 */
export async function sincronizarVentaAbarrotesDesdeCorteCaja(supabase, {
  sucursal,
  fecha,
  turnoId,
  turnoNombre,
  totalVentas,
  /** @deprecated usar totalVentas (Total sistema) */
  efectivoEsperado,
  clavesReemplazar = [],
} = {}) {
  if (!sucursal) {
    return { ok: false, skipped: true, error: 'Sin sucursal' };
  }
  const clave = claveVentaPosCorteCaja({ fecha, turnoId, turnoNombre });
  try {
    const { cargarEstadoCorte, guardarEstadoCorte } = await import('./corteContabilidad/store.js');
    const cargado = await cargarEstadoCorte(supabase, sucursal, 'abarrotes');
    if (cargado?.lecturaFallida) {
      return { ok: false, error: cargado.error || 'No se pudo leer el corte de abarrotes' };
    }
    const base = repararVentaPosEnEstado(cargado?.estado || {}).estado;
    let map = compactarMapaVentaPos(base.venta_pos_por_corte);
    const fechas = fechasDesdeMapaYAporte(map, fecha);
    const cortesNube = await listarCortesPosDeFechas(supabase, sucursal, fechas);
    if (cortesNube.length) {
      const fromDb = mapaVentaPosDesdeCortes(cortesNube);
      const fechasSet = new Set(fechas);
      for (const k of Object.keys(map)) {
        const { fecha: fk } = parseClaveVentaPos(k);
        if (fechasSet.has(ymdClaveVentaPos(fk))) delete map[k];
      }
      map = { ...map, ...fromDb };
    }
    const next = aplicarVentaPosEnEstadoAbarrotes(
      { ...base, venta_pos_por_corte: map },
      {
        clave,
        fecha,
        turnoId,
        turnoNombre,
        totalVentas: totalVentas ?? efectivoEsperado,
        clavesReemplazar,
      },
    );
    const guardado = await guardarEstadoCorte(supabase, sucursal, 'abarrotes', next);
    if (!guardado?.ok) {
      return { ok: false, error: guardado?.error || 'No se pudo guardar venta en abarrotes' };
    }
    return {
      ok: true,
      clave,
      venta: next.venta,
      soloLocal: !!guardado.soloLocal,
      aviso: guardado.aviso,
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
