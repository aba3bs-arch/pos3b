import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { abonarPrestamo, liquidarPrestamo, listarPrestamos } from '../lib/valesPrestamos.js';
import {
  aportarCapitalFondo,
  desembolsarPrestamo,
  editarMovimientoFondo,
  editarPrestamoEnFondo,
  eliminarMovimientoFondo,
  etiquetaMovimientoFondo,
  listarMovimientosFondo,
  puedeDesembolsarPrestamo,
  quitarPrestamoDelFondo,
  resumenFondoPrestamos,
} from '../lib/fondoPrestamos.js';
import { CUOTA_SEMANAL_MINIMA } from '../lib/contabilidadConstants.js';
import { esPrestamoArrendatario } from '../lib/beneficiariosExternos.js';
import { fmtMonto } from '../lib/consultasUi.js';
import FormularioDesembolsoPrestamo from './FormularioDesembolsoPrestamo.jsx';

function fechaPhoenix(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    timeZone: 'America/Phoenix',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PanelFondoPrestamos({ supabase, user }) {
  const [prestamos, setPrestamos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [aviso, setAviso] = useState('');
  const [capitalNuevo, setCapitalNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [editMov, setEditMov] = useState(null);
  const [editPrest, setEditPrest] = useState(null);
  const puede = puedeDesembolsarPrestamo(user);

  const cargar = useCallback(async () => {
    if (!supabase) return;
    const [p, m] = await Promise.all([
      listarPrestamos(supabase, { incluirPendientes: true, limit: 400 }),
      listarMovimientosFondo(supabase),
    ]);
    setPrestamos((p.data || []).filter((x) => x && !esPrestamoArrendatario(x)));
    setMovimientos(m.data || []);
    setAviso(m.aviso || '');
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resumen = useMemo(() => resumenFondoPrestamos(movimientos), [movimientos]);
  const porDesembolsar = prestamos.filter((p) => p.estado === 'pendiente_desembolso');
  const idsDesembolso = new Set(
    movimientos.filter((m) => m.tipo === 'desembolso' && m.prestamo_id).map((m) => String(m.prestamo_id)),
  );
  const libro = prestamos.filter((p) => idsDesembolso.has(String(p.id)));

  const registrarCapital = async () => {
    if (!puede) return alert('El capital lo registra JLBB.');
    setGuardando(true);
    const r = await aportarCapitalFondo(supabase, capitalNuevo, { user, nombre: user?.nombre });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    if (r.aviso) alert(r.aviso);
    setCapitalNuevo('');
    await cargar();
  };

  const desembolsar = async (prestamo) => {
    if (!confirm(`¿Desembolsar ${fmtMonto(prestamo.monto_original)} a ${prestamo.nombre_empleado} desde el capital?`)) return;
    setGuardando(true);
    const r = await desembolsarPrestamo(supabase, prestamo.id, { user, nombre: user?.nombre });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    alert(r.mensaje);
    await cargar();
  };

  const guardarMov = async () => {
    if (!editMov) return;
    setGuardando(true);
    const r = await editarMovimientoFondo(supabase, editMov.id, {
      monto: editMov.monto,
      notas: editMov.notas,
    }, { user });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    setEditMov(null);
    await cargar();
  };

  const borrarMov = async (mov) => {
    const que = etiquetaMovimientoFondo(mov.tipo);
    if (!confirm(`¿Eliminar el registro de ${que} por ${fmtMonto(mov.monto)}?`)) return;
    setGuardando(true);
    const r = await eliminarMovimientoFondo(supabase, mov.id, { user });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    await cargar();
  };

  const guardarPrest = async () => {
    if (!editPrest) return;
    setGuardando(true);
    const r = await editarPrestamoEnFondo(supabase, editPrest.id, {
      saldo: editPrest.saldo,
      numCuotas: editPrest.numCuotas,
    }, { user });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    setEditPrest(null);
    await cargar();
  };

  const borrarPrest = async (p) => {
    if (!confirm(`¿Eliminar el préstamo de ${p.nombre_empleado} del fondo? El capital se ajusta.`)) return;
    setGuardando(true);
    const r = await quitarPrestamoDelFondo(supabase, p.id, { user });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    await cargar();
  };

  const cobrarPrest = async (p, liquidar) => {
    if (!puede) return alert('El cobro lo registra JLBB.');
    const saldo = Number(p.saldo) || 0;
    if (!(saldo > 0)) return alert('Sin saldo.');
    let monto = saldo;
    if (!liquidar) {
      const raw = prompt(
        `Cobro JLBB · ${p.nombre_empleado}\nSaldo: ${fmtMonto(saldo)}\n\nMonto a cobrar:`,
        String(Math.min(saldo, CUOTA_SEMANAL_MINIMA)),
      );
      if (raw === null) return;
      monto = parseFloat(String(raw).replace(',', '.'));
      if (!(monto > 0) || monto > saldo + 0.001) return alert('Monto inválido.');
    } else if (!confirm(`¿Liquidar ${fmtMonto(saldo)} de ${p.nombre_empleado}? El monto vuelve al capital.`)) {
      return;
    }
    setGuardando(true);
    const r = liquidar
      ? await liquidarPrestamo(supabase, p, { createdBy: user?.nombre || 'JLBB', nombreActor: user?.nombre })
      : await abonarPrestamo(supabase, p, monto, { createdBy: user?.nombre || 'JLBB', nombreActor: user?.nombre });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    alert(r.liquidado ? `Liquidado. Volvió ${fmtMonto(monto)} al capital.` : `Cobro de ${fmtMonto(monto)}. Saldo: ${fmtMonto(r.saldo)}.`);
    await cargar();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
        El fondo tiene un capital. De ahí salen los préstamos. JLBB cobra cada abono: resta el saldo del préstamo y vuelve a sumar al capital. Ya no se descuenta en nómina.
      </p>
      {aviso && <p className="muted" style={{ margin: 0, color: 'var(--warning, #c47f00)' }}>{aviso}</p>}
      <div className="card" style={{ maxWidth: 520 }}>
        <div className="muted" style={{ fontSize: '0.8rem' }}>Capital del fondo</div>
        <strong style={{ fontSize: '1.6rem', color: '#b45309' }}>{fmtMonto(resumen.capital)}</strong>
        <p className="muted" style={{ margin: '0.35rem 0 0.6rem', fontSize: '0.8rem' }}>
          Aportado {fmtMonto(resumen.capitalAportado)} · desembolsado {fmtMonto(resumen.desembolsado)} · cobros reingresados {fmtMonto(resumen.reingresado)}
        </p>
        {puede && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="Capital a agregar"
              value={capitalNuevo}
              onChange={(e) => setCapitalNuevo(e.target.value)}
              style={{ maxWidth: 180 }}
            />
            <button type="button" className="btn btn-primary" disabled={guardando || !(Number(capitalNuevo) > 0)} onClick={() => void registrarCapital()}>
              Registrar capital
            </button>
          </div>
        )}
      </div>

      {porDesembolsar.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>Por desembolsar</h3>
          {porDesembolsar.map((p) => (
            <FormularioDesembolsoPrestamo
              key={p.id}
              prestamo={p}
              capital={resumen.capital}
              guardando={guardando}
              onDesembolsar={puede ? desembolsar : undefined}
            />
          ))}
          {!puede && <p className="muted" style={{ margin: 0 }}>JLBB confirma el desembolso.</p>}
        </div>
      )}

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem' }}>Lo que se prestó</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Monto</th>
                <th>Saldo</th>
                <th>Cuotas</th>
                <th>Método</th>
                {puede && <th />}
              </tr>
            </thead>
            <tbody>
              {libro.length === 0 ? (
                <tr><td colSpan={puede ? 6 : 5} className="muted">Cuando JLBB desembolse, aquí queda a quién se prestó y cuánto falta.</td></tr>
              ) : libro.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre_empleado}</td>
                  <td>{fmtMonto(p.monto_original)}</td>
                  <td style={{ fontWeight: 700 }}>
                    {editPrest?.id === p.id ? (
                      <input className="input" type="number" min="0" step="0.01" value={editPrest.saldo} onChange={(e) => setEditPrest({ ...editPrest, saldo: e.target.value })} style={{ maxWidth: 110 }} />
                    ) : fmtMonto(p.saldo)}
                  </td>
                  <td>
                    {editPrest?.id === p.id ? (
                      <input className="input" type="number" min="1" step="1" value={editPrest.numCuotas} onChange={(e) => setEditPrest({ ...editPrest, numCuotas: e.target.value })} style={{ maxWidth: 80 }} />
                    ) : (p.num_cuotas || '—')}
                  </td>
                  <td className="muted">Cobro JLBB</td>
                  {puede && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {editPrest?.id === p.id ? (
                        <>
                          <button type="button" className="btn btn-primary" style={{ padding: '0.2rem 0.45rem' }} disabled={guardando} onClick={() => void guardarPrest()}>Guardar</button>
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.45rem' }} onClick={() => setEditPrest(null)}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          {(Number(p.saldo) || 0) > 0 && p.estado !== 'cancelado' && (
                            <>
                              <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.45rem' }} disabled={guardando} onClick={() => void cobrarPrest(p, false)}>Cobrar</button>
                              <button type="button" className="btn btn-primary" style={{ padding: '0.2rem 0.45rem', fontSize: '0.8rem' }} disabled={guardando} onClick={() => void cobrarPrest(p, true)}>Liquidar</button>
                            </>
                          )}
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.45rem' }} onClick={() => setEditPrest({ id: p.id, saldo: p.saldo ?? 0, numCuotas: p.num_cuotas || 1 })}>Editar</button>
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.45rem', color: 'var(--danger)' }} onClick={() => void borrarPrest(p)}>Eliminar</button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 0.35rem' }}>Registros</h3>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.82rem' }}>
          Cuando JLBB cobra, aquí aparece un reingreso. Ese monto se suma al capital y se resta del saldo del préstamo. Los descuentos viejos de nómina siguen en esta lista.
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Registro</th>
                <th>Empleado</th>
                <th>Monto</th>
                <th>Nota</th>
                {puede && <th />}
              </tr>
            </thead>
            <tbody>
              {movimientos.length === 0 ? (
                <tr><td colSpan={puede ? 6 : 5} className="muted">Aún no hay registros. El capital, el desembolso y cada cobro quedan en esta lista.</td></tr>
              ) : movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="muted">{fechaPhoenix(m.created_at)}</td>
                  <td>{etiquetaMovimientoFondo(m.tipo)}</td>
                  <td>{m.nombre_empleado || '—'}</td>
                  <td style={{ fontWeight: 700 }}>
                    {editMov?.id === m.id ? (
                      <input className="input" type="number" min="0.01" step="0.01" value={editMov.monto} onChange={(e) => setEditMov({ ...editMov, monto: e.target.value })} style={{ maxWidth: 110 }} />
                    ) : fmtMonto(m.monto)}
                  </td>
                  <td className="muted">
                    {editMov?.id === m.id ? (
                      <input className="input" value={editMov.notas} onChange={(e) => setEditMov({ ...editMov, notas: e.target.value })} />
                    ) : (m.notas || '—')}
                  </td>
                  {puede && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {editMov?.id === m.id ? (
                        <>
                          <button type="button" className="btn btn-primary" style={{ padding: '0.2rem 0.45rem' }} disabled={guardando} onClick={() => void guardarMov()}>Guardar</button>
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.45rem' }} onClick={() => setEditMov(null)}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.45rem' }} onClick={() => setEditMov({ id: m.id, monto: m.monto, notas: m.notas || '' })}>Editar</button>
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.45rem', color: 'var(--danger)' }} onClick={() => void borrarMov(m)}>Eliminar</button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
