import React, { useEffect, useMemo, useState } from 'react';
import LineaTiempoContratacion from './LineaTiempoContratacion.jsx';
import { opcionesSucursalesContratacion } from '../lib/contratacion.js';
import {
  ETAPAS_PROCESO,
  agregarMensajeEstatus,
  editarMensajeEstatus,
  editarRechazo,
  eliminarMensajeEstatus,
  eliminarSolicitudContratacion,
  esSolicitudRechazada,
  etapaDeRechazo,
  guardarInicioLabores,
  hoyClaveContratacion,
  isoAInputDatetime,
  marcarContratado,
  pasarARevision,
  programarEntrevista,
  quitarContratacion,
  quitarEntrevista,
  quitarInicioLabores,
  reabrirProceso,
  rechazarCandidato,
  urlEstatusContratacion,
  AVISO_FALTA_ESTATUS_CONTRATACION,
} from '../lib/contratacionEstatus.js';

const caja = {
  padding: '0.65rem 0.75rem',
  borderRadius: 10,
  border: '1px solid var(--border, #e5e7eb)',
  display: 'grid',
  gap: '0.45rem',
};

function Seccion({ titulo, children, ayuda }) {
  return (
    <div style={caja}>
      <div>
        <strong style={{ fontSize: '0.88rem' }}>{titulo}</strong>
        {ayuda ? <div className="muted" style={{ fontSize: '0.76rem' }}>{ayuda}</div> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Panel del encargado de contratación: alimenta el estatus que ve el candidato.
 * `onCambio(solicitud)` recibe la fila actualizada; `onEliminada()` si se borra al candidato.
 */
export default function EstatusContratacionAdmin({ supabase, user, solicitud, onCambio, onEliminada }) {
  const sel = solicitud;
  const sucursales = useMemo(() => opcionesSucursalesContratacion(), []);
  const [ocupado, setOcupado] = useState(false);
  const [mensajeOk, setMensajeOk] = useState('');
  const [copiado, setCopiado] = useState(false);

  const [entFecha, setEntFecha] = useState('');
  const [entLugar, setEntLugar] = useState('');
  const [entMensaje, setEntMensaje] = useState('');
  const [contFecha, setContFecha] = useState('');
  const [inicioFecha, setInicioFecha] = useState('');
  const [inicioSuc, setInicioSuc] = useState('');
  const [inicioHorario, setInicioHorario] = useState('');
  const [rechEtapa, setRechEtapa] = useState('revision');
  const [rechMotivo, setRechMotivo] = useState('');
  const [msgNuevo, setMsgNuevo] = useState('');
  const [msgEditId, setMsgEditId] = useState('');
  const [msgEditTexto, setMsgEditTexto] = useState('');

  useEffect(() => {
    setEntFecha(isoAInputDatetime(sel?.entrevista_fecha));
    setEntLugar(sel?.entrevista_lugar || '');
    setEntMensaje(sel?.entrevista_mensaje || '');
    setContFecha(String(sel?.contratacion_fecha || '').slice(0, 10) || hoyClaveContratacion());
    setInicioFecha(String(sel?.inicio_labores || '').slice(0, 10));
    setInicioSuc(sel?.inicio_sucursal || '');
    setInicioHorario(sel?.inicio_horario || '');
    setRechEtapa(sel ? etapaDeRechazo(sel) : 'revision');
    setRechMotivo(sel?.rechazo_motivo || '');
    setMsgEditId('');
    setMsgEditTexto('');
    setMsgNuevo('');
    setMensajeOk('');
  }, [sel?.id, sel?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sel) return null;
  const rechazada = esSolicitudRechazada(sel);
  const codigo = sel.codigo_seguimiento || '';
  const enlace = codigo ? urlEstatusContratacion(codigo) : '';

  const correr = async (fn, okTexto) => {
    setOcupado(true);
    setMensajeOk('');
    try {
      const res = await fn();
      if (!res?.ok) {
        alert(res?.error || 'No se pudo guardar.');
        return false;
      }
      if (res.solicitud) onCambio?.(res.solicitud);
      if (okTexto) setMensajeOk(okTexto);
      return true;
    } finally {
      setOcupado(false);
    }
  };

  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      prompt('Copia esto:', texto);
    }
  };

  const eliminar = async () => {
    const ok = confirm(
      `¿Eliminar definitivamente la postulación de ${sel.nombre || 'este candidato'}?\n\nSe borra su expediente y deja de poder consultar su estatus. No se puede deshacer.`,
    );
    if (!ok) return;
    setOcupado(true);
    try {
      const res = await eliminarSolicitudContratacion(supabase, sel, user);
      if (!res.ok) return alert(res.error);
      onEliminada?.();
    } finally {
      setOcupado(false);
    }
  };

  const sinColumnas = !('estatus_mensajes' in sel) && !('codigo_seguimiento' in sel);

  return (
    <div style={{ display: 'grid', gap: '0.65rem' }}>
      <h4 style={{ margin: 0 }}>Estatus del candidato</h4>

      {sinColumnas && (
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--danger, #b91c1c)' }}>
          {AVISO_FALTA_ESTATUS_CONTRATACION}
        </p>
      )}

      <Seccion
        titulo="Código y enlace del candidato"
        ayuda="El candidato entra con su código y su teléfono para ver este mismo estatus."
      >
        {codigo ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <code style={{ fontSize: '1.15rem', letterSpacing: 2, fontWeight: 700 }}>{codigo}</code>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copiar(codigo)}>
                {copiado ? 'Copiado' : 'Copiar código'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copiar(enlace)}>
                Copiar enlace
              </button>
              <a className="btn btn-ghost btn-sm" href={enlace} target="_blank" rel="noreferrer">
                Abrir
              </a>
            </div>
            <code style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>{enlace}</code>
          </>
        ) : (
          <span className="muted" style={{ fontSize: '0.82rem' }}>
            Esta postulación aún no tiene código. Ejecuta <code>supabase/fix_contratacion_estatus.sql</code> para generarlo.
          </span>
        )}
      </Seccion>

      <div style={{ ...caja, background: 'rgba(100,116,139,0.05)' }}>
        <strong style={{ fontSize: '0.88rem' }}>Así lo ve el candidato</strong>
        <LineaTiempoContratacion solicitud={sel} />
      </div>

      {mensajeOk && <p style={{ margin: 0, fontSize: '0.82rem', color: '#16a34a' }}>{mensajeOk}</p>}

      <Seccion titulo="Revisión">
        <div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={ocupado || sel.estado === 'en_seguimiento'}
            onClick={() => void correr(() => pasarARevision(supabase, sel, user), 'Pasó a revisión.')}
          >
            Pasar a revisión
          </button>
        </div>
      </Seccion>

      <Seccion titulo="Entrevista" ayuda="Fecha, hora y lugar que verá el candidato.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          <input
            type="datetime-local"
            className="input"
            value={entFecha}
            onChange={(e) => setEntFecha(e.target.value)}
            style={{ width: 'auto' }}
          />
          <input
            className="input"
            placeholder="Lugar (sucursal, dirección…)"
            value={entLugar}
            onChange={(e) => setEntLugar(e.target.value)}
            style={{ flex: '1 1 180px' }}
          />
        </div>
        <input
          className="input"
          placeholder="Indicaciones para el candidato (opcional)"
          value={entMensaje}
          onChange={(e) => setEntMensaje(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-gold btn-sm"
            disabled={ocupado}
            onClick={() => void correr(
              () => programarEntrevista(supabase, sel, user, { fechaHora: entFecha, lugar: entLugar, mensaje: entMensaje }),
              sel.entrevista_fecha ? 'Entrevista actualizada.' : 'Entrevista programada.',
            )}
          >
            {sel.entrevista_fecha ? 'Actualizar entrevista' : 'Programar entrevista'}
          </button>
          {sel.entrevista_fecha && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={ocupado}
              onClick={() => confirm('¿Quitar la entrevista?') && void correr(() => quitarEntrevista(supabase, sel, user), 'Entrevista quitada.')}
            >
              Quitar entrevista
            </button>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Contratación" ayuda="Al contratar, el candidato ve que fue aceptado.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
          <input
            type="date"
            className="input"
            value={contFecha}
            onChange={(e) => setContFecha(e.target.value)}
            style={{ width: 'auto' }}
          />
          <button
            type="button"
            className="btn btn-gold btn-sm"
            disabled={ocupado}
            onClick={() => void correr(
              () => marcarContratado(supabase, sel, user, { fecha: contFecha }),
              'Marcado como contratado.',
            )}
          >
            {sel.contratacion_fecha ? 'Actualizar fecha de contratación' : 'Marcar contratado'}
          </button>
          {(sel.contratacion_fecha || sel.estado === 'aceptada') && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={ocupado}
              onClick={() => confirm('¿Quitar la contratación y el inicio de labores?')
                && void correr(() => quitarContratacion(supabase, sel, user), 'Contratación quitada.')}
            >
              Quitar contratación
            </button>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Inicio de labores" ayuda="Día, sucursal y horario con los que se presenta.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          <input
            type="date"
            className="input"
            value={inicioFecha}
            onChange={(e) => setInicioFecha(e.target.value)}
            style={{ width: 'auto' }}
          />
          <select
            className="input"
            value={inicioSuc}
            onChange={(e) => setInicioSuc(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="">Sucursal…</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Horario (ej. 7:00 a 15:00)"
            value={inicioHorario}
            onChange={(e) => setInicioHorario(e.target.value)}
            style={{ flex: '1 1 150px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-gold btn-sm"
            disabled={ocupado}
            onClick={() => void correr(
              () => guardarInicioLabores(supabase, sel, user, { fecha: inicioFecha, sucursal: inicioSuc, horario: inicioHorario }),
              'Inicio de labores guardado.',
            )}
          >
            {sel.inicio_labores ? 'Actualizar inicio de labores' : 'Guardar inicio de labores'}
          </button>
          {sel.inicio_labores && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={ocupado}
              onClick={() => confirm('¿Quitar el inicio de labores?')
                && void correr(() => quitarInicioLabores(supabase, sel, user), 'Inicio de labores quitado.')}
            >
              Quitar inicio
            </button>
          )}
        </div>
      </Seccion>

      <Seccion
        titulo={rechazada ? 'Rechazo' : 'Rechazar candidato'}
        ayuda="Elige en qué punto se detiene el proceso. El candidato verá la etapa y el motivo."
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          <select
            className="input"
            value={rechEtapa}
            onChange={(e) => setRechEtapa(e.target.value)}
            style={{ width: 'auto' }}
          >
            {ETAPAS_PROCESO.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Motivo visible para el candidato"
            value={rechMotivo}
            onChange={(e) => setRechMotivo(e.target.value)}
            style={{ flex: '1 1 200px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {rechazada ? (
            <>
              <button
                type="button"
                className="btn btn-gold btn-sm"
                disabled={ocupado}
                onClick={() => void correr(
                  () => editarRechazo(supabase, sel, user, { etapa: rechEtapa, motivo: rechMotivo }),
                  'Rechazo actualizado.',
                )}
              >
                Guardar cambios del rechazo
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={ocupado}
                onClick={() => confirm('¿Reabrir el proceso de este candidato?')
                  && void correr(() => reabrirProceso(supabase, sel, user), 'Proceso reabierto.')}
              >
                Reabrir proceso
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={ocupado}
              style={{ color: 'var(--danger, #b91c1c)' }}
              onClick={() => confirm('¿Rechazar a este candidato en la etapa elegida?')
                && void correr(
                  () => rechazarCandidato(supabase, sel, user, { etapa: rechEtapa, motivo: rechMotivo }),
                  'Candidato rechazado.',
                )}
            >
              Rechazar
            </button>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Mensajes para el candidato" ayuda="Avisos que aparecen en su estatus (puedes editarlos o borrarlos).">
        {(Array.isArray(sel.estatus_mensajes) ? sel.estatus_mensajes : []).map((m) => (
          <div key={m.id} style={{ display: 'grid', gap: '0.3rem', fontSize: '0.86rem' }}>
            {msgEditId === m.id ? (
              <>
                <textarea
                  className="input"
                  rows={2}
                  value={msgEditTexto}
                  onChange={(e) => setMsgEditTexto(e.target.value)}
                />
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="btn btn-gold btn-sm"
                    disabled={ocupado}
                    onClick={async () => {
                      const ok = await correr(() => editarMensajeEstatus(supabase, sel, user, m.id, msgEditTexto));
                      if (ok) setMsgEditId('');
                    }}
                  >
                    Guardar
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMsgEditId('')}>
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>{m.texto}</div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: '0.74rem' }}>
                    {m.at ? new Date(m.at).toLocaleString('es-MX') : ''}{m.por ? ` · ${m.por}` : ''}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setMsgEditId(m.id); setMsgEditTexto(m.texto || ''); }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={ocupado}
                    onClick={() => confirm('¿Eliminar este mensaje?')
                      && void correr(() => eliminarMensajeEstatus(supabase, sel, user, m.id))}
                  >
                    Eliminar
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        <textarea
          className="input"
          rows={2}
          placeholder="Ej. Trae identificación oficial y comprobante de domicilio."
          value={msgNuevo}
          onChange={(e) => setMsgNuevo(e.target.value)}
        />
        <div>
          <button
            type="button"
            className="btn btn-gold btn-sm"
            disabled={ocupado || !msgNuevo.trim()}
            onClick={async () => {
              const ok = await correr(() => agregarMensajeEstatus(supabase, sel, user, msgNuevo), 'Mensaje enviado al estatus.');
              if (ok) setMsgNuevo('');
            }}
          >
            Enviar mensaje
          </button>
        </div>
      </Seccion>

      <div style={{ borderTop: '1px solid var(--border, #eee)', paddingTop: '0.65rem' }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={ocupado}
          style={{ color: 'var(--danger, #b91c1c)' }}
          onClick={() => void eliminar()}
        >
          Eliminar candidato
        </button>
      </div>
    </div>
  );
}
