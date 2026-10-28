import { normalizarCodigoTienda } from '../../constants/sucursales.js';
import {
  ALERTAS_POSTERIORES_A_RECEPCION,
  CONTROLES,
  CONTROL_POR_ALERTA,
  ORDEN_SEVERIDAD,
  VENTANAS_GRACIA_HORAS,
} from './config.js';

const n = (v) => Number(v) || 0;
const dinero = (v) => Math.round(n(v) * 100) / 100;

export function horasDesde(fecha, ahora = new Date()) {
  const t = new Date(fecha).getTime();
  if (!Number.isFinite(t)) return 0;
  return (ahora.getTime() - t) / 3600000;
}

export function claveHallazgo(control, ventaId, mensaje) {
  return `${control}|${ventaId}|${String(mensaje).toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

function importes(control, e) {
  const pzas = (e.productos || []).reduce((acc, p) => ({
    vendido: acc.vendido + n(p.vendido), recibido: acc.recibido + n(p.recibido),
  }), { vendido: 0, recibido: 0 });
  switch (control) {
    case 'C1': return { esperado: e.efectivo, registrado: e.efectivoRegistrado, unidad: 'MXN' };
    case 'C2': return { esperado: e.efectivo, registrado: e.gasto, unidad: 'MXN' };
    case 'C5': return { esperado: e.credito, registrado: e.creditoRegistrado, unidad: 'MXN' };
    case 'C6': return { esperado: e.creditoCobrado, registrado: e.gastoCredito, unidad: 'MXN' };
    case 'C7': return { esperado: e.creditoCobrado, registrado: e.cobrosTransitoTotal, unidad: 'MXN' };
    case 'C9': return { esperado: pzas.vendido, registrado: pzas.recibido, unidad: 'pzas' };
    default: return { esperado: null, registrado: null, unidad: null };
  }
}

function severidadFinal(control, mensaje, horasVenta) {
  const base = CONTROLES[control]?.severidad || 'media';
  if (mensaje === 'Recepción pendiente' && horasVenta >= VENTANAS_GRACIA_HORAS.recepcion * 2) return 'alta';
  return base;
}

/**
 * Convierte el resultado de consolidarRuta en hallazgos persistibles.
 * `enProceso` agrupa lo que aún está dentro de la ventana de gracia y no es alerta.
 */
export function construirHallazgos(entregas = [], { ahora = new Date() } = {}) {
  const hallazgos = [];
  const enProceso = [];
  for (const e of entregas) {
    const horas = horasDesde(e.fecha, ahora);
    const recepcionEnGracia = e.alertas.includes('Recepción pendiente') && horas < VENTANAS_GRACIA_HORAS.recepcion;
    for (const mensaje of e.alertas) {
      if (recepcionEnGracia && ALERTAS_POSTERIORES_A_RECEPCION.has(mensaje)) {
        enProceso.push({ ventaId: String(e.id), folio: e.folio, mensaje });
        continue;
      }
      const control = CONTROL_POR_ALERTA[mensaje] || 'C0';
      const { esperado, registrado, unidad } = importes(control, e);
      const hayImportes = esperado != null && registrado != null;
      hallazgos.push({
        clave: claveHallazgo(control, e.id, mensaje),
        control,
        severidad: severidadFinal(control, mensaje, horas),
        mensaje,
        venta_id: String(e.id),
        venta_folio: e.folio || null,
        carga_id: e.cargaId ? String(e.cargaId) : null,
        compra_id: e.compraId ? String(e.compraId) : null,
        sucursal_id: normalizarCodigoTienda(e.clienteId || e.tienda || '') || null,
        tienda: e.tienda || null,
        repartidor_id: e.repartidorId || null,
        repartidor_nombre: e.repartidor || null,
        esperado: hayImportes ? dinero(esperado) : null,
        registrado: hayImportes ? dinero(registrado) : null,
        diferencia: hayImportes ? dinero(registrado - esperado) : null,
        unidad: hayImportes ? unidad : null,
        venta_fecha: e.fecha || null,
        detalle: { total: e.total, efectivo: e.efectivo, credito: e.credito, productos: e.productos || [] },
      });
    }
  }
  return { hallazgos, enProceso };
}

export function ordenarAlertas(alertas = []) {
  return [...alertas].sort((a, b) => (ORDEN_SEVERIDAD[a.severidad] ?? 9) - (ORDEN_SEVERIDAD[b.severidad] ?? 9)
    || String(b.ultima_vez_at || '').localeCompare(String(a.ultima_vez_at || '')));
}
