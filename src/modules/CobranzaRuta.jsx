import React, { useCallback, useEffect, useMemo, useState } from 'react';
import InputPin from '../components/InputPin.jsx';
import {
  listarCreditosPendientesRuta,
  pagarCreditosRutaConPin,
  verificarPinCajero,
} from '../lib/rutaCxc.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { esCentralAdmin, etiquetaTienda } from '../constants/sucursales.js';

/**
 * Contabilidad → Cobranza / Venta en Ruta → Créditos por pagar.
 * - PIN del cajero al abrir el módulo.
 * - Solo total acumulado por tienda (sin folios); el detalle está en Consultas.
 * - Al pagar: gasto abarrotes «credito liquidado» + efectivo a tránsito.
 */
export default function CobranzaRuta({ supabase, user, sucursal, embedded = false, titulo }) {
  const [aviso, setAviso] = useState('');
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(() => new Set());
  const [pinEntrada, setPinEntrada] = useState('');
  const [cajero, setCajero] = useState(null);
  const [abriendo, setAbriendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const sucActiva = sucursal || user?.sucursal_id || '';
  const vistaCentral = esCentralAdmin(sucActiva) || !sucActiva || String(sucActiva).toUpperCase() === 'MAIN';

  const cargar = useCallback(async () => {
    const r = await listarCreditosPendientesRuta(supabase, {
      sucursalId: vistaCentral ? undefined : sucActiva,
    });
    if (r.aviso) setAviso(r.aviso);
    if (r.error) setAviso(r.error);
    setRows(r.data || []);
    setSel(new Set());
  }, [supabase, sucActiva, vistaCentral]);

  useEffect(() => {
    if (!cajero) return;
    void cargar();
  }, [cargar, cajero]);

  const grupos = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const esSuc = String(r.cliente_tipo || 'sucursal') === 'sucursal';
      const id = esSuc
        ? String(r.cliente_id || r.cliente_nombre || '—').toUpperCase()
        : `ext:${r.cliente_id || r.cliente_nombre || '—'}`;
      const label = esSuc
        ? etiquetaTienda(r.cliente_id) || r.cliente_nombre || id
        : (r.cliente_nombre || 'Cliente externo');
      if (!map.has(id)) {
        map.set(id, { id, label, items: [], total: 0 });
      }
      const g = map.get(id);
      g.items.push(r);
      g.total += Number(r.monto) || 0;
    }
    return [...map.values()].sort((a, b) => String(a.label).localeCompare(String(b.label), 'es'));
  }, [rows]);

  const toggleGrupo = (grupoId) => {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(grupoId)) next.delete(grupoId);
      else next.add(grupoId);
      return next;
    });
  };

  const totalSel = useMemo(() => {
    let t = 0;
    for (const g of grupos) {
      if (sel.has(g.id)) t += g.total;
    }
    return t;
  }, [grupos, sel]);

  const idsSeleccionados = useMemo(() => {
    const ids = [];
    for (const g of grupos) {
      if (!sel.has(g.id)) continue;
      for (const r of g.items) ids.push(String(r.id));
    }
    return ids;
  }, [grupos, sel]);

  const abrirConPin = async () => {
    if (!String(pinEntrada).trim()) return alert('Ingresa el PIN del cajero.');
    setAbriendo(true);
    const auth = await verificarPinCajero(supabase, pinEntrada, sucActiva);
    setAbriendo(false);
    if (!auth.ok) return alert(auth.error);
    setCajero(auth.user);
    setPinEntrada('');
    setAviso('');
  };

  const cerrarSesionCajero = () => {
    setCajero(null);
    setRows([]);
    setSel(new Set());
  };

  const pagar = async () => {
    if (!cajero) return alert('Abre el módulo con PIN de cajero.');
    if (!idsSeleccionados.length) return alert('Selecciona al menos una tienda.');
    if (!confirm(
      `¿Pagar ${sel.size} tienda(s) por ${fmtMonto(totalSel)}?\n`
      + `Cajero: ${cajero.nombre || '—'}\n`
      + 'Se cargará gasto «credito liquidado» al corte de abarrotes y el efectivo irá a tránsito.',
    )) return;
    setGuardando(true);
    const r = await pagarCreditosRutaConPin(supabase, {
      movimientoIds: idsSeleccionados,
      sucursal: sucActiva,
      cajeroUser: cajero,
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    alert(`Pagado por ${r.cajero}. ${r.pagados?.length || 0} crédito(s).`);
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
            Ingresa el <strong>PIN del cajero</strong> para abrir créditos por pagar.
            Luego verás el total acumulado por tienda (sin folios).
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
          {' '}Solo total acumulado por tienda (sin folios).
          {' '}Detalle de folios en <strong>Consultas → Créditos por tienda</strong>.
          {' '}Al pagar: gasto abarrotes «credito liquidado» + efectivo en tránsito.
        </p>
      </div>
      {aviso && <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)' }}>{aviso}</div>}

      <div className="card" style={{ borderTop: '4px solid #0f766e' }}>
        {grupos.length === 0 ? (
          <p className="muted">No hay créditos pendientes.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {grupos.map((g) => {
              const marcado = sel.has(g.id);
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
                    type="checkbox"
                    checked={marcado}
                    readOnly
                    tabIndex={-1}
                    style={{ pointerEvents: 'none' }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block' }}>{g.label}</strong>
                    <span className="muted" style={{ fontSize: '0.78rem' }}>
                      {g.items.length} venta{g.items.length === 1 ? '' : 's'} a crédito · acumulado
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
            <div className="muted" style={{ fontSize: '0.75rem' }}>Seleccionados</div>
            <strong>{sel.size} tienda{sel.size === 1 ? '' : 's'} · {fmtMonto(totalSel)}</strong>
          </div>
          <button type="button" className="btn btn-primary" disabled={guardando || !sel.size} onClick={() => void pagar()}>
            {guardando ? 'Pagando…' : 'Pagar seleccionados'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={cerrarSesionCajero}>
            Cerrar sesión cajero
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void cargar()} disabled={guardando}>
            Actualizar
          </button>
        </div>
      </div>
    </div>
  );
}
