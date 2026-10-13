import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listarServiciosCobroAdmin } from '../lib/controlEfectivo.js';
import {
  CUENTA_RT_FONDO_DEFAULT,
  liquidarFondoACuentaRt,
  listarMovimientosFondo,
  resumirFondoPorServicio,
  totalesFondo,
} from '../lib/rutaFondoServicios.js';
import {
  CUENTA_RT_SERVICIOS_ID,
  asegurarCuentaServicios,
  enviarFondosServiciosATesoreria,
  etiquetaCuentaRt,
  puedeAdministrarTesoreria,
  saldosOrigenTesoreria,
} from '../lib/rtCuentas.js';
import { borrarDatosPruebaFondoTesoreria } from '../lib/purgaVentaEnRuta.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import { normalizarRol } from '../lib/roles.js';

/**
 * RC/VentaRuta → pestaña RC Servicios: cobros de servicio y liquidación a cuenta Servicios.
 * Separado de la liquidación de mercancía / venta (Francisco).
 * Desde Servicios se transfieren fondos a Tesorería (Cheche).
 */
export default function PanelFondoServicios({ supabase, user }) {
  const [servicios, setServicios] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [filtroSrv, setFiltroSrv] = useState('');
  const [aviso, setAviso] = useState('');
  const [liqClave, setLiqClave] = useState(''); // '' = todos con saldo
  const [liqMonto, setLiqMonto] = useState('');
  const [saldoServicios, setSaldoServicios] = useState(0);
  const [montoTesoreria, setMontoTesoreria] = useState('');
  const [notaTesoreria, setNotaTesoreria] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [limpiando, setLimpiando] = useState(false);

  const liqCuenta = CUENTA_RT_FONDO_DEFAULT;
  const puedeTesoreria = puedeAdministrarTesoreria(user);
  const puedeLimpiarPrueba = normalizarRol(user?.rol) === 'Administrador' || puedeTesoreria;

  const cargar = useCallback(async () => {
    if (!supabase) return;
    await asegurarCuentaServicios(supabase);
    const [srvs, movs, origen] = await Promise.all([
      listarServiciosCobroAdmin(supabase),
      listarMovimientosFondo(supabase, { limit: 300 }),
      saldosOrigenTesoreria(supabase),
    ]);
    setServicios(srvs || []);
    if (movs.aviso) setAviso(movs.aviso);
    if (movs.error) setAviso(movs.error);
    setMovimientos(movs.data || []);
    const srv = (origen.data || []).find((x) => x.id === CUENTA_RT_SERVICIOS_ID);
    const saldo = srv?.saldo || 0;
    setSaldoServicios(saldo);
    setMontoTesoreria(saldo > 0 ? String(saldo) : '');
  }, [supabase]);

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

  const liquidar = async () => {
    if (!(Number(liqMonto) > 0) && liqClave) return alert('Ingresa un monto.');
    if (!conSaldo.length) return alert('RC Servicios no tiene saldo.');
    const cuentaNom = etiquetaCuentaRt(liqCuenta);
    const dest = liqClave
      ? `${liqClave} · ${fmtMonto(liqMonto)}`
      : `todos los servicios con saldo · ${fmtMonto(totales.saldo)}`;
    if (!confirm(
      `¿Liquidar RC Servicios a la cuenta ${cuentaNom}?\n\n`
      + `${dest}\n\n`
      + 'Independiente de la liquidación de mercancía. Luego puedes transferir a Tesorería.',
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
        `✅ RC Servicios liquidado · ${fmtMonto(r.data.total)} → ${r.data.cuentaNombre}`
        + ` (${r.data.items.length} servicio(s)). Separado de la venta.`,
      );
      await cargar();
    } finally {
      setGuardando(false);
    }
  };

  const transferirTesoreria = async () => {
    if (!puedeTesoreria) return alert('Solo administrador / gerente puede enviar a Tesorería.');
    if (!(Number(montoTesoreria) > 0)) return alert('Ingresa un monto.');
    if (!confirm(
      `¿Transferir ${fmtMonto(montoTesoreria)} de Servicios → Tesorería (Cheche)?\n\n`
      + 'Solo fondos de servicio.',
    )) return;
    setGuardando(true);
    try {
      const r = await enviarFondosServiciosATesoreria(supabase, {
        desdeId: CUENTA_RT_SERVICIOS_ID,
        monto: montoTesoreria,
        usuarioNombre: user?.nombre || null,
        notas: notaTesoreria || undefined,
      });
      if (!r.ok) return alert(r.error || 'No se pudo transferir.');
      setNotaTesoreria('');
      alert(`✅ Transferido ${fmtMonto(r.monto)} a Tesorería (Cheche).`);
      await cargar();
    } finally {
      setGuardando(false);
    }
  };

  const limpiarPrueba = async () => {
    if (!puedeLimpiarPrueba) return alert('Solo administrador / gerente puede limpiar datos de prueba.');
    if (!confirm(
      '¿Borrar datos de prueba de RC Servicios y Tesorería?\n\n'
      + 'Se eliminan movimientos del ledger RC Servicios y de las cuentas Servicios / Cheche.\n'
      + 'No se toca mercancía (Francisco) ni el catálogo de servicios.\n\n'
      + 'Esta acción no se puede deshacer.',
    )) return;
    const frase = window.prompt('Escribe LIMPIAR RC SERVICIOS para confirmar:');
    if (String(frase || '').trim().toUpperCase() !== 'LIMPIAR RC SERVICIOS') {
      return alert('Cancelado: debes escribir LIMPIAR RC SERVICIOS.');
    }
    setLimpiando(true);
    try {
      const r = await borrarDatosPruebaFondoTesoreria(supabase);
      if (!r.ok) return alert(r.error || 'No se pudo limpiar.');
      alert(r.detalle || 'Datos de prueba limpiados.');
      await cargar();
    } finally {
      setLimpiando(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem', flex: '1 1 220px' }}>
          <strong>RC Servicios</strong> · solo <strong>recolección de servicios</strong> (CFE y Panel RT).
          No se mezcla con mercancía (Francisco).
          Ingresos = cobros · Liquidación = cuenta <strong>Servicios</strong> · luego → Tesorería (Cheche).
        </p>
        {puedeLimpiarPrueba && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: '#b91c1c', borderColor: '#fecaca', fontSize: '0.8rem' }}
            disabled={limpiando || guardando}
            onClick={() => void limpiarPrueba()}
          >
            {limpiando ? 'Limpiando…' : 'Limpiar datos de prueba'}
          </button>
        )}
      </div>
      {aviso && (
        <p style={{ color: 'var(--brand-red)', fontSize: '0.85rem', margin: 0 }}>{aviso}</p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {[
          { label: 'Saldo RC Servicios', value: fmtMonto(totales.saldo), color: '#0f766e' },
          { label: 'Ingresos', value: fmtMonto(totales.ingresos) },
          { label: 'Liquidado / egresos', value: fmtMonto(totales.egresos), color: '#b45309' },
          { label: 'Cuenta Servicios', value: fmtMonto(saldoServicios), color: '#0f766e' },
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
          border: '1px solid rgba(15,118,110,0.35)',
          background: 'linear-gradient(180deg, #f0fdfa, #fff)',
        }}
      >
        <h4 style={{ margin: '0 0 0.25rem', color: '#0f766e' }}>
          Liquidar RC Servicios → {etiquetaCuentaRt(liqCuenta)}
        </h4>
        <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.78rem' }}>
          Pasa el efectivo de servicios a la cuenta RT <strong>Servicios</strong>.
          No se mezcla con la liquidación de mercancía (Francisco).
        </p>
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
          border: '1px solid rgba(13,148,136,0.35)',
          background: 'linear-gradient(180deg, #ecfeff, #fff)',
        }}
      >
        <h4 style={{ margin: '0 0 0.25rem', color: '#0f766e' }}>
          Transferir a Tesorería · Servicios → Cheche
        </h4>
        <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.78rem' }}>
          Disponible en cuenta Servicios: <strong>{fmtMonto(saldoServicios)}</strong>.
          También puedes hacerlo desde la pestaña Tesorería.
        </p>
        <div className="grid-2" style={{ gap: '0.55rem' }}>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
            Monto
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              style={{ marginTop: '0.3rem' }}
              value={montoTesoreria}
              onChange={(e) => setMontoTesoreria(e.target.value)}
              disabled={!puedeTesoreria}
            />
          </label>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
            Nota (opcional)
            <input
              className="input"
              style={{ marginTop: '0.3rem' }}
              value={notaTesoreria}
              onChange={(e) => setNotaTesoreria(e.target.value)}
              placeholder="Ej. CFE quincena…"
              disabled={!puedeTesoreria}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: '0.65rem' }}
          disabled={guardando || !puedeTesoreria || !(Number(montoTesoreria) > 0)}
          onClick={() => void transferirTesoreria()}
        >
          {guardando ? 'Enviando…' : 'Enviar a Tesorería (Cheche)'}
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
