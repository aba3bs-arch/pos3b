import React, { useEffect, useMemo, useState } from 'react';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { resolverTipoEmpleado } from '../lib/empleadosVisibles.js';
import {
  AVISO_FALTA_BONOS_REACTIVACIONES,
  EVENTO_BONOS_REACTIVACIONES,
  etiquetaReactivacionBono,
  idDesdeClaveBloqueoBono,
  listarBonosReactivaciones,
  reactivarBonoEmpleado,
  revocarReactivacionBono,
} from '../lib/bonosReactivaciones.js';
import { normalizarRol } from '../lib/roles.js';
import { hoyYmdNogales } from '../lib/corteCaja.js';
import { usuarioEstaActivo } from '../lib/usuariosAuth.js';

function plantillaDirectos(usuarios, sucursal) {
  const suc = normalizarCodigoTienda(sucursal);
  return (usuarios || [])
    .filter((u) => {
      if (!usuarioEstaActivo(u)) return false;
      if (normalizarRol(u.rol) === 'Administrador') return false;
      if (resolverTipoEmpleado(u) !== 'tienda') return false;
      const sucU = normalizarCodigoTienda(u.sucursal_id);
      if (!sucU || sucU === 'MAIN') return false;
      if (suc && sucU !== suc) return false;
      return true;
    })
    .sort((a, b) => {
      const sucCmp = String(a.sucursal_id || '').localeCompare(String(b.sucursal_id || ''));
      if (sucCmp) return sucCmp;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
    });
}

function etiquetaEmpleado(u, mostrarSucursal) {
  const nombre = String(u?.nombre || 'Sin nombre').trim() || 'Sin nombre';
  if (!mostrarSucursal) return nombre;
  const suc = etiquetaTienda(u?.sucursal_id);
  return suc ? `${nombre} · ${suc}` : nombre;
}

/**
 * Reactivar / corregir fecha de bono de un empleado de tienda.
 * Visible para Administrador / Gerente.
 */
export default function PanelReactivarBono({
  supabase,
  sucursal = '',
  user,
  usuarios = [],
  onCambio = null,
  preselectUsuarioId = '',
}) {
  const rol = normalizarRol(user?.rol);
  const puede = rol === 'Administrador' || rol === 'Gerente';
  const suc = normalizarCodigoTienda(sucursal);
  const plantilla = useMemo(() => plantillaDirectos(usuarios, suc), [usuarios, suc]);
  const variasTiendas = !suc;

  const [usuarioId, setUsuarioId] = useState('');
  const [fecha, setFecha] = useState(() => hoyYmdNogales());
  const [motivo, setMotivo] = useState('Reactivación de bono');
  const [lista, setLista] = useState([]);
  const [aviso, setAviso] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const cargar = async () => {
    if (!supabase) return;
    const res = await listarBonosReactivaciones(supabase, {
      sucursalId: suc,
      limit: 200,
    });
    if (res.faltaTabla) setAviso(AVISO_FALTA_BONOS_REACTIVACIONES);
    else setAviso(res.error || '');
    setLista(res.data || []);
  };

  useEffect(() => {
    if (!puede || !supabase) return undefined;
    void cargar();
    const onEvt = () => { void cargar(); };
    window.addEventListener(EVENTO_BONOS_REACTIVACIONES, onEvt);
    return () => window.removeEventListener(EVENTO_BONOS_REACTIVACIONES, onEvt);
  }, [puede, supabase, suc]);

  useEffect(() => {
    if (preselectUsuarioId && plantilla.some((u) => String(u.id) === String(preselectUsuarioId))) {
      setUsuarioId(String(preselectUsuarioId));
      return;
    }
    if (!usuarioId && plantilla.length) setUsuarioId(String(plantilla[0].id));
  }, [plantilla, usuarioId, preselectUsuarioId]);

  if (!puede) return null;

  const onReactivar = async (e) => {
    e.preventDefault();
    if (busy) return;
    const emp = plantilla.find((u) => String(u.id) === String(usuarioId));
    if (!emp) {
      setMsg('Elige un empleado de tienda (directo).');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const res = await reactivarBonoEmpleado(supabase, {
        usuarioId: emp.id,
        nombre: emp.nombre,
        sucursalId: emp.sucursal_id || suc,
        vuelveYmd: fecha,
        motivo,
        autorizadoPor: user?.nombre || '',
        autorizadoPorRol: user?.rol || '',
      });
      if (!res.ok) {
        setMsg(res.error || 'No se pudo reactivar.');
        if (res.faltaTabla) setAviso(AVISO_FALTA_BONOS_REACTIVACIONES);
        return;
      }
      setMsg(`${emp.nombre}: el bono vuelve desde ${fecha}. Las faltas anteriores a esa fecha ya no bloquean.`);
      await cargar();
      if (typeof onCambio === 'function') await onCambio();
    } finally {
      setBusy(false);
    }
  };

  const onRevocar = async (row) => {
    if (busy || !row?.id) return;
    if (!window.confirm(`¿Quitar la reactivación de ${row.nombre || 'empleado'}? El ban por falta vuelve a aplicar.`)) return;
    setBusy(true);
    try {
      const res = await revocarReactivacionBono(supabase, row.id);
      if (!res.ok) {
        setMsg(res.error || 'No se pudo quitar.');
        return;
      }
      setMsg('Reactivación eliminada.');
      await cargar();
      if (typeof onCambio === 'function') await onCambio();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        marginTop: '0.85rem',
        padding: '0.65rem 0.75rem',
        borderRadius: 8,
        border: '1px solid rgba(21,128,61,0.28)',
        background: 'rgba(21,128,61,0.05)',
      }}
    >
      <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.88rem', color: '#15803d' }}>
        Reactivar bono de empleado directo
      </h4>
      <p className="muted" style={{ margin: '0 0 0.55rem', fontSize: '0.74rem' }}>
        Sirve para un caso puntual (por ejemplo corregir la fecha de Sandra Martínez)
        o para cualquier empleado de tienda si hay que devolverle el bono.
        La fecha es el día en que <strong>vuelve a cobrar</strong>: las faltas anteriores
        dejan de bloquear. Si elige hoy, se reactiva de inmediato. Una falta nueva
        después de esa fecha vuelve a quitar el bono 7 días.
        {suc ? <> {' '}Tienda: <strong>{etiquetaTienda(suc)}</strong>.</> : ' Todas las tiendas.'}
      </p>

      {aviso ? (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: '#b45309' }}>{aviso}</p>
      ) : null}

      <form
        onSubmit={onReactivar}
        style={{
          display: 'grid',
          gap: '0.45rem',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          alignItems: 'end',
        }}
      >
        <label className="muted" style={{ fontSize: '0.75rem' }}>
          Empleado de tienda
          <select
            className="select"
            style={{ marginTop: 4 }}
            value={usuarioId}
            onChange={(e) => setUsuarioId(e.target.value)}
          >
            {plantilla.length === 0 ? (
              <option value="">Sin empleados de tienda</option>
            ) : (
              plantilla.map((u) => (
                <option key={u.id} value={u.id}>{etiquetaEmpleado(u, variasTiendas)}</option>
              ))
            )}
          </select>
        </label>
        <label className="muted" style={{ fontSize: '0.75rem' }}>
          Vuelve a cobrar desde
          <input
            className="input"
            type="date"
            style={{ marginTop: 4 }}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </label>
        <label className="muted" style={{ fontSize: '0.75rem', gridColumn: 'span 2' }}>
          Motivo
          <input
            className="input"
            style={{ marginTop: 4 }}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Reactivación de bono"
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !plantilla.length}
          style={{ fontSize: '0.8rem' }}
        >
          {busy ? '…' : 'Reactivar bono'}
        </button>
      </form>

      {msg ? (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>{msg}</p>
      ) : null}

      {lista.length > 0 ? (
        <ul style={{ margin: '0.55rem 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: '0.25rem' }}>
          {lista.slice(0, 12).map((r) => (
            <li
              key={r.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.5rem',
                fontSize: '0.78rem',
                padding: '0.3rem 0.4rem',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.75)',
              }}
            >
              <span>
                <strong>{r.nombre || r.usuario_id}</strong>
                <span className="muted" style={{ marginLeft: 6 }}>{etiquetaReactivacionBono(r)}</span>
                {r.motivo ? <span className="muted" style={{ marginLeft: 6 }}>· {r.motivo}</span> : null}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: '0.72rem', padding: '0.1rem 0.35rem', color: 'var(--danger)' }}
                disabled={busy}
                onClick={() => { void onRevocar(r); }}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Control compacto en cada fila de “Sin bono por falta”. */
export function FilaReactivarBono({
  supabase,
  user,
  bloqueo,
  usuarios = [],
  onHecho,
}) {
  const rol = normalizarRol(user?.rol);
  const puede = rol === 'Administrador' || rol === 'Gerente';
  const [ymd, setYmd] = useState(() => hoyYmdNogales());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (!puede || !bloqueo) return null;

  const onReactivar = async () => {
    if (busy) return;
    const uid = idDesdeClaveBloqueoBono(bloqueo.clave);
    const emp = (usuarios || []).find((u) => String(u.id) === String(uid));
    const suc = normalizarCodigoTienda(emp?.sucursal_id || bloqueo.sucursalId);
    if (!uid || !suc) {
      setMsg('Falta el empleado o la sucursal.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const res = await reactivarBonoEmpleado(supabase, {
        usuarioId: uid,
        nombre: emp?.nombre || bloqueo.nombre,
        sucursalId: suc,
        vuelveYmd: ymd,
        motivo: 'Reactivación desde lista de faltas',
        autorizadoPor: user?.nombre || '',
        autorizadoPorRol: user?.rol || '',
      });
      if (!res.ok) {
        setMsg(res.error || 'No se pudo reactivar.');
        return;
      }
      if (typeof onHecho === 'function') await onHecho();
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <input
        className="input"
        type="date"
        value={ymd}
        onChange={(e) => setYmd(e.target.value)}
        aria-label={`Fecha de reactivación de ${bloqueo.nombre}`}
        style={{ width: 138, fontSize: '0.75rem', padding: '0.15rem 0.3rem' }}
      />
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || !ymd}
        style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem' }}
        onClick={() => { void onReactivar(); }}
      >
        {busy ? '…' : 'Reactivar'}
      </button>
      {msg ? <span className="muted" style={{ fontSize: '0.7rem' }}>{msg}</span> : null}
    </span>
  );
}
