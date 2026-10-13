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
 * - Se puede pagar un monto parcial (liquidez para otros proveedores).
 * - Administrador puede eliminar créditos por error.
 * - Al pagar: gasto abarrotes + efectivo a tránsito (recolección reusa la ficha).
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
  const syncGen = useRef(0);
  const puedeEliminar = puedeEliminarCreditosRuta(user?.rol);

  const sucActiva = normalizarCodigoTienda(sucursal || user?.sucursal_id || '') || '';
  // Solo central (MAIN): ve todas las tiendas. Cada sucursal ve únicamente la suya.
  const verTodasLasTiendas = esCentralAdmin(sucActiva) || sucActiva === 'MAIN' || !sucActiva;
  const tiendaLabelActiva = sucActiva ? (etiquetaTienda(sucActiva) || sucActiva) : '';

  const armarAvisos = useCallback((r, data) => {
    const msgs = [];
    if (r?.aviso) msgs.push(r.aviso);
    if (r?.error) msgs.push(r.error);
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
      limit: 1500,
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
      if (sync?.creados > 0 || sync?.reabiertos > 0 || sync?.corregidos > 0) {
        const r2 = await listarCreditosPendientesRuta(supabase, {
          sucursalId: verTodasLasTiendas ? undefined : sucActiva,
          limit: 1500,
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

  const toggleGrupo = (grupoId) => {
    // Una sola tienda a la vez (no mezclar cuentas de varias sucursales).
    setSelTienda((prev) => (prev === grupoId ? '' : grupoId));
    setMontoPagarStr('');
  };

  const grupoSel = useMemo(() => {
    if (!verTodasLasTiendas && grupos.length === 1) return grupos[0];
    return grupos.find((g) => g.id === selTienda) || null;
  }, [grupos, selTienda, verTodasLasTiendas]);
  const totalSel = grupoSel?.total || 0;
  const idsSeleccionados = useMemo(
    () => (grupoSel ? grupoSel.items.map((x) => x.id) : []),
    [grupoSel],
  );

  const montoPagarNum = useMemo(() => {
    const n = Number(String(montoPagarStr).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100) / 100;
  }, [montoPagarStr]);

  const usarTodo = () => {
    if (!grupoSel) return;
    setMontoPagarStr(String(grupoSel.total));
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
    setMontoPagarStr('');
    setAviso('');
    setSyncBg(false);
  };

  const eliminarSeleccion = async () => {
    if (!grupoSel?.items?.length) return;
    if (!confirm(
      `¿Eliminar ${grupoSel.items.length} crédito(s) de ${grupoSel.label} (${fmtMonto(totalSel)})?\n\n`
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
    await cargar({ conSyncFondo: false });
  };

  const pagar = async () => {
    if (!grupoSel || !(montoPagarNum > 0)) return;
    if (montoPagarNum > totalSel + 0.009) {
      return alert(`El monto no puede superar ${fmtMonto(totalSel)}.`);
    }
    if (!confirm(
      `¿Pagar ${fmtMonto(montoPagarNum)} de ${grupoSel.label}?\n`
      + `${grupoSel.items.length} folio(s) · saldo tienda ${fmtMonto(totalSel)}\n\n`
      + 'Gasto abarrotes en ESA tienda + efectivo a tránsito.',
    )) return;
    setGuardando(true);
    const r = await pagarCreditosRutaConPin(supabase, {
      movimientoIds: idsSeleccionados,
      sucursal: grupoSel.id || sucActiva,
      cajeroUser: cajero,
      montoPagar: montoPagarNum,
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    const extra = r.parcial ? ' (parcial; queda saldo pendiente)' : '';
    alert(`Pagado ${fmtMonto(r.montoPagado || montoPagarNum)} · ${grupoSel.label} · ${r.cajero}.${extra}`);
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
              ? ' Central: ves todas las tiendas; toca una para ver folios y pagar.'
              : ` Solo créditos de ${tiendaLabelActiva || sucActiva || 'esta sucursal'} con desglose de folios.`}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        {embedded ? (
          <h3 style={{ margin: 0, color: '#0f766e' }}>{heading}</h3>
        ) : (
          <h2 style={{ margin: 0, color: '#0f766e' }}>{heading}</h2>
        )}
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Cajero: <strong>{cajero.nombre || '—'}</strong>.
          {verTodasLasTiendas
            ? ' Central: toca una tienda para ver folios y pagar (parcial permitido).'
            : ` Créditos de ${tiendaLabelActiva || sucActiva} con desglose de folios (parcial permitido).`}
          {puedeEliminar ? ' · Admin: puedes eliminar créditos por error.' : ''}
        </p>
      </div>
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
              const marcado = selTienda === g.id || (!verTodasLasTiendas && grupos.length === 1);
              const soloTienda = !verTodasLasTiendas;
              return (
                <div
                  key={g.id}
                  style={{
                    border: marcado ? '2px solid #0f766e' : '1px solid var(--border, #e2e8f0)',
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#fff',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => (soloTienda ? setSelTienda(g.id) : toggleGrupo(g.id))}
                    aria-expanded={marcado}
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      gap: '0.65rem',
                      padding: '0.75rem 0.9rem',
                      border: 'none',
                      background: marcado ? 'rgba(15,118,110,0.08)' : '#fff',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'inherit',
                    }}
                  >
                    {!soloTienda && (
                      <span
                        aria-hidden
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          border: marcado ? '6px solid #0f766e' : '2px solid #94a3b8',
                          boxSizing: 'border-box',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span style={{ fontWeight: 700, width: 16, flexShrink: 0 }}>{marcado ? '▾' : '▸'}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: 'block' }}>{g.label}</strong>
                      <span className="muted" style={{ fontSize: '0.78rem' }}>
                        {g.items.length} folio{g.items.length === 1 ? '' : 's'}
                        {soloTienda ? ' · esta sucursal' : ' · solo esta tienda'}
                      </span>
                    </span>
                    <strong style={{ color: '#b45309', flexShrink: 0, fontSize: '1.05rem' }}>{fmtMonto(g.total)}</strong>
                  </button>
                  {marcado && (
                    <div style={{ padding: '0.15rem 0.65rem 0.75rem', borderTop: '1px solid var(--border, #e2e8f0)' }}>
                      <table className="consultas-table" style={{ width: '100%', fontSize: '0.84rem' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left' }}>Folio</th>
                            <th style={{ textAlign: 'left' }}>Fecha</th>
                            <th style={{ textAlign: 'right' }}>Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map((m) => (
                            <tr key={m.id}>
                              <td>
                                <strong>{m.folio_venta || m.venta_id || '—'}</strong>
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
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div>
            <div className="muted" style={{ fontSize: '0.75rem' }}>Tienda seleccionada</div>
            <strong>{grupoSel ? `${grupoSel.id} · ${fmtMonto(totalSel)}` : 'Ninguna'}</strong>
          </div>
          <label style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Monto a pagar
            <input
              type="number"
              className="input"
              min="0"
              step="0.01"
              max={totalSel || undefined}
              value={montoPagarStr}
              disabled={!grupoSel || guardando}
              onChange={(e) => setMontoPagarStr(e.target.value)}
              style={{ width: 140 }}
              placeholder="0.00"
            />
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!grupoSel || guardando || !(totalSel > 0)}
            onClick={usarTodo}
            title="Usar el total acumulado de esta tienda"
          >
            Usar todo
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={guardando || eliminando || !grupoSel || !(montoPagarNum > 0)}
            onClick={() => void pagar()}
          >
            {guardando ? 'Pagando…' : 'Pagar tienda'}
          </button>
          {puedeEliminar && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: '#b91c1c', borderColor: '#fecaca' }}
              disabled={guardando || eliminando || !grupoSel}
              onClick={() => void eliminarSeleccion()}
              title="Solo administrador · corrige créditos erróneos"
            >
              {eliminando ? 'Eliminando…' : 'Eliminar créditos'}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={cerrarSesionCajero} disabled={guardando || eliminando}>
            Cerrar sesión cajero
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void cargar({ conSyncFondo: true })}
            disabled={guardando || eliminando || cargando || syncBg}
          >
            Actualizar
          </button>
        </div>
        {grupoSel && montoPagarNum > 0 && montoPagarNum < totalSel - 0.001 && (
          <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.8rem' }}>
            Pago parcial en {grupoSel.id}: quedan {fmtMonto(Math.max(0, totalSel - montoPagarNum))} pendientes en esa tienda.
          </p>
        )}
      </div>
    </div>
  );
}
