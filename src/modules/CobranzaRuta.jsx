import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import InputPin from '../components/InputPin.jsx';
import {
  eliminarCreditosPendientesRuta,
  listarCreditosPendientesRuta,
  pagarCreditosRutaConPin,
  puedeEliminarCreditosRuta,
  sincronizarCreditosRecoleccionACxc,
  verificarPinCajero,
} from '../lib/rutaCxc.js';
import {
  cancelarSolicitudCobro,
  listarSolicitudesCajero,
  solicitarCobroCreditos,
  solicitudRequiereAccion,
} from '../lib/rutaCxcAprobacion.js';
import { fmtFechaCorta, fmtMonto } from '../lib/consultasUi.js';
import {
  esCentralAdmin,
  etiquetaTienda,
  normalizarCodigoTienda,
} from '../constants/sucursales.js';

/**
 * Contabilidad → Cobranza / Venta en Ruta → Créditos por pagar.
 * Incluye créditos de venta en ruta y de Recolecciones (Entrega Crédito).
 * - PIN del cajero al abrir el módulo.
 * - Una fila / cuenta por tienda (nunca mezclar sucursales).
 * - Al tocar una tienda se despliegan sus folios.
 * - Solo se selecciona y paga UNA tienda a la vez.
 * - Se pueden marcar folios concretos y/o pagar un monto parcial (FIFO).
 * - Administrador puede eliminar créditos por error.
 * - Al pagar el cajero SOLICITA el cobro; el vendedor de ruta lo aprueba con su PIN y
 *   entonces se registra: gasto abarrotes + efectivo a tránsito (recolección reusa la ficha).
 * - Carga rápida de CxC + sync Recolecciones en segundo plano.
 */
export default function CobranzaRuta({ supabase, user, sucursal, embedded = false, titulo }) {
  const [aviso, setAviso] = useState('');
  const [rows, setRows] = useState([]);
  const [selTienda, setSelTienda] = useState(''); // una sola tienda
  const [pinEntrada, setPinEntrada] = useState('');
  const [cajero, setCajero] = useState(null);
  const [abriendo, setAbriendo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [syncBg, setSyncBg] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [montoPagarStr, setMontoPagarStr] = useState('');
  /** Folios marcados para pagar (ids). Vacío = ninguno. */
  const [foliosSel, setFoliosSel] = useState(() => new Set());
  const syncGen = useRef(0);
  const pagoEnCurso = useRef(false);
  const solicitudPago = useRef(null);
  const [solicitudes, setSolicitudes] = useState([]);
  const solicitudesPrevias = useRef(new Map());
  const puedeEliminar = puedeEliminarCreditosRuta(user?.rol);

  const sucActiva = normalizarCodigoTienda(sucursal || user?.sucursal_id || '') || '';
  // Solo central (MAIN): ve todas las tiendas. Cada sucursal ve únicamente la suya.
  const verTodasLasTiendas = esCentralAdmin(sucActiva) || sucActiva === 'MAIN' || !sucActiva;
  const tiendaLabelActiva = sucActiva ? (etiquetaTienda(sucActiva) || sucActiva) : '';

  const armarAvisos = useCallback((r, data) => {
    const msgs = [];
    if (r?.aviso) msgs.push(r.aviso);
    if (r?.error) msgs.push(r.error);
    if (r?.sync?.error) msgs.push(r.sync.error);
    if (r?.sync?.creados > 0 || r?.sync?.reabiertos > 0) {
      const partes = [];
      if (r.sync.creados) partes.push(`${r.sync.creados} nuevos`);
      if (r.sync.reabiertos) partes.push(`${r.sync.reabiertos} reabiertos`);
      msgs.push(`Sync Recolecciones: ${partes.join(' · ')}`);
    }
    const lista = data || r?.data || [];
    if (!verTodasLasTiendas && sucActiva) {
      const monto = lista.reduce((s, m) => s + (Number(m.monto) || 0), 0);
      msgs.push(
        `${sucActiva} ${tiendaLabelActiva}: ${lista.length} crédito(s) · ${fmtMonto(Math.round(monto * 100) / 100)}`,
      );
    } else if (verTodasLasTiendas) {
      // Resumen útil en central (p. ej. Mezquite con saldo alto).
      const mezquiteSync = (r?.sync?.porTienda || []).find((t) => String(t.tienda).toUpperCase() === '3B10');
      const mezquiteRows = lista.filter((m) => {
        const cid = normalizarCodigoTienda(m.cliente_id) || String(m.cliente_id || '').toUpperCase();
        return cid === '3B10';
      });
      const mezquiteMonto = mezquiteRows.reduce((s, m) => s + (Number(m.monto) || 0), 0);
      if (mezquiteSync || mezquiteRows.length) {
        const monto = mezquiteRows.length
          ? Math.round(mezquiteMonto * 100) / 100
          : Number(mezquiteSync?.monto) || 0;
        const count = mezquiteRows.length || mezquiteSync?.count || 0;
        msgs.push(`3B10 El Mezquite: ${count} crédito(s) · ${fmtMonto(monto)}`);
      }
    }
    return msgs.filter(Boolean).join(' · ');
  }, [verTodasLasTiendas, sucActiva, tiendaLabelActiva]);

  const cargar = useCallback(async ({ conSyncFondo = true } = {}) => {
    const gen = ++syncGen.current;
    setCargando(true);
    // 1) Lectura rápida de CxC (sin sync bloqueante).
    const r = await listarCreditosPendientesRuta(supabase, {
      sucursalId: verTodasLasTiendas ? undefined : sucActiva,
      todos: true,
      sync: 'skip',
    });
    if (gen !== syncGen.current) return;
    const data = r.data || [];
    setAviso(armarAvisos(r, data));
    setRows(data);
    // Sucursal: siempre abrir su desglose. Central: conservar selección si sigue existiendo.
    if (!verTodasLasTiendas && sucActiva) {
      setSelTienda(sucActiva);
    } else {
      setSelTienda((prev) => (data.some((m) => {
        const esSuc = String(m.cliente_tipo || 'sucursal') === 'sucursal';
        const id = esSuc
          ? (normalizarCodigoTienda(m.cliente_id) || String(m.cliente_id || '').toUpperCase())
          : `ext:${m.cliente_id || m.cliente_nombre || '—'}`;
        return id === prev;
      }) ? prev : ''));
    }
    setMontoPagarStr('');
    setCargando(false);

    if (!conSyncFondo || !supabase) return;

    // 2) Sync Por Cobrar → CxC en segundo plano (no bloquea la UI).
    setSyncBg(true);
    try {
      const sync = await sincronizarCreditosRecoleccionACxc(supabase, {
        limit: 1500,
        skipReparar: true,
      });
      if (gen !== syncGen.current) return;
      if (sync?.error) setAviso((prev) => [prev, sync.error].filter(Boolean).join(' · '));
      if (sync?.creados > 0 || sync?.reabiertos > 0 || sync?.corregidos > 0) {
        const r2 = await listarCreditosPendientesRuta(supabase, {
          sucursalId: verTodasLasTiendas ? undefined : sucActiva,
          todos: true,
          sync: 'skip',
        });
        if (gen !== syncGen.current) return;
        const data2 = r2.data || [];
        setRows(data2);
        setAviso(armarAvisos({ ...r2, sync }, data2));
      } else if (sync && !sync.ok && sync.error) {
        setAviso((prev) => [prev, `Sync: ${sync.error}`].filter(Boolean).join(' · '));
      }
    } catch (e) {
      if (gen === syncGen.current) {
        setAviso((prev) => [prev, e?.message || String(e)].filter(Boolean).join(' · '));
      }
    } finally {
      if (gen === syncGen.current) setSyncBg(false);
    }
  }, [supabase, sucActiva, verTodasLasTiendas, armarAvisos]);

  useEffect(() => {
    if (!cajero) return;
    void cargar({ conSyncFondo: true });
  }, [cargar, cajero]);

  const cargarSolicitudes = useCallback(async () => {
    if (!supabase) return;
    const r = await listarSolicitudesCajero(supabase, { sucursal: sucActiva });
    if (!r.ok) return;
    const previas = solicitudesPrevias.current;
    const cambioAAprobada = r.data.some((x) => x.estado === 'aprobada' && x.aplicada_at && previas.get(x.id) && previas.get(x.id) !== 'aplicada');
    solicitudesPrevias.current = new Map(r.data.map((x) => [x.id, x.estado === 'aprobada' && x.aplicada_at ? 'aplicada' : x.estado]));
    setSolicitudes(r.data);
    if (cambioAAprobada) void cargar({ conSyncFondo: false });
  }, [supabase, sucActiva, cargar]);

  useEffect(() => {
    if (!cajero) return undefined;
    void cargarSolicitudes();
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void cargarSolicitudes();
    }, 15_000);
    return () => clearInterval(t);
  }, [cajero, cargarSolicitudes]);

  const idsEnAprobacion = useMemo(
    () => new Set(solicitudes.filter(solicitudRequiereAccion).flatMap((x) => (x.movimiento_ids || []).map(String))),
    [solicitudes],
  );

  const cancelarSolicitud = async (sol) => {
    if (!confirm(`¿Cancelar la solicitud de ${fmtMonto(sol.monto)} para ${sol.vendedor_nombre || 'el vendedor'}?`)) return;
    const r = await cancelarSolicitudCobro(supabase, { solicitudId: sol.id, cajeroNombre: cajero?.nombre });
    if (!r.ok) alert(r.error);
    await cargarSolicitudes();
  };

  const grupos = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const esSuc = String(r.cliente_tipo || 'sucursal') === 'sucursal';
      const id = esSuc
        ? (normalizarCodigoTienda(r.cliente_id) || String(r.cliente_id || r.cliente_nombre || '—').toUpperCase())
        : `ext:${r.cliente_id || r.cliente_nombre || '—'}`;
      const label = esSuc
        ? `${id} · ${etiquetaTienda(id) || r.cliente_nombre || id}`
        : (r.cliente_nombre || 'Cliente externo');
      if (!map.has(id)) {
        map.set(id, { id, label, items: [], total: 0 });
      }
      const g = map.get(id);
      g.items.push(r);
      g.total += Number(r.monto) || 0;
    }
    return [...map.values()]
      .map((g) => ({
        ...g,
        total: Math.round(g.total * 100) / 100,
        items: [...g.items].sort(
          (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')),
        ),
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id), 'es'));
  }, [rows]);

  const marcarTodosFolios = useCallback((items) => {
    setFoliosSel(new Set((items || []).map((x) => String(x.id))));
  }, []);

  const toggleGrupo = (grupoId) => {
    // Una sola tienda a la vez (no mezclar cuentas de varias sucursales).
    setSelTienda((prev) => {
      const next = prev === grupoId ? '' : grupoId;
      if (next) {
        const g = grupos.find((x) => x.id === next);
        marcarTodosFolios(g?.items);
      } else {
        setFoliosSel(new Set());
      }
      return next;
    });
    setMontoPagarStr('');
  };

  // Tienda con folios desplegados (la flecha ▾/▸ controla selTienda).
  const grupoSel = useMemo(
    () => grupos.find((g) => g.id === selTienda) || null,
    [grupos, selTienda],
  );

  // Al desplegar una tienda: marcar todos los folios (sin pisar si el usuario ya desmarcó alguno).
  useEffect(() => {
    if (!grupoSel?.items?.length) return;
    setFoliosSel((prev) => {
      const ids = grupoSel.items.map((x) => String(x.id));
      const mismos = ids.length === prev.size && ids.every((id) => prev.has(id));
      if (mismos) return prev;
      const algunoDeTienda = ids.some((id) => prev.has(id));
      if (algunoDeTienda && prev.size > 0 && prev.size < ids.length) return prev;
      if (prev.size === 0 || !algunoDeTienda) return new Set(ids);
      return prev;
    });
  }, [grupoSel]);

  const itemsMarcados = useMemo(() => {
    if (!grupoSel) return [];
    return grupoSel.items.filter((m) => foliosSel.has(String(m.id)));
  }, [grupoSel, foliosSel]);

  // En sucursal, el balance se muestra aunque los folios estén plegados.
  const grupoBalance = useMemo(() => {
    if (grupoSel) return grupoSel;
    if (!verTodasLasTiendas && grupos.length === 1) return grupos[0];
    return null;
  }, [grupoSel, grupos, verTodasLasTiendas]);

  const totalTienda = grupoBalance?.total || 0;
  const totalFoliosSel = useMemo(
    () => Math.round(itemsMarcados.reduce((s, m) => s + (Number(m.monto) || 0), 0) * 100) / 100,
    [itemsMarcados],
  );
  const idsSeleccionados = useMemo(
    () => itemsMarcados.map((x) => x.id),
    [itemsMarcados],
  );

  const montoPagarNum = useMemo(() => {
    const n = Number(String(montoPagarStr).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100) / 100;
  }, [montoPagarStr]);

  const toggleFolio = (id) => {
    const sid = String(id);
    setFoliosSel((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  };

  const seleccionarTodosFolios = () => {
    if (!grupoSel) return;
    marcarTodosFolios(grupoSel.items);
  };

  const limpiarFoliosSel = () => setFoliosSel(new Set());

  const usarTodo = () => {
    if (!itemsMarcados.length) return;
    setMontoPagarStr(String(totalFoliosSel));
  };

  const abrirConPin = async () => {
    setAbriendo(true);
    const r = await verificarPinCajero(supabase, pinEntrada, sucActiva);
    setAbriendo(false);
    if (!r.ok) return alert(r.error);
    setCajero(r.user);
    setPinEntrada('');
  };

  const cerrarSesionCajero = () => {
    syncGen.current += 1;
    setCajero(null);
    setRows([]);
    setSelTienda('');
    setFoliosSel(new Set());
    setMontoPagarStr('');
    setAviso('');
    setSyncBg(false);
  };

  const eliminarSeleccion = async () => {
    if (!idsSeleccionados.length) return;
    if (!confirm(
      `¿Eliminar ${idsSeleccionados.length} folio(s) marcado(s) de ${grupoSel?.label || 'tienda'} (${fmtMonto(totalFoliosSel)})?\n\n`
      + 'Solo para corregir errores. No registra pago ni gasto.',
    )) return;
    setEliminando(true);
    const r = await eliminarCreditosPendientesRuta(supabase, {
      movimientoIds: idsSeleccionados,
      rolActor: user?.rol,
      actorNombre: user?.nombre,
    });
    setEliminando(false);
    if (!r.ok) return alert(r.error);
    alert(`Eliminados ${r.eliminados || idsSeleccionados.length} crédito(s).`);
    setFoliosSel(new Set());
    await cargar({ conSyncFondo: false });
  };

  const pagar = async () => {
    if (pagoEnCurso.current) return;
    if (!grupoSel || !idsSeleccionados.length) {
      return alert('Marca al menos un folio para pagar.');
    }
    const monto = montoPagarNum > 0 ? montoPagarNum : totalFoliosSel;
    if (!(monto > 0)) return;
    if (monto > totalFoliosSel + 0.009) {
      return alert(`El monto no puede superar los folios marcados (${fmtMonto(totalFoliosSel)}).`);
    }
    if (idsSeleccionados.some((id) => idsEnAprobacion.has(String(id)))) {
      return alert('Alguno de los folios marcados ya espera la aprobación del vendedor. Cancela esa solicitud o desmárcalo.');
    }
    if (!confirm(
      `¿Solicitar el cobro de ${fmtMonto(monto)} de ${grupoSel.label}?\n`
      + `${idsSeleccionados.length} folio(s) marcado(s) · ${fmtMonto(totalFoliosSel)}`
      + (monto < totalFoliosSel - 0.001 ? ' · parcial FIFO' : '')
      + `\nSaldo tienda ${fmtMonto(totalTienda)}\n\n`
      + 'El vendedor de ruta recibirá un aviso y debe aprobarlo con su PIN. '
      + 'Hasta entonces no se registra gasto, efectivo ni abono.',
    )) return;
    const firma = JSON.stringify([idsSeleccionados.map(String).sort(), monto, grupoSel.id || sucActiva, cajero?.nombre]);
    if (solicitudPago.current?.firma !== firma) {
      solicitudPago.current = { firma, id: crypto.randomUUID() };
    }
    pagoEnCurso.current = true;
    setGuardando(true);
    let r;
    try {
      const sucPago = grupoSel.id || sucActiva;
      const sol = await solicitarCobroCreditos(supabase, {
        movimientoIds: idsSeleccionados, monto, sucursal: sucPago, cajeroUser: cajero,
      });
      if (!sol.ok) {
        r = sol;
      } else if (sol.modo === 'directo') {
        r = await pagarCreditosRutaConPin(supabase, {
          movimientoIds: idsSeleccionados,
          sucursal: sucPago,
          cajeroUser: cajero,
          montoPagar: monto,
          solicitudId: solicitudPago.current.id,
        });
      } else {
        r = { ok: true, solicitadas: sol.solicitudes };
      }
    } catch {
      r = { ok: false, error: 'No se confirmó la operación. Conserva la selección y reintenta.' };
    } finally {
      pagoEnCurso.current = false;
      setGuardando(false);
    }
    if (!r.ok) return alert(r.error);
    solicitudPago.current = null;
    if (r.solicitadas) {
      const quienes = [...new Set(r.solicitadas.map((x) => x.vendedor_nombre).filter(Boolean))].join(', ');
      alert(`Solicitud enviada a ${quienes || 'el vendedor'} por ${fmtMonto(monto)} · ${grupoSel.label}.\nEl pago se registra cuando el vendedor lo apruebe con su PIN.`);
      setFoliosSel(new Set());
      setMontoPagarStr('');
      await cargarSolicitudes();
      return;
    }
    const extra = r.parcial ? ' (parcial; queda saldo pendiente)' : '';
    alert(`Pagado ${fmtMonto(r.montoPagado || monto)} · ${grupoSel.label} · ${r.cajero}.${extra}`);
    setFoliosSel(new Set());
    setMontoPagarStr('');
    await cargar({ conSyncFondo: true });
  };

  const heading = titulo || (embedded ? 'Créditos por pagar' : 'Cobranza · créditos ruta');

  if (!cajero) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          {embedded ? (
            <h3 style={{ margin: 0, color: '#0f766e' }}>{heading}</h3>
          ) : (
            <h2 style={{ margin: 0, color: '#0f766e' }}>{heading}</h2>
          )}
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
            Ingresa el <strong>PIN del cajero</strong> para abrir créditos por pagar
            (venta en ruta y créditos del módulo Recolecciones).
            {verTodasLasTiendas
              ? ' Central: ves todas las tiendas; toca una, marca folios o paga un monto.'
              : ` Solo créditos de ${tiendaLabelActiva || sucActiva || 'esta sucursal'}; marca folios o paga un monto.`}
          </p>
        </div>
        <div className="card" style={{ borderTop: '4px solid #0f766e', maxWidth: 360 }}>
          <label style={{ fontSize: '0.85rem', display: 'block' }}>
            PIN cajero
            <InputPin
              value={pinEntrada}
              onChange={(e) => setPinEntrada(e.target.value)}
              className="input"
              style={{ width: '100%', marginTop: '0.35rem' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void abrirConPin();
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '0.75rem' }}
            disabled={abriendo || !String(pinEntrada).trim()}
            onClick={() => void abrirConPin()}
          >
            {abriendo ? 'Verificando…' : 'Abrir con PIN'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '100%' }}>
      <div>
        {embedded ? (
          <h3 style={{ margin: 0, color: '#0f766e' }}>{heading}</h3>
        ) : (
          <h2 style={{ margin: 0, color: '#0f766e' }}>{heading}</h2>
        )}
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Cajero: <strong>{cajero.nombre || '—'}</strong>.
          {verTodasLasTiendas
            ? ' Central: toca una tienda, marca folios y/o escribe un monto (parcial FIFO).'
            : ` Créditos de ${tiendaLabelActiva || sucActiva}: marca folios y/o escribe un monto (parcial FIFO).`}
          {puedeEliminar ? ' · Admin: puedes eliminar folios marcados por error.' : ''}
        </p>
      </div>
      {solicitudes.length > 0 && (
        <div className="card" style={{ margin: 0, padding: '0.6rem 0.8rem', borderLeft: '4px solid #0f766e' }}>
          <strong style={{ fontSize: '0.85rem' }}>Solicitudes de cobro (aprobación del vendedor)</strong>
          <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.4rem' }}>
            {solicitudes.slice(0, 8).map((sol) => {
              const aplicada = sol.estado === 'aprobada' && sol.aplicada_at;
              const etiqueta = aplicada ? 'Aprobada y cobrada'
                : sol.estado === 'aprobada' ? 'Aprobada · registrando pago'
                  : { pendiente: 'Esperando al vendedor', rechazada: 'Rechazada', cancelada: 'Cancelada' }[sol.estado] || sol.estado;
              const color = aplicada ? '#187443' : sol.estado === 'rechazada' ? '#b42318' : sol.estado === 'pendiente' ? '#b45309' : '#64748b';
              return (
                <div key={sol.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'baseline', fontSize: '0.82rem' }}>
                  <strong>{fmtMonto(sol.monto)}</strong>
                  <span>{sol.tienda || sol.sucursal_id}</span>
                  <span className="muted">→ {sol.vendedor_nombre || 'vendedor'}</span>
                  <span style={{ color, fontWeight: 700 }}>{etiqueta}</span>
                  {sol.estado === 'rechazada' && sol.motivo ? <span className="muted">Motivo: {sol.motivo}</span> : null}
                  <span className="muted">{fmtFechaCorta(sol.created_at)}</span>
                  {sol.estado === 'pendiente' && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void cancelarSolicitud(sol)}>Cancelar</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {aviso && <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)' }}>{aviso}</div>}
      {(cargando || syncBg) && (
        <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
          {cargando ? 'Cargando créditos…' : 'Sincronizando Recolecciones en segundo plano…'}
        </p>
      )}

      <div className="card" style={{ borderTop: '4px solid #0f766e' }}>
        {grupos.length === 0 && !cargando ? (
          <p className="muted">
            {verTodasLasTiendas
              ? 'No hay créditos pendientes. Si en Recolecciones aún hay folios «Por Cobrar», pulsa Actualizar.'
              : `No hay créditos pendientes en ${tiendaLabelActiva || sucActiva}. Si en Recolecciones hay «Por Cobrar» de esta tienda, pulsa Actualizar.`}
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
              {verTodasLasTiendas
                ? `${grupos.length} tienda${grupos.length === 1 ? '' : 's'} con crédito · toca una para ver folios y pagar`
                : `Desglose · ${tiendaLabelActiva || sucActiva}`}
            </p>
            {grupos.map((g) => {
              const desplegado = selTienda === g.id;
              const soloTienda = !verTodasLasTiendas;
              return (
                <div
                  key={g.id}
                  style={{
                    border: desplegado ? '2px solid #0f766e' : '1px solid var(--border, #e2e8f0)',
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#fff',
                  }}
                >
                  {/* Encabezado fijo: debajo de esta línea se ocultan los folios al scrollear */}
                  <button
                    type="button"
                    onClick={() => toggleGrupo(g.id)}
                    aria-expanded={desplegado}
                    title={desplegado ? 'Plegar folios' : 'Desplegar folios'}
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      gap: '0.65rem',
                      padding: '0.75rem 0.9rem',
                      border: 'none',
                      borderBottom: desplegado ? '1px solid var(--border, #e2e8f0)' : 'none',
                      background: desplegado ? 'rgba(15,118,110,0.08)' : '#fff',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'inherit',
                      position: 'relative',
                      zIndex: 2,
                    }}
                  >
                    {!soloTienda && (
                      <span
                        aria-hidden
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          border: desplegado ? '6px solid #0f766e' : '2px solid #94a3b8',
                          boxSizing: 'border-box',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span style={{ fontWeight: 700, width: 16, flexShrink: 0 }} aria-hidden>
                      {desplegado ? '▾' : '▸'}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: 'block' }}>{g.label}</strong>
                      <span className="muted" style={{ fontSize: '0.78rem' }}>
                        {g.items.length} folio{g.items.length === 1 ? '' : 's'}
                        {desplegado ? ' · toca para plegar' : ' · toca para desplegar'}
                      </span>
                    </span>
                    <span style={{ flexShrink: 0, textAlign: 'right' }}>
                      <span
                        className="muted"
                        style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.01em' }}
                      >
                        Balance antes del ingreso
                      </span>
                      <strong style={{ color: '#b45309', fontSize: '1.05rem' }}>{fmtMonto(g.total)}</strong>
                    </span>
                  </button>
                  {desplegado && (
                    <div
                      style={{
                        maxHeight: 'min(48vh, 420px)',
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        WebkitOverflowScrolling: 'touch',
                        scrollbarGutter: 'stable',
                        padding: '0.35rem 0.65rem 0.65rem',
                      }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span className="muted" style={{ fontSize: '0.75rem' }}>
                          {foliosSel.size}/{g.items.length} folio(s) · {fmtMonto(totalFoliosSel)}
                        </span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={seleccionarTodosFolios}>
                          Marcar todos
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={limpiarFoliosSel}
                          disabled={!foliosSel.size}
                        >
                          Quitar marcas
                        </button>
                      </div>
                      <table className="consultas-table" style={{ width: '100%', fontSize: '0.84rem', marginBottom: 0 }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#fff' }}>
                          <tr>
                            <th style={{ width: 36, textAlign: 'center', background: '#fff' }} aria-label="Seleccionar" />
                            <th style={{ textAlign: 'left', background: '#fff' }}>Folio</th>
                            <th style={{ textAlign: 'left', background: '#fff' }}>Fecha</th>
                            <th style={{ textAlign: 'right', background: '#fff' }}>Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map((m) => {
                            const checked = foliosSel.has(String(m.id));
                            return (
                              <tr
                                key={m.id}
                                onClick={() => toggleFolio(m.id)}
                                style={{
                                  cursor: 'pointer',
                                  background: checked ? 'rgba(15,118,110,0.06)' : undefined,
                                }}
                              >
                                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleFolio(m.id)}
                                    aria-label={`Seleccionar folio ${m.folio_venta || m.venta_id || m.id}`}
                                  />
                                </td>
                                <td>
                                  <strong>{m.folio_venta || m.venta_id || '—'}</strong>
                                  {idsEnAprobacion.has(String(m.id)) ? (
                                    <span style={{ marginLeft: 6, fontSize: '0.68rem', fontWeight: 700, color: '#b45309' }}>En aprobación</span>
                                  ) : null}
                                  {m.notas ? (
                                    <div className="muted" style={{ fontSize: '0.72rem', maxWidth: 280 }}>
                                      {String(m.notas).length > 72 ? `${String(m.notas).slice(0, 72)}…` : m.notas}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                  {fmtFechaCorta(m.created_at)}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMonto(m.monto)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Pie de página del módulo (no flotante): una sola línea */}
      <div
        style={{
          marginTop: 'auto',
          padding: '0.45rem 0.65rem',
          background: '#fff',
          borderTop: '2px solid #0f766e',
          borderRadius: '0 0 10px 10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'nowrap',
            alignItems: 'center',
            gap: '0.55rem',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '0.35rem',
              flexShrink: 0,
              padding: '0.2rem 0.5rem',
              borderRadius: 6,
              background: 'rgba(180, 83, 9, 0.08)',
              border: '1px solid #fde68a',
              whiteSpace: 'nowrap',
            }}
            title={grupoBalance ? `${grupoBalance.id} · ${grupoBalance.items.length} folio(s)` : ''}
          >
            <span className="muted" style={{ fontSize: '0.68rem', fontWeight: 600 }}>
              Balance antes del ingreso
            </span>
            <strong style={{ color: '#b45309', fontSize: '0.98rem' }}>
              {grupoBalance ? fmtMonto(totalTienda) : '—'}
            </strong>
          </div>

          <span className="muted" style={{ fontSize: '0.72rem', flexShrink: 0, whiteSpace: 'nowrap' }}>
            A pagar:{' '}
            <strong style={{ color: 'inherit' }}>
              {grupoSel
                ? `${idsSeleccionados.length} · ${fmtMonto(totalFoliosSel)}`
                : '—'}
            </strong>
            {grupoSel && (montoPagarNum > 0 ? montoPagarNum : totalFoliosSel) > 0 ? (
              <>
                {' · '}Después:{' '}
                {fmtMonto(Math.max(0, Math.round((totalTienda - (montoPagarNum > 0 ? montoPagarNum : totalFoliosSel)) * 100) / 100))}
              </>
            ) : null}
          </span>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.75rem',
              flexShrink: 0,
              whiteSpace: 'nowrap',
              margin: 0,
            }}
            title="Opcional · vacío = total marcado"
          >
            Monto
            <input
              type="number"
              className="input"
              min="0"
              step="0.01"
              max={totalFoliosSel || undefined}
              value={montoPagarStr}
              disabled={!grupoSel || !idsSeleccionados.length || guardando}
              onChange={(e) => setMontoPagarStr(e.target.value)}
              style={{ width: 100, padding: '0.28rem 0.4rem', fontSize: '0.85rem' }}
              placeholder={totalFoliosSel > 0 ? String(totalFoliosSel) : '0.00'}
            />
          </label>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!idsSeleccionados.length || guardando || !(totalFoliosSel > 0)}
            onClick={usarTodo}
            title="Poner el total de los folios marcados en el monto"
            style={{ flexShrink: 0 }}
          >
            Usar marcado
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={guardando || eliminando || !idsSeleccionados.length || !(totalFoliosSel > 0)}
            onClick={() => void pagar()}
            style={{ flexShrink: 0 }}
          >
            {guardando
              ? 'Enviando…'
              : montoPagarNum > 0
                ? `Solicitar cobro ${fmtMonto(montoPagarNum)}`
                : `Solicitar cobro ${idsSeleccionados.length || 0}`}
          </button>
          {puedeEliminar && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: '#b91c1c', borderColor: '#fecaca', flexShrink: 0 }}
              disabled={guardando || eliminando || !idsSeleccionados.length}
              onClick={() => void eliminarSeleccion()}
              title="Solo administrador · elimina folios marcados"
            >
              {eliminando ? 'Eliminando…' : 'Eliminar'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={cerrarSesionCajero}
            disabled={guardando || eliminando}
            style={{ flexShrink: 0 }}
          >
            Cerrar sesión
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void cargar({ conSyncFondo: true })}
            disabled={guardando || eliminando || cargando || syncBg}
            style={{ flexShrink: 0 }}
          >
            Actualizar
          </button>
        </div>
      </div>
    </div>
  );
}
