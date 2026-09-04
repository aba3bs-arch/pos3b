import { estadoDefault, normalizarEstadoVirtual, detalleRecoleccionParaIe } from './calc.js';
import {
  esAprobadorRecoleccionIe,
  recoleccionAprobadaParaIe,
} from '../contabilidadConstants.js';
import {
  TIPOS_NOTIF,
  crearNotificacion,
  marcarNotificacionAtendida,
} from '../contabilidadNotificaciones.js';
import { etiquetaTienda, normalizarCodigoTienda } from '../../constants/sucursales.js';
import { normalizarNombreProveedorClave, registrarEntregaDesdeGastoAbarrotes } from '../proveedorEntregas.js';

const MARKER_TRP_INV = 'TRP_INV:';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function fmtMonto(n) {
  return `$${round2(n).toFixed(2)}`;
}

function parseFoliosLista(raw) {
  if (Array.isArray(raw)) return raw.map((x) => String(x || '').trim()).filter(Boolean);
  if (raw == null) return [];
  return String(raw)
    .split(/[\s,;\n]+/g)
    .map((x) => String(x || '').trim())
    .filter(Boolean);
}

/** Folio trp-0020 (inventario_traspasos.folio). */
function normalizarFolioTrp(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return '';
  const mTrp = s.match(/^trp-?(\d+)$/i);
  if (mTrp) {
    const digits = mTrp[1];
    const ancho = digits.length <= 4 ? 4 : digits.length;
    return `trp-${digits.padStart(ancho, '0')}`;
  }
  if (/^\d+$/.test(s)) {
    const ancho = s.length <= 4 ? 4 : s.length;
    return `trp-${s.padStart(ancho, '0')}`;
  }
  return s.startsWith('trp-') ? s : `trp-${s}`;
}

function parseFoliosTraspaso(raw) {
  const out = parseFoliosLista(raw).map((x) => normalizarFolioTrp(x)).filter(Boolean);
  return [...new Set(out)];
}

function esGastoTraspasoAbarrotes(modulo, gasto) {
  if (String(modulo || '').toLowerCase() !== 'abarrotes') return false;
  const raw = `${gasto?.categoria || ''} ${gasto?.subcategoria || ''} ${gasto?.comentario || ''}`;
  const k = normalizarNombreProveedorClave(raw);
  return k.includes('TRASPASO') || k.includes('ENVIO MAIN');
}

function totalTraspasoLineas(lineas, campo = 'precio') {
  const arr = Array.isArray(lineas) ? lineas : [];
  return round2(
    arr.reduce((a, l) => {
      const qty = Math.max(0, Math.floor(Number(l?.cantidad) || 0));
      const val = Number(l?.[campo]) || 0;
      return a + val * qty;
    }, 0),
  );
}

export const AVISO_FALTA_CORTES =
  'Faltan tablas de cortes contabilidad. En Supabase → SQL Editor ejecuta: supabase/fix_cortes_contabilidad.sql';

export const AVISO_FALTA_SOFT_DELETE_CIERRES =
  'Para recuperar cortes borrados, en Supabase → SQL Editor ejecuta: supabase/fix_cortes_contabilidad_soft_delete.sql';

const PREFIJOS = { virtual: 'V', abarrotes: 'AB', garage: 'G' };

/** Módulos de corte contable (referencia). El anti-duplicado de gastos aplica solo a Abarrotes. */
export const MODULOS_CORTE = ['virtual', 'abarrotes', 'garage'];

const ETIQUETA_MODULO_CORTE = {
  virtual: 'Corte Virtual',
  abarrotes: 'Corte Abarrotes',
  garage: 'Corte Garage',
};

export function etiquetaModuloCorte(modulo) {
  const m = String(modulo || '').toLowerCase();
  return ETIQUETA_MODULO_CORTE[m] || String(modulo || 'corte').toUpperCase();
}

function normalizarTxtGasto(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Huella para detectar el mismo gasto capturado dos veces en Abarrotes. */
export function huellaGastoCorte(gasto) {
  return {
    categoria: normalizarTxtGasto(gasto?.categoria),
    subcategoria: normalizarTxtGasto(gasto?.subcategoria),
    monto: round2(gasto?.monto),
    usuario_id: gasto?.usuario_id != null && gasto.usuario_id !== '' ? String(gasto.usuario_id) : '',
  };
}

function mismoGastoHuella(a, b) {
  if (!a || !b) return false;
  if (a.monto !== b.monto) return false;
  if (a.categoria !== b.categoria) return false;
  if (a.subcategoria !== b.subcategoria) return false;
  // Si ambos tienen empleado, deben coincidir; si ninguno, ok.
  if (a.usuario_id || b.usuario_id) return a.usuario_id === b.usuario_id;
  return true;
}

/**
 * Solo Corte Abarrotes: busca el mismo gasto (monto + cat + sub [+ empleado])
 * ya abierto en Abarrotes (ventana reciente).
 * Virtual y Garage no generan compras/proveedores ni folios ING/CMP — no aplica ahí.
 */
export async function buscarGastosDuplicadosEntreModulos(supabase, {
  sucursal,
  moduloOrigen,
  gasto,
  horasVentana = 48,
} = {}) {
  const origen = String(moduloOrigen || '').toLowerCase();
  if (origen !== 'abarrotes') return [];

  const sid = normalizarCodigoTienda(sucursal) || 'MAIN';
  const huella = huellaGastoCorte(gasto);
  if (!(huella.monto > 0) || !huella.categoria) return [];

  const desde = new Date(Date.now() - Math.max(1, horasVentana) * 60 * 60 * 1000).toISOString();
  const candidatos = [];

  if (!supabase) {
    try {
      const raw = localStorage.getItem(lsKey(sid, 'abarrotes', 'gastos'));
      const list = raw ? JSON.parse(raw) : [];
      for (const g of list || []) {
        if (g?.cerrado === true) continue;
        candidatos.push({ ...g, modulo: g.modulo || 'abarrotes' });
      }
    } catch {
      /* ignore */
    }
  } else {
    const { data, error } = await supabase
      .from('cortes_contabilidad_gastos')
      .select('id,modulo,categoria,subcategoria,monto,comentario,usuario_id,usuario_nombre,created_at,cerrado')
      .eq('sucursal_id', sid)
      .eq('modulo', 'abarrotes')
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      // Si falla la consulta, no bloqueamos el alta (mejor UX offline/schema viejo).
      return [];
    }
    for (const g of data || []) {
      if (g?.cerrado === true) continue;
      candidatos.push(g);
    }
  }

  return candidatos.filter((g) => mismoGastoHuella(huella, huellaGastoCorte(g)));
}

function mensajeGastoDuplicado(duplicados, moduloDestino) {
  const lineas = (duplicados || []).slice(0, 5).map((g) => {
    const cuando = g.created_at
      ? new Date(g.created_at).toLocaleString('es-MX', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';
    const emp = g.usuario_nombre ? ` · ${g.usuario_nombre}` : '';
    return `• ${g.categoria || '—'}${g.subcategoria ? ` / ${g.subcategoria}` : ''} · ${fmtMonto(g.monto)}${emp} · ${cuando}`;
  });
  return (
    `Este gasto ya está registrado en Corte Abarrotes.\n\n` +
    `${lineas.join('\n')}\n\n` +
    `No lo registres otra vez: se contaría doble en caja e IE Abarrotes.\n\n` +
    `Si realmente es otro gasto distinto, confirma para forzarlo.`
  );
}

function lsKey(sucursal, modulo, tipo) {
  return `pos3b_corte_${tipo}_${modulo}_${sucursal || 'MAIN'}`;
}

function faltaTabla(error, hint) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes(hint) || (msg.includes('schema cache') && msg.includes(hint));
}

function faltaColumnaDeletedAt(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes('deleted_at') &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache') || msg.includes('column'))
  );
}

export async function cargarEstadoCorte(supabase, sucursal, modulo) {
  const def = estadoDefault(modulo);
  if (!supabase) {
    try {
      const raw = localStorage.getItem(lsKey(sucursal, modulo, 'estado'));
      let estado = raw ? { ...def, ...JSON.parse(raw) } : def;
      if (modulo === 'virtual') estado = normalizarEstadoVirtual(estado);
      return { estado, soloLocal: true };
    } catch {
      return { estado: def, soloLocal: true };
    }
  }
  const { data, error } = await supabase
    .from('cortes_contabilidad_estado')
    .select('estado')
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('modulo', modulo)
    .maybeSingle();
  if (error && faltaTabla(error, 'cortes_contabilidad')) {
    return { estado: def, aviso: AVISO_FALTA_CORTES, soloLocal: true };
  }
  if (error) return { estado: def, error: error.message };
  const estado = { ...def, ...(data?.estado || {}) };
  if (modulo === 'virtual') {
    return { estado: normalizarEstadoVirtual(estado), soloLocal: false };
  }
  if (modulo === 'garage') {
    const defM = estadoDefault('garage').maquinas;
    const prev = estado.maquinas || {};
    estado.maquinas = Object.fromEntries(Object.keys(defM).map((k) => [k, Number(prev[k]) || 0]));
  }
  return { estado, soloLocal: false };
}

export async function guardarEstadoCorte(supabase, sucursal, modulo, estado) {
  if (!supabase) {
    localStorage.setItem(lsKey(sucursal, modulo, 'estado'), JSON.stringify(estado));
    return { ok: true, soloLocal: true };
  }
  const row = {
    sucursal_id: sucursal || 'MAIN',
    modulo,
    estado,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('cortes_contabilidad_estado').upsert(row, { onConflict: 'sucursal_id,modulo' });
  if (error && faltaTabla(error, 'cortes_contabilidad')) {
    localStorage.setItem(lsKey(sucursal, modulo, 'estado'), JSON.stringify(estado));
    return { ok: true, aviso: AVISO_FALTA_CORTES, soloLocal: true };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listarGastosTurno(supabase, sucursal, modulo) {
  const sid = sucursal || 'MAIN';
  if (!supabase) {
    try {
      const raw = localStorage.getItem(lsKey(sid, modulo, 'gastos'));
      return { data: raw ? JSON.parse(raw) : [] };
    } catch {
      return { data: [] };
    }
  }
  const { data, error } = await supabase
    .from('cortes_contabilidad_gastos')
    .select('*')
    .eq('sucursal_id', sid)
    .eq('modulo', modulo)
    .order('created_at', { ascending: true });
  if (error && faltaTabla(error, 'cortes_contabilidad_gastos')) {
    try {
      const raw = localStorage.getItem(lsKey(sid, modulo, 'gastos'));
      return { data: raw ? JSON.parse(raw) : [], aviso: AVISO_FALTA_CORTES };
    } catch {
      return { data: [], aviso: AVISO_FALTA_CORTES };
    }
  }
  if (error) return { data: [], error: error.message };

  // Solo gastos del turno abierto (cerrado !== true; incluye null legacy).
  const abiertos = (data || []).filter((g) => g.cerrado !== true);
  try {
    localStorage.setItem(lsKey(sid, modulo, 'gastos'), JSON.stringify(abiertos));
  } catch {
    /* ignore */
  }
  return { data: abiertos, error: null };
}

export async function agregarGastoTurno(supabase, sucursal, modulo, gasto, opts = {}) {
  const catUpper = String(gasto.categoria || '').toUpperCase();
  // No van a IE: recuperación inversión, envío MAIN→tienda (solo bajan caja del corte).
  const omitirIe =
    opts.omitirIe === true ||
    catUpper === 'INVERSION OFICINA' ||
    catUpper === 'ENVIO MAIN' ||
    catUpper === 'VALE MAIN';
  // Gastos de corte: sin aprobación. Solo vales y préstamos (otros módulos) requieren admin.
  const estadoAprobacion = 'aprobado';

  // Solo Abarrotes: evita el mismo gasto (proveedores/compras) dos veces en el corte.
  // Virtual y Garage no manejan compras ni folios de inventario.
  if (
    !opts.forzarDuplicado &&
    !opts.omitirChequeoDuplicado &&
    String(modulo || '').toLowerCase() === 'abarrotes'
  ) {
    const duplicados = await buscarGastosDuplicadosEntreModulos(supabase, {
      sucursal,
      moduloOrigen: modulo,
      gasto,
    });
    if (duplicados.length) {
      return {
        ok: false,
        duplicado: true,
        duplicados,
        error: mensajeGastoDuplicado(duplicados, modulo),
      };
    }
  }

  let comentarioFinal = String(gasto.comentario || '');

  // Traspaso (Abarrotes): exigir folio trp-XXXX del módulo Productos → Traspasos.
  const esTraspaso =
    String(modulo || '').toLowerCase() === 'abarrotes' && esGastoTraspasoAbarrotes(modulo, gasto);
  let foliosTraspaso = esTraspaso
    ? parseFoliosTraspaso(gasto.folio_traspaso || gasto.foliosTraspaso || gasto.folios_traspaso)
    : [];

  if (esTraspaso) {
    if (!foliosTraspaso.length) {
      return {
        ok: false,
        error:
          'Traspaso requiere el folio del envío (ej. trp-0020).\n\n' +
          'Ve a Productos → Traspasos → Recibir (o historial del traspaso) y copia el folio trp-XXXX.',
      };
    }

    if (supabase) {
      const sid = normalizarCodigoTienda(sucursal) || 'MAIN';
      const traspasosByFolio = new Map();

      for (const folioTrp of foliosTraspaso) {
        const { data: doc, error: eTrp } = await supabase
          .from('inventario_traspasos')
          .select('id,folio,estado,tipo,origen_id,destino_id,lineas')
          .eq('folio', folioTrp)
          .maybeSingle();
        if (eTrp) return { ok: false, error: eTrp.message };
        if (!doc) {
          return {
            ok: false,
            error:
              `No existe traspaso ${folioTrp} en inventario.\n\n` +
              'Confirma en Productos → Traspasos que el folio trp-XXXX esté en la nube (estado enviado o recibido).',
          };
        }
        if (String(doc.tipo || '') !== 'envio') {
          return {
            ok: false,
            error:
              `El folio ${folioTrp} no es un envío despachado.\n\n` +
              'Solo traspasos enviados/recibidos pueden ligarse al gasto.',
          };
        }
        const est = String(doc.estado || '').toLowerCase();
        if (est !== 'enviado' && est !== 'recibido') {
          return {
            ok: false,
            error:
              `Traspaso ${folioTrp} no está listo (estado: ${doc.estado}).\n\n` +
              'Debe estar enviado o recibido antes de registrar el gasto.',
          };
        }
        const dest = normalizarCodigoTienda(doc.destino_id);
        if (dest !== sid) {
          return {
            ok: false,
            error:
              `Traspaso ${folioTrp} es para ${etiquetaTienda(dest)}, no para esta tienda (${etiquetaTienda(sid)}).\n\n` +
              'Usa el folio del traspaso recibido en esta sucursal.',
          };
        }
        traspasosByFolio.set(folioTrp, doc);
      }

      const montoGastoTrp = round2(Number(gasto.monto) || 0);
      const sumPrecio = round2(
        foliosTraspaso.reduce((a, f) => a + totalTraspasoLineas(traspasosByFolio.get(f)?.lineas, 'precio'), 0),
      );
      const sumCosto = round2(
        foliosTraspaso.reduce((a, f) => a + totalTraspasoLineas(traspasosByFolio.get(f)?.lineas, 'costo'), 0),
      );
      const cuadra =
        Math.abs(sumPrecio - montoGastoTrp) <= 0.01 || Math.abs(sumCosto - montoGastoTrp) <= 0.01;
      if (!cuadra) {
        return {
          ok: false,
          error:
            'Monto del gasto no coincide con el traspaso.\n\n' +
            `Folio(s): ${foliosTraspaso.join(', ')}\n` +
            `Valor traspaso (precio): ${fmtMonto(sumPrecio)} · costo: ${fmtMonto(sumCosto)}\n` +
            `Gasto capturado: ${fmtMonto(montoGastoTrp)}\n\n` +
            'Si fueron varios traspasos parciales, captura todos los folios trp-XXXX hasta que cuadre.',
        };
      }

      const { data: gastosTrpPrev, error: eTrpPrev } = await supabase
        .from('cortes_contabilidad_gastos')
        .select('id,comentario')
        .eq('sucursal_id', sid)
        .eq('modulo', modulo)
        .ilike('comentario', `%${MARKER_TRP_INV}%`)
        .limit(500);

      if (eTrpPrev) return { ok: false, error: eTrpPrev.message };

      const foliosTrpUsados = new Map();
      for (const g of gastosTrpPrev || []) {
        const str = String(g?.comentario || '');
        const up = str.toUpperCase();
        const idx = up.indexOf(MARKER_TRP_INV);
        if (idx < 0) continue;
        const rest = str.slice(idx + MARKER_TRP_INV.length);
        for (const f of parseFoliosTraspaso(rest)) {
          if (!foliosTrpUsados.has(f)) foliosTrpUsados.set(f, g.id);
        }
      }

      const trpRepetidos = foliosTraspaso.filter((f) => foliosTrpUsados.has(f));
      if (trpRepetidos.length) {
        const first = foliosTrpUsados.get(trpRepetidos[0]);
        return {
          ok: false,
          error:
            'Folio(s) trp-XXXX ya usados en otro gasto de traspaso.\n\n' +
            `Repite: ${trpRepetidos.join(', ')}\n` +
            (first ? `Gasto existente: ${first}\n\n` : '\n\n') +
            'No se puede duplicar el gasto del mismo traspaso.',
        };
      }
    }

    const markerTrp = `${MARKER_TRP_INV}${foliosTraspaso.join(',')}`;
    comentarioFinal = comentarioFinal.trim()
      ? `${comentarioFinal.trim()} · ${markerTrp}`.toUpperCase()
      : markerTrp.toUpperCase();
  }

  const row = {
    sucursal_id: sucursal || 'MAIN',
    modulo,
    categoria: gasto.categoria || 'GENERAL',
    subcategoria: gasto.subcategoria || '',
    comentario: comentarioFinal || '',
    monto: Number(gasto.monto) || 0,
    usuario_id: gasto.usuario_id || null,
    usuario_nombre: gasto.usuario_nombre || null,
    cerrado: false,
    estado_aprobacion: estadoAprobacion,
    solicitado_por: opts.nombreActor || null,
  };
  if (!supabase) {
    const { data: prev } = await listarGastosTurno(null, sucursal, modulo);
    const next = [...(prev || []), { ...row, id: `local-${Date.now()}`, created_at: new Date().toISOString() }];
    localStorage.setItem(lsKey(sucursal, modulo, 'gastos'), JSON.stringify(next));
    return { ok: true, data: next };
  }
  const { data, error } = await supabase.from('cortes_contabilidad_gastos').insert([row]).select('*').single();
  if (error) return { ok: false, error: error.message };
  // Matriz de entregas: si es gasto PROVEEDORES en Abarrotes, anota día + nombre.
  if (String(modulo || '').toLowerCase() === 'abarrotes') {
    try {
      await registrarEntregaDesdeGastoAbarrotes(supabase, {
        sucursalId: row.sucursal_id,
        categoria: row.categoria,
        subcategoria: row.subcategoria,
        fecha: data?.created_at || new Date(),
      });
    } catch {
      /* no bloquea el corte */
    }
  }
  // Gastos aplican en corte sin aprobación.
  // Virtual/Garage → IE solo con recolección aprobada (gastos_ids).
  // Abarrotes → IE ABARROTES al cerrar/registrar (no hay recolección en ese módulo).
  // (omitirIe = nunca van a IE: inversión oficina, envío MAIN, etc.).
  return { ok: true, data, omitirIe: Boolean(omitirIe) };
}

export async function aprobarGastoTurno(supabase, gastoId, { nombre } = {}) {
  if (!supabase || !gastoId) return { ok: false, error: 'Gasto inválido.' };
  const { data, error } = await supabase
    .from('cortes_contabilidad_gastos')
    .update({
      estado_aprobacion: 'aprobado',
      aprobado_por: nombre || null,
      aprobado_at: new Date().toISOString(),
    })
    .eq('id', gastoId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'cortes_contabilidad_gastos', gastoId, nombre);
  // No enviar a IE aquí: los egresos de corte viajan con la recolección aprobada.
  return { ok: true, gasto: data };
}

export async function rechazarGastoTurno(supabase, gastoId, { nombre } = {}) {
  if (!supabase || !gastoId) return { ok: false, error: 'Gasto inválido.' };
  const { error } = await supabase
    .from('cortes_contabilidad_gastos')
    .update({ estado_aprobacion: 'rechazado', aprobado_por: nombre || null, aprobado_at: new Date().toISOString() })
    .eq('id', gastoId);
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'cortes_contabilidad_gastos', gastoId, nombre);
  return { ok: true };
}

/** Lista gastos pendientes de aprobación (admin) para un módulo/sucursal. */
export async function listarGastosPendientesAprobacion(supabase, sucursal, modulo) {
  if (!supabase) return { data: [], error: null };
  let q = supabase
    .from('cortes_contabilidad_gastos')
    .select('*')
    .eq('estado_aprobacion', 'pendiente_admin')
    .order('created_at', { ascending: true });
  if (sucursal) q = q.eq('sucursal_id', sucursal || 'MAIN');
  if (modulo) q = q.eq('modulo', modulo);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: data || [], error: null };
}

/**
 * Aprueba todos los gastos pendientes del módulo (p. ej. virtual) y los refleja en IE.
 * Si sucursal es null, aprueba de todas las tiendas del módulo.
 */
export async function aprobarTodosGastosPendientes(supabase, { sucursal, modulo, nombre } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', aprobados: 0 };
  const { data, error } = await listarGastosPendientesAprobacion(supabase, sucursal, modulo);
  if (error) return { ok: false, error, aprobados: 0 };
  if (!data.length) return { ok: true, aprobados: 0, pendientes: 0 };

  let okCount = 0;
  const fallos = [];
  for (const g of data) {
    const res = await aprobarGastoTurno(supabase, g.id, { nombre });
    if (res.ok) okCount += 1;
    else fallos.push(res.error || g.id);
  }
  return {
    ok: fallos.length === 0,
    aprobados: okCount,
    pendientes: data.length,
    error: fallos.length ? fallos[0] : null,
  };
}

export function gastoCuentaEnCorte(gasto) {
  const est = gasto?.estado_aprobacion || 'aprobado';
  return est === 'aprobado';
}

export async function eliminarGastoTurno(supabase, id, sucursal, modulo) {
  if (!supabase) {
    const { data: prev } = await listarGastosTurno(null, sucursal, modulo);
    const next = (prev || []).filter((g) => String(g.id) !== String(id));
    localStorage.setItem(lsKey(sucursal, modulo, 'gastos'), JSON.stringify(next));
    return { ok: true };
  }
  // Si el gasto venía de un RIF vencido, marcar el RIF (corte se ajusta solo al borrar).
  try {
    const { data: gasto } = await supabase
      .from('cortes_contabilidad_gastos')
      .select('id,categoria,comentario')
      .eq('id', id)
      .maybeSingle();
    if (gasto && String(gasto.categoria || '').toUpperCase() === 'FONDO_REQUERIDO') {
      const { marcarGastoRifEliminado } = await import('../rifs.js');
      await marcarGastoRifEliminado(supabase, id);
    }
  } catch {
    /* ignore */
  }
  const { error } = await supabase.from('cortes_contabilidad_gastos').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function actualizarGastoTurno(supabase, id, patch, sucursal, modulo) {
  if (!id) return { ok: false, error: 'Sin ID de gasto.' };
  const row = {};
  if (patch.monto != null) row.monto = Number(patch.monto) || 0;
  if (patch.categoria != null) row.categoria = String(patch.categoria).trim().toUpperCase();
  if (patch.subcategoria != null) row.subcategoria = String(patch.subcategoria).trim().toUpperCase();
  if (patch.comentario != null) row.comentario = String(patch.comentario).trim().toUpperCase();
  if (patch.usuario_id != null) row.usuario_id = patch.usuario_id;
  if (patch.usuario_nombre != null) row.usuario_nombre = patch.usuario_nombre;

  if (!supabase) {
    const { data: prev } = await listarGastosTurno(null, sucursal, modulo);
    const next = (prev || []).map((g) => (String(g.id) === String(id) ? { ...g, ...row } : g));
    localStorage.setItem(lsKey(sucursal, modulo, 'gastos'), JSON.stringify(next));
    return { ok: true };
  }
  const { error } = await supabase.from('cortes_contabilidad_gastos').update(row).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Cierra los gastos del turno abierto para que el siguiente corte arranque en $0.
 * Los registros permanecen (historial / nómina) con cerrado=true.
 * @param {string[]|null} idsOpcionales — IDs en memoria del corte actual (más fiable).
 */
export async function limpiarGastosTurno(supabase, sucursal, modulo, idsOpcionales = null) {
  const sid = sucursal || 'MAIN';
  try {
    localStorage.setItem(lsKey(sid, modulo, 'gastos'), '[]');
  } catch {
    /* ignore */
  }

  if (!supabase) {
    return { ok: true, count: 0, soloLocal: true };
  }

  const idsSet = new Set(
    (idsOpcionales || []).map((id) => String(id)).filter((id) => id && !id.startsWith('local-')),
  );

  // Captura también cualquier gasto abierto que no esté en memoria (otro dispositivo / race).
  const { data: rows, error: eList } = await supabase
    .from('cortes_contabilidad_gastos')
    .select('id, cerrado')
    .eq('sucursal_id', sid)
    .eq('modulo', modulo);

  if (eList) {
    if (faltaTabla(eList, 'cortes_contabilidad_gastos')) {
      return { ok: true, count: 0, aviso: AVISO_FALTA_CORTES, soloLocal: true };
    }
    return { ok: false, error: eList.message, count: 0 };
  }

  for (const g of rows || []) {
    if (g.cerrado !== true) idsSet.add(String(g.id));
  }

  const ids = [...idsSet];
  if (!ids.length) return { ok: true, count: 0 };

  const { data: updated, error } = await supabase
    .from('cortes_contabilidad_gastos')
    .update({ cerrado: true })
    .in('id', ids)
    .select('id');

  if (error) return { ok: false, error: error.message, count: 0 };

  // Verificación: no debe quedar ninguno abierto en esta sucursal/módulo.
  const { data: quedan, error: eCheck } = await supabase
    .from('cortes_contabilidad_gastos')
    .select('id, cerrado')
    .eq('sucursal_id', sid)
    .eq('modulo', modulo);

  if (eCheck) return { ok: false, error: eCheck.message, count: (updated || []).length };

  const abiertos = (quedan || []).filter((g) => g.cerrado !== true);
  if (abiertos.length > 0) {
    // Segundo intento por si el primer update no aplicó a todos.
    const retryIds = abiertos.map((g) => g.id);
    const { error: e2 } = await supabase
      .from('cortes_contabilidad_gastos')
      .update({ cerrado: true })
      .in('id', retryIds)
      .select('id');
    if (e2) {
      return {
        ok: false,
        error: `Quedaron ${abiertos.length} gastos abiertos: ${e2.message}`,
        count: (updated || []).length,
      };
    }
    return { ok: true, count: ids.length, retried: retryIds.length };
  }

  return { ok: true, count: (updated || ids).length };
}

/**
 * Cierra gastos huérfanos: siguen abiertos pero ya están en el detalle de un cierre.
 * Corrige turnos donde limpiarGastosTurno falló o se ignoró el error.
 *
 * Garage: gastos/faltantes se snapshottean en cierres y recolecciones temporales a propósito
 * (persisten hasta máquinas en cero). Solo una recolección definitiva (`tipo_cierre === 'recoleccion'`)
 * debe poder marcarlos como huérfanos.
 */
export async function cerrarGastosHuerfanosTrasCierre(supabase, sucursal, modulo) {
  const sid = sucursal || 'MAIN';
  if (!supabase) return { ok: true, count: 0 };

  const [{ data: abiertos, error: eAb }, { data: cierres, error: eCi }] = await Promise.all([
    supabase
      .from('cortes_contabilidad_gastos')
      .select('id, cerrado')
      .eq('sucursal_id', sid)
      .eq('modulo', modulo),
    supabase
      .from('cortes_contabilidad_cierres')
      .select('id, detalle, created_at')
      .eq('sucursal_id', sid)
      .eq('modulo', modulo)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (eAb || eCi) return { ok: false, error: (eAb || eCi).message, count: 0 };

  const idsEnCierres = new Set();
  for (const c of cierres || []) {
    if (modulo === 'garage') {
      const tipo = String(c?.detalle?.tipo_cierre || '').toLowerCase();
      // Solo recolección definitiva cierra el periodo; cierre / temporal dejan gastos abiertos.
      if (tipo !== 'recoleccion') continue;
    }
    const lista = c?.detalle?.gastos;
    if (!Array.isArray(lista)) continue;
    for (const g of lista) {
      if (g?.id) idsEnCierres.add(String(g.id));
    }
  }

  const huerfanos = (abiertos || []).filter(
    (g) => g.cerrado !== true && idsEnCierres.has(String(g.id)),
  );
  if (!huerfanos.length) return { ok: true, count: 0 };

  const ids = huerfanos.map((g) => g.id);
  const limpia = await limpiarGastosTurno(supabase, sid, modulo, ids);
  return { ok: limpia.ok, count: ids.length, error: limpia.error };
}

export async function peekFolio(supabase, sucursal, modulo) {
  const prefijo = PREFIJOS[modulo] || 'X';
  if (!supabase) {
    const key = lsKey(sucursal, modulo, 'folio');
    const n = (Number(localStorage.getItem(key)) || 0) + 1;
    if (modulo === 'abarrotes') return `AB-${String(n).padStart(3, '0')}`;
    return `${prefijo}-${String(n).padStart(3, '0')}`;
  }
  const sid = sucursal || 'MAIN';
  const { data: row } = await supabase
    .from('cortes_contabilidad_folios')
    .select('ultimo')
    .eq('sucursal_id', sid)
    .eq('modulo', modulo)
    .maybeSingle();
  const n = (Number(row?.ultimo) || 0) + 1;
  if (modulo === 'abarrotes') return `AB-${String(n).padStart(3, '0')}`;
  return `${prefijo}-${String(n).padStart(3, '0')}`;
}

export async function siguienteFolio(supabase, sucursal, modulo) {
  const prefijo = PREFIJOS[modulo] || 'X';
  if (!supabase) {
    const key = lsKey(sucursal, modulo, 'folio');
    const n = (Number(localStorage.getItem(key)) || 0) + 1;
    localStorage.setItem(key, String(n));
    if (modulo === 'abarrotes') return `AB-${String(n).padStart(3, '0')}`;
    return `${prefijo}-${String(n).padStart(3, '0')}`;
  }
  const sid = sucursal || 'MAIN';
  const { data: row } = await supabase
    .from('cortes_contabilidad_folios')
    .select('ultimo')
    .eq('sucursal_id', sid)
    .eq('modulo', modulo)
    .maybeSingle();
  const ultimo = (Number(row?.ultimo) || 0) + 1;
  await supabase.from('cortes_contabilidad_folios').upsert(
    { sucursal_id: sid, modulo, ultimo, prefijo },
    { onConflict: 'sucursal_id,modulo' },
  );
  if (modulo === 'abarrotes') return `AB-${String(ultimo).padStart(3, '0')}`;
  return `${prefijo}-${String(ultimo).padStart(3, '0')}`;
}

/** Marca el folio recién usado y devuelve el siguiente (peek). */
export async function folioTrasCierre(supabase, sucursal, modulo, folioUsado) {
  const prefijo = PREFIJOS[modulo] || 'X';
  const nUsado = Number(String(folioUsado || '').replace(/\D/g, '')) || 0;
  const sid = sucursal || 'MAIN';

  if (!supabase) {
    const key = lsKey(sucursal, modulo, 'folio');
    const actual = Number(localStorage.getItem(key)) || 0;
    const ultimo = Math.max(actual, nUsado);
    localStorage.setItem(key, String(ultimo));
    const next = ultimo + 1;
    if (modulo === 'abarrotes') return `AB-${String(next).padStart(3, '0')}`;
    return `${prefijo}-${String(next).padStart(3, '0')}`;
  }

  const { data: row } = await supabase
    .from('cortes_contabilidad_folios')
    .select('ultimo')
    .eq('sucursal_id', sid)
    .eq('modulo', modulo)
    .maybeSingle();
  const ultimo = Math.max(Number(row?.ultimo) || 0, nUsado);
  await supabase.from('cortes_contabilidad_folios').upsert(
    { sucursal_id: sid, modulo, ultimo, prefijo },
    { onConflict: 'sucursal_id,modulo' },
  );
  const next = ultimo + 1;
  if (modulo === 'abarrotes') return `AB-${String(next).padStart(3, '0')}`;
  return `${prefijo}-${String(next).padStart(3, '0')}`;
}

export async function registrarCierreCorte(supabase, payload) {
  if (!supabase) {
    const key = lsKey(payload.sucursal_id, payload.modulo, 'historial');
    let hist = [];
    try {
      hist = JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      hist = [];
    }
    const row = { ...payload, id: `local-${Date.now()}`, created_at: new Date().toISOString() };
    hist.unshift(row);
    localStorage.setItem(key, JSON.stringify(hist.slice(0, 100)));
    return { ok: true, soloLocal: true, data: row };
  }
  const { data, error } = await supabase.from('cortes_contabilidad_cierres').insert([payload]).select('*').single();
  if (error && faltaTabla(error, 'cortes_contabilidad_cierres')) {
    return { ok: false, error: AVISO_FALTA_CORTES };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/** Recolecciones de corte pendientes de ABB/FJBB/JLBB para pasar a IE. */
export async function listarRecoleccionesPendientesIe(supabase, { sucursal = null, limit = 80 } = {}) {
  if (!supabase) return { data: [], error: null };
  let q = supabase
    .from('cortes_contabilidad_cierres')
    .select('*')
    .eq('turno', 'RECOLECCION')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (sucursal) q = q.eq('sucursal_id', sucursal || 'MAIN');
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  const pend = (data || []).filter((c) => {
    const tipo = String(c?.detalle?.tipo_cierre || c?.turno || '').toLowerCase();
    if (tipo !== 'recoleccion') return false;
    return String(c?.detalle?.estado_aprobacion || '').toLowerCase() === 'pendiente_admin';
  });
  return { data: pend, error: null };
}

export async function aprobarRecoleccionCorteIe(supabase, cierreId, { nombre } = {}) {
  if (!supabase || !cierreId) return { ok: false, error: 'Recolección inválida.' };
  if (!esAprobadorRecoleccionIe(nombre)) {
    return { ok: false, error: 'Solo ABB, FJBB o JLBB pueden aprobar la recolección hacia IE.' };
  }
  const { data: row, error: errGet } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('*')
    .eq('id', cierreId)
    .maybeSingle();
  if (errGet) return { ok: false, error: errGet.message };
  if (!row) return { ok: false, error: 'Recolección no encontrada.' };
  if (recoleccionAprobadaParaIe(row)) return { ok: true, data: row, yaAprobada: true };

  const detalle = {
    ...(row.detalle || {}),
    estado_aprobacion: 'aprobado',
    aprobado_por: nombre || null,
    aprobado_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('cortes_contabilidad_cierres')
    .update({ detalle })
    .eq('id', cierreId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };

  try {
    const { liberarGastosCorteAIeTrasRecoleccion } = await import('../contVirtualEgresos.js');
    await liberarGastosCorteAIeTrasRecoleccion(supabase, data);
  } catch {
    /* no bloquear aprobación */
  }
  await marcarNotificacionAtendida(supabase, 'cortes_contabilidad_cierres', cierreId, nombre);
  return { ok: true, data };
}

export async function rechazarRecoleccionCorteIe(supabase, cierreId, { nombre } = {}) {
  if (!supabase || !cierreId) return { ok: false, error: 'Recolección inválida.' };
  if (!esAprobadorRecoleccionIe(nombre)) {
    return { ok: false, error: 'Solo ABB, FJBB o JLBB pueden rechazar la recolección hacia IE.' };
  }
  const { data: row, error: errGet } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('detalle')
    .eq('id', cierreId)
    .maybeSingle();
  if (errGet) return { ok: false, error: errGet.message };
  if (!row) return { ok: false, error: 'Recolección no encontrada.' };

  const detalle = {
    ...(row.detalle || {}),
    estado_aprobacion: 'rechazado',
    aprobado_por: nombre || null,
    aprobado_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('cortes_contabilidad_cierres').update({ detalle }).eq('id', cierreId);
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'cortes_contabilidad_cierres', cierreId, nombre);
  return { ok: true };
}

export async function notificarRecoleccionPendienteIe(supabase, cierre) {
  if (!supabase || !cierre?.id) return { ok: true };
  const tienda = etiquetaTienda(cierre.sucursal_id || 'MAIN');
  const monto = Number(cierre?.detalle?.recoleccion_contabilidad
    ?? ((Number(cierre?.detalle?.recoleccion) || 0) + (Number(cierre?.detalle?.gastos_total) || 0))) || 0;
  return crearNotificacion(supabase, {
    sucursal_id: cierre.sucursal_id || 'MAIN',
    tipo: TIPOS_NOTIF.RECOLECCION_CORTE_IE,
    ref_tabla: 'cortes_contabilidad_cierres',
    ref_id: cierre.id,
    titulo: `Recolección pendiente IE · ${tienda}`,
    mensaje: `${cierre.usuario_nombre || 'Recolector'} · ${cierre.folio || ''} · $${monto.toFixed(2)} · requiere ABB/FJBB/JLBB`,
  });
}

function leerHistorialLocal(sucursal, modulo) {
  try {
    const raw = localStorage.getItem(lsKey(sucursal, modulo, 'historial'));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function guardarHistorialLocal(sucursal, modulo, hist) {
  localStorage.setItem(lsKey(sucursal, modulo, 'historial'), JSON.stringify(hist || []));
}

/** Lista cierres activos (no borrados). */
export async function listarCierresCorte(supabase, sucursal, modulo, limit = 30) {
  if (!supabase) {
    const hist = leerHistorialLocal(sucursal, modulo)
      .filter((h) => !h?.deleted_at)
      .slice(0, limit);
    return { data: hist };
  }
  let q = await supabase
    .from('cortes_contabilidad_cierres')
    .select('*')
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('modulo', modulo)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (q.error && faltaColumnaDeletedAt(q.error)) {
    q = await supabase
      .from('cortes_contabilidad_cierres')
      .select('*')
      .eq('sucursal_id', sucursal || 'MAIN')
      .eq('modulo', modulo)
      .order('created_at', { ascending: false })
      .limit(limit);
    return { data: q.data || [], error: q.error?.message || null, aviso: AVISO_FALTA_SOFT_DELETE_CIERRES };
  }
  return { data: q.data || [], error: q.error?.message || null };
}

/** Lista cierres en papelera (soft-delete). */
export async function listarCierresCorteEliminados(supabase, sucursal, modulo, limit = 30) {
  if (!supabase) {
    const hist = leerHistorialLocal(sucursal, modulo)
      .filter((h) => !!h?.deleted_at)
      .sort((a, b) => new Date(b.deleted_at || 0) - new Date(a.deleted_at || 0))
      .slice(0, limit);
    return { data: hist };
  }
  const { data, error } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('*')
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('modulo', modulo)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .limit(limit);
  if (error && faltaColumnaDeletedAt(error)) {
    return { data: [], aviso: AVISO_FALTA_SOFT_DELETE_CIERRES };
  }
  return { data: data || [], error: error?.message || null };
}

export async function actualizarDetalleCierre(supabase, id, patchDetalle, sucursal, modulo) {
  if (!id) return { ok: false, error: 'Cierre inválido.' };
  if (!supabase) {
    const key = lsKey(sucursal, modulo, 'historial');
    let hist = [];
    try {
      hist = JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      hist = [];
    }
    const next = hist.map((h) =>
      String(h.id) === String(id) ? { ...h, detalle: { ...(h.detalle || {}), ...patchDetalle } } : h,
    );
    localStorage.setItem(key, JSON.stringify(next));
    return { ok: true, soloLocal: true };
  }
  const { data: row, error: errGet } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('detalle')
    .eq('id', id)
    .maybeSingle();
  if (errGet) return { ok: false, error: errGet.message };
  if (!row) return { ok: false, error: 'Cierre no encontrado.' };
  const detalle = { ...(row.detalle || {}), ...patchDetalle };
  const { error } = await supabase.from('cortes_contabilidad_cierres').update({ detalle }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, detalle };
}

/** Actualiza un cierre del historial (corrección admin/gerente). */
export async function actualizarCierreCorte(supabase, id, patch, sucursal, modulo) {
  if (!id) return { ok: false, error: 'Cierre inválido.' };
  const ventas = patch.ventas != null ? Number(patch.ventas) : undefined;
  const caja = patch.caja_actual != null ? Number(patch.caja_actual) : undefined;
  const folio = patch.folio != null ? String(patch.folio).trim() : undefined;
  const comentarios = patch.comentarios != null ? String(patch.comentarios) : undefined;
  const recoleccion = patch.recoleccion != null ? Number(patch.recoleccion) : undefined;
  const gastosTotal = patch.gastos_total != null ? Number(patch.gastos_total) : undefined;
  const fechaNegocio = patch.fecha_negocio != null ? String(patch.fecha_negocio).slice(0, 10) : undefined;

  if (!supabase) {
    const key = lsKey(sucursal, modulo, 'historial');
    let hist = [];
    try {
      hist = JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      hist = [];
    }
    const next = hist.map((h) => {
      if (String(h.id) !== String(id)) return h;
      let detalle = { ...(h.detalle || {}) };
      if (comentarios !== undefined) detalle.comentarios = comentarios;
      if (fechaNegocio !== undefined) detalle.fecha_negocio = fechaNegocio;
      if (recoleccion !== undefined || gastosTotal !== undefined) {
        const efectivo = recoleccion !== undefined
          ? recoleccion
          : Number(detalle.recoleccion ?? detalle.recoleccion_turno) || 0;
        const gastos = gastosTotal !== undefined
          ? gastosTotal
          : Number(detalle.gastos_total) || 0;
        detalle = {
          ...detalle,
          ...detalleRecoleccionParaIe({
            efectivo,
            gastosTotal: gastos,
            extras: { fecha_negocio: detalle.fecha_negocio },
          }),
        };
      }
      return {
        ...h,
        ...(ventas !== undefined ? { ventas } : {}),
        ...(caja !== undefined ? { caja_actual: caja } : {}),
        ...(folio !== undefined ? { folio } : {}),
        detalle,
      };
    });
    localStorage.setItem(key, JSON.stringify(next));
    return { ok: true, soloLocal: true, data: next.find((h) => String(h.id) === String(id)) };
  }

  const { data: row, error: errGet } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (errGet) return { ok: false, error: errGet.message };
  if (!row) return { ok: false, error: 'Cierre no encontrado.' };

  let detalle = { ...(row.detalle || {}) };
  if (comentarios !== undefined) detalle.comentarios = comentarios;
  if (fechaNegocio !== undefined) detalle.fecha_negocio = fechaNegocio;
  if (recoleccion !== undefined || gastosTotal !== undefined) {
    const efectivo = recoleccion !== undefined
      ? recoleccion
      : Number(detalle.recoleccion ?? detalle.recoleccion_turno) || 0;
    const gastos = gastosTotal !== undefined
      ? gastosTotal
      : Number(detalle.gastos_total) || 0;
    detalle = {
      ...detalle,
      ...detalleRecoleccionParaIe({
        efectivo,
        gastosTotal: gastos,
        extras: { fecha_negocio: detalle.fecha_negocio },
      }),
    };
  }

  const update = { detalle };
  if (ventas !== undefined) update.ventas = ventas;
  if (caja !== undefined) update.caja_actual = caja;
  if (folio !== undefined) update.folio = folio;

  const { data, error } = await supabase
    .from('cortes_contabilidad_cierres')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/**
 * Mueve un cierre a la papelera (soft-delete).
 * Si aún no existe la columna deleted_at, hace borrado definitivo y avisa.
 */
export async function eliminarCierreCorte(supabase, id, sucursal, modulo, meta = {}) {
  if (!id) return { ok: false, error: 'Cierre inválido.' };
  const deletedAt = new Date().toISOString();
  const deletedBy = meta.deletedBy || meta.usuario_nombre || null;
  if (!supabase) {
    const hist = leerHistorialLocal(sucursal, modulo);
    const next = hist.map((h) =>
      String(h.id) === String(id) ? { ...h, deleted_at: deletedAt, deleted_by: deletedBy } : h,
    );
    guardarHistorialLocal(sucursal, modulo, next);
    return { ok: true, soloLocal: true };
  }
  const { error } = await supabase
    .from('cortes_contabilidad_cierres')
    .update({ deleted_at: deletedAt, deleted_by: deletedBy })
    .eq('id', id);
  if (error && faltaTabla(error, 'cortes_contabilidad_cierres')) {
    return { ok: false, error: AVISO_FALTA_CORTES };
  }
  if (error && faltaColumnaDeletedAt(error)) {
    const hard = await supabase.from('cortes_contabilidad_cierres').delete().eq('id', id);
    if (hard.error) return { ok: false, error: hard.error.message, aviso: AVISO_FALTA_SOFT_DELETE_CIERRES };
    return { ok: true, definitivo: true, aviso: AVISO_FALTA_SOFT_DELETE_CIERRES };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Restaura un cierre desde la papelera. */
export async function restaurarCierreCorte(supabase, id, sucursal, modulo) {
  if (!id) return { ok: false, error: 'Cierre inválido.' };
  if (!supabase) {
    const hist = leerHistorialLocal(sucursal, modulo);
    const next = hist.map((h) =>
      String(h.id) === String(id) ? { ...h, deleted_at: null, deleted_by: null } : h,
    );
    guardarHistorialLocal(sucursal, modulo, next);
    return { ok: true, soloLocal: true };
  }
  const { error } = await supabase
    .from('cortes_contabilidad_cierres')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', id);
  if (error && faltaTabla(error, 'cortes_contabilidad_cierres')) {
    return { ok: false, error: AVISO_FALTA_CORTES };
  }
  if (error && faltaColumnaDeletedAt(error)) {
    return { ok: false, error: AVISO_FALTA_SOFT_DELETE_CIERRES };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
