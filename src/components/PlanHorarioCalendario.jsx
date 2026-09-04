import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listarEmpleadosRh } from '../lib/rhAba3b.js';
import { leerTurnos } from '../lib/turnos.js';
import {
  COLORES_PLAN_HORARIO,
  DIAS_PLAN_HORARIO,
  agruparFilasPorTienda,
  asignarDescansoConCt,
  colorFondoCelda,
  etiquetaFechaCorta,
  fechasSemanaPlan,
  formatoBloqueHorario,
  fusionarPlanConUsuarios,
  listarCandidatosCt,
  mapasRhParaPlan,
  moverCelda,
  parchearCelda,
  quitarDescanso,
  textoCelda,
  turnoDeFila,
} from '../lib/planHorario.js';
import {
  AVISO_FALTA_PLAN_HORARIO_SQL,
  leerPlanHorarioLocal,
  persistirPlanHorario,
  sincronizarPlanHorarioDesdeNube,
} from '../lib/planHorarioSync.js';

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

export default function PlanHorarioCalendario({ supabase, user }) {
  const [plan, setPlan] = useState(() => leerPlanHorarioLocal());
  const [usuarios, setUsuarios] = useState([]);
  const [rhCubre, setRhCubre] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [semanaOff, setSemanaOff] = useState(0);
  const [sel, setSel] = useState(null);
  const [ctManual, setCtManual] = useState('');
  const [dirty, setDirty] = useState(false);
  const dragRef = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const candidatos = useMemo(
    () => listarCandidatosCt({ usuarios, rhCubre }),
    [usuarios, rhCubre],
  );

  const fechas = useMemo(() => fechasSemanaPlan(semanaOff), [semanaOff]);
  const grupos = useMemo(() => agruparFilasPorTienda(plan), [plan]);

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
    return { fila, celda: fila.celdas[String(sel.diaId)], horas: horasPorFila.get(fila.id) };
  }, [sel, plan, horasPorFila]);

  const aplicar = useCallback((next) => {
    setPlan(next);
    setDirty(true);
    setAviso('');
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [us, rhAll, sync] = await Promise.all([
      cargarUsuariosPlan(supabase),
      supabase ? listarEmpleadosRh(supabase, { estado: 'activo' }) : Promise.resolve({ data: [] }),
      sincronizarPlanHorarioDesdeNube(supabase),
    ]);
    setUsuarios(us);
    const rhList = rhAll.data || [];
    setRhCubre(rhList.filter((e) => String(e.tipo_empleado || '') === 'cubre_turno'));
    const mapas = mapasRhParaPlan(rhList);
    const base = sync.ok && sync.plan ? sync.plan : leerPlanHorarioLocal();
    setPlan(fusionarPlanConUsuarios(base, us, mapas));
    if (sync.aviso || sync.sinTabla) setAviso(sync.aviso || AVISO_FALTA_PLAN_HORARIO_SQL);
    else setAviso('');
    setDirty(false);
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
    if (!from) return;
    aplicar(moverCelda(plan, from.filaId, from.diaId, toFilaId, toDia));
    setSel({ filaId: toFilaId, diaId: toDia });
  };

  const marcarDescanso = (ct) => {
    if (!sel) return;
    aplicar(asignarDescansoConCt(plan, sel.filaId, sel.diaId, ct || { nombre: ctManual.trim() || 'DESCANSO' }));
    setCtManual('');
  };

  const actor = user?.nombre ? ` · ${user.nombre}` : '';

  return (
    <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ margin: '0 0 0.25rem', color: 'var(--brand-blue)' }}>PLAN HORARIO ABARROTES 3B</h3>
          <p className="muted" style={{ margin: 0, fontSize: '0.82rem', maxWidth: 720 }}>
            Calendario semanal de todas las tiendas. Los nombres salen de <strong>Usuarios</strong> (empleados de tienda).
            Arrastra un bloque para moverlo; haz clic para marcar <strong>descanso</strong>, cambiar color y relacionarlo con un <strong>CT</strong> (cubre turnos).
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
                    return (
                      <tr key={fila.id}>
                        <td className="ph-nombre" title={fila.tipo === 'ct' ? 'Cubre turnos' : fila.nombre}>
                          {fila.nombre}
                          {fila.tipo === 'ct' && <span className="muted" style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600 }}>cubre turnos</span>}
                        </td>
                        {DIAS_PLAN_HORARIO.map((d) => {
                          const celda = fila.celdas[String(d.id)];
                          const bg = colorFondoCelda(celda);
                          const activa = sel?.filaId === fila.id && sel?.diaId === d.id;
                          const over = dragOver?.filaId === fila.id && dragOver?.diaId === d.id;
                          return (
                            <td
                              key={d.id}
                              className={`ph-celda${activa ? ' ph-activa' : ''}${over ? ' ph-dragover' : ''}${celda.tipo === 'descanso' ? ' ph-descanso' : ''}`}
                              style={{ background: bg, color: colorTextoSobre(bg) }}
                              draggable
                              onDragStart={() => {
                                dragRef.current = { filaId: fila.id, diaId: d.id };
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                setDragOver({ filaId: fila.id, diaId: d.id });
                              }}
                              onDragLeave={() => {
                                setDragOver((cur) => (cur?.filaId === fila.id && cur?.diaId === d.id ? null : cur));
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
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
              </div>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setSel(null)}>Cerrar</button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.65rem' }}>
            <button
              type="button"
              className={celdaSel.celda.tipo === 'turno' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => aplicar(quitarDescanso(plan, sel.filaId, sel.diaId))}
            >
              Turno
            </button>
            <button
              type="button"
              className={celdaSel.celda.tipo === 'descanso' ? 'btn btn-primary' : 'btn btn-ghost'}
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
                  onClick={() => aplicar(parchearCelda(plan, sel.filaId, sel.diaId, { color: c.id === 'turno' ? null : c.hex }))}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: (celdaSel.celda.color || '#ffffff').toLowerCase() === c.hex.toLowerCase() || (!celdaSel.celda.color && c.id === 'turno')
                      ? '2px solid var(--brand-blue)'
                      : '1px solid #bbb',
                    background: c.hex,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.35rem' }}>
              Relacionar con CT (cubre turnos) o compañero de tienda
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
              <select
                className="input"
                style={{ minWidth: 220 }}
                value={celdaSel.celda.ctId || ''}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    aplicar(parchearCelda(plan, sel.filaId, sel.diaId, { ctId: null, ctNombre: null, ctTelefono: null }));
                    return;
                  }
                  const ct = candidatos.find((c) => c.id === id);
                  marcarDescanso(ct);
                }}
              >
                <option value="">— Elegir CT / empleado —</option>
                {candidatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre.toUpperCase()}
                    {c.origen === 'rh' ? ' · CT RH' : ` · ${c.sucursal_id || 'tienda'}`}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="Nombre CT (si no está en la lista)"
                value={ctManual}
                onChange={(e) => setCtManual(e.target.value)}
                style={{ minWidth: 200 }}
              />
              <button
                type="button"
                className="btn btn-gold"
                disabled={!ctManual.trim()}
                onClick={() => marcarDescanso({ nombre: ctManual.trim() })}
              >
                Asignar nombre
              </button>
              {celdaSel.celda.tipo === 'descanso' && (
                <button type="button" className="btn btn-ghost" onClick={() => aplicar(quitarDescanso(plan, sel.filaId, sel.diaId))}>
                  Quitar descanso
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
