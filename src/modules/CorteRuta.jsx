import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listarCargasRuta, listarVentasRuta } from '../lib/ventaEnRuta.js';
import {
  guardarCorteRutaLocal,
  intentarGuardarCorteRutaNube,
  listarCortesRutaLocal,
  resumirVentasRutaParaCorte,
} from '../lib/corteRuta.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { esRolRepartidor } from '../lib/roles.js';
import { imprimirCorte } from '../lib/impresion.js';

const COLOR = '#0f766e';

export default function CorteRuta({ supabase, user, setAviso }) {
  const [cargas, setCargas] = useState([]);
  const [cargaId, setCargaId] = useState('');
  const [ventas, setVentas] = useState([]);
  const [contado, setContado] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [msg, setMsg] = useState('');

  const esRep = esRolRepartidor(user?.rol);
  const carga = useMemo(() => cargas.find((c) => String(c.id) === String(cargaId)), [cargas, cargaId]);

  const cargarCargas = useCallback(async () => {
    const filtros = {};
    if (esRep && user?.id) filtros.vendedorId = user.id;
    const r = await listarCargasRuta(supabase, { ...filtros, limit: 60 });
    if (r.aviso) setAviso?.(r.aviso);
    setCargas(r.data || []);
  }, [supabase, esRep, user?.id, setAviso]);

  useEffect(() => {
    void cargarCargas();
    setHistorial(listarCortesRutaLocal({ vendedorId: esRep ? user?.id : undefined }));
  }, [cargarCargas, esRep, user?.id]);

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

  const guardar = async () => {
    if (!cargaId) return alert('Elige una carga.');
    if (!ventas.length) return alert('No hay ventas en esta carga.');
    if (contado === '' || contado == null) return alert('Indica el efectivo contado.');
    if (!confirm(`¿Guardar corte de ruta?\nEsperado ${fmtMonto(resumen.efectivoEsperado)} · Contado ${fmtMonto(contado)}`)) return;
    setGuardando(true);
    setMsg('');
    const row = {
      carga_id: cargaId,
      carga_folio: carga?.folio || null,
      vendedor_id: carga?.vendedor_id || user?.id || null,
      vendedor_nombre: carga?.vendedor_nombre || user?.nombre || null,
      fecha: new Date().toISOString().slice(0, 10),
      tickets: resumen.tickets,
      total_ventas: resumen.total,
      efectivo_esperado: resumen.efectivoEsperado,
      credito: resumen.credito,
      efectivo_contado: Number(contado),
      por_metodo: resumen.porMetodo,
      notas,
      usuario: user?.nombre || user?.email || null,
    };
    const local = guardarCorteRutaLocal(row);
    const nube = await intentarGuardarCorteRutaNube(supabase, local.corte);
    setGuardando(false);
    if (nube.aviso) setAviso?.(nube.aviso);
    if (!nube.ok && nube.error && !nube.localOnly) {
      setMsg(nube.error);
      return;
    }
    setMsg('Corte guardado.');
    setHistorial(listarCortesRutaLocal({ vendedorId: esRep ? user?.id : undefined }));
    try {
      imprimirCorte({
        fecha: local.corte.fecha,
        sucursal: `RUTA · ${local.corte.carga_folio || ''}`,
        usuario: local.corte.usuario,
        turno: local.corte.vendedor_nombre,
        tickets: local.corte.tickets,
        total: local.corte.total_ventas,
        efectivoEsperado: local.corte.efectivo_esperado,
        efectivoContado: local.corte.efectivo_contado,
        diferencia: local.corte.diferencia,
        detalleMetodos: [
          { metodo: 'efectivo', total: resumen.porMetodo.efectivo },
          { metodo: 'credito', total: resumen.porMetodo.credito },
          { metodo: 'mixto', total: resumen.porMetodo.mixto },
        ].filter((x) => x.total > 0),
        notas: local.corte.notas,
      });
    } catch {
      /* print optional */
    }
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Corte de caja · Venta en Ruta</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
        Arqueo de las ventas del camión (efectivo en tránsito + crédito). No reemplaza el corte de tienda.
      </p>

      <label className="muted" style={{ display: 'block', fontSize: '0.8rem', maxWidth: 420 }}>
        Carga
        <select className="input" style={{ marginTop: '0.35rem' }} value={cargaId} onChange={(e) => setCargaId(e.target.value)}>
          <option value="">— Elige carga —</option>
          {cargas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.folio} · {c.estado}{c.vendedor_nombre ? ` · ${c.vendedor_nombre}` : ''}
            </option>
          ))}
        </select>
      </label>

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
            {guardando ? 'Guardando…' : 'Guardar corte de ruta'}
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
              <li key={c.id}>
                {c.fecha} · {c.carga_folio || 'sin folio'} · esp {fmtMonto(c.efectivo_esperado)} · cont {c.efectivo_contado == null ? '—' : fmtMonto(c.efectivo_contado)}
                {c.diferencia != null ? ` · dif ${fmtMonto(c.diferencia)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
