import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SubcomandosHub from '../components/SubcomandosHub.jsx';
import ProductoThumb from '../components/ProductoThumb.jsx';
import Icon from '../components/Icon.jsx';
import PortalFlotante from '../components/PortalFlotante.jsx';
import CampoCodigo from '../components/CampoCodigo.jsx';
import PanelLiquidacionRecolecciones from '../components/PanelLiquidacionRecolecciones.jsx';
import InputPin from '../components/InputPin.jsx';
import PanelPurgaVentaEnRuta from '../components/PanelPurgaVentaEnRuta.jsx';
import {
  AVISO_FALTA_VENTA_RUTA,
  NOMBRE_ALMACEN_RUTA,
  cancelarCargaRuta,
  catalogoPosCamionDesdeLineas,
  crearCargaRuta,
  guardarClienteRuta,
  guardarPrecioRutaProducto,
  lineasDeVariasCargas,
  listarCargasRuta,
  listarClientesRuta,
  listarDestinosVentaRuta,
  listarReporteIngresosCargaRuta,
  listarUsuariosRepartidores,
  listarRecolectoresCargaRuta,
  listarVendedoresSesionRuta,
  listarAdministradoresCorteRuta,
  listarVentasRuta,
  precioRutaEspecial,
  registrarVentaRuta,
  verificarPinVendedorSesionRuta,
  verificarPinAdminCorteRuta,
} from '../lib/ventaEnRuta.js';
import {
  guardarCarritoPosRuta,
  leerCarritoPosRuta,
  limpiarCarritoPosRuta,
} from '../lib/carritoPosRutaPersistencia.js';
import { subcomandosVentaRutaVisibles, puedeAccionVentaRuta } from '../lib/ventaEnRutaAcciones.js';
import {
  AVISO_FALTA_RUTA_CAMIONES,
  actualizarCamionRuta,
  crearCamionRuta,
  desactivarCamionRuta,
  etiquetaCamion,
  listarCamionesRuta,
  reactivarCamionRuta,
  resolverCamionVendedor,
  slugCodigoCamion,
} from '../lib/rutaCamiones.js';
import { listarCreditosCobradosRuta } from '../lib/rutaCxc.js';
import { buscarProductoInventario } from '../lib/comprasRecepcion.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { stockEnUbicacion, ALMACEN_CENTRAL } from '../lib/inventarioMultitienda.js';
import { etiquetaDepartamento, listarDepartamentos, normalizarDepartamento } from '../lib/departamentos.js';
import {
  DEPARTAMENTOS_CEDIS_UI,
  departamentoFiltroCoincideCedis,
} from '../lib/catalogoCedis.js';
import { productoCoincideBusqueda } from '../lib/buscarProductoTexto.js';
import { esRolRepartidor, normalizarRol } from '../lib/roles.js';
import CorteRuta from './CorteRuta.jsx';
import PreinventarioRuta from './PreinventarioRuta.jsx';
import CobranzaRuta from './CobranzaRuta.jsx';
import './VentaEnRuta.css';

const COLOR = '#0f766e';
const LS_SESION_VENDEDOR = 'pos3b_ruta_vendedor_sesion';
const LS_SESION_ADMIN_CORTE = 'pos3b_ruta_admin_corte';

function leerSesionVendedorGuardada() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_SESION_VENDEDOR) || 'null');
    if (j?.id && j?.nombre) return j;
  } catch {
    /* ignore */
  }
  return null;
}

function guardarSesionVendedor(sesion) {
  try {
    if (!sesion) localStorage.removeItem(LS_SESION_VENDEDOR);
    else localStorage.setItem(LS_SESION_VENDEDOR, JSON.stringify(sesion));
  } catch {
    /* ignore */
  }
}

function leerSesionAdminCorte() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_SESION_ADMIN_CORTE) || 'null');
    if (j?.id && j?.nombre) return j;
  } catch {
    /* ignore */
  }
  return null;
}

function guardarSesionAdminCorte(sesion) {
  try {
    if (!sesion) localStorage.removeItem(LS_SESION_ADMIN_CORTE);
    else localStorage.setItem(LS_SESION_ADMIN_CORTE, JSON.stringify(sesion));
  } catch {
    /* ignore */
  }
}

function fmtQty(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}

function esAdminOGerente(rol) {
  const r = normalizarRol(rol);
  return r === 'Administrador' || r === 'Gerente';
}

export default function VentaEnRuta({ supabase, user, inventario = [], onNavigate, sucursal, cargarDatos, fusionarProducto }) {
  const [vista, setVista] = useState('hub');
  const [aviso, setAviso] = useState('');
  const [vendedorSesion, setVendedorSesion] = useState(() => {
    if (esRolRepartidor(user?.rol) && user?.id) {
      return { id: user.id, nombre: user.nombre || user.email || 'Repartidor', rol: user.rol };
    }
    return leerSesionVendedorGuardada();
  });
  const [adminCorteSesion, setAdminCorteSesion] = useState(() => {
    if (esAdminOGerente(user?.rol) && user?.id) {
      return { id: user.id, nombre: user.nombre || user.email || 'Admin', rol: user.rol };
    }
    return leerSesionAdminCorte();
  });

  const productoPorId = useMemo(() => {
    const m = new Map();
    for (const p of inventario || []) m.set(String(p.id), p);
    return m;
  }, [inventario]);

  const subs = useMemo(
    () =>
      subcomandosVentaRutaVisibles(user?.rol, user?.id).map((s) => ({
        id: s.vista,
        label: s.label,
        desc: s.desc,
        icon: s.icon,
      })),
    [user?.rol, user?.id],
  );

  const puede = useCallback(
    (accionId) => puedeAccionVentaRuta(user?.rol, user?.id, accionId),
    [user?.rol, user?.id],
  );

  const ir = (id) => {
    setAviso('');
    setVista(id);
  };

  const cerrarSesionVendedor = () => {
    setVendedorSesion(null);
    guardarSesionVendedor(null);
    if (vista === 'venta') setVista('hub');
  };

  const cerrarSesionAdminCorte = () => {
    setAdminCorteSesion(null);
    guardarSesionAdminCorte(null);
    if (vista === 'corte') setVista('hub');
  };

  const onSesionVendedorOk = async (sesion) => {
    let next = { ...sesion };
    try {
      const cam = await resolverCamionVendedor(supabase, sesion);
      if (cam.data) {
        next = {
          ...next,
          camion_id: cam.data.id,
          camionEtiqueta: etiquetaCamion(cam.data),
        };
      }
    } catch {
      /* ignore */
    }
    setVendedorSesion(next);
    guardarSesionVendedor(next);
  };

  const onSesionAdminCorteOk = (sesion) => {
    setAdminCorteSesion(sesion);
    guardarSesionAdminCorte(sesion);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        {vista !== 'hub' && (
          <button type="button" className="btn btn-ghost" style={{ marginBottom: '0.5rem' }} onClick={() => ir('hub')}>
            ← Venta en Ruta
          </button>
        )}
        <h2 style={{ margin: 0, color: COLOR }}>Venta en Ruta</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          {NOMBRE_ALMACEN_RUTA} → camión → POS. Efectivo a tránsito · Crédito lo paga el cajero con PIN ·
          mercancía a la tienda por Traspasos (inventario comprometido hasta recibir).
        </p>
      </div>
      {aviso && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', fontSize: '0.85rem' }}>{aviso}</div>
      )}
      {vendedorSesion && (vista === 'hub' || vista === 'venta') && (
        <div
          className="card"
          style={{
            margin: 0,
            padding: '0.55rem 0.85rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderLeft: `4px solid ${COLOR}`,
          }}
        >
          <span style={{ fontSize: '0.9rem' }}>
            Vendedor en sesión: <strong>{vendedorSesion.nombre}</strong>
            {vendedorSesion.camionEtiqueta ? (
              <span className="muted"> · {vendedorSesion.camionEtiqueta}</span>
            ) : null}
          </span>
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={cerrarSesionVendedor}>
            Cerrar sesión vendedor
          </button>
        </div>
      )}
      {adminCorteSesion && (vista === 'hub' || vista === 'corte') && (
        <div
          className="card"
          style={{
            margin: 0,
            padding: '0.55rem 0.85rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderLeft: '4px solid #1d4ed8',
          }}
        >
          <span style={{ fontSize: '0.9rem' }}>
            Corte autenticado por: <strong>{adminCorteSesion.nombre}</strong>
            <span className="muted"> · {adminCorteSesion.rol || 'Admin'}</span>
          </span>
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={cerrarSesionAdminCorte}>
            Cerrar sesión admin
          </button>
        </div>
      )}
      {vista === 'hub' && (
        <>
          <SubcomandosHub
            color={COLOR}
            items={subs.map((s) => ({ ...s, ayuda: s.desc, color: COLOR }))}
            onSelect={ir}
          />
          <PanelPurgaVentaEnRuta
            supabase={supabase}
            user={user}
            sucursal={sucursal}
            onPurgado={() => {
              setVendedorSesion(null);
              guardarSesionVendedor(null);
              setAdminCorteSesion(null);
              guardarSesionAdminCorte(null);
              setAviso('Datos de Venta en Ruta borrados. El módulo quedó listo para iniciar operación.');
            }}
          />
        </>
      )}
      {vista === 'camiones' && puede('ruta_camiones') && (
        <VistaCamiones
          supabase={supabase}
          setAviso={setAviso}
        />
      )}
      {vista === 'carga' && puede('ruta_carga') && (
        <VistaCarga
          supabase={supabase}
          user={user}
          inventario={inventario}
          setAviso={setAviso}
          cargarDatos={cargarDatos}
          fusionarProducto={fusionarProducto}
        />
      )}
      {vista === 'precios' && puede('ruta_precios') && (
        <VistaPrecios supabase={supabase} user={user} inventario={inventario} setAviso={setAviso} />
      )}
      {vista === 'clientes' && puede('ruta_clientes') && <VistaClientes supabase={supabase} setAviso={setAviso} />}
      {vista === 'venta' && puede('ruta_pos') && (
        !vendedorSesion ? (
          <PanelSesionVendedorRuta
            supabase={supabase}
            user={user}
            sucursal={sucursal}
            titulo="Login vendedor · POS"
            onSesion={onSesionVendedorOk}
            setAviso={setAviso}
          />
        ) : (
          <VistaPos
            supabase={supabase}
            user={user}
            vendedorSesion={vendedorSesion}
            productoPorId={productoPorId}
            inventario={inventario}
            setAviso={setAviso}
            onNavigate={onNavigate}
          />
        )
      )}
      {vista === 'corte' && puede('ruta_corte') && (
        !adminCorteSesion ? (
          <PanelSesionAdminCorte
            supabase={supabase}
            user={user}
            sucursal={sucursal}
            onSesion={onSesionAdminCorteOk}
            setAviso={setAviso}
          />
        ) : (
          <CorteRuta
            supabase={supabase}
            user={user}
            adminSesion={adminCorteSesion}
            setAviso={setAviso}
          />
        )
      )}
      {vista === 'preinventario' && puede('ruta_preinventario') && (
        <PreinventarioRuta
          supabase={supabase}
          user={user}
          inventario={inventario}
          productoPorId={productoPorId}
          setAviso={setAviso}
          onVolver={() => ir('hub')}
        />
      )}
      {vista === 'creditos' && puede('ruta_creditos') && (
        <CobranzaRuta
          supabase={supabase}
          user={user}
          sucursal={sucursal || user?.sucursal_id}
          embedded
          titulo="Créditos por pagar"
        />
      )}
      {vista === 'liquidacion' && puede('ruta_liquidacion') && (
        <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
          <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Liquidación</h3>
          <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
            Recibe del repartidor el efectivo en tránsito generado por ventas del camión (y recolecciones asociadas).
          </p>
          <PanelLiquidacionRecolecciones supabase={supabase} user={user} embedded />
        </div>
      )}
      {vista === 'consultas' && puede('ruta_consultas') && (
        <VistaConsultas
          supabase={supabase}
          user={user}
          setAviso={setAviso}
          cargarDatos={cargarDatos}
          fusionarProducto={fusionarProducto}
        />
      )}
    </div>
  );
}

/** Selector de vendedor (usuarios Repartidor + Panel RT) + PIN para POS. */
function PanelSesionVendedorRuta({ supabase, user, sucursal, titulo, onSesion, setAviso }) {
  const [vendedores, setVendedores] = useState([]);
  const [vendedorId, setVendedorId] = useState('');
  const [pin, setPin] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState('');

  const esRep = esRolRepartidor(user?.rol);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setCargando(true);
      const r = await listarVendedoresSesionRuta(supabase);
      if (cancel) return;
      if (r.error) setAviso?.(r.error);
      const list = r.data || [];
      setVendedores(list);
      if (esRep && user?.id) {
        const match = list.find((v) => String(v.usuario_id || v.id) === String(user.id));
        if (match) setVendedorId(String(match.id));
      } else if (list.length === 1) {
        setVendedorId(String(list[0].id));
      }
      setCargando(false);
    })();
    return () => { cancel = true; };
  }, [supabase, setAviso, esRep, user?.id]);

  const entrarConSesionApp = () => {
    if (!esRep || !user?.id) return;
    onSesion?.({
      id: user.id,
      nombre: user.nombre || user.email || 'Repartidor',
      rol: user.rol,
      sucursal_id: user.sucursal_id,
      fuente: 'usuario',
      usuario_id: user.id,
    });
  };

  const entrar = async () => {
    setErr('');
    setGuardando(true);
    const r = await verificarPinVendedorSesionRuta(supabase, {
      pin,
      vendedorId,
      sucursal: sucursal || user?.sucursal_id,
      vendedores,
    });
    setGuardando(false);
    if (!r.ok) {
      setErr(r.error || 'No se pudo validar el PIN.');
      return;
    }
    setPin('');
    onSesion?.(r.user);
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}`, maxWidth: 480 }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>{titulo || 'Login vendedor'}</h3>
      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
        Elige el vendedor (rol Repartidor o recolector del Panel RT) e ingresa su PIN.
      </p>
      {cargando ? (
        <p className="muted">Cargando vendedores…</p>
      ) : !vendedores.length ? (
        <p className="muted">
          No hay vendedores. Crea usuarios con rol Repartidor o recolectores activos en Panel RT.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Vendedor
            <select
              className="input"
              style={{ marginTop: '0.35rem' }}
              value={vendedorId}
              onChange={(e) => { setVendedorId(e.target.value); setErr(''); }}
              disabled={guardando}
            >
              <option value="">— Selecciona —</option>
              {vendedores.map((u) => (
                <option key={u.id} value={u.id}>{u.etiqueta || u.nombre || u.id}</option>
              ))}
            </select>
          </label>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            PIN del vendedor
            <InputPin
              value={pin}
              onChange={(e) => { setPin(e.target.value); setErr(''); }}
              onKeyDown={(e) => e.key === 'Enter' && void entrar()}
              placeholder="PIN"
              disabled={guardando}
              autoFocus
              style={{ marginTop: '0.35rem', width: '100%' }}
            />
          </label>
          {err && <p style={{ margin: 0, color: '#b91c1c', fontSize: '0.85rem' }}>{err}</p>}
          <button
            type="button"
            className="btn btn-primary"
            disabled={guardando || !vendedorId || !String(pin).trim()}
            onClick={() => void entrar()}
          >
            {guardando ? 'Validando…' : 'Entrar'}
          </button>
          {esRep && String(user?.id) === String(vendedorId) && (
            <button type="button" className="btn btn-ghost" disabled={guardando} onClick={entrarConSesionApp}>
              Continuar como {user?.nombre || 'mi usuario'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Login de administrador/gerente para el corte de caja de ruta. */
function PanelSesionAdminCorte({ supabase, user, sucursal, onSesion, setAviso }) {
  const [admins, setAdmins] = useState([]);
  const [adminId, setAdminId] = useState('');
  const [pin, setPin] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState('');

  const soyAdmin = esAdminOGerente(user?.rol);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setCargando(true);
      const r = await listarAdministradoresCorteRuta(supabase);
      if (cancel) return;
      if (r.error) setAviso?.(r.error);
      const list = r.data || [];
      setAdmins(list);
      if (soyAdmin && user?.id) setAdminId(String(user.id));
      else if (list.length === 1) setAdminId(String(list[0].id));
      setCargando(false);
    })();
    return () => { cancel = true; };
  }, [supabase, setAviso, soyAdmin, user?.id]);

  const entrarConSesionApp = () => {
    if (!soyAdmin || !user?.id) return;
    onSesion?.({
      id: user.id,
      nombre: user.nombre || user.email || 'Admin',
      rol: user.rol,
      sucursal_id: user.sucursal_id,
    });
  };

  const entrar = async () => {
    setErr('');
    setGuardando(true);
    const r = await verificarPinAdminCorteRuta(supabase, {
      pin,
      adminId,
      sucursal: sucursal || user?.sucursal_id,
    });
    setGuardando(false);
    if (!r.ok) {
      setErr(r.error || 'No se pudo validar el PIN.');
      return;
    }
    setPin('');
    onSesion?.(r.user);
  };

  return (
    <div className="card" style={{ borderTop: '4px solid #1d4ed8', maxWidth: 480 }}>
      <h3 style={{ margin: '0 0 0.35rem', color: '#1d4ed8' }}>Login administrador · Corte de caja</h3>
      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
        El corte lo hace un administrador o gerente. Elige quién autentica e ingresa su PIN.
        Después podrás elegir de qué vendedor cortar.
      </p>
      {cargando ? (
        <p className="muted">Cargando administradores…</p>
      ) : !admins.length ? (
        <p className="muted">No hay usuarios con rol Administrador o Gerente activos.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Administrador
            <select
              className="input"
              style={{ marginTop: '0.35rem' }}
              value={adminId}
              onChange={(e) => { setAdminId(e.target.value); setErr(''); }}
              disabled={guardando}
            >
              <option value="">— Selecciona —</option>
              {admins.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre || u.id} · {u.rol || ''}
                </option>
              ))}
            </select>
          </label>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            PIN del administrador
            <InputPin
              value={pin}
              onChange={(e) => { setPin(e.target.value); setErr(''); }}
              onKeyDown={(e) => e.key === 'Enter' && void entrar()}
              placeholder="PIN"
              disabled={guardando}
              autoFocus
              style={{ marginTop: '0.35rem', width: '100%' }}
            />
          </label>
          {err && <p style={{ margin: 0, color: '#b91c1c', fontSize: '0.85rem' }}>{err}</p>}
          <button
            type="button"
            className="btn btn-primary"
            disabled={guardando || !adminId || !String(pin).trim()}
            onClick={() => void entrar()}
          >
            {guardando ? 'Validando…' : 'Autenticar corte'}
          </button>
          {soyAdmin && String(user?.id) === String(adminId) && (
            <button type="button" className="btn btn-ghost" disabled={guardando} onClick={entrarConSesionApp}>
              Continuar como {user?.nombre || 'mi usuario'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function VistaCamiones({ supabase, setAviso }) {
  const [camiones, setCamiones] = useState([]);
  const [recolectores, setRecolectores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({
    codigo: '',
    placa: '',
    alias: '',
    repartidorId: '',
    notas: '',
  });

  const nombreRt = useMemo(() => {
    const m = new Map();
    for (const r of recolectores) m.set(String(r.repartidor_id || r.id), r.nombre || r.id);
    return m;
  }, [recolectores]);

  const refrescar = useCallback(async () => {
    setCargando(true);
    const [c, r] = await Promise.all([
      listarCamionesRuta(supabase),
      listarRecolectoresCargaRuta(supabase),
    ]);
    if (c.aviso) setAviso?.(c.aviso);
    if (c.error) setAviso?.(c.error);
    if (r.error) setAviso?.(r.error);
    setCamiones(c.data || []);
    setRecolectores(r.data || []);
    setCargando(false);
  }, [supabase, setAviso]);

  useEffect(() => { void refrescar(); }, [refrescar]);

  const rtOcupados = useMemo(() => {
    const s = new Set();
    for (const c of camiones) {
      if (c.activo !== false && c.repartidor_id && (!edit || String(edit.id) !== String(c.id))) {
        s.add(String(c.repartidor_id));
      }
    }
    return s;
  }, [camiones, edit]);

  const resolverAsignacion = (repartidorId) => {
    const rt = recolectores.find((x) => String(x.repartidor_id || x.id) === String(repartidorId));
    if (!rt) return { usuarioId: null, repartidorId: repartidorId || null };
    return {
      usuarioId: rt.usuario_id || null,
      repartidorId: rt.repartidor_id || rt.id,
    };
  };

  const resetForm = () => {
    setForm({ codigo: '', placa: '', alias: '', repartidorId: '', notas: '' });
    setEdit(null);
  };

  const guardarNuevo = async () => {
    if (!form.repartidorId) return alert('Selecciona el recolector / repartidor del Panel RT.');
    const asig = resolverAsignacion(form.repartidorId);
    setGuardando(true);
    const r = await crearCamionRuta(supabase, {
      codigo: form.codigo || form.alias || form.placa,
      placa: form.placa,
      alias: form.alias,
      usuarioId: asig.usuarioId,
      repartidorId: asig.repartidorId,
      notas: form.notas,
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    resetForm();
    void refrescar();
  };

  const guardarEdicion = async () => {
    if (!edit?.id) return;
    if (!edit.repartidor_id) return alert('Selecciona el recolector / repartidor del Panel RT.');
    const asig = resolverAsignacion(edit.repartidor_id);
    setGuardando(true);
    const r = await actualizarCamionRuta(supabase, edit.id, {
      codigo: edit.codigo,
      placa: edit.placa,
      alias: edit.alias,
      usuarioId: asig.usuarioId,
      repartidorId: asig.repartidorId,
      notas: edit.notas,
      activo: edit.activo !== false,
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    resetForm();
    void refrescar();
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Camiones</h3>
      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
        Crea unidades y asígnalas a un <strong>recolector / repartidor</strong> del Panel RT
        (los mismos que en Carga de camión). Cada recolector activo solo puede tener un camión.
      </p>

      {!edit ? (
        <div style={{
          marginBottom: '1rem',
          padding: '0.85rem',
          background: `${COLOR}0d`,
          borderRadius: 8,
          display: 'grid',
          gap: '0.65rem',
        }}
        >
          <div style={{ display: 'grid', gap: '0.65rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <label className="muted" style={{ fontSize: '0.8rem' }}>
              Código
              <input
                className="input"
                style={{ marginTop: '0.35rem' }}
                value={form.codigo}
                placeholder="CAM-01"
                onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                onBlur={() => setForm((f) => ({
                  ...f,
                  codigo: slugCodigoCamion(f.codigo) || f.codigo,
                }))}
              />
            </label>
            <label className="muted" style={{ fontSize: '0.8rem' }}>
              Alias
              <input
                className="input"
                style={{ marginTop: '0.35rem' }}
                value={form.alias}
                placeholder="Camión norte"
                onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
              />
            </label>
            <label className="muted" style={{ fontSize: '0.8rem' }}>
              Placa
              <input
                className="input"
                style={{ marginTop: '0.35rem' }}
                value={form.placa}
                onChange={(e) => setForm((f) => ({ ...f, placa: e.target.value }))}
              />
            </label>
          </div>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Recolector / repartidor
            <select
              className="input"
              style={{ marginTop: '0.35rem' }}
              value={form.repartidorId}
              onChange={(e) => setForm((f) => ({ ...f, repartidorId: e.target.value }))}
            >
              <option value="">— Seleccionar recolector —</option>
              {recolectores.map((r) => {
                const rid = r.repartidor_id || r.id;
                return (
                  <option key={rid} value={rid} disabled={rtOcupados.has(String(rid))}>
                    {r.nombre}{rtOcupados.has(String(rid)) ? ' (ya tiene camión)' : ''}
                  </option>
                );
              })}
            </select>
          </label>
          {!recolectores.length && !cargando && (
            <p className="muted" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--danger, #b91c1c)' }}>
              No hay recolectores en Panel RT. Agrégalos en Contabilidad → Panel RT → Recolectores.
            </p>
          )}
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Notas
            <input
              className="input"
              style={{ marginTop: '0.35rem' }}
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={guardando || !form.repartidorId}
            onClick={() => void guardarNuevo()}
          >
            {guardando ? 'Guardando…' : 'Crear camión'}
          </button>
        </div>
      ) : (
        <div style={{
          marginBottom: '1rem',
          padding: '0.85rem',
          background: 'var(--surface-2, #f8fafc)',
          borderRadius: 8,
          display: 'grid',
          gap: '0.65rem',
        }}
        >
          <h4 style={{ margin: 0 }}>Editar · {etiquetaCamion(edit)}</h4>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Código
            <input className="input" style={{ marginTop: '0.35rem' }} value={edit.codigo || ''} onChange={(e) => setEdit((x) => ({ ...x, codigo: e.target.value }))} />
          </label>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Alias
            <input className="input" style={{ marginTop: '0.35rem' }} value={edit.alias || ''} onChange={(e) => setEdit((x) => ({ ...x, alias: e.target.value }))} />
          </label>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Placa
            <input className="input" style={{ marginTop: '0.35rem' }} value={edit.placa || ''} onChange={(e) => setEdit((x) => ({ ...x, placa: e.target.value }))} />
          </label>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Recolector / repartidor
            <select
              className="input"
              style={{ marginTop: '0.35rem' }}
              value={edit.repartidor_id || ''}
              onChange={(e) => setEdit((x) => ({ ...x, repartidor_id: e.target.value || null }))}
            >
              <option value="">— Seleccionar recolector —</option>
              {recolectores.map((r) => {
                const rid = r.repartidor_id || r.id;
                return (
                  <option key={rid} value={rid} disabled={rtOcupados.has(String(rid))}>
                    {r.nombre}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Notas
            <input className="input" style={{ marginTop: '0.35rem' }} value={edit.notas || ''} onChange={(e) => setEdit((x) => ({ ...x, notas: e.target.value }))} />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" disabled={guardando} onClick={() => void guardarEdicion()}>Guardar</button>
            <button type="button" className="btn btn-ghost" onClick={resetForm}>Cancelar</button>
          </div>
        </div>
      )}

      {cargando ? (
        <p className="muted">Cargando camiones…</p>
      ) : !camiones.length ? (
        <p className="muted">
          Aún no hay camiones. Si falla al guardar, ejecuta <code>supabase/fix_ruta_camiones.sql</code> en Supabase.
        </p>
      ) : (
        <div>
          {camiones.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 0',
                borderBottom: '1px solid var(--border, #e2e8f0)',
                flexWrap: 'wrap',
              }}
            >
              <span>
                <strong>{etiquetaCamion(c)}</strong>
                <span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>
                  {c.activo === false ? 'Inactivo' : 'Activo'}
                  {c.repartidor_id
                    ? ` · ${nombreRt.get(String(c.repartidor_id)) || c.repartidor_id}`
                    : ' · sin recolector'}
                  {c.placa ? ` · placa ${c.placa}` : ''}
                </span>
              </span>
              <span style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => { setEdit({ ...c }); }}>
                  Editar
                </button>
                {c.activo !== false ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: '0.75rem', color: 'var(--brand-gold-dark, #b45309)' }}
                    disabled={guardando}
                    onClick={async () => {
                      const r = await desactivarCamionRuta(supabase, c.id);
                      if (!r.ok) return alert(r.error);
                      void refrescar();
                    }}
                  >
                    Desactivar
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: '0.75rem', color: 'var(--brand-green, #15803d)' }}
                    disabled={guardando}
                    onClick={async () => {
                      const r = await reactivarCamionRuta(supabase, c.id);
                      if (!r.ok) return alert(r.error);
                      void refrescar();
                    }}
                  >
                    Reactivar
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VistaCarga({ supabase, user, inventario, setAviso, cargarDatos, fusionarProducto }) {
  const [lineas, setLineas] = useState([]);
  const [codigo, setCodigo] = useState('');
  const [qty, setQty] = useState('1');
  const [recolectores, setRecolectores] = useState([]);
  const [camiones, setCamiones] = useState([]);
  const [repartidorId, setRepartidorId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cargandoRep, setCargandoRep] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setCargandoRep(false);
      return undefined;
    }
    let cancel = false;
    (async () => {
      setCargandoRep(true);
      const [r, c] = await Promise.all([
        listarRecolectoresCargaRuta(supabase),
        listarCamionesRuta(supabase, { soloActivos: true }),
      ]);
      if (cancel) return;
      if (r.error) setAviso(r.error);
      if (c.aviso && c.aviso !== AVISO_FALTA_RUTA_CAMIONES) setAviso(c.aviso);
      if (c.error) setAviso(c.error);
      setRecolectores(r.data || []);
      setCamiones(c.data || []);
      setCargandoRep(false);
    })();
    return () => { cancel = true; };
  }, [supabase, setAviso]);

  const camionPorClave = useMemo(() => {
    const byUsuario = new Map();
    const byRt = new Map();
    for (const c of camiones) {
      if (c.usuario_id) byUsuario.set(String(c.usuario_id), c);
      if (c.repartidor_id) byRt.set(String(c.repartidor_id), c);
    }
    return { byUsuario, byRt };
  }, [camiones]);

  const recolectorSel = useMemo(
    () => recolectores.find((u) => String(u.id) === String(repartidorId)) || null,
    [recolectores, repartidorId],
  );

  const camionSel = useMemo(() => {
    if (!recolectorSel) return null;
    const rtId = recolectorSel.repartidor_id || recolectorSel.id;
    const uid = recolectorSel.usuario_id;
    return camionPorClave.byRt.get(String(rtId))
      || (uid ? camionPorClave.byUsuario.get(String(uid)) : null)
      || null;
  }, [recolectorSel, camionPorClave]);

  const agregar = () => {
    const { producto } = buscarProductoInventario(inventario, codigo);
    if (!producto) return alert('Producto no encontrado.');
    const precio = precioRutaEspecial(producto);
    if (!(precio > 0)) {
      return alert(`«${producto.nombre}» sin precio de ruta. Ajústalo en Precios de ruta.`);
    }
    const n = Math.floor(Number(qty) || 0);
    if (!(n > 0)) return alert('Cantidad inválida (enteros).');
    const stockCedis = stockEnUbicacion(producto, ALMACEN_CENTRAL, 'cedis', ALMACEN_CENTRAL);
    const ya = lineas.filter((l) => String(l.productoId) === String(producto.id)).reduce((s, l) => s + l.cantidad, 0);
    if (stockCedis < ya + n) return alert(`Stock insuficiente en ${NOMBRE_ALMACEN_RUTA} (hay ${stockCedis}).`);
    setLineas((prev) => {
      const i = prev.findIndex((l) => String(l.productoId) === String(producto.id));
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], cantidad: next[i].cantidad + n };
        return next;
      }
      return [...prev, { productoId: producto.id, nombre: producto.nombre, precio, cantidad: n }];
    });
    setCodigo('');
    setQty('1');
  };

  const crear = async () => {
    if (!lineas.length) return alert('Agrega productos.');
    if (!recolectorSel) return alert('Selecciona el recolector / repartidor.');
    const etiqueta = camionSel
      ? `${etiquetaCamion(camionSel)} · ${recolectorSel.nombre}`
      : recolectorSel.nombre;
    if (!confirm(`¿Cargar camión para ${etiqueta}? Se descuenta de ${NOMBRE_ALMACEN_RUTA}.`)) return;
    setGuardando(true);
    const r = await crearCargaRuta(supabase, {
      vendedorNombre: recolectorSel.nombre,
      vendedorId: recolectorSel.usuario_id || recolectorSel.id,
      repartidorId: recolectorSel.repartidor_id || recolectorSel.id,
      camionId: camionSel?.id || null,
      lineas,
      usuarioNombre: user?.nombre,
      rol: user?.rol,
      userId: user?.id,
      inventario,
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    if (r.aviso) setAviso(r.aviso);
    for (const p of r.patches || []) {
      if (p?.id) fusionarProducto?.(p);
    }
    if (cargarDatos) void cargarDatos();
    const n = (r.patches || []).length;
    alert(
      `Carga ${r.carga?.folio || ''} creada para ${etiqueta}.\n`
      + `Stock CEDIS descontado${n ? ` (${n} producto(s))` : ''}.`,
    );
    setLineas([]);
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Carga de camión</h3>
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Elige un <strong>recolector / repartidor</strong> del Panel RT.
        Los que agregues en Panel RT → Recolectores aparecen aquí automáticamente.
        Si tiene camión asignado, se registra en la carga. Se descuenta de {NOMBRE_ALMACEN_RUTA}.
      </p>
      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
        Recolector / repartidor
        <select
          className="input"
          style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
          value={repartidorId}
          onChange={(e) => setRepartidorId(e.target.value)}
          disabled={cargandoRep}
        >
          <option value="">{cargandoRep ? 'Cargando…' : '— Seleccionar recolector —'}</option>
          {recolectores.map((u) => {
            const cam = camionPorClave.byRt.get(String(u.repartidor_id || u.id))
              || (u.usuario_id ? camionPorClave.byUsuario.get(String(u.usuario_id)) : null);
            return (
              <option key={u.id} value={u.id}>
                {u.nombre}{cam ? ` · ${etiquetaCamion(cam)}` : ''}
              </option>
            );
          })}
        </select>
      </label>
      {recolectorSel && (
        <p style={{ margin: '0 0 0.65rem', fontSize: '0.85rem' }}>
          {camionSel ? (
            <>Camión asignado: <strong>{etiquetaCamion(camionSel)}</strong></>
          ) : (
            <span className="muted">Sin camión asignado — créalo en «Camiones» y asígnalo a este recolector.</span>
          )}
        </p>
      )}
      {!cargandoRep && recolectores.length === 0 && (
        <p className="muted" style={{ fontSize: '0.8rem', color: 'var(--danger, #b91c1c)' }}>
          No hay recolectores activos en Panel RT. Agrégalos en Contabilidad → Panel RT → Recolectores.
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input className="input" style={{ flex: 1, minWidth: 140 }} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código / escanear" onKeyDown={(e) => e.key === 'Enter' && agregar()} />
        <input className="input" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 80 }} />
        <button type="button" className="btn btn-primary" onClick={agregar}>Agregar</button>
      </div>
      {lineas.length === 0 ? <p className="muted">Sin líneas.</p> : (
        <table className="consultas-table">
          <thead><tr><th>Producto</th><th>Cant</th><th>P. ruta</th><th /></tr></thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.productoId}>
                <td>{l.nombre}</td>
                <td>{fmtQty(l.cantidad)}</td>
                <td>{fmtMonto(l.precio)}</td>
                <td>
                  <button type="button" className="btn btn-ghost" style={{ padding: '0.15rem 0.4rem' }} onClick={() => setLineas((p) => p.filter((x) => x.productoId !== l.productoId))}>Quitar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} disabled={guardando || !lineas.length || !repartidorId} onClick={() => void crear()}>
        Crear carga y descontar CEDIS
      </button>
    </div>
  );
}

function VistaPrecios({ supabase, user, inventario, setAviso }) {
  const [q, setQ] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [proveedores, setProveedores] = useState([]);
  const [productosPorProveedor, setProductosPorProveedor] = useState(() => new Map());
  const [idsConProveedor, setIdsConProveedor] = useState(() => new Set());
  const [editId, setEditId] = useState('');
  const [editVal, setEditVal] = useState('');

  const departamentos = useMemo(() => listarDepartamentos(inventario), [inventario]);

  useEffect(() => {
    if (!supabase) return undefined;
    let cancel = false;
    (async () => {
      const { data } = await supabase.from('proveedores').select('id, nombre').order('nombre');
      if (!cancel) setProveedores(data || []);
    })();
    return () => {
      cancel = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return undefined;
    let cancel = false;
    (async () => {
      const { data, error } = await supabase.from('proveedor_producto').select('proveedor_id, producto_id');
      if (cancel) return;
      if (error) {
        setProductosPorProveedor(new Map());
        setIdsConProveedor(new Set());
        return;
      }
      const map = new Map();
      const todos = new Set();
      for (const row of data || []) {
        const prov = String(row.proveedor_id ?? '').trim();
        const prod = String(row.producto_id ?? '').trim();
        if (!prov || !prod) continue;
        if (!map.has(prov)) map.set(prov, new Set());
        map.get(prov).add(prod);
        todos.add(prod);
      }
      setProductosPorProveedor(map);
      setIdsConProveedor(todos);
    })();
    return () => {
      cancel = true;
    };
  }, [supabase]);

  const filtrosActivos = Boolean(q.trim() || departamento || proveedorId);

  const lista = useMemo(() => {
    let list = inventario || [];
    const term = q.trim();
    if (term) list = list.filter((p) => productoCoincideBusqueda(p, term));
    if (departamento) {
      list = list.filter((p) => String(p.cat || '').toUpperCase() === departamento.toUpperCase());
    }
    if (proveedorId === '__ninguno__') {
      list = list.filter((p) => !idsConProveedor.has(String(p.id)));
    } else if (proveedorId) {
      const ids = productosPorProveedor.get(String(proveedorId));
      list = list.filter((p) => ids?.has(String(p.id)));
    }
    // Con filtro depto/proveedor mostrar más filas; sin filtro mantener tope razonable
    const tope = filtrosActivos ? 500 : 80;
    return list.slice(0, tope);
  }, [
    inventario,
    q,
    departamento,
    proveedorId,
    productosPorProveedor,
    idsConProveedor,
    filtrosActivos,
  ]);

  const guardar = async (p) => {
    const r = await guardarPrecioRutaProducto(supabase, p.id, editVal, { rol: user?.rol, userId: user?.id });
    if (!r.ok) return alert(r.error);
    setAviso('Precio de ruta actualizado (sin impuestos). Recarga catálogo si no ves el cambio.');
    setEditId('');
    p.precio_ruta = r.precio;
  };

  const limpiarFiltros = () => {
    setQ('');
    setDepartamento('');
    setProveedorId('');
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Precios de ruta</h3>
      <p className="muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
        Precio especial sin impuestos. Filtra por departamento o proveedor para elegir los productos que se
        repartirán por ruta. Solo admin/gerente.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <input
          className="input"
          placeholder="Buscar por nombre o código…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: '1 1 180px', minWidth: 140 }}
        />
        <select
          className="select"
          style={{ flex: '0 1 180px', minWidth: 140 }}
          value={departamento}
          onChange={(e) => setDepartamento(e.target.value)}
          title="Filtrar por departamento"
        >
          <option value="">Todos los departamentos</option>
          {departamentos.map((d) => (
            <option key={d} value={d}>
              {etiquetaDepartamento(d)}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ flex: '0 1 180px', minWidth: 140 }}
          value={proveedorId}
          onChange={(e) => setProveedorId(e.target.value)}
          title="Filtrar por proveedor"
        >
          <option value="">Todos los proveedores</option>
          <option value="__ninguno__">Sin proveedor</option>
          {proveedores.map((pr) => (
            <option key={pr.id} value={String(pr.id)}>
              {pr.nombre || pr.id}
            </option>
          ))}
        </select>
        {filtrosActivos ? (
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.82rem' }} onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        ) : null}
      </div>

      <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.78rem' }}>
        {lista.length} producto(s)
        {departamento ? ` · ${etiquetaDepartamento(departamento)}` : ''}
        {proveedorId && proveedorId !== '__ninguno__'
          ? ` · ${proveedores.find((p) => String(p.id) === String(proveedorId))?.nombre || 'proveedor'}`
          : proveedorId === '__ninguno__'
            ? ' · sin proveedor'
            : ''}
      </p>

      <table className="consultas-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Depto</th>
            <th>P. ruta</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lista.map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.nombre}</strong>
                <div className="muted" style={{ fontSize: '0.72rem' }}>{p.id}</div>
              </td>
              <td className="muted" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                {etiquetaDepartamento(p.cat || 'GENERAL')}
              </td>
              <td>
                {editId === p.id ? (
                  <input className="input" type="number" style={{ width: 110 }} value={editVal} onChange={(e) => setEditVal(e.target.value)} />
                ) : (
                  precioRutaEspecial(p) != null ? fmtMonto(precioRutaEspecial(p)) : <span className="muted">Sin precio</span>
                )}
              </td>
              <td>
                {editId === p.id ? (
                  <>
                    <button type="button" className="btn btn-primary" style={{ padding: '0.2rem 0.45rem', fontSize: '0.78rem' }} onClick={() => void guardar(p)}>Guardar</button>
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.45rem' }} onClick={() => setEditId('')}>×</button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.78rem' }}
                    onClick={() => { setEditId(p.id); setEditVal(String(p.precio_ruta || '')); }}
                  >
                    Editar
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!lista.length ? (
            <tr>
              <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>
                No hay productos con estos filtros.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function VistaPos({ supabase, user, vendedorSesion, productoPorId, inventario, setAviso, onNavigate }) {
  const persistidoInicial = useMemo(() => leerCarritoPosRuta(vendedorSesion), [vendedorSesion]);
  const [cargas, setCargas] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [cargandoCamion, setCargandoCamion] = useState(false);
  const [clientesExt, setClientesExt] = useState([]);
  const [clienteKey, setClienteKey] = useState(() => persistidoInicial.clienteKey || '');
  const [codigo, setCodigo] = useState('');
  const [carrito, setCarrito] = useState(() => persistidoInicial.carrito || []);
  const [deptoActivo, setDeptoActivo] = useState('');
  const [qDepto, setQDepto] = useState('');
  const [qtyEditId, setQtyEditId] = useState(null);
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [metodo, setMetodo] = useState('efectivo');
  const [montoEfectivo, setMontoEfectivo] = useState('');
  const [montoCredito, setMontoCredito] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [tickCamion, setTickCamion] = useState(0);
  const carritoRef = useRef(carrito);
  const clienteKeyRef = useRef(clienteKey);
  const omitirGuardadoRef = useRef(false);

  const vendedorId = vendedorSesion?.usuario_id
    || (vendedorSesion?.id && !String(vendedorSesion.id).startsWith('rt:') ? vendedorSesion.id : null)
    || (esRolRepartidor(user?.rol) ? user?.id : null);
  const vendedorNombre = vendedorSesion?.nombre || user?.nombre || '—';
  const destinos = useMemo(() => listarDestinosVentaRuta(clientesExt), [clientesExt]);
  const destinoSeleccionado = useMemo(() => {
    if (!clienteKey) return null;
    const [tipo, ...rest] = clienteKey.split(':');
    const id = rest.join(':');
    return destinos.find((d) => d.tipo === tipo && String(d.id) === id) || null;
  }, [clienteKey, destinos]);

  useEffect(() => {
    carritoRef.current = carrito;
  }, [carrito]);

  useEffect(() => {
    clienteKeyRef.current = clienteKey;
  }, [clienteKey]);

  // Al cambiar de vendedor, cargar su carrito (sin pisar el del anterior).
  useEffect(() => {
    omitirGuardadoRef.current = true;
    const data = leerCarritoPosRuta(vendedorSesion);
    setClienteKey(data.clienteKey || '');
    setCarrito(data.carrito || []);
    setQtyEditId(null);
    setMostrarCobro(false);
  }, [vendedorSesion]);

  // Persistir tras cada cambio (y al desmontar / cerrar la app en este equipo).
  useEffect(() => {
    if (omitirGuardadoRef.current) {
      omitirGuardadoRef.current = false;
      return undefined;
    }
    guardarCarritoPosRuta(vendedorSesion, { clienteKey, carrito });
    return () => {
      guardarCarritoPosRuta(vendedorSesion, {
        clienteKey: clienteKeyRef.current,
        carrito: carritoRef.current,
      });
    };
  }, [carrito, clienteKey, vendedorSesion]);

  const refrescarCamion = useCallback(async () => {
    setCargandoCamion(true);
    try {
      const filtros = { estado: 'en_ruta', limit: 80 };
      if (vendedorId) filtros.vendedorId = vendedorId;
      const [c, cli] = await Promise.all([
        listarCargasRuta(supabase, filtros),
        listarClientesRuta(supabase),
      ]);
      if (c.aviso || cli.aviso) setAviso(c.aviso || cli.aviso || AVISO_FALTA_VENTA_RUTA);
      if (c.error) setAviso(c.error);
      let lista = c.data || [];
      // Vendedor solo Panel RT (sin usuario): filtrar cargas por nombre
      if (!vendedorId && vendedorNombre && vendedorNombre !== '—') {
        const nom = String(vendedorNombre).trim().toLowerCase();
        lista = lista.filter((x) => String(x.vendedor_nombre || '').trim().toLowerCase() === nom);
      }
      setCargas(lista);
      setClientesExt(cli.data || []);
      if (!lista.length) {
        setLineas([]);
        return;
      }
      const lr = await lineasDeVariasCargas(supabase, lista);
      if (lr.aviso) setAviso(lr.aviso);
      if (lr.error) setAviso(lr.error);
      setLineas(lr.data || []);
    } finally {
      setCargandoCamion(false);
    }
  }, [supabase, setAviso, vendedorId, vendedorNombre]);

  useEffect(() => { void refrescarCamion(); }, [refrescarCamion, tickCamion]);

  /** Toda la mercancía del camión (cargas en ruta consolidadas). */
  const productosCamion = useMemo(
    () => catalogoPosCamionDesdeLineas(lineas, { productoPorId, inventario }),
    [lineas, productoPorId, inventario],
  );

  // Actualizar existencias del carrito restaurado cuando llega el stock del camión.
  useEffect(() => {
    if (!productosCamion.length || !carrito.length) return;
    setCarrito((prev) => {
      let changed = false;
      const next = prev.map((it) => {
        const prod = productosCamion.find((p) => String(p.id) === String(it.productoId));
        if (!prod) return it;
        const disp = Number(prod.disponible) || 0;
        if (disp === Number(it.disponible)) return it;
        changed = true;
        const cantidad = Math.min(Number(it.cantidad) || 1, Math.max(1, disp || 1));
        return { ...it, disponible: disp, cantidad, precio: prod.precio ?? it.precio };
      });
      return changed ? next : prev;
    });
  }, [productosCamion]); // eslint-disable-line react-hooks/exhaustive-deps -- solo al refrescar camión

  const departamentosMenu = useMemo(() => {
    const counts = new Map();
    for (const p of productosCamion) {
      const cat = normalizarDepartamento(p.cat) || 'GENERAL';
      // Agrupa CIGARRO_ELECTRONICO bajo ELECTRONICOS en el menú
      const key = cat === 'CIGARRO_ELECTRONICO' ? 'ELECTRONICOS' : cat;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const preferidos = DEPARTAMENTOS_CEDIS_UI.filter((d) => counts.has(d));
    const otros = [...counts.keys()]
      .filter((d) => !DEPARTAMENTOS_CEDIS_UI.includes(d))
      .sort((a, b) => a.localeCompare(b, 'es'));
    const ids = [...preferidos, ...otros];
    if (!ids.length) return [{ id: '', label: 'Sin productos', count: 0 }];
    return ids.map((id) => ({
      id,
      label: etiquetaDepartamento(id),
      count: counts.get(id) || 0,
    }));
  }, [productosCamion]);

  useEffect(() => {
    if (!departamentosMenu.length) return;
    if (!deptoActivo || !departamentosMenu.some((d) => d.id === deptoActivo)) {
      setDeptoActivo(departamentosMenu[0].id);
    }
  }, [departamentosMenu, deptoActivo]);

  const productosCatalogo = useMemo(() => {
    const t = qDepto.trim();
    let list = productosCamion;
    if (deptoActivo) {
      list = list.filter((p) => departamentoFiltroCoincideCedis(p.cat, deptoActivo));
    }
    if (t) list = list.filter((p) => productoCoincideBusqueda(p, t) || String(p.id).includes(t));
    return list;
  }, [productosCamion, deptoActivo, qDepto]);

  const qtyEnCarrito = useCallback((productoId) => {
    const it = carrito.find((x) => String(x.productoId) === String(productoId));
    return it ? Number(it.cantidad) || 0 : 0;
  }, [carrito]);

  const agregarProducto = (prod, qtyAdd = 1) => {
    if (!clienteKey) return alert('Elige la tienda (o cliente) destino.');
    const add = Math.max(1, Math.floor(Number(qtyAdd) || 1));
    const enCarrito = qtyEnCarrito(prod.id);
    const max = Number(prod.disponible) || 0;
    if (enCarrito + add > max) {
      return alert(`En camión solo hay ${max} de ${prod.nombre}.`);
    }
    setCarrito((prev) => {
      const i = prev.findIndex((x) => String(x.productoId) === String(prod.id));
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], cantidad: next[i].cantidad + add };
        return next;
      }
      return [...prev, {
        productoId: prod.id,
        nombre: prod.nombre,
        precio: prod.precio,
        cantidad: add,
        foto_url: prod.foto_url || null,
        disponible: prod.disponible,
      }];
    });
  };

  const ajustarQty = (productoId, delta) => {
    setCarrito((prev) => {
      const i = prev.findIndex((x) => String(x.productoId) === String(productoId));
      if (i < 0) return prev;
      const next = [...prev];
      const max = Number(next[i].disponible) || 0;
      const nueva = (Number(next[i].cantidad) || 0) + delta;
      if (nueva <= 0) {
        setQtyEditId(null);
        return next.filter((_, idx) => idx !== i);
      }
      if (nueva > max) {
        alert(`En camión solo hay ${max}.`);
        return prev;
      }
      next[i] = { ...next[i], cantidad: nueva };
      return next;
    });
  };

  const setQtyManual = (productoId, raw) => {
    const n = Math.floor(Number(raw) || 0);
    setCarrito((prev) => {
      const i = prev.findIndex((x) => String(x.productoId) === String(productoId));
      if (i < 0) return prev;
      const max = Number(prev[i].disponible) || 0;
      if (n <= 0) return prev.filter((_, idx) => idx !== i);
      if (n > max) {
        alert(`En camión solo hay ${max}.`);
        return prev;
      }
      const next = [...prev];
      next[i] = { ...next[i], cantidad: n };
      return next;
    });
  };

  const scanAgregar = (codigoIn) => {
    if (!clienteKey) return alert('Elige la tienda (o cliente) destino.');
    const raw = String(codigoIn ?? codigo ?? '').trim();
    if (!raw) return;
    const { producto } = buscarProductoInventario(inventario, raw);
    const pid = producto?.id || raw;
    const prod = productosCamion.find((p) => String(p.id) === String(pid));
    if (!prod) return alert('Ese producto no está disponible en el camión.');
    agregarProducto(prod, 1);
    setCodigo('');
  };

  const total = carrito.reduce((s, a) => s + a.precio * a.cantidad, 0);

  const abrirCobro = () => {
    if (!clienteKey) return alert('Elige la tienda (o cliente) destino.');
    if (!carrito.length) return alert('Carrito vacío.');
    setMetodo('efectivo');
    setMontoEfectivo(String(total.toFixed(2)));
    setMontoCredito('0');
    setMostrarCobro(true);
  };

  const setEfectivoMixto = (raw) => {
    setMontoEfectivo(raw);
    const efe = Math.max(0, Number(raw) || 0);
    const resto = Math.max(0, Math.round((total - efe) * 100) / 100);
    setMontoCredito(String(resto.toFixed(2)));
  };

  const cobrar = async () => {
    if (!clienteKey) return alert('Elige la tienda (o cliente) a la que traspasarás la venta.');
    if (!carrito.length) return alert('Carrito vacío.');
    const [tipo, ...rest] = clienteKey.split(':');
    const id = rest.join(':');
    const dest = destinos.find((d) => d.tipo === tipo && String(d.id) === id);
    let montoEfe = 0;
    let montoCre = 0;
    if (metodo === 'efectivo') {
      montoEfe = total;
    } else if (metodo === 'credito') {
      montoCre = total;
    } else {
      montoEfe = Math.round((Number(montoEfectivo) || 0) * 100) / 100;
      montoCre = Math.round((Number(montoCredito) || 0) * 100) / 100;
      if (Math.abs(montoEfe + montoCre - total) > 0.02) {
        return alert(`Efectivo + crédito debe sumar ${fmtMonto(total)}.`);
      }
    }
    const labelMetodo = metodo === 'mixto'
      ? `MIXTO (efe ${fmtMonto(montoEfe)} + créd ${fmtMonto(montoCre)})`
      : metodo.toUpperCase();
    if (!confirm(`¿Cerrar venta ${fmtMonto(total)} · ${labelMetodo}\nDestino: ${dest?.nombre || id}?`)) return;

    setGuardando(true);
    const r = await registrarVentaRuta(supabase, {
      vendedorId: vendedorId || undefined,
      clienteTipo: tipo,
      clienteId: id,
      clienteNombre: dest?.nombre || id,
      metodoPago: metodo,
      articulos: carrito,
      vendedorNombre,
      montoEfectivo: montoEfe,
      montoCredito: montoCre,
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    if (r.avisos?.length) setAviso(r.avisos.join(' · '));
    const extra = [
      r.cuenta === 'mixto'
        ? `Mixto · efe ${fmtMonto(r.montoEfectivo)} · créd ${fmtMonto(r.montoCredito)}`
        : r.cuenta === 'credito'
          ? 'Crédito pendiente (cajero paga con PIN)'
          : 'Efectivo en tránsito',
      r.traspasoId
        ? `Traspaso ${r.traspasoFolio || ''} enviado · pendiente de recibir en la tienda`
        : null,
    ].filter(Boolean).join(' · ');
    alert(`Venta ${r.venta?.folio || ''} OK.\n${extra}`);
    omitirGuardadoRef.current = true;
    carritoRef.current = [];
    setCarrito([]);
    setMostrarCobro(false);
    setQtyEditId(null);
    guardarCarritoPosRuta(vendedorSesion, { clienteKey: clienteKeyRef.current, carrito: [] });
    setTickCamion((t) => t + 1);
    // La tienda recibe el inventario comprometido en Productos → Traspasos → Recibir.
    if (tipo === 'sucursal' && r.traspasoId) {
      onNavigate?.('Productos', {
        vista: 'traspaso',
        traspasoId: r.traspasoId,
        sucursalRecepcion: id,
      });
    }
  };

  const onCambiarDestino = (value) => {
    setClienteKey(value);
    setCarrito([]);
    setQtyEditId(null);
    setMostrarCobro(false);
  };

  const piezasCamion = productosCamion.reduce((s, p) => s + (Number(p.disponible) || 0), 0);

  return (
    <div className="ruta-pos">
      <div className="ruta-pos-toolbar card">
        <div>
          <h3 style={{ margin: 0, color: COLOR }}>POS venta en ruta</h3>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
            Elige la tienda destino: verás toda la mercancía del camión y su existencia.
            {vendedorNombre ? ` Vendedor: ${vendedorNombre}.` : ''}
            {vendedorSesion?.camionEtiqueta ? ` Camión: ${vendedorSesion.camionEtiqueta}.` : ''}
          </p>
        </div>
        <div className="ruta-pos-toolbar-fields">
          <label>
            Tienda / cliente (destino)
            <select
              className="input"
              value={clienteKey}
              onChange={(e) => onCambiarDestino(e.target.value)}
            >
              <option value="">— Elige destino —</option>
              {destinos.map((d) => (
                <option key={`${d.tipo}:${d.id}`} value={`${d.tipo}:${d.id}`}>{d.nombre}</option>
              ))}
            </select>
          </label>
          {clienteKey ? (
            <div className="muted" style={{ fontSize: '0.8rem', alignSelf: 'end', paddingBottom: '0.35rem' }}>
              {cargandoCamion
                ? 'Cargando camión…'
                : `${productosCamion.length} producto(s) · ${fmtQty(piezasCamion)} pzas`}
              {cargas.length ? ` · ${cargas.length} carga(s)` : ''}
            </div>
          ) : null}
        </div>
      </div>

      {!clienteKey ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Selecciona la sucursal (o cliente) que recibe la mercancía para ver el inventario del camión.
          </p>
        </div>
      ) : cargandoCamion ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Cargando mercancía del camión…</p></div>
      ) : !productosCamion.length ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No hay mercancía disponible en el camión
            {destinoSeleccionado ? ` para vender a ${destinoSeleccionado.nombre}` : ''}.
            Carga inventario en «Carga de camión».
          </p>
        </div>
      ) : (
        <div className="ruta-pos-layout">
          <nav className="ruta-pos-deptos card" aria-label="Departamentos">
            <h4 className="ruta-pos-deptos-title">Departamentos</h4>
            {departamentosMenu.map((d) => (
              <button
                key={d.id || 'vacio'}
                type="button"
                className={`ruta-pos-depto-btn${deptoActivo === d.id ? ' activo' : ''}`}
                onClick={() => { setDeptoActivo(d.id); setQDepto(''); }}
                disabled={!d.id}
              >
                <span>{d.label}</span>
                <span className="ruta-pos-depto-count">{d.count}</span>
              </button>
            ))}
          </nav>

          <section className="ruta-pos-catalogo card">
            <div className="ruta-pos-catalogo-head">
              <strong>
                {etiquetaDepartamento(deptoActivo) || 'Catálogo'}
                {destinoSeleccionado ? (
                  <span className="muted" style={{ fontWeight: 400, fontSize: '0.85rem' }}>
                    {' '}· {destinoSeleccionado.nombre}
                  </span>
                ) : null}
              </strong>
              <input
                className="input"
                value={qDepto}
                onChange={(e) => setQDepto(e.target.value)}
                placeholder="Filtrar en departamento…"
                aria-label="Filtrar departamento"
              />
            </div>
            {productosCatalogo.length === 0 ? (
              <div className="ruta-pos-vacio">
                <Icon name="package" size={36} />
                <p className="muted">No hay productos disponibles en este departamento.</p>
              </div>
            ) : (
              <div className="ventas-favoritos-grid ruta-pos-grid">
                {productosCatalogo.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="ventas-favorito-btn"
                    title={`${p.nombre} · disp ${p.disponible}`}
                    onClick={() => agregarProducto(p, 1)}
                  >
                    <ProductoThumb producto={p} size="full" className="ventas-favorito-thumb" />
                    <div className="ventas-favorito-precio">{fmtMonto(p.precio)}</div>
                    <div className="ventas-favorito-nombre">{p.nombre}</div>
                    <div className="muted" style={{ fontSize: '0.68rem' }}>
                      Camión: {p.disponible}{qtyEnCarrito(p.id) ? ` · carrito ${qtyEnCarrito(p.id)}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className="ruta-pos-ticket card">
            <h3 style={{ margin: '0 0 0.5rem', color: COLOR }}>Carrito</h3>
            <div className="ruta-pos-buscar" style={{ marginBottom: '0.55rem' }}>
              <CampoCodigo
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && scanAgregar()}
                onEscanear={(c) => scanAgregar(c)}
                beepAlEnter
                placeholder="Escanear o buscar…"
                tituloCamara="Escanear producto del camión"
              />
              <button type="button" className="btn btn-primary" onClick={() => scanAgregar()}>+</button>
            </div>
            <div className="ruta-pos-ticket-lineas">
              {carrito.length === 0 && <p className="muted">Escanea o toca un producto para agregarlo</p>}
              {carrito.map((it) => {
                const editando = qtyEditId === it.productoId;
                return (
                  <div key={it.productoId} className="ventas-carrito-linea">
                    <ProductoThumb producto={it} size={40} />
                    <div className="ventas-carrito-info">
                      <span className="ventas-carrito-nombre">{it.nombre}</span>
                      <button
                        type="button"
                        className="btn btn-ghost ventas-carrito-quitar"
                        onClick={() => setCarrito((p) => p.filter((x) => x.productoId !== it.productoId))}
                      >
                        Quitar
                      </button>
                    </div>
                    <div className={`ventas-qty${editando ? ' ventas-qty--open' : ''}`}>
                      {editando ? (
                        <>
                          <button type="button" className="ventas-qty__btn" aria-label="Quitar uno" onClick={() => ajustarQty(it.productoId, -1)}>−</button>
                          <input
                            className="ventas-qty__valor ventas-qty__valor--activo"
                            style={{ width: 42, textAlign: 'center', border: 'none', background: 'transparent' }}
                            value={it.cantidad}
                            onChange={(e) => setQtyManual(it.productoId, e.target.value)}
                            onBlur={() => setQtyEditId(null)}
                            inputMode="numeric"
                          />
                          <button type="button" className="ventas-qty__btn" aria-label="Agregar uno" onClick={() => ajustarQty(it.productoId, 1)}>+</button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="ventas-qty__valor"
                          onClick={() => setQtyEditId(it.productoId)}
                          title="Cambiar cantidad"
                        >
                          {it.cantidad}
                        </button>
                      )}
                    </div>
                    <b className="ventas-carrito-importe">{fmtMonto(it.precio * it.cantidad)}</b>
                  </div>
                );
              })}
            </div>
            <div className="ruta-pos-total">TOTAL {fmtMonto(total)}</div>
            <button
              type="button"
              className="btn btn-success"
              style={{ width: '100%', padding: '0.9rem', fontSize: '1.05rem' }}
              disabled={!carrito.length}
              onClick={abrirCobro}
            >
              Pagar {fmtMonto(total)}
            </button>
          </aside>
        </div>
      )}

      {mostrarCobro && (
        <PortalFlotante>
        <div
          className="prod-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => !guardando && setMostrarCobro(false)}
        >
          <div className="ventas-cobro-modal" onClick={(e) => e.stopPropagation()}>
            <header className="prod-modal-header">
              <button type="button" className="prod-modal-close" aria-label="Cerrar" disabled={guardando} onClick={() => setMostrarCobro(false)}>
                <Icon name="x" size={18} />
              </button>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Cobrar venta en ruta</h2>
              <span style={{ width: 36 }} />
            </header>
            <div className="ventas-cobro-body">
              <div className="ventas-cobro-total">
                TOTAL <strong>{fmtMonto(total)}</strong>
              </div>

              <label className="muted" style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                Tienda a la que se traspasará la venta
              </label>
              <select
                className="select"
                style={{ width: '100%', marginBottom: '0.75rem' }}
                value={clienteKey}
                onChange={(e) => setClienteKey(e.target.value)}
                disabled={guardando}
              >
                <option value="">— Elige destino —</option>
                {destinos.map((d) => (
                  <option key={`${d.tipo}:${d.id}`} value={`${d.tipo}:${d.id}`}>{d.nombre}</option>
                ))}
              </select>

              <label className="muted" style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                Forma de pago
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                {[
                  { id: 'efectivo', label: 'Efectivo' },
                  { id: 'credito', label: 'Crédito' },
                  { id: 'mixto', label: 'Mixto' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={metodo === m.id ? 'btn btn-primary' : 'btn btn-ghost'}
                    style={{ flex: '1 1 calc(33% - 0.4rem)', minWidth: 90 }}
                    onClick={() => {
                      setMetodo(m.id);
                      if (m.id === 'efectivo') {
                        setMontoEfectivo(String(total.toFixed(2)));
                        setMontoCredito('0');
                      } else if (m.id === 'credito') {
                        setMontoEfectivo('0');
                        setMontoCredito(String(total.toFixed(2)));
                      } else {
                        setMontoEfectivo('');
                        setMontoCredito(String(total.toFixed(2)));
                      }
                    }}
                    disabled={guardando}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {metodo === 'mixto' && (
                <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: '1fr 1fr', marginBottom: '0.75rem' }}>
                  <label className="muted" style={{ fontSize: '0.8rem' }}>
                    Efectivo
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={montoEfectivo}
                      onChange={(e) => setEfectivoMixto(e.target.value)}
                      disabled={guardando}
                      style={{ marginTop: '0.25rem' }}
                    />
                  </label>
                  <label className="muted" style={{ fontSize: '0.8rem' }}>
                    Crédito
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={montoCredito}
                      onChange={(e) => setMontoCredito(e.target.value)}
                      disabled={guardando}
                      style={{ marginTop: '0.25rem' }}
                    />
                  </label>
                </div>
              )}

              <button
                type="button"
                className="btn btn-success"
                style={{ width: '100%', padding: '0.9rem', fontSize: '1.05rem' }}
                disabled={guardando || !clienteKey}
                onClick={() => void cobrar()}
              >
                {guardando ? 'Guardando…' : `Confirmar · ${fmtMonto(total)}`}
              </button>
            </div>
          </div>
        </div>
        </PortalFlotante>
      )}
    </div>
  );
}

function VistaClientes({ supabase, setAviso }) {
  const [list, setList] = useState([]);
  const [nombre, setNombre] = useState('');
  const [tel, setTel] = useState('');

  const cargar = useCallback(async () => {
    const r = await listarClientesRuta(supabase);
    if (r.aviso) setAviso(r.aviso);
    setList(r.data || []);
  }, [supabase, setAviso]);

  useEffect(() => { void cargar(); }, [cargar]);

  const guardar = async () => {
    const r = await guardarClienteRuta(supabase, { nombre, telefono: tel });
    if (!r.ok) return alert(r.error);
    setNombre('');
    setTel('');
    await cargar();
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Clientes externos</h3>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input className="input" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input className="input" placeholder="Tel" value={tel} onChange={(e) => setTel(e.target.value)} />
        <button type="button" className="btn btn-primary" onClick={() => void guardar()}>Guardar</button>
      </div>
      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
        {list.map((c) => <li key={c.id}>{c.nombre} {c.telefono ? `· ${c.telefono}` : ''}</li>)}
      </ul>
    </div>
  );
}

function VistaConsultas({ supabase, user, setAviso, cargarDatos, fusionarProducto }) {
  const [tab, setTab] = useState('ingresos');
  const [rows, setRows] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [tick, setTick] = useState(0);
  const [expandido, setExpandido] = useState(null);
  const [cancelandoId, setCancelandoId] = useState('');

  const puedeCancelar = puedeAccionVentaRuta(user?.rol, user?.id, 'ruta_carga');

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setCargando(true);
      try {
        if (tab === 'cargas') {
          const r = await listarCargasRuta(supabase, { limit: 80 });
          if (cancel) return;
          if (r.aviso) setAviso(r.aviso);
          if (r.error) setAviso(r.error);
          setRows(r.data || []);
        } else if (tab === 'ingresos') {
          const r = await listarReporteIngresosCargaRuta(supabase, { limit: 80 });
          if (cancel) return;
          if (r.aviso) setAviso(r.aviso);
          if (r.error) setAviso(r.error);
          setRows(r.data || []);
        } else if (tab === 'creditos') {
          const r = await listarCreditosCobradosRuta(supabase, { limit: 150 });
          if (cancel) return;
          if (r.aviso) setAviso(r.aviso);
          if (r.error) setAviso(r.error);
          setRows(r.data || []);
        } else {
          const r = await listarVentasRuta(supabase, { limit: 100 });
          if (cancel) return;
          if (r.aviso) setAviso(r.aviso);
          if (r.error) setAviso(r.error);
          setRows(r.data || []);
        }
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [supabase, tab, setAviso, tick]);

  const fmtFecha = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return String(iso);
    }
  };

  const badgeEstado = (estado) => {
    const e = String(estado || '').toLowerCase();
    const color =
      e === 'en_ruta' ? '#0f766e'
        : e === 'liquidada' ? '#64748b'
          : e === 'cancelada' ? '#b91c1c'
            : 'var(--brand-blue)';
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '0.1rem 0.45rem',
          borderRadius: 4,
          fontSize: '0.72rem',
          fontWeight: 600,
          background: `${color}18`,
          color,
        }}
      >
        {estado || '—'}
      </span>
    );
  };

  const onCancelarCarga = async (carga) => {
    if (!carga?.id || !puedeCancelar) return;
    const estado = String(carga.estado || '').toLowerCase();
    if (estado !== 'en_ruta') {
      setAviso('Solo se pueden cancelar cargas en ruta (sin ventas).');
      return;
    }
    const motivo = window.prompt(
      `¿Cancelar carga ${carga.folio || ''}?\nSe devolverá a CEDIS el inventario disponible.\nMotivo (opcional):`,
    );
    if (motivo === null) return;
    setCancelandoId(carga.id);
    setAviso('');
    try {
      const res = await cancelarCargaRuta(supabase, {
        cargaId: carga.id,
        usuarioNombre: user?.nombre,
        rol: user?.rol,
        userId: user?.id,
        motivo: String(motivo || '').trim() || undefined,
      });
      if (!res.ok) {
        setAviso(res.error || 'No se pudo cancelar la carga.');
        return;
      }
      for (const p of res.patches || []) {
        if (p?.id) fusionarProducto?.(p);
      }
      if (cargarDatos) void cargarDatos();
      setAviso(`Carga ${carga.folio || ''} cancelada · inventario devuelto a CEDIS.`);
      setTick((t) => t + 1);
    } finally {
      setCancelandoId('');
    }
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Consultas</h3>
      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
        Ingresos = cargas al camión (salida CEDIS). Desde Cargas puedes cancelar un registro en ruta sin ventas.
      </p>
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {[
          { id: 'ingresos', label: 'Ingresos' },
          { id: 'ventas', label: 'Ventas' },
          { id: 'cargas', label: 'Cargas' },
          { id: 'creditos', label: 'Créditos cobrados' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            className={`btn ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setExpandido(null); setTab(t.id); }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {cargando ? (
        <p className="muted">Cargando…</p>
      ) : !rows.length ? (
        <p className="muted">Sin registros.</p>
      ) : tab === 'ingresos' ? (
        <div className="table-wrap">
          <table className="consultas-table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Repartidor</th>
                <th>Piezas</th>
                <th>Total</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const abierto = expandido === c.id;
                return (
                  <React.Fragment key={c.id}>
                    <tr>
                      <td><strong>{c.folio || '—'}</strong></td>
                      <td>{c.fecha || fmtFecha(c.created_at)}</td>
                      <td>{c.vendedor_nombre || '—'}</td>
                      <td>{fmtQty(c.piezas)}</td>
                      <td>{fmtMonto(c.total)}</td>
                      <td>{badgeEstado(c.estado)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: '0.78rem', padding: '0.2rem 0.45rem' }}
                          onClick={() => setExpandido(abierto ? null : c.id)}
                        >
                          {abierto ? 'Ocultar' : 'Detalle'}
                        </button>
                      </td>
                    </tr>
                    {abierto ? (
                      <tr>
                        <td colSpan={7} style={{ background: '#f8fafc', padding: '0.5rem 0.75rem' }}>
                          <div className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                            {c.etiqueta || 'Ingreso a camión (salida CEDIS)'}
                          </div>
                          {(c.lineas || []).length ? (
                            <table className="consultas-table" style={{ margin: 0 }}>
                              <thead>
                                <tr>
                                  <th>Producto</th>
                                  <th>Cargadas</th>
                                  <th>Vendidas</th>
                                  <th>Devueltas</th>
                                  <th>Precio</th>
                                  <th>Importe</th>
                                </tr>
                              </thead>
                              <tbody>
                                {c.lineas.map((l) => (
                                  <tr key={l.id || `${c.id}-${l.producto_id}`}>
                                    <td>{l.producto_nombre || l.producto_id || '—'}</td>
                                    <td>{fmtQty(l.qty_cargada)}</td>
                                    <td>{fmtQty(l.qty_vendida)}</td>
                                    <td>{fmtQty(l.qty_devuelta)}</td>
                                    <td>{fmtMonto(l.precio)}</td>
                                    <td>{fmtMonto((Number(l.precio) || 0) * (Number(l.qty_cargada) || 0))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="muted" style={{ margin: 0 }}>Sin líneas.</p>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : tab === 'cargas' ? (
        <div className="table-wrap">
          <table className="consultas-table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Repartidor</th>
                <th>Estado</th>
                <th>Liquidada</th>
                {puedeCancelar ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const enRuta = String(c.estado || '').toLowerCase() === 'en_ruta';
                return (
                  <tr key={c.id}>
                    <td><strong>{c.folio || '—'}</strong></td>
                    <td>{c.fecha || fmtFecha(c.created_at)}</td>
                    <td>{c.vendedor_nombre || '—'}</td>
                    <td>{badgeEstado(c.estado)}</td>
                    <td className="muted" style={{ fontSize: '0.8rem' }}>{c.liquidada_at ? fmtFecha(c.liquidada_at) : '—'}</td>
                    {puedeCancelar ? (
                      <td>
                        {enRuta ? (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: '0.78rem', padding: '0.2rem 0.45rem', color: '#b91c1c' }}
                            disabled={cancelandoId === c.id}
                            onClick={() => void onCancelarCarga(c)}
                          >
                            {cancelandoId === c.id ? 'Cancelando…' : 'Cancelar'}
                          </button>
                        ) : (
                          <span className="muted" style={{ fontSize: '0.75rem' }}>—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : tab === 'creditos' ? (
        <div className="table-wrap">
          <table className="consultas-table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Cliente</th>
                <th>Monto</th>
                <th>Cobrado</th>
                <th>Cajero</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td><strong>{m.folio_venta || m.venta_id || '—'}</strong></td>
                  <td>
                    {m.cliente_nombre || m.cliente_id || '—'}
                    {m.cliente_tipo ? <span className="muted" style={{ fontSize: '0.72rem' }}> · {m.cliente_tipo}</span> : null}
                  </td>
                  <td>{fmtMonto(m.monto)}</td>
                  <td className="muted" style={{ fontSize: '0.8rem' }}>{fmtFecha(m.pagado_at || m.created_at)}</td>
                  <td>{m.pagado_por || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="consultas-table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Pago</th>
                <th>Total</th>
                <th>Vendedor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.folio || '—'}</strong></td>
                  <td className="muted" style={{ fontSize: '0.8rem' }}>{fmtFecha(v.created_at)}</td>
                  <td>
                    {v.cliente_nombre || v.cliente_id || '—'}
                    {v.cliente_tipo ? <span className="muted" style={{ fontSize: '0.72rem' }}> · {v.cliente_tipo}</span> : null}
                  </td>
                  <td>{v.metodo_pago || '—'}{v.estado_credito ? ` · ${v.estado_credito}` : ''}</td>
                  <td>{fmtMonto(v.total)}</td>
                  <td className="muted">{v.vendedor_nombre || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
