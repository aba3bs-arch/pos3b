import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { useMobileLayout } from '../hooks/useMobileLayout.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import {
  EVENTO_MENSAJES,
  EVENTO_SOPORTE,
  USUARIO_BOT,
  abreSolicitudSoporte,
  abrirSolicitudSoporte,
  atiendeSoporte,
  cambiarEstadoSolicitud,
  canalDirecto,
  canalSucursal,
  cargarMensajes,
  enviarMensaje,
  esBotSoporte,
  etiquetaDiaMensaje,
  formatearHoraMensaje,
  fusionarMensajes,
  fusionarSolicitudes,
  idChatUsuario,
  claveDiaMensaje,
  leerMensajesLocales,
  leerSolicitudesLocales,
  listarCanales,
  listarCompaneros,
  marcarCanalLeido,
  mensajesNoLeidos,
  esRolTecnico,
  puedeResolverSoporte,
  puedeVerTodosLosChats,
  sincronizarSolicitudes,
  sucursalDeSesionChat,
  suscribirCanales,
  turnoParaMensaje,
  ultimoMensaje,
} from '../lib/mensajeria.js';
import { responderDuda } from '../lib/soporteBot.js';

const COLORES = ['#3b66b5', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#3f6212'];

function colorDeNombre(nombre) {
  const s = String(nombre || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h + s.charCodeAt(i) * (i + 1)) % COLORES.length;
  return COLORES[h];
}

function iniciales(nombre) {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] || '?') + (partes[1]?.[0] || '')).toUpperCase();
}

function iconoCanal(tipo) {
  if (tipo === 'soporte') return 'help';
  if (tipo === 'grupo' || tipo === 'directo') return 'users';
  return 'building';
}

/** Texto corto del encabezado. Soporte cabe en dos renglones. */
function pistaCanal(tipo) {
  if (tipo === 'sucursal') return 'Sale con tu nombre y tu turno.';
  if (tipo === 'grupo') return 'Lo ven todas las sucursales.';
  if (tipo === 'soporte') return 'El asistente responde.\nUn administrador la cierra.';
  if (tipo === 'directo') return 'Solo ustedes dos.';
  return '';
}

function Avatar({ nombre, size = 36 }) {
  return (
    <span
      className="msg-avatar"
      style={{ width: size, height: size, background: colorDeNombre(nombre) }}
      aria-hidden
    >
      {iniciales(nombre)}
    </span>
  );
}

export default function Mensajes({ supabase, sucursal, user }) {
  const mobile = useMobileLayout();
  const yo = idChatUsuario(user);
  const mia = sucursalDeSesionChat(user, sucursal);
  const veTodos = puedeVerTodosLosChats(user);
  const turno = turnoParaMensaje(user, sucursal);
  const [canalId, setCanalId] = useState(() => canalSucursal(mia));
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [directosExtra, setDirectosExtra] = useState([]);
  const [picker, setPicker] = useState(false);
  const [companeros, setCompaneros] = useState([]);
  const [cargandoGente, setCargandoGente] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [verLista, setVerLista] = useState(true);
  const [solicitudes, setSolicitudes] = useState([]);
  const [cerrando, setCerrando] = useState(false);
  const resuelve = puedeResolverSoporte(user);
  const hiloRef = useRef(null);
  const cajaRef = useRef(null);

  const canales = useMemo(
    () => listarCanales({ user, sucursal, mensajes, directosExtra }),
    [user, sucursal, mensajes, directosExtra],
  );
  const canal = canales.find((c) => c.id === canalId) || canales[0] || null;
  const delHilo = useMemo(
    () => mensajes.filter((m) => m.canal === canal?.id),
    [mensajes, canal?.id],
  );

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      const res = await cargarMensajes(supabase, { user, sucursal });
      if (!vivo) return;
      setMensajes(res.mensajes);
      setAviso(res.aviso || '');
      setCargando(false);
    })();
    const alLocal = () => {
      if (!vivo) return;
      // El disco guarda solo una cola corta. Se suma a lo que ya está en pantalla.
      setMensajes((prev) => fusionarMensajes(prev, leerMensajesLocales(user, sucursal)));
    };
    window.addEventListener(EVENTO_MENSAJES, alLocal);
    const timer = window.setInterval(async () => {
      const res = await cargarMensajes(supabase, { user, sucursal });
      if (!vivo) return;
      setMensajes(res.mensajes);
      setAviso(res.aviso || '');
    }, 8000);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_MENSAJES, alLocal);
      window.clearInterval(timer);
    };
  }, [supabase, user, sucursal]);

  useEffect(() => {
    let vivo = true;
    const cargarSol = async () => {
      const lista = await sincronizarSolicitudes(supabase, { user, sucursal });
      if (vivo) setSolicitudes(lista);
    };
    cargarSol();
    const alLocal = () => {
      if (!vivo) return;
      setSolicitudes((prev) => fusionarSolicitudes(prev, leerSolicitudesLocales(user, sucursal)));
    };
    window.addEventListener(EVENTO_SOPORTE, alLocal);
    const timer = window.setInterval(cargarSol, 8000);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_SOPORTE, alLocal);
      window.clearInterval(timer);
    };
  }, [supabase, user, sucursal]);

  useEffect(() => {
    const ids = canales.map((c) => c.id);
    return suscribirCanales(supabase, ids, (msg) => {
      setMensajes((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, { ...msg, pendiente: false }].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      });
    });
  }, [supabase, canales.map((c) => c.id).join('|')]);

  useEffect(() => {
    if (!canal?.id) return;
    marcarCanalLeido(user, canal.id);
  }, [user, canal?.id, delHilo.length]);

  useEffect(() => {
    const el = hiloRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [canal?.id, delHilo.length, cargando]);

  useEffect(() => {
    if (!canales.some((c) => c.id === canalId) && canales[0]) setCanalId(canales[0].id);
  }, [canales, canalId]);

  const abrirCanal = (id) => {
    setCanalId(id);
    setPicker(false);
    if (mobile) setVerLista(false);
    window.setTimeout(() => cajaRef.current?.focus(), 50);
  };

  const abrirPicker = async () => {
    setPicker(true);
    setBusqueda('');
    if (!supabase) {
      setCompaneros([]);
      return;
    }
    setCargandoGente(true);
    const lista = await listarCompaneros(supabase, { user, sucursal });
    setCompaneros(lista);
    setCargandoGente(false);
  };

  const empezarDirecto = (persona) => {
    const id = canalDirecto(yo, persona.id);
    if (!id) return;
    const extra = {
      id,
      tipo: 'directo',
      seccion: 'Directos',
      titulo: persona.nombre,
      subtitulo: `${persona.rol} · ${etiquetaTienda(persona.sucursal_id)}`,
      destinatario_id: persona.id,
      destinatario_nombre: persona.nombre,
    };
    setDirectosExtra((prev) => (prev.some((c) => c.id === id) ? prev : [...prev, extra]));
    abrirCanal(id);
  };

  const enviar = async () => {
    if (!canal || enviando) return;
    const cuerpo = texto;
    setTexto('');
    setEnviando(true);
    const res = await enviarMensaje(supabase, {
      user,
      sucursal,
      canal: canal.id,
      texto: cuerpo,
      destinatario: canal.tipo === 'directo'
        ? { id: canal.destinatario_id, nombre: canal.destinatario_nombre || canal.titulo }
        : null,
    });
    setEnviando(false);
    if (!res.ok) {
      setTexto(cuerpo);
      setAviso(res.error || 'No se pudo enviar.');
      return;
    }
    const extras = res.mensaje ? [res.mensaje] : [];
    if (canal.tipo === 'soporte' && abreSolicitudSoporte(user)) {
      const sol = await abrirSolicitudSoporte(supabase, { user, sucursal, canal: canal.id, texto: cuerpo });
      const guia = responderDuda(cuerpo);
      const bot = await enviarMensaje(supabase, {
        user: USUARIO_BOT,
        sucursal,
        canal: canal.id,
        texto: guia.texto,
        turnoEtiqueta: 'Ayuda',
      });
      if (bot?.mensaje) extras.push(bot.mensaje);
      setSolicitudes((prev) => fusionarSolicitudes(
        prev,
        [...leerSolicitudesLocales(user, sucursal), sol].filter(Boolean),
      ));
    }
    setMensajes((prev) => fusionarMensajes(prev, [...leerMensajesLocales(user, sucursal), ...extras]));
    if (res.aviso) setAviso(res.aviso);
  };

  const cambiarSolicitud = async (estado) => {
    if (!canal || cerrando) return;
    setCerrando(true);
    const r = await cambiarEstadoSolicitud(supabase, { user, sucursal, canal: canal.id, estado });
    setCerrando(false);
    if (!r.ok) {
      setAviso(r.error || 'No se pudo actualizar la solicitud.');
      return;
    }
    setMensajes((prev) => fusionarMensajes(prev, [
      ...leerMensajesLocales(user, sucursal),
      ...(r.mensaje ? [r.mensaje] : []),
    ]));
    setSolicitudes((prev) => fusionarSolicitudes(
      prev,
      [...leerSolicitudesLocales(user, sucursal), r.solicitud].filter(Boolean),
    ));
    if (r.aviso) setAviso(r.aviso);
  };

  const onTecla = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  const genteFiltrada = companeros.filter((p) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return `${p.nombre} ${p.rol} ${p.sucursal_id}`.toLowerCase().includes(q);
  });

  const secciones = [];
  for (const c of canales) {
    let grupo = secciones.find((s) => s.nombre === c.seccion);
    if (!grupo) {
      grupo = { nombre: c.seccion, items: [] };
      secciones.push(grupo);
    }
    grupo.items.push(c);
  }
  for (const sec of secciones) {
    if (sec.nombre !== 'Soporte') continue;
    sec.items.sort((a, b) => {
      const ea = solicitudes.find((s) => s.canal === a.id)?.estado === 'abierta' ? 0 : 1;
      const eb = solicitudes.find((s) => s.canal === b.id)?.estado === 'abierta' ? 0 : 1;
      return ea - eb || a.titulo.localeCompare(b.titulo, 'es');
    });
  }

  const resumenLista = veTodos
    ? 'Ves todos los chats de la cadena.'
    : resuelve
      ? 'Atiendes el soporte de todas las sucursales.'
      : atiendeSoporte(user)
        ? 'Ves el soporte de todas las sucursales.'
        : 'Tu sucursal, el grupo y soporte.';
  const solicitudActual = solicitudes.find((s) => s.canal === canal?.id) || null;

  let diaAnterior = '';

  return (
    <div className={`msg-app${mobile ? ' msg-app--mobile' : ''}`}>
      <aside className={`msg-lista${mobile && !verLista ? ' msg-lista--oculta' : ''}`}>
        <div className="msg-lista-head">
          <div>
            <strong>Chats</strong>
            <p>{resumenLista}</p>
          </div>
          <button type="button" className="btn btn-primary msg-btn-nuevo" onClick={abrirPicker}>
            <Icon name="plus" size={16} />
            Directo
          </button>
        </div>
        <div className="msg-identidad">
          <Avatar nombre={user?.nombre} size={32} />
          <div>
            <b>{user?.nombre || 'Usuario'}</b>
            <span>{turno.turno_nombre} · {etiquetaTienda(mia)}</span>
          </div>
        </div>
        <div className="msg-canales" role="listbox" aria-label="Conversaciones">
          {secciones.map((sec) => (
            <div key={sec.nombre} className="msg-seccion">
              <div className="msg-seccion-titulo">{sec.nombre}</div>
              {sec.items.map((c) => {
                const last = ultimoMensaje(mensajes, c.id);
                const unread = c.id === canal?.id ? 0 : mensajesNoLeidos(mensajes, user, c.id);
                const activo = c.id === canal?.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={activo}
                    className={`msg-canal${activo ? ' is-active' : ''}`}
                    onClick={() => abrirCanal(c.id)}
                  >
                    <span className={`msg-canal-icono msg-canal-icono--${c.tipo}`}>
                      <Icon name={iconoCanal(c.tipo)} size={16} />
                    </span>
                    <span className="msg-canal-texto">
                      <span className="msg-canal-titulo">{c.titulo}</span>
                      <span className="msg-canal-preview">{last ? last.texto : c.subtitulo}</span>
                    </span>
                    <span className="msg-canal-lado">
                      {c.tipo === 'soporte' && solicitudes.some((s) => s.canal === c.id) && (
                        <span className={`msg-pill${solicitudes.find((s) => s.canal === c.id)?.estado === 'resuelta' ? ' is-ok' : ' is-open'}`}>
                          {solicitudes.find((s) => s.canal === c.id)?.estado === 'resuelta' ? 'Resuelta' : 'Abierta'}
                        </span>
                      )}
                      {unread > 0 && <span className="msg-badge">{unread > 9 ? '9+' : unread}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      <section className={`msg-hilo${mobile && verLista ? ' msg-hilo--oculta' : ''}`} aria-label={canal?.titulo || 'Conversación'}>
        {canal && (
          <header className="msg-hilo-head">
            {mobile && (
              <button type="button" className="btn btn-ghost msg-volver" onClick={() => setVerLista(true)} aria-label="Volver a chats">
                <Icon name="chevronRight" size={18} style={{ transform: 'rotate(180deg)' }} />
              </button>
            )}
            <span className={`msg-canal-icono msg-hilo-icono msg-canal-icono--${canal.tipo}`} aria-hidden>
              <Icon name={iconoCanal(canal.tipo)} size={16} />
            </span>
            <div className="msg-hilo-texto">
              <h3>{canal.titulo}</h3>
              <p className="msg-pista">{pistaCanal(canal.tipo)}</p>
            </div>
            {canal.tipo === 'soporte' && solicitudActual && (
              <div className="msg-soporte-acciones">
                <span className={`msg-pill${solicitudActual.estado === 'resuelta' ? ' is-ok' : ' is-open'}`}>
                  {solicitudActual.estado === 'resuelta'
                    ? `Resuelta${solicitudActual.resuelta_por ? ` · ${solicitudActual.resuelta_por}` : ''}`
                    : 'Abierta'}
                </span>
                {resuelve && (
                  <button
                    type="button"
                    className="btn btn-ghost msg-btn-resolver"
                    disabled={cerrando}
                    onClick={() => cambiarSolicitud(solicitudActual.estado === 'resuelta' ? 'abierta' : 'resuelta')}
                  >
                    {solicitudActual.estado === 'resuelta' ? 'Reabrir' : (mobile ? 'Resolver' : 'Marcar resuelta')}
                  </button>
                )}
              </div>
            )}
          </header>
        )}
        {aviso && <div className="msg-aviso" role="status">{aviso}</div>}
        <div className="msg-burbujas" ref={hiloRef}>
          {cargando && <p className="msg-vacio">Cargando mensajes…</p>}
          {!cargando && delHilo.length === 0 && (
            <p className="msg-vacio">
              {canal?.tipo === 'soporte'
                ? 'Escribe la duda.\nEl asistente responde y queda abierta.'
                : 'Todavía no hay mensajes.\nEscribe abajo para empezar.'}
            </p>
          )}
          {delHilo.map((m) => {
            const dia = claveDiaMensaje(m.created_at);
            const separador = dia !== diaAnterior;
            diaAnterior = dia;
            const mio = m.autor_id === yo;
            const bot = esBotSoporte({ id: m.autor_id });
            return (
              <React.Fragment key={m.id}>
                {separador && <div className="msg-dia">{etiquetaDiaMensaje(m.created_at)}</div>}
                <article className={`msg-burbuja${mio ? ' es-mia' : ''}${bot ? ' msg-burbuja--bot' : ''}`}>
                  {!mio && <Avatar nombre={m.autor_nombre} />}
                  <div className="msg-burbuja-cuerpo">
                    <header>
                      <strong>{mio ? 'Tú' : m.autor_nombre}</strong>
                      <span className="msg-turno">{m.turno_nombre || 'Turno'}</span>
                      <span className="msg-meta">{bot ? 'Asistente del POS' : `${m.autor_rol} · ${etiquetaTienda(m.autor_sucursal)}`}</span>
                    </header>
                    <p>{m.texto}</p>
                    <footer>
                      <time dateTime={m.created_at}>{formatearHoraMensaje(m.created_at)}</time>
                      {m.pendiente ? <span> · en esta caja</span> : null}
                    </footer>
                  </div>
                </article>
              </React.Fragment>
            );
          })}
        </div>
        <form
          className="msg-composer"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <textarea
            ref={cajaRef}
            rows={1}
            value={texto}
            placeholder={canal ? `Escribir en ${canal.titulo}…` : 'Escribe un mensaje'}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={onTecla}
            maxLength={1000}
            aria-label="Mensaje"
          />
          <button type="submit" className="btn btn-primary msg-enviar" disabled={!texto.trim() || enviando || !canal} aria-label="Enviar">
            <Icon name="send" size={18} />
            {!mobile && <span>Enviar</span>}
          </button>
        </form>
      </section>

      {picker && (
        <div className="msg-picker-backdrop" role="presentation" onClick={() => setPicker(false)}>
          <div className="msg-picker" role="dialog" aria-labelledby="msg-picker-titulo" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3 id="msg-picker-titulo">Mensaje directo</h3>
              <button type="button" className="btn btn-ghost" onClick={() => setPicker(false)} aria-label="Cerrar">
                <Icon name="x" size={18} />
              </button>
            </header>
            <p className="muted">
              {veTodos || esRolTecnico(user)
                ? 'Puedes escribirle a cualquier usuario de la cadena.'
                : `Solo compañeros de ${etiquetaTienda(mia)}.`}
            </p>
            <input
              className="input"
              value={busqueda}
              placeholder="Buscar por nombre"
              onChange={(e) => setBusqueda(e.target.value)}
              aria-label="Buscar compañero"
            />
            <div className="msg-picker-lista">
              {cargandoGente && <p className="muted">Buscando personal…</p>}
              {!cargandoGente && !supabase && <p className="muted">Sin nube no se puede cargar el personal.</p>}
              {!cargandoGente && supabase && genteFiltrada.length === 0 && <p className="muted">No hay compañeros para mostrar.</p>}
              {genteFiltrada.map((p) => (
                <button key={p.id} type="button" className="msg-persona" onClick={() => empezarDirecto(p)}>
                  <Avatar nombre={p.nombre} size={32} />
                  <span>
                    <b>{p.nombre}</b>
                    <small>{p.rol} · {etiquetaTienda(p.sucursal_id)}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
