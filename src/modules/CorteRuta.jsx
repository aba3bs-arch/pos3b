import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listarCargasRuta,
  listarVentasRuta,
  listarVendedoresSesionRuta,
} from '../lib/ventaEnRuta.js';
import {
  construirTicketCorteRuta,
  guardarCorteRutaLocal,
  intentarGuardarCorteRutaNube,
  listarCortesRutaLocal,
  resumirVentasRutaParaCorte,
} from '../lib/corteRuta.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { imprimirCorte } from '../lib/impresion.js';

const COLOR = '#0f766e';

function imprimirTicketCorteRuta(corte, extras = {}) {
  const payload = construirTicketCorteRuta(corte, extras);
  return imprimirCorte(payload, { forzar: true, titulo: 'Corte de caja · Ruta' });
}

/**
 * Corte de caja de ruta: lo autentica un administrador/gerente
 * y elige de qué vendedor (Repartidor / Panel RT) cortar.
 */
export default function CorteRuta({ supabase, user, adminSesion, vendedorSesion, setAviso }) {
  const [vendedores, setVendedores] = useState([]);
  const [vendedorId, setVendedorId] = useState(() => (
    vendedorSesion?.id ? String(vendedorSesion.id) : ''
  ));
  const [cargas, setCargas] = useState([]);
  const [cargaId, setCargaId] = useState('');
  const [ventas, setVentas] = useState([]);
  const [contado, setContado] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [msg, setMsg] = useState('');
  const [cargandoVend, setCargandoVend] = useState(true);

  const vendedorSel = useMemo(
    () => vendedores.find((v) => String(v.id) === String(vendedorId)) || null,
    [vendedores, vendedorId],
  );

  const filtroVendedorId = useMemo(() => {
    if (!vendedorSel) return vendedorId || null;
    return vendedorSel.usuario_id || (String(vendedorSel.id).startsWith('rt:') ? null : vendedorSel.id);
  }, [vendedorSel, vendedorId]);

  const filtroVendedorNombre = vendedorSel?.nombre || vendedorSesion?.nombre || null;

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setCargandoVend(true);
      const r = await listarVendedoresSesionRuta(supabase);
      if (cancel) return;
      if (r.error) setAviso?.(r.error);
      const list = r.data || [];
      setVendedores(list);
      if (!vendedorId && list.length === 1) setVendedorId(String(list[0].id));
      setCargandoVend(false);
    })();
    return () => { cancel = true; };
  }, [supabase, setAviso]); // eslint-disable-line react-hooks/exhaustive-deps -- solo al montar

  const carga = useMemo(
    () => cargas.find((c) => String(c.id) === String(cargaId)),
    [cargas, cargaId],
  );

  const cargarCargas = useCallback(async () => {
    if (!vendedorId) {
      setCargas([]);
      setCargaId('');
      return;
    }
    const filtros = { limit: 60 };
    if (filtroVendedorId) filtros.vendedorId = filtroVendedorId;
    if (filtroVendedorNombre && !filtroVendedorId) filtros.vendedorNombre = filtroVendedorNombre;
    const r = await listarCargasRuta(supabase, filtros);
    if (r.aviso) setAviso?.(r.aviso);
    const data = r.data || [];
    // Si el vendedor es solo RT (sin usuario), filtrar por nombre en cliente
    const filtradas = filtroVendedorId
      ? data
      : data.filter((c) => {
        const nom = String(c.vendedor_nombre || '').trim().toLowerCase();
        return nom && nom === String(filtroVendedorNombre || '').trim().toLowerCase();
      });
    setCargas(filtradas);
    setCargaId('');
  }, [supabase, vendedorId, filtroVendedorId, filtroVendedorNombre, setAviso]);

  useEffect(() => {
    void cargarCargas();
    setHistorial(listarCortesRutaLocal({
      vendedorId: filtroVendedorId || undefined,
    }));
  }, [cargarCargas, filtroVendedorId]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      if (!cargaId) {
        setVentas([]);
        return;
      }
      const r = await listarVentasRuta(supabase, { cargaId, limit: 300 });
      if (cancel) return;
      if (r.aviso) setAviso?.(r.aviso);
      setVentas(r.data || []);
    })();
    return () => { cancel = true; };
  }, [supabase, cargaId, setAviso]);

  const resumen = useMemo(() => resumirVentasRutaParaCorte(ventas), [ventas]);
  const dif = contado === '' ? null : Math.round((Number(contado) - resumen.efectivoEsperado) * 100) / 100;

  const nombreCorte = carga?.vendedor_nombre || filtroVendedorNombre || '—';
  const adminNombre = adminSesion?.nombre || user?.nombre || user?.email || null;

  const guardar = async () => {
    if (!cargaId) return alert('Elige una carga.');
    if (!ventas.length) return alert('No hay ventas en esta carga.');
    if (contado === '' || contado == null) return alert('Indica el efectivo contado.');
    if (!confirm(
      `¿Guardar e imprimir corte de ruta?\n`
      + `Vendedor: ${nombreCorte}\n`
      + `Autenticó: ${adminNombre || '—'}\n`
      + `Efectivo esperado ${fmtMonto(resumen.efectivoEsperado)} · Contado ${fmtMonto(contado)}\n`
      + `Crédito ${fmtMonto(resumen.credito)}`,
    )) return;
    setGuardando(true);
    setMsg('');
    const row = {
      carga_id: cargaId,
      carga_folio: carga?.folio || null,
      vendedor_id: carga?.vendedor_id || filtroVendedorId || null,
      vendedor_nombre: carga?.vendedor_nombre || filtroVendedorNombre || null,
      fecha: new Date().toISOString().slice(0, 10),
      tickets: resumen.tickets,
      total_ventas: resumen.total,
      efectivo_esperado: resumen.efectivoEsperado,
      credito: resumen.credito,
      efectivo_contado: Number(contado),
      por_metodo: resumen.porMetodo,
      notas,
      usuario: adminNombre,
      admin_id: adminSesion?.id || user?.id || null,
      admin_nombre: adminNombre,
    };
    const local = guardarCorteRutaLocal(row);
    const nube = await intentarGuardarCorteRutaNube(supabase, local.corte);
    setGuardando(false);
    if (nube.aviso) setAviso?.(nube.aviso);
    if (!nube.ok && nube.error && !nube.localOnly) {
      setMsg(nube.error);
      return;
    }
    setMsg('Corte guardado · imprimiendo ticket…');
    setHistorial(listarCortesRutaLocal({
      vendedorId: filtroVendedorId || undefined,
    }));
    try {
      imprimirTicketCorteRuta(local.corte, {
        porMetodo: resumen.porMetodo,
        adminNombre,
      });
      setMsg('Corte guardado e impreso.');
    } catch (e) {
      setMsg(`Corte guardado. No se pudo imprimir: ${e?.message || e}`);
    }
    setContado('');
    setNotas('');
  };

  const reimprimir = (corte) => {
    try {
      imprimirTicketCorteRuta(corte);
    } catch (e) {
      alert(e?.message || 'No se pudo imprimir.');
    }
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Corte de caja · Venta en Ruta</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
        Arqueo de las ventas del camión (efectivo + crédito). Lo autentica un administrador;
        elige de qué vendedor cortar. Al guardar se imprime el ticket.
      </p>

      {adminSesion && (
        <div
          style={{
            marginBottom: '0.85rem',
            padding: '0.55rem 0.75rem',
            background: '#1d4ed812',
            borderRadius: 6,
            fontSize: '0.9rem',
          }}
        >
          Autenticado por: <strong>{adminSesion.nombre}</strong>
          <span className="muted"> · {adminSesion.rol || 'Admin'}</span>
        </div>
      )}

      <label className="muted" style={{ display: 'block', fontSize: '0.8rem', maxWidth: 420, marginBottom: '0.75rem' }}>
        Vendedor a cortar
        <select
          className="input"
          style={{ marginTop: '0.35rem' }}
          value={vendedorId}
          onChange={(e) => {
            setVendedorId(e.target.value);
            setCargaId('');
            setContado('');
            setMsg('');
          }}
          disabled={cargandoVend}
        >
          <option value="">— Elige vendedor —</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>{v.etiqueta || v.nombre || v.id}</option>
          ))}
        </select>
      </label>

      {cargandoVend && <p className="muted">Cargando vendedores…</p>}

      {vendedorId && (
        <div
          style={{
            marginBottom: '0.85rem',
            padding: '0.55rem 0.75rem',
            background: `${COLOR}12`,
            borderRadius: 6,
            fontSize: '0.9rem',
          }}
        >
          Corte de: <strong>{nombreCorte}</strong>
          {carga?.folio ? <span className="muted"> · carga {carga.folio}</span> : null}
        </div>
      )}

      {vendedorId && (
        <label className="muted" style={{ display: 'block', fontSize: '0.8rem', maxWidth: 420 }}>
          Carga
          <select
            className="input"
            style={{ marginTop: '0.35rem' }}
            value={cargaId}
            onChange={(e) => setCargaId(e.target.value)}
          >
            <option value="">— Elige carga —</option>
            {cargas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.folio} · {c.estado}{c.vendedor_nombre ? ` · ${c.vendedor_nombre}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      {vendedorId && !cargas.length && !cargandoVend && (
        <p className="muted" style={{ marginTop: '0.75rem' }}>No hay cargas para este vendedor.</p>
      )}

      {cargaId && (
        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <div className="card" style={{ margin: 0, padding: '0.75rem' }}>
            <div className="muted" style={{ fontSize: '0.75rem' }}>Tickets</div>
            <strong style={{ fontSize: '1.25rem' }}>{resumen.tickets}</strong>
          </div>
          <div className="card" style={{ margin: 0, padding: '0.75rem' }}>
            <div className="muted" style={{ fontSize: '0.75rem' }}>Total ventas</div>
            <strong style={{ fontSize: '1.25rem' }}>{fmtMonto(resumen.total)}</strong>
          </div>
          <div className="card" style={{ margin: 0, padding: '0.75rem' }}>
            <div className="muted" style={{ fontSize: '0.75rem' }}>Efectivo esperado</div>
            <strong style={{ fontSize: '1.25rem', color: COLOR }}>{fmtMonto(resumen.efectivoEsperado)}</strong>
          </div>
          <div className="card" style={{ margin: 0, padding: '0.75rem' }}>
            <div className="muted" style={{ fontSize: '0.75rem' }}>Crédito</div>
            <strong style={{ fontSize: '1.25rem' }}>{fmtMonto(resumen.credito)}</strong>
          </div>
        </div>
      )}

      {cargaId && (
        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.65rem', maxWidth: 480 }}>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Efectivo contado
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={contado}
              onChange={(e) => setContado(e.target.value)}
              style={{ marginTop: '0.35rem' }}
              placeholder={String(resumen.efectivoEsperado.toFixed(2))}
            />
          </label>
          {dif != null && (
            <p style={{ margin: 0, fontWeight: 700, color: dif === 0 ? COLOR : dif < 0 ? 'var(--brand-red, #b91c1c)' : 'var(--brand-gold, #b45309)' }}>
              Diferencia: {fmtMonto(dif)}
            </p>
          )}
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Notas
            <textarea className="input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} style={{ marginTop: '0.35rem' }} />
          </label>
          <button type="button" className="btn btn-primary" disabled={guardando || !ventas.length} onClick={() => void guardar()}>
            {guardando ? 'Guardando…' : 'Guardar e imprimir corte'}
          </button>
          {msg && <p className="muted" style={{ margin: 0 }}>{msg}</p>}
        </div>
      )}

      {cargaId && ventas.length > 0 && (
        <div className="table-wrap" style={{ marginTop: '1.25rem' }}>
          <table className="consultas-table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Cliente</th>
                <th>Pago</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {ventas.slice(0, 80).map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.folio}</strong></td>
                  <td>{v.cliente_nombre || v.cliente_id}</td>
                  <td>{v.metodo_pago}</td>
                  <td>{fmtMonto(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {historial.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h4 style={{ margin: '0 0 0.5rem', color: COLOR }}>Cortes recientes (este equipo)</h4>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
            {historial.slice(0, 12).map((c) => (
              <li key={c.id} style={{ marginBottom: '0.35rem' }}>
                {c.fecha} · <strong>{c.vendedor_nombre || '—'}</strong> · {c.carga_folio || 'sin folio'}
                {' '}· esp {fmtMonto(c.efectivo_esperado)} · cont {c.efectivo_contado == null ? '—' : fmtMonto(c.efectivo_contado)}
                {c.diferencia != null ? ` · dif ${fmtMonto(c.diferencia)}` : ''}
                {c.admin_nombre ? ` · por ${c.admin_nombre}` : ''}
                {' '}
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: '0.75rem', padding: '0.1rem 0.35rem' }}
                  onClick={() => reimprimir(c)}
                >
                  Reimprimir
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
