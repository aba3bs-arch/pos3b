import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { listarTodosLosRoles, normalizarRol, puedeGestionarUsuarios, EVENTO_ROLES } from '../lib/roles.js';
import { ETIQUETA_AREA, PAGADORES_NOMINA } from '../lib/contabilidadConstants.js';
import { etiquetaTienda, listarSucursales, normalizarCodigoTienda, esCentralAdmin } from '../constants/sucursales.js';
import { leerTurnos, leerConfigHorario, esHorarioPersonalizado, resumenHorarioUsuario, EVENTO_TURNOS, nombreTurnoLegible, TURNO_AMBOS_ID, etiquetaTurno } from '../lib/turnos.js';
import {
  agruparEmpleadosCatalogo,
  empleadosVisiblesParaTienda,
  filtrarEmpleadosAdmin,
  MAX_EMPLEADOS_POR_TIENDA,
  puedeAgregarEmpleadoTienda,
  resolverTipoEmpleado,
} from '../lib/empleadosVisibles.js';
import {
  etiquetaDispositivoUsuario,
  liberarDispositivoUsuario,
  rolExigeDispositivoUnico,
} from '../lib/dispositivoUsuario.js';
import InputPin from '../components/InputPin.jsx';
import { pinEsCubreTurnoDeSucursal } from '../lib/cubreTurnoSync.js';
import {
  MOTIVOS_BAJA_RH,
  asegurarExpedienteRhDesdeUsuario,
  consultarRestriccionReingresoRh,
  darDeBajaUsuarioPosYRh,
  reactivarUsuarioPosYRh,
} from '../lib/rhAba3b.js';
import FormularioBajaEmpleado from '../components/FormularioBajaEmpleado.jsx';

const emptyForm = (sucursalDefault) => ({
  nombre: '',
  pin: '',
  rol: 'Cajero',
  tipo_empleado: 'tienda',
  sucursal_id: normalizarCodigoTienda(sucursalDefault) || listarSucursales().filter((s) => !esCentralAdmin(s))[0] || 'MAIN',
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
  const [editForm, setEditForm] = useState({
    nombre: '',
    rol: 'Cajero',
    tipo_empleado: 'tienda',
    sucursal_id: 'MAIN',
    nomina_pagador: 'abarrotes',
  });
  const [filtroSucursal, setFiltroSucursal] = useState('');
  const [qEquipo, setQEquipo] = useState('');
  const [bajaPickId, setBajaPickId] = useState('');
  const [reingresoPickId, setReingresoPickId] = useState('');
  const [mostrarBajas, setMostrarBajas] = useState(false);
  const [bajaTarget, setBajaTarget] = useState(null);
  const [bajaForm, setBajaForm] = useState({
    motivo_baja: MOTIVOS_BAJA_RH[0],
    fecha_baja: new Date().toISOString().slice(0, 10),
    notas_baja: '',
    recontratable: true,
    motivo_no_recontratable: '',
  });
  const [reactivarTarget, setReactivarTarget] = useState(null);
  const [pinReingreso, setPinReingreso] = useState('');
  const [trabajandoBaja, setTrabajandoBaja] = useState(false);
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

  const qEquipoNorm = qEquipo.trim().toLowerCase();
  const filas = (esAdmin
    ? filtrarEmpleadosAdmin(rows, filtroSucursal)
    : empleadosVisiblesParaTienda(rows, sucursal, actor?.rol)
  )
    .filter((r) => (mostrarBajas ? true : r.activo !== false))
    .filter((r) => !qEquipoNorm || String(r.nombre || '').toLowerCase().includes(qEquipoNorm));

  const activosParaBaja = useMemo(
    () => rows
      .filter((r) => r.activo !== false && String(r.id) !== String(actor?.id || ''))
      .slice()
      .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')),
    [rows, actor?.id],
  );

  const bajasParaReingreso = useMemo(
    () => rows
      .filter((r) => r.activo === false)
      .slice()
      .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')),
    [rows],
  );

  const catalogoGrupos = useMemo(
    () => agruparEmpleadosCatalogo(filas, { incluirBajas: mostrarBajas }),
    [filas, mostrarBajas],
  );

  /** Tiendas de venta + CEDIS (almacén). MAIN solo vía tipo Indirecto. */
  const tiendasAsignables = listarSucursales().filter((s) => !esCentralAdmin(s));

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
    const tipo = resolverTipoEmpleado(r);
    setEditForm({
      nombre: r.nombre || '',
      rol: normalizarRol(r.rol),
      tipo_empleado: tipo,
      sucursal_id: tipo === 'indirecto' ? 'MAIN' : (normalizarCodigoTienda(r.sucursal_id) || tiendasAsignables[0] || 'CEDIS'),
      nomina_pagador: r.nomina_pagador || 'abarrotes',
    });
  };

  const guardarEdicion = async () => {
    if (!supabase || !esAdmin || !editandoId) return;
    const nombre = editForm.nombre.trim();
    if (!nombre) return alert('El nombre es obligatorio.');
    const tipo = editForm.tipo_empleado === 'indirecto' ? 'indirecto' : 'tienda';
    const sucursal_id = tipo === 'indirecto'
      ? 'MAIN'
      : (normalizarCodigoTienda(editForm.sucursal_id) || tiendasAsignables[0] || 'CEDIS');
    if (tipo === 'tienda' && normalizarRol(editForm.rol) !== 'Administrador') {
      const cupo = puedeAgregarEmpleadoTienda(rows, sucursal_id, { excluirId: editandoId });
      if (!cupo.ok) return alert(cupo.error);
    }
    const payload = {
      nombre,
      rol: normalizarRol(editForm.rol),
      tipo_empleado: tipo,
      sucursal_id,
      nomina_pagador: editForm.nomina_pagador || 'abarrotes',
    };
    const { error } = await supabase.from('usuarios').update(payload).eq('id', editandoId);
    if (error) {
      if (String(error.message).includes('tipo_empleado')) {
        return alert('Ejecuta supabase/fix_usuarios_tipo_empleado.sql en Supabase.');
      }
      return alert(error.message);
    }
    if (actor?.id === editandoId) onUsuarioActualizado?.({ ...actor, ...payload });
    setEditandoId(null);
    load();
    alert('Usuario actualizado.');
  };

  const liberarEquipo = async (r) => {
    if (!supabase || !esAdmin || !r?.id) return;
    const n = [r.dispositivo_id, r.dispositivo_id_2].filter(Boolean).length;
    if (!n) return alert('Este usuario no tiene equipo vinculado.');
    if (
      !confirm(
        `¿Liberar ${n === 1 ? 'el equipo vinculado' : 'los 2 equipos vinculados'} de ${r.nombre}? Podrá anclar de nuevo al entrar en una tienda fijada.`,
      )
    ) {
      return;
    }
    const res = await liberarDispositivoUsuario(supabase, r.id);
    if (!res.ok) return alert(res.error);
    load();
    alert(n === 1 ? 'Equipo liberado.' : 'Equipos liberados.');
  };

  const crear = async () => {
    if (!supabase || !esAdmin) return;
    if (!form.nombre.trim() || !String(form.pin).trim()) return alert('Nombre y PIN obligatorios');
    const tipo = form.tipo_empleado === 'indirecto' ? 'indirecto' : 'tienda';
    const sucursal_id = tipo === 'indirecto'
      ? 'MAIN'
      : (normalizarCodigoTienda(form.sucursal_id) || tiendasAsignables[0] || 'CEDIS');
    if (tipo === 'tienda' && normalizarRol(form.rol) !== 'Administrador') {
      const cupo = puedeAgregarEmpleadoTienda(rows, sucursal_id);
      if (!cupo.ok) return alert(cupo.error);
    }
    const payload = {
      nombre: form.nombre.trim(),
      pin: String(form.pin).trim(),
      rol: normalizarRol(form.rol),
      tipo_empleado: tipo,
      sucursal_id,
      nomina_pagador: form.nomina_pagador || 'abarrotes',
      turno_id: esPersonalizado ? null : form.turno_id || null,
      activo: true,
    };
    const cubre = await pinEsCubreTurnoDeSucursal(supabase, payload.pin, payload.sucursal_id);
    if (cubre.coincide) {
      return alert(
        `Ese PIN es el de cubre turno de ${etiquetaTienda(payload.sucursal_id)}. Elige otro PIN para el empleado fijo.`,
      );
    }
    const { data, error } = await supabase.from('usuarios').insert([payload]).select('*').single();
    if (error) {
      if (error.code === '23505' || String(error.message).includes('duplicate')) {
        return alert(`Ya existe un usuario con PIN ${payload.pin} en ${payload.sucursal_id}.`);
      }
      if (String(error.message).includes('tipo_empleado')) {
        return alert('Ejecuta supabase/fix_usuarios_tipo_empleado.sql en Supabase.');
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
    const creado = data?.id
      ? data
      : (await supabase.from('usuarios').select('*').eq('pin', payload.pin).eq('sucursal_id', payload.sucursal_id).maybeSingle()).data;
    const rh = creado?.id
      ? await asegurarExpedienteRhDesdeUsuario(supabase, creado, { user: actor, estadoInicial: 'activo' })
      : { ok: false, error: 'Usuario creado; abre RH ABA3B si no aparece el expediente.' };
    setForm(emptyForm(sucursal));
    load();
    const extraRh = rh?.ok
      ? ' Expediente creado en RH ABA3B.'
      : (rh?.error ? ` RH: ${rh.error}` : '');
    alert(`${payload.nombre} dado de alta. Ya puede entrar con su PIN.${extraRh}`);
  };

  const actualizarTipoEmpleado = async (id, tipoRaw) => {
    if (!supabase || !esAdmin) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const tipo = tipoRaw === 'indirecto' ? 'indirecto' : 'tienda';
    const sucursal_id = tipo === 'indirecto'
      ? 'MAIN'
      : (normalizarCodigoTienda(row.sucursal_id) === 'MAIN'
        ? (tiendasAsignables[0] || 'CEDIS')
        : normalizarCodigoTienda(row.sucursal_id));
    if (tipo === 'tienda' && normalizarRol(row.rol) !== 'Administrador' && row.activo !== false) {
      const cupo = puedeAgregarEmpleadoTienda(rows, sucursal_id, { excluirId: id });
      if (!cupo.ok) return alert(cupo.error);
    }
    const { error } = await supabase.from('usuarios').update({ tipo_empleado: tipo, sucursal_id }).eq('id', id);
    if (error) {
      if (String(error.message).includes('tipo_empleado')) {
        return alert('Ejecuta supabase/fix_usuarios_tipo_empleado.sql en Supabase.');
      }
      return alert(error.message);
    }
    if (actor?.id === id) onUsuarioActualizado?.({ ...actor, tipo_empleado: tipo, sucursal_id });
    load();
  };

  const actualizarSucursal = async (id, nueva) => {
    if (!supabase || !esAdmin) return;
    const row = rows.find((r) => r.id === id);
    const tipo = resolverTipoEmpleado(row || {});
    if (tipo === 'indirecto') {
      return alert('Los empleados indirectos / MAIN no cambian de sucursal (aparecen en todas).');
    }
    const sucursal_id = normalizarCodigoTienda(nueva) || 'MAIN';
    if (sucursal_id === 'MAIN') {
      return alert('Para MAIN usa el tipo «Indirecto / MAIN».');
    }
    if (row && row.activo !== false && normalizarRol(row.rol) !== 'Administrador') {
      const cupo = puedeAgregarEmpleadoTienda(rows, sucursal_id, { excluirId: id });
      if (!cupo.ok) return alert(cupo.error);
    }
    const { error } = await supabase.from('usuarios').update({ sucursal_id, tipo_empleado: 'tienda' }).eq('id', id);
    if (error) return alert(error.message);
    if (actor?.id === id) onUsuarioActualizado?.({ ...actor, sucursal_id, tipo_empleado: 'tienda' });
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

  const abrirBaja = (r) => {
    if (!supabase || !esAdmin || !r?.id) return;
    if (actor?.id === r.id) return alert('No puedes darte de baja a ti mismo.');
    setBajaTarget(r);
    setBajaPickId(String(r.id));
    setBajaForm({
      motivo_baja: MOTIVOS_BAJA_RH[0],
      fecha_baja: new Date().toISOString().slice(0, 10),
      notas_baja: '',
      recontratable: true,
      motivo_no_recontratable: '',
    });
  };

  const continuarBajaDesdeSelector = () => {
    const r = rows.find((x) => String(x.id) === String(bajaPickId));
    if (!r) return alert('Elige el empleado de la lista.');
    abrirBaja(r);
  };

  const confirmarBaja = async () => {
    if (!supabase || !esAdmin || !bajaTarget?.id) return;
    if (!bajaForm.recontratable && !String(bajaForm.motivo_no_recontratable || '').trim()) {
      return alert('Si no es recontratable, indica el motivo.');
    }
    setTrabajandoBaja(true);
    const res = await darDeBajaUsuarioPosYRh(supabase, bajaTarget, bajaForm, { user: actor });
    setTrabajandoBaja(false);
    if (!res.ok) return alert(res.error);
    setBajaTarget(null);
    setBajaPickId('');
    load();
    alert(res.mensaje || `${bajaTarget.nombre} quedó dado de baja.`);
  };

  const abrirReactivar = async (r) => {
    if (!supabase || !esAdmin || !r?.id) return;
    if (resolverTipoEmpleado(r) === 'tienda' && normalizarRol(r.rol) !== 'Administrador') {
      const cupo = puedeAgregarEmpleadoTienda(rows, r.sucursal_id, { excluirId: r.id });
      if (!cupo.ok) return alert(cupo.error);
    }
    setMostrarBajas(true);
    setReingresoPickId(String(r.id));
    const rest = await consultarRestriccionReingresoRh(supabase, r);
    if (!rest.ok) return alert(rest.error);
    if (rest.requierePinPrincipal) {
      setReactivarTarget(r);
      setPinReingreso('');
      return;
    }
    if (!confirm(`¿Reingresar alta de ${r.nombre}?\n\nVolverá a nómina, turnos y Usuarios. Podrá entrar con su PIN.`)) return;
    setTrabajandoBaja(true);
    const res = await reactivarUsuarioPosYRh(supabase, r, {}, { user: actor });
    setTrabajandoBaja(false);
    if (!res.ok) return alert(res.error);
    setReingresoPickId('');
    load();
    alert(res.mensaje || `${r.nombre} reingresado.`);
  };

  const continuarReingresoDesdeSelector = () => {
    const r = rows.find((x) => String(x.id) === String(reingresoPickId));
    if (!r) return alert('Elige el empleado dado de baja.');
    if (r.activo !== false) return alert('Ese empleado ya está activo. Para uno nuevo usa el alta de arriba.');
    void abrirReactivar(r);
  };

  const confirmarReingresoConPin = async () => {
    if (!reactivarTarget) return;
    setTrabajandoBaja(true);
    const res = await reactivarUsuarioPosYRh(
      supabase,
      reactivarTarget,
      { pinAdminPrincipal: pinReingreso },
      { user: actor },
    );
    setTrabajandoBaja(false);
    if (!res.ok) return alert(res.error);
    setReactivarTarget(null);
    setPinReingreso('');
    setReingresoPickId('');
    load();
    alert(res.mensaje || `${reactivarTarget.nombre} reingresado.`);
  };

  const borrar = async (id) => {
    if (!supabase || !esAdmin || !confirm('¿Eliminar usuario de forma permanente?\n\nPreferible: usa «Dar de baja» para conservar historial.')) return;
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

  const renderFilaEmpleado = (r, { soloMain = false } = {}) => (
    <tr key={r.id} style={r.activo === false ? { opacity: 0.72 } : undefined}>
      <td>
        {r.nombre}
        {r.activo === false && (
          <span className="badge" style={{ marginLeft: '0.35rem', background: '#fee2e2', color: '#991b1b' }}>
            Baja
          </span>
        )}
      </td>
      <td>
        <select
          className="select"
          style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', minWidth: '130px' }}
          value={resolverTipoEmpleado(r)}
          onChange={(e) => actualizarTipoEmpleado(r.id, e.target.value)}
        >
          <option value="tienda">De tienda</option>
          <option value="indirecto">Indirecto / MAIN</option>
        </select>
      </td>
      <td>
        {soloMain ? (
          <span className="muted">{etiquetaTienda('MAIN')}</span>
        ) : (
          <select
            className="select"
            style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', minWidth: '120px' }}
            value={normalizarCodigoTienda(r.sucursal_id) || 'MAIN'}
            onChange={(e) => actualizarSucursal(r.id, e.target.value)}
          >
            {tiendasAsignables.map((s) => (
              <option key={s} value={s}>{etiquetaTienda(s)}</option>
            ))}
          </select>
        )}
      </td>
      <td>
        <select
          className="select"
          style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', minWidth: '130px' }}
          value={normalizarRol(r.rol)}
          onChange={(e) => actualizarRol(r.id, e.target.value)}
        >
          {rolesLista.map((rol) => (
            <option key={rol} value={rol}>{rol}</option>
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
            <option key={a} value={a}>{ETIQUETA_AREA[a]}</option>
          ))}
        </select>
      </td>
      {!esPersonalizado ? (
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
              <option key={t.id} value={t.id}>{nombreTurnoLegible(t)}</option>
            ))}
          </select>
        </td>
      ) : (
        <td className="muted" style={{ fontSize: '0.82rem' }}>{resumenHorarioUsuario(r, turnos)}</td>
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
              autoComplete="off"
              name={`usuario-edit-pin-${r.id}`}
              onKeyDown={(e) => { if (e.key === 'Enter') guardarNuevoPin(r, nuevoPinDraft); }}
              style={{ width: '160px', fontSize: '0.95rem', letterSpacing: '0.1em', marginBottom: 0 }}
            />
            <button type="button" className="btn btn-primary" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => guardarNuevoPin(r, nuevoPinDraft)}>Guardar</button>
            <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => { setPinEnEdicion(null); setNuevoPinDraft(''); }}>Cancelar</button>
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
              <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => abrirEdicion(r)}>Editar</button>
              <button type="button" className="btn btn-gold" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => togglePinVisible(r.id)}>{pinsVisibles.has(r.id) ? 'Ocultar' : 'Ver PIN'}</button>
              <button type="button" className="btn btn-primary" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => { setPinEnEdicion(r.id); setNuevoPinDraft(''); }}>Cambiar PIN</button>
              {esAdmin && (r.dispositivo_id || r.dispositivo_id_2) && rolExigeDispositivoUnico(r.rol) && (
                <button type="button" className="btn btn-gold" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => liberarEquipo(r)}>
                  Liberar equipo{r.dispositivo_id_2 ? 's' : ''}
                </button>
              )}
              {r.activo === false ? (
                <button type="button" className="btn btn-success" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => abrirReactivar(r)}>Reingresar alta</button>
              ) : (
                <button type="button" className="btn btn-danger" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => abrirBaja(r)}>Dar de baja</button>
              )}
              {mostrarBajas && r.activo === false && (
                <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => borrar(r.id)}>Eliminar</button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );

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
      {bajaTarget && (
        <FormularioBajaEmpleado
          nombre={bajaTarget.nombre}
          form={bajaForm}
          setForm={setBajaForm}
          onConfirm={confirmarBaja}
          onCancel={() => { setBajaTarget(null); setBajaPickId(''); }}
          trabajando={trabajandoBaja}
        >
          <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
            Dejará de aparecer en nómina, en empleados por turno (Configuración) y en esta lista.
            La baja se registra en <strong>RH ABA3B</strong>. Si es recontratable, podrás reingresar su alta después.
          </p>
        </FormularioBajaEmpleado>
      )}

      {reactivarTarget && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)' }}>
          <h3 style={{ margin: '0 0 0.5rem' }}>Reingreso · {reactivarTarget.nombre}</h3>
          <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
            Este empleado está marcado <strong>no recontratable</strong> en RH ABA3B.
            Captura el PIN del <strong>administrador principal</strong> para volver a darlo de alta.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
            <div>
              <label className="muted" style={{ fontSize: '0.78rem' }}>PIN del administrador principal</label>
              <InputPin value={pinReingreso} onChange={(e) => setPinReingreso(e.target.value)} />
            </div>
            <button type="button" className="btn btn-primary" disabled={trabajandoBaja || !pinReingreso} onClick={confirmarReingresoConPin}>
              {trabajandoBaja ? 'Validando…' : 'Reingresar alta'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setReactivarTarget(null); setPinReingreso(''); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ borderLeft: '4px solid var(--brand-green, #15803d)' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Cómo dar de alta un empleado</h3>
        <ol style={{ margin: '0 0 0.85rem', paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: 1.55 }}>
          <li>Llena <strong>nombre</strong>, <strong>PIN</strong>, tipo, sucursal, rol y turno.</li>
          <li>Pulsa <strong>Añadir empleado</strong>. Ya puede entrar al POS con ese PIN.</li>
          <li>El expediente queda también en <strong>RH ABA3B</strong>.</li>
        </ol>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          Catálogo: <strong>Empleados por tienda</strong> (máx. {MAX_EMPLEADOS_POR_TIENDA} activos por sucursal) e{' '}
          <strong>Indirectos / MAIN</strong> (aparecen en todas las sucursales y en cortes Virtual, Abarrotes y Garage).
          {esPersonalizado
            ? ' Con horario personalizado, asigna turnos por día en Configuración → Turnos.'
            : ' Asigna un turno fijo para el corte de caja.'}
          {' '}Si ya había trabajado aquí, no lo des de alta otra vez: usa <strong>reingreso</strong> abajo.
        </p>
        <div className="grid-2">
          <input className="input" placeholder="Nombre completo" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <InputPin
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value })}
            placeholder="PIN de acceso"
            autoComplete="off"
            name="usuario-nuevo-pin"
            style={{ fontSize: '1.05rem', letterSpacing: '0.12em', marginBottom: 0 }}
          />
          <label className="muted">
            Tipo / subcategoría
            <select
              className="select"
              style={{ marginTop: '0.35rem' }}
              value={form.tipo_empleado}
              onChange={(e) => {
                const tipo_empleado = e.target.value === 'indirecto' ? 'indirecto' : 'tienda';
                setForm({
                  ...form,
                  tipo_empleado,
                  sucursal_id: tipo_empleado === 'indirecto' ? 'MAIN' : (tiendasAsignables.includes(form.sucursal_id) ? form.sucursal_id : (tiendasAsignables[0] || 'CEDIS')),
                });
              }}
            >
              <option value="tienda">Empleado de tienda (máx. {MAX_EMPLEADOS_POR_TIENDA})</option>
              <option value="indirecto">Indirecto / MAIN (todas las sucursales)</option>
            </select>
          </label>
          <label className="muted">
            {form.tipo_empleado === 'indirecto' || normalizarRol(form.rol) === 'Administrador'
              ? 'Sucursal (MAIN para indirectos)'
              : 'Sucursal asignada'}
            <select
              className="select"
              style={{ marginTop: '0.35rem' }}
              value={form.tipo_empleado === 'indirecto' ? 'MAIN' : form.sucursal_id}
              disabled={form.tipo_empleado === 'indirecto'}
              onChange={(e) => setForm({ ...form, sucursal_id: e.target.value })}
            >
              {(form.tipo_empleado === 'indirecto' ? ['MAIN'] : tiendasAsignables).map((s) => (
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

      <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)' }}>
        <h3 style={{ margin: '0 0 0.5rem' }}>Cómo reingresar un empleado</h3>
        <ol style={{ margin: '0 0 0.85rem', paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: 1.55 }}>
          <li>Elige a alguien ya dado de baja (no crees un usuario nuevo).</li>
          <li>Pulsa <strong>Reingresar alta</strong>. Vuelve a nómina, turnos y esta lista.</li>
          <li>Si está marcado <strong>no recontratable</strong>, pide el PIN del administrador principal.</li>
        </ol>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
          <label className="muted" style={{ flex: '1 1 220px', fontSize: '0.8rem' }}>
            Empleado dado de baja
            <select
              className="select"
              style={{ marginTop: '0.35rem' }}
              value={reingresoPickId}
              onChange={(e) => setReingresoPickId(e.target.value)}
            >
              <option value="">— Elige nombre —</option>
              {bajasParaReingreso.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre} · {etiquetaTienda(r.sucursal_id)} · {normalizarRol(r.rol)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-primary" disabled={trabajandoBaja} onClick={continuarReingresoDesdeSelector}>
            Reingresar alta
          </button>
        </div>
        <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.8rem' }}>
          {bajasParaReingreso.length === 0
            ? 'No hay empleados dados de baja. El reingreso es solo para quien ya tuvo baja.'
            : 'También: marca Ver dados de baja y pulsa Reingresar alta en su fila. Gerente: RH ABA3B → Inactivos / bajas.'}
        </p>
      </div>

      {!bajaTarget && (
        <div className="card" style={{ borderLeft: '4px solid var(--danger)' }}>
          <h3 style={{ margin: '0 0 0.5rem' }}>Cómo dar de baja un empleado</h3>
          <ol style={{ margin: '0 0 0.85rem', paddingLeft: '1.25rem', fontSize: '0.9rem', lineHeight: 1.55 }}>
            <li>Elige el nombre aquí, o en <strong>Equipo registrado</strong> pulsa el botón rojo <strong>Dar de baja</strong>.</li>
            <li>Indica <strong>motivo</strong>, <strong>fecha</strong> y si <strong>puede reingresar</strong>.</li>
            <li>Pulsa <strong>Confirmar baja</strong>. El PIN deja de funcionar; sale de nómina y de turnos.</li>
          </ol>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
            <label className="muted" style={{ flex: '1 1 220px', fontSize: '0.8rem' }}>
              Empleado activo
              <select
                className="select"
                style={{ marginTop: '0.35rem' }}
                value={bajaPickId}
                onChange={(e) => setBajaPickId(e.target.value)}
              >
                <option value="">— Elige nombre —</option>
                {activosParaBaja.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre} · {etiquetaTienda(r.sucursal_id)} · {normalizarRol(r.rol)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-danger" onClick={continuarBajaDesdeSelector}>
              Dar de baja
            </button>
          </div>
          <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.8rem' }}>
            Gerente también puede dar de baja en <strong>RH ABA3B → Activos → Dar de baja</strong>.
          </p>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Equipo registrado</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <input
              className="input"
              placeholder="Buscar por nombre…"
              value={qEquipo}
              onChange={(e) => setQEquipo(e.target.value)}
              style={{ minWidth: '180px', maxWidth: '240px', marginBottom: 0 }}
            />
            <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={mostrarBajas} onChange={(e) => setMostrarBajas(e.target.checked)} />
              Ver dados de baja
            </label>
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
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
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
                  <td colSpan={9} className="muted">
                    {qEquipoNorm
                      ? 'Ningún empleado coincide con la búsqueda.'
                      : 'Sin usuarios. Ejecuta el SQL de sucursal y el seed si es la primera vez.'}
                  </td>
                </tr>
              ) : (
                <>
                  <tr>
                    <td colSpan={9} style={{ background: 'var(--bg-muted, #f3f4f6)', fontWeight: 700, fontSize: '0.85rem' }}>
                      Empleados por tienda (máx. {MAX_EMPLEADOS_POR_TIENDA} activos · solo esa sucursal)
                    </td>
                  </tr>
                  {catalogoGrupos.porTienda.map((g) => (
                    <React.Fragment key={`grp-tienda-${g.sucursalId}`}>
                      <tr>
                        <td colSpan={9} className="muted" style={{ fontSize: '0.8rem', paddingTop: '0.65rem' }}>
                          {etiquetaTienda(g.sucursalId)} · {g.empleados.filter((e) => e.activo !== false).length}/{MAX_EMPLEADOS_POR_TIENDA}
                        </td>
                      </tr>
                      {g.empleados.length
                        ? g.empleados.map((r) => renderFilaEmpleado(r))
                        : (
                          <tr>
                            <td colSpan={9} className="muted" style={{ fontSize: '0.8rem' }}>Sin empleados de tienda</td>
                          </tr>
                        )}
                    </React.Fragment>
                  ))}
                  <tr>
                    <td colSpan={9} style={{ background: 'var(--bg-muted, #f3f4f6)', fontWeight: 700, fontSize: '0.85rem' }}>
                      Indirectos / MAIN (aparecen en todas las sucursales y cortes)
                    </td>
                  </tr>
                  {catalogoGrupos.indirectos.length
                    ? catalogoGrupos.indirectos.map((r) => renderFilaEmpleado(r, { soloMain: true }))
                    : (
                      <tr>
                        <td colSpan={9} className="muted" style={{ fontSize: '0.8rem' }}>Sin empleados indirectos / MAIN</td>
                      </tr>
                    )}
                  {filas.filter((r) => normalizarRol(r.rol) === 'Administrador').length > 0 && (
                    <>
                      <tr>
                        <td colSpan={9} style={{ background: 'var(--bg-muted, #f3f4f6)', fontWeight: 700, fontSize: '0.85rem' }}>
                          Administradores
                        </td>
                      </tr>
                      {filas.filter((r) => normalizarRol(r.rol) === 'Administrador').map((r) => renderFilaEmpleado(r))}
                    </>
                  )}
                </>
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
              Tipo / subcategoría
              <select
                className="select"
                style={{ marginTop: '0.35rem' }}
                value={editForm.tipo_empleado}
                onChange={(e) => {
                  const tipo_empleado = e.target.value === 'indirecto' ? 'indirecto' : 'tienda';
                  setEditForm({
                    ...editForm,
                    tipo_empleado,
                    sucursal_id: tipo_empleado === 'indirecto'
                      ? 'MAIN'
                      : (tiendasAsignables.includes(editForm.sucursal_id) ? editForm.sucursal_id : (tiendasAsignables[0] || 'CEDIS')),
                  });
                }}
              >
                <option value="tienda">Empleado de tienda (máx. {MAX_EMPLEADOS_POR_TIENDA})</option>
                <option value="indirecto">Indirecto / MAIN (todas las sucursales)</option>
              </select>
            </label>
            <label className="muted">
              {editForm.tipo_empleado === 'indirecto' ? 'Sucursal (MAIN)' : 'Sucursal asignada'}
              <select
                className="select"
                style={{ marginTop: '0.35rem' }}
                value={editForm.tipo_empleado === 'indirecto' ? 'MAIN' : editForm.sucursal_id}
                disabled={editForm.tipo_empleado === 'indirecto'}
                onChange={(e) => setEditForm({ ...editForm, sucursal_id: e.target.value })}
              >
                {(editForm.tipo_empleado === 'indirecto' ? ['MAIN'] : tiendasAsignables).map((s) => (
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
