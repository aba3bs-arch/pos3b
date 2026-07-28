import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  etiquetaGrupoPago,
  guardarCorte,
  corregirCorte,
  leerCortesLocales,
  corteYaRegistrado,
  consultarCortes,
  armarCorroboracion,
  RUBROS_CORROBORACION,
  fechaCorteSugerida,
} from '../lib/corteCaja.js';
import {
  EVENTO_TURNOS,
  leerTurnos,
  nombreTurnoLegible,
  turnoActual,
  turnoEnEntrega,
  turnoIdParaUsuario,
  turnosDisponiblesParaCorte,
  usuarioAutorizadoCorte,
  leerToleranciaTurnos,
} from '../lib/turnos.js';
import { normalizarRol } from '../lib/roles.js';
import { EVENTO_EXTENSION_SESION, minutosRestantesExtension } from '../lib/extensionSesionTurno.js';
import {
  cargarDiaCaja,
  lineasCancelablesVenta,
  listaMovimientosCaja,
  registrarCancelacion,
  resumirMovimientosCaja,
} from '../lib/movimientosCaja.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import { imprimirCorte } from '../lib/impresion.js';
import { leerConfigImpresion } from '../lib/posConfig.js';
import SelectorCalendario from '../components/SelectorCalendario.jsx';

function fmtHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
}

/** Arma payload de impresión desde un corte ya guardado (local o nube). */
function datosImpresionCorteGuardado(c) {
  if (!c) return null;
  const contado = c.efectivoContado ?? c.efectivo_contado;
  const esperado = c.efectivoEsperado ?? c.efectivo_esperado;
  const total = c.totalVentas ?? c.total_ventas ?? c.total;
  const dif =
    c.diferencia != null
      ? Number(c.diferencia)
      : contado != null && esperado != null
        ? Number(contado) - Number(esperado)
        : null;
  return {
    fecha: c.fecha,
    sucursal: c.sucursal || c.sucursal_id,
    usuario: c.usuario,
    turno: c.turno_nombre || c.turno || null,
    tickets: c.tickets ?? 0,
    cancelaciones: c.cancelaciones ?? 0,
    totalBruto: c.totalBruto ?? total,
    totalCancelaciones: c.totalCancelaciones ?? 0,
    total: Number(total) || 0,
    detalleMetodos: Array.isArray(c.detalleMetodos)
      ? c.detalleMetodos
      : Array.isArray(c.detalle_metodos)
        ? c.detalle_metodos
        : [],
    efectivoEsperado: Number(esperado) || 0,
    efectivoContado: contado == null || contado === '' ? null : Number(contado),
    diferencia: dif,
    corroboracion: c.corroboracion && typeof c.corroboracion === 'object' ? c.corroboracion : {},
    notas: c.notas || '',
  };
}

export default function CorteCaja({ supabase, sucursal, user, inventario, inventarioCompleto, cargarDatos }) {
  const [turnos, setTurnos] = useState(() => leerTurnos());
  const [turnoActivo, setTurnoActivo] = useState(() => {
    const list = leerTurnos();
    const entrega = turnoEnEntrega(list, new Date(), null, { user, sucursal });
    const asignado = turnoIdParaUsuario(user);
    if (entrega && String(asignado) === String(entrega.id)) return entrega;
    return turnoActual(list);
  });
  const [fecha, setFecha] = useState(() => fechaCorteSugerida(turnoActivo));
  const [turnoManual, setTurnoManual] = useState(false);
  const [pestana, setPestana] = useState('corte');
  const [ventas, setVentas] = useState([]);
  const [cancelaciones, setCancelaciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [efectivoContado, setEfectivoContado] = useState('');
  const [corroboracionContada, setCorroboracionContada] = useState({
    tarjeta: '',
    transferencia: '',
    qr: '',
  });
  const [notas, setNotas] = useState('');
  const [historial, setHistorial] = useState(() => leerCortesLocales());
  const [msg, setMsg] = useState('');

  const [ventaSel, setVentaSel] = useState('');
  const [lineasCancel, setLineasCancel] = useState([]);
  const [motivoCancel, setMotivoCancel] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [ventasOtrasTiendas, setVentasOtrasTiendas] = useState(null);
  const [ventasDiaSinTurno, setVentasDiaSinTurno] = useState(0);
  const [corteExistente, setCorteExistente] = useState(null);
  const [modoCorregir, setModoCorregir] = useState(false);
  const [bloqueoCorte, setBloqueoCorte] = useState('');

  const resumen = useMemo(() => resumirMovimientosCaja(ventas, cancelaciones), [ventas, cancelaciones]);
  const movimientos = useMemo(() => listaMovimientosCaja(ventas, cancelaciones), [ventas, cancelaciones]);

  const diferencia = useMemo(() => {
    const contado = parseFloat(efectivoContado);
    if (Number.isNaN(contado)) return null;
    return contado - resumen.efectivoEsperado;
  }, [efectivoContado, resumen.efectivoEsperado]);

  const corroboracion = useMemo(
    () => armarCorroboracion(resumen.grupos, corroboracionContada),
    [resumen.grupos, corroboracionContada],
  );

  const ventaParaCancel = useMemo(() => ventas.find((v) => String(v.id) === String(ventaSel)), [ventas, ventaSel]);

  const cargar = useCallback(async () => {
    if (!supabase) {
      setError('Configura Supabase para consultar ventas.');
      setVentas([]);
      setCancelaciones([]);
      return;
    }
    setLoading(true);
    setError('');
    setMsg('');
    setAviso('');
    const {
      ventas: rows,
      cancelaciones: canc,
      error: err,
      aviso: av,
      ventasOtrasTiendas: otras,
      ventasDiaSinTurno: sinTurno,
    } = await cargarDiaCaja(supabase, {
      sucursal,
      fecha,
      turno: turnoActivo,
    });
    setLoading(false);
    if (err) {
      setError(err);
      setVentas([]);
      setCancelaciones([]);
      setVentasOtrasTiendas(null);
      setVentasDiaSinTurno(0);
      return;
    }
    setVentas(rows);
    setCancelaciones(canc);
    setVentasOtrasTiendas(otras);
    setVentasDiaSinTurno(Number(sinTurno) || 0);
    if (av) setAviso(av);
  }, [supabase, sucursal, fecha, turnoActivo?.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!ventaParaCancel) {
      setLineasCancel([]);
      return;
    }
    setLineasCancel(
      lineasCancelablesVenta(ventaParaCancel, cancelaciones).map((l) => ({
        ...l,
        qtyCancelar: 0,
      })),
    );
  }, [ventaParaCancel, cancelaciones]);

  const opcionesCorte = useMemo(
    () => turnosDisponiblesParaCorte(turnos, new Date(), null, { user, sucursal }),
    [turnos, user, sucursal],
  );
  /** Todos los turnos configurados (para consultar nocturno aunque ya pasó la gracia). */
  const opcionesTurnoConsulta = useMemo(() => {
    const disponibles = new Map(opcionesCorte.map((o) => [String(o.turno.id), o.motivo]));
    return (turnos || []).map((t) => ({
      turno: t,
      motivo: disponibles.get(String(t.id)) || 'consulta',
    }));
  }, [turnos, opcionesCorte]);
  const minsExt = minutosRestantesExtension(user, sucursal);

  useEffect(() => {
    const sync = () => {
      const t = leerTurnos();
      setTurnos(t);
      if (!turnoManual) {
        const entrega = turnoEnEntrega(t, new Date(), null, { user, sucursal });
        const asignado = turnoIdParaUsuario(user);
        const sugerido =
          entrega && String(asignado) === String(entrega.id) ? entrega : turnoActual(t);
        setTurnoActivo(sugerido);
        setFecha(fechaCorteSugerida(sugerido));
      }
    };
    sync();
    window.addEventListener(EVENTO_TURNOS, sync);
    window.addEventListener(EVENTO_EXTENSION_SESION, sync);
    const id = setInterval(sync, 30_000);
    return () => {
      window.removeEventListener(EVENTO_TURNOS, sync);
      window.removeEventListener(EVENTO_EXTENSION_SESION, sync);
      clearInterval(id);
    };
  }, [user, sucursal, turnoManual]);

  useEffect(() => {
    if (!turnoActivo) {
      setBloqueoCorte('No hay turno configurado.');
      return;
    }
    const auth = usuarioAutorizadoCorte(user, turnoActivo, new Date(), { turnos, sucursal });
    setBloqueoCorte(auth.ok ? '' : auth.error);
  }, [turnos, user, turnoActivo, sucursal]);

  useEffect(() => {
    if (!supabase || !turnoActivo) {
      setCorteExistente(null);
      setModoCorregir(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await corteYaRegistrado(supabase, { sucursal, fecha, turnoId: turnoActivo.id });
      if (cancelled) return;
      if (r.existe) {
        setCorteExistente(r);
      } else {
        setCorteExistente(null);
        setModoCorregir(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, sucursal, fecha, turnoActivo?.id, ventas.length]);

  const puedeCorregirCorte = useMemo(() => {
    const rol = normalizarRol(user?.rol);
    if (['Administrador', 'Gerente', 'Supervisor'].includes(rol)) return true;
    // Cajero: puede corregir si aún puede operar el turno (o si es quien lo registró).
    if (!bloqueoCorte) return true;
    const autor = String(corteExistente?.corte?.usuario || '').trim().toLowerCase();
    const yo = String(user?.nombre || '').trim().toLowerCase();
    return Boolean(autor && yo && autor === yo);
  }, [user, bloqueoCorte, corteExistente]);

  const entrarModoCorregir = () => {
    if (!corteExistente?.existe) return;
    if (!puedeCorregirCorte) {
      alert('No tienes permiso para corregir este corte. Pide a un gerente o administrador.');
      return;
    }
    const c = corteExistente.corte || {};
    const contado = c.efectivo_contado ?? c.efectivoContado;
    setEfectivoContado(contado == null || contado === '' ? '' : String(contado));
    setNotas(String(c.notas || ''));
    const corr = c.corroboracion && typeof c.corroboracion === 'object' ? c.corroboracion : {};
    setCorroboracionContada({
      tarjeta: corr.tarjeta?.contado != null ? String(corr.tarjeta.contado) : '',
      transferencia: corr.transferencia?.contado != null ? String(corr.transferencia.contado) : '',
      qr: corr.qr?.contado != null ? String(corr.qr.contado) : '',
    });
    setModoCorregir(true);
    setPestana('corte');
    setMsg('Modo corrección: ajusta efectivo/corroboración/notas y guarda la corrección.');
  };

  const armarPayloadCorte = (contado) => ({
    fecha,
    sucursal,
    usuario: user?.nombre || '—',
    turno_id: turnoActivo?.id,
    turno_nombre: nombreTurnoLegible(turnoActivo) || null,
    hora: new Date().toISOString(),
    tickets: resumen.ticketsBruto,
    cancelaciones: resumen.cancelaciones,
    totalVentas: resumen.total,
    totalBruto: resumen.totalBruto,
    totalCancelaciones: resumen.totalCancelaciones,
    efectivoEsperado: resumen.efectivoEsperado,
    efectivoContado: contado,
    diferencia: contado - resumen.efectivoEsperado,
    electronico: resumen.electronico,
    grupos: resumen.grupos,
    detalleMetodos: resumen.detalleMetodos,
    corroboracion,
    notas: notas.trim(),
  });

  const guardarCorteHandler = async () => {
    if (bloqueoCorte) return alert(bloqueoCorte);
    if (corteExistente?.existe) return alert('Ya se registró el corte de este turno. Usa «Corregir corte» para actualizarlo.');
    const contado = parseFloat(efectivoContado);
    if (Number.isNaN(contado)) {
      alert('Indica cuánto efectivo contaste en caja.');
      return;
    }
    const corte = armarPayloadCorte(contado);
    const r = await guardarCorte(supabase, corte, user?.id);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    setHistorial(r.local);
    setMsg(r.id ? 'Corte guardado en la nube y en este equipo.' : 'Corte guardado en este equipo.');
    setCorteExistente({ existe: true, corte: { ...corte, id: r.id, efectivo_contado: contado }, origen: r.id ? 'nube' : 'local' });
    setNotas('');
    if (leerConfigImpresion().autoCorte) {
      await imprimirCorteDesdeResumen(contado);
    }
  };

  const corregirCorteHandler = async () => {
    if (!corteExistente?.existe) return;
    if (!puedeCorregirCorte) {
      return alert('No tienes permiso para corregir este corte. Pide a un gerente o administrador.');
    }
    const contado = parseFloat(efectivoContado);
    if (Number.isNaN(contado)) {
      alert('Indica cuánto efectivo contaste en caja.');
      return;
    }
    const prevNotas = String(corteExistente.corte?.notas || '').trim();
    const stamp = new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
    const lineaCorr = `Corregido por ${user?.nombre || '—'} · ${stamp}`;
    const baseNotas = (notas.trim() || prevNotas).replace(/\n?Corregido por .+$/gm, '').trim();
    const notasConStamp = `${baseNotas}${baseNotas ? '\n' : ''}${lineaCorr}`;

    if (
      !confirm(
        `¿Corregir el corte de ${nombreTurnoLegible(turnoActivo)} (${fecha})?\n\nEfectivo contado: $${contado.toFixed(2)}\nDiferencia: $${(contado - resumen.efectivoEsperado).toFixed(2)}`,
      )
    ) {
      return;
    }

    const corte = {
      ...armarPayloadCorte(contado),
      id: corteExistente.corte?.id,
      notas: notasConStamp,
    };
    const r = await corregirCorte(supabase, corte, user?.id, corteExistente.corte?.id);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    setHistorial(r.local || leerCortesLocales());
    setModoCorregir(false);
    setNotas(corte.notas);
    setCorteExistente({
      existe: true,
      origen: r.id && String(r.id).includes('-') ? 'nube' : corteExistente.origen,
      corte: {
        ...corteExistente.corte,
        ...corte,
        id: r.id || corteExistente.corte?.id,
        efectivo_contado: contado,
        diferencia: contado - resumen.efectivoEsperado,
        notas: corte.notas,
        corroboracion,
        usuario: user?.nombre || corteExistente.corte?.usuario,
      },
    });
    setMsg('Corte corregido y guardado.');
  };

  const ejecutarCancelacion = async () => {
    if (!ventaParaCancel) return alert('Elige un ticket.');
    const lineas = lineasCancel.filter((l) => Number(l.qtyCancelar) > 0);
    if (!lineas.length) return alert('Indica la cantidad a cancelar por producto.');
    if (!confirm(`¿Cancelar ${lineas.length} línea(s) por $${lineas.reduce((a, l) => a + l.precio * l.qtyCancelar, 0).toFixed(2)}? Se devolverá al inventario.`)) return;
    setCancelando(true);
    const r = await registrarCancelacion(supabase, {
      venta: ventaParaCancel,
      lineas,
      user,
      sucursal,
      inventario: inventarioCompleto || inventario,
      motivo: motivoCancel,
    });
    setCancelando(false);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    setMsg(r.avisoLocal ? `Cancelación guardada en este equipo. ${r.avisoLocal}` : 'Cancelación registrada. Inventario actualizado.');
    setVentaSel('');
    setMotivoCancel('');
    cargarDatos?.();
    void cargar();
    setPestana('movimientos');
  };

  const imprimirCorteDesdeResumen = async (contadoOverride) => {
    const contado = contadoOverride ?? (efectivoContado !== '' && !Number.isNaN(parseFloat(efectivoContado)) ? parseFloat(efectivoContado) : null);
    const r = await imprimirCorte({
      fecha,
      sucursal,
      usuario: user?.nombre,
      turno: turnoActivo?.nombre,
      tickets: resumen.ticketsBruto,
      cancelaciones: resumen.cancelaciones,
      totalBruto: resumen.totalBruto,
      totalCancelaciones: resumen.totalCancelaciones,
      total: resumen.total,
      detalleMetodos: resumen.detalleMetodos,
      efectivoEsperado: resumen.efectivoEsperado,
      efectivoContado: contado,
      diferencia: contado != null ? contado - resumen.efectivoEsperado : diferencia,
      corroboracion,
      notas: notas.trim(),
    });
    if (!r.ok) alert(r.error);
  };

  const imprimirResumen = () => {
    void imprimirCorteDesdeResumen();
  };

  const imprimirCorteGuardado = async (corteGuardado) => {
    const datos = datosImpresionCorteGuardado(corteGuardado);
    if (!datos) return alert('No hay datos del corte para imprimir.');
    const r = await imprimirCorte(datos);
    if (!r.ok) alert(r.error);
  };

  const imprimirCorteActualGuardado = () => {
    if (!corteExistente?.existe) {
      return void imprimirCorteDesdeResumen();
    }
    void imprimirCorteGuardado({
      ...corteExistente.corte,
      fecha,
      sucursal,
      turno_nombre: corteExistente.corte?.turno_nombre || nombreTurnoLegible(turnoActivo),
      efectivoContado: corteExistente.corte?.efectivo_contado ?? corteExistente.corte?.efectivoContado,
      efectivoEsperado: corteExistente.corte?.efectivo_esperado ?? corteExistente.corte?.efectivoEsperado ?? resumen.efectivoEsperado,
      totalVentas: corteExistente.corte?.total_ventas ?? corteExistente.corte?.totalVentas ?? resumen.total,
      detalleMetodos: corteExistente.corte?.detalle_metodos ?? corteExistente.corte?.detalleMetodos ?? resumen.detalleMetodos,
      tickets: corteExistente.corte?.tickets ?? resumen.ticketsBruto,
      cancelaciones: resumen.cancelaciones,
      totalBruto: resumen.totalBruto,
      totalCancelaciones: resumen.totalCancelaciones,
      corroboracion: corteExistente.corte?.corroboracion || corroboracion,
      notas: corteExistente.corte?.notas || notas,
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const locales = leerCortesLocales();
      if (!supabase) {
        if (!cancelled) setHistorial(locales);
        return;
      }
      const r = await consultarCortes(supabase, {
        sucursal,
        desde: fecha,
        hasta: fecha,
        limit: 50,
      });
      if (cancelled) return;
      const nube = r.data || [];
      // Une nube + local sin duplicar por id
      const byId = new Map();
      for (const c of [...nube, ...locales]) {
        const key = String(c.id || c.cloudId || `${c.fecha}_${c.turno_id}_${c.usuario}_${c.hora || c.created_at}`);
        if (!byId.has(key)) byId.set(key, c);
      }
      setHistorial([...byId.values()]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, sucursal, fecha, corteExistente?.corte?.id, msg]);

  const historialFiltrado = historial
    .filter((c) => String(c.fecha || '').slice(0, 10) === String(fecha).slice(0, 10) && (!sucursal || String(c.sucursal || c.sucursal_id || '') === String(sucursal)))
    .sort((a, b) => new Date(b.hora || b.created_at || 0) - new Date(a.hora || a.created_at || 0))
    .slice(0, 20);

  const kpi = (label, value, sub, color) => (
    <div className="card" style={{ border: '1px solid var(--border)', padding: '0.85rem' }}>
      <div className="muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: color || 'var(--brand-blue)', marginTop: '0.25rem' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>{sub}</div>}
    </div>
  );

  const barraFecha = (
    <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
        <SelectorCalendario
          label="Fecha"
          value={fecha}
          onChange={(ymd) => {
            setTurnoManual(true);
            setFecha(ymd);
          }}
        />
        <button type="button" className="btn btn-primary" onClick={cargar} disabled={loading}>
          {loading ? 'Actualizando…' : 'Actualizar día'}
        </button>
      </div>
      {error && <p style={{ color: 'var(--brand-red)', margin: '0.75rem 0 0', fontSize: '0.9rem' }}>{error}</p>}
      {aviso && <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>{aviso}</p>}
      {msg && <p style={{ color: 'var(--brand-green)', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>{msg}</p>}
    </div>
  );

  const kpisResumen = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
      {kpi('Tickets', resumen.ticketsBruto, `${resumen.cancelaciones} cancelación(es)`)}
      {kpi('Ventas brutas', `$${resumen.totalBruto.toFixed(2)}`, 'Antes de cancelaciones')}
      {kpi('Cancelaciones', `-$${resumen.totalCancelaciones.toFixed(2)}`, 'Resta del corte', 'var(--brand-red)')}
      {kpi('Total sistema', `$${resumen.total.toFixed(2)}`, 'Neto registrado', 'var(--brand-blue)')}
      {kpi('Efectivo neto', `$${resumen.efectivoEsperado.toFixed(2)}`, 'Para arqueo', 'var(--brand-green)')}
      {kpi('Electrónico neto', `$${resumen.electronico.toFixed(2)}`, 'Tarjeta, transfer, QR')}
    </div>
  );

  const avisoSinVentas =
    !loading && ventas.length === 0 && !error ? (
      <div className="card" style={{ borderColor: 'rgba(245,158,11,0.5)', background: '#fffbeb' }}>
        <strong style={{ color: '#b45309' }}>Sin ventas para este corte</strong>
        <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
          Filtrando: <strong>{etiquetaTienda(sucursal)}</strong> · fecha <strong>{fecha}</strong>.
          <br />
          El corte solo muestra ventas hechas en <strong>esta misma tienda</strong> (la fijada en la caja al cobrar en Ventas).
        </p>
        {ventasDiaSinTurno > 0 && ventas.length === 0 && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: '#b45309' }}>
            Hay <strong>{ventasDiaSinTurno}</strong> venta(s) de esta tienda en esa fecha, pero de{' '}
            <strong>otro turno</strong>. El corte solo muestra el turno activo ({nombreTurnoLegible(turnoActivo) || '—'}).
          </p>
        )}
        {ventasOtrasTiendas && Object.keys(ventasOtrasTiendas).length > 0 && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
            Hoy sí hay tickets en otra tienda:{' '}
            {Object.entries(ventasOtrasTiendas)
              .map(([s, n]) => `${etiquetaTienda(s)} (${n})`)
              .join(', ')}
            . Cambia la tienda de la caja en Configuración o al iniciar sesión.
          </p>
        )}
        {!ventasOtrasTiendas && ventasDiaSinTurno === 0 && (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
            Si vendiste en nocturno: elige <strong>Turno nocturno</strong> arriba y la fecha del día en que empezó
            (ej. venta a las 20:00 del 27 → fecha 27, no 28). El inventario baja aunque mires el turno equivocado;
            el ticket y la tarjeta solo aparecen en el turno/fecha correctos. También revisa{' '}
            <strong>Consultas → Ventas</strong>.
          </p>
        )}
      </div>
    ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '960px' }}>
      <div>
        <h2 style={{ margin: 0, color: 'var(--brand-blue)' }}>Corte de caja</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Total acumulado del sistema, movimientos por ticket y cancelaciones. Solo se incluyen ventas del turno elegido (evita mezclar caja diurna con nocturna). Tienda: <span className="badge">{sucursal}</span>
          {turnoActivo && (
            <>
              {' '}
              · Turno: <span className="badge">{nombreTurnoLegible(turnoActivo)}</span>{' '}
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                entrada {turnoActivo.hora_inicio} · salida {turnoActivo.hora_fin}
              </span>
            </>
          )}
        </p>
        {opcionesTurnoConsulta.length > 0 && (
          <div style={{ marginTop: '0.65rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <label className="muted" style={{ fontSize: '0.85rem' }}>
              Turno a consultar / cortar
              <select
                className="select"
                style={{ marginLeft: '0.4rem', minWidth: 260 }}
                value={turnoActivo?.id || ''}
                onChange={(e) => {
                  const id = e.target.value;
                  const hit = opcionesTurnoConsulta.find((o) => String(o.turno.id) === String(id));
                  if (!hit) return;
                  setTurnoManual(true);
                  setTurnoActivo(hit.turno);
                  setFecha(fechaCorteSugerida(hit.turno));
                }}
              >
                {opcionesTurnoConsulta.map((o) => (
                  <option key={o.turno.id} value={o.turno.id}>
                    {nombreTurnoLegible(o.turno)} ({o.turno.hora_inicio}–{o.turno.hora_fin})
                    {o.motivo === 'entrega' ? ' · se entrega' : o.motivo === 'actual' ? ' · en curso' : ' · consulta'}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              Tras la salida hay {leerToleranciaTurnos().minutos_despues_fin} min para que el cajero corte el turno
              {minsExt > 0 ? ` · extensión activa (${minsExt} min)` : ''}. Fuera de esa ventana, un gerente/admin puede
              consultar y cortar el nocturno eligiendo el turno aquí.
            </span>
          </div>
        )}
        {opcionesCorte.some((o) => o.motivo === 'entrega') && (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'var(--brand-gold)' }}>
            Estás en la ventana de entrega: puedes cortar{' '}
            <strong>{nombreTurnoLegible(opcionesCorte.find((o) => o.motivo === 'entrega')?.turno)}</strong> aunque ya
            empezó el siguiente.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {[
          { id: 'corte', label: 'Corte' },
          { id: 'movimientos', label: 'Movimientos' },
          { id: 'cancelaciones', label: 'Cancelaciones' },
        ].map((t) => (
          <button key={t.id} type="button" className={pestana === t.id ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setPestana(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {barraFecha}
      {bloqueoCorte && (
        <div className="card" style={{ borderColor: 'rgba(211,47,47,0.4)', background: '#fff5f5' }}>
          <strong style={{ color: 'var(--brand-red)' }}>Corte no permitido</strong>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>{bloqueoCorte}</p>
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem' }}>
            Si el relevo llegó tarde: 1) el saliente corta en los {leerToleranciaTurnos().minutos_despues_fin} min de gracia
            (y puede pedir +30 min al expirar); 2) un <strong>gerente/admin</strong> hace el corte a nombre del turno anterior;
            o 3) admin autoriza la entrada con PIN en el login (8 h).
          </p>
        </div>
      )}
      {corteExistente?.existe && (
        <div
          className="card"
          style={{
            borderColor: modoCorregir ? 'rgba(225,153,41,0.55)' : 'rgba(59,105,181,0.4)',
            background: modoCorregir ? 'rgba(225,153,41,0.1)' : 'rgba(59,105,181,0.06)',
          }}
        >
          <strong style={{ color: modoCorregir ? 'var(--brand-gold-dark)' : 'var(--brand-blue)' }}>
            {modoCorregir ? 'Corrigiendo corte actual' : 'Corte de turno ya registrado'}
          </strong>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>
            {nombreTurnoLegible(turnoActivo)} · {fecha} · {corteExistente.corte?.usuario || '—'}
            {corteExistente.corte?.created_at && ` · ${fmtHora(corteExistente.corte.created_at)}`}
            {' '}
            ({corteExistente.origen}).
            {corteExistente.corte?.efectivo_contado != null && (
              <>
                {' '}
                Efectivo contado: <strong>${Number(corteExistente.corte.efectivo_contado).toFixed(2)}</strong>
                {corteExistente.corte?.diferencia != null && (
                  <> · diferencia <strong>${Number(corteExistente.corte.diferencia).toFixed(2)}</strong></>
                )}
              </>
            )}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.65rem' }}>
            {!modoCorregir ? (
              <button type="button" className="btn btn-gold" onClick={entrarModoCorregir} disabled={!puedeCorregirCorte}>
                Corregir corte actual
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setModoCorregir(false)}>
                Cancelar corrección
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={imprimirCorteActualGuardado}>
              Imprimir corte
            </button>
          </div>
          {!puedeCorregirCorte && (
            <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem' }}>
              Solo el autor del corte (en su ventana) o un gerente/administrador pueden corregirlo.
            </p>
          )}
        </div>
      )}
      {avisoSinVentas}
      {kpisResumen}

      {pestana === 'corte' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="grid-2">
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)' }}>Desglose neto por método</h3>
            {resumen.detalleMetodos.length === 0 ? (
              <p className="muted">Sin movimientos en esta fecha.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Método</th>
                      <th style={{ textAlign: 'right' }}>Monto neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.detalleMetodos.map((d) => (
                      <tr key={d.metodo}>
                        <td>{d.metodo}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>${d.monto.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h4 style={{ margin: '1rem 0 0.5rem', fontSize: '0.9rem' }}>Por grupo</h4>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.9rem' }}>
              {Object.entries(resumen.grupos).map(([g, m]) => (
                <li key={g}>
                  {etiquetaGrupoPago(g)}: <strong>${Number(m).toFixed(2)}</strong>
                </li>
              ))}
            </ul>
          </div>

          <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Arqueo de efectivo</h3>
            <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
              El sistema registra <strong>${resumen.efectivoEsperado.toFixed(2)}</strong> en efectivo (ventas − cancelaciones en efectivo).
            </p>
            <label className="muted">
              Efectivo contado (MXN)
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                style={{ marginTop: '0.35rem', fontSize: '1.2rem', fontWeight: 700 }}
                value={efectivoContado}
                onChange={(e) => setEfectivoContado(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <div style={{ marginTop: '0.75rem', padding: '0.85rem', borderRadius: '10px', background: 'var(--surface)' }}>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                Diferencia (contado − esperado)
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: diferencia == null ? 'var(--muted)' : Math.abs(diferencia) < 0.01 ? 'var(--brand-green)' : diferencia > 0 ? 'var(--brand-blue)' : 'var(--brand-red)' }}>
                {diferencia == null ? '—' : `$${diferencia.toFixed(2)} MXN`}
              </div>
            </div>
            <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
              Notas
              <textarea className="input" style={{ marginTop: '0.35rem', minHeight: '64px' }} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
              {!corteExistente?.existe ? (
                <button type="button" className="btn btn-success" onClick={guardarCorteHandler} disabled={Boolean(bloqueoCorte)}>
                  Guardar corte
                </button>
              ) : modoCorregir ? (
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={corregirCorteHandler}
                  disabled={Boolean(bloqueoCorte && !puedeCorregirCorte)}
                >
                  Guardar corrección
                </button>
              ) : (
                <button type="button" className="btn btn-gold" onClick={entrarModoCorregir} disabled={!puedeCorregirCorte}>
                  Corregir corte actual
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={corteExistente?.existe ? imprimirCorteActualGuardado : imprimirResumen}>
                {corteExistente?.existe ? 'Imprimir corte' : 'Imprimir preview'}
              </button>
            </div>
            {corteExistente?.existe && !modoCorregir && (
              <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.82rem' }}>
                Puedes reimprimir el corte guardado cuando lo necesites (también desde la lista de abajo).
              </p>
            )}
            {modoCorregir && (
              <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.82rem' }}>
                Se actualizarán efectivo contado, diferencia, corroboración y totales del sistema con las ventas actuales
                del turno. Quedará una nota de quién corrigió y cuándo.
              </p>
            )}
          </div>
          </div>

          <div className="card" style={{ borderTop: '4px solid var(--brand-olive)' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)' }}>Corroboración otros rubros</h3>
            <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
              Compare lo registrado en el sistema con lo que reporta terminal, banco o app (tarjeta, transferencia, QR).
            </p>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Rubro</th>
                    <th style={{ textAlign: 'right' }}>Sistema</th>
                    <th style={{ textAlign: 'right' }}>Contado</th>
                    <th style={{ textAlign: 'right' }}>Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {RUBROS_CORROBORACION.map(({ id, label }) => {
                    const row = corroboracion[id] || {};
                    const dif = row.diferencia;
                    return (
                      <tr key={id}>
                        <td style={{ fontWeight: 600 }}>{label}</td>
                        <td style={{ textAlign: 'right' }}>${Number(row.esperado || 0).toFixed(2)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="input"
                            style={{ width: '110px', textAlign: 'right', fontWeight: 700 }}
                            value={corroboracionContada[id]}
                            onChange={(e) => setCorroboracionContada((prev) => ({ ...prev, [id]: e.target.value }))}
                            placeholder="0.00"
                          />
                        </td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color:
                              dif == null ? 'var(--muted)' : Math.abs(dif) < 0.01 ? 'var(--brand-green)' : 'var(--brand-red)',
                          }}
                        >
                          {dif == null ? '—' : `$${dif.toFixed(2)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {pestana === 'movimientos' && (
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Movimientos del día ({movimientos.length})</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Cada ticket suma; cada cancelación resta. La columna <strong>Acumulado</strong> es el total neto que lleva el sistema.
          </p>
          <div className="table-wrap" style={{ maxHeight: '480px' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Tipo</th>
                  <th>Detalle</th>
                  <th>Pago</th>
                  <th>Monto</th>
                  <th>Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      Sin movimientos. Las ventas del día aparecerán aquí.
                    </td>
                  </tr>
                ) : (
                  movimientos.map((m) => (
                    <tr key={`${m.tipo}-${m.id}`} style={m.tipo === 'cancelacion' ? { background: 'rgba(211,47,47,0.06)' } : undefined}>
                      <td>{fmtHora(m.hora)}</td>
                      <td>
                        <span className="badge" style={m.tipo === 'cancelacion' ? { background: '#fff5f5', color: 'var(--brand-red)' } : undefined}>
                          {m.tipo === 'cancelacion' ? 'Cancelación' : 'Ticket'}
                        </span>
                      </td>
                      <td>
                        {m.detalle}
                        {m.articulos?.length > 0 && (
                          <div className="muted" style={{ fontSize: '0.75rem' }}>
                            {m.articulos.map((a) => `${a.nombre || a.id} ×${a.qty ?? 1}`).join(', ')}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>{m.metodo || '—'}</td>
                      <td style={{ fontWeight: 700, color: m.monto < 0 ? 'var(--brand-red)' : 'var(--brand-green)' }}>
                        {m.monto < 0 ? '-' : ''}${Math.abs(m.monto).toFixed(2)}
                      </td>
                      <td style={{ fontWeight: 800 }}>${m.acumulado.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pestana === 'cancelaciones' && (
        <div className="grid-2">
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Cancelar productos de un ticket</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
              Al cancelar, el producto <strong>vuelve al inventario</strong> y el importe <strong>se resta</strong> en Movimientos y en el corte.
            </p>
            <label className="muted">
              Ticket del día
              <select className="select" style={{ marginTop: '0.35rem' }} value={ventaSel} onChange={(e) => setVentaSel(e.target.value)}>
                <option value="">— Elige ticket —</option>
                {ventas.map((v) => (
                  <option key={v.id} value={v.id}>
                    {fmtHora(v.created_at)} · {v.vendedor} · ${Number(v.total).toFixed(2)} · {v.metodo_pago}
                  </option>
                ))}
              </select>
            </label>
            {ventaParaCancel && lineasCancel.length === 0 && (
              <p className="muted" style={{ marginTop: '0.75rem' }}>Este ticket ya no tiene líneas cancelables (todo fue cancelado).</p>
            )}
            {lineasCancel.length > 0 && (
              <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Vendido</th>
                      <th>Ya cancel.</th>
                      <th>Cancelar</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineasCancel.map((l) => (
                      <tr key={l.id}>
                        <td>{l.nombre}</td>
                        <td>{l.vendido}</td>
                        <td>{l.cancelado}</td>
                        <td style={{ maxWidth: '80px' }}>
                          <input
                            type="number"
                            min={0}
                            max={l.pendiente}
                            className="input"
                            style={{ padding: '0.35rem', width: '64px' }}
                            value={l.qtyCancelar}
                            onChange={(e) => {
                              const v = Math.min(l.pendiente, Math.max(0, parseInt(e.target.value, 10) || 0));
                              setLineasCancel((rows) => rows.map((x) => (x.id === l.id ? { ...x, qtyCancelar: v } : x)));
                            }}
                          />
                        </td>
                        <td>${(l.precio * (Number(l.qtyCancelar) || 0)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
              Motivo (opcional)
              <input className="input" style={{ marginTop: '0.35rem' }} value={motivoCancel} onChange={(e) => setMotivoCancel(e.target.value)} placeholder="Error de cobro, devolución cliente…" />
            </label>
            <button type="button" className="btn btn-danger" style={{ marginTop: '0.75rem' }} disabled={!lineasCancel.some((l) => l.qtyCancelar > 0) || cancelando} onClick={ejecutarCancelacion}>
              {cancelando ? 'Procesando…' : 'Registrar cancelación'}
            </button>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Cancelaciones del día ({cancelaciones.length})</h3>
            <div className="table-wrap" style={{ maxHeight: '400px' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Usuario</th>
                    <th>Productos</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {cancelaciones.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        Sin cancelaciones hoy.
                      </td>
                    </tr>
                  ) : (
                    cancelaciones.map((c) => (
                      <tr key={c.id}>
                        <td>{fmtHora(c.created_at)}</td>
                        <td>{c.usuario}</td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {(c.articulos || []).map((a) => `${a.nombre} ×${a.qty}`).join(', ')}
                          {c.motivo && <div className="muted">{c.motivo}</div>}
                        </td>
                        <td style={{ color: 'var(--brand-red)', fontWeight: 700 }}>-${Number(c.total).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {(historialFiltrado.length > 0 || corteExistente?.existe) && pestana === 'corte' && (
        <div className="card">
          <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>Cortes guardados</h3>
          <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
            Reimprime un corte de esta fecha cuando lo necesites más tarde.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Turno</th>
                  <th>Usuario</th>
                  <th>Neto sistema</th>
                  <th>Contado</th>
                  <th>Dif.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {historialFiltrado.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      Sin cortes listados aún para esta fecha.
                    </td>
                  </tr>
                ) : (
                  historialFiltrado.map((c) => (
                    <tr key={c.id || `${c.fecha}_${c.turno_id}_${c.hora || c.created_at}`}>
                      <td>
                        {c.hora || c.created_at
                          ? new Date(c.hora || c.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{c.turno_nombre || c.turno_id || '—'}</td>
                      <td>{c.usuario}</td>
                      <td>${Number(c.totalVentas ?? c.total_ventas ?? c.total || 0).toFixed(2)}</td>
                      <td>${Number(c.efectivoContado ?? c.efectivo_contado || 0).toFixed(2)}</td>
                      <td
                        style={{
                          color: Number(c.diferencia) < 0 ? 'var(--brand-red)' : 'var(--brand-green)',
                          fontWeight: 700,
                        }}
                      >
                        ${Number(c.diferencia || 0).toFixed(2)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.78rem' }}
                          onClick={() => void imprimirCorteGuardado(c)}
                        >
                          Imprimir
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
