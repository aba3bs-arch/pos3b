/**
 * Faltante de inventario (Reportes) → nómina.
 * Hasta el 23 nov 2026: faltante neto ÷ 3 a cada empleado de tienda
 * (2 directos + 1 cubre turnos).
 * Desde el 24 nov 2026: 50% turno diurno y 50% turno nocturno,
 * en la nómina de los empleados directos de esa tienda.
 */
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import {
  esEmpleadoIndirectoOMain,
  resolverTipoEmpleado,
  turnoEmpleadoParaGastos,
} from './empleadosVisibles.js';
import { round2 } from './nominaGastos.js';
import { sumarDiasYmd } from './prestamoCuotas.js';

/** Cuántas partes del faltante en semanas anteriores: 2 empleados de tienda + 1 CT. */
export const DIVISOR_FALTANTE_INVENTARIO_NOMINA = 3;

/** Primera semana de nómina (fin del periodo) que usa 50% diurno / 50% nocturno. */
export const FECHA_REPARTO_INVENTARIO_5050 = '2026-11-24';

/** '5050' desde el 24 nov 2026; 'tercios' en semanas que cerraron antes. */
export function formulaFaltanteInventarioNomina(periodoHasta) {
  const fin = String(periodoHasta || '').slice(0, 10);
  if (!fin || fin >= FECHA_REPARTO_INVENTARIO_5050) return '5050';
  return 'tercios';
}

export function fraseReglaInventarioNomina(periodoHasta) {
  if (formulaFaltanteInventarioNomina(periodoHasta) === '5050') {
    return 'Inventario (faltante neto = campo 2 − bonificación): 50% turno diurno y 50% turno nocturno, empleados directos';
  }
  return 'Inventario (faltante neto = campo 2 − bonificación, ÷ 3 por empleado de la tienda)';
}

export function tituloColumnaInventarioNomina(periodoHasta) {
  if (formulaFaltanteInventarioNomina(periodoHasta) === '5050') {
    return 'Faltante neto (campo 2 − bonificación): 50% turno diurno y 50% turno nocturno, empleados directos';
  }
  return 'Faltante neto (campo 2 − bonificación) ÷ 3, por empleado de esa tienda';
}

export function etiquetaCortaCuotaInventario(linea) {
  if (linea?.formula_inventario === '5050') {
    if (linea.turno_inventario === 'nocturno') return '50% nocturno';
    if (linea.turno_inventario === 'ambos') return '50% diurno + 50% nocturno';
    return '50% diurno';
  }
  return '÷3 neto';
}

/**
 * Monto a repartir en nómina: faltante neto = faltante bruto − bonificación.
 * Nunca descuenta la bonificación (solo el faltante que queda después de restarla).
 */
export function faltanteNetoParaNomina(reg) {
  if (!reg) return 0;
  const netoDirecto = Number(reg.valor_faltante_neto);
  if (Number.isFinite(netoDirecto)) return round2(Math.max(0, netoDirecto));

  const bruto = Number(reg.valor_faltante);
  if (!Number.isFinite(bruto) || bruto <= 0) return 0;
  const bon = Math.max(0, Number(reg.valor_bonificacion) || 0);
  return round2(Math.max(0, bruto - bon));
}

export function cuotaFaltanteInventarioNomina(faltante, { formula = 'tercios', personasEnTurno = 1 } = {}) {
  const n = Number(faltante);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (formula === '5050') {
    const personas = Math.max(1, Math.floor(Number(personasEnTurno) || 1));
    return round2((n * 0.5) / personas);
  }
  return round2(n / DIVISOR_FALTANTE_INVENTARIO_NOMINA);
}

export function notaCuotaFaltanteInventario(sucursal, faltanteNeto, cuota, {
  bruto = null,
  bonificacion = 0,
  formula = 'tercios',
  turno = '',
  personas = 1,
} = {}) {
  const suc = etiquetaTienda(sucursal);
  const bon = Math.max(0, Number(bonificacion) || 0);
  const netoTxt = `$${Number(faltanteNeto).toFixed(2)}`;
  const cuotaTxt = `$${Number(cuota).toFixed(2)}`;
  let base;
  if (formula === '5050') {
    const quien = turno === 'nocturno' ? 'turno nocturno' : 'turno diurno';
    const reparto = personas > 1 ? ` ÷ ${personas}` : '';
    base = `Inventario ${suc}: neto ${netoTxt} · ${quien} 50%${reparto} = ${cuotaTxt}`;
  } else {
    base = `Inventario ${suc}: neto ${netoTxt} ÷ ${DIVISOR_FALTANTE_INVENTARIO_NOMINA} = ${cuotaTxt}`;
  }
  if (bon > 0 && bruto != null && Number.isFinite(Number(bruto))) {
    return `${base} (bruto $${Number(bruto).toFixed(2)} − bonif $${bon.toFixed(2)})`;
  }
  return base;
}

/**
 * Empleados directos de la tienda, separados por turno.
 * Quien cubre ambos entra al turno que no tenga gente; si cubre los dos, paga las dos mitades.
 * Sin turno asignado: se reparte entre los dos lados para que el 50/50 igual caiga en directos.
 */
export function repartirDirectosPorTurno(empleados) {
  const diurnos = [];
  const nocturnos = [];
  const ambos = [];
  const sin = [];
  for (const e of empleados || []) {
    const t = turnoEmpleadoParaGastos(e);
    if (t === 'diurno') diurnos.push(e);
    else if (t === 'nocturno') nocturnos.push(e);
    else if (t === 'ambos') ambos.push(e);
    else sin.push(e);
  }
  const dia = [...diurnos];
  const noche = [...nocturnos];
  for (const e of ambos) {
    if (!diurnos.length) dia.push(e);
    if (!nocturnos.length) noche.push(e);
  }
  if (!dia.length && !noche.length) {
    const orden = [...sin];
    if (orden.length <= 1) return { diurnos: orden, nocturnos: [] };
    const mid = Math.ceil(orden.length / 2);
    return { diurnos: orden.slice(0, mid), nocturnos: orden.slice(mid) };
  }
  if (!dia.length && sin.length) dia.push(...sin);
  else if (!noche.length && sin.length) noche.push(...sin);
  return { diurnos: dia, nocturnos: noche };
}

/**
 * Ventana de inventarios de una nómina (semana de pago sáb–vie; semana de inventarios lun–sáb).
 * Va del día siguiente al inicio de la semana de pago hasta el sábado posterior al fin:
 * nómina 31 oct–6 nov → inventarios cerrados del 1 al 7 nov. El inventario del sábado de inicio
 * (31 oct) es de la semana anterior, y el del sábado siguiente al fin (7 nov) es de esta.
 * Así, el día que arranca una semana nueva todavía no hay inventarios cargados.
 */
export function ventanaInventarioNomina(inicio, fin) {
  const ini = String(inicio || '').slice(0, 10);
  const f = String(fin || '').slice(0, 10);
  if (!ini || !f) return { desde: ini, hasta: f };
  const desde = sumarDiasYmd(ini, 1);
  const hasta = sumarDiasYmd(f, 1);
  return { desde: desde > hasta ? hasta : desde, hasta };
}

/**
 * ¿El resultado de inventario aplica a esta nómina?
 * Solo cuenta si el inventario cerró (campo «hasta») dentro de la ventana de la semana de pago.
 * Los inventarios de semanas anteriores ya no se vuelven a jalar.
 */
export function registroFaltanteAplicaASemana(reg, inicio, fin) {
  if (!reg?.desde || !reg?.hasta || !inicio || !fin) return false;
  const ventana = ventanaInventarioNomina(inicio, fin);
  if (reg.hasta < ventana.desde || reg.hasta > ventana.hasta) return false;
  if (faltanteNetoParaNomina(reg) > 0) return true;
  const bruto = Number(reg.valor_faltante);
  return Number.isFinite(bruto) && bruto > 0;
}

function scoreRegistroSemana(reg, inicio, fin) {
  const v = ventanaInventarioNomina(inicio, fin);
  let s = 0;
  if (reg.hasta >= v.desde && reg.hasta <= v.hasta) s += 100;
  if (reg.desde >= v.desde && reg.desde <= v.hasta) s += 20;
  if (reg.desde === v.desde && reg.hasta === v.hasta) s += 50;
  return s;
}

/** Un registro por tienda: el que mejor cubre la semana de nómina. */
export function registroFaltantePorTienda(registros, sucursal, inicio, fin) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) return null;
  const cands = (registros || []).filter(
    (r) => normalizarCodigoTienda(r.sucursal_id) === suc && registroFaltanteAplicaASemana(r, inicio, fin),
  );
  if (!cands.length) return null;
  cands.sort(
    (a, b) =>
      scoreRegistroSemana(b, inicio, fin) - scoreRegistroSemana(a, inicio, fin)
      || String(b.updated_at || '').localeCompare(String(a.updated_at || '')),
  );
  return cands[0];
}

export function empleadoRecibeCuotaFaltante(empleado) {
  if (!empleado || empleado.activo === false) return false;
  if (esEmpleadoIndirectoOMain(empleado)) return false;
  return resolverTipoEmpleado(empleado) === 'tienda';
}

/**
 * Mapa usuario_id → { sucursal_id, faltante, cuota, nota, … }.
 * `faltante` = neto (sin bonificación). Solo empleados de tienda de esa sucursal.
 */
export function mapaCuotasFaltantePorEmpleado({ registros = [], empleados = [], desde, hasta } = {}) {
  const porSuc = new Map();
  for (const e of empleados || []) {
    if (!empleadoRecibeCuotaFaltante(e)) continue;
    const suc = normalizarCodigoTienda(e.sucursal_id);
    if (!suc || suc === 'MAIN' || suc === 'CEDIS') continue;
    if (!porSuc.has(suc)) porSuc.set(suc, []);
    porSuc.get(suc).push(e);
  }

  const out = {};
  const formula = formulaFaltanteInventarioNomina(hasta);
  for (const [suc, list] of porSuc) {
    const reg = registroFaltantePorTienda(registros, suc, desde, hasta);
    if (!reg) continue;
    const faltante = faltanteNetoParaNomina(reg);
    const bruto = Number(reg.valor_faltante);
    const bonificacion = Math.max(0, Number(reg.valor_bonificacion) || 0);
    const baseFila = {
      sucursal_id: suc,
      faltante,
      faltante_bruto: Number.isFinite(bruto) ? round2(bruto) : faltante,
      bonificacion,
      desde: reg.desde,
      hasta: reg.hasta,
      formula,
    };
    if (formula !== '5050') {
      const cuota = cuotaFaltanteInventarioNomina(faltante);
      if (!(cuota > 0)) continue;
      const nota = notaCuotaFaltanteInventario(suc, faltante, cuota, {
        bruto: Number.isFinite(bruto) ? bruto : null,
        bonificacion,
      });
      for (const e of list) {
        out[String(e.id)] = { ...baseFila, cuota, nota, turno: '' };
      }
      continue;
    }
    const { diurnos, nocturnos } = repartirDirectosPorTurno(list);
    for (const [turno, gente] of [['diurno', diurnos], ['nocturno', nocturnos]]) {
      if (!gente.length) continue;
      const cuota = cuotaFaltanteInventarioNomina(faltante, {
        formula: '5050',
        personasEnTurno: gente.length,
      });
      if (!(cuota > 0)) continue;
      const nota = notaCuotaFaltanteInventario(suc, faltante, cuota, {
        bruto: Number.isFinite(bruto) ? bruto : null,
        bonificacion,
        formula: '5050',
        turno,
        personas: gente.length,
      });
      for (const e of gente) {
        const id = String(e.id);
        const prev = out[id];
        if (prev) {
          out[id] = {
            ...prev,
            cuota: round2(prev.cuota + cuota),
            turno: 'ambos',
            nota: `${prev.nota} · ${nota}`,
          };
        } else {
          out[id] = { ...baseFila, cuota, nota, turno };
        }
      }
    }
  }
  return out;
}

export function combinarDeduccionInventario(corteInventario, cuotaReporte) {
  return round2((Number(corteInventario) || 0) + (Number(cuotaReporte) || 0));
}
