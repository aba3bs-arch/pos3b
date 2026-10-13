import React, { useCallback, useEffect, useMemo, useState } from 'react';
import InputPin from '../components/InputPin.jsx';
import {
  eliminarCreditosPendientesRuta,
  listarCreditosPendientesRuta,
  pagarCreditosRutaConPin,
  puedeEliminarCreditosRuta,
  restaurarCreditosRecoleccionACxc,
  verificarPinCajero,
} from '../lib/rutaCxc.js';
import { fmtMonto } from '../lib/consultasUi.js';
import {
  esCentralAdmin,
  esSucursalRuta,
  etiquetaTienda,
  normalizarCodigoTienda,
} from '../constants/sucursales.js';

/**
 * Contabilidad → Cobranza / Venta en Ruta → Créditos por pagar.
 * Incluye créditos de venta en ruta y de Recolecciones (Entrega Crédito).
 * - PIN del cajero al abrir el módulo.
 * - Una fila / cuenta por tienda (nunca mezclar sucursales).
 * - Solo se selecciona y paga UNA tienda a la vez.
 * - Se puede pagar un monto parcial (liquidez para otros proveedores).
 * - Administrador puede eliminar créditos por error.
 * - Al pagar: gasto abarrotes + efectivo a tránsito (recolección reusa la ficha).
 */
export default function CobranzaRuta({ supabase, user, sucursal, embedded = false, titulo }) {
  const [aviso, setAviso] = useState('');
  const [rows, setRows] = useState([]);
  const [selTienda, setSelTienda] = useState(''); // una sola tienda
  const [pinEntrada, setPinEntrada] = useState('');
  const [cajero, setCajero] = useState(null);
  const [abriendo, setAbriendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [montoPagarStr, setMontoPagarStr] = useState('');
  const [ultimoRestore, setUltimoRestore] = useState(null);
  const puedeEliminar = puedeEliminarCreditosRuta(user?.rol);

  const sucActiva = sucursal || user?.sucursal_id || '';
  // Venta en Ruta / MAIN / RUTA: ver créditos de TODAS las tiendas, agrupados.
  const verTodasLasTiendas = embedded
    || esCentralAdmin(sucActiva)
    || esSucursalRuta(sucActiva)
    || !sucActiva
    || String(sucActiva).toUpperCase() === 'MAIN';

  const mensajeSync = (sync) => {
    if (!sync) return [];
    const msgs = [];
    if (sync.creados > 0) msgs.push(`Restaurados/creados ${sync.creados}`);
    if (sync.reabiertos > 0) msgs.push(`Reabiertos ${sync.reabiertos} (estaban marcados pagados por error)`);
    if (sync.corregidos > 0) msgs.push(`Reasignados ${sync.corregidos} a su tienda`);
    if (sync.revisados != null) msgs.push(`${sync.revisados} folio(s) Por Cobrar en Recolecciones`);
    if (sync.porTienda?.length) {
      msgs.push(
        sync.porTienda.map((t) => `${t.tienda}: ${t.count}`).join(', '),
      );
    }
    if (sync.error) msgs.push(sync.error);
    return msgs;
  };

  const cargar = useCallback(async () => {
    const r = await listarCreditosPendientesRuta(supabase, {
      sucursalId: verTodasLasTiendas ? undefined : sucActiva,
      limit: 1000,
    });
    const msgs = [];
    if (r.aviso) msgs.push(r.aviso);
    if (r.error) msgs.push(r.error);
    msgs.push(...mensajeSync(r.sync));
    setAviso(msgs.filter(Boolean).join(' · '));
    setUltimoRestore(r.sync || null);
    setRows(r.data || []);
    setSelTienda('');
    setMontoPagarStr('');
  }, [supabase, sucActiva, verTodasLasTiendas]);

  const restaurarDesdeRecolecciones = async () => {
    if (!supabase) return;
    if (!confirm(
      '¿Restaurar créditos desde Recolecciones?\n\n'
      + 'Se buscan todos los folios «Por Cobrar / Entrega Crédito» de Fusión, 3B2…3B10 '
      + 'y se recrean o reabren en Créditos por pagar, cada uno en su tienda.\n'
      + 'No borra nada de Recolecciones.',
    )) return;
    setRestaurando(true);
    try {
      const r = await restaurarCreditosRecoleccionACxc(supabase, { limit: 1000 });
      setUltimoRestore(r);
      if (!r.ok) return alert(r.error || 'No se pudo restaurar.');
      const detalleTiendas = (r.porTienda || [])
        .map((t) => `${t.tienda}: ${t.count} (${fmtMonto(t.monto)})`)
        .join('\n');
      alert(
        `✅ Restauración terminada\n\n`
        + `Folios en Recolecciones: ${r.revisados || 0}\n`
        + `Creados: ${r.creados || 0}\n`
        + `Reabiertos: ${r.reabiertos || 0}\n`
        + `Ya estaban: ${r.omitidos || 0}\n`
        + (detalleTiendas ? `\nPor tienda:\n${detalleTiendas}` : '\n⚠ No hay folios Por Cobrar en Recolecciones.'),
      );
      await cargar();
    } finally {
      setRestaurando(false);
    }
  };

  useEffect(() => {
    if (!cajero) return;
    void cargar();
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
      .map((g) => ({ ...g, total: Math.round(g.total * 100) / 100 }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id), 'es'));
  }, [rows]);

  const toggleGrupo = (grupoId) => {
    // Una sola tienda a la vez (no mezclar cuentas de varias sucursales).
    setSelTienda((prev) => (prev === grupoId ? '' : grupoId));
  };

  const grupoSel = useMemo(
    () => grupos.find((g) => g.id === selTienda) || null,
    [grupos, selTienda],
  );
  const totalSel = grupoSel?.total || 0;

  const idsSeleccionados = useMemo(() => {
    if (!grupoSel) return [];
    return grupoSel.items.map((r) => String(r.id));
  }, [grupoSel]);

  // Al cambiar selección, proponer el total de ESA tienda.
  useEffect(() => {
    if (!grupoSel) {
      setMontoPagarStr('');
      return;
    }
    setMontoPagarStr(String(totalSel.toFixed(2)));
  }, [grupoSel, totalSel]);

  const montoPagarNum = useMemo(() => {
    const n = Number(String(montoPagarStr).replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }, [montoPagarStr]);

  const abrirConPin = async () => {
    if (!String(pinEntrada).trim()) return alert('Ingresa el PIN del cajero.');
    setAbriendo(true);
    // PIN válido en la tienda activa o en MAIN (admin).
    const auth = await verificarPinCajero(supabase, pinEntrada, sucActiva || 'MAIN');
    setAbriendo(false);
    if (!auth.ok) return alert(auth.error);
    setCajero(auth.user);
    setPinEntrada('');
    setAviso('');
  };

  const cerrarSesionCajero = () => {
    setCajero(null);
    setRows([]);
    setSelTienda('');
    setMontoPagarStr('');
  };

  const usarTodo = () => {
    if (totalSel > 0) setMontoPagarStr(String(totalSel.toFixed(2)));
  };

  const eliminarSeleccion = async () => {
    if (!puedeEliminar) return alert('Solo un administrador puede eliminar créditos.');
    if (!grupoSel || !idsSeleccionados.length) return alert('Selecciona una tienda.');
    const nCargos = idsSeleccionados.length;
    if (!confirm(
      `¿ELIMINAR ${nCargos} crédito(s) de ${grupoSel.label} por ${fmtMonto(totalSel)}?\n\n`
      + 'Solo para corregir errores. Esta acción no se puede deshacer.\n'
      + 'No genera gasto ni tránsito.',
    )) return;
    setEliminando(true);
    const r = await eliminarCreditosPendientesRuta(supabase, {
      movimientoIds: idsSeleccionados,
      rolActor: user?.rol,
      actorNombre: user?.nombre || null,
    });
    setEliminando(false);
    if (!r.ok) return alert(r.error);
    alert(`Eliminados ${r.eliminados} crédito(s) · ${fmtMonto(r.monto)} (admin: ${r.actor}).`);
    await cargar();
  };

  const pagar = async () => {
    if (!cajero) return alert('Abre el módulo con PIN de cajero.');
    if (!grupoSel || !idsSeleccionados.length) return alert('Selecciona una tienda.');
    if (!(montoPagarNum > 0)) return alert('Ingresa el monto a pagar.');
    if (montoPagarNum > totalSel + 0.001) {
      return alert(`El monto no puede superar el acumulado de la tienda (${fmtMonto(totalSel)}).`);
    }
    const esParcial = montoPagarNum < totalSel - 0.001;
    if (!confirm(
      `¿Pagar ${fmtMonto(montoPagarNum)} de ${grupoSel.label}?\n`
      + `Acumulado tienda: ${fmtMonto(totalSel)}\n`
      + `Cajero: ${cajero.nombre || '—'}\n`
      + (esParcial
        ? 'Pago parcial: el resto del crédito de esta tienda queda pendiente.\n'
        : 'Se liquida el total de esta tienda.\n')
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
    await cargar();
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
            Cada tienda es una cuenta aparte: eliges una y pagas su acumulado.
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
          {' '}Cada <strong>tienda</strong> es su propia cuenta (Fusión, 3B2, 3B3…).
          {' '}Selecciona <strong>una tienda</strong> y paga su acumulado (parcial permitido).
          {' '}Detalle de folios en <strong>Consultas → Créditos por tienda</strong>.
          {puedeEliminar ? ' · Admin: puedes eliminar créditos por error.' : ''}
        </p>
      </div>
      {aviso && <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)' }}>{aviso}</div>}

      <div className="card" style={{ borderTop: '4px solid #0f766e' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={restaurando || guardando}
            onClick={() => void restaurarDesdeRecolecciones()}
          >
            {restaurando ? 'Restaurando…' : 'Restaurar créditos de Recolecciones'}
          </button>
          <span className="muted" style={{ fontSize: '0.78rem' }}>
            Trae folios Por Cobrar de Fusión / 3B2…3B10 a esta pantalla (por tienda).
          </span>
        </div>
        {grupos.length === 0 ? (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>
              No hay créditos pendientes en CxC.
              {ultimoRestore?.revisados === 0
                ? ' Tampoco hay folios «Por Cobrar» en Recolecciones (pueden haberse cobrado ya o no existir).'
                : ' Usa «Restaurar créditos de Recolecciones» para recuperarlos por tienda.'}
            </p>
            {ultimoRestore?.porTienda?.length > 0 && (
              <p className="muted" style={{ fontSize: '0.8rem' }}>
                Última restauración:{' '}
                {ultimoRestore.porTienda.map((t) => `${t.tienda} (${t.count})`).join(' · ')}
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
              {grupos.length} tienda{grupos.length === 1 ? '' : 's'} con crédito · elige una para pagar
            </p>
            {grupos.map((g) => {
              const marcado = selTienda === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGrupo(g.id)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    gap: '0.65rem',
                    padding: '0.75rem 0.9rem',
                    border: marcado ? '2px solid #0f766e' : '1px solid var(--border, #e2e8f0)',
                    borderRadius: 10,
                    background: marcado ? 'rgba(15,118,110,0.08)' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'inherit',
                  }}
                >
                  <input
                    type="radio"
                    name="tienda-credito"
                    checked={marcado}
                    readOnly
                    tabIndex={-1}
                    style={{ pointerEvents: 'none' }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block' }}>{g.label}</strong>
                    <span className="muted" style={{ fontSize: '0.78rem' }}>
                      {g.items.length} crédito{g.items.length === 1 ? '' : 's'} · solo esta tienda
                    </span>
                  </span>
                  <strong style={{ color: '#b45309', flexShrink: 0, fontSize: '1.05rem' }}>{fmtMonto(g.total)}</strong>
                </button>
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
          <button type="button" className="btn btn-ghost" onClick={() => void cargar()} disabled={guardando || eliminando}>
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
