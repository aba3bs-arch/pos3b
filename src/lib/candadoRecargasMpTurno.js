/**
 * Resuelve fecha + turno para el candado de recargas MP en Corte Abarrotes.
 * Evita usar solo turnoActual(): al cerrar fuera de horario (o como CT) eso
 * apunta al turno nuevo y el POS queda en $0 aunque sí hubo recargas.
 */

import { fechaCorteSugerida } from './corteCaja.js';
import {
  horaEnVentanaLogin,
  leerToleranciaTurnos,
  leerTurnos,
  sugerirTurnoParaCorte,
  turnoActual,
  turnoEnEntrega,
} from './turnos.js';
import { esUsuarioCubreTurno } from './cubreTurno.js';

function rolLegible(rol) {
  return String(rol || '').trim();
}

/** Minutos Nogales desde medianoche. */
function minutosAhoraNogales(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Hermosillo',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    return hour * 60 + minute;
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
}

function minutosHora(hora) {
  const n = String(hora || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!n) return 0;
  return Number(n[1]) * 60 + Number(n[2]);
}

/** Minutos desde que terminó el turno (mod 24 h). */
function minutosDesdeFinTurno(turno, date = new Date()) {
  if (!turno?.hora_fin) return Infinity;
  const now = minutosAhoraNogales(date);
  const fin = minutosHora(turno.hora_fin);
  return (now - fin + 24 * 60) % (24 * 60);
}

/**
 * Parsea claves de venta_pos_por_corte (`YYYY-MM-DD|turnoId`).
 * @returns {{ fecha: string, turnoId: string }[]}
 */
export function contextosDesdeVentaPosMap(ventaPosPorCorte = {}) {
  const out = [];
  const seen = new Set();
  for (const clave of Object.keys(ventaPosPorCorte || {})) {
    const raw = String(clave || '').trim();
    if (!raw || raw.startsWith('sin-')) continue;
    const pipe = raw.indexOf('|');
    if (pipe < 0) continue;
    const fecha = raw.slice(0, pipe).slice(0, 10);
    const turnoId = raw.slice(pipe + 1).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !turnoId || turnoId === 'sin-turno') continue;
    const k = `${fecha}|${turnoId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ fecha, turnoId });
  }
  return out;
}

function turnoPorId(turnoId, sucursal = null) {
  const list = leerTurnos(sucursal);
  const hit = list.find((t) => String(t.id) === String(turnoId));
  if (hit) return hit;
  return {
    id: turnoId,
    nombre: String(turnoId),
    hora_inicio: '00:00',
    hora_fin: '23:59',
  };
}

/**
 * @returns {{ contextos: { fecha: string, turno: object, origen: string }[] }}
 */
export function resolverContextosCandadoRecargasMp({
  estado = {},
  gastos = [],
  user = null,
  sucursal = null,
  now = new Date(),
} = {}) {
  const turnosLs = leerTurnos(sucursal);

  // 1) Turno ya sellado en el corte abierto.
  if (estado?.turno_sesion?.id || estado?.turno_sesion?.nombre) {
    const turno = estado.turno_sesion;
    return {
      contextos: [{
        fecha: fechaCorteSugerida(turno, now),
        turno,
        origen: 'turno_sesion',
      }],
    };
  }

  // 2) Lo que Corte de caja ya empujó a Abarrotes (fecha|turno).
  const fromMap = contextosDesdeVentaPosMap(estado?.venta_pos_por_corte);
  if (fromMap.length) {
    return {
      contextos: fromMap.map(({ fecha, turnoId }) => ({
        fecha,
        turno: turnoPorId(turnoId, sucursal),
        origen: 'venta_pos',
      })),
    };
  }

  // 3) Primer gasto del corte abierto → turno de esa hora.
  const primerGasto = (gastos || []).find((g) => g?.created_at);
  if (primerGasto?.created_at) {
    const when = new Date(primerGasto.created_at);
    if (!Number.isNaN(when.getTime())) {
      const turno = turnoActual(turnosLs, when);
      if (turno) {
        return {
          contextos: [{
            fecha: fechaCorteSugerida(turno, when),
            turno,
            origen: 'gasto',
          }],
        };
      }
    }
  }

  // 4) Turno saliente pendiente de corte (cajero en gracia, CT o admin poco después del fin).
  const tolerancia = leerToleranciaTurnos(sucursal);
  const entrega = turnoEnEntrega(turnosLs, now, tolerancia, { user, sucursal });
  const rol = rolLegible(user?.rol ?? user?.role);
  const esSupervisor = ['Administrador', 'Gerente', 'Supervisor'].includes(rol);
  const cubre = esUsuarioCubreTurno(user);
  const enGraciaLogin = entrega && horaEnVentanaLogin(entrega, now, tolerancia);
  const cierreTardioCtAdmin = entrega
    && (cubre || esSupervisor)
    && minutosDesdeFinTurno(entrega, now) <= 3 * 60;
  if (entrega && (enGraciaLogin || cierreTardioCtAdmin)) {
    return {
      contextos: [{
        fecha: fechaCorteSugerida(entrega, now),
        turno: entrega,
        origen: enGraciaLogin ? 'entrega' : 'entrega_ct',
      }],
    };
  }

  // 5) Misma heurística que Corte de caja.
  const sugerido = sugerirTurnoParaCorte(turnosLs, now, { user, sucursal, tolerancia }).turno
    || turnoActual(turnosLs, now);
  return {
    contextos: sugerido
      ? [{
        fecha: fechaCorteSugerida(sugerido, now),
        turno: sugerido,
        origen: 'sugerido',
      }]
      : [],
  };
}
