import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AVISO_FALTA_CONTABILIDAD,
  aprobarPrestamoAdmin,
  aprobarPrestamoSocio,
  aprobarVale,
  cargarPrestamoEmpleadoACorte,
  cargarValeACorte,
  listarPrestamos,
  listarPrestamosInterarea,
  listarVales,
  rechazarPrestamo,
  cancelarVale,
  registrarPrestamo,
  registrarPrestamoInterarea,
  registrarVale,
} from '../lib/valesPrestamos.js';
import {
  AREAS_CONTABILIDAD,
  BENEFICIARIOS_VALES,
  CATEGORIAS_VALE,
  CUOTA_SEMANAL_MINIMA,
  ETIQUETA_AREA,
  HORA_LIMITE_VALE,
  MONTO_PRESTAMO_REQUIERE_SOCIO,
  beneficiarioValePorId,
  esSocioAprobadorPrestamo,
  etiquetaCategoriaVale,
  etiquetaEstadoPrestamo,
  etiquetaEstadoVale,
  prestamoPuedeImprimir,
  valePuedeImprimir,
  valePuedeCancelar,
  valeRequiereAutorizacionAdmin,
} from '../lib/contabilidadConstants.js';
import { listarNotificacionesPendientes } from '../lib/contabilidadNotificaciones.js';
import { imprimirPrestamo, imprimirVale } from '../lib/impresionContabilidad.js';
import { normalizarRol } from '../lib/roles.js';
import { empleadosVisiblesParaTienda } from '../lib/empleadosVisibles.js';
import { tiendaPuedeGenerarVales, EVENTO_VALES_TIENDAS } from '../lib/posConfig.js';
import PanelAsistenciaGasolina from '../components/PanelAsistenciaGasolina.jsx';
import SelectorCalendario from '../components/SelectorCalendario.jsx';

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ValesPrestamos({ supabase, sucursal, user, irAPendientes, onPendientesVisto, navOpts, onNavOptsVisto, retornoModulo, onRegresarCorte }) {
  const [pestana, setPestana] = useState('vales');
  const [aviso, setAviso] = useState('');
  const [vales, setVales] = useState([]);
  const [prestamosArea, setPrestamosArea] = useState([]);
  const [prestamosEmp, setPrestamosEmp] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [pinSocio, setPinSocio] = useState('');

  const [valeForm, setValeForm] = useState({
    beneficiarioId: '',
    categoria: 'consumo',
    monto: '',
    motivo: '',
    fecha: hoyISO(),
  });
  const [prestForm, setPrestForm] = useState({
    origen: 'virtual',
    gastos_area: 'abarrotes',
    monto: '',
    notas: '',
    fecha: hoyISO(),
  });
  const [prestEmpForm, setPrestEmpForm] = useState({
    usuarioId: '',
    monto: '',
    notas: '',
    fecha: hoyISO(),
    areaCorte: 'virtual',
  });

  const esAdmin = normalizarRol(user?.rol) === 'Administrador';
  const puedeGenerarVales = tiendaPuedeGenerarVales(sucursal);
  const esSocio = esSocioAprobadorPrestamo(user?.nombre);
  const requiereAuthAhora = valeRequiereAutorizacionAdmin();
  const valeFormRequiereAdmin = valeForm.categoria === 'consumo' || requiereAuthAhora;

  const valesPendientes = useMemo(() => vales.filter((v) => v.estado_aprobacion === 'pendiente_admin'), [vales]);
  const prestamosPendientesAdmin = useMemo(() => prestamosEmp.filter((p) => p.estado === 'pendiente_admin'), [prestamosEmp]);
  const prestamosPendientesSocio = useMemo(() => prestamosEmp.filter((p) => p.estado === 'pendiente_socio'), [prestamosEmp]);

  const recargarTodo = useCallback(async () => {
    if (!supabase) return;
    const [vRes, paRes, peRes, nRes] = await Promise.all([
      listarVales(supabase, { sucursal, tipo: 'indirecto' }),
      listarPrestamosInterarea(supabase, { sucursal }),
      listarPrestamos(supabase, { sucursal, incluirPendientes: true }),
      listarNotificacionesPendientes(supabase, { sucursal }),
    ]);
    if (vRes.aviso) setAviso(vRes.aviso);
    setVales(vRes.data || []);
    setPrestamosArea(paRes.data || []);
    setPrestamosEmp(peRes.data || []);
    setNotifs(nRes.data || []);
  }, [supabase, sucursal]);

  useEffect(() => {
    recargarTodo();
    if (!supabase) return;
    supabase
      .from('usuarios')
      .select('id, nombre, rol, sucursal_id')
      .order('nombre')
      .then(({ data }) => setEmpleados(empleadosVisiblesParaTienda(data || [], sucursal, user?.rol)));
  }, [recargarTodo, supabase, sucursal, user?.rol]);

  useEffect(() => {
    if (irAPendientes && (esAdmin || esSocio)) {
      setPestana('pendientes');
      onPendientesVisto?.();
    }
  }, [irAPendientes, esAdmin, esSocio, onPendientesVisto]);

  useEffect(() => {
    if (!navOpts) return;
    if (navOpts.pestana) setPestana(navOpts.pestana);
    if (navOpts.retorno === 'Corte Virtual') {
      setPrestForm((prev) => ({ ...prev, origen: 'virtual', gastos_area: prev.gastos_area === 'virtual' ? 'abarrotes' : prev.gastos_area }));
    }
    onNavOptsVisto?.();
  }, [navOpts, onNavOptsVisto]);

  const guardarVale = async () => {
    if (!supabase) return alert('Sin conexión.');
    if (!puedeGenerarVales) return alert('Esta tienda no puede generar vales. El administrador debe autorizarla en Configuración → Vales y préstamos.');
    const ben = beneficiarioValePorId(valeForm.beneficiarioId);
    if (!ben) return alert('Selecciona beneficiario.');
    const monto = Number(valeForm.monto);
    if (!(monto > 0)) return alert('Monto inválido.');
    const res = await registrarVale(supabase, {
      sucursal_id: sucursal || 'MAIN',
      usuario_id: null,
      nombre_empleado: ben.nombre,
      tipo: 'indirecto',
      area: ben.area,
      categoria: valeForm.categoria,
      monto,
      motivo: valeForm.motivo.trim() || null,
      fecha: valeForm.fecha || hoyISO(),
      created_by: user?.nombre || null,
    }, { rolActor: user?.rol, nombreActor: user?.nombre });
    if (!res.ok) {
      if (String(res.error).includes('fix_contabilidad')) setAviso(res.error);
      return alert(res.error);
    }
    alert(res.mensaje || 'Vale registrado.');
    if (!res.pendiente && res.requiereFirma && confirm('¿Imprimir vale para firma del beneficiario?')) {
      imprimirVale(res.vale, { mostrarFirma: true });
    }
    setValeForm({ beneficiarioId: '', categoria: 'consumo', monto: '', motivo: '', fecha: hoyISO() });
    recargarTodo();
  };

  const guardarPrestamoEmpleado = async () => {
    if (!supabase) return alert('Sin conexión.');
    const emp = empleados.find((e) => String(e.id) === String(prestEmpForm.usuarioId));
    if (!emp) return alert('Selecciona empleado.');
    const monto = Number(prestEmpForm.monto);
    if (!(monto > 0)) return alert('Monto inválido.');
    const res = await registrarPrestamo(supabase, {
      sucursal_id: sucursal || 'MAIN',
      usuario_id: emp.id,
      nombre_empleado: emp.nombre,
      monto_original: monto,
      fecha: prestEmpForm.fecha || hoyISO(),
      notas: prestEmpForm.notas.trim() || null,
      created_by: user?.nombre || null,
    });
    if (!res.ok) return alert(res.error);
    alert(res.mensaje);
    setPrestEmpForm({ usuarioId: '', monto: '', notas: '', fecha: hoyISO(), areaCorte: prestEmpForm.areaCorte });
    recargarTodo();
  };

  const guardarPrestamoGastos = async () => {
    if (!supabase) return alert('Sin conexión.');
    if (prestForm.origen === prestForm.gastos_area) return alert('Origen y destino deben ser distintos.');
    const monto = Number(prestForm.monto);
    if (!(monto > 0)) return alert('Monto inválido.');
    const res = await registrarPrestamoInterarea(supabase, {
      sucursal_id: sucursal || 'MAIN',
      origen: prestForm.origen,
      destino: prestForm.gastos_area,
      monto,
      fecha: prestForm.fecha || hoyISO(),
      notas: prestForm.notas.trim() || `Pago gastos ${ETIQUETA_AREA[prestForm.gastos_area]}`,
      created_by: user?.nombre || null,
    });
    if (!res.ok) return alert(res.error);
    recargarTodo();
  };

  const aprobarV = async (id) => {
    const res = await aprobarVale(supabase, id, { nombreAprobador: user?.nombre, cargarCorte: true });
    if (!res.ok) return alert(res.error);
    alert('Vale aprobado y cargado al corte.');
    if (confirm('¿Imprimir vale?')) imprimirVale(res.vale, { mostrarFirma: true });
    recargarTodo();
  };

  const aprobarPAdmin = async (id) => {
    const res = await aprobarPrestamoAdmin(supabase, id, {
      nombreAprobador: user?.nombre,
      cargarCorte: true,
      areaCorte: prestEmpForm.areaCorte,
    });
    if (!res.ok) return alert(res.error);
    alert(res.mensaje);
    if (!res.pendienteSocio && res.prestamo && confirm('¿Imprimir ticket de préstamo?')) imprimirPrestamo(res.prestamo);
    recargarTodo();
  };

  const aprobarPSocio = async (id) => {
    if (!pinSocio.trim()) return alert('Ingresa tu PIN (Antonio, Francisco o José Luis).');
    const res = await aprobarPrestamoSocio(supabase, id, { pin: pinSocio.trim(), sucursal, cargarCorte: true });
    if (!res.ok) return alert(res.error);
    setPinSocio('');
    alert(res.mensaje);
    if (confirm('¿Imprimir ticket?')) imprimirPrestamo(res.prestamo);
    recargarTodo();
  };

  const imprimirValeSi = (v) => {
    if (!valePuedeImprimir(v)) return alert('El vale aún no está aprobado.');
    imprimirVale(v, { mostrarFirma: true });
  };

  const imprimirPrestamoSi = (p) => {
    if (!prestamoPuedeImprimir(p)) return alert('El préstamo aún no está aprobado.');
    imprimirPrestamo(p);
  };

  const cargarValeManual = async (v) => {
    const res = await cargarValeACorte(supabase, v);
    if (!res.ok) return alert(res.error);
    alert(res.yaCargado ? 'Ya estaba en corte.' : 'Vale cargado al corte manualmente.');
    recargarTodo();
  };

  const cargarPrestamoManual = async (p) => {
    const res = await cargarPrestamoEmpleadoACorte(supabase, p, prestEmpForm.areaCorte);
    if (!res.ok) return alert(res.error);
    alert(res.yaCargado ? 'Ya estaba en corte.' : 'Préstamo cargado al corte.');
    recargarTodo();
  };

  const cancelarV = async (v) => {
    if (!esAdmin) return alert('Solo el administrador puede cancelar vales.');
    if (!valePuedeCancelar(v)) return alert('Este vale ya no se puede cancelar.');
    const motivo = prompt(`¿Cancelar vale ${v.folio}?\nMotivo (opcional):`);
    if (motivo === null) return;
    const res = await cancelarVale(supabase, v.id, { nombre: user?.nombre, motivo: motivo.trim() || null });
    if (!res.ok) return alert(res.error);
    alert('Vale cancelado.');
    recargarTodo();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {retornoModulo && onRegresarCorte && (
        <div
          className="card"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderLeft: '4px solid #8e44ad',
            background: 'rgba(142,68,173,0.08)',
          }}
        >
          <div>
            <strong>Solicitud de préstamo de área</strong>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              Registre el préstamo entre áreas y regrese al corte virtual para continuar.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={onRegresarCorte}>
            Regresar al corte
          </button>
        </div>
      )}
      {aviso && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', background: 'rgba(225,153,41,0.08)' }}>
          <strong>Configuración pendiente</strong>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>{aviso || AVISO_FALTA_CONTABILIDAD}</p>
        </div>
      )}

      {!puedeGenerarVales && (
        <div className="card" style={{ borderLeft: '4px solid var(--danger)', background: 'rgba(211,47,47,0.06)' }}>
          <strong>Esta tienda no está autorizada para generar vales.</strong>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
            El administrador puede habilitarla en <strong>Configuración → Vales y préstamos</strong>.
          </p>
        </div>
      )}

      {(esAdmin || esSocio) && notifs.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--danger)', background: 'rgba(211,47,47,0.06)' }}>
          <strong>{notifs.length} pendiente(s) de autorización</strong>
          <button type="button" className="btn btn-ghost" style={{ marginLeft: '0.5rem' }} onClick={() => setPestana('pendientes')}>
            Ver bandeja
          </button>
        </div>
      )}

      <div className="card" style={{ fontSize: '0.85rem' }}>
        <strong>Vales consumo</strong> — Siempre requieren autorización del administrador (notificación en el dispositivo).
        <br />
        <strong>Gasolina, herramienta y accesorios</strong> — Antes de las {HORA_LIMITE_VALE}:00 se imprimen con firma; después de las 9:00 el admin debe aprobar.
        <br />
        <strong>Préstamos</strong> — Admin aprueba siempre; mayores a ${MONTO_PRESTAMO_REQUIERE_SOCIO} requieren Antonio, Francisco o José Luis.
        Cuota semanal mín. ${CUOTA_SEMANAL_MINIMA} en nómina.
        {requiereAuthAhora && !esAdmin && valeForm.categoria !== 'consumo' && (
          <span style={{ color: 'var(--danger)' }}> · Ahora ({new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}) vales post-9:00 van a bandeja admin.</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {['vales', 'prestamos', 'prestamos_emp', esAdmin && 'gasolina', (esAdmin || esSocio) && 'pendientes'].filter(Boolean).map((p) => (
          <button key={p} type="button" className={`btn ${pestana === p ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPestana(p)}>
            {p === 'vales' && 'Vales'}
            {p === 'prestamos' && 'Préstamos área'}
            {p === 'prestamos_emp' && 'Préstamos empleados'}
            {p === 'gasolina' && 'Gasolina / asistencia'}
            {p === 'pendientes' && `Pendientes (${valesPendientes.length + prestamosPendientesAdmin.length + (esSocio ? prestamosPendientesSocio.length : 0)})`}
          </button>
        ))}
      </div>

      {pestana === 'pendientes' && (esAdmin || esSocio) && (
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Bandeja de aprobaciones</h3>
          {esAdmin && valesPendientes.length > 0 && (
            <>
              <h4 style={{ margin: '0.5rem 0' }}>Vales pendientes</h4>
              {valesPendientes.map((v) => (
                <div key={v.id} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.5rem', padding: '0.5rem', background: 'var(--surface)', borderRadius: 8 }}>
                  <span>{v.folio} · {v.nombre_empleado} · {fmt(v.monto)} · {etiquetaCategoriaVale(v.categoria)}</span>
                  <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={() => aprobarV(v.id)}>Aprobar</button>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => cancelarV(v)}>Cancelar</button>
                </div>
              ))}
            </>
          )}
          {esAdmin && prestamosPendientesAdmin.length > 0 && (
            <>
              <h4 style={{ margin: '0.75rem 0 0.5rem' }}>Préstamos — admin</h4>
              {prestamosPendientesAdmin.map((p) => (
                <div key={p.id} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.5rem', padding: '0.5rem', background: 'var(--surface)', borderRadius: 8 }}>
                  <span>{p.nombre_empleado} · {fmt(p.monto_original)}{Number(p.monto_original) > MONTO_PRESTAMO_REQUIERE_SOCIO ? ' · +socio' : ''}</span>
                  <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={() => aprobarPAdmin(p.id)}>Aprobar</button>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => rechazarPrestamo(supabase, p.id, { nombre: user?.nombre }).then(recargarTodo)}>Rechazar</button>
                </div>
              ))}
            </>
          )}
          {esSocio && prestamosPendientesSocio.length > 0 && (
            <>
              <h4 style={{ margin: '0.75rem 0 0.5rem' }}>Préstamos +$1,000 — socio</h4>
              <input className="input" type="password" placeholder="PIN socio" value={pinSocio} onChange={(e) => setPinSocio(e.target.value)} style={{ maxWidth: 200, marginBottom: '0.5rem' }} />
              {prestamosPendientesSocio.map((p) => (
                <div key={p.id} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.5rem', padding: '0.5rem', background: 'var(--surface)', borderRadius: 8 }}>
                  <span>{p.nombre_empleado} · {fmt(p.monto_original)}</span>
                  <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={() => aprobarPSocio(p.id)}>Autorizar</button>
                </div>
              ))}
            </>
          )}
          {valesPendientes.length === 0 && prestamosPendientesAdmin.length === 0 && (!esSocio || prestamosPendientesSocio.length === 0) && (
            <p className="muted">Sin pendientes.</p>
          )}
        </div>
      )}

      {pestana === 'vales' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Nuevo vale</h3>
            <div className="grid-2">
              <select className="select" value={valeForm.beneficiarioId} onChange={(e) => setValeForm({ ...valeForm, beneficiarioId: e.target.value })}>
                <option value="">— Beneficiario —</option>
                {BENEFICIARIOS_VALES.map((b) => (
                  <option key={b.id} value={b.id}>{b.nombre} — {ETIQUETA_AREA[b.area]}</option>
                ))}
              </select>
              <select className="select" value={valeForm.categoria} onChange={(e) => setValeForm({ ...valeForm, categoria: e.target.value })}>
                {CATEGORIAS_VALE.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}{c.descuentaNomina ? ' (nómina)' : ' (sin nómina)'}</option>
                ))}
              </select>
              <input className="input" type="number" min="0" step="0.01" placeholder="Monto" value={valeForm.monto} onChange={(e) => setValeForm({ ...valeForm, monto: e.target.value })} />
              <SelectorCalendario label="Fecha del vale" value={valeForm.fecha} onChange={(f) => setValeForm({ ...valeForm, fecha: f })} />
              <input className="input" placeholder="Motivo" style={{ gridColumn: '1 / -1' }} value={valeForm.motivo} onChange={(e) => setValeForm({ ...valeForm, motivo: e.target.value })} />
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} disabled={!puedeGenerarVales} onClick={guardarVale}>
              {valeFormRequiereAdmin && !esAdmin ? 'Solicitar vale (requiere autorización)' : 'Registrar vale'}
            </button>
            {valeFormRequiereAdmin && !esAdmin && (
              <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'var(--brand-red)' }}>
                {valeForm.categoria === 'consumo'
                  ? 'Los vales de consumo siempre requieren aprobación del administrador.'
                  : `Son las ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} — vales después de las ${HORA_LIMITE_VALE}:00 van a bandeja del administrador.`}
              </p>
            )}
          </div>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem' }}>Vales registrados</h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Estado</th>
                    <th>Categoría</th>
                    <th>Beneficiario</th>
                    <th>Monto</th>
                    <th>Corte</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {vales.map((v) => (
                    <tr key={v.id}>
                      <td>{v.folio}</td>
                      <td>{etiquetaEstadoVale(v)}</td>
                      <td>{etiquetaCategoriaVale(v.categoria)}</td>
                      <td>{v.nombre_empleado}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(v.monto)}</td>
                      <td className="muted">{v.cargado_corte ? 'Sí' : 'No'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {valePuedeImprimir(v) && (
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem' }} onClick={() => imprimirValeSi(v)}>Imprimir</button>
                        )}
                        {esAdmin && valePuedeImprimir(v) && !v.cargado_corte && (
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem' }} onClick={() => cargarValeManual(v)}>→ Corte</button>
                        )}
                        {esAdmin && valePuedeCancelar(v) && (
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem', color: 'var(--danger)' }} onClick={() => cancelarV(v)}>Cancelar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {pestana === 'gasolina' && esAdmin && (
        <PanelAsistenciaGasolina supabase={supabase} sucursal={sucursal} user={user} />
      )}

      {pestana === 'prestamos' && (
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem' }}>Préstamo entre áreas (gastos)</h3>
          <div className="grid-2">
            <select className="select" value={prestForm.origen} onChange={(e) => setPrestForm({ ...prestForm, origen: e.target.value })}>
              {AREAS_CONTABILIDAD.map((a) => <option key={a} value={a}>{ETIQUETA_AREA[a]}</option>)}
            </select>
            <select className="select" value={prestForm.gastos_area} onChange={(e) => setPrestForm({ ...prestForm, gastos_area: e.target.value })}>
              {AREAS_CONTABILIDAD.map((a) => <option key={a} value={a}>{ETIQUETA_AREA[a]}</option>)}
            </select>
            <input className="input" type="number" placeholder="Monto" value={prestForm.monto} onChange={(e) => setPrestForm({ ...prestForm, monto: e.target.value })} />
            <button type="button" className="btn btn-primary" onClick={guardarPrestamoGastos}>Registrar</button>
          </div>
          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table className="data">
              <thead><tr><th>Fecha</th><th>Origen</th><th>Destino</th><th>Monto</th></tr></thead>
              <tbody>
                {prestamosArea.map((p) => (
                  <tr key={p.id}><td>{p.fecha}</td><td>{ETIQUETA_AREA[p.origen]}</td><td>{ETIQUETA_AREA[p.destino]}</td><td>{fmt(p.monto)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pestana === 'prestamos_emp' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem' }}>Préstamo a empleado</h3>
            <p className="muted" style={{ fontSize: '0.85rem' }}>Notifica al admin. Cuota semanal mín. ${CUOTA_SEMANAL_MINIMA} en nómina.</p>
            <div className="grid-2">
              <select className="select" value={prestEmpForm.usuarioId} onChange={(e) => setPrestEmpForm({ ...prestEmpForm, usuarioId: e.target.value })}>
                <option value="">— Empleado —</option>
                {empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
              <input className="input" type="number" placeholder="Monto" value={prestEmpForm.monto} onChange={(e) => setPrestEmpForm({ ...prestEmpForm, monto: e.target.value })} />
              <select className="select" value={prestEmpForm.areaCorte} onChange={(e) => setPrestEmpForm({ ...prestEmpForm, areaCorte: e.target.value })}>
                {AREAS_CONTABILIDAD.map((a) => <option key={a} value={a}>Corte: {ETIQUETA_AREA[a]}</option>)}
              </select>
              <input className="input" placeholder="Notas" value={prestEmpForm.notas} onChange={(e) => setPrestEmpForm({ ...prestEmpForm, notas: e.target.value })} />
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={guardarPrestamoEmpleado}>
              Solicitar préstamo (requiere autorización)
            </button>
            <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem' }}>
              Todo préstamo a empleado queda pendiente hasta que el administrador apruebe{!esAdmin ? ' (y socio si supera $1,000)' : ''}.
            </p>
          </div>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem' }}>Préstamos</h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Estado</th><th>Empleado</th><th>Monto</th><th>Saldo</th><th>Cuota/sem</th><th>Corte</th><th /></tr>
                </thead>
                <tbody>
                  {prestamosEmp.map((p) => (
                    <tr key={p.id}>
                      <td>{etiquetaEstadoPrestamo(p)}</td>
                      <td>{p.nombre_empleado}</td>
                      <td>{fmt(p.monto_original)}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(p.saldo)}</td>
                      <td>{p.cuota_semanal ? fmt(p.cuota_semanal) : '—'}</td>
                      <td className="muted">{p.cargado_corte ? 'Sí' : 'No'}</td>
                      <td>
                        {prestamoPuedeImprimir(p) && <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem' }} onClick={() => imprimirPrestamoSi(p)}>Imprimir</button>}
                        {esAdmin && prestamoPuedeImprimir(p) && !p.cargado_corte && (
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem' }} onClick={() => cargarPrestamoManual(p)}>→ Corte</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
