import React, { useEffect, useRef, useState } from 'react';
import { cargarConsolidacionRuta } from '../lib/consolidacionRuta.js';
import { hoyClaveNogales } from '../lib/controlEfectivo.js';
import { ymdNogalesFromDate } from '../lib/corteCaja.js';
import { listarAuditoriasCamionLocal } from '../lib/auditoriaCamionRuta.js';
import { fmtMonto } from '../lib/consultasUi.js';
import './ConsolidacionRuta.css';

const monto = (v) => v == null ? 'Sin desglose' : fmtMonto(v);
function rango(tipo, fecha) {
  if (!fecha) return { desde: '', hasta: '' };
  if (tipo !== 'semana') return { desde: fecha, hasta: fecha };
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  const desde = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  return { desde, hasta: d.toISOString().slice(0, 10) };
}
function Indicador({ titulo, valor, detalle, alerta }) {
  return <div className={`ruta-consol-indicador ${alerta ? 'ruta-consol-alerta' : ''}`}>
    <span>{titulo}</span><strong>{valor}</strong>{detalle && <small>{detalle}</small>}
  </div>;
}
function DetalleVenta({ e }) {
  return <details className="ruta-consol-entrega">
    <summary><strong>{e.folio}</strong><span>{e.tienda}</span><span>{monto(e.total)}</span>
      <b className={e.alertas.length ? 'ruta-consol-rojo' : 'ruta-consol-verde'}>{e.alertas.length ? `${e.alertas.length} alertas` : 'Sin diferencias documentales'}</b></summary>
    <p className="muted">Venta del {ymdNogalesFromDate(e.fecha)} · {e.interna ? 'Sucursal propia' : 'Cliente externo: recepción y gasto de tienda no aplican'}</p>
    <div className="table-wrap"><table className="data"><thead><tr><th>Comprobación</th><th>Esperado</th><th>Registrado</th><th>Diferencia</th></tr></thead><tbody>
      <tr><td>Efectivo de la venta → tránsito</td><td>{monto(e.efectivo)}</td><td>{monto(e.efectivoRegistrado)}</td><td>{e.efectivo == null ? '—' : monto(e.efectivoRegistrado - e.efectivo)}</td></tr>
      <tr><td>Crédito → cargos y abonos</td><td>{monto(e.credito)}</td><td>{monto(e.creditoRegistrado)}</td><td>{monto(e.diferenciaCredito)}</td></tr>
      {e.interna && <tr><td>Efectivo de la venta → gasto de tienda</td><td>{monto(e.efectivo)}</td><td>{monto(e.gasto)}</td><td>{monto(e.diferenciaGasto)}</td></tr>}
      {e.interna && <tr><td>Cobro de crédito → gasto de tienda</td><td>{monto(e.creditoCobrado)}</td><td>{monto(e.gastoCredito)}</td><td>{monto(e.gastoCredito - e.creditoCobrado)}</td></tr>}
    </tbody></table></div>
    <p>Crédito cobrado: <strong>{monto(e.creditoCobrado)}</strong> · Saldo por cobrar: <strong>{monto(e.saldoCredito)}</strong>.</p>
    <p>Efectivo de venta liquidado: <strong>{monto(e.liquidado)}</strong> · En tránsito: <strong>{monto(e.pendiente)}</strong>.<br />
      Cobros de crédito liquidados: <strong>{monto(e.cobrosLiquidados)}</strong> · En tránsito: <strong>{monto(e.cobrosPendientes)}</strong>.</p>
    {e.alertas.length > 0 && <ul className="ruta-consol-rojo">{e.alertas.map((a) => <li key={a}>{a}</li>)}</ul>}
    {e.interna && e.productos.length > 0 && <div className="table-wrap"><table className="data"><thead><tr><th>Mercancía</th><th>Vendida (pzas)</th><th>Ingresada (pzas)</th><th>Diferencia</th></tr></thead><tbody>
      {e.productos.map((p) => <tr key={p.id}><td>{p.nombre}</td><td>{p.vendido}</td><td>{p.recibido}</td><td className={p.diferencia < 0 ? 'ruta-consol-rojo' : ''}>{p.diferencia}</td></tr>)}
    </tbody></table></div>}
  </details>;
}
export default function ConsolidacionRuta({ supabase, onAuditoria }) {
  const [tipo, setTipo] = useState('dia');
  const [fechas, setFechas] = useState(() => rango('dia', hoyClaveNogales()));
  const [datos, setDatos] = useState(null);
  const [periodo, setPeriodo] = useState(null);
  const [repartidor, setRepartidor] = useState('');
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const solicitud = useRef(0);
  useEffect(() => () => { solicitud.current += 1; }, []);
  async function consultar(event) {
    event?.preventDefault();
    const id = ++solicitud.current;
    setCargando(true); setError(''); setDatos(null);
    try {
      const resultado = await cargarConsolidacionRuta(supabase, fechas);
      if (id !== solicitud.current) return;
      const auditorias = listarAuditoriasCamionLocal({ limit: 200 }).data || [];
      resultado.repartidores = resultado.repartidores.map((g) => {
        const ids = new Set(g.entregas.flatMap((e) => e.cargaIds));
        const auditoria = auditorias.filter((a) => (a.cargas || []).some((c) => ids.has(String(c.id))))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
        return { ...g, auditoria };
      });
      setDatos(resultado); setPeriodo({ ...fechas }); setRepartidor('');
    } catch (e) { if (id === solicitud.current) setError(`No se pudo completar la consolidación: ${e.message}. Reintenta cuando estén disponibles todas las fuentes.`); }
    finally { if (id === solicitud.current) setCargando(false); }
  }
  function exportar() {
    const rows = datos.entregas.filter((e) => !repartidor || e.repartidorId === repartidor);
    const celda = (v) => `"${String(v ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const campos = ['repartidor', 'fecha', 'folio', 'tienda', 'total', 'efectivo', 'credito', 'gasto', 'diferenciaGasto', 'creditoRegistrado', 'diferenciaCredito', 'creditoCobrado', 'saldoCredito', 'liquidado', 'pendiente', 'cobrosLiquidados', 'cobrosPendientes', 'alertas'];
    const contenido = [campos, ...rows.map((r) => campos.map((k) => Array.isArray(r[k]) ? r[k].join(' · ') : r[k]))].map((r) => r.map(celda).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', contenido], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `consolidacion-ruta-${periodo.desde}-${periodo.hasta}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  const grupos = datos?.repartidores.filter((g) => !repartidor || g.id === repartidor) || [];
  const modificado = periodo && (periodo.desde !== fechas.desde || periodo.hasta !== fechas.hasta);
  return <section className="card ruta-consol">
    <header><div className="ruta-consol-ceja">CONTROL DE OPERACIÓN</div><h3>Consolidación de ruta</h3><p className="muted">Venta → ingreso de mercancía → gasto o crédito → liquidación</p></header>
    <form className="ruta-consol-filtros" onSubmit={consultar}>
      <label>Periodo<select className="input" value={tipo} onChange={(e) => { setTipo(e.target.value); if (e.target.value !== 'rango') setFechas(rango(e.target.value, fechas.desde)); }}><option value="dia">Día</option><option value="semana">Semana (lunes a domingo)</option><option value="rango">Rango de fechas</option></select></label>
      <label>{tipo === 'semana' ? 'Semana que contiene' : 'Desde'}<input required className="input" type="date" value={fechas.desde} onChange={(e) => setFechas(tipo === 'rango' ? { ...fechas, desde: e.target.value } : rango(tipo, e.target.value))} /></label>
      {tipo !== 'dia' && <label>Hasta<input required className="input" type="date" value={fechas.hasta} min={fechas.desde} disabled={tipo === 'semana'} onChange={(e) => setFechas({ ...fechas, hasta: e.target.value })} /></label>}
      <button className="btn btn-primary" disabled={cargando}>{cargando ? 'Consultando…' : 'Consolidar'}</button>
    </form>
    {error && <p role="alert" className="ruta-consol-rojo">{error}</p>}
    {cargando && <div role="status" className="ruta-consol-cargando">Cruzando ventas, recepciones, gastos, créditos y cortes…</div>}
    {!datos && !cargando && !error && <p className="ruta-consol-nota">Elige el periodo de las ventas y pulsa Consolidar. La consulta utiliza registros de la nube.</p>}
    {datos && <>
      <div className="ruta-consol-filtros"><label>Repartidor<select className="input" value={repartidor} onChange={(e) => setRepartidor(e.target.value)}><option value="">Todos los repartidores</option>{datos.repartidores.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}</select></label>
        <label className="ruta-consol-checkbox"><input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} /> Solo entregas con alertas</label>
        <button className="btn btn-ghost" onClick={exportar} disabled={!datos.entregas.length}>Exportar CSV</button></div>
      <p className="ruta-consol-nota">Ventas del <strong>{periodo.desde}</strong> al <strong>{periodo.hasta}</strong> (hora de Nogales). Comprobantes y cobros ligados: estado actual, incluidos los posteriores al periodo. {modificado && <strong>Filtros modificados: pulsa Consolidar para actualizar.</strong>}</p>
      {!grupos.length && <p>No hay ventas de ruta en este periodo.</p>}
      {grupos.map((g) => <article className="ruta-consol-grupo" key={g.id}>
        <div className="ruta-consol-titulo"><h4>{g.nombre}</h4><span>{g.entregas.length} entregas · {g.incidencias} con alertas</span></div>
        <div className="ruta-consol-indicadores">
          <Indicador titulo="Venta total" valor={monto(g.total)} detalle={`Contado ${monto(g.efectivo)} · Crédito ${monto(g.credito)}`} />
          <Indicador titulo="Efectivo liquidado" valor={monto(g.liquidado + g.cobrosLiquidados)} detalle="Ventas y cobros de crédito ligados" />
          <Indicador titulo="Pendiente de liquidar" valor={monto(g.pendiente + g.cobrosPendientes)} detalle="En tránsito; requiere recepción de efectivo" alerta={g.pendiente + g.cobrosPendientes > 0} />
          <Indicador titulo="Crédito por cobrar" valor={monto(g.saldoCredito)} detalle={`Cobrado ${monto(g.creditoCobrado)}`} />
        </div>
        {g.entregas.some((e) => e.efectivo == null) && <p className="ruta-consol-rojo">Los totales por forma de pago excluyen ventas sin desglose verificable.</p>}
        <details><summary>Arqueos de caja y mercancía del camión</summary>
          <p className="muted">Referencia acumulada de las cargas vinculadas, a la fecha de consulta. Los cortes pueden incluir ventas fuera del periodo. Se toma el último corte de cada carga; los cortes repetidos no se suman.</p>
          {g.arqueos.length ? <div className="table-wrap"><table className="data"><thead><tr><th>Carga</th><th>Fecha del corte</th><th>Esperado</th><th>Contado</th><th>Faltante / sobrante</th></tr></thead><tbody>{g.arqueos.map((c) => <tr key={c.id}><td>{c.carga_folio || c.carga_id}</td><td>{c.fecha}</td><td>{monto(c.efectivo_esperado)}</td><td>{monto(c.efectivo_contado)}</td><td className={c.diferenciaCalculada < 0 ? 'ruta-consol-rojo' : ''}>{monto(c.diferenciaCalculada)}</td></tr>)}</tbody></table></div> : <p>Sin arqueos en la nube: faltante de efectivo pendiente de comprobar con un corte de caja.</p>}
          <p className="ruta-consol-nota">Saldo teórico = cargada − vendida − devuelta. Para comprobar faltantes físicos se necesita una auditoría del camión. {onAuditoria && <button className="btn btn-ghost" onClick={onAuditoria}>Abrir Inv-op / Auditorías</button>}</p>
          {g.auditoria ? <div className="ruta-consol-nota">
            <strong>Última auditoría física vinculada: {g.auditoria.folio}</strong>
            <p>{ymdNogalesFromDate(g.auditoria.created_at)} · {g.auditoria.camion_etiqueta} · Guardada en este dispositivo. Solo acredita los productos contados en esa auditoría; no es un conteo actual ni necesariamente completo.</p>
            <p className={g.auditoria.resumen?.piezasFaltantes ? 'ruta-consol-rojo' : ''}>Faltantes: <strong>{g.auditoria.resumen?.piezasFaltantes || 0} pzas</strong> · Sobrantes: <strong>{g.auditoria.resumen?.piezasSobrantes || 0} pzas</strong> · Pérdida a costo: <strong>{monto(g.auditoria.resumen?.perdidaCosto)}</strong></p>
            <div className="table-wrap"><table className="data"><thead><tr><th>Producto contado</th><th>Teórico al auditar</th><th>Contado</th><th>Diferencia</th></tr></thead><tbody>{(g.auditoria.lineas || []).filter((l) => l.contado != null && l.diferencia !== 0).map((l) => <tr key={l.id}><td>{l.nombre}</td><td>{l.teorico}</td><td>{l.contado}</td><td className={l.diferencia < 0 ? 'ruta-consol-rojo' : ''}>{l.diferencia}</td></tr>)}</tbody></table></div>
          </div> : <p className="muted">Sin auditorías físicas vinculadas disponibles en este dispositivo. Los faltantes físicos quedan pendientes de comprobar.</p>}
          {!!g.stock.length && <div className="table-wrap"><table className="data"><thead><tr><th>Producto / carga</th><th>Cargada</th><th>Vendida</th><th>Devuelta</th><th>Saldo teórico actual</th></tr></thead><tbody>{g.stock.map((l) => <tr key={l.id}><td>{l.producto_nombre || l.producto_id}<small className="muted"> · {l.carga_id}</small></td><td>{l.qty_cargada}</td><td>{l.qty_vendida}</td><td>{l.qty_devuelta}</td><td className={l.saldo < 0 ? 'ruta-consol-rojo' : ''}>{l.saldo}{l.saldo < 0 ? ' · inconsistencia' : ''}</td></tr>)}</tbody></table></div>}
        </details>
        {g.entregas.filter((e) => !soloAlertas || e.alertas.length).map((e) => <DetalleVenta key={e.id} e={e} />)}
        {soloAlertas && !g.incidencias && <p className="ruta-consol-verde">Sin alertas documentales en las entregas de este repartidor.</p>}
      </article>)}
      <p className="muted">Una diferencia negativa indica menos registro que lo esperado; una positiva indica exceso. El crédito pendiente no exige un gasto de efectivo hasta su cobro. Los enlaces se verifican por identificador o folio, sin aproximaciones por importe o nombre.</p>
    </>}
  </section>;
}
