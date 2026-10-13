import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listarServiciosCobroAdmin } from '../lib/controlEfectivo.js';
import {
  CUENTA_RT_FONDO_DEFAULT,
  CUENTAS_RT,
  liquidarFondoACuentaRt,
  listarMovimientosFondo,
  resumirFondoPorServicio,
  retirarFondoServicio,
  totalesFondo,
} from '../lib/rutaFondoServicios.js';
import { CUENTAS_RT_LIQUIDACION, etiquetaCuentaRt } from '../lib/rtCuentas.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { etiquetaTienda } from '../constants/sucursales.js';

/**
 * RC/VentaRuta → pestaña Fondo: ingresos/egresos por servicio (Panel RT).
 * Separado de la liquidación de mercancía / venta.
 */
export default function PanelFondoServicios({ supabase, user }) {
  const [servicios, setServicios] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [filtroSrv, setFiltroSrv] = useState('');
  const [aviso, setAviso] = useState('');
  const [retiroClave, setRetiroClave] = useState('');
  const [retiroMonto, setRetiroMonto] = useState('');
  const [retiroConcepto, setRetiroConcepto] = useState('');
  const [liqClave, setLiqClave] = useState(''); // '' = todos con saldo
  const [liqMonto, setLiqMonto] = useState('');
  const [liqCuenta, setLiqCuenta] = useState(CUENTA_RT_FONDO_DEFAULT);
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
  const conSaldo = useMemo(() => resumen.filter((r) => (Number(r.saldo) || 0) > 0), [resumen]);

  useEffect(() => {
    if (!liqClave) {
      setLiqMonto(totales.saldo > 0 ? String(totales.saldo) : '');
      return;
    }
    const row = resumen.find((r) => r.clave === liqClave);
    setLiqMonto(row?.saldo > 0 ? String(row.saldo) : '');
  }, [liqClave, resumen, totales.saldo]);

  const movVista = useMemo(() => {
    if (!filtroSrv) return movimientos;
    return movimientos.filter((m) => String(m.servicio_clave).toUpperCase() === String(filtroSrv).toUpperCase());
  }, [movimientos, filtroSrv]);

  const etiquetaMov = (m) => {
    if (m.tipo === 'ingreso') return 'Ingreso';
    if (m.meta?.origen === 'liquidacion_cuenta_rt') return 'Liquidación';
    return 'Egreso';
  };

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

  const liquidar = async () => {
    if (!(Number(liqMonto) > 0) && liqClave) return alert('Ingresa un monto.');
    if (!conSaldo.length) return alert('El Fondo no tiene saldo.');
    const cuentaNom = etiquetaCuentaRt(liqCuenta);
    const dest = liqClave
      ? `${liqClave} · ${fmtMonto(liqMonto)}`
      : `todos los servicios con saldo · ${fmtMonto(totales.saldo)}`;
    if (!confirm(
      `¿Liquidar Fondo de servicios a la cuenta de ${cuentaNom}?\n\n`
      + `${dest}\n\n`
      + 'Esto es independiente de la liquidación de mercancía / venta.',
    )) return;
    setGuardando(true);
    try {
      const r = await liquidarFondoACuentaRt(supabase, {
        servicioClave: liqClave || null,
        monto: liqClave ? liqMonto : null,
        cuentaRtId: liqCuenta,
        usuarioNombre: user?.nombre || null,
      });
      if (!r.ok) return alert(r.error || 'No se pudo liquidar.');
      alert(
        `✅ Fondo liquidado · ${fmtMonto(r.data.total)} → ${r.data.cuentaNombre}`
        + ` (${r.data.items.length} servicio(s)). Separado de la venta.`,
      );
      await cargar();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        Registro de <strong>servicios</strong> recolectados (CFE y Panel RT → Servicios).
        Separado de la venta / mercancía.
        Ingresos = cobros aprobados · Retiros = pago al proveedor · Liquidación = pasa a cuenta del administrador.
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

      {/* Liquidar a cuenta admin — separado de venta */}
      <div
        style={{
          padding: '0.85rem',
          borderRadius: 12,
          border: '1px solid rgba(15,118,110,0.35)',
          background: 'linear-gradient(180deg, #f0fdfa, #fff)',
        }}
      >
        <h4 style={{ margin: '0 0 0.25rem', color: '#0f766e' }}>Liquidar Fondo → cuenta administrador</h4>
        <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.78rem' }}>
          Pasa el efectivo de servicios a la cuenta RT del admin (por defecto JLBB, para Tesorería Cheche).
          No se mezcla con la liquidación de mercancía. Luis Enrique no aparece (solo repartidor).
        </p>
        <div className="grid-2" style={{ gap: '0.55rem' }}>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
            Cuenta administrador
            <select
              className="input"
              style={{ marginTop: '0.3rem' }}
              value={liqCuenta}
              onChange={(e) => setLiqCuenta(e.target.value)}
            >
              {(CUENTAS_RT_LIQUIDACION.length ? CUENTAS_RT_LIQUIDACION : CUENTAS_RT).map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </label>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
            Servicio
            <select
              className="input"
              style={{ marginTop: '0.3rem' }}
              value={liqClave}
              onChange={(e) => setLiqClave(e.target.value)}
            >
              <option value="">Todos con saldo ({fmtMonto(totales.saldo)})</option>
              {conSaldo.map((r) => (
                <option key={r.clave} value={r.clave}>
                  {r.nombre} · {fmtMonto(r.saldo)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {liqClave ? (
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.55rem' }}>
            Monto a liquidar
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              style={{ marginTop: '0.3rem', maxWidth: 220 }}
              value={liqMonto}
              onChange={(e) => setLiqMonto(e.target.value)}
            />
          </label>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: '0.65rem' }}
          disabled={guardando || !(totales.saldo > 0)}
          onClick={() => void liquidar()}
        >
          {guardando ? 'Liquidando…' : `Liquidar a ${etiquetaCuentaRt(liqCuenta)}`}
        </button>
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
        <p className="muted" style={{ margin: '0 0 0.55rem', fontSize: '0.78rem' }}>
          Usa esto cuando pagas CFE/proveedor (egreso del Fondo, sin pasar por cuenta admin).
        </p>
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
          className="btn btn-ghost"
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
                    color: m.tipo === 'ingreso'
                      ? '#047857'
                      : m.meta?.origen === 'liquidacion_cuenta_rt'
                        ? '#0f766e'
                        : '#b45309',
                  }}
                  >
                    {etiquetaMov(m)}
                  </td>
                  <td>{m.servicio_nombre || m.servicio_clave}</td>
                  <td style={{ fontWeight: 700 }}>{fmtMonto(m.monto)}</td>
                  <td className="muted" style={{ fontSize: '0.78rem' }}>
                    {m.concepto || '—'}
                    {m.meta?.cuenta_rt_nombre ? ` · ${m.meta.cuenta_rt_nombre}` : ''}
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
