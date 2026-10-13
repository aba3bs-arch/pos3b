import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listarSucursalesOperativas, etiquetaTienda } from '../constants/sucursales.js';
import { listarServiciosCobro } from '../lib/controlEfectivo.js';
import {
  cancelarSolicitudFondo,
  listarSolicitudesFondoPendientes,
  MODULOS_CORTE_FONDO,
  etiquetaModuloCorteFondo,
  solicitarCobroServicioRuta,
} from '../lib/rutaFondoServicios.js';
import { fmtMonto } from '../lib/consultasUi.js';
import VisorTutorialModal from '../components/VisorTutorialModal.jsx';
import { TUTORIAL_COBRO_SERVICIOS } from '../content/tutorialCobroServicios.js';
import './VentaEnRuta.css';

/**
 * Venta en Ruta → Cobro servicios (móvil recolector).
 * Solicita cobro CFE/otros; el cajero aprueba con PIN en su caja.
 */
export default function CobroServiciosRuta({
  supabase,
  user,
  vendedorSesion = null,
  setAviso,
  onVolver,
}) {
  const [servicios, setServicios] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [servicioClave, setServicioClave] = useState('');
  const [tienda, setTienda] = useState('');
  const [monto, setMonto] = useState('');
  const [moduloCorte, setModuloCorte] = useState('abarrotes');
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [tutorialAbierto, setTutorialAbierto] = useState(false);

  const tiendas = useMemo(() => listarSucursalesOperativas().filter((s) => s !== 'MAIN' && s !== 'CEDIS'), []);

  const repartidorId = vendedorSesion?.repartidor_id || vendedorSesion?.id || null;
  const repartidorNombre = vendedorSesion?.nombre || user?.nombre || 'Recolector';

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const srvs = await listarServiciosCobro(supabase);
      setServicios(srvs || []);
      setServicioClave((prev) => prev || srvs?.[0]?.clave || '');
      const pend = await listarSolicitudesFondoPendientes(supabase, { limit: 20 });
      if (pend.aviso) setAviso?.(pend.aviso);
      setPendientes((pend.data || []).filter((p) => {
        if (!repartidorId) return true;
        return String(p.repartidor_id || '') === String(repartidorId)
          || String(p.solicitado_por || '') === String(repartidorNombre);
      }));
    } finally {
      setCargando(false);
    }
  }, [supabase, setAviso, repartidorId, repartidorNombre]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    const srv = servicios.find((s) => String(s.clave) === String(servicioClave));
    if (srv) setMonto(String(srv.monto_default || ''));
  }, [servicioClave, servicios]);

  const servicioSel = servicios.find((s) => String(s.clave) === String(servicioClave));

  const enviar = async () => {
    if (!servicioSel) return alert('Selecciona un servicio (Panel RT → Servicios).');
    if (!tienda) return alert('Selecciona la tienda.');
    setEnviando(true);
    try {
      const r = await solicitarCobroServicioRuta(supabase, {
        servicio: servicioSel,
        monto,
        sucursalId: tienda,
        moduloCorte,
        repartidorId,
        repartidorNombre,
        solicitadoPor: repartidorNombre,
        nota,
      });
      if (!r.ok) return alert(r.error || 'No se pudo solicitar.');
      setAviso?.(
        `Solicitud enviada · ${servicioSel.nombre} ${fmtMonto(monto)} · ${etiquetaTienda(tienda)}. `
        + (r.notificacionId
          ? 'La caja de la tienda debe ver la alerta para aprobar con PIN.'
          : (r.aviso || 'Avisa al cajero: en su PC debe aparecer el cobro (o Actualizar).')),
      );
      if (r.aviso && !r.notificacionId) {
        alert(r.aviso);
      }
      setNota('');
      await cargar();
    } finally {
      setEnviando(false);
    }
  };

  const cancelar = async (id) => {
    if (!confirm('¿Cancelar esta solicitud pendiente?')) return;
    const r = await cancelarSolicitudFondo(supabase, { solicitudId: id, por: repartidorNombre });
    if (!r.ok) return alert(r.error || 'No se pudo cancelar.');
    await cargar();
  };

  return (
    <div className="ruta-invop" style={{ gap: '0.65rem' }}>
      <header className="ruta-invop-hero">
        <div className="ruta-invop-hero-text">
          <p className="ruta-invop-kicker">Venta en ruta · Servicios</p>
          <h3>Cobrar servicios</h3>
          <p className="ruta-invop-lead">
            Solicita CFE u otros servicios del Panel RT. El cajero aprueba con PIN
            y el monto entra al Fondo en RC/VentaRuta.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: '0.8rem' }}
            onClick={() => setTutorialAbierto(true)}
          >
            Ver tutorial
          </button>
          {onVolver && (
            <button type="button" className="btn btn-ghost ruta-invop-volver" onClick={onVolver}>
              Volver
            </button>
          )}
        </div>
      </header>

      <section className="ruta-invop-panel">
        <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.82rem' }}>
          Recolector: <strong>{repartidorNombre}</strong>
          {cargando ? ' · cargando…' : ''}
        </p>

        <label className="muted" style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.55rem' }}>
          Servicio
          <select
            className="input"
            style={{ marginTop: '0.3rem' }}
            value={servicioClave}
            onChange={(e) => setServicioClave(e.target.value)}
          >
            {servicios.length === 0 && <option value="">— Sin servicios (Panel RT) —</option>}
            {servicios.map((s) => (
              <option key={s.clave} value={s.clave}>
                {s.nombre} · {fmtMonto(s.monto_default)}
              </option>
            ))}
          </select>
        </label>

        <label className="muted" style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.55rem' }}>
          Tienda
          <select
            className="input"
            style={{ marginTop: '0.3rem' }}
            value={tienda}
            onChange={(e) => setTienda(e.target.value)}
          >
            <option value="">— Selecciona —</option>
            {tiendas.map((t) => (
              <option key={t} value={t}>{etiquetaTienda(t)}</option>
            ))}
          </select>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
            Monto
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              style={{ marginTop: '0.3rem' }}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </label>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
            Corte (gasto)
            <select
              className="input"
              style={{ marginTop: '0.3rem' }}
              value={moduloCorte}
              onChange={(e) => setModuloCorte(e.target.value)}
            >
              {MODULOS_CORTE_FONDO.map((m) => (
                <option key={m} value={m}>{etiquetaModuloCorteFondo(m)}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted" style={{ margin: '0.35rem 0 0.55rem', fontSize: '0.75rem' }}>
          Por defecto Abarrotes. Al aprobar, sale como gasto del corte elegido.
        </p>

        <label className="muted" style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Nota (opcional)
          <input
            className="input"
            style={{ marginTop: '0.3rem' }}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Referencia, medidor…"
          />
        </label>

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={enviando || !servicioClave || !tienda}
          onClick={() => void enviar()}
        >
          {enviando ? 'Enviando…' : 'Solicitar cobro al cajero'}
        </button>
      </section>

      {pendientes.length > 0 && (
        <section className="ruta-invop-panel">
          <h4 style={{ margin: '0 0 0.5rem' }}>Pendientes de aprobación</h4>
          <div className="ruta-invop-hist">
            {pendientes.map((p) => (
              <div key={p.id} className="ruta-invop-hist-row">
                <div>
                  <strong>{p.servicio_nombre}</strong>
                  <span className="muted">
                    {etiquetaTienda(p.sucursal_id)} · {etiquetaModuloCorteFondo(p.modulo_corte)} ·{' '}
                    {String(p.created_at || '').slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
                <div className="ruta-invop-hist-nums">
                  <span className="falt">{fmtMonto(p.monto)}</span>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '0.2rem 0.45rem' }} onClick={() => void cancelar(p.id)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <VisorTutorialModal
        abierto={tutorialAbierto}
        tutorial={TUTORIAL_COBRO_SERVICIOS}
        onCerrar={() => setTutorialAbierto(false)}
      />
    </div>
  );
}
