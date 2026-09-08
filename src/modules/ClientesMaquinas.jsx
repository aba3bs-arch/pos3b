import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { puedeVerModulo } from '../lib/roles.js';
import CorteVirtual from './cortes/CorteVirtual.jsx';
import CorteGarage from './cortes/CorteGarage.jsx';
import {
  AVISO_FALTA_CLIENTES_MAQUINAS,
  calcularMonedaVirtualCliente,
  codigoSucursalClienteMaquinas,
  crearClienteMaquinas,
  fmtMonedaCliente,
  inyectarMonedaVirtualCliente,
  listarClientesMaquinas,
  listarMonedaCliente,
} from '../lib/clientesMaquinas.js';

const COLOR = '#1d4ed8';

/**
 * Módulo exclusivo: clientes externos con máquinas + moneda virtual + cortes Virtual/Garage.
 */
export default function ClientesMaquinas({ supabase, user, sucursal }) {
  const tieneAcceso = puedeVerModulo(user?.rol, 'Clientes máquinas', user?.id);
  const [clientes, setClientes] = useState([]);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [cargando, setCargando] = useState(false);
  const [clienteId, setClienteId] = useState(null);
  const [tab, setTab] = useState('resumen'); // resumen | virtual | garage | moneda
  const [form, setForm] = useState({ nombre: '', negocio: '', contacto: '', telefono: '' });
  const [montoBase, setMontoBase] = useState('10000');
  const [histMoneda, setHistMoneda] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!tieneAcceso) return;
    setCargando(true);
    const res = await listarClientesMaquinas(supabase, { soloActivos: true });
    setCargando(false);
    if (res.error) setError(res.error);
    if (res.aviso) setAviso(res.aviso);
    setClientes(res.data || []);
  }, [supabase, tieneAcceso]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cliente = useMemo(
    () => (clientes || []).find((c) => String(c.id) === String(clienteId)) || null,
    [clientes, clienteId],
  );

  const sucursalCliente = cliente ? codigoSucursalClienteMaquinas(cliente) : '';

  const previewMoneda = useMemo(() => {
    if (!cliente) return null;
    return calcularMonedaVirtualCliente({
      montoBase: Number(montoBase) || cliente.moneda_base || 10000,
      pctDescuento: cliente.pct_descuento ?? 0.15,
      pctEmpresa: cliente.pct_empresa ?? 0.6,
      pctCliente: cliente.pct_cliente ?? 0.4,
    });
  }, [cliente, montoBase]);

  useEffect(() => {
    if (!cliente || tab !== 'moneda') return;
    void (async () => {
      const r = await listarMonedaCliente(supabase, cliente.id);
      setHistMoneda(r.data || []);
      if (r.aviso) setAviso(r.aviso);
    })();
  }, [cliente, tab, supabase]);

  if (!tieneAcceso) {
    return (
      <div className="card">
        <p>
          No tienes acceso a Clientes máquinas. Pide al administrador que active el módulo en Configuración →
          Privilegios → Contabilidad.
        </p>
      </div>
    );
  }

  const crear = async (e) => {
    e?.preventDefault?.();
    setGuardando(true);
    setError('');
    setMsg('');
    const r = await crearClienteMaquinas(supabase, form);
    setGuardando(false);
    if (!r.ok) {
      setError(r.error || 'No se pudo crear.');
      return;
    }
    if (r.aviso) setAviso(r.aviso);
    setMsg(`Cliente «${r.data.nombre}» creado. Ya puedes hacer cortes y moneda virtual.`);
    setForm({ nombre: '', negocio: '', contacto: '', telefono: '' });
    await cargar();
    setClienteId(r.data.id);
    setTab('resumen');
  };

  const inyectar = async () => {
    if (!cliente) return;
    if (!confirm(`¿Inyectar moneda virtual ${fmtMonedaCliente(Number(montoBase) || 10000)} a ${cliente.nombre}?`)) return;
    setGuardando(true);
    const r = await inyectarMonedaVirtualCliente(supabase, cliente, {
      montoBase: Number(montoBase) || 10000,
      user,
    });
    setGuardando(false);
    if (!r.ok) {
      setError(r.error || 'No se pudo inyectar.');
      return;
    }
    if (r.aviso) setAviso(r.aviso);
    setMsg(
      `Moneda inyectada: empresa ${fmtMonedaCliente(r.calc.monto_empresa)} · cliente ${fmtMonedaCliente(r.calc.monto_cliente)}. Registrado en IE VIRTUAL · Clientes.`,
    );
    const h = await listarMonedaCliente(supabase, cliente.id);
    setHistMoneda(h.data || []);
  };

  if (cliente) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <button type="button" className="btn btn-ghost" onClick={() => { setClienteId(null); setTab('resumen'); }}>
            ← Todos los clientes
          </button>
          <h2 style={{ margin: 0, color: COLOR, flex: 1 }}>{cliente.nombre}</h2>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          {cliente.negocio ? `${cliente.negocio} · ` : ''}
          Corte en sucursal sintética <strong>{sucursalCliente}</strong> · Sin alertas de recuperación · Recolección →
          IE VIRTUAL · Clientes
        </p>
        {aviso ? <p style={{ color: '#b45309', margin: 0 }}>{aviso}</p> : null}
        {error ? <p style={{ color: 'var(--brand-red)', margin: 0 }}>{error}</p> : null}
        {msg ? <p style={{ color: COLOR, fontWeight: 600, margin: 0 }}>{msg}</p> : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {[
            { id: 'resumen', label: 'Resumen' },
            { id: 'virtual', label: 'Corte Virtual' },
            { id: 'garage', label: 'Corte Garage' },
            { id: 'moneda', label: 'Moneda virtual' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'resumen' ? (
          <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
            <h3 style={{ margin: '0 0 0.5rem', color: COLOR }}>Espacio del cliente</h3>
            <ul className="muted" style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.55 }}>
              <li>
                <strong>Corte Virtual</strong> y <strong>Corte Garage</strong>: mismo formato que 3B, sin alertas.
              </li>
              <li>
                El cliente cierra y recolecta aquí. Si recolectan <strong>Antonio, Cheche o Francisco</strong>, gastos y
                recolecciones van directo a <strong>IE VIRTUAL → Clientes</strong>.
              </li>
              <li>
                <strong>Moneda virtual</strong>: se ponen {fmtMonedaCliente(cliente.moneda_base || 10000)}, se descuenta{' '}
                {Math.round((cliente.pct_descuento ?? 0.15) * 100)}%; del resto empresa{' '}
                {Math.round((cliente.pct_empresa ?? 0.6) * 100)}% / cliente{' '}
                {Math.round((cliente.pct_cliente ?? 0.4) * 100)}%.
              </li>
            </ul>
            <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => setTab('virtual')}>
                Ir a Corte Virtual
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setTab('garage')}>
                Ir a Corte Garage
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setTab('moneda')}>
                Moneda virtual
              </button>
            </div>
          </div>
        ) : null}

        {tab === 'virtual' ? (
          <CorteVirtual
            supabase={supabase}
            sucursal={sucursalCliente}
            user={user}
            sinAlertas
            etiquetaCliente={cliente.nombre}
          />
        ) : null}

        {tab === 'garage' ? (
          <CorteGarage
            supabase={supabase}
            sucursal={sucursalCliente}
            user={user}
            sinAlertas
            etiquetaCliente={cliente.nombre}
          />
        ) : null}

        {tab === 'moneda' && previewMoneda ? (
          <div className="card" style={{ borderTop: '4px solid #0f766e' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: '#0f766e' }}>Inyectar moneda virtual</h3>
            <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
              Base → −{Math.round(previewMoneda.pct_descuento * 100)}% → empresa{' '}
              {Math.round(previewMoneda.pct_empresa * 100)}% / cliente {Math.round(previewMoneda.pct_cliente * 100)}%.
              Queda en IE VIRTUAL · Clientes.
            </p>
            <label className="muted">
              Monto a poner (MXN)
              <input
                className="input"
                type="number"
                min="1"
                step="0.01"
                value={montoBase}
                onChange={(e) => setMontoBase(e.target.value)}
                style={{ marginTop: '0.3rem', maxWidth: 220, fontWeight: 700 }}
              />
            </label>
            <div
              style={{
                marginTop: '0.75rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '0.5rem',
              }}
            >
              <div className="card" style={{ padding: '0.65rem' }}>
                <div className="muted" style={{ fontSize: '0.72rem' }}>TRAS DESCUENTO</div>
                <strong>{fmtMonedaCliente(previewMoneda.tras_descuento)}</strong>
              </div>
              <div className="card" style={{ padding: '0.65rem' }}>
                <div className="muted" style={{ fontSize: '0.72rem' }}>EMPRESA 60%</div>
                <strong style={{ color: '#0f766e' }}>{fmtMonedaCliente(previewMoneda.monto_empresa)}</strong>
              </div>
              <div className="card" style={{ padding: '0.65rem' }}>
                <div className="muted" style={{ fontSize: '0.72rem' }}>CLIENTE 40%</div>
                <strong style={{ color: COLOR }}>{fmtMonedaCliente(previewMoneda.monto_cliente)}</strong>
              </div>
            </div>
            <button type="button" className="btn btn-success" style={{ marginTop: '0.85rem' }} disabled={guardando} onClick={inyectar}>
              {guardando ? 'Registrando…' : 'Inyectar y registrar en IE'}
            </button>

            <h4 style={{ margin: '1.25rem 0 0.5rem' }}>Historial</h4>
            {!histMoneda.length ? (
              <p className="muted" style={{ margin: 0 }}>Aún no hay inyecciones.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {histMoneda.map((m) => (
                  <li key={m.id} style={{ marginBottom: '0.35rem' }}>
                    {m.fecha} · base {fmtMonedaCliente(m.monto_base)} → empresa {fmtMonedaCliente(m.monto_empresa)} / cliente{' '}
                    {fmtMonedaCliente(m.monto_cliente)}
                    {m.usuario_nombre ? ` · ${m.usuario_nombre}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: COLOR }}>Clientes máquinas</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Clientes externos: renta e instalación de máquinas + moneda virtual. Cada cliente tiene su espacio con Corte
          Virtual, Corte Garage (sin alertas) y recolección hacia IE VIRTUAL · Clientes.
        </p>
      </div>

      {aviso ? (
        <div className="card" style={{ borderColor: 'rgba(180,83,9,0.45)', background: '#fffbeb' }}>
          <strong style={{ color: '#b45309' }}>{aviso || AVISO_FALTA_CLIENTES_MAQUINAS}</strong>
        </div>
      ) : null}
      {error ? <p style={{ color: 'var(--brand-red)', margin: 0 }}>{error}</p> : null}
      {msg ? <p style={{ color: COLOR, fontWeight: 600, margin: 0 }}>{msg}</p> : null}

      <form className="card" style={{ borderTop: `4px solid ${COLOR}` }} onSubmit={crear}>
        <h3 style={{ margin: '0 0 0.65rem', color: COLOR }}>Agregar cliente</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.55rem' }}>
          <label className="muted">
            Nombre *
            <input
              className="input"
              required
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              style={{ marginTop: '0.25rem' }}
              placeholder="Nombre del cliente"
            />
          </label>
          <label className="muted">
            Negocio
            <input
              className="input"
              value={form.negocio}
              onChange={(e) => setForm({ ...form, negocio: e.target.value })}
              style={{ marginTop: '0.25rem' }}
              placeholder="Nombre del negocio"
            />
          </label>
          <label className="muted">
            Contacto
            <input
              className="input"
              value={form.contacto}
              onChange={(e) => setForm({ ...form, contacto: e.target.value })}
              style={{ marginTop: '0.25rem' }}
            />
          </label>
          <label className="muted">
            Teléfono
            <input
              className="input"
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              style={{ marginTop: '0.25rem' }}
            />
          </label>
        </div>
        <button type="submit" className="btn btn-success" style={{ marginTop: '0.75rem' }} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Crear cliente'}
        </button>
      </form>

      <div>
        <h3 style={{ margin: '0 0 0.5rem', color: COLOR }}>Clientes ({clientes.length})</h3>
        {cargando ? <p className="muted">Cargando…</p> : null}
        {!cargando && !clientes.length ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>Aún no hay clientes. Agrega el primero arriba.</p>
          </div>
        ) : null}
        <div className="subcmd-hub-grid">
          {clientes.map((c) => (
            <button
              key={c.id}
              type="button"
              className="card subcmd-hub-btn"
              onClick={() => { setClienteId(c.id); setTab('resumen'); setMsg(''); }}
            >
              <div className="subcmd-hub-btn-head">
                <strong style={{ color: COLOR }}>{c.nombre}</strong>
              </div>
              <p className="muted subcmd-hub-desc">
                {c.negocio || 'Sin negocio'} · {codigoSucursalClienteMaquinas(c)}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
