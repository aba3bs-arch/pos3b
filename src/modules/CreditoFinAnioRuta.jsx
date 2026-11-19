import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { etiquetaTienda, listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
import { fmtMonto } from '../lib/consultasUi.js';
import {
  ESTADO_CERRADA,
  TIPO_RETIRAR,
  archivarAbonoFinAnio,
  archivarCuentaFinAnio,
  archivarMovimientoFinAnio,
  cerrarLiquidacionFinAnio,
  codigoVisibleProducto,
  desgloseLiquidacion,
  cuentaAbiertaDeTienda,
  crearCuentaFinAnio,
  dejarMercanciaFinAnio,
  editarAbonoFinAnio,
  editarCuentaFinAnio,
  editarMovimientoFinAnio,
  enviarInventarioACompras,
  inventarioDeMovimientos,
  liquidacionEnCurso,
  listarAbonosFinAnio,
  listarCuentasFinAnio,
  listarLiquidacionesFinAnio,
  listarMovimientosFinAnio,
  listarRecibosFinAnio,
  nombreCuentaFinAnio,
  productoParaCargarFinAnio,
  round2,
  resumenCuenta,
  saldosTarjetas,
  sugerenciasCatalogoFinAnio,
  tiendasDeLaSesion,
  totalAntesDeLiquidar,
  totalTarjetas,
} from '../lib/creditoFinAnio.js';
import {
  asegurarCuentaAbonoCuetes,
  cancelarSolicitudAbonoFinAnio,
  listarRepartidoresParaAbono,
  listarSolicitudesAbonoCuenta,
  solicitarAbonoFinAnio,
  solicitudAbonoPendiente,
} from '../lib/creditoFinAnioAbonoAprobacion.js';
import { guardarLiquidacionCuetes, listarLiquidacionCuetes, totalesCreditoCuete } from '../lib/liquidacionCuetes.js';
import { imprimirPedidoCompra } from '../lib/impresion.js';
import VisorTutorialModal from '../components/VisorTutorialModal.jsx';
import { TUTORIAL_CREDITO_FIN_ANIO } from '../content/tutorialCreditoFinAnio.js';
import { esRolRepartidor, normalizarRol } from '../lib/roles.js';
import {
  descontarProductoDelCamion,
  devolverProductoAlCamion,
  listarInventarioCamiones,
  revertirAjusteCamion,
} from '../lib/creditoFinAnioCamion.js';
import { puedeAccionVentaRuta } from '../lib/ventaEnRutaAcciones.js';

const COLOR = '#3730a3';

function fechaPhoenix(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    timeZone: 'America/Phoenix',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtQty(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}

function precioDeProducto(p) {
  const n = Number(p?.precio_venta ?? p?.precio ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function Campo({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
      {label}
      {children}
    </label>
  );
}

function itemsRecibo(recibo) {
  const raw = recibo?.items;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function CreditoFinAnioRuta({ supabase, user, inventario = [], onVolver, onNavigate, sucursal }) {
  const [cuentas, setCuentas] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [abonos, setAbonos] = useState([]);
  const [recibos, setRecibos] = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [aviso, setAviso] = useState('');
  const [sucursalId, setSucursalId] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [nombreNueva, setNombreNueva] = useState(() => nombreCuentaFinAnio());
  const [notasNueva, setNotasNueva] = useState('');
  const [deja, setDeja] = useState({ codigo: '', nombre: '', cantidad: '', precio: '', notas: '' });
  const [busca, setBusca] = useState('');
  const [retiroClave, setRetiroClave] = useState('');
  const [retiro, setRetiro] = useState({ cantidad: '', precio: '', notas: '' });
  const [abono, setAbono] = useState({ monto: '', notas: '', repartidorId: '' });
  const [repartidores, setRepartidores] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [marcaSolicitudes, setMarcaSolicitudes] = useState(0);
  const [editCuenta, setEditCuenta] = useState(null);
  const [editMov, setEditMov] = useState(null);
  const [editAbono, setEditAbono] = useState(null);
  const [pestana, setPestana] = useState('credito');
  const [creditoTiendas, setCreditoTiendas] = useState([]);
  const [tiendaAbierta, setTiendaAbierta] = useState('');
  const [ticketAbierto, setTicketAbierto] = useState('');
  const puedeAbonar = puedeAccionVentaRuta(user?.rol, user?.id, 'ruta_fin_anio_abono');
  const soloAbono = normalizarRol(user?.rol) === 'Cajero' && puedeAbonar;
  const soloLectura = esRolRepartidor(user?.rol);
  const puedeMercancia = !soloLectura || puedeAccionVentaRuta(user?.rol, user?.id, 'ruta_fin_anio_mercancia');
  const esAdmin = normalizarRol(user?.rol) === 'Administrador';
  const [lineaAbierta, setLineaAbierta] = useState('');
  const [tutorialAbierto, setTutorialAbierto] = useState(false);
  const [inventarioCamion, setInventarioCamion] = useState({ valorTotal: 0, valorReal: 0 });
  const [liqCuetes, setLiqCuetes] = useState({ pendiente: 0, abonado: 0, partes: [], pendientePorSucursal: [], totalAntes: 0 });
  const [reciboVer, setReciboVer] = useState(null);

  const vistaTiendas = useMemo(
    () => tiendasDeLaSesion(listarSucursalesOperativas(), sucursal || user?.sucursal_id),
    [sucursal, user?.sucursal_id],
  );
  const tiendas = vistaTiendas.tiendas;
  const soloSuTienda = vistaTiendas.soloSuTienda;
  const sucSesion = normalizarCodigoTienda(sucursal || user?.sucursal_id) || '';

  const cargar = useCallback(async () => {
    if (!supabase) return;
    const [c, m, a, rec, liq] = await Promise.all([
      listarCuentasFinAnio(supabase),
      listarMovimientosFinAnio(supabase),
      listarAbonosFinAnio(supabase),
      listarRecibosFinAnio(supabase),
      listarLiquidacionesFinAnio(supabase),
    ]);
    setCuentas(c.data || []);
    setMovimientos(m.data || []);
    setAbonos(a.data || []);
    setRecibos(rec.faltaTabla ? [] : (rec.data || []));
    setLiquidaciones(liq.faltaTabla ? [] : (liq.data || []));
    setAviso(c.aviso || m.aviso || a.aviso || c.error || m.error || a.error || '');
    if (puedeAbonar) {
      const reps = await listarRepartidoresParaAbono(supabase);
      setRepartidores(reps.ok ? reps.data : []);
    }
  }, [supabase, puedeAbonar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!supabase || !cuentaId || !puedeAbonar) { setSolicitudes([]); return undefined; }
    let vigente = true;
    const leer = async () => {
      const r = await listarSolicitudesAbonoCuenta(supabase, cuentaId);
      if (vigente) setSolicitudes(r.ok ? r.data : []);
    };
    void leer();
    const t = setInterval(() => { void leer(); }, 15000);
    return () => { vigente = false; clearInterval(t); };
  }, [supabase, cuentaId, puedeAbonar, marcaSolicitudes]);

  useEffect(() => {
    if (!puedeAbonar || !sucSesion) return;
    const elegida = cuentaAbiertaDeTienda(cuentas, movimientos, abonos, sucSesion);
    if (elegida?.id && String(cuentaId || '') !== String(elegida.id)) setCuentaId(String(elegida.id));
  }, [puedeAbonar, sucSesion, cuentaId, cuentas, movimientos, abonos]);

  useEffect(() => {
    if (!supabase) return undefined;
    let vivo = true;
    const leer = async () => {
      const [inv, liq] = await Promise.all([
        esAdmin ? listarInventarioCamiones(supabase) : Promise.resolve(null),
        listarLiquidacionCuetes(supabase, liquidaciones),
      ]);
      if (!vivo) return;
      if (inv) setInventarioCamion({ valorTotal: inv.valorTotal || 0, valorReal: inv.valorReal || 0 });
      if (liq?.resumen) setLiqCuetes(liq.resumen);
      if (liq?.tiendas) setCreditoTiendas(liq.tiendas);
    };
    void leer();
    const t = setInterval(() => { void leer(); }, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, [esAdmin, supabase, marcaSolicitudes, liquidaciones]);

  const tarjetas = useMemo(
    () => saldosTarjetas(tiendas, cuentas, movimientos, abonos),
    [tiendas, cuentas, movimientos, abonos],
  );
  const totalTiendas = useMemo(() => totalTarjetas(tarjetas), [tarjetas]);
  const esDeEstaTienda = (sid) => !soloSuTienda || normalizarCodigoTienda(sid) === sucSesion;
  const partesDe = (row) => desgloseLiquidacion(row, abonos, cuentas).filter((t) => esDeEstaTienda(t.sucursal_id));
  const sumaPartes = (partes) => partes.reduce((s, t) => totalAntesDeLiquidar(s, t.monto), 0);
  const abierta = liquidacionEnCurso(liquidaciones);
  const enCurso = abierta && Number(abierta.monto) > 0 ? abierta : null;
  const partesEnPantalla = enCurso ? partesDe(enCurso) : [];
  const abonoEnPantalla = enCurso
    ? (soloSuTienda ? sumaPartes(partesEnPantalla) : Number(enCurso.monto) || 0)
    : 0;
  const cuentasTienda = useMemo(
    () => cuentas.filter((c) => String(c.sucursal_id || '').toUpperCase() === sucursalId),
    [cuentas, sucursalId],
  );
  const cuentaManual = cuentasTienda.find((c) => String(c.id) === String(cuentaId)) || null;
  const cuenta = soloAbono
    ? cuentaAbiertaDeTienda(cuentas, movimientos, abonos, sucSesion)
    : cuentaManual;
  const movsCuenta = useMemo(
    () => movimientos.filter((m) => String(m.cuenta_id) === String(cuentaId)),
    [movimientos, cuentaId],
  );
  const abonosCuenta = useMemo(
    () => abonos.filter((a) => String(a.cuenta_id) === String(cuentaId)),
    [abonos, cuentaId],
  );
  const inventarioCuenta = useMemo(() => inventarioDeMovimientos(movsCuenta), [movsCuenta]);
  const resumen = useMemo(() => resumenCuenta(movsCuenta, abonosCuenta), [movsCuenta, abonosCuenta]);
  const cerrada = cuenta?.estado === ESTADO_CERRADA;
  const lineaRetiro = inventarioCuenta.find((l) => l.clave === retiroClave) || null;

  const sugerencias = useMemo(
    () => sugerenciasCatalogoFinAnio(inventario, busca),
    [busca, inventario],
  );

  useEffect(() => {
    const p = productoParaCargarFinAnio(inventario, busca);
    if (!p) return;
    const codigo = codigoVisibleProducto(p);
    const nombre = p.nombre || '';
    const precio = String(precioDeProducto(p) || '');
    setDeja((d) => {
      if (d.codigo === codigo && d.nombre === nombre && d.precio === precio) return d;
      return { ...d, codigo, nombre, precio };
    });
  }, [busca, inventario]);

  const correr = async (fn) => {
    if (guardando) return;
    setGuardando(true);
    const r = await fn();
    setGuardando(false);
    if (!r?.ok) {
      alert(r?.error || 'No se pudo guardar.');
      return false;
    }
    await cargar();
    setMarcaSolicitudes((n) => n + 1);
    if (r.aviso) alert(r.aviso);
    return r;
  };

  const abrirCuenta = async () => {
    if (soloLectura) return alert('Solo puedes ver las cuentas.');
    if (guardando) return;
    setGuardando(true);
    const r = await crearCuentaFinAnio(supabase, {
      sucursalId,
      nombre: nombreNueva,
      notas: notasNueva,
      user,
    });
    setGuardando(false);
    if (!r?.ok) {
      alert(r?.error || 'No se pudo abrir la cuenta.');
      return;
    }
    setNotasNueva('');
    setNombreNueva(nombreCuentaFinAnio());
    await cargar();
    if (r.data?.id) setCuentaId(r.data.id);
  };

  const dejar = async () => {
    if (!puedeMercancia) return alert('No puedes ingresar mercancía.');
    let ajuste = null;
    if (soloLectura) {
      ajuste = await descontarProductoDelCamion(supabase, {
        user,
        productoId: deja.codigo,
        cantidad: deja.cantidad,
      });
      if (!ajuste.ok) return alert(ajuste.error || 'No se pudo descontar del camión.');
    }
    const ok = await correr(() => dejarMercanciaFinAnio(supabase, cuenta.id, deja, user));
    if (!ok && ajuste?.cambios) await revertirAjusteCamion(supabase, ajuste.cambios);
    if (!ok) return;
    setDeja({ codigo: '', nombre: '', cantidad: '', precio: '', notas: '' });
    setBusca('');
  };

  const retirar = async () => {
    if (!puedeMercancia) return alert('No puedes retirar mercancía.');
    if (!lineaRetiro) return alert('Elige un producto del inventario de la cuenta.');
    let ajuste = null;
    if (soloLectura) {
      ajuste = await devolverProductoAlCamion(supabase, {
        user,
        productoId: lineaRetiro.codigo,
        cantidad: retiro.cantidad,
      });
      if (!ajuste.ok) return alert(ajuste.error || 'No se pudo devolver al camión.');
    }
    const ok = await correr(() => retirarMercanciaFinAnio(supabase, cuenta.id, {
      codigo: lineaRetiro.codigo,
      nombre: lineaRetiro.nombre,
      cantidad: retiro.cantidad,
      precio: retiro.precio === '' ? (lineaRetiro.cantidad ? lineaRetiro.valor / lineaRetiro.cantidad : 0) : retiro.precio,
      notas: retiro.notas,
    }, lineaRetiro.cantidad, user));
    if (!ok) {
      if (ajuste?.cambios) await revertirAjusteCamion(supabase, ajuste.cambios);
      return;
    }
    setRetiro({ cantidad: '', precio: '', notas: '' });
    setRetiroClave('');
  };

  const abonar = async () => {
    if (!puedeAbonar) return;
    if (!sucSesion) return alert('Esta sesión no tiene tienda para abonar.');
    const libro = await asegurarCuentaAbonoCuetes(supabase, sucSesion, user);
    if (!libro.ok) return alert(libro.error || 'No se pudo abrir la cuenta de la tienda.');
    if (libro.cuenta?.id) setCuentaId(String(libro.cuenta.id));
    const rep = repartidores.find((r) => String(r.id) === String(abono.repartidorId));
    const ok = await correr(() => solicitarAbonoFinAnio(supabase, {
      cuentaId: libro.cuenta.id,
      sucursalId: sucSesion,
      monto: abono.monto,
      notas: abono.notas,
      repartidorId: abono.repartidorId,
      repartidorNombre: rep?.nombre,
      cajero: user,
    }));
    if (!ok) return;
    setMarcaSolicitudes((n) => n + 1);
    setAbono({ monto: '', notas: '', repartidorId: '' });
    alert(`Se envió el abono a ${rep?.nombre || 'el recolector'}. Le llega la notificación y lo aprueba con su PIN. Si no lo aprueba, no se registra el abono ni el gasto.`);
  };

  const tiendasCredito = soloSuTienda
    ? creditoTiendas.filter((t) => normalizarCodigoTienda(t.sucursal_id) === sucSesion)
    : creditoTiendas;
  const creditoCuete = useMemo(() => totalesCreditoCuete(tiendasCredito), [tiendasCredito]);

  const partesCuete = soloSuTienda
    ? liqCuetes.partes.filter((t) => normalizarCodigoTienda(t.sucursal_id) === sucSesion)
    : liqCuetes.partes;
  const abonoCuete = soloSuTienda
    ? round2(partesCuete.reduce((s, t) => s + (Number(t.monto) || 0), 0))
    : liqCuetes.abonado;
  const pendienteCuete = soloSuTienda
    ? round2((liqCuetes.pendientePorSucursal || []).filter((t) => normalizarCodigoTienda(t.sucursal_id) === sucSesion).reduce((s, t) => s + (Number(t.pendiente) || 0), 0))
    : liqCuetes.pendiente;
  const totalCuete = round2(pendienteCuete + abonoCuete);

  const liquidar = async () => {
    if (soloLectura || soloSuTienda) return;
    if (!(abonoCuete > 0)) return alert('No hay ventas de contado ni abonos de cuetes para liquidar.');
    if (!confirm(`¿Liquidar ${fmtMonto(abonoCuete)}?\nEl crédito de cuetes que sigue queda en ${fmtMonto(liqCuetes.pendiente)}.`)) return;
    const ok = await correr(() => guardarLiquidacionCuetes(supabase, liqCuetes, user));
    if (!ok) return;
    setLineaAbierta('');
    await cargar();
  };

  const imprimirRecibo = (recibo) => {
    imprimirPedidoCompra({
      sucursal: recibo.sucursal_id || sucursalId,
      proveedor: 'CUETES',
      folio: recibo.folio,
      notas: `Crédito fin de año · ${etiquetaTienda(recibo.sucursal_id || sucursalId)}`,
      items: itemsRecibo(recibo),
      total: recibo.total,
      usuario: user?.nombre || '',
    });
  };

  const enviarCompras = async () => {
    if (soloLectura) return alert('Solo puedes ver las cuentas.');
    const lineas = inventarioCuenta.filter((l) => Number(l.cantidad) > 0);
    if (!lineas.length) return alert('No hay mercancía para enviar.');
    if (!confirm(`¿Enviar el inventario a Compras de ${etiquetaTienda(sucursalId)}? Se genera un recibo.`)) return;
    const ok = await correr(() => enviarInventarioACompras(supabase, { cuenta, lineas, user }));
    if (!ok?.recibo && !ok?.folio) return;
    const recibo = ok.recibo || { folio: ok.folio, total: ok.total, items: ok.items, sucursal_id: sucursalId, compra_id: ok.compraId };
    setReciboVer(recibo);
    imprimirRecibo(recibo);
  };

  const elegirProducto = (p) => {
    setDeja((d) => ({
      ...d,
      codigo: codigoVisibleProducto(p),
      nombre: p.nombre || '',
      precio: String(precioDeProducto(p) || ''),
    }));
    setBusca('');
  };

  const volverTiendas = () => {
    setSucursalId('');
    setCuentaId('');
  };

  const panelAbono = puedeAbonar && sucSesion ? (
    <div className="card" style={{ display: 'grid', gap: '0.55rem' }}>
      <h4 style={{ margin: 0 }}>Abono de {etiquetaTienda(sucSesion)}</h4>
      <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
        Tú entregas el dinero. El recolector recibe la notificación y lo aprueba con su PIN. Si no aprueba, no entra a gastos y se cancela.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' }}>
        <Campo label="Monto">
          <input className="input" inputMode="decimal" value={abono.monto} onChange={(e) => setAbono({ ...abono, monto: e.target.value })} />
        </Campo>
        <Campo label="Recolector que recibe">
          <select className="input" value={abono.repartidorId} onChange={(e) => setAbono({ ...abono, repartidorId: e.target.value })}>
            <option value="">Elige</option>
            {repartidores.map((r) => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
          </select>
        </Campo>
        <Campo label="Nota">
          <input className="input" value={abono.notas} onChange={(e) => setAbono({ ...abono, notas: e.target.value })} />
        </Campo>
      </div>
      <button type="button" className="btn btn-primary" disabled={guardando} onClick={() => void abonar()}>Enviar abono</button>
      {solicitudes.filter(solicitudAbonoPendiente).map((s) => (
        <div key={s.id} style={{ padding: '0.55rem 0.7rem', borderRadius: 8, background: 'rgba(55,48,163,0.08)', fontSize: '0.85rem' }}>
          <strong>{fmtMonto(s.monto)}</strong> esperando a {s.repartidor_nombre || 'el repartidor'}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginLeft: 8, fontSize: '0.78rem' }}
            onClick={() => {
              if (!confirm('¿Cancelar este abono? No se registrará el gasto.')) return;
              void correr(() => cancelarSolicitudAbonoFinAnio(supabase, { solicitudId: s.id, cajeroNombre: user?.nombre }));
            }}
          >Cancelar</button>
        </div>
      ))}
    </div>
  ) : null;

  if (false && soloAbono) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={onVolver}>← Venta en ruta</button>
          <button type="button" className="btn btn-ghost" onClick={() => setTutorialAbierto(true)}>Ver tutorial</button>
        </div>
        {aviso && (
          <div className="card" style={{ borderLeft: '4px solid #b45309' }}>
            <p style={{ margin: 0 }}>{aviso}</p>
          </div>
        )}
        {panelAbono || (
          <div className="card">
            <h4 style={{ margin: 0 }}>Abono a la cuenta</h4>
            <p className="muted" style={{ margin: '0.45rem 0 0' }}>
              Esta tienda no tiene una cuenta abierta para abonar.
            </p>
          </div>
        )}
        <VisorTutorialModal
          abierto={tutorialAbierto}
          tutorial={TUTORIAL_CREDITO_FIN_ANIO}
          onCerrar={() => setTutorialAbierto(false)}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" onClick={onVolver}>← Venta en ruta</button>
        <button type="button" className="btn btn-ghost" onClick={() => setTutorialAbierto(true)}>Ver tutorial</button>
        {sucursalId && (
          <button type="button" className="btn btn-ghost" onClick={volverTiendas}>← Sucursales</button>
        )}
        {cuenta && (
          <button type="button" className="btn btn-ghost" onClick={() => setCuentaId('')}>← {etiquetaTienda(sucursalId)}</button>
        )}
      </div>

      <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
        <h3 style={{ margin: 0, color: COLOR }}>Crédito fin de año</h3>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          La venta se hace en Venta en ruta. El cajero abona aquí y el recolector recibe la notificación para aprobarlo con su PIN.
        </p>
      </div>

      {esAdmin && (
        <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Inventario total</p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '1.8rem', fontWeight: 700 }}>{fmtMonto(inventarioCamion.valorTotal)}</p>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>Valor de los cuetes cargados en el camión.</p>
          </div>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Inventario en tiempo real</p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '1.8rem', fontWeight: 700, color: COLOR }}>{fmtMonto(inventarioCamion.valorReal)}</p>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>Baja con cada venta de cuetes. Se actualiza solo.</p>
          </div>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Crédito de cuetes</p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '1.8rem', fontWeight: 700, color: COLOR }}>{fmtMonto(creditoCuete.pendiente)}</p>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
              {creditoCuete.abonado > 0
                ? `Crédito ${fmtMonto(creditoCuete.credito)} − abono ${fmtMonto(creditoCuete.abonado)}.`
                : 'Solo cuetes vendidos a crédito. Sin abonos.'}
            </p>
          </div>
        </div>
      )}

      {aviso && (
        <div className="card" style={{ borderLeft: '4px solid #b45309' }}>
          <p style={{ margin: 0 }}>{aviso}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn ${pestana === 'credito' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setPestana('credito')}
        >
          Crédito por tienda
        </button>
        <button
          type="button"
          className={`btn ${pestana === 'liquidacion' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setPestana('liquidacion')}
        >
          Liquidación
        </button>
      </div>

      {pestana === 'credito' && (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {panelAbono}
          {tiendasCredito.length === 0 && (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>Todavía no hay ventas a crédito de cuetes.</p>
            </div>
          )}
          {tiendasCredito.map((t) => {
            const abierta = tiendaAbierta === t.sucursal_id;
            return (
              <div key={t.sucursal_id} className="card" style={{ borderTop: `4px solid ${COLOR}`, display: 'grid', gap: '0.65rem' }}>
                <button
                  type="button"
                  onClick={() => { setTiendaAbierta(abierta ? '' : t.sucursal_id); setTicketAbierto(''); }}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}
                >
                  <span>
                    <strong style={{ color: COLOR }}>{t.nombre || etiquetaTienda(t.sucursal_id)}</strong>
                    <span className="muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>
                      {t.tickets.length} {t.tickets.length === 1 ? 'ticket' : 'tickets'}
                    </span>
                  </span>
                  <span className="muted">{abierta ? 'Ocultar' : 'Ver tickets'}</span>
                </button>
                <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                  <div>
                    <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>Crédito</p>
                    <strong>{fmtMonto(t.credito)}</strong>
                  </div>
                  <div>
                    <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>Abonado</p>
                    <strong>{fmtMonto(t.abonado)}</strong>
                  </div>
                  <div>
                    <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>Pendiente</p>
                    <strong style={{ color: COLOR }}>{fmtMonto(t.pendiente)}</strong>
                  </div>
                </div>
                {abierta && t.tickets.map((ticket) => {
                  const abierto = ticketAbierto === String(ticket.id);
                  return (
                    <div key={ticket.id || ticket.folio} style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: '0.55rem' }}>
                      <button
                        type="button"
                        onClick={() => setTicketAbierto(abierto ? '' : String(ticket.id))}
                        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span>
                          <strong>{ticket.folio || 'Sin folio'}</strong>
                          <span className="muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>
                            {fechaPhoenix(ticket.created_at)}
                            {ticket.vendedor ? ` · ${ticket.vendedor}` : ''}
                            {ticket.estado ? ` · ${ticket.estado}` : ''}
                          </span>
                        </span>
                        <span>
                          <strong>{fmtMonto(ticket.credito)}</strong>
                          <span className="muted" style={{ marginLeft: 8, fontSize: '0.78rem' }}>{abierto ? 'Ocultar' : 'Ver'}</span>
                        </span>
                      </button>
                      {ticket.abonado > 0 && (
                        <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.78rem' }}>
                          Abonado {fmtMonto(ticket.abonado)} · pendiente {fmtMonto(ticket.pendiente)}
                        </p>
                      )}
                      {abierto && (
                        <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.25rem' }}>
                          {ticket.lineas.map((l, i) => (
                            <p key={`${ticket.id}-${i}`} style={{ margin: 0, fontSize: '0.85rem' }}>
                              {l.nombre}
                              <span className="muted"> · {fmtQty(l.cantidad)} × {fmtMonto(l.precio)} · {fmtMonto(l.importe)}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {false && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {tarjetas.map((t) => (
            <button
              key={t.sucursalId}
              type="button"
              className="card"
              onClick={() => { setSucursalId(t.sucursalId); setCuentaId(''); }}
              style={{ textAlign: 'left', cursor: 'pointer', borderTop: `4px solid ${COLOR}` }}
            >
              <strong style={{ color: COLOR }}>{etiquetaTienda(t.sucursalId)}</strong>
              <p style={{ margin: '0.45rem 0 0', fontSize: '1.35rem', fontWeight: 700 }}>{fmtMonto(t.total)}</p>
              <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.78rem' }}>Total de cuetes</p>
            </button>
          ))}
        </div>
      )}

      {pestana === 'liquidacion' && !sucursalId && (
        <div className="card" style={{ display: 'grid', gap: '0.85rem', maxWidth: 640 }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Total de las tiendas</p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '1.6rem', fontWeight: 700 }}>
              {fmtMonto(totalCuete)}
            </p>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
              Cuetes vendidos que siguen a crédito, más lo cobrado que todavía no se liquida.
            </p>
          </div>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Abonos</p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '1.35rem', fontWeight: 700 }}>
              − {fmtMonto(abonoCuete)}
            </p>
            {abonoCuete > 0 ? (
              <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.45rem' }}>
                {partesCuete.map((t) => (
                  <div key={t.sucursal_id}>
                    <strong>{t.nombre || etiquetaTienda(t.sucursal_id)}</strong>
                    <span className="muted"> · {fmtMonto(t.monto)}</span>
                    {t.abonos.filter((a) => a.created_at || a.notas).map((a, i) => (
                      <p key={`${t.sucursal_id}-${a.ref || a.created_at || i}`} className="muted" style={{ margin: '0.15rem 0 0 0.75rem', fontSize: '0.8rem' }}>
                        {a.notas || 'Abono'} {fmtMonto(a.monto)}
                        {a.created_at ? ` · ${fechaPhoenix(a.created_at)}` : ''}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>Nadie ha abonado.</p>
            )}
          </div>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Liquidación</p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '1.6rem', fontWeight: 700, color: COLOR }}>
              {fmtMonto(abonoCuete)}
            </p>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
              {abonoCuete > 0
                ? `Al liquidar, el crédito de cuetes queda en ${fmtMonto(pendienteCuete)}.`
                : 'Sin abonos, la liquidación queda en cero.'}
            </p>
          </div>
          {!soloSuTienda && !soloLectura && (
            <button type="button" className="btn btn-primary" disabled={guardando || !(abonoCuete > 0)} onClick={() => void liquidar()}>
              Liquidar{abonoCuete > 0 ? ` · ${fmtMonto(abonoCuete)}` : ''}
            </button>
          )}
          <div>
            <h4 style={{ margin: '0.2rem 0 0.5rem' }}>Registro</h4>
            {liquidaciones.filter((row) => String(row.estado) === 'cerrada' && sumaPartes(partesDe(row)) > 0).length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Al liquidar, aquí queda una línea con ese total.</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.4rem' }}>
                {liquidaciones.filter((row) => String(row.estado) === 'cerrada' && sumaPartes(partesDe(row)) > 0).map((row) => {
                  const abiertaFila = lineaAbierta === String(row.id);
                  const enCursoFila = String(row.estado || '') === 'abierta';
                  const tiendasFila = partesDe(row);
                  const montoFila = sumaPartes(tiendasFila);
                  return (
                    <div key={row.id || `${row.created_at}-${row.monto}`} style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 8 }}>
                      <button
                        type="button"
                        onClick={() => setLineaAbierta(abiertaFila ? '' : String(row.id))}
                        style={{
                          width: '100%',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.7rem 0.85rem',
                          background: 'transparent',
                          border: 0,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span>
                          <strong>{fmtMonto(montoFila)}</strong>
                          <span className="muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>
                            {enCursoFila ? 'En curso' : fechaPhoenix(row.created_at)}
                            {row.created_by ? ` · ${row.created_by}` : ''}
                          </span>
                        </span>
                        <span className="muted">{abiertaFila ? 'Ocultar' : 'Ver tiendas'}</span>
                      </button>
                      {abiertaFila && (
                        <div style={{ padding: '0 0.85rem 0.75rem', display: 'grid', gap: '0.55rem' }}>
                          {tiendasFila.length === 0 && (
                            <p className="muted" style={{ margin: 0 }}>Esta línea no tiene tiendas.</p>
                          )}
                          {tiendasFila.map((t) => (
                            <div key={t.sucursal_id}>
                              <strong>{etiquetaTienda(t.sucursal_id)}</strong>
                              <span className="muted"> · {fmtMonto(t.monto)}</span>
                              {t.abonos.filter((a) => a.created_at || a.notas).map((a, i) => (
                                <p key={`${t.sucursal_id}-${a.created_at || i}`} className="muted" style={{ margin: '0.15rem 0 0 0.75rem', fontSize: '0.8rem' }}>
                                  Abono {fmtMonto(a.monto)}
                                  {a.created_at ? ` · ${fechaPhoenix(a.created_at)}` : ''}
                                  {a.notas ? ` · ${a.notas}` : ''}
                                </p>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {sucursalId && !cuenta && (
        <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>{etiquetaTienda(sucursalId)}</h3>
          {cuentasTienda.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>Esta sucursal todavía no tiene cuentas de fin de año.</p>
          )}
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {cuentasTienda.map((c) => {
              const r = resumenCuenta(
                movimientos.filter((m) => String(m.cuenta_id) === String(c.id)),
                abonos.filter((a) => String(a.cuenta_id) === String(c.id)),
              );
              return (
                <button
                  key={c.id}
                  type="button"
                  className="btn btn-ghost"
                  style={{ justifyContent: 'space-between', textAlign: 'left' }}
                  onClick={() => setCuentaId(c.id)}
                >
                  <span>
                    <strong>{c.nombre}</strong>
                    <span className="muted"> · {c.estado === ESTADO_CERRADA ? 'cerrada' : 'abierta'}</span>
                  </span>
                  <span>Saldo {fmtMonto(r.saldo)}</span>
                </button>
              );
            })}
          </div>
          {!soloLectura && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                <Campo label="Nueva cuenta">
                  <input className="input" value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} />
                </Campo>
                <Campo label="Notas">
                  <input className="input" value={notasNueva} onChange={(e) => setNotasNueva(e.target.value)} />
                </Campo>
              </div>
              <button type="button" className="btn btn-primary" disabled={guardando} onClick={() => void abrirCuenta()}>
                Abrir cuenta
              </button>
            </>
          )}
        </div>
      )}

      {cuenta && (
        <>
          <div className="card" style={{ display: 'grid', gap: '0.45rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0 }}>{cuenta.nombre}</h3>
                <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
                  {etiquetaTienda(sucursalId)} · {cerrada ? 'Cerrada' : 'Abierta'}
                  {cuenta.notas ? ` · ${cuenta.notas}` : ''}
                </p>
              </div>
              {!soloLectura && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditCuenta({ nombre: cuenta.nombre, notas: cuenta.notas || '' })}>Editar</button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void correr(() => editarCuentaFinAnio(supabase, cuenta.id, { estado: cerrada ? 'abierta' : ESTADO_CERRADA }))}
                >
                  {cerrada ? 'Reabrir' : 'Cerrar'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (!confirm('¿Quitar esta cuenta del registro?')) return;
                    void correr(() => archivarCuentaFinAnio(supabase, cuenta.id)).then((ok) => { if (ok) setCuentaId(''); });
                  }}
                >
                  Eliminar
                </button>
              </div>
              )}
            </div>
            {editCuenta && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                <Campo label="Nombre">
                  <input className="input" value={editCuenta.nombre} onChange={(e) => setEditCuenta({ ...editCuenta, nombre: e.target.value })} />
                </Campo>
                <Campo label="Notas">
                  <input className="input" value={editCuenta.notas} onChange={(e) => setEditCuenta({ ...editCuenta, notas: e.target.value })} />
                </Campo>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'end' }}>
                  <button type="button" className="btn btn-primary" onClick={() => void correr(() => editarCuentaFinAnio(supabase, cuenta.id, editCuenta)).then((ok) => { if (ok) setEditCuenta(null); })}>Guardar</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditCuenta(null)}>Cancelar</button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.92rem' }}>
              <span>Dejado {fmtMonto(resumen.dejado)}</span>
              <span>Retirado {fmtMonto(resumen.retirado)}</span>
              <span>Mercancía {fmtMonto(resumen.saldoMercancia)}</span>
              <span>Abonos {fmtMonto(resumen.abonado)}</span>
              <strong>Saldo {fmtMonto(resumen.saldo)}</strong>
            </div>
            {resumen.saldo < 0 && <p className="muted" style={{ margin: 0 }}>La cuenta queda a favor de la sucursal.</p>}
          </div>

          {!cerrada && puedeMercancia && (
            <div className="card" style={{ display: 'grid', gap: '0.55rem' }}>
              <h4 style={{ margin: 0 }}>Dejar mercancía a crédito</h4>
              <Campo label="Buscar en el catálogo (un código carga ese artículo y lo descuenta del camión)">
                <input className="input" value={busca} placeholder="Código o nombre" onChange={(e) => setBusca(e.target.value)} />
              </Campo>
              {sugerencias.length > 0 && (
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {sugerencias.map((p) => (
                    <button key={p.id || p.codigo} type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => elegirProducto(p)}>
                      {codigoVisibleProducto(p) ? `${codigoVisibleProducto(p)} · ` : ''}{p.nombre}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                <Campo label="Producto">
                  <input className="input" value={deja.nombre} onChange={(e) => setDeja({ ...deja, nombre: e.target.value })} />
                </Campo>
                <Campo label="Código">
                  <input className="input" value={deja.codigo} onChange={(e) => setDeja({ ...deja, codigo: e.target.value })} />
                </Campo>
                <Campo label="Cantidad">
                  <input className="input" inputMode="decimal" value={deja.cantidad} onChange={(e) => setDeja({ ...deja, cantidad: e.target.value })} />
                </Campo>
                <Campo label="Precio">
                  <input className="input" inputMode="decimal" value={deja.precio} onChange={(e) => setDeja({ ...deja, precio: e.target.value })} />
                </Campo>
                <Campo label="Nota">
                  <input className="input" value={deja.notas} onChange={(e) => setDeja({ ...deja, notas: e.target.value })} />
                </Campo>
              </div>
              <button type="button" className="btn btn-primary" disabled={guardando} onClick={() => void dejar()}>Dejar en la cuenta</button>
            </div>
          )}

          <div className="card" style={{ overflowX: 'auto' }}>
            <h4 style={{ margin: '0 0 0.5rem' }}>Inventario de la cuenta</h4>
            {inventarioCuenta.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Todavía no hay mercancía en esta cuenta.</p>
            ) : (
              <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr><th>Producto</th><th>Código</th><th>Cantidad</th><th>Valor</th></tr>
                </thead>
                <tbody>
                  {inventarioCuenta.map((l) => (
                    <tr key={l.clave}>
                      <td>{l.nombre}</td>
                      <td>{l.codigo || '—'}</td>
                      <td>{fmtQty(l.cantidad)}</td>
                      <td>{fmtMonto(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!soloLectura && inventarioCuenta.some((l) => Number(l.cantidad) > 0) && (
              <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} disabled={guardando} onClick={() => void enviarCompras()}>
                Enviar inventario a Compras
              </button>
            )}
            {recibos.filter((r) => String(r.cuenta_id) === String(cuenta.id)).map((recibo) => (
              <div key={recibo.id || recibo.folio} style={{ marginTop: '0.75rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span>Recibo {recibo.folio} · {fmtMonto(recibo.total)}</span>
                <button type="button" className="btn btn-ghost" onClick={() => setReciboVer(recibo)}>Ver</button>
                <button type="button" className="btn btn-ghost" onClick={() => imprimirRecibo(recibo)}>Imprimir</button>
                {onNavigate && recibo.compra_id && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => onNavigate('Compras', { compraId: recibo.compra_id, sucursalRecepcion: recibo.sucursal_id })}
                  >
                    Ver en Compras
                  </button>
                )}
              </div>
            ))}
            {reciboVer && String(reciboVer.cuenta_id || cuenta.id) === String(cuenta.id) && (
              <div style={{ marginTop: '0.75rem' }}>
                <p style={{ margin: '0 0 0.35rem' }}><strong>Recibo {reciboVer.folio}</strong></p>
                <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr><th>Producto</th><th>Código</th><th>Cantidad</th><th>Precio</th></tr>
                  </thead>
                  <tbody>
                    {itemsRecibo(reciboVer).map((l) => (
                      <tr key={`${l.id}-${l.nombre}`}>
                        <td>{l.nombre}</td>
                        <td>{l.id || '—'}</td>
                        <td>{fmtQty(l.qty_pedido)}</td>
                        <td>{fmtMonto(l.costo_est)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ margin: '0.4rem 0 0' }}>Total {fmtMonto(reciboVer.total)}</p>
              </div>
            )}
          </div>

          {!cerrada && puedeMercancia && inventarioCuenta.some((l) => l.cantidad > 0) && (
            <div className="card" style={{ display: 'grid', gap: '0.55rem' }}>
              <h4 style={{ margin: 0 }}>Retirar de la cuenta</h4>
              <Campo label="Producto">
                <select
                  className="input"
                  value={retiroClave}
                  onChange={(e) => {
                    const clave = e.target.value;
                    setRetiroClave(clave);
                    const linea = inventarioCuenta.find((l) => l.clave === clave);
                    const precio = linea && linea.cantidad ? linea.valor / linea.cantidad : 0;
                    setRetiro((r) => ({ ...r, precio: precio ? String(Math.round(precio * 100) / 100) : '' }));
                  }}
                >
                  <option value="">Elige</option>
                  {inventarioCuenta.filter((l) => l.cantidad > 0).map((l) => (
                    <option key={l.clave} value={l.clave}>{l.nombre} · {fmtQty(l.cantidad)}</option>
                  ))}
                </select>
              </Campo>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                <Campo label="Cantidad">
                  <input className="input" inputMode="decimal" value={retiro.cantidad} onChange={(e) => setRetiro({ ...retiro, cantidad: e.target.value })} />
                </Campo>
                <Campo label="Precio">
                  <input className="input" inputMode="decimal" value={retiro.precio} onChange={(e) => setRetiro({ ...retiro, precio: e.target.value })} />
                </Campo>
                <Campo label="Nota">
                  <input className="input" value={retiro.notas} onChange={(e) => setRetiro({ ...retiro, notas: e.target.value })} />
                </Campo>
              </div>
              <button type="button" className="btn btn-primary" disabled={guardando} onClick={() => void retirar()}>Retirar</button>
            </div>
          )}

          {panelAbono}

          <div className="card" style={{ overflowX: 'auto' }}>
            <h4 style={{ margin: '0 0 0.5rem' }}>Movimientos</h4>
            {movsCuenta.length === 0 ? <p className="muted" style={{ margin: 0 }}>Sin movimientos.</p> : (
              <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Cant.</th><th>Importe</th>{!soloLectura && <th></th>}</tr>
                </thead>
                <tbody>
                  {movsCuenta.map((m) => (
                    <tr key={m.id}>
                      <td>{fechaPhoenix(m.created_at)}</td>
                      <td>{m.tipo === TIPO_RETIRAR ? 'Retiro' : 'Dejó'}</td>
                      <td>{m.nombre}</td>
                      <td>{fmtQty(m.cantidad)}</td>
                      <td>{fmtMonto(m.importe)}</td>
                      {!soloLectura && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => setEditMov({ id: m.id, nombre: m.nombre, codigo: m.codigo || '', cantidad: m.cantidad, precio: m.precio, notas: m.notas || '' })}>Editar</button>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => { if (confirm('¿Quitar este movimiento?')) void correr(() => archivarMovimientoFinAnio(supabase, m.id)); }}>Eliminar</button>
                      </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {editMov && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.45rem', marginTop: '0.6rem' }}>
                <Campo label="Producto"><input className="input" value={editMov.nombre} onChange={(e) => setEditMov({ ...editMov, nombre: e.target.value })} /></Campo>
                <Campo label="Código"><input className="input" value={editMov.codigo} onChange={(e) => setEditMov({ ...editMov, codigo: e.target.value })} /></Campo>
                <Campo label="Cantidad"><input className="input" value={editMov.cantidad} onChange={(e) => setEditMov({ ...editMov, cantidad: e.target.value })} /></Campo>
                <Campo label="Precio"><input className="input" value={editMov.precio} onChange={(e) => setEditMov({ ...editMov, precio: e.target.value })} /></Campo>
                <Campo label="Nota"><input className="input" value={editMov.notas} onChange={(e) => setEditMov({ ...editMov, notas: e.target.value })} /></Campo>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'end' }}>
                  <button type="button" className="btn btn-primary" onClick={() => void correr(() => editarMovimientoFinAnio(supabase, editMov.id, editMov)).then((ok) => { if (ok) setEditMov(null); })}>Guardar</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditMov(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ overflowX: 'auto' }}>
            <h4 style={{ margin: '0 0 0.5rem' }}>Abonos</h4>
            {abonosCuenta.length === 0 ? <p className="muted" style={{ margin: 0 }}>Sin abonos.</p> : (
              <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr><th>Fecha</th><th>Monto</th><th>Nota</th><th>Quién</th>{!soloLectura && <th></th>}</tr>
                </thead>
                <tbody>
                  {abonosCuenta.map((a) => (
                    <tr key={a.id}>
                      <td>{fechaPhoenix(a.created_at)}</td>
                      <td>{fmtMonto(a.monto)}</td>
                      <td>{a.notas || '—'}</td>
                      <td>{a.created_by || '—'}</td>
                      {!soloLectura && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => setEditAbono({ id: a.id, monto: a.monto, notas: a.notas || '' })}>Editar</button>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => { if (confirm('¿Quitar este abono?')) void correr(() => archivarAbonoFinAnio(supabase, a.id)); }}>Eliminar</button>
                      </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {editAbono && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.45rem', marginTop: '0.6rem' }}>
                <Campo label="Monto"><input className="input" value={editAbono.monto} onChange={(e) => setEditAbono({ ...editAbono, monto: e.target.value })} /></Campo>
                <Campo label="Nota"><input className="input" value={editAbono.notas} onChange={(e) => setEditAbono({ ...editAbono, notas: e.target.value })} /></Campo>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'end' }}>
                  <button type="button" className="btn btn-primary" onClick={() => void correr(() => editarAbonoFinAnio(supabase, editAbono.id, editAbono)).then((ok) => { if (ok) setEditAbono(null); })}>Guardar</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditAbono(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      <VisorTutorialModal
        abierto={tutorialAbierto}
        tutorial={TUTORIAL_CREDITO_FIN_ANIO}
        onCerrar={() => setTutorialAbierto(false)}
      />
    </div>
  );
}
