import React, { useCallback, useEffect, useState } from 'react';
import { esAbb } from '../lib/contabilidadConstants.js';
import {
  claveRecolectorRVirtual,
  entregarCustodiaAAbb,
  fmtMonto,
  listarBandejaRVirtual,
  recibirRecoleccionesRVirtual,
} from '../lib/rVirtual.js';
import { etiquetaCuentaRt } from '../lib/rtCuentas.js';

function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Chevron({ abierto }) {
  return (
    <span style={{ display: 'inline-block', transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
      ▸
    </span>
  );
}

export default function PanelRVirtual({ supabase, user }) {
  const adminNombre = user?.nombre || '';
  const adminEsAbb = esAbb(adminNombre);
  const miClave = claveRecolectorRVirtual(adminNombre);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [recolectores, setRecolectores] = useState([]);
  const [porEntregarAbb, setPorEntregarAbb] = useState([]);
  const [abierto, setAbierto] = useState(null);
  const [abiertoAbb, setAbiertoAbb] = useState(null);
  const [trabajando, setTrabajando] = useState('');

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    const res = await listarBandejaRVirtual(supabase);
    setRecolectores(res.recolectores || []);
    setPorEntregarAbb(res.porEntregarAbb || []);
    setError(res.error || '');
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const recibir = async (grupo) => {
    const n = (grupo.items || []).filter((it) => it.receivable).length;
    if (!n) {
      setMsg('No hay recolecciones de Virtual/Garage pendientes de recibir.');
      return;
    }
    if (!confirm(
      `¿Recibir ${n} recolección(es) de ${grupo.etiqueta} por ${fmtMonto(grupo.totalRecibir)}?\n\n`
      + `Se cargarán a tu cuenta (${adminNombre || 'admin'}).`
      + (adminEsAbb ? '\nComo ABB, quedan entregadas a ti.' : '\nDespués deberás entregarlas a ABB.'),
    )) return;
    setTrabajando(`rec-${grupo.clave}`);
    setMsg('');
    const res = await recibirRecoleccionesRVirtual(supabase, {
      recolectorClave: grupo.clave,
      adminNombre,
      items: grupo.items,
    });
    setTrabajando('');
    if (!res.ok) {
      setError(res.error || 'No se pudo recibir.');
      return;
    }
    setMsg(
      res.entregadoAbb
        ? `Recibido ${fmtMonto(res.total)} de ${grupo.etiqueta}. Entregado a: ABB (tu cuenta).`
        : `Recibido ${fmtMonto(res.total)} de ${grupo.etiqueta} en tu cuenta. Pendiente de entregar a ABB.`,
    );
    await cargar();
  };

  const tomarEntrega = async (grupo) => {
    if (!adminEsAbb) return;
    if (!confirm(
      `¿Marcar entregado a: ABB las recolecciones de ${grupo.etiqueta} (${fmtMonto(grupo.total)})?\n\n`
      + `Se borrarán de la cuenta de ${grupo.nombre}.`,
    )) return;
    setTrabajando(`abb-${grupo.clave}`);
    setMsg('');
    const res = await entregarCustodiaAAbb(supabase, {
      recibidoPor: grupo.nombre,
      abbNombre: adminNombre,
    });
    setTrabajando('');
    if (!res.ok) {
      setError(res.error || 'No se pudo tomar la entrega.');
      return;
    }
    setMsg(
      `Entregado a: ${res.entregadoA}. Se quitaron ${fmtMonto(res.total)} de la cuenta de ${grupo.etiqueta}.`,
    );
    await cargar();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>R Virtual</h3>
        <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
          Solo recolecciones de cortes Virtual y Garage.
          No incluye abarrotes ni traspasos a crédito.
          Las ya recibidas aquí no vuelven a aparecer.
          {adminEsAbb
            ? ' Tú eres ABB: al recibir quedan en tu cuenta; también puedes quitarle a quien te entregue.'
            : ' Al recibir se cargan a tu cuenta; después debes entregarlas a ABB.'}
        </p>
      </div>

      {error && (
        <div className="card" style={{ borderLeft: '4px solid var(--danger)', padding: '0.75rem 1rem' }}>
          <p style={{ margin: 0, fontSize: '0.88rem' }}>{error}</p>
        </div>
      )}
      {msg && (
        <div className="card" style={{ padding: '0.65rem 1rem', background: 'rgba(59,105,181,0.08)' }}>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>{msg}</p>
        </div>
      )}

      {cargando ? (
        <p className="muted">Cargando recolecciones…</p>
      ) : (
        <>
          {!adminEsAbb && porEntregarAbb.some((g) => g.clave === miClave) && (
            <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', padding: '0.75rem 1rem' }}>
              <p style={{ margin: 0, fontSize: '0.88rem' }}>
                Tienes {fmtMonto(porEntregarAbb.find((g) => g.clave === miClave)?.total || 0)} en tu cuenta
                por entregar a ABB. Cuando se las entregues, ABB las marcará «entregado a: ABB» y saldrán de tu cuenta.
              </p>
            </div>
          )}
          {adminEsAbb && porEntregarAbb.length > 0 && (
            <div className="card">
              <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)' }}>
                Por entregar a ABB
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {porEntregarAbb.map((g) => {
                  const open = abiertoAbb === g.clave;
                  return (
                    <div key={g.clave} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setAbiertoAbb(open ? null : g.clave)}
                        style={{ width: '100%', justifyContent: 'space-between', borderRadius: 0, textAlign: 'left' }}
                      >
                        <span>
                          <Chevron abierto={open} /> <strong>{g.etiqueta}</strong>
                          <span className="muted" style={{ marginLeft: '0.5rem' }}>
                            {g.items.length} · {fmtMonto(g.total)}
                            {g.cuentaId ? ` · ${etiquetaCuentaRt(g.cuentaId)}` : ''}
                          </span>
                        </span>
                      </button>
                      {open && (
                        <div style={{ padding: '0.65rem 0.85rem 0.85rem' }}>
                          <div className="table-wrap">
                            <table className="data">
                              <thead>
                                <tr>
                                  <th>Fecha</th>
                                  <th>Tipo</th>
                                  <th>Folio</th>
                                  <th>Sucursal</th>
                                  <th>Monto</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.items.map((r) => (
                                  <tr key={r.id}>
                                    <td>{fmtFecha(r.recibido_at)}</td>
                                    <td>{r.tipo_item || r.origen}</td>
                                    <td>{r.folio || '—'}</td>
                                    <td>{r.sucursal || '—'}</td>
                                    <td>{fmtMonto(r.monto)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ marginTop: '0.65rem' }}
                            disabled={Boolean(trabajando)}
                            onClick={() => tomarEntrega(g)}
                          >
                            {trabajando === `abb-${g.clave}`
                              ? 'Aplicando…'
                              : `Entregado a: ABB · borrar de ${g.etiqueta}`}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card">
            <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)' }}>
              Recolectores
            </h4>
            {recolectores.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No hay recolecciones pendientes de cortes Virtual o Garage.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {recolectores.map((g) => {
                  const open = abierto === g.clave;
                  const nRec = (g.items || []).filter((it) => it.receivable).length;
                  return (
                    <div key={g.clave} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setAbierto(open ? null : g.clave)}
                        style={{ width: '100%', justifyContent: 'space-between', borderRadius: 0, textAlign: 'left' }}
                      >
                        <span>
                          <Chevron abierto={open} /> <strong>{g.etiqueta}</strong>
                          <span className="muted" style={{ marginLeft: '0.5rem' }}>
                            {g.items.length} movimiento(s)
                            {g.totalRecibir > 0 ? ` · recibir ${fmtMonto(g.totalRecibir)}` : ''}
                            {g.totalDeuda > 0 ? ` · deuda ${fmtMonto(g.totalDeuda)}` : ''}
                          </span>
                        </span>
                      </button>
                      {open && (
                        <div style={{ padding: '0.65rem 0.85rem 0.85rem' }}>
                          <div className="table-wrap">
                            <table className="data">
                              <thead>
                                <tr>
                                  <th>Fecha</th>
                                  <th>Tipo</th>
                                  <th>Folio</th>
                                  <th>Sucursal</th>
                                  <th>Módulo</th>
                                  <th>Monto</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.items.map((it) => (
                                  <tr key={`${it.origen}-${it.origenId}`}>
                                    <td>{fmtFecha(it.fecha)}</td>
                                    <td>{it.tipoItem}</td>
                                    <td>{it.folio || '—'}</td>
                                    <td>{it.sucursal || '—'}</td>
                                    <td>{it.tipoItem?.includes('Garage') ? 'Garage' : 'Virtual'}</td>
                                    <td>{fmtMonto(it.monto)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {nRec > 0 ? (
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ marginTop: '0.65rem' }}
                              disabled={Boolean(trabajando)}
                              onClick={() => recibir(g)}
                            >
                              {trabajando === `rec-${g.clave}`
                                ? 'Recibiendo…'
                                : `Recibir ${fmtMonto(g.totalRecibir)}`}
                            </button>
                          ) : (
                            <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.85rem' }}>
                              No hay monto por recibir en estas recolecciones.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
