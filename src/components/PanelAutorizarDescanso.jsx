import React, { useEffect, useMemo, useState } from 'react';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { resolverTipoEmpleado } from '../lib/empleadosVisibles.js';
import {
  AVISO_FALTA_DESCANSOS_AUT,
  EVENTO_DESCANSOS_AUTORIZADOS,
  autorizarDescanso,
  listarDescansosAutorizados,
  revocarDescansoAutorizado,
} from '../lib/descansosAutorizados.js';
import { normalizarRol } from '../lib/roles.js';
import { hoyYmdNogales } from '../lib/corteCaja.js';
import { usuarioEstaActivo } from '../lib/usuariosAuth.js';

/**
 * Autorizar cambio de descanso para que no cuente como falta en bonos.
 * Visible para Administrador / Gerente.
 */
export default function PanelAutorizarDescanso({
  supabase,
  sucursal,
  user,
  usuarios = [],
  onCambio = null,
}) {
  const rol = normalizarRol(user?.rol);
  const puede = rol === 'Administrador' || rol === 'Gerente';
  const suc = normalizarCodigoTienda(sucursal);

  const plantilla = useMemo(() => (
    (usuarios || [])
      .filter((u) => {
        if (!usuarioEstaActivo(u)) return false;
        if (normalizarRol(u.rol) === 'Administrador') return false;
        if (resolverTipoEmpleado(u) !== 'tienda') return false;
        return normalizarCodigoTienda(u.sucursal_id) === suc;
      })
      .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
  ), [usuarios, suc]);

  const [usuarioId, setUsuarioId] = useState('');
  const [fecha, setFecha] = useState(() => hoyYmdNogales());
  const [motivo, setMotivo] = useState('Cambio de descanso autorizado');
  const [lista, setLista] = useState([]);
  const [aviso, setAviso] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const cargar = async () => {
    if (!supabase || !suc) return;
    const desde = new Date();
    desde.setDate(desde.getDate() - 21);
    const y = desde.getFullYear();
    const m = String(desde.getMonth() + 1).padStart(2, '0');
    const d = String(desde.getDate()).padStart(2, '0');
    const res = await listarDescansosAutorizados(supabase, {
      sucursalId: suc,
      desdeYmd: `${y}-${m}-${d}`,
      hastaYmd: hoyYmdNogales(),
      limit: 100,
    });
    if (res.faltaTabla) setAviso(AVISO_FALTA_DESCANSOS_AUT);
    else setAviso(res.error || '');
    setLista(res.data || []);
  };

  useEffect(() => {
    if (!puede || !supabase || !suc) return undefined;
    void cargar();
    const onEvt = () => { void cargar(); };
    window.addEventListener(EVENTO_DESCANSOS_AUTORIZADOS, onEvt);
    return () => window.removeEventListener(EVENTO_DESCANSOS_AUTORIZADOS, onEvt);
  }, [puede, supabase, suc]);

  useEffect(() => {
    if (!usuarioId && plantilla.length) setUsuarioId(String(plantilla[0].id));
  }, [plantilla, usuarioId]);

  if (!puede) return null;

  const onAutorizar = async (e) => {
    e.preventDefault();
    if (busy) return;
    const emp = plantilla.find((u) => String(u.id) === String(usuarioId));
    if (!emp) {
      setMsg('Elige un empleado de tienda.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const res = await autorizarDescanso(supabase, {
        usuarioId: emp.id,
        nombre: emp.nombre,
        sucursalId: suc,
        fechaYmd: fecha,
        motivo,
        autorizadoPor: user?.nombre || '',
        autorizadoPorRol: user?.rol || '',
      });
      if (!res.ok) {
        setMsg(res.error || 'No se pudo autorizar.');
        if (res.faltaTabla) setAviso(AVISO_FALTA_DESCANSOS_AUT);
        return;
      }
      setMsg(`Descanso autorizado: ${emp.nombre} · ${fecha}. No cuenta como falta.`);
      await cargar();
      if (typeof onCambio === 'function') await onCambio();
    } finally {
      setBusy(false);
    }
  };

  const onRevocar = async (row) => {
    if (busy || !row?.id) return;
    if (!window.confirm(`¿Quitar autorización de descanso de ${row.nombre || 'empleado'} el ${row.fecha}?`)) return;
    setBusy(true);
    try {
      const res = await revocarDescansoAutorizado(supabase, row.id);
      if (!res.ok) {
        setMsg(res.error || 'No se pudo revocar.');
        return;
      }
      setMsg('Autorización eliminada.');
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
        border: '1px solid rgba(59,105,181,0.25)',
        background: 'rgba(59,105,181,0.04)',
      }}
    >
      <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.88rem', color: 'var(--brand-blue-dark)' }}>
        Autorizar cambio de descanso
      </h4>
      <p className="muted" style={{ margin: '0 0 0.55rem', fontSize: '0.74rem' }}>
        Los empleados trabajan 6 días y descansan 1. Ese día no es falta.
        Si cambian el descanso, autorízalo aquí (o muévelo en Checador → Plan horario)
        para que el sistema no lo tome como falta de bono.
        {' '}Tienda: <strong>{etiquetaTienda(suc)}</strong>.
      </p>

      {aviso ? (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: '#b45309' }}>{aviso}</p>
      ) : null}

      <form
        onSubmit={onAutorizar}
        style={{
          display: 'grid',
          gap: '0.45rem',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          alignItems: 'end',
        }}
      >
        <label className="muted" style={{ fontSize: '0.75rem' }}>
          Empleado
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
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))
            )}
          </select>
        </label>
        <label className="muted" style={{ fontSize: '0.75rem' }}>
          Fecha descanso
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
            placeholder="Cambio de descanso autorizado"
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !plantilla.length}
          style={{ fontSize: '0.8rem' }}
        >
          {busy ? '…' : 'Autorizar'}
        </button>
      </form>

      {msg ? (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>{msg}</p>
      ) : null}

      {lista.length > 0 ? (
        <ul style={{ margin: '0.55rem 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: '0.25rem' }}>
          {lista.slice(0, 8).map((r) => (
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
                <span className="muted" style={{ marginLeft: 6 }}>{r.fecha}</span>
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
