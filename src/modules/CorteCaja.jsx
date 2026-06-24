import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  etiquetaGrupoPago,
  guardarCorte,
  leerCortesLocales,
  corteYaRegistrado,
} from '../lib/corteCaja.js';
import {
  EVENTO_TURNOS,
  leerTurnos,
  nombreTurnoLegible,
  turnoActual,
  usuarioAutorizadoCorte,
} from '../lib/turnos.js';
import {
  cargarDiaCaja,
  lineasCancelablesVenta,
  listaMovimientosCaja,
  registrarCancelacion,
  resumirMovimientosCaja,
} from '../lib/movimientosCaja.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import { imprimirCorte } from '../lib/impresion.js';
import { leerConfigImpresion } from '../lib/posConfig.js';

function fmtHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
}

export default function CorteCaja({ supabase, sucursal, user, inventario, cargarDatos }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [pestana, setPestana] = useState('corte');
  const [fecha, setFecha] = useState(hoy);
  const [ventas, setVentas] = useState([]);
  const [cancelaciones, setCancelaciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [efectivoContado, setEfectivoContado] = useState('');
  const [notas, setNotas] = useState('');
  const [historial, setHistorial] = useState(() => leerCortesLocales());
  const [msg, setMsg] = useState('');

  const [ventaSel, setVentaSel] = useState('');
  const [lineasCancel, setLineasCancel] = useState([]);
  const [motivoCancel, setMotivoCancel] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [ventasOtrasTiendas, setVentasOtrasTiendas] = useState(null);
  const [turnos, setTurnos] = useState(() => leerTurnos());
  const [turnoActivo, setTurnoActivo] = useState(() => turnoActual());
  const [corteExistente, setCorteExistente] = useState(null);
  const [bloqueoCorte, setBloqueoCorte] = useState('');

  const resumen = useMemo(() => resumirMovimientosCaja(ventas, cancelaciones), [ventas, cancelaciones]);
  const movimientos = useMemo(() => listaMovimientosCaja(ventas, cancelaciones), [ventas, cancelaciones]);

  const diferencia = useMemo(() => {
    const contado = parseFloat(efectivoContado);
    if (Number.isNaN(contado)) return null;
    return contado - resumen.efectivoEsperado;
  }, [efectivoContado, resumen.efectivoEsperado]);

  const ventaParaCancel = useMemo(() => ventas.find((v) => String(v.id) === String(ventaSel)), [ventas, ventaSel]);

  const cargar = useCallback(async () => {
    if (!supabase) {
      setError('Configura Supabase para consultar ventas.');
      setVentas([]);
      setCancelaciones([]);
      return;
    }
    setLoading(true);
    setError('');
    setMsg('');
    setAviso('');
    const { ventas: rows, cancelaciones: canc, error: err, aviso: av, ventasOtrasTiendas: otras } = await cargarDiaCaja(supabase, {
      sucursal,
      fecha,
      turno: turnoActivo,
    });
    setLoading(false);
    if (err) {
      setError(err);
      setVentas([]);
      setCancelaciones([]);
      setVentasOtrasTiendas(null);
      return;
    }
    setVentas(rows);
    setCancelaciones(canc);
    setVentasOtrasTiendas(otras);
    if (av) setAviso(av);
  }, [supabase, sucursal, fecha, turnoActivo?.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!ventaParaCancel) {
      setLineasCancel([]);
      return;
    }
    setLineasCancel(
      lineasCancelablesVenta(ventaParaCancel, cancelaciones).map((l) => ({
        ...l,
        qtyCancelar: 0,
      })),
    );
  }, [ventaParaCancel, cancelaciones]);

  useEffect(() => {
    const sync = () => {
      const t = leerTurnos();
      setTurnos(t);
      setTurnoActivo(turnoActual(t));
    };
    sync();
    window.addEventListener(EVENTO_TURNOS, sync);
    return () => window.removeEventListener(EVENTO_TURNOS, sync);
  }, []);

  useEffect(() => {
    const t = turnoActual(turnos);
    setTurnoActivo(t);
    const auth = usuarioAutorizadoCorte(user, t);
    setBloqueoCorte(auth.ok ? '' : auth.error);
  }, [turnos, user]);

  useEffect(() => {
    if (!supabase || !turnoActivo) {
      setCorteExistente(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await corteYaRegistrado(supabase, { sucursal, fecha, turnoId: turnoActivo.id });
      if (!cancelled) setCorteExistente(r.existe ? r : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, sucursal, fecha, turnoActivo?.id, ventas.length]);

  const guardarCorteHandler = async () => {
    if (bloqueoCorte) return alert(bloqueoCorte);
    if (corteExistente?.existe) return alert('Ya se registró el corte de este turno. Solo uno por turno.');
    const contado = parseFloat(efectivoContado);
    if (Number.isNaN(contado)) {
      alert('Indica cuánto efectivo contaste en caja.');
      return;
    }
    const corte = {
      fecha,
      sucursal,
      usuario: user?.nombre || '—',
      turno_id: turnoActivo?.id,
      turno_nombre: nombreTurnoLegible(turnoActivo) || null,
      hora: new Date().toISOString(),
      tickets: resumen.ticketsBruto,
      cancelaciones: resumen.cancelaciones,
      totalVentas: resumen.total,
      totalBruto: resumen.totalBruto,
      totalCancelaciones: resumen.totalCancelaciones,
      efectivoEsperado: resumen.efectivoEsperado,
      efectivoContado: contado,
      diferencia: contado - resumen.efectivoEsperado,
      electronico: resumen.electronico,
      grupos: resumen.grupos,
      detalleMetodos: resumen.detalleMetodos,
      notas: notas.trim(),
    };
    const r = await guardarCorte(supabase, corte, user?.id);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    setHistorial(r.local);
    setMsg(r.id ? 'Corte guardado en la nube y en este equipo.' : 'Corte guardado en este equipo.');
    setCorteExistente({ existe: true, corte: { ...corte, id: r.id }, origen: r.id ? 'nube' : 'local' });
    setNotas('');
    if (leerConfigImpresion().autoCorte) {
      await imprimirCorteDesdeResumen(contado);
    }
  };

  const ejecutarCancelacion = async () => {
    if (!ventaParaCancel) return alert('Elige un ticket.');
    const lineas = lineasCancel.filter((l) => Number(l.qtyCancelar) > 0);
    if (!lineas.length) return alert('Indica la cantidad a cancelar por producto.');
    if (!confirm(`¿Cancelar ${lineas.length} línea(s) por $${lineas.reduce((a, l) => a + l.precio * l.qtyCancelar, 0).toFixed(2)}? Se devolverá al inventario.`)) return;
    setCancelando(true);
    const r = await registrarCancelacion(supabase, {
      venta: ventaParaCancel,
      lineas,
      user,
      sucursal,
      inventario,
      motivo: motivoCancel,
    });
    setCancelando(false);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    setMsg(r.avisoLocal ? `Cancelación guardada en este equipo. ${r.avisoLocal}` : 'Cancelación registrada. Inventario actualizado.');
    setVentaSel('');
    setMotivoCancel('');
    cargarDatos?.();
    void cargar();
    setPestana('movimientos');
  };

  const imprimirCorteDesdeResumen = async (contadoOverride) => {
    const contado = contadoOverride ?? (efectivoContado !== '' && !Number.isNaN(parseFloat(efectivoContado)) ? parseFloat(efectivoContado) : null);
    const r = await imprimirCorte({
      fecha,
      sucursal,
      usuario: user?.nombre,
      turno: turnoActivo?.nombre,
      tickets: resumen.ticketsBruto,
      cancelaciones: resumen.cancelaciones,
      totalBruto: resumen.totalBruto,
      totalCancelaciones: resumen.totalCancelaciones,
      total: resumen.total,
      detalleMetodos: resumen.detalleMetodos,
      efectivoEsperado: resumen.efectivoEsperado,
      efectivoContado: contado,
      diferencia: contado != null ? contado - resumen.efectivoEsperado : diferencia,
      notas: notas.trim(),
    });
    if (!r.ok) alert(r.error);
  };

  const imprimirResumen = () => {
    void imprimirCorteDesdeResumen();
  };

  const historialFiltrado = historial.filter((c) => c.fecha === fecha && (!sucursal || c.sucursal === sucursal)).slice(0, 8);

  const kpi = (label, value, sub, color) => (
    <div className="card" style={{ border: '1px solid var(--border)', padding: '0.85rem' }}>
      <div className="muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: color || 'var(--brand-blue)', marginTop: '0.25rem' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>{sub}</div>}
    </div>
  );

  const barraFecha = (
    <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
        <label className="muted">
          Fecha
          <input type="date" className="input" style={{ marginTop: '0.35rem' }} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <button type="button" className="btn btn-primary" onClick={cargar} disabled={loading}>
          {loading ? 'Actualizando…' : 'Actualizar día'}
        </button>
      </div>
      {error && <p style={{ color: 'var(--brand-red)', margin: '0.75rem 0 0', fontSize: '0.9rem' }}>{error}</p>}
      {aviso && <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>{aviso}</p>}
      {msg && <p style={{ color: 'var(--brand-green)', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>{msg}</p>}
    </div>
  );

  const kpisResumen = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
      {kpi('Tickets', resumen.ticketsBruto, `${resumen.cancelaciones} cancelación(es)`)}
      {kpi('Ventas brutas', `$${resumen.totalBruto.toFixed(2)}`, 'Antes de cancelaciones')}
      {kpi('Cancelaciones', `-$${resumen.totalCancelaciones.toFixed(2)}`, 'Resta del corte', 'var(--brand-red)')}
      {kpi('Total sistema', `$${resumen.total.toFixed(2)}`, 'Neto registrado', 'var(--brand-blue)')}
      {kpi('Efectivo neto', `$${resumen.efectivoEsperado.toFixed(2)}`, 'Para arqueo', 'var(--brand-green)')}
      {kpi('Electrónico neto', `$${resumen.electronico.toFixed(2)}`, 'Tarjeta, transfer, QR')}
    </div>
  );

  const avisoSinVentas =
    !loading && ventas.length === 0 && !error ? (
      <div className="card" style={{ borderColor: 'rgba(245,158,11,0.5)', background: '#fffbeb' }}>
        <strong style={{ color: '#b45309' }}>Sin ventas para este corte</strong>
        <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
          Filtrando: <strong>{etiquetaTienda(sucursal)}</strong> · fecha <strong>{fecha}</strong>.
          <br />
          El corte solo muestra ventas hechas en <strong>esta misma tienda</strong> (la fijada en la caja al cobrar en Ventas).
        </p>
        {ventasOtrasTiendas && Object.keys(ventasOtrasTiendas).length > 0 && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
            Hoy sí hay tickets en otra tienda:{' '}
            {Object.entries(ventasOtrasTiendas)
              .map(([s, n]) => `${etiquetaTienda(s)} (${n})`)
              .join(', ')}
            . Cambia la tienda de la caja en Configuración o al iniciar sesión.
          </p>
        )}
        {!ventasOtrasTiendas && (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
            Si acabas de vender, confirma que la tienda de la caja coincida. También puedes cambiar la fecha arriba.
          </p>
        )}
      </div>
    ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '960px' }}>
      <div>
        <h2 style={{ margin: 0, color: 'var(--brand-blue)' }}>Corte de caja</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Total acumulado del sistema, movimientos por ticket y cancelaciones. Solo se incluyen ventas del turno activo (evita mezclar caja diurna con nocturna). Tienda: <span className="badge">{sucursal}</span>
          {turnoActivo && (
            <>
              {' '}
              · Turno: <span className="badge">{nombreTurnoLegible(turnoActivo)}</span>{' '}
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                entrada {turnoActivo.hora_inicio} · salida {turnoActivo.hora_fin}
              </span>
            </>
          )}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {[
          { id: 'corte', label: 'Corte' },
          { id: 'movimientos', label: 'Movimientos' },
          { id: 'cancelaciones', label: 'Cancelaciones' },
        ].map((t) => (
          <button key={t.id} type="button" className={pestana === t.id ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setPestana(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {barraFecha}
      {bloqueoCorte && (
        <div className="card" style={{ borderColor: 'rgba(211,47,47,0.4)', background: '#fff5f5' }}>
          <strong style={{ color: 'var(--brand-red)' }}>Corte no permitido</strong>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>{bloqueoCorte}</p>
        </div>
      )}
      {corteExistente?.existe && (
        <div className="card" style={{ borderColor: 'rgba(59,105,181,0.4)', background: 'rgba(59,105,181,0.06)' }}>
          <strong style={{ color: 'var(--brand-blue)' }}>Corte de turno ya registrado</strong>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>
            {nombreTurnoLegible(turnoActivo)} · {fecha} · {corteExistente.corte?.usuario || '—'}
            {corteExistente.corte?.created_at && ` · ${fmtHora(corteExistente.corte.created_at)}`}
            {' '}
            ({corteExistente.origen}). Por seguridad solo se permite <strong>un corte por turno</strong>.
          </p>
        </div>
      )}
      {avisoSinVentas}
      {kpisResumen}

      {pestana === 'corte' && (
        <div className="grid-2">
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)' }}>Desglose neto por método</h3>
            {resumen.detalleMetodos.length === 0 ? (
              <p className="muted">Sin movimientos en esta fecha.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Método</th>
                      <th style={{ textAlign: 'right' }}>Monto neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.detalleMetodos.map((d) => (
                      <tr key={d.metodo}>
                        <td>{d.metodo}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>${d.monto.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h4 style={{ margin: '1rem 0 0.5rem', fontSize: '0.9rem' }}>Por grupo</h4>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.9rem' }}>
              {Object.entries(resumen.grupos).map(([g, m]) => (
                <li key={g}>
                  {etiquetaGrupoPago(g)}: <strong>${Number(m).toFixed(2)}</strong>
                </li>
              ))}
            </ul>
          </div>

          <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Arqueo de efectivo</h3>
            <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
              El sistema registra <strong>${resumen.efectivoEsperado.toFixed(2)}</strong> en efectivo (ventas − cancelaciones en efectivo).
            </p>
            <label className="muted">
              Efectivo contado (MXN)
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                style={{ marginTop: '0.35rem', fontSize: '1.2rem', fontWeight: 700 }}
                value={efectivoContado}
                onChange={(e) => setEfectivoContado(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <div style={{ marginTop: '0.75rem', padding: '0.85rem', borderRadius: '10px', background: 'var(--surface)' }}>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                Diferencia (contado − esperado)
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: diferencia == null ? 'var(--muted)' : Math.abs(diferencia) < 0.01 ? 'var(--brand-green)' : diferencia > 0 ? 'var(--brand-blue)' : 'var(--brand-red)' }}>
                {diferencia == null ? '—' : `$${diferencia.toFixed(2)} MXN`}
              </div>
            </div>
            <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
              Notas
              <textarea className="input" style={{ marginTop: '0.35rem', minHeight: '64px' }} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-success" onClick={guardarCorteHandler} disabled={Boolean(bloqueoCorte || corteExistente?.existe)}>
                Guardar corte
              </button>
              <button type="button" className="btn btn-ghost" onClick={imprimirResumen}>
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {pestana === 'movimientos' && (
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Movimientos del día ({movimientos.length})</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Cada ticket suma; cada cancelación resta. La columna <strong>Acumulado</strong> es el total neto que lleva el sistema.
          </p>
          <div className="table-wrap" style={{ maxHeight: '480px' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Tipo</th>
                  <th>Detalle</th>
                  <th>Pago</th>
                  <th>Monto</th>
                  <th>Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      Sin movimientos. Las ventas del día aparecerán aquí.
                    </td>
                  </tr>
                ) : (
                  movimientos.map((m) => (
                    <tr key={`${m.tipo}-${m.id}`} style={m.tipo === 'cancelacion' ? { background: 'rgba(211,47,47,0.06)' } : undefined}>
                      <td>{fmtHora(m.hora)}</td>
                      <td>
                        <span className="badge" style={m.tipo === 'cancelacion' ? { background: '#fff5f5', color: 'var(--brand-red)' } : undefined}>
                          {m.tipo === 'cancelacion' ? 'Cancelación' : 'Ticket'}
                        </span>
                      </td>
                      <td>
                        {m.detalle}
                        {m.articulos?.length > 0 && (
                          <div className="muted" style={{ fontSize: '0.75rem' }}>
                            {m.articulos.map((a) => `${a.nombre || a.id} ×${a.qty ?? 1}`).join(', ')}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>{m.metodo || '—'}</td>
                      <td style={{ fontWeight: 700, color: m.monto < 0 ? 'var(--brand-red)' : 'var(--brand-green)' }}>
                        {m.monto < 0 ? '-' : ''}${Math.abs(m.monto).toFixed(2)}
                      </td>
                      <td style={{ fontWeight: 800 }}>${m.acumulado.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pestana === 'cancelaciones' && (
        <div className="grid-2">
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Cancelar productos de un ticket</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
              Al cancelar, el producto <strong>vuelve al inventario</strong> y el importe <strong>se resta</strong> en Movimientos y en el corte.
            </p>
            <label className="muted">
              Ticket del día
              <select className="select" style={{ marginTop: '0.35rem' }} value={ventaSel} onChange={(e) => setVentaSel(e.target.value)}>
                <option value="">— Elige ticket —</option>
                {ventas.map((v) => (
                  <option key={v.id} value={v.id}>
                    {fmtHora(v.created_at)} · {v.vendedor} · ${Number(v.total).toFixed(2)} · {v.metodo_pago}
                  </option>
                ))}
              </select>
            </label>
            {ventaParaCancel && lineasCancel.length === 0 && (
              <p className="muted" style={{ marginTop: '0.75rem' }}>Este ticket ya no tiene líneas cancelables (todo fue cancelado).</p>
            )}
            {lineasCancel.length > 0 && (
              <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Vendido</th>
                      <th>Ya cancel.</th>
                      <th>Cancelar</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineasCancel.map((l) => (
                      <tr key={l.id}>
                        <td>{l.nombre}</td>
                        <td>{l.vendido}</td>
                        <td>{l.cancelado}</td>
                        <td style={{ maxWidth: '80px' }}>
                          <input
                            type="number"
                            min={0}
                            max={l.pendiente}
                            className="input"
                            style={{ padding: '0.35rem', width: '64px' }}
                            value={l.qtyCancelar}
                            onChange={(e) => {
                              const v = Math.min(l.pendiente, Math.max(0, parseInt(e.target.value, 10) || 0));
                              setLineasCancel((rows) => rows.map((x) => (x.id === l.id ? { ...x, qtyCancelar: v } : x)));
                            }}
                          />
                        </td>
                        <td>${(l.precio * (Number(l.qtyCancelar) || 0)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
              Motivo (opcional)
              <input className="input" style={{ marginTop: '0.35rem' }} value={motivoCancel} onChange={(e) => setMotivoCancel(e.target.value)} placeholder="Error de cobro, devolución cliente…" />
            </label>
            <button type="button" className="btn btn-danger" style={{ marginTop: '0.75rem' }} disabled={!lineasCancel.some((l) => l.qtyCancelar > 0) || cancelando} onClick={ejecutarCancelacion}>
              {cancelando ? 'Procesando…' : 'Registrar cancelación'}
            </button>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Cancelaciones del día ({cancelaciones.length})</h3>
            <div className="table-wrap" style={{ maxHeight: '400px' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Usuario</th>
                    <th>Productos</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {cancelaciones.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        Sin cancelaciones hoy.
                      </td>
                    </tr>
                  ) : (
                    cancelaciones.map((c) => (
                      <tr key={c.id}>
                        <td>{fmtHora(c.created_at)}</td>
                        <td>{c.usuario}</td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {(c.articulos || []).map((a) => `${a.nombre} ×${a.qty}`).join(', ')}
                          {c.motivo && <div className="muted">{c.motivo}</div>}
                        </td>
                        <td style={{ color: 'var(--brand-red)', fontWeight: 700 }}>-${Number(c.total).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {historialFiltrado.length > 0 && pestana === 'corte' && (
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Cortes guardados (este equipo)</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Usuario</th>
                  <th>Neto sistema</th>
                  <th>Contado</th>
                  <th>Dif.</th>
                </tr>
              </thead>
              <tbody>
                {historialFiltrado.map((c) => (
                  <tr key={c.id}>
                    <td>{c.hora ? new Date(c.hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td>{c.usuario}</td>
                    <td>${Number(c.totalVentas ?? c.total).toFixed(2)}</td>
                    <td>${Number(c.efectivoContado).toFixed(2)}</td>
                    <td style={{ color: Number(c.diferencia) < 0 ? 'var(--brand-red)' : 'var(--brand-green)', fontWeight: 700 }}>
                      ${Number(c.diferencia).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
