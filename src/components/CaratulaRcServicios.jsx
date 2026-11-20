import { useCallback, useEffect, useState } from 'react';
import { fmtMonto, listarRepartidores, listarTodoEnTransito } from '../lib/controlEfectivo.js';
import { listarCreditosPendientesRuta } from '../lib/rutaCxc.js';
import { armarCaratulaRcServicios } from '../lib/caratulaRcServicios.js';

const REFRESCO_MS = 15000;

function IconoBillete() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconoTarjeta() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconoGente() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="9" r="2.4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 14.6c1.6.2 3 .9 3.8 2.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconoMonedas() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="9" cy="8" rx="5" ry="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 8v4c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <ellipse cx="15" cy="12" rx="5" ry="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 12v4c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2v-4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconosServicio() {
  return (
    <svg width="46" height="16" viewBox="0 0 46 16" aria-hidden="true">
      <path d="M6 1.5 3.2 8.2h3.2L5 14.5 10.2 7H7.2L9.2 1.5Z" fill="currentColor" />
      <path d="M18 2.2c2.2 1.6 2.2 4.2 0 6.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M18 4.2c1 0.8 1 2 0 2.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16.2 11.2c.5 1.2 1.4 1.8 1.8 1.8s1.3-.6 1.8-1.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="18" cy="14.2" r="0.7" fill="currentColor" />
      <path d="M28 11.5c1.6-1.6 4.2-1.6 5.8 0M26.2 13.2c2.4-2.2 6.2-2.2 8.6 0M30 9.6c.7-.6 1.8-.6 2.5 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function Casilla({ tono, titulo, subtitulo, icono, children }) {
  return (
    <div className={`rc-srv-casilla rc-srv-casilla--${tono}`}>
      <div className="rc-srv-casilla-head">
        <div>
          <div className="rc-srv-casilla-titulo">{titulo}</div>
          {subtitulo ? <div className="rc-srv-casilla-sub">{subtitulo}</div> : null}
        </div>
        {icono ? <div className="rc-srv-casilla-icono">{icono}</div> : null}
      </div>
      {children}
    </div>
  );
}

function TarjetaRecolector({ fila }) {
  const vacio = !(fila.saldo > 0);
  return (
    <article className={`rc-srv-card${vacio ? ' rc-srv-card--vacio' : ''}`}>
      <h3 className="rc-srv-nombre">{fila.nombre}</h3>
      <div className="rc-srv-leyenda">Saldo en Ruta (Ventas + Créditos del camión):</div>
      <div className={`rc-srv-saldo${vacio ? ' rc-srv-saldo--vacio' : ''}`}>{fmtMonto(fila.saldo)}</div>
      <div className="rc-srv-mov">
        {fila.transito} mov. en tránsito ({fila.rc} rc)
      </div>
      <div className="rc-srv-corte">
        Ventas del camión: {fila.ventas.count} rc
        <span> | </span>
        Créditos recuperados: {fila.recuperados.count} rc
        <span> | </span>
        Servicios: {fila.servicios.count} rc
        <span> | </span>
        Clientes externos: {fila.externos.count} rc
      </div>
      <div className="rc-srv-grid">
        <Casilla tono="ventas" titulo="RC/Ventas" subtitulo="(Camión en curso)" icono={<IconoBillete />}>
          <div className="rc-srv-pill">
            <strong>Total: {fmtMonto(fila.ventas.total)}</strong>
          </div>
          <div className="rc-srv-pill">
            <IconoBillete />
            <span>Efectivo: {fmtMonto(fila.ventas.efectivo)}</span>
          </div>
          <div className="rc-srv-pill">
            <IconoTarjeta />
            <span>Crédito (nuevo): {fmtMonto(fila.ventas.creditoNuevo)}</span>
          </div>
        </Casilla>
        <Casilla tono="creditos" titulo="RC/Créditos Recuperados" subtitulo="(Créditos anteriores)" icono={<IconoMonedas />}>
          <div className="rc-srv-rc">{fila.recuperados.count} rc</div>
          <div className="rc-srv-monto">{fmtMonto(fila.recuperados.total)}</div>
        </Casilla>
        <Casilla tono="servicios" titulo="RC/Servicios" icono={<IconosServicio />}>
          <div className="rc-srv-rc">{fila.servicios.count} rc</div>
          <div className="rc-srv-monto">{fmtMonto(fila.servicios.total)}</div>
        </Casilla>
        <Casilla tono="externos" titulo="RC/Clientes Externos" icono={<IconoGente />}>
          <div className="rc-srv-rc">{fila.externos.count} rc</div>
          <div className="rc-srv-monto">{fmtMonto(fila.externos.total)}</div>
        </Casilla>
      </div>
    </article>
  );
}

export default function CaratulaRcServicios({ supabase }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!supabase) {
      setError('Sin conexión.');
      setCargando(false);
      return;
    }
    try {
      const [reps, movs, cred] = await Promise.all([
        listarRepartidores(supabase),
        listarTodoEnTransito(supabase),
        listarCreditosPendientesRuta(supabase, { todos: true, sync: 'skip' }),
      ]);
      setError(cred?.error || '');
      setFilas(armarCaratulaRcServicios(reps, movs, cred?.data || []));
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setCargando(false);
    }
  }, [supabase]);

  useEffect(() => {
    void cargar();
    const t = setInterval(() => { void cargar(); }, REFRESCO_MS);
    return () => clearInterval(t);
  }, [cargar]);

  return (
    <section className="rc-srv">
      <h3 className="rc-srv-titulo">Saldos del recolector (RC)</h3>
      <p className="rc-srv-intro">Control de efectivo, créditos y cobranza. Se actualiza cada 15 segundos.</p>
      {error ? <p className="rc-srv-error">{error}</p> : null}
      {cargando && !filas.length ? <p className="muted">Cargando recolectores…</p> : null}
      {!cargando && !filas.length && !error ? <p className="muted">Sin recolectores activos.</p> : null}
      <div className="rc-srv-lista">
        {filas.map((fila) => <TarjetaRecolector key={fila.id} fila={fila} />)}
      </div>
    </section>
  );
}
