import React, { useState } from 'react';
import InputPin from './InputPin.jsx';
import FiltroRangoCalendario from './FiltroRangoCalendario.jsx';
import { listarSucursales, listarSucursalesOperativas, etiquetaTienda } from '../constants/sucursales.js';
import { esAdministradorPrincipal, verificarAdminPrincipal } from '../lib/adminPrincipal.js';
import { TIPOS_PURGA, ejecutarPurgaDatos } from '../lib/purgeDatosAdmin.js';

export default function PanelPurgeDatosAdmin({
  supabase,
  user,
  sucursal,
  inventarioCompleto,
  cargarDatos,
  onCerrar,
}) {
  const esAdmin = esAdministradorPrincipal(user);
  const [pin, setPin] = useState('');
  const [tipos, setTipos] = useState(['ventas']);
  const [tiendasSel, setTiendasSel] = useState([]);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [borrarTodo, setBorrarTodo] = useState(false);
  const [confirmTexto, setConfirmTexto] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const tiendasOps = listarSucursalesOperativas();
  const todasTiendas = listarSucursales();

  if (!esAdmin) return null;

  const toggleTipo = (id) => {
    setTipos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleTienda = (id) => {
    setTiendasSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const ejecutar = async () => {
    setErr('');
    setMsg('');
    if (!pin.trim()) {
      setErr('Ingresa tu PIN de administrador.');
      return;
    }
    if (borrarTodo && confirmTexto.trim().toUpperCase() !== 'BORRAR TODO') {
      setErr('Escribe BORRAR TODO para confirmar la purga total.');
      return;
    }
    if (!borrarTodo && !desde && !hasta) {
      setErr('Indica rango de fechas o activa «Borrar toda la información».');
      return;
    }
    if (!borrarTodo && !window.confirm('¿Confirmas el borrado de los datos seleccionados? Esta acción no se puede deshacer.')) {
      return;
    }
    if (borrarTodo && !window.confirm('ÚLTIMA CONFIRMACIÓN: se borrarán datos de TODAS las tiendas. ¿Continuar?')) {
      return;
    }

    setProcesando(true);
    const auth = await verificarAdminPrincipal(supabase, pin, sucursal);
    if (!auth.ok) {
      setProcesando(false);
      setErr(auth.error);
      return;
    }

    const r = await ejecutarPurgaDatos(supabase, {
      tipos: borrarTodo ? TIPOS_PURGA.map((t) => t.id) : tipos,
      sucursales: borrarTodo ? todasTiendas : tiendasSel,
      desde,
      hasta,
      borrarTodo,
      inventarioCompleto,
      sucursalActiva: sucursal,
      usuario: user?.nombre,
    });
    setProcesando(false);
    setPin('');
    if (!r.ok) {
      setErr(r.error || (r.errores || []).join('\n'));
      if (r.mensaje) setMsg(r.mensaje);
      return;
    }
    setMsg(r.mensaje || 'Operación completada.');
    if (typeof cargarDatos === 'function') cargarDatos();
  };

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, color: 'var(--brand-red)', fontSize: '1rem' }}>Borrado de datos (solo Andrés)</h3>
        <button type="button" className="btn btn-ghost" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
      <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
        Elimina cortes, ventas, inventario y caché local por rango de fechas y tiendas. Requiere PIN del administrador principal Andrés.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', fontWeight: 700, color: 'var(--brand-red)' }}>
        <input type="checkbox" checked={borrarTodo} onChange={(e) => setBorrarTodo(e.target.checked)} />
        Borrar toda la información de todas las tiendas
      </label>

      {!borrarTodo && (
        <>
          <div style={{ marginTop: '1rem' }}>
            <div className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.35rem' }}>Datos a borrar</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {TIPOS_PURGA.map((t) => (
                <label key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', fontSize: '0.88rem' }}>
                  <input type="checkbox" checked={tipos.includes(t.id)} onChange={() => toggleTipo(t.id)} style={{ marginTop: '0.2rem' }} />
                  <span>
                    <strong>{t.label}</strong>
                    <span className="muted"> — {t.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <FiltroRangoCalendario style={{ marginTop: '1rem' }} desde={desde} hasta={hasta} onDesdeChange={setDesde} onHastaChange={setHasta} />

          <div style={{ marginTop: '1rem' }}>
            <div className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.35rem' }}>
              Tiendas (ninguna = todas las operativas, sin MAIN)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {tiendasOps.map((t) => (
                <label key={t} className="badge" style={{ cursor: 'pointer', background: tiendasSel.includes(t) ? 'rgba(255,49,49,0.15)' : undefined }}>
                  <input type="checkbox" checked={tiendasSel.includes(t)} onChange={() => toggleTienda(t)} style={{ marginRight: '0.25rem' }} />
                  {etiquetaTienda(t)}
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {borrarTodo && (
        <label className="muted" style={{ display: 'block', marginTop: '1rem', fontSize: '0.8rem' }}>
          Escribe <strong>BORRAR TODO</strong> para confirmar
          <input className="input" style={{ display: 'block', marginTop: '0.2rem', maxWidth: 280 }} value={confirmTexto} onChange={(e) => setConfirmTexto(e.target.value)} />
        </label>
      )}

      <div style={{ maxWidth: 220, marginTop: '1rem' }}>
        <div className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>PIN administrador Andrés</div>
        <InputPin value={pin} onChange={(e) => setPin(e.target.value)} />
      </div>

      <button type="button" className="btn btn-danger" style={{ marginTop: '1rem' }} disabled={procesando} onClick={ejecutar}>
        {procesando ? 'Procesando…' : borrarTodo ? 'Ejecutar purga total' : 'Ejecutar borrado'}
      </button>

      {msg && <p style={{ color: 'var(--brand-green)', marginTop: '0.75rem' }}>{msg}</p>}
      {err && <p style={{ color: 'var(--brand-red)', marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}>{err}</p>}
    </div>
  );
}
