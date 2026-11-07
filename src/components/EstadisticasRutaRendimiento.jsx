import React, { useEffect, useMemo, useState } from 'react';
import { cargarRendimientoRuta, resumenRendimientoRuta } from '../lib/rutaRendimiento.js';
import { cargarDatosEstadisticasArea } from '../lib/estadisticasData.js';
import { cargarCortesLiquidacion, rangoDesdeUltimaRecoleccion } from '../lib/ventasRutaPorTienda.js';
import { hoyYmdNogales } from '../lib/corteCaja.js';
import VisorTutorialModal from './VisorTutorialModal.jsx';
import { TUTORIAL_ESTADISTICAS_RUTA } from '../content/tutorialEstadisticasRuta.js';

function fmt(n) {
  const v = Number(n) || 0;
  const txt = Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '-' : ''}$${txt}`;
}

const COLOR_NIVEL = { alto: '#c0392b', medio: '#e67e22', info: '#2980b9' };
const ETIQUETA_ESTADO = {
  excede: { txt: 'Salió de más', color: '#c0392b' },
  falta: { txt: 'Falta recolectar', color: '#e67e22' },
  cuadra: { txt: 'Cuadra', color: '#27ae60' },
  sin_datos: { txt: 'Sin datos', color: '#7f8c8d' },
};

function Mini({ label, value, color, sub }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '0.55rem 0.65rem' }}>
      <div className="muted" style={{ fontSize: '0.72rem' }}>{label}</div>
      <strong style={{ fontSize: '1.1rem', color: color || 'inherit' }}>{value}</strong>
      {sub && <div className="muted" style={{ fontSize: '0.72rem' }}>{sub}</div>}
    </div>
  );
}

/**
 * Estadísticas Abarrotes · Venta en Ruta vs recolección.
 * Usa los cierres/gastos que ya cargó el tablero (pack) y trae lo propio de la ruta.
 */
export default function EstadisticasRutaRendimiento({
  supabase,
  desde,
  hasta,
  sucursal,
  pack,
  tiendas = [],
  modo = 'rango',
  rangoGlobal = null,
}) {
  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState(null);
  const [tutorialAbierto, setTutorialAbierto] = useState(false);
  const [packLocal, setPackLocal] = useState(null);

  useEffect(() => {
    let ok = true;
    if (!supabase || !desde || !hasta) return undefined;
    (async () => {
      setCargando(true);
      try {
        let dSel = desde;
        let hSel = hasta;
        if (modo === 'liquidacion') {
          const { cortes } = await cargarCortesLiquidacion(supabase);
          const r = rangoDesdeUltimaRecoleccion(cortes, { hoy: hoyYmdNogales() });
          dSel = r.desde;
          hSel = r.hasta;
        }
        const mismoRangoQueTablero = rangoGlobal && rangoGlobal.desde === dSel && rangoGlobal.hasta === hSel;
        const [res, pk] = await Promise.all([
          cargarRendimientoRuta(supabase, { desde: dSel, hasta: hSel, sucursal: sucursal || null }),
          mismoRangoQueTablero
            ? Promise.resolve(null)
            : cargarDatosEstadisticasArea(supabase, { area: 'abarrotes', desde: dSel, hasta: hSel, sucursal: sucursal || null, inventario: [] }),
        ]);
        if (ok) {
          setPackLocal(pk);
          setDatos({ ...res, desdeEfectivo: dSel, hastaEfectivo: hSel });
        }
      } catch (e) {
        if (ok) setDatos({ ok: false, error: e?.message || String(e) });
      } finally {
        if (ok) setCargando(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, [supabase, desde, hasta, sucursal, modo, rangoGlobal?.desde, rangoGlobal?.hasta]);

  const packUsado = packLocal || pack;

  const analisis = useMemo(() => {
    if (!datos?.ok) return null;
    return resumenRendimientoRuta({
      ventas: datos.ventas,
      productos: datos.productos,
      proveedorPorProducto: datos.proveedorPorProducto,
      movimientos: datos.movimientos,
      gastosRuta: datos.gastosRuta,
      ventasTienda: packUsado?.ventas || [],
      gastosTienda: packUsado?.gastos || [],
      tiendasBase: tiendas,
    });
  }, [datos, packUsado, tiendas]);

  const r = analisis?.ruta;

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h4 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>
          Venta en ruta vs recolección · ¿hay rendimiento?
        </h4>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
          onClick={() => setTutorialAbierto(true)}
        >
          Cómo entender este análisis
        </button>
      </div>
      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.8rem' }}>
        Compara lo que vende la ruta (precio ruta − costo de compra, por proveedor) con lo que se recolecta de cada tienda.
        El dinero que sale de cada tienda es la recolección en efectivo más el pago con tarjeta (dinero electrónico). Si sale
        más que lo que la tienda generó neto (venta − gastos del corte), el excedente sale de lo que había que pagar a los
        demás proveedores o de su ganancia.
      </p>

      {datos?.ok && (
        <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.76rem' }}>
          Periodo analizado: {datos.desdeEfectivo} al {datos.hastaEfectivo}
          {modo === 'liquidacion' ? ' (desde la última liquidación de cualquier recolector)' : ''}.
        </p>
      )}
      {cargando && <p className="muted">Analizando ruta y recolecciones…</p>}
      {!cargando && datos && !datos.ok && <p style={{ color: '#c0392b', margin: 0 }}>{datos.error}</p>}
      {!cargando && (datos?.avisos || []).map((a) => (
        <p key={a} className="muted" style={{ margin: '0 0 0.35rem', fontSize: '0.78rem', color: '#e67e22' }}>{a}</p>
      ))}

      {!cargando && analisis && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.65rem', marginBottom: '0.85rem' }}>
            <Mini label="Venta en ruta" value={fmt(r.venta)} sub={`${r.ventas} venta(s) · efectivo ${fmt(r.efectivo)} · crédito ${fmt(r.credito)}`} />
            <Mini label="Costo de lo vendido" value={fmt(r.costo)} />
            <Mini
              label="Ganancia bruta ruta"
              value={fmt(r.ganancia)}
              color={r.ganancia > 0 ? '#27ae60' : '#c0392b'}
              sub={r.margenPct != null ? `${r.margenPct}% sobre venta` : 'sin costo capturado'}
            />
            <Mini
              label="Gastos de ruta"
              value={r.gastosRuta == null ? 'por tienda no aplica' : fmt(r.gastosRuta)}
            />
            <Mini
              label="Rendimiento neto ruta"
              value={r.rendimientoNeto == null ? '—' : fmt(r.rendimientoNeto)}
              color={r.rendimientoNeto == null ? undefined : (r.rendimientoNeto > 0 ? '#27ae60' : '#c0392b')}
            />
            <Mini
              label="Salido vs neto tiendas"
              value={`${fmt(analisis.recoleccion.salido)} / ${fmt(analisis.recoleccion.neto)}`}
              color={analisis.recoleccion.tiendasExceden ? '#c0392b' : '#27ae60'}
              sub={`efectivo ${fmt(analisis.recoleccion.total)} + tarjeta ${fmt(analisis.recoleccion.tarjeta)} · ${analisis.recoleccion.tiendasExceden ? `${analisis.recoleccion.tiendasExceden} tienda(s) exceden` : 'ninguna excede'}`}
            />
          </div>

          <ul style={{ margin: '0 0 0.9rem', paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
            {analisis.hallazgos.map((h) => (
              <li key={h.texto} style={{ color: COLOR_NIVEL[h.nivel] || 'inherit', marginBottom: '0.25rem' }}>
                {h.texto}
              </li>
            ))}
          </ul>

          <h5 style={{ margin: '0 0 0.35rem' }}>Por tienda: ¿salió más dinero del que generó?</h5>
          <div style={{ overflowX: 'auto', marginBottom: '0.9rem' }}>
            <table className="data" style={{ fontSize: '0.82rem', width: '100%' }}>
              <thead>
                <tr>
                  <th>Tienda</th>
                  <th>Venta ruta</th>
                  <th>Ganancia ruta</th>
                  <th>Venta corte</th>
                  <th>Gastos corte</th>
                  <th>Neto (venta − gastos)</th>
                  <th>Recolectado (efvo)</th>
                  <th>Tarjeta (electrónico)</th>
                  <th>Total salido</th>
                  <th>Diferencia</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {analisis.tiendas.length === 0 && (
                  <tr><td colSpan={11} className="muted">Sin movimientos en el periodo.</td></tr>
                )}
                {analisis.tiendas.map((t) => {
                  const est = ETIQUETA_ESTADO[t.estado] || ETIQUETA_ESTADO.cuadra;
                  return (
                    <tr key={t.clave}>
                      <td>{t.nombre}</td>
                      <td>{fmt(t.ventaRuta)}</td>
                      <td>{fmt(t.gananciaRuta)}</td>
                      <td>{fmt(t.ventaTienda)}</td>
                      <td>{fmt(t.gastos)}</td>
                      <td>{fmt(t.neto)}</td>
                      <td>{fmt(t.recolectado)}</td>
                      <td>{fmt(t.tarjeta)}</td>
                      <td>{fmt(t.salido)}</td>
                      <td style={{ fontWeight: 700, color: t.estado === 'excede' ? '#c0392b' : 'inherit' }}>{fmt(t.diferencia)}</td>
                      <td style={{ color: est.color, fontWeight: 700 }}>{est.txt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h5 style={{ margin: '0 0 0.35rem' }}>Rendimiento de la ruta por proveedor</h5>
          <div style={{ overflowX: 'auto' }}>
            <table className="data" style={{ fontSize: '0.82rem', width: '100%' }}>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Piezas</th>
                  <th>Venta</th>
                  <th>Costo</th>
                  <th>Ganancia</th>
                  <th>Margen</th>
                  <th>Sin costo</th>
                </tr>
              </thead>
              <tbody>
                {analisis.costeo.proveedores.length === 0 && (
                  <tr><td colSpan={7} className="muted">Sin ventas de ruta en el periodo.</td></tr>
                )}
                {analisis.costeo.proveedores.map((p) => (
                  <tr key={p.proveedor}>
                    <td>{p.proveedor}</td>
                    <td>{p.piezas.toLocaleString('es-MX')}</td>
                    <td>{fmt(p.venta)}</td>
                    <td>{fmt(p.costo)}</td>
                    <td style={{ color: p.ganancia > 0 ? '#27ae60' : '#c0392b', fontWeight: 700 }}>{fmt(p.ganancia)}</td>
                    <td>{p.margenPct == null ? '—' : `${p.margenPct}%`}</td>
                    <td>{p.ventaSinCosto > 0 ? fmt(p.ventaSinCosto) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ margin: '0.6rem 0 0', fontSize: '0.74rem' }}>
            El costo usa el precio de compra actual del catálogo (sin IVA). Las recolecciones son los movimientos «Recolección» de
            Panel RT (cancelados excluidos); el pago con tarjeta y el neto salen del corte Abarrotes (neto = venta − gastos). Una recolección puede
            incluir caja chica o días anteriores: revisa periodos largos antes de concluir.
          </p>
        </>
      )}

      <VisorTutorialModal
        abierto={tutorialAbierto}
        tutorial={TUTORIAL_ESTADISTICAS_RUTA}
        onCerrar={() => setTutorialAbierto(false)}
      />
    </div>
  );
}
