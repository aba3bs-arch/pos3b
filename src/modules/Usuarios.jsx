import React, { useEffect, useState, useCallback } from 'react';
import { listarTodosLosRoles, normalizarRol, puedeGestionarUsuarios, EVENTO_ROLES } from '../lib/roles.js';
import { ETIQUETA_AREA, PAGADORES_NOMINA } from '../lib/contabilidadConstants.js';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { leerTurnos, leerConfigHorario, esHorarioPersonalizado, resumenHorarioUsuario, EVENTO_TURNOS, nombreTurnoLegible, TURNO_AMBOS_ID, etiquetaTurno } from '../lib/turnos.js';
import { empleadosVisiblesParaTienda, filtrarEmpleadosAdmin } from '../lib/empleadosVisibles.js';
import {
  etiquetaDispositivoUsuario,
  liberarDispositivoUsuario,
  rolExigeDispositivoUnico,
} from '../lib/dispositivoUsuario.js';
import InputPin from '../components/InputPin.jsx';
import { pinEsCubreTurnoDeSucursal } from '../lib/cubreTurnoSync.js';

const emptyForm = (sucursalDefault) => ({
  nombre: '',
  pin: '',
  rol: 'Cajero',
  sucursal_id: normalizarCodigoTienda(sucursalDefault) || 'MAIN',
  nomina_pagador: 'abarrotes',
  turno_id: '',
});

export default function Usuarios({ supabase, actor, sucursal, sucursalesLista, onUsuarioActualizado }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(() => emptyForm(sucursal));
  const [pinsVisibles, setPinsVisibles] = useState(() => new Set());
  const [pinEnEdicion, setPinEnEdicion] = useState(null);
  const [nuevoPinDraft, setNuevoPinDraft] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [editForm, setEditForm] = useState({ nombre: '', rol: 'Cajero', sucursal_id: 'MAIN', nomina_pagador: 'abarrotes' });
  const [filtroSucursal, setFiltroSucursal] = useState('');
  const [turnos, setTurnos] = useState(() => leerTurnos());
  const [configHorario, setConfigHorario] = useState(() => leerConfigHorario());
  const [rolesLista, setRolesLista] = useState(() => listarTodosLosRoles());
  const esPersonalizado = esHorarioPersonalizado(configHorario);

  const esAdmin = puedeGestionarUsuarios(actor?.rol);
  const tiendas = sucursalesLista?.length ? sucursalesLista : ['MAIN'];

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('usuarios').select('*').order('sucursal_id').order('nombre');
    if (error) {
      console.error(error);
      setRows([]);
      return;
    }
    setRows(data || []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setForm((f) => ({ ...f, sucursal_id: normalizarCodigoTienda(sucursal) || f.sucursal_id }));
  }, [sucursal]);

  useEffect(() => {
    const sync = () => {
      setTurnos(leerTurnos());
      setConfigHorario(leerConfigHorario());
      setRolesLista(listarTodosLosRoles());
    };
    window.addEventListener(EVENTO_TURNOS, sync);
    window.addEventListener(EVENTO_ROLES, sync);
    return () => {
      window.removeEventListener(EVENTO_TURNOS, sync);
      window.removeEventListener(EVENTO_ROLES, sync);
    };
  }, []);

  const filas = esAdmin
    ? filtrarEmpleadosAdmin(rows, filtroSucursal)
    : empleadosVisiblesParaTienda(rows, sucursal, actor?.rol);

  const togglePinVisible = (id) => {
    setPinsVisibles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const abrirEdicion = (r) => {
    setEditandoId(r.id);
    setEditForm({
      nombre: r.nombre || '',
      rol: normalizarRol(r.rol),
      sucursal_id: normalizarCodigoTienda(r.sucursal_id) || 'MAIN',
      nomina_pagador: r.nomina_pagador || 'abarrotes',
    });
  };

  const guardarEdicion = async () => {
    if (!supabase || !esAdmin || !editandoId) return;
    const nombre = editForm.nombre.trim();
    if (!nombre) return alert('El nombre es obligatorio.');
    const payload = {
      nombre,
      rol: normalizarRol(editForm.rol),
      sucursal_id: normalizarCodigoTienda(editForm.sucursal_id) || 'MAIN',
      nomina_pagador: editForm.nomina_pagador || 'abarrotes',
    };
    const { error } = await supabase.from('usuarios').update(payload).eq('id', editandoId);
    if (error) return alert(error.message);
    if (actor?.id === editandoId) onUsuarioActualizado?.({ ...actor, ...payload });
    setEditandoId(null);
    load();
    alert('Usuario actualizado.');
  };

  const liberarEquipo = async (r) => {
    if (!supabase || !esAdmin || !r?.id) return;
    if (!r.dispositivo_id) return alert('Este usuario no tiene equipo vinculado.');
    if (!confirm(`¿Liberar el equipo vinculado de ${r.nombre}? Podrá entrar desde otra computadora al fijar tienda de nuevo.`)) return;
    const res = await liberarDispositivoUsuario(supabase, r.id);
    if (!res.ok) return alert(res.error);
    load();
    alert('Equipo liberado.');
  };

  const crear = async () => {
    if (!supabase || !esAdmin) return;
    if (!form.nombre.trim() || !String(form.pin).trim()) return alert('Nombre y PIN obligatorios');
    const payload = {
      nombre: form.nombre.trim(),
      pin: String(form.pin).trim(),
      rol: normalizarRol(form.rol),
      sucursal_id: normalizarCodigoTienda(form.sucursal_id) || 'MAIN',
      nomina_pagador: form.nomina_pagador || 'abarrotes',
      turno_id: esPersonalizado ? null : form.turno_id || null,
    };
    const cubre = await pinEsCubreTurnoDeSucursal(supabase, payload.pin, payload.sucursal_id);
    if (cubre.coincide) {
      return alert(
        `Ese PIN es el de cubre turno de ${etiquetaTienda(payload.sucursal_id)}. Elige otro PIN para el empleado fijo.`,
      );
    }
    const { error } = await supabase.from('usuarios').insert([payload]);
    if (error) {
      if (error.code === '23505' || String(error.message).includes('duplicate')) {
        return alert(`Ya existe un usuario con PIN ${payload.pin} en ${payload.sucursal_id}.`);
      }
      if (String(error.message).includes('usuarios_rol_check')) {
        return alert(
          `El rol "${payload.rol}" no está permitido en Supabase. Ejecuta supabase/fix_usuarios_rol_check.sql en el SQL Editor (o vuelve a correr fix_turnos_seguridad.sql).`
        );
      }
      if (String(error.message).includes('sucursal_id')) {
        return alert('Ejecuta supabase/fix_usuarios_sucursal.sql en Supabase para agregar la columna sucursal_id.');
      }
      if (String(error.message).includes('turno_id')) {
        return alert('Ejecuta supabase/fix_turnos.sql en Supabase para agregar la columna turno_id.');
      }
      if (String(error.message).includes('turno_horario')) {
        return alert('Ejecuta supabase/fix_turnos_seguridad.sql en Supabase para agregar la columna turno_horario.');
      }
      return alert(error.message);
    }
    setForm(emptyForm(sucursal));
    load();
  };

  const actualizarSucursal = async (id, nueva) => {
    if (!supabase || !esAdmin) return;
    const sucursal_id = normalizarCodigoTienda(nueva) || 'MAIN';
    const { error } = await supabase.from('usuarios').update({ sucursal_id }).eq('id', id);
    if (error) return alert(error.message);
    if (actor?.id === id) onUsuarioActualizado?.({ ...actor, sucursal_id });
    load();
  };

  const actualizarPagadorNomina = async (id, pagador) => {
    if (!supabase || !esAdmin) return;
    const { error } = await supabase.from('usuarios').update({ nomina_pagador: pagador }).eq('id', id);
    if (error) {
      if (String(error.message).includes('nomina_pagador')) {
        return alert('Ejecuta supabase/fix_nomina_dias_pagador.sql en Supabase.');
      }
      return alert(error.message);
    }
    load();
  };

  const actualizarRol = async (id, rol) => {
    if (!supabase || !esAdmin) return;
    const rolNorm = normalizarRol(rol);
    const { error } = await supabase.from('usuarios').update({ rol: rolNorm }).eq('id', id);
    if (error) return alert(error.message);
    if (actor?.id === id) onUsuarioActualizado?.({ ...actor, rol: rolNorm });
    load();
  };

  const actualizarTurno = async (id, turnoId) => {
    if (!supabase || !esAdmin) return;
    const { error } = await supabase
      .from('usuarios')
      .update({ turno_id: turnoId || null })
      .eq('id', id);
    if (error) {
      if (String(error.message).includes('turno_id')) {
        return alert('Ejecuta supabase/fix_turnos.sql en Supabase.');
      }
      return alert(error.message);
    }
    if (actor?.id === id) onUsuarioActualizado?.({ ...actor, turno_id: turnoId || null });
    load();
  };

  const borrar = async (id) => {
    if (!supabase || !esAdmin || !confirm('¿Eliminar usuario?')) return;
    const { error } = await supabase.from('usuarios').delete().eq('id', id);
    if (error) return alert(error.message);
    load();
  };

  const guardarNuevoPin = async (row, nuevoRaw) => {
    if (!supabase || !esAdmin) return;
    const nuevo = String(nuevoRaw || '').trim();
    if (!nuevo) return alert('Escribe el nuevo PIN');
    const cubre = await pinEsCubreTurnoDeSucursal(supabase, nuevo, row.sucursal_id);
    if (cubre.coincide) {
      return alert(
        `Ese PIN es el de cubre turno de ${etiquetaTienda(row.sucursal_id)}. Elige otro PIN para el empleado fijo.`,
      );
    }
    const { error } = await supabase.from('usuarios').update({ pin: nuevo }).eq('id', row.id);
    if (error) {
      if (error.code === '23505') {
        return alert(`Ese PIN ya está en uso en ${etiquetaTienda(row.sucursal_id)}.`);
      }
      return alert(error.message);
    }
    if (actor?.id === row.id) onUsuarioActualizado?.({ ...actor, pin: nuevo });
    setPinEnEdicion(null);
    setNuevoPinDraft('');
    setPinsVisibles((prev) => {
      const next = new Set(prev);
      next.delete(row.id);
      return next;
    });
    load();
  };

  if (!esAdmin) {
    return (
      <div className="card" style={{ maxWidth: '520px' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Usuarios</h3>
        <p className="muted" style={{ margin: 0 }}>
          Solo un usuario con rol <strong>Administrador</strong> puede ver PIN, dar de alta empleados o cambiar accesos.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Nuevo empleado</h3>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          Cada empleado fijo queda ligado a una <strong>sucursal</strong> y (si es cajero/repartidor) puede vincularse a un equipo.
          El rol <strong>Administrador</strong> no se ancla a sucursal ni dispositivo: su PIN funciona en cualquier tienda o celular.
          {esPersonalizado
            ? ' Con horario personalizado, asigna turnos por día en Configuración → Turnos.'
            : ' Asigna un turno fijo para el corte de caja.'}
        </p>
        <div className="grid-2">
          <input className="input" placeholder="Nombre completo" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <InputPin
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value })}
            placeholder="PIN de acceso"
            autoComplete="new-password"
            style={{ fontSize: '1.05rem', letterSpacing: '0.12em', marginBottom: 0 }}
          />
          <label className="muted">
            {normalizarRol(form.rol) === 'Administrador' ? 'Sucursal de referencia (no restringe el login)' : 'Sucursal asignada'}
            <select className="select" style={{ marginTop: '0.35rem' }} value={form.sucursal_id} onChange={(e) => setForm({ ...form, sucursal_id: e.target.value })}>
              {tiendas.map((s) => (
                <option key={s} value={s}>
                  {etiquetaTienda(s)}
                </option>
              ))}
            </select>
          </label>
          <select className="select" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
            {rolesLista.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {!esPersonalizado && (
            <label className="muted">
              Turno (acceso y corte)
              <select className="select" style={{ marginTop: '0.35rem' }} value={form.turno_id} onChange={(e) => setForm({ ...form, turno_id: e.target.value })}>
                <option value="">Sin turno — solo supervisión</option>
                <option value={TURNO_AMBOS_ID}>{etiquetaTurno(TURNO_AMBOS_ID)}</option>
                {turnos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {nombreTurnoLegible(t)} (E {t.hora_inicio} · S {t.hora_fin})
                  </option>
                ))}
              </select>
              <span className="muted" style={{ display: 'block', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                Cajero diurno solo entra en turno de día; nocturno solo en turno de noche.
              </span>
            </label>
          )}
          <label className="muted">
            Nómina pagada por
            <select className="select" style={{ marginTop: '0.35rem' }} value={form.nomina_pagador} onChange={(e) => setForm({ ...form, nomina_pagador: e.target.value })}>
              {PAGADORES_NOMINA.map((a) => (
                <option key={a} value={a}>
                  {ETIQUETA_AREA[a]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={crear}>
          Añadir empleado
        </button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Equipo registrado</h3>
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Filtrar tienda
            <select className="select" style={{ minWidth: '140px' }} value={filtroSucursal} onChange={(e) => setFiltroSucursal(e.target.value)}>
              <option value="">{esAdmin ? 'Todas las tiendas' : etiquetaTienda(sucursal)}</option>
              {tiendas.map((s) => (
                <option key={s} value={s}>
                  {etiquetaTienda(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Sucursal</th>
                <th>Rol</th>
                <th>Nómina</th>
                {!esPersonalizado ? <th>Turno</th> : <th>Horario</th>}
                <th>Equipo</th>
                <th>PIN</th>
                <th style={{ width: '1%' }} />
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    Sin usuarios. Ejecuta el SQL de sucursal y el seed si es la primera vez.
                  </td>
                </tr>
              ) : (
                filas.map((r) => (
                  <tr key={r.id}>
                    <td>{r.nombre}</td>
                    <td>
                      <select
                        className="select"
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', minWidth: '120px' }}
                        value={normalizarCodigoTienda(r.sucursal_id) || 'MAIN'}
                        onChange={(e) => actualizarSucursal(r.id, e.target.value)}
                      >
                        {tiendas.map((s) => (
                          <option key={s} value={s}>
                            {etiquetaTienda(s)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="select"
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', minWidth: '130px' }}
                        value={normalizarRol(r.rol)}
                        onChange={(e) => actualizarRol(r.id, e.target.value)}
                      >
                        {rolesLista.map((rol) => (
                          <option key={rol} value={rol}>
                            {rol}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="select"
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', minWidth: '110px' }}
                        value={r.nomina_pagador || 'abarrotes'}
                        onChange={(e) => actualizarPagadorNomina(r.id, e.target.value)}
                      >
                        {PAGADORES_NOMINA.map((a) => (
                          <option key={a} value={a}>
                            {ETIQUETA_AREA[a]}
                          </option>
                        ))}
                      </select>
                    </td>
                    {!esPersonalizado && (
                      <td>
                        <select
                          className="select"
                          style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', minWidth: '140px' }}
                          value={r.turno_id || ''}
                          onChange={(e) => actualizarTurno(r.id, e.target.value || null)}
                        >
                          <option value="">—</option>
                          <option value={TURNO_AMBOS_ID}>Ambos turnos</option>
                          {turnos.map((t) => (
                            <option key={t.id} value={t.id}>
                              {nombreTurnoLegible(t)}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    {esPersonalizado && (
                      <td className="muted" style={{ fontSize: '0.82rem' }} colSpan={1}>
                        {resumenHorarioUsuario(r, turnos)}
                      </td>
                    )}
                    <td className="muted" style={{ fontSize: '0.8rem' }}>
                      {rolExigeDispositivoUnico(r.rol) ? etiquetaDispositivoUsuario(r) : '—'}
                    </td>
                    <td>
                      {pinEnEdicion === r.id ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                          <InputPin
                            value={nuevoPinDraft}
                            onChange={(e) => setNuevoPinDraft(e.target.value)}
                            placeholder="Nuevo PIN"
                            autoComplete="new-password"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') guardarNuevoPin(r, nuevoPinDraft);
                            }}
                            style={{ width: '160px', fontSize: '0.95rem', letterSpacing: '0.1em', marginBottom: 0 }}
                          />
                          <button type="button" className="btn btn-primary" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => guardarNuevoPin(r, nuevoPinDraft)}>
                            Guardar
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                            onClick={() => {
                              setPinEnEdicion(null);
                              setNuevoPinDraft('');
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: pinsVisibles.has(r.id) ? '0.05em' : '0.15em' }}>
                          {pinsVisibles.has(r.id) ? String(r.pin ?? '—') : '••••••'}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', justifyContent: 'flex-end' }}>
                        {pinEnEdicion !== r.id && (
                          <>
                            <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => abrirEdicion(r)}>
                              Editar
                            </button>
                            <button type="button" className="btn btn-gold" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => togglePinVisible(r.id)}>
                              {pinsVisibles.has(r.id) ? 'Ocultar' : 'Ver PIN'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                              onClick={() => {
                                setPinEnEdicion(r.id);
                                setNuevoPinDraft('');
                              }}
                            >
                              Cambiar PIN
                            </button>
                            {esAdmin && r.dispositivo_id && rolExigeDispositivoUnico(r.rol) && (
                              <button type="button" className="btn btn-gold" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => liberarEquipo(r)}>
                                Liberar equipo
                              </button>
                            )}
                            <button type="button" className="btn btn-danger" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => borrar(r.id)}>
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editandoId && (
        <div className="card" style={{ borderTop: '4px solid var(--brand-blue)', maxWidth: '520px' }}>
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Editar usuario</h3>
          <div className="grid-2">
            <label className="muted" style={{ gridColumn: '1 / -1' }}>
              Nombre completo
              <input className="input" style={{ marginTop: '0.35rem' }} value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} />
            </label>
            <label className="muted">
              Sucursal
              <select className="select" style={{ marginTop: '0.35rem' }} value={editForm.sucursal_id} onChange={(e) => setEditForm({ ...editForm, sucursal_id: e.target.value })}>
                {tiendas.map((s) => (
                  <option key={s} value={s}>
                    {etiquetaTienda(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              Rol
              <select className="select" style={{ marginTop: '0.35rem' }} value={editForm.rol} onChange={(e) => setEditForm({ ...editForm, rol: e.target.value })}>
                {rolesLista.map((rol) => (
                  <option key={rol} value={rol}>
                    {rol}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              Nómina pagada por
              <select className="select" style={{ marginTop: '0.35rem' }} value={editForm.nomina_pagador} onChange={(e) => setEditForm({ ...editForm, nomina_pagador: e.target.value })}>
                {PAGADORES_NOMINA.map((a) => (
                  <option key={a} value={a}>
                    {ETIQUETA_AREA[a]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-primary" onClick={guardarEdicion}>
              Guardar cambios
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditandoId(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
