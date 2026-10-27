import React, { useCallback, useEffect, useState } from 'react';
import { cambiarEstadoAlerta, limpiarAvisosConciliacion, listarAlertas } from '../lib/rutaConciliacion/alertas.js';
import { CONTROLES } from '../lib/rutaConciliacion/config.js';
import { puedeGestionarAlerta } from '../lib/rutaConciliacion/plan.js';
import { fmtMonto } from '../lib/consultasUi.js';

const ETIQUETA_ESTADO = {
  abierta: 'Abierta', en_revision: 'En revisión', justificada: 'Justificada', resuelta: 'Resuelta', auto_resuelta: 'Cuadró sola',
};
const ETIQUETA_SEVERIDAD = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' };
const FILTROS_ESTADO = {
  activas: ['abierta', 'en_revision'],
  cerradas: ['justificada', 'resuelta', 'auto_resuelta'],
};

function importe(a, v) {
  if (v == null) return '—';
  return a.unidad === 'pzas' ? `${v} pzas` : fmtMonto(v);
}

function FilaAlerta({ a, user, onCambiar }) {
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const puede = puedeGestionarAlerta(user?.rol, a.severidad);
  const activa = ['abierta', 'en_revision'].includes(a.estado);
  async function aplicar(estado) {
    setTrabajando(true); setError('');
    const res = await onCambiar(a, estado, nota);
    setTrabajando(false);
    if (!res.ok) setError(res.error);
  }
  return <details className={`ruta-alerta ruta-alerta-${a.severidad}`}>
    <summary>
      <span className="ruta-alerta-sev">{ETIQUETA_SEVERIDAD[a.severidad]}</span>
      <strong>{a.venta_folio || 'Sin folio'}</strong>
      <span>{a.tienda || a.sucursal_id || '—'}</span>
      <span className="ruta-alerta-msg">{a.mensaje}</span>
      <b>{ETIQUETA_ESTADO[a.estado]}</b>
    </summary>
    <p className="muted">
      {a.control} · {CONTROLES[a.control]?.nombre || 'Control'} · Repartidor: {a.repartidor_nombre || '—'}
      {' '}· Detectada {String(a.primera_vez_at || '').slice(0, 10)}
    </p>
    {a.esperado != null && <div className="table-wrap"><table className="data"><thead><tr><th>Esperado</th><th>Registrado</th><th>Diferencia</th></tr></thead>
      <tbody><tr><td>{importe(a, a.esperado)}</td><td>{importe(a, a.registrado)}</td><td className="ruta-consol-rojo">{importe(a, a.diferencia)}</td></tr></tbody></table></div>}
    {a.nota_resolucion && <p className="ruta-consol-nota">{ETIQUETA_ESTADO[a.estado]}{a.resuelta_por ? ` por ${a.resuelta_por}` : ''}: {a.nota_resolucion}</p>}
    {puede ? <div className="ruta-alerta-acciones">
      {activa && <>
        <input className="input" placeholder="Nota (obligatoria para justificar o resolver)" value={nota} onChange={(e) => setNota(e.target.value)} />
        {a.estado === 'abierta' && <button type="button" className="btn btn-ghost" disabled={trabajando} onClick={() => aplicar('en_revision')}>Tomar en revisión</button>}
        <button type="button" className="btn btn-ghost" disabled={trabajando} onClick={() => aplicar('justificada')}>Justificar</button>
        <button type="button" className="btn btn-primary" disabled={trabajando} onClick={() => aplicar('resuelta')}>Resolver</button>
      </>}
      {!activa && <button type="button" className="btn btn-ghost" disabled={trabajando} onClick={() => aplicar('abierta')}>Reabrir</button>}
    </div> : <p className="muted">{a.severidad === 'critica' ? 'Solo un administrador puede gestionar esta alerta.' : 'Solo lectura.'}</p>}
    {error && <p role="alert" className="ruta-consol-rojo">{error}</p>}
  </details>;
}

export default function AlertasConciliacionRuta({ supabase, user, refrescar = 0, onCambio }) {
  const [vista, setVista] = useState('activas');
  const [severidad, setSeveridad] = useState('');
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    const res = await listarAlertas(supabase, { estados: FILTROS_ESTADO[vista], severidad });
    setAlertas(res.data || []);
    if (!res.ok) setError(res.error || 'No se pudieron consultar las alertas.');
    setCargando(false);
    if (res.ok && vista === 'activas') void limpiarAvisosConciliacion(supabase, user?.nombre);
  }, [supabase, vista, severidad, user?.nombre]);

  useEffect(() => { cargar(); }, [cargar, refrescar]);

  async function cambiar(alerta, estado, nota) {
    const res = await cambiarEstadoAlerta(supabase, alerta, { estado, nota, usuario: user, rol: user?.rol });
    if (res.ok) { await cargar(); onCambio?.(); }
    return res;
  }

  return <div className="ruta-alertas">
    <div className="ruta-consol-filtros">
      <label>Mostrar<select className="input" value={vista} onChange={(e) => setVista(e.target.value)}>
        <option value="activas">Abiertas y en revisión</option><option value="cerradas">Cerradas</option></select></label>
      <label>Severidad<select className="input" value={severidad} onChange={(e) => setSeveridad(e.target.value)}>
        <option value="">Todas</option>{Object.entries(ETIQUETA_SEVERIDAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <button type="button" className="btn btn-ghost" onClick={cargar} disabled={cargando}>{cargando ? 'Consultando…' : 'Actualizar'}</button>
    </div>
    {error && <p role="alert" className="ruta-consol-rojo">{error}</p>}
    {!error && !cargando && !alertas.length && <p className="ruta-consol-verde">{vista === 'activas'
      ? 'Sin alertas abiertas. Se generan al pulsar Consolidar en la pestaña Consolidación.' : 'No hay alertas cerradas.'}</p>}
    {alertas.map((a) => <FilaAlerta key={a.id} a={a} user={user} onCambiar={cambiar} />)}
    <p className="muted">Las alertas solo avisan: no bloquean ventas, cobros ni liquidaciones.</p>
  </div>;
}
