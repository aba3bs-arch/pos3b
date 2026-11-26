/**
 * Al guardar/corregir Corte de caja, empuja el Total sistema (neto registrado)
 * al campo «venta» del Corte Abarrotes abierto (misma sucursal).
 *
 * Un turno = una clave. Si ese monto ya está en el campo (corte previo del
 * mismo turno, o alguien lo capturó en el celular para calcular la recolección),
 * guardar o corregir lo actualiza. No se vuelve a sumar.
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

function turnoDeClaveVentaPos(clave) {
  const { turnoId } = parseClaveVentaPos(clave);
  return turnoCanonVentaPos(turnoId, turnoId);
}

function diasEntreClavesVenta(a, b) {
  const fa = parseClaveVentaPos(a).fecha;
  const fb = parseClaveVentaPos(b).fecha;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fa) || !/^\d{4}-\d{2}-\d{2}$/.test(fb)) return 99;
  const da = Date.parse(`${fa}T00:00:00Z`);
  const db = Date.parse(`${fb}T00:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 99;
  return Math.abs(Math.round((db - da) / 86400000));
}

/**
 * El mismo turno no se cuenta dos veces (fecha de negocio y fecha calendario,
 * o un cierre de más temprano que dejó el mismo dinero).
 * Se queda la clave que se está guardando.
 */
function quitarMismoTurnoDuplicado(map, clave, { ventaCampo = 0, monto = 0 } = {}) {
  const next = { ...map };
  const turno = turnoDeClaveVentaPos(clave);
  if (!turno) return next;
  for (const k of Object.keys(next)) {
    if (k === clave || turnoDeClaveVentaPos(k) !== turno) continue;
    if (diasEntreClavesVenta(clave, k) > 1) continue;
    const otro = round2(next[k]);
    const mismoDinero = Math.abs(otro - monto) < 0.01
      || Math.abs(otro - ventaCampo) < 0.01
      || Math.abs(ventaCampo - (otro + monto)) < 0.01;
    if (mismoDinero) delete next[k];
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
  let compact = compactarMapaVentaPos(raw);
  const grupos = {};
  for (const k of Object.keys(compact)) {
    const turno = turnoDeClaveVentaPos(k);
    if (!grupos[turno]) grupos[turno] = [];
    grupos[turno].push(k);
  }
  for (const keys of Object.values(grupos)) {
    if (keys.length < 2) continue;
    keys.sort();
    const conservar = keys[keys.length - 1];
    for (const k of keys) {
      if (k === conservar) continue;
      if (diasEntreClavesVenta(conservar, k) > 1) continue;
      delete compact[k];
    }
  }
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
 * Actualiza el mapa venta_pos_por_corte.
 * El mismo turno se reemplaza. Si el campo ya trae una venta capturada a mano
 * (no coincide con la suma de los cortes), esa captura se sustituye por el
 * Total sistema: no se le suma encima.
 * @param {object} estado
 * @param {{ clave?: string, fecha?: string, turnoId?: string, turnoNombre?: string, totalVentas?: number, clavesReemplazar?: string[] }} aporte
 */
export function aplicarVentaPosEnEstadoAbarrotes(estado = {}, aporte = {}) {
  const clave = canonicalizarClaveVentaPos(
    String(aporte.clave || claveVentaPosCorteCaja(aporte) || '').trim(),
    aporte.turnoNombre,
  );
  if (!clave) return { ...estado };
  const baseMap = compactarMapaVentaPos(estado.venta_pos_por_corte);
  for (const old of aporte.clavesReemplazar || []) {
    const ck = canonicalizarClaveVentaPos(old, aporte.turnoNombre);
    if (ck) delete baseMap[ck];
    if (old) delete baseMap[old];
  }
  const ventaCampo = round2(estado.venta);
  const turno = turnoDeClaveVentaPos(clave);
  let sumaOtros = 0;
  let sumaEste = 0;
  for (const [k, v] of Object.entries(baseMap)) {
    const parte = round2(v);
    if (turnoDeClaveVentaPos(k) === turno) sumaEste = round2(sumaEste + parte);
    else sumaOtros = round2(sumaOtros + parte);
  }
  const sumaAntes = round2(sumaOtros + sumaEste);
  const monto = round2(aporte.totalVentas ?? aporte.efectivoEsperado);
  // Captura a mano: el campo no es la suma de los cortes ni solo los otros turnos.
  const capturaManual = ventaCampo > 0.009
    && Math.abs(ventaCampo - sumaAntes) > 0.009
    && Math.abs(ventaCampo - sumaOtros) > 0.009;
  let map = quitarMismoTurnoDuplicado(baseMap, clave, { ventaCampo, monto });
  if (capturaManual) {
    // Lo que dejaron en el campo (celular / cálculo de recolección) se sustituye
    // por este Total sistema. No se suma a los turnos que ya estaban.
    map = {};
  }
  map[clave] = monto;
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
