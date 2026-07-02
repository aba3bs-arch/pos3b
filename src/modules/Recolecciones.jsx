import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import { normalizarRol } from '../lib/roles.js';
import InputPin from '../components/InputPin.jsx';
import { BtnLabel } from '../components/Icon.jsx';
import {
  cobrarCreditosSeleccionados,
  fmtMonto,
  listarCreditosPendientes,
  listarRepartidores,
  pinRepartidorValido,
  registrarTraspasos,
  sucursalParaControlEfectivo,
} from '../lib/controlEfectivo.js';

function TabBtn({ active, onClick, children }) {
  return (
    <button type="button" className={active ? 'btn btn-primary' : 'btn btn-ghost'} onClick={onClick} style={{ flex: '1 1 auto' }}>
      {children}
    </button>
  );
}

export default function Recolecciones({ supabase, sucursal, user }) {
  const tiendaEfectivo = sucursalParaControlEfectivo(sucursal);
  const tiendaLabel = etiquetaTienda(sucursal);
  const esRepartidor = normalizarRol(user?.rol) === 'Repartidor';

  const [tab, setTab] = useState(esRepartidor ? 'cobro' : 'traspaso');
  const [repartidores, setRepartidores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorTabla, setErrorTabla] = useState(null);

  const [repTraspaso, setRepTraspaso] = useState('');
  const [pinTraspaso, setPinTraspaso] = useState('');
  const [esEfectivo, setEsEfectivo] = useState(true);
  const [filas, setFilas] = useState([{ folio: '', monto: '' }]);
  const [guardando, setGuardando] = useState(false);

  const [repCobro, setRepCobro] = useState('');
  const [pinCobro, setPinCobro] = useState('');
  const [pendientes, setPendientes] = useState([]);
  const [selCobro, setSelCobro] = useState({});
  const [cajeroCobro, setCajeroCobro] = useState('');

  const cargarCatalogos = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setErrorTabla(null);
    try {
      const reps = await listarRepartidores(supabase);
      setRepartidores(reps);
      if (reps.length) {
        setRepTraspaso((prev) => prev || reps[0].id);
        setRepCobro((prev) => prev || reps[0].id);
      }
    } catch (e) {
      setErrorTabla(
        e.message?.includes('repartidores')
          ? 'Ejecuta supabase/control_efectivo.sql en Supabase para crear las tablas.'
          : e.message,
      );
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const cargarPendientes = useCallback(async () => {
    if (!supabase || !tiendaEfectivo) return;
    try {
      const data = await listarCreditosPendientes(supabase, tiendaEfectivo);
      setPendientes(data);
      const init = {};
      data.forEach((p) => {
        init[p.id] = true;
      });
      setSelCobro(init);
    } catch (e) {
      setErrorTabla(e.message);
    }
  }, [supabase, tiendaEfectivo]);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  useEffect(() => {
    if (tab === 'cobro') cargarPendientes();
  }, [tab, cargarPendientes]);

  const totalCobroSel = useMemo(
    () => pendientes.filter((p) => selCobro[p.id]).reduce((a, p) => a + Number(p.monto || 0), 0),
    [pendientes, selCobro],
  );

  const confirmarTraspaso = async () => {
    if (!tiendaEfectivo) return alert('Este módulo no aplica en la central MAIN.');
    if (!pinRepartidorValido(pinTraspaso, repTraspaso, repartidores)) return alert('PIN de recolector incorrecto.');
    setGuardando(true);
    const res = await registrarTraspasos(supabase, filas, {
      tienda: tiendaEfectivo,
      repartidorId: repTraspaso,
      cajero: user?.nombre || 'Cajero',
      esEfectivo,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`✅ ${res.count} traspaso(s) registrado(s)${esEfectivo ? ' en tránsito' : ' a crédito'}.`);
    setFilas([{ folio: '', monto: '' }]);
    setPinTraspaso('');
    if (!esEfectivo) setTab('cobro');
  };

  const confirmarCobro = async () => {
    if (!pinRepartidorValido(pinCobro, repCobro, repartidores)) return alert('PIN de recolector incorrecto.');
    const ids = pendientes.filter((p) => selCobro[p.id]).map((p) => p.id);
    setGuardando(true);
    const res = await cobrarCreditosSeleccionados(supabase, {
      ids,
      repartidorId: repCobro,
      cajero: cajeroCobro || user?.nombre || '',
      pendientes,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`✅ Cobrados ${res.count} folio(s) por ${fmtMonto(res.total)}.`);
    setPinCobro('');
    cargarPendientes();
  };

  if (!tiendaEfectivo) {
    return (
      <div className="card">
        <p>Las recolecciones operan en tiendas de venta, no en <strong>{tiendaLabel}</strong>. Cambia la sucursal activa.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: 'var(--brand-blue)' }}>Recolecciones</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Control de traspasos en efectivo y crédito · Tienda <span className="badge">{tiendaLabel}</span> ({tiendaEfectivo})
        </p>
      </div>

      {errorTabla && (
        <div className="card" style={{ borderColor: 'var(--brand-red)', color: 'var(--brand-red)' }}>
          {errorTabla}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {!esRepartidor && (
          <TabBtn active={tab === 'traspaso'} onClick={() => setTab('traspaso')}>
            <BtnLabel icon="truck">Registrar traspaso</BtnLabel>
          </TabBtn>
        )}
        <TabBtn active={tab === 'cobro'} onClick={() => setTab('cobro')}>
          <BtnLabel icon="dollar">Cobrar crédito</BtnLabel>
        </TabBtn>
      </div>

      {loading && <p className="muted">Cargando recolectores…</p>}

      {tab === 'traspaso' && !esRepartidor && (
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Nuevo traspaso</h3>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Cajero: <strong>{user?.nombre}</strong>. Si es a crédito, el recolector lo cobra después en «Cobrar crédito».
          </p>

          <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
            Recolector
            <select className="select" style={{ marginTop: '0.35rem' }} value={repTraspaso} onChange={(e) => setRepTraspaso(e.target.value)}>
              {repartidores.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </label>

          <fieldset style={{ border: 'none', padding: 0, margin: '0.75rem 0' }}>
            <legend className="muted" style={{ fontSize: '0.85rem' }}>
              Forma de pago
            </legend>
            <label style={{ display: 'block', marginTop: '0.35rem' }}>
              <input type="radio" checked={esEfectivo} onChange={() => setEsEfectivo(true)} /> Efectivo (cobrado ahora)
            </label>
            <label style={{ display: 'block', marginTop: '0.25rem' }}>
              <input type="radio" checked={!esEfectivo} onChange={() => setEsEfectivo(false)} /> Crédito (pendiente de cobro)
            </label>
          </fieldset>

          {filas.map((f, idx) => (
            <div key={idx} className="grid-2" style={{ marginTop: '0.5rem', alignItems: 'end' }}>
              <label className="muted">
                Folio #{idx + 1}
                <input
                  className="input"
                  style={{ marginTop: '0.35rem' }}
                  value={f.folio}
                  onChange={(e) => {
                    const next = [...filas];
                    next[idx] = { ...next[idx], folio: e.target.value };
                    setFilas(next);
                  }}
                  placeholder="Ej. T-9945"
                />
              </label>
              <label className="muted">
                Monto ($)
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  style={{ marginTop: '0.35rem' }}
                  value={f.monto}
                  onChange={(e) => {
                    const next = [...filas];
                    next[idx] = { ...next[idx], monto: e.target.value };
                    setFilas(next);
                  }}
                />
              </label>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setFilas([...filas, { folio: '', monto: '' }])}>
              + Otro folio
            </button>
            {filas.length > 1 && (
              <button type="button" className="btn btn-ghost" onClick={() => setFilas(filas.slice(0, -1))}>
                Quitar último
              </button>
            )}
          </div>

          <label className="muted" style={{ display: 'block', marginTop: '1rem' }}>
            PIN del recolector
            <InputPin value={pinTraspaso} onChange={(e) => setPinTraspaso(e.target.value)} placeholder="PIN" style={{ marginBottom: 0 }} />
          </label>

          <button type="button" className="btn btn-gold" style={{ marginTop: '1rem' }} disabled={guardando} onClick={confirmarTraspaso}>
            {guardando ? 'Guardando…' : 'Confirmar traspaso(s)'}
          </button>
        </div>
      )}

      {tab === 'cobro' && (
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Créditos pendientes en {tiendaEfectivo}</h3>
          {!pendientes.length ? (
            <p className="muted">✅ No hay folios a crédito pendientes en esta tienda.</p>
          ) : (
            <>
              {pendientes.map((p) => (
                <label
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.65rem 0',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  <input type="checkbox" checked={Boolean(selCobro[p.id])} onChange={(e) => setSelCobro({ ...selCobro, [p.id]: e.target.checked })} />
                  <span style={{ flex: 1 }}>
                    <strong>{p.num_traspaso}</strong>
                    <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                      Cajero: {p.cajero_nombre}
                    </span>
                  </span>
                  <strong>{fmtMonto(p.monto)}</strong>
                </label>
              ))}
              <p style={{ margin: '1rem 0 0.5rem', fontWeight: 700 }}>Total seleccionado: {fmtMonto(totalCobroSel)}</p>

              <label className="muted" style={{ display: 'block' }}>
                Recolector
                <select className="select" style={{ marginTop: '0.35rem' }} value={repCobro} onChange={(e) => setRepCobro(e.target.value)}>
                  {repartidores.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
                Cajero que liquida
                <input className="input" style={{ marginTop: '0.35rem' }} value={cajeroCobro} onChange={(e) => setCajeroCobro(e.target.value)} placeholder={user?.nombre || 'Nombre del cajero'} />
              </label>
              <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
                PIN recolector
                <InputPin value={pinCobro} onChange={(e) => setPinCobro(e.target.value)} placeholder="PIN" style={{ marginBottom: 0 }} />
              </label>
              <button type="button" className="btn btn-success" style={{ marginTop: '1rem' }} disabled={guardando || totalCobroSel <= 0} onClick={confirmarCobro}>
                {guardando ? 'Procesando…' : 'Confirmar cobro físico'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
