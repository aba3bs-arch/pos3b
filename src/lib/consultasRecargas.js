/**
 * Consultas → ventas por artículo: hora real (Nogales), turno y señales de
 * posible duplicado / turno distinto, pensado para revisar recargas telefónicas.
 */
import { claveArticuloVenta, articulosDeVentaNorm } from './consultasUi.js';
import { textoEsRecarga } from './corteCajaRecargasMp.js';
import { leerTurnos, nombreTurnoLegible, turnoActual } from './turnos.js';

export const VENTANA_DUPLICADO_MS = 2 * 60 * 1000;
const TZ = 'America/Hermosillo';

/** «13/11 07:42:15» en hora Nogales (no depende de la zona del dispositivo). */
export function fmtHoraNogales(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month} ${p.hour}:${p.minute}:${p.second}`;
}

/** Ajuste que crea el candado de recargas MP al cerrar (no es una venta del mostrador). */
export function esVentaAjusteRecarga(venta) {
  if (String(venta?.metodo_pago || '').toLowerCase().includes('recarga mercado pago')) return true;
  return articulosDeVentaNorm(venta).some((a) => String(a?.id || '') === 'recarga-mp-ajuste-candado');
}

export function lineaEsRecargaConsulta(a) {
  return textoEsRecarga(a?.nombre) || textoEsRecarga(a?.descripcion) || textoEsRecarga(a?.id);
}

/**
 * Ventas (tickets) que contienen el artículo, con hora y turno.
 * @param {(sucursal: string) => object[]} [turnosDe]
 */
export function ticketsDeArticulo(ventas = [], claveArticulo = '', { turnosDe = leerTurnos, filtroLinea = null } = {}) {
  const cacheTurnos = new Map();
  const turnosSuc = (suc) => {
    if (!cacheTurnos.has(suc)) cacheTurnos.set(suc, turnosDe(suc) || []);
    return cacheTurnos.get(suc);
  };
  const filas = [];
  for (const v of ventas || []) {
    const when = v?.created_at ? new Date(v.created_at) : null;
    for (const a of articulosDeVentaNorm(v)) {
      const coincide = filtroLinea ? filtroLinea(a) : claveArticuloVenta(a) === claveArticulo;
      if (!coincide) continue;
      const piezas = Number(a.qty ?? a.cantidad ?? 1) || 1;
      const precio = Number(a.precio) || 0;
      const imp = Number(a.importe ?? a.subtotal);
      const importe = Math.round((Number.isFinite(imp) && imp !== 0 ? imp : precio * piezas) * 100) / 100;
      const turnoHora = when && !Number.isNaN(when.getTime())
        ? turnoActual(turnosSuc(v.sucursal_id), when)
        : null;
      const turnoGuardado = v.turno_id || v.turno_nombre
        ? nombreTurnoLegible(v.turno_nombre || '', v.turno_id)
        : '';
      const turnoPorHora = turnoHora ? nombreTurnoLegible(turnoHora) : '';
      filas.push({
        id: v.id,
        creado: v.created_at || null,
        ms: when && !Number.isNaN(when.getTime()) ? when.getTime() : 0,
        sucursal: v.sucursal_id || '',
        vendedor: v.vendedor || '',
        metodo: v.metodo_pago || '',
        piezas,
        importe,
        turnoGuardado,
        turnoPorHora,
        turnoDistinto: Boolean(turnoGuardado && turnoPorHora && turnoGuardado !== turnoPorHora),
        ajuste: esVentaAjusteRecarga(v),
        duplicado: false,
        duplicadoDe: null,
        mismoInstante: false,
      });
    }
  }
  filas.sort((x, y) => x.ms - y.ms || String(x.id).localeCompare(String(y.id)));
  marcarPosiblesDuplicados(filas);
  return filas;
}

/**
 * Marca (in situ) la venta repetida: misma tienda, vendedor, importe y piezas a menos de
 * 2 minutos de otra. La primera queda como original; las siguientes, «duplicado de».
 */
export function marcarPosiblesDuplicados(filas = [], ventanaMs = VENTANA_DUPLICADO_MS) {
  const ultimo = new Map();
  for (const f of filas) {
    if (f.ajuste) continue;
    const k = `${f.sucursal}|${f.vendedor}|${f.importe}|${f.piezas}`;
    const prev = ultimo.get(k);
    if (prev && Math.abs(f.ms - prev.ms) <= ventanaMs && String(prev.id) !== String(f.id)) {
      f.duplicado = true;
      f.duplicadoDe = prev.id;
      f.mismoInstante = f.ms === prev.ms;
    }
    ultimo.set(k, f);
  }
  return filas;
}

/** Totales para el aviso de la pantalla (solo líneas de recarga). */
export function resumenRecargasConsulta(ventas = [], opts = {}) {
  const filas = ticketsDeArticulo(ventas, '', { ...opts, filtroLinea: lineaEsRecargaConsulta });
  return {
    lineas: filas.length,
    duplicados: filas.filter((f) => f.duplicado).length,
    turnoDistinto: filas.filter((f) => f.turnoDistinto).length,
    ajustes: filas.filter((f) => f.ajuste).length,
    importeDuplicado: Math.round(filas.filter((f) => f.duplicado).reduce((s, f) => s + f.importe, 0) * 100) / 100,
  };
}
