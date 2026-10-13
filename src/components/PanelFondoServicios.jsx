import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listarServiciosCobroAdmin } from '../lib/controlEfectivo.js';
import {
  listarMovimientosFondo,
  resumirFondoPorServicio,
  retirarFondoServicio,
  totalesFondo,
} from '../lib/rutaFondoServicios.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { etiquetaTienda } from '../constants/sucursales.js';

/**
 * RC/VentaRuta → pestaña Fondo: ingresos/egresos por servicio (Panel RT).
 */
export default function PanelFondoServicios({ supabase, user }) {
  const [servicios, setServicios] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [filtroSrv, setFiltroSrv] = useState('');
  const [aviso, setAviso] = useState('');
  const [retiroClave, setRetiroClave] = useState('');
  const [retiroMonto, setRetiroMonto] = useState('');
  const [retiroConcepto, setRetiroConcepto] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!supabase) return;
    const [srvs, movs] = await Promise.all([
      listarServiciosCobroAdmin(supabase),
      listarMovimientosFondo(supabase, { limit: 300 }),
    ]);
    setServicios(srvs || []);
    if (movs.aviso) setAviso(movs.aviso);
    if (movs.error) setAviso(movs.error);
    setMovimientos(movs.data || []);
    if (!retiroClave && srvs?.[0]?.clave) setRetiroClave(srvs[0].clave);
  }, [supabase, retiroClave]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resumen = useMemo(
    () => resumirFondoPorServicio(movimientos, servicios),
    [movimientos, servicios],
  );
  const totales = useMemo(() => totalesFondo(resumen), [resumen]);

  const movVista = useMemo(() => {
    if (!filtroSrv) return movimientos;
    return movimientos.filter((m) => String(m.servicio_clave).toUpperCase() === String(filtroSrv).toUpperCase());
  }, [movimientos, filtroSrv]);

  const retirar = async () => {
    if (!retiroClave) return alert('Selecciona el servicio.');
    if (!confirm(`¿Retirar ${fmtMonto(retiroMonto)} de ${retiroClave} para pago de servicio?`)) return;
    setGuardando(true);
    try {
      const srv = servicios.find((s) => String(s.clave).toUpperCase() === String(retiroClave).toUpperCase());
      const r = await retirarFondoServicio(supabase, {
        servicioClave: retiroClave,
        servicioNombre: srv?.nombre,
        monto: retiroMonto,
        concepto: retiroConcepto || `Retiro pago ${srv?.nombre || retiroClave}`,
        usuarioNombre: user?.nombre || null,
      });
      if (!r.ok) return alert(r.error || 'No se pudo retirar.');
      setRetiroMonto('');
      setRetiroConcepto('');
      await cargar();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        Registro de servicios recolectados (CFE y los que agregues en Panel RT → Servicios).
        Ingresos = cobros aprobados en caja · Egresos = retiros para pagar el servicio.
      </p>
      {aviso && (
        <p style={{ color: 'var(--brand-red)', fontSize: '0.85rem', margin: 0 }}>{aviso}</p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {[
          { label: 'Saldo Fondo', value: fmtMonto(totales.saldo), color: '#0f766e' },
          { label: 'Ingresos', value: fmtMonto(totales.ingresos) },
          { label: 'Egresos / retiros', value: fmtMonto(totales.egresos), color: '#b45309' },
        ].map((k) => (
          <div
            key={k.label}
            style={{
              flex: '1 1 140px',
              minWidth: 120,
              padding: '0.65rem 0.75rem',
              borderRadius: 10,
              border: '1px solid var(--border, #e2e8f0)',
              background: '#fff',
            }}
          >
            <div className="muted" style={{ fontSize: '0.72rem' }}>{k.label}</div>
            <strong style={{ fontSize: '1.05rem', color: k.color || 'inherit' }}>{k.value}</strong>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table className="consultas-table">
          <thead>
            <tr>
              <th>Servicio</th>
              <th>Ingresos</th>
              <th>Egresos</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {resumen.length === 0 ? (
              <tr><td colSpan={4} className="muted">Sin movimientos. Configura servicios en Contabilidad → Panel RT → Servicios.</td></tr>
            ) : resumen.map((r) => (
              <tr key={r.clave} style={{ cursor: 'pointer' }} onClick={() => setFiltroSrv(r.clave)}>
                <td>
                  <strong>{r.nombre}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: '0.72rem' }}>{r.clave}</span>
                </td>
                <td>{fmtMonto(r.ingresos)}</td>
                <td style={{ color: r.egresos ? '#b45309' : undefined }}>{fmtMonto(r.egresos)}</td>
                <td style={{ fontWeight: 700, color: '#0f766e' }}>{fmtMonto(r.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          padding: '0.85rem',
          borderRadius: 12,
          border: '1px solid rgba(15,118,110,0.2)',
          background: 'rgba(15,118,110,0.04)',
        }}
      >
        <h4 style={{ margin: '0 0 0.5rem', color: '#0f766e' }}>Retirar para pago de servicio</h4>
        <div className="grid-2" style={{ gap: '0.55rem' }}>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
            Servicio
            <select
              className="input"
              style={{ marginTop: '0.3rem' }}
              value={retiroClave}
              onChange={(e) => setRetiroClave(e.target.value)}
            >
              {(servicios.length ? servicios : resumen).map((s) => (
                <option key={s.clave || s.id} value={s.clave}>
                  {s.nombre || s.clave}
                </option>
              ))}
            </select>
          </label>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
            Monto a retirar
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              style={{ marginTop: '0.3rem' }}
              value={retiroMonto}
              onChange={(e) => setRetiroMonto(e.target.value)}
            />
          </label>
        </div>
        <label className="muted" style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.55rem' }}>
          Concepto
          <input
            className="input"
            style={{ marginTop: '0.3rem' }}
            value={retiroConcepto}
            onChange={(e) => setRetiroConcepto(e.target.value)}
            placeholder="Ej. Pago CFE quincena…"
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: '0.65rem' }}
          disabled={guardando || !retiroMonto}
          onClick={() => void retirar()}
        >
          {guardando ? 'Guardando…' : 'Registrar retiro'}
        </button>
      </div>

      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.45rem' }}>
          <h4 style={{ margin: 0 }}>Movimientos</h4>
          <select
            className="input"
            style={{ maxWidth: 220 }}
            value={filtroSrv}
            onChange={(e) => setFiltroSrv(e.target.value)}
          >
            <option value="">Todos los servicios</option>
            {resumen.map((r) => (
              <option key={r.clave} value={r.clave}>{r.nombre}</option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost" onClick={() => void cargar()}>Actualizar</button>
        </div>
        <div className="table-wrap">
          <table className="consultas-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Servicio</th>
                <th>Monto</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {movVista.length === 0 ? (
                <tr><td colSpan={5} className="muted">Sin movimientos aún.</td></tr>
              ) : movVista.map((m) => (
                <tr key={m.id}>
                  <td className="muted" style={{ fontSize: '0.8rem' }}>
                    {String(m.created_at || '').slice(0, 16).replace('T', ' ')}
                  </td>
                  <td style={{
                    fontWeight: 700,
                    color: m.tipo === 'ingreso' ? '#047857' : '#b45309',
                  }}
                  >
                    {m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                  </td>
                  <td>{m.servicio_nombre || m.servicio_clave}</td>
                  <td style={{ fontWeight: 700 }}>{fmtMonto(m.monto)}</td>
                  <td className="muted" style={{ fontSize: '0.78rem' }}>
                    {m.concepto || '—'}
                    {m.sucursal_id ? ` · ${etiquetaTienda(m.sucursal_id)}` : ''}
                    {m.repartidor_nombre ? ` · ${m.repartidor_nombre}` : ''}
                    {m.cajero_nombre ? ` · caja ${m.cajero_nombre}` : ''}
                    {m.usuario_nombre && m.tipo === 'egreso' ? ` · ${m.usuario_nombre}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
