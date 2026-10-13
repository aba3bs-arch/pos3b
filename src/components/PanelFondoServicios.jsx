import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  agruparCobrosServicioPorTienda,
  eliminarServicioCobro,
  fmtFechaClave,
  listarCobrosServicioEnTransito,
  listarRepartidores,
  listarServiciosCobroAdmin,
  liquidarCobrosServicioEnTransito,
} from '../lib/controlEfectivo.js';
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
import { fmtMonto } from '../lib/consultasUi.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import { normalizarRol } from '../lib/roles.js';
import VisorTutorialModal from './VisorTutorialModal.jsx';
import { TUTORIAL_COBRO_SERVICIOS } from '../content/tutorialCobroServicios.js';

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
  const [borrandoSrv, setBorrandoSrv] = useState('');
  const [repartidores, setRepartidores] = useState([]);
  const [filtroRepCobros, setFiltroRepCobros] = useState(''); // '' = todos
  const [cobrosTransito, setCobrosTransito] = useState([]);
  const [selCobros, setSelCobros] = useState({});
  const [liquidandoCobros, setLiquidandoCobros] = useState(false);
  const [tutorialAbierto, setTutorialAbierto] = useState(false);

  const liqCuenta = CUENTA_RT_FONDO_DEFAULT;
  const puedeTesoreria = puedeAdministrarTesoreria(user);
  const puedeBorrarServicio = normalizarRol(user?.rol) === 'Administrador' || puedeTesoreria;

  const cargar = useCallback(async () => {
    if (!supabase) return;
    await asegurarCuentaServicios(supabase);
    const [srvs, movs, origen, reps, cobros] = await Promise.all([
      listarServiciosCobroAdmin(supabase),
      listarMovimientosFondo(supabase, { limit: 300 }),
      saldosOrigenTesoreria(supabase),
      listarRepartidores(supabase),
      listarCobrosServicioEnTransito(supabase, {
        repartidorId: filtroRepCobros || null,
      }),
    ]);
    setServicios(srvs || []);
    setRepartidores(reps || []);
    if (movs.aviso) setAviso(movs.aviso);
    if (movs.error) setAviso(movs.error);
    setMovimientos(movs.data || []);
    setCobrosTransito(cobros || []);
    setSelCobros((prev) => {
      const next = {};
      for (const m of cobros || []) {
        next[m.id] = prev[m.id] !== false;
      }
      return next;
    });
    const srv = (origen.data || []).find((x) => x.id === CUENTA_RT_SERVICIOS_ID);
    const saldo = srv?.saldo || 0;
    setSaldoServicios(saldo);
    setMontoTesoreria(saldo > 0 ? String(saldo) : '');
  }, [supabase, filtroRepCobros]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resumen = useMemo(
    () => resumirFondoPorServicio(movimientos, servicios),
    [movimientos, servicios],
  );
  const totales = useMemo(() => totalesFondo(resumen), [resumen]);
  const conSaldo = useMemo(() => resumen.filter((r) => (Number(r.saldo) || 0) > 0), [resumen]);

  const cobrosAgrupados = useMemo(
    () => agruparCobrosServicioPorTienda(cobrosTransito),
    [cobrosTransito],
  );
  const cobrosSeleccionados = useMemo(
    () => cobrosTransito.filter((m) => selCobros[m.id]),
    [cobrosTransito, selCobros],
  );
  const totalCobrosSel = useMemo(
    () => cobrosSeleccionados.reduce((a, m) => a + (Number(m.monto) || 0), 0),
    [cobrosSeleccionados],
  );
  const repsFiltroOpts = useMemo(() => {
    const map = new Map();
    for (const r of repartidores || []) map.set(String(r.id), r);
    for (const r of cobrosAgrupados.repartidores || []) {
      if (!map.has(String(r.id))) map.set(String(r.id), r);
    }
    return [...map.values()].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
  }, [repartidores, cobrosAgrupados.repartidores]);

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

  const toggleTiendaCobros = (items, val) => {
    setSelCobros((prev) => {
      const next = { ...prev };
      for (const m of items || []) next[m.id] = val;
      return next;
    });
  };

  const toggleTodosCobros = (val) => {
    setSelCobros((prev) => {
      const next = { ...prev };
      for (const m of cobrosTransito) next[m.id] = val;
      return next;
    });
  };

  const liquidarCobrosPendientes = async () => {
    if (!cobrosSeleccionados.length) return alert('Selecciona al menos un cobro de servicio.');
    const reps = [...new Set(
      cobrosSeleccionados.map((m) => m.repartidores?.nombre || m.repartidor_nombre).filter(Boolean),
    )];
    const tiendas = [...new Set(cobrosSeleccionados.map((m) => m.sucursal_origen).filter(Boolean))];
    if (!confirm(
      `¿Liquidar cobros de servicio a la cuenta Servicios?\n\n`
      + `Total: ${fmtMonto(totalCobrosSel)}\n`
      + `Movimientos: ${cobrosSeleccionados.length}\n`
      + `Tiendas: ${tiendas.join(', ') || '—'}\n`
      + `Recolectó: ${reps.join(', ') || '—'}\n\n`
      + 'No se mezcla con mercancía (Francisco).',
    )) return;
    setLiquidandoCobros(true);
    try {
      const r = await liquidarCobrosServicioEnTransito(supabase, {
        ids: cobrosSeleccionados.map((m) => m.id),
        adminNombre: user?.nombre || 'RC Servicios',
        movimientos: cobrosSeleccionados,
      });
      if (!r.ok) return alert(r.error || 'No se pudo liquidar.');
      alert(
        `✅ Cobros de servicio liquidados · ${fmtMonto(r.montoTotal)} → Servicios`
        + ` (${r.count} mov. · ${(r.tiendas || []).join(', ') || 'tiendas'})`
        + (r.repartidores?.length ? ` · recolectó: ${r.repartidores.join(', ')}` : ''),
      );
      await cargar();
    } finally {
      setLiquidandoCobros(false);
    }
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

  const borrarServicioCatalogo = async (clave) => {
    if (!puedeBorrarServicio) return alert('Solo administrador / gerente puede borrar servicios.');
    const srv = (servicios || []).find(
      (s) => String(s.clave || '').toUpperCase() === String(clave || '').toUpperCase(),
    );
    if (!srv?.id) {
      return alert('Este renglón solo tiene movimientos; no hay servicio en el catálogo para borrar.');
    }
    if (!confirm(
      `¿Borrar el servicio ${srv.clave} — ${srv.nombre}?\n\n`
      + 'Se elimina del catálogo. Los cobros / movimientos ya registrados no se borran.',
    )) return;
    setBorrandoSrv(String(srv.id));
    try {
      const r = await eliminarServicioCobro(supabase, srv.id);
      if (!r.ok) return alert(r.error || 'No se pudo borrar.');
      if (filtroSrv && String(filtroSrv).toUpperCase() === String(srv.clave).toUpperCase()) {
        setFiltroSrv('');
      }
      if (liqClave && String(liqClave).toUpperCase() === String(srv.clave).toUpperCase()) {
        setLiqClave('');
      }
      await cargar();
    } finally {
      setBorrandoSrv('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem', flex: '1 1 220px' }}>
          <strong>RC Servicios</strong> · solo <strong>recolección de servicios</strong> (CFE y Panel RT).
          No se mezcla con mercancía (Francisco).
          Ingresos = cobros · Liquidación = cuenta <strong>Servicios</strong> · luego → Tesorería (Cheche).
          {puedeBorrarServicio ? ' Puedes borrar servicios individuales del catálogo.' : ''}
        </p>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: '0.8rem' }}
          onClick={() => setTutorialAbierto(true)}
        >
          Ver tutorial
        </button>
      </div>
      {aviso && (
        <p style={{ color: 'var(--brand-red)', fontSize: '0.85rem', margin: 0 }}>{aviso}</p>
      )}

      <div
        style={{
          padding: '0.85rem',
          borderRadius: 12,
          border: '1px solid rgba(15,118,110,0.4)',
          background: 'linear-gradient(180deg, #f0fdfa, #fff)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 220px' }}>
            <h4 style={{ margin: '0 0 0.2rem', color: '#0f766e' }}>
              Cobros de servicio pendientes
            </h4>
            <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
              Ya no aparecen en Pendientes por liquidar. Agrupados por tienda, totalizados juntos.
              Filtra por repartidor / usuario que recolectó y liquida a la cuenta <strong>Servicios</strong>.
            </p>
          </div>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem', minWidth: 200 }}>
            Recolector / repartidor
            <select
              className="input"
              style={{ marginTop: '0.3rem' }}
              value={filtroRepCobros}
              onChange={(e) => setFiltroRepCobros(e.target.value)}
            >
              <option value="">Todos los pendientes</option>
              {repsFiltroOpts.map((r) => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
          </label>
        </div>

        <p style={{ margin: '0.65rem 0 0.45rem', fontSize: '0.85rem' }}>
          En tránsito: <strong>{fmtMonto(cobrosAgrupados.total)}</strong>
          {' · '}{cobrosAgrupados.count} movimiento(s)
          {' · '}{cobrosAgrupados.grupos.length} tienda(s)
          {cobrosAgrupados.repartidores.length > 0 && (
            <>
              {' · '}Recolectó:{' '}
              <strong>{cobrosAgrupados.repartidores.map((r) => r.nombre).join(', ')}</strong>
            </>
          )}
        </p>

        {!cobrosTransito.length ? (
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
            Sin cobros de servicio en tránsito
            {filtroRepCobros ? ' para este repartidor' : ''}.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center', marginBottom: '0.45rem' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}>
                <input
                  type="checkbox"
                  checked={cobrosSeleccionados.length === cobrosTransito.length && cobrosTransito.length > 0}
                  onChange={(e) => toggleTodosCobros(e.target.checked)}
                />
                Seleccionar todos
              </label>
              <button type="button" className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => void cargar()}>
                Actualizar
              </button>
            </div>
            <div className="table-wrap">
              <table className="consultas-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }} />
                    <th>Tienda</th>
                    <th>Recolectó</th>
                    <th>Detalle</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {cobrosAgrupados.grupos.map((g) => {
                    const selCount = g.items.filter((m) => selCobros[m.id]).length;
                    const all = selCount === g.items.length && g.items.length > 0;
                    const repsTienda = [...new Set(
                      g.items.map((m) => m.repartidores?.nombre || m.repartidor_nombre || '—'),
                    )];
                    const detalle = g.items
                      .map((m) => {
                        const f = fmtFechaClave(String(m.fecha_hora || '').slice(0, 10));
                        const quien = m.repartidores?.nombre || m.cajero_nombre || '';
                        return `${f || '—'} ${fmtMonto(m.monto)}${quien ? ` (${quien})` : ''}`;
                      })
                      .join(' · ');
                    return (
                      <tr key={g.tienda}>
                        <td>
                          <input
                            type="checkbox"
                            checked={all}
                            ref={(el) => {
                              if (el) el.indeterminate = selCount > 0 && !all;
                            }}
                            onChange={(e) => toggleTiendaCobros(g.items, e.target.checked)}
                          />
                        </td>
                        <td>
                          <strong>{etiquetaTienda(g.tienda) || g.tienda}</strong>
                          <span className="muted" style={{ display: 'block', fontSize: '0.72rem' }}>
                            {g.count} mov.
                          </span>
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{repsTienda.join(', ')}</td>
                        <td className="muted" style={{ fontSize: '0.78rem' }}>{detalle}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>
                          {fmtMonto(g.total)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: 'rgba(15,118,110,0.06)' }}>
                    <td colSpan={4} style={{ fontWeight: 700 }}>Total seleccionado</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f766e' }}>
                      {fmtMonto(totalCobrosSel)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: '0.65rem' }}
              disabled={liquidandoCobros || guardando || cobrosSeleccionados.length === 0}
              onClick={() => void liquidarCobrosPendientes()}
            >
              {liquidandoCobros
                ? 'Liquidando…'
                : `Liquidar cobros · ${fmtMonto(totalCobrosSel)} → Servicios`}
            </button>
          </>
        )}
      </div>

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
              {puedeBorrarServicio ? <th style={{ width: 90 }} /> : null}
            </tr>
          </thead>
          <tbody>
            {resumen.length === 0 ? (
              <tr>
                <td colSpan={puedeBorrarServicio ? 5 : 4} className="muted">
                  Sin movimientos. Configura servicios en Contabilidad → Panel RT → Servicios.
                </td>
              </tr>
            ) : resumen.map((r) => {
              const srvCat = (servicios || []).find(
                (s) => String(s.clave || '').toUpperCase() === String(r.clave || '').toUpperCase(),
              );
              return (
                <tr key={r.clave} style={{ cursor: 'pointer' }} onClick={() => setFiltroSrv(r.clave)}>
                  <td>
                    <strong>{r.nombre}</strong>
                    <span className="muted" style={{ display: 'block', fontSize: '0.72rem' }}>{r.clave}</span>
                  </td>
                  <td>{fmtMonto(r.ingresos)}</td>
                  <td style={{ color: r.egresos ? '#b45309' : undefined }}>{fmtMonto(r.egresos)}</td>
                  <td style={{ fontWeight: 700, color: '#0f766e' }}>{fmtMonto(r.saldo)}</td>
                  {puedeBorrarServicio ? (
                    <td onClick={(e) => e.stopPropagation()}>
                      {srvCat?.id ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: '0.75rem', padding: '0.2rem 0.45rem', color: '#b91c1c' }}
                          disabled={guardando || borrandoSrv === String(srvCat.id)}
                          onClick={() => void borrarServicioCatalogo(r.clave)}
                        >
                          {borrandoSrv === String(srvCat.id) ? '…' : 'Borrar'}
                        </button>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.72rem' }}>—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
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

      <VisorTutorialModal
        abierto={tutorialAbierto}
        tutorial={TUTORIAL_COBRO_SERVICIOS}
        onCerrar={() => setTutorialAbierto(false)}
      />
    </div>
  );
}
