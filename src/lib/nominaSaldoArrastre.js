import { round2 } from './nominaGastos.js';
import { saldoPendienteDesdePago } from './nominaCalculos.js';

const LS_ARRASTRE = 'pos3b_nomina_saldos_arrastre';

export function leerSaldosArrastreLocal() {
  try {
    const raw = localStorage.getItem(LS_ARRASTRE);
    if (!raw) return {};
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      const n = round2(v);
      if (n > 0) out[String(k)] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function guardarSaldosArrastreLocal(map) {
  try {
    localStorage.setItem(LS_ARRASTRE, JSON.stringify(map || {}));
  } catch {
    /* ignore */
  }
}

/** Tras cerrar nómina: deuda negativa pasa al siguiente periodo. */
export function actualizarSaldosArrastreAlCerrar(lineas) {
  const prev = leerSaldosArrastreLocal();
  const next = { ...prev };
  for (const l of lineas || []) {
    const uid = l.usuario_id != null ? String(l.usuario_id) : '';
    if (!uid) continue;
    const pendiente = saldoPendienteDesdePago(l.pago ?? l.total);
    if (pendiente > 0) next[uid] = pendiente;
    else delete next[uid];
  }
  guardarSaldosArrastreLocal(next);
  return next;
}

/** Últimos saldos pendientes guardados en nóminas cerradas (si existe columna). */
export async function leerSaldosArrastreSupabase(supabase) {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from('nomina_lineas')
    .select('usuario_id, saldo_pendiente, nomina_periodos!inner(periodo_fin, created_at)')
    .gt('saldo_pendiente', 0)
    .not('usuario_id', 'is', null)
    .order('created_at', { foreignTable: 'nomina_periodos', ascending: false })
    .limit(800);

  if (error) {
    if (String(error.message).includes('saldo_pendiente')) return {};
    return {};
  }

  const map = {};
  for (const row of data || []) {
    const uid = String(row.usuario_id);
    if (map[uid] != null) continue;
    const n = round2(row.saldo_pendiente);
    if (n > 0) map[uid] = n;
  }
  return map;
}

/** Mapa usuario_id → deuda arrastrada del periodo anterior. */
export async function cargarMapaSaldosArrastre(supabase) {
  const local = leerSaldosArrastreLocal();
  const remoto = await leerSaldosArrastreSupabase(supabase);
  const merged = { ...remoto };
  for (const [k, v] of Object.entries(local)) {
    if (v > 0) merged[k] = v;
  }
  return merged;
}
