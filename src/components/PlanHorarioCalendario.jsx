import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { esCentralAdmin, etiquetaTienda } from '../constants/sucursales.js';
import { listarEmpleadosRh } from '../lib/rhAba3b.js';
import { leerTurnos } from '../lib/turnos.js';
import { normalizarRol } from '../lib/roles.js';
import {
  COLORES_PLAN_HORARIO,
  DIAS_PLAN_HORARIO,
  agruparFilasPorTienda,
  asignarDescansoConCt,
  asignarDescansoConCtSemana,
  celdasEfectivasFila,
  claveLunesDesdeOffset,
  colorFondoCelda,
  etiquetaFechaCorta,
  fechasSemanaPlan,
  formatoBloqueHorario,
  fusionarPlanConUsuarios,
  limpiarOverrideSemana,
  listarCandidatosCt,
  mapasRhParaPlan,
  moverCelda,
  moverCeldaSemana,
  parchearCelda,
  parchearCeldaSemana,
  quitarDescanso,
  quitarDescansoSemana,
  setHorarioFijo,
  textoCelda,
  tieneOverrideSemana,
  turnoDeFila,
} from '../lib/planHorario.js';
import {
  AVISO_FALTA_PLAN_HORARIO_SQL,
  leerPlanHorarioLocal,
  persistirPlanHorario,
  sincronizarPlanHorarioDesdeNube,
} from '../lib/planHorarioSync.js';
import {
  listarCatalogoCt,
  quitarCoberturaCtPlan,
  solicitarCt,
  ctPuedeCubrirDia,
  etiquetaDiasCt,
} from '../lib/cubreSolicitudes.js';
import { esUsuarioCubreTurno } from '../lib/cubreTurno.js';

function colorTextoSobre(bg) {
  const hex = String(bg || '#fff').replace('#', '');
  if (hex.length !== 6) return '#111';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luma = (r * 299 + g * 587 + b * 114) / 1000;
  return luma < 128 ? '#fff' : '#111';
}

async function cargarUsuariosPlan(supabase) {
  if (!supabase) return [];
  const selectFull = 'id,nombre,rol,sucursal_id,turno_id,turno_horario,activo,tipo_empleado';
  let res = await supabase.from('usuarios').select(selectFull).order('nombre');
  if (res.error && String(res.error.message || '').includes('tipo_empleado')) {
    res = await supabase.from('usuarios').select('id,nombre,rol,sucursal_id,turno_id,turno_horario,activo').order('nombre');
  }
  if (res.error && String(res.error.message || '').includes('activo')) {
    res = await supabase.from('usuarios').select('id,nombre,rol,sucursal_id,turno_id,turno_horario').order('nombre');
  }
  if (res.error) return [];
  return (res.data || []).filter((u) => u?.activo !== false);
}

export default function PlanHorarioCalendario({ supabase, user, sucursal }) {
  const veTodasTiendas = esCentralAdmin(sucursal);
  const [plan, setPlan] = useState(() => leerPlanHorarioLocal());
  const [usuarios, setUsuarios] = useState([]);
  const [rhCubre, setRhCubre] = useState([]);
  const [catalogoCt, setCatalogoCt] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [semanaOff, setSemanaOff] = useState(0);
  const [sel, setSel] = useState(null);
  const [ctManual, setCtManual] = useState('');
  const [dirty, setDirty] = useState(false);
  /** null | 'semana' | 'habitual' — solo aplica cuando horarioFijo */
  const [modoEdicion, setModoEdicion] = useState(null);
  const dragRef = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const rol = normalizarRol(user?.rol);
  const puedeSolicitarDesdePlan = (rol === 'Cajero' || rol === 'Administrador' || rol === 'Gerente')
    && !esUsuarioCubreTurno(user);

  const fechas = useMemo(() => fechasSemanaPlan(semanaOff), [semanaOff]);
  const lunesSemana = useMemo(() => claveLunesDesdeOffset(semanaOff), [semanaOff]);
  const horarioFijo = Boolean(plan?.horarioFijo);
  const editandoSemana = horarioFijo && modoEdicion === 'semana';
  const editandoHabitual = !horarioFijo || modoEdicion === 'habitual';
  const puedeEditar = editandoSemana || editandoHabitual;
  const hayOverrideSemana = useMemo(
    () => tieneOverrideSemana(plan, lunesSemana),
    [plan, lunesSemana],
  );

  const candidatos = useMemo(() => {
    const filaSel = sel
      ? (plan.filas || []).find((f) => f.id === sel.filaId)
      : null;
    const sucFiltro = filaSel?.sucursal_id || sucursal || null;
    const turnoFiltro = filaSel?.turno_id || null;
    const fechaSel = sel
      ? fechas.find((f) => f.diaId === sel.diaId)?.fecha?.toISOString?.().slice(0, 10)
      : null;
    let base;
    if (catalogoCt.length) {
      base = catalogoCt.map((c) => {
        const ocupadas = c.fechas_ocupadas || [];
        const manualOff = String(c.extras?.ct_disponibilidad || '').toLowerCase() === 'no_disponible';
        const holdOrBaja = ['hold', 'baja'].includes(c.disponibilidad)
          || (c.disponibilidad === 'no_disponible' && manualOff && !fechaSel);
        const diaNoHabilitado = Boolean(fechaSel && !ctPuedeCubrirDia(c.extras || { ct_dias: c.ct_dias }, fechaSel));
        const ocupadoEseDia = Boolean(fechaSel && ocupadas.includes(fechaSel));
        const bloqueado = holdOrBaja || diaNoHabilitado || (c.disponibilidad === 'no_disponible' && manualOff);
        const puede = bloqueado ? false : (fechaSel ? !ocupadoEseDia : true);
        let estadoDia = 'disponible';
        let label = 'Disponible';
        if (holdOrBaja || (manualOff && c.disponibilidad === 'no_disponible')) {
          estadoDia = c.disponibilidad === 'hold' || c.disponibilidad === 'baja' ? c.disponibilidad : 'no_disponible';
          label = c.disponibilidad_label || 'No disponible';
        } else if (diaNoHabilitado) {
          estadoDia = 'no_disponible';
          label = 'No disponible ese día';
        } else if (ocupadoEseDia) {
          estadoDia = 'cubriendo';
          label = 'Cubriendo ese día';
        }
        return {
          id: c.id,
          rh_id: c.rh_id,
          nombre: c.nombre,
          telefono: c.telefono,
          origen: 'rh',
          sucursal_id: c.sucursal_id,
          disponibilidad: estadoDia,
          disponibilidad_label: label,
          color: estadoDia === 'disponible' ? '#2e7d32' : '#c62828',
          puede_solicitar: puede,
          fechas_ocupadas: ocupadas,
          ct_sucursales: c.ct_sucursales,
          ct_solo_dia: c.ct_solo_dia,
          ct_dias: c.ct_dias,
          ct_dias_label: c.ct_dias_label || etiquetaDiasCt(c.extras || { ct_dias: c.ct_dias }),
          extras: c.extras,
        };
      });
    } else {
      base = listarCandidatosCt({ usuarios, rhCubre, soloRh: true });
    }
    return base.filter((c) => {
      const ex = c.extras || {
        ct_sucursales: c.ct_sucursales,
        ct_solo_dia: c.ct_solo_dia,
        ct_dias: c.ct_dias,
      };
      if (sucFiltro && Array.isArray(ex.ct_sucursales) && ex.ct_sucursales.length) {
        const hab = ex.ct_sucursales.map((s) => String(s).toUpperCase());
        if (!hab.includes(String(sucFiltro).toUpperCase())) return false;
      }
      if (ex.ct_solo_dia && turnoFiltro && /nocturno|noche/i.test(String(turnoFiltro))) {
        return false;
      }
      return true;
    });
  }, [catalogoCt, usuarios, rhCubre, sel, plan.filas, sucursal, fechas]);
  const grupos = useMemo(() => {
    const all = agruparFilasPorTienda(plan);
    if (veTodasTiendas) return all;
    const suc = String(sucursal || '').toUpperCase();
    return all.filter((g) => String(g.sucursalId || '').toUpperCase() === suc);
  }, [plan, veTodasTiendas, sucursal]);

  const horasPorFila = useMemo(() => {
    const map = new Map();
    for (const g of grupos) {
      const turnos = leerTurnos(g.sucursalId);
      for (const f of g.filas) {
        const t = turnoDeFila(f, turnos);
        map.set(f.id, formatoBloqueHorario(t.hora_inicio, t.hora_fin));
      }
    }
    return map;
  }, [grupos]);

  const celdaSel = useMemo(() => {
    if (!sel) return null;
    const fila = plan.filas.find((f) => f.id === sel.filaId);
    if (!fila) return null;
    const celdas = celdasEfectivasFila(plan, fila, lunesSemana);
    return { fila, celda: celdas[String(sel.diaId)], horas: horasPorFila.get(fila.id) };
  }, [sel, plan, horasPorFila, lunesSemana]);

  const aplicar = useCallback((next) => {
    setPlan(next);
    setDirty(true);
    setAviso('');
  }, []);

  const aplicarMovimiento = useCallback((fromFilaId, fromDia, toFilaId, toDia) => {
    if (editandoSemana) {
      return moverCeldaSemana(plan, lunesSemana, fromFilaId, fromDia, toFilaId, toDia);
    }
    return moverCelda(plan, fromFilaId, fromDia, toFilaId, toDia);
  }, [editandoSemana, plan, lunesSemana]);

  const aplicarParche = useCallback((filaId, dia, patch) => {
    if (editandoSemana) {
      return parchearCeldaSemana(plan, lunesSemana, filaId, dia, patch);
    }
    return parchearCelda(plan, filaId, dia, patch);
  }, [editandoSemana, plan, lunesSemana]);

  const aplicarDescanso = useCallback((filaId, dia, ct) => {
    if (editandoSemana) {
      return asignarDescansoConCtSemana(plan, lunesSemana, filaId, dia, ct);
    }
    return asignarDescansoConCt(plan, filaId, dia, ct);
  }, [editandoSemana, plan, lunesSemana]);

  const aplicarQuitarDescanso = useCallback((filaId, dia) => {
    if (editandoSemana) {
      return quitarDescansoSemana(plan, lunesSemana, filaId, dia);
    }
    return quitarDescanso(plan, filaId, dia);
  }, [editandoSemana, plan, lunesSemana]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [us, rhAll, sync, cat] = await Promise.all([
      cargarUsuariosPlan(supabase),
      supabase ? listarEmpleadosRh(supabase, { estado: 'activo' }) : Promise.resolve({ data: [] }),
      sincronizarPlanHorarioDesdeNube(supabase),
      supabase ? listarCatalogoCt(supabase) : Promise.resolve({ data: [] }),
    ]);
    setUsuarios(us);
    const rhList = rhAll.data || [];
    setRhCubre(rhList.filter((e) => String(e.tipo_empleado || '') === 'cubre_turno'));
    setCatalogoCt(cat.data || []);
    const mapas = mapasRhParaPlan(rhList);
    const base = sync.ok && sync.plan ? sync.plan : leerPlanHorarioLocal();
    setPlan(fusionarPlanConUsuarios(base, us, mapas));
    if (sync.aviso || sync.sinTabla) setAviso(sync.aviso || AVISO_FALTA_PLAN_HORARIO_SQL);
    else setAviso('');
    setDirty(false);
    setModoEdicion(null);
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = useCallback(async () => {
    setGuardando(true);
    const res = await persistirPlanHorario(plan, supabase);
    setGuardando(false);
    if (res.remoto?.aviso || res.remoto?.sinTabla) {
      setAviso(res.remoto.aviso || AVISO_FALTA_PLAN_HORARIO_SQL);
    } else if (res.remoto && res.remoto.ok === false) {
      setAviso(res.remoto.error || 'No se pudo guardar en la nube. Quedó en este equipo.');
    } else {
      setAviso('Plan horario guardado.');
    }
    setDirty(false);
  }, [plan, supabase]);

  const onDropCelda = (toFilaId, toDia) => {
    const from = dragRef.current;
    dragRef.current = null;
    setDragOver(null);
    if (!from || !puedeEditar) return;
    aplicar(aplicarMovimiento(from.filaId, from.diaId, toFilaId, toDia));
    setSel({ filaId: toFilaId, diaId: toDia });
  };

  const marcarDescanso = (ct) => {
    if (!sel || !puedeEditar) return;
    aplicar(aplicarDescanso(sel.filaId, sel.diaId, ct || { nombre: ctManual.trim() || 'DESCANSO' }));
    setCtManual('');
  };

  const ymdDeSel = () => {
    const fechaObj = fechas.find((f) => f.diaId === sel?.diaId)?.fecha;
    return fechaObj ? fechaObj.toISOString().slice(0, 10) : null;
  };

  /** Quitar descanso y cancelar cualquier solicitud CT activa de la celda (trabajar el descanso). */
  const quitarDescansoYCt = async () => {
    if (!sel || !puedeEditar) return;
    const fila = plan.filas?.find((f) => f.id === sel.filaId);
    const ymd = ymdDeSel();
    const teniaCt = Boolean(celdaSel?.celda?.ctId || celdaSel?.celda?.ctNombre);
    if (teniaCt && !confirm(
      '¿Quitar el CT y trabajar este descanso?\n\n'
      + 'Se cancelará la solicitud activa (si había) y la celda vuelve a turno laboral.',
    )) return;
    if (ymd && fila) {
      const res = await quitarCoberturaCtPlan(supabase, {
        plan_fila_id: sel.filaId,
        plan_dia: sel.diaId,
        fecha: ymd,
        sucursal_id: fila.sucursal_id || sucursal,
      });
      if (!res.ok && !res.faltaTabla) {
        return alert(res.error || 'No se pudo cancelar la solicitud CT.');
      }
      if (res.canceladas) alert(res.mensaje);
    }
    aplicar(aplicarQuitarDescanso(sel.filaId, sel.diaId));
    setCtManual('');
  };

  const solicitarCtDesdeCelda = async (ct) => {
    if (!sel || !ct?.rh_id && !String(ct?.id || '').startsWith('rh:')) {
      return alert('Elige un CT del catálogo (RH).');
    }
    const ymd = ymdDeSel();
    if (!ymd) return alert('No se pudo resolver la fecha de esa celda.');
    const fila = plan.filas?.find((f) => f.id === sel.filaId);
    const suc = fila?.sucursal_id || sucursal;
    const rhId = ct.rh_id || String(ct.id).replace(/^rh:/, '');
    if (ct.puede_solicitar === false) {
      return alert(`Ese CT no está disponible (${ct.disponibilidad_label || 'ocupado'}). Elige uno en verde.`);
    }
    const ctActualId = celdaSel?.celda?.ctId
      ? String(celdaSel.celda.ctId).replace(/^rh:/, '')
      : '';
    const esCambio = Boolean(ctActualId && ctActualId !== String(rhId));
    if (!confirm(
      `¿Solicitar a ${ct.nombre} cubrir ${ymd} en ${suc}?\n\n`
      + (esCambio || celdaSel?.celda?.ctNombre
        ? 'Si había otra solicitud CT en esta celda, se cancela automáticamente. '
        : '')
      + 'El CT ve la petición en su celular (PIN móvil). Al aceptar recibe PIN temporal solo para esa tienda/fecha.',
    )) return;
    // Con horario fijo, la solicitud CT se anota solo en esta semana (no reescribe la plantilla).
    const nextPlan = (horarioFijo && modoEdicion !== 'habitual')
      ? asignarDescansoConCtSemana(plan, lunesSemana, sel.filaId, sel.diaId, ct)
      : asignarDescansoConCt(plan, sel.filaId, sel.diaId, ct);
    aplicar(nextPlan);
    setCtManual('');
    const res = await solicitarCt(
      supabase,
      {
        sucursal_id: suc,
        fecha: ymd,
        ct_rh_id: rhId,
        empleado_planta_id: fila?.usuario_id || null,
        empleado_planta_nombre: fila?.nombre || null,
        plan_fila_id: sel.filaId,
        plan_dia: sel.diaId,
        turno_id: fila?.turno_id || null,
        turno_etiqueta: fila?.turno_id || null,
        notas: esCambio
          ? `Cambio de CT desde Plan horario · ${fila?.nombre || ''}`
          : `Solicitado desde Plan horario · ${fila?.nombre || ''}`,
      },
      { user },
    );
    if (!res.ok) return alert(res.error);
    alert(res.mensaje);
    await cargar();
  };

  const fijarHorario = (fijo) => {
    if (fijo) {
      aplicar(setHorarioFijo(plan, true));
      setModoEdicion(null);
      setAviso('Descansos fijos. Usa “Mover descanso esta semana” para un cambio puntual, o “Cambiar descanso habitual” si el día de descanso cambia para siempre.');
      return;
    }
    if (!confirm('¿Quitar el candado de descansos? Podrás editar el día de descanso habitual (L–D) libremente.')) return;
    aplicar(setHorarioFijo(plan, false));
    setModoEdicion(null);
  };

  const iniciarMoverSemana = () => {
    setModoEdicion('semana');
    setAviso(`Mueve el bloque DESCANSO solo en la semana del ${lunesSemana}. El descanso habitual (plantilla) no cambia.`);
  };

  const iniciarCambiarHabitual = () => {
    if (!confirm(
      '¿Cambiar el descanso habitual?\n\n'
      + 'El nuevo día de descanso queda en la plantilla fija (todas las semanas).\n'
      + 'Si solo es esta semana, usa “Mover descanso esta semana”.',
    )) return;
    setModoEdicion('habitual');
    setAviso('Editando descanso habitual (plantilla L–D). Arrastra el DESCANSO y guarda.');
  };

  const terminarEdicion = () => {
    setModoEdicion(null);
    setAviso(horarioFijo ? 'Descansos fijos. Sin edición activa.' : '');
  };

  const restaurarSemana = () => {
    if (!hayOverrideSemana) return;
    if (!confirm('¿Quitar el movimiento de esta semana y volver al descanso fijo?')) return;
    aplicar(limpiarOverrideSemana(plan, lunesSemana));
    setAviso('Esta semana vuelve al descanso fijo.');
  };

  const actor = user?.nombre ? ` · ${user.nombre}` : '';

  return (
    <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ margin: '0 0 0.25rem', color: 'var(--brand-blue)' }}>PLAN HORARIO ABARROTES 3B</h3>
          <p className="muted" style={{ margin: 0, fontSize: '0.82rem', maxWidth: 720 }}>
            {veTodasTiendas ? 'Calendario semanal de todas las tiendas.' : `Calendario semanal de ${etiquetaTienda(sucursal)}.`} Los nombres salen de <strong>Usuarios</strong> (empleados de tienda).
            Marca el <strong>descanso</strong> de cada empleado, déjalo <strong>fijo</strong> y muévelo solo cuando haga falta (esta semana o el habitual).
            {actor}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setSemanaOff((n) => n - 1)}>◀ Semana</button>
          <button type="button" className="btn btn-ghost" onClick={() => setSemanaOff(0)} disabled={semanaOff === 0}>Hoy</button>
          <button type="button" className="btn btn-ghost" onClick={() => setSemanaOff((n) => n + 1)}>Semana ▶</button>
          <button type="button" className="btn btn-ghost" onClick={() => void cargar()} disabled={cargando}>Recargar</button>
          <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={guardando || cargando}>
            {guardando ? 'Guardando…' : dirty ? 'Guardar plan' : 'Guardado'}
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: '0.75rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.45rem',
          alignItems: 'center',
          padding: '0.55rem 0.65rem',
          borderRadius: 8,
          background: horarioFijo ? 'rgba(46, 125, 50, 0.08)' : 'rgba(25, 118, 210, 0.08)',
          border: `1px solid ${horarioFijo ? '#a5d6a7' : '#90caf9'}`,
        }}
      >
        <button
          type="button"
          className={horarioFijo ? 'btn btn-primary' : 'btn btn-ghost'}
          onClick={() => fijarHorario(true)}
          disabled={horarioFijo && !modoEdicion}
          title="Bloquea los descansos de la plantilla L–D para que no se muevan por accidente"
        >
          {horarioFijo ? '🔒 Descansos fijos' : 'Fijar descansos'}
        </button>
        {horarioFijo ? (
          <>
            <button
              type="button"
              className={editandoSemana ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => (editandoSemana ? terminarEdicion() : iniciarMoverSemana())}
              title="Mueve el bloque DESCANSO solo en esta semana"
            >
              {editandoSemana ? 'Listo (semana)' : 'Mover descanso esta semana'}
            </button>
            <button
              type="button"
              className={modoEdicion === 'habitual' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => (modoEdicion === 'habitual' ? terminarEdicion() : iniciarCambiarHabitual())}
              title="Cambia el día de descanso de la plantilla (todas las semanas)"
            >
              {modoEdicion === 'habitual' ? 'Listo (habitual)' : 'Cambiar descanso habitual'}
            </button>
            {hayOverrideSemana && (
              <button type="button" className="btn btn-ghost" onClick={restaurarSemana}>
                Restaurar descanso de esta semana
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => fijarHorario(false)}>
              Quitar candado
            </button>
          </>
        ) : (
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            Marca el <strong>DESCANSO</strong> de cada quien (clic o arrastre). Cuando quede bien, pulsa <strong>Fijar descansos</strong>.
          </span>
        )}
        {editandoSemana && (
          <span style={{ fontSize: '0.8rem', color: '#2e7d32', fontWeight: 600 }}>
            Solo esta semana · descanso habitual intacto
          </span>
        )}
        {modoEdicion === 'habitual' && (
          <span style={{ fontSize: '0.8rem', color: '#1565c0', fontWeight: 600 }}>
            Editando descanso habitual
          </span>
        )}
        {!puedeEditar && horarioFijo && (
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            Bloqueado · elige “Mover descanso esta semana” o “Cambiar descanso habitual”
          </span>
        )}
      </div>

      {aviso && (
        <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.82rem' }}>{aviso}</p>
      )}

      {cargando ? (
        <p className="muted" style={{ marginTop: '1rem' }}>Cargando empleados y plan…</p>
      ) : (
        <div className="plan-horario-wrap" style={{ marginTop: '0.85rem' }}>
          <table className="plan-horario">
            <thead>
              <tr>
                <th className="ph-nombre">NOMBRE</th>
                {DIAS_PLAN_HORARIO.map((d, i) => (
                  <th key={d.id}>
                    <div>{d.label}</div>
                    <div className="ph-fecha">{etiquetaFechaCorta(fechas[i]?.fecha)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <React.Fragment key={g.sucursalId}>
                  <tr className="ph-tienda">
                    <td colSpan={8} style={{ background: g.color, color: colorTextoSobre(g.color) }}>{g.titulo}</td>
                  </tr>
                  {g.filas.map((fila) => {
                    const horas = horasPorFila.get(fila.id);
                    const celdasVista = celdasEfectivasFila(plan, fila, lunesSemana);
                    return (
                      <tr key={fila.id}>
                        <td className="ph-nombre" title={fila.tipo === 'ct' ? 'Cubre turnos' : fila.nombre}>
                          {fila.nombre}
                          {fila.tipo === 'ct' && <span className="muted" style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600 }}>cubre turnos</span>}
                        </td>
                        {DIAS_PLAN_HORARIO.map((d) => {
                          const celda = celdasVista[String(d.id)];
                          const bg = colorFondoCelda(celda);
                          const activa = sel?.filaId === fila.id && sel?.diaId === d.id;
                          const over = dragOver?.filaId === fila.id && dragOver?.diaId === d.id;
                          return (
                            <td
                              key={d.id}
                              className={`ph-celda${activa ? ' ph-activa' : ''}${over ? ' ph-dragover' : ''}${celda.tipo === 'descanso' ? ' ph-descanso' : ''}${!puedeEditar ? ' ph-bloqueada' : ''}`}
                              style={{
                                background: bg,
                                color: colorTextoSobre(bg),
                                cursor: puedeEditar ? 'grab' : 'default',
                                opacity: !puedeEditar ? 0.92 : 1,
                              }}
                              draggable={puedeEditar}
                              onDragStart={() => {
                                if (!puedeEditar) return;
                                dragRef.current = { filaId: fila.id, diaId: d.id };
                              }}
                              onDragOver={(e) => {
                                if (!puedeEditar) return;
                                e.preventDefault();
                                setDragOver({ filaId: fila.id, diaId: d.id });
                              }}
                              onDragLeave={() => {
                                setDragOver((cur) => (cur?.filaId === fila.id && cur?.diaId === d.id ? null : cur));
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (!puedeEditar) return;
                                onDropCelda(fila.id, d.id);
                              }}
                              onClick={() => {
                                setSel({ filaId: fila.id, diaId: d.id });
                                setCtManual(celda.ctNombre || '');
                              }}
                            >
                              {textoCelda(celda, horas)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {celdaSel && (
        <div className="ph-editor">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
            <div>
              <strong>{celdaSel.fila.nombre}</strong>
              <span className="muted"> · {DIAS_PLAN_HORARIO.find((d) => d.id === sel.diaId)?.label}</span>
              <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                Horario del bloque: {celdaSel.horas}
                {celdaSel.fila.tipo === 'ct' ? ' · fila CT' : ''}
                {editandoSemana ? ' · cambio solo esta semana' : ''}
                {modoEdicion === 'habitual' ? ' · plantilla habitual' : ''}
                {!puedeEditar ? ' · bloqueado (activa un modo de edición)' : ''}
              </div>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setSel(null)}>Cerrar</button>
          </div>

          {!puedeEditar && (
            <p className="muted" style={{ margin: '0.55rem 0 0', fontSize: '0.82rem' }}>
              El horario está fijo. Pulsa <strong>Mover esta semana</strong> o <strong>Cambiar horario habitual</strong> arriba para editar.
            </p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.65rem' }}>
            <button
              type="button"
              className={celdaSel.celda.tipo === 'turno' ? 'btn btn-primary' : 'btn btn-ghost'}
              disabled={!puedeEditar}
              onClick={() => void quitarDescansoYCt()}
            >
              Turno
            </button>
            <button
              type="button"
              className={celdaSel.celda.tipo === 'descanso' ? 'btn btn-primary' : 'btn btn-ghost'}
              disabled={!puedeEditar}
              onClick={() => marcarDescanso(candidatos.find((c) => c.id === celdaSel.celda.ctId) || { nombre: celdaSel.celda.ctNombre })}
            >
              Descanso
            </button>
          </div>

          <div style={{ marginTop: '0.7rem' }}>
            <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.35rem' }}>Color del bloque</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {COLORES_PLAN_HORARIO.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  disabled={!puedeEditar}
                  onClick={() => aplicar(aplicarParche(sel.filaId, sel.diaId, { color: c.id === 'turno' ? null : c.hex }))}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: (celdaSel.celda.color || '#ffffff').toLowerCase() === c.hex.toLowerCase() || (!celdaSel.celda.color && c.id === 'turno')
                      ? '2px solid var(--brand-blue)'
                      : '1px solid #bbb',
                    background: c.hex,
                    cursor: puedeEditar ? 'pointer' : 'not-allowed',
                    opacity: puedeEditar ? 1 : 0.55,
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.35rem' }}>
              CT independiente (verde = disponible ese día · rojo = ya cubre ese día / hold). Si ya cubre otro día, sí se puede elegir.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
              <select
                className="input"
                style={{ minWidth: 260 }}
                value={celdaSel.celda.ctId || ''}
                disabled={!puedeEditar}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    aplicar(aplicarParche(sel.filaId, sel.diaId, { ctId: null, ctNombre: null, ctTelefono: null }));
                    return;
                  }
                  const ct = candidatos.find((c) => c.id === id);
                  marcarDescanso(ct);
                }}
              >
                <option value="">— Elegir CT —</option>
                {candidatos.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.puede_solicitar === false}>
                    {c.puede_solicitar === false ? '🔴' : '🟢'} {c.nombre.toUpperCase()}
                    {c.ct_solo_dia ? ' · solo día' : ''}
                    {c.ct_dias_label && c.ct_dias_label !== 'Todos los días' ? ` · ${c.ct_dias_label}` : ''}
                    {c.disponibilidad_label ? ` · ${c.disponibilidad_label}` : ' · CT RH'}
                  </option>
                ))}
              </select>
              {puedeSolicitarDesdePlan && celdaSel.celda.ctId && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const ct = candidatos.find((c) => c.id === celdaSel.celda.ctId);
                    void solicitarCtDesdeCelda(ct || {
                      id: celdaSel.celda.ctId,
                      nombre: celdaSel.celda.ctNombre,
                      telefono: celdaSel.celda.ctTelefono,
                    });
                  }}
                >
                  {celdaSel.celda.ctNombre ? 'Solicitar / cambiar este CT' : 'Solicitar este CT'}
                </button>
              )}
              <input
                className="input"
                placeholder="Nombre CT (si no está en la lista)"
                value={ctManual}
                disabled={!puedeEditar}
                onChange={(e) => setCtManual(e.target.value)}
                style={{ minWidth: 200 }}
              />
              <button
                type="button"
                className="btn btn-gold"
                disabled={!puedeEditar || !ctManual.trim()}
                onClick={() => marcarDescanso({ nombre: ctManual.trim() })}
              >
                Asignar nombre
              </button>
              {celdaSel.celda.tipo === 'descanso' && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!puedeEditar}
                  title="Cancela la solicitud CT (si hay) y vuelve a turno laboral"
                  onClick={() => void quitarDescansoYCt()}
                >
                  {celdaSel.celda.ctId || celdaSel.celda.ctNombre
                    ? 'Quitar CT (trabajar descanso)'
                    : 'Quitar descanso'}
                </button>
              )}
            </div>
            <p className="muted" style={{ margin: '0.55rem 0 0', fontSize: '0.78rem', maxWidth: 720 }}>
              Si te arrepientes del CT: elige otro en la lista y pulsa <strong>Solicitar / cambiar</strong>
              {' '}(se cancela el anterior). Si decides trabajar tu descanso: <strong>Quitar CT (trabajar descanso)</strong>.
              El CT recibe la solicitud en su celular con su PIN móvil (no en la caja).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
