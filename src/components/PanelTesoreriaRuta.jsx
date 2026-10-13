import React, { useCallback, useEffect, useState } from 'react';
import {
  ADMIN_TESORERIA_CUENTA_ID,
  CUENTA_RT_SERVICIOS_ID,
  CUENTA_TESORERIA_ID,
  asegurarCuentaTesoreria,
  enviarFondosServiciosATesoreria,
  etiquetaCuentaRt,
  etiquetaTipoMovimientoRt,
  listarMovimientosTesoreria,
  puedeAdministrarTesoreria,
  registrarGastoCuentaRt,
  saldoTesoreria,
  saldosOrigenTesoreria,
  signoMovimientoRt,
} from '../lib/rtCuentas.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { borrarDatosPruebaFondoTesoreria } from '../lib/purgaVentaEnRuta.js';
import { normalizarRol } from '../lib/roles.js';
import VisorTutorialModal from './VisorTutorialModal.jsx';
import { TUTORIAL_COBRO_SERVICIOS } from '../content/tutorialCobroServicios.js';

/**
 * RC/VentaRuta → Tesorería.
 * Cuenta Servicios → Cheche con fondos de pagos de servicio.
 * Separado de mercancía (Francisco).
 */
export default function PanelTesoreriaRuta({ supabase, user }) {
  const [saldo, setSaldo] = useState(0);
  const [saldoServicios, setSaldoServicios] = useState(0);
  const [movimientos, setMovimientos] = useState([]);
  const [aviso, setAviso] = useState('');
  const [monto, setMonto] = useState('');
  const [notas, setNotas] = useState('');
  const [gastoMonto, setGastoMonto] = useState('');
  const [gastoDesc, setGastoDesc] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  const [tutorialAbierto, setTutorialAbierto] = useState(false);

  const puedeAdmin = puedeAdministrarTesoreria(user);
  const puedeLimpiarPrueba = normalizarRol(user?.rol) === 'Administrador' || puedeAdmin;

  const cargar = useCallback(async () => {
    if (!supabase) return;
    const ensure = await asegurarCuentaTesoreria(supabase);
    if (!ensure.ok) {
      setAviso(ensure.error || 'No se pudo preparar Tesorería.');
      return;
    }
    const [s, o, m] = await Promise.all([
      saldoTesoreria(supabase),
      saldosOrigenTesoreria(supabase),
      listarMovimientosTesoreria(supabase),
    ]);
    if (s.error) setAviso(s.error);
    if (o.error) setAviso(o.error);
    if (m.error) setAviso(m.error?.message || String(m.error));
    setSaldo(s.saldo || 0);
    const srv = (o.data || []).find((x) => x.id === CUENTA_RT_SERVICIOS_ID || x.id === ADMIN_TESORERIA_CUENTA_ID);
    setSaldoServicios(srv?.saldo || 0);
    setMovimientos(m.data || []);
    if (srv?.saldo > 0) setMonto(String(srv.saldo));
    else setMonto('');
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const recibir = async () => {
    if (!puedeAdmin) return alert('Tesorería la administra un administrador / gerente (o Francisco / Cheche).');
    if (!confirm(
      `¿Enviar ${fmtMonto(monto)} de fondos de pagos de servicio\n`
      + `desde Servicios → Cheche (Tesorería)?\n\n`
      + 'Solo servicios. No es mercancía ni venta.',
    )) return;
    setGuardando(true);
    try {
      const r = await enviarFondosServiciosATesoreria(supabase, {
        desdeId: CUENTA_RT_SERVICIOS_ID,
        monto,
        usuarioNombre: user?.nombre || null,
        notas: notas || undefined,
      });
      if (!r.ok) return alert(r.error || 'No se pudo enviar.');
      setNotas('');
      await cargar();
    } finally {
      setGuardando(false);
    }
  };

  const registrarGasto = async () => {
    if (!puedeAdmin) return alert('Tesorería la administra un administrador / gerente (o Francisco / Cheche).');
    if (!confirm(`¿Registrar egreso de Tesorería por ${fmtMonto(gastoMonto)}?`)) return;
    setGuardando(true);
    try {
      const r = await registrarGastoCuentaRt(supabase, {
        cuentaId: CUENTA_TESORERIA_ID,
        monto: gastoMonto,
        descripcion: gastoDesc || 'Egreso Tesorería servicios',
        categoria: 'TESORERIA',
        subcategoria: 'SERVICIOS',
        tienda: 'MAIN',
        usuarioNombre: user?.nombre || null,
      });
      if (!r.ok) return alert(r.error || 'No se pudo registrar.');
      setGastoMonto('');
      setGastoDesc('');
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
      + 'No se toca mercancía (Francisco).\n\n'
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
          <strong>Tesorería</strong> · Tesorero: <strong>Cheche</strong>.
          Solo recibe fondos de <strong>pagos de servicio</strong> desde la cuenta{' '}
          <strong>Servicios</strong> (liquidaciones de RC Servicios).
          No se mezcla con venta / mercancía (Francisco).
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: '0.8rem' }}
            onClick={() => setTutorialAbierto(true)}
          >
            Ver tutorial
          </button>
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
      </div>
      {aviso && (
        <p style={{ color: 'var(--brand-red)', fontSize: '0.85rem', margin: 0 }}>{aviso}</p>
      )}
      {!puedeAdmin && (
        <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
          Solo consulta. Las operaciones las administra un administrador o gerente.
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div
          style={{
            flex: '1 1 160px',
            padding: '0.75rem 0.85rem',
            borderRadius: 12,
            border: '1px solid rgba(15,118,110,0.3)',
            background: 'linear-gradient(180deg, #f0fdfa, #fff)',
          }}
        >
          <div className="muted" style={{ fontSize: '0.72rem' }}>Saldo Tesorería (Cheche)</div>
          <strong style={{ fontSize: '1.35rem', color: '#0f766e' }}>{fmtMonto(saldo)}</strong>
        </div>
        <div
          style={{
            flex: '1 1 140px',
            padding: '0.65rem 0.75rem',
            borderRadius: 10,
            border: '1px solid var(--border, #e2e8f0)',
            background: '#fff',
          }}
        >
          <div className="muted" style={{ fontSize: '0.7rem' }}>Servicios (origen)</div>
          <strong style={{ fontSize: '1rem' }}>{fmtMonto(saldoServicios)}</strong>
        </div>
      </div>

      <div
        style={{
          padding: '0.85rem',
          borderRadius: 12,
          border: '1px solid rgba(15,118,110,0.35)',
          background: 'linear-gradient(180deg, #ecfeff, #fff)',
        }}
      >
        <h4 style={{ margin: '0 0 0.35rem', color: '#0f766e' }}>
          Transferir a Tesorería · Servicios → Cheche
        </h4>
        <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.78rem' }}>
          Primero liquida el Fondo de servicios a la cuenta Servicios; luego envía ese saldo aquí a Tesorería.
        </p>
        <div className="grid-2" style={{ gap: '0.55rem' }}>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
            Cuenta origen
            <input
              className="input"
              style={{ marginTop: '0.3rem' }}
              value={`Servicios · disp. ${fmtMonto(saldoServicios)}`}
              readOnly
              disabled
            />
          </label>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
            Monto (fondos de servicio)
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              style={{ marginTop: '0.3rem' }}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              disabled={!puedeAdmin}
            />
          </label>
        </div>
        <label className="muted" style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.55rem' }}>
          Nota (opcional)
          <input
            className="input"
            style={{ marginTop: '0.3rem' }}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej. CFE semana…"
            disabled={!puedeAdmin}
          />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.65rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={guardando || !puedeAdmin || !(Number(monto) > 0)}
            onClick={() => void recibir()}
          >
            {guardando ? 'Enviando…' : 'Enviar a Tesorería (Cheche)'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void cargar()}>
            Actualizar
          </button>
        </div>
      </div>

      <div
        style={{
          padding: '0.85rem',
          borderRadius: 12,
          border: '1px solid rgba(180,83,9,0.25)',
          background: 'rgba(180,83,9,0.04)',
        }}
      >
        <h4 style={{ margin: '0 0 0.35rem', color: '#b45309' }}>Egreso desde Tesorería</h4>
        <p className="muted" style={{ margin: '0 0 0.55rem', fontSize: '0.78rem' }}>
          Cuando Cheche usa efectivo de Tesorería (pago del servicio u otro egreso).
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
              value={gastoMonto}
              onChange={(e) => setGastoMonto(e.target.value)}
              disabled={!puedeAdmin}
            />
          </label>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
            Concepto
            <input
              className="input"
              style={{ marginTop: '0.3rem' }}
              value={gastoDesc}
              onChange={(e) => setGastoDesc(e.target.value)}
              placeholder="Descripción del egreso"
              disabled={!puedeAdmin}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginTop: '0.65rem' }}
          disabled={guardando || !puedeAdmin || !(Number(gastoMonto) > 0)}
          onClick={() => void registrarGasto()}
        >
          Registrar egreso
        </button>
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.45rem' }}>Movimientos Tesorería</h4>
        <div className="table-wrap">
          <table className="consultas-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Monto</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.length === 0 ? (
                <tr><td colSpan={4} className="muted">Sin movimientos en Tesorería aún.</td></tr>
              ) : movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="muted" style={{ fontSize: '0.8rem' }}>
                    {String(m.fecha || m.created_at || '').slice(0, 16).replace('T', ' ')}
                  </td>
                  <td>{etiquetaTipoMovimientoRt(m.tipo)}</td>
                  <td style={{
                    fontWeight: 700,
                    color: signoMovimientoRt(m.tipo) === '-' ? '#b45309' : '#047857',
                  }}
                  >
                    {signoMovimientoRt(m.tipo)}{fmtMonto(m.monto)}
                  </td>
                  <td className="muted" style={{ fontSize: '0.78rem' }}>
                    {m.notas || '—'}
                    {m.cuenta_relacionada ? ` · ${etiquetaCuentaRt(m.cuenta_relacionada)}` : ''}
                    {m.usuario ? ` · ${m.usuario}` : ''}
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
