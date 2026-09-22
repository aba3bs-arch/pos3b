import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  claveRecolectorRVirtual,
  entregarCustodiaAAbb,
  esDestinoFinalRc,
  esUsuarioAmr,
  etiquetaDestinoFinalRc,
  etiquetaIeRc,
  etiquetaModuloRc,
  fmtMonto,
  generarGastoRecoleccionRcVirtual,
  imprimirTicketRcVirtual,
  eliminarRecoleccionRcVirtual,
  liquidarRecoleccionRcVirtual,
  listarBandejaRVirtual,
  normalizarAreaRc,
  recibirRecoleccionesRVirtual,
} from '../lib/rVirtual.js';
import { etiquetaCuentaRt } from '../lib/rtCuentas.js';
import {
  AVISO_FALTA_PAGARES,
  ETIQUETA_AREA_PAGARE,
  etiquetaEstadoPagare,
  etiquetaPagarALas3b,
  cancelarPagare,
  listarPagares,
  montoPendienteRecoleccion,
  nombreRecolectorPagare,
  pagareEnTransito,
  pagarePendienteRecoleccion,
  puedeEliminarPagare,
  puedeRecibirPagare,
  recibirPagare,
  saldoPagare,
} from '../lib/pagares.js';
import { imprimirPagare } from '../lib/impresionContabilidad.js';
import { etiquetaTienda } from '../constants/sucursales.js';

function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Chevron({ abierto }) {
  return (
    <span style={{ display: 'inline-block', transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
      ▸
    </span>
  );
}

function ResumenGastosLinea({ gastos }) {
  const list = Array.isArray(gastos) ? gastos : [];
  if (!list.length) return <span className="muted">—</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 220 }}>
      {list.map((g) => (
        <span key={g.id} style={{ fontSize: '0.78rem', lineHeight: 1.25 }}>
          −{fmtMonto(g.monto)}
          {g.comentario ? (
            <span className="muted"> · {g.comentario.replace(/\s*·\s*RC (Virtual|Abarrotes|Garage).*$/i, '').trim()}</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

export default function PanelRVirtual({ supabase, user, area = 'virtual', pestanaInicial } = {}) {
  const areaInicial = normalizarAreaRc(area);
  const esModoAbarrotes = areaInicial === 'abarrotes';
  const adminNombre = user?.nombre || '';
  const destinoLbl = etiquetaDestinoFinalRc(areaInicial);
  const ieLbl = etiquetaIeRc(areaInicial);
  const moduloLbl = etiquetaModuloRc(areaInicial);
  const adminEsDestinoFinal = esDestinoFinalRc(adminNombre, areaInicial);
  const adminEsAmr = esUsuarioAmr(adminNombre);
  const adminPuedeEliminar = puedeEliminarPagare(adminNombre);
  const adminPuedeRecibir = puedeRecibirPagare(adminNombre);
  const miClave = claveRecolectorRVirtual(adminNombre);
  const [pestana, setPestana] = useState(
    pestanaInicial
      || (areaInicial === 'garage'
        ? 'garage'
        : areaInicial === 'abarrotes'
          ? 'abarrotes'
          : 'recolecciones'),
  );
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [recolectoresVirtual, setRecolectoresVirtual] = useState([]);
  const [recolectoresGarage, setRecolectoresGarage] = useState([]);
  const [recolectoresAbarrotes, setRecolectoresAbarrotes] = useState([]);
  const [porEntregarVirtual, setPorEntregarVirtual] = useState([]);
  const [porEntregarGarage, setPorEntregarGarage] = useState([]);
  const [porEntregarAbarrotes, setPorEntregarAbarrotes] = useState([]);
  const [pagares, setPagares] = useState([]);
  const [abierto, setAbierto] = useState(null);
  const [abiertoAbb, setAbiertoAbb] = useState(null);
  const [trabajando, setTrabajando] = useState('');
  const [imprimiendo, setImprimiendo] = useState('');
  const [gastoModal, setGastoModal] = useState(null);
  const [gastoMonto, setGastoMonto] = useState('');
  const [gastoDesc, setGastoDesc] = useState('');

  const areaActiva = esModoAbarrotes
    ? 'abarrotes'
    : (pestana === 'garage' ? 'garage' : 'virtual');
  const recolectores = esModoAbarrotes
    ? recolectoresAbarrotes
    : (pestana === 'garage' ? recolectoresGarage : recolectoresVirtual);
  const porEntregarAbb = esModoAbarrotes
    ? porEntregarAbarrotes
    : (pestana === 'garage' ? porEntregarGarage : porEntregarVirtual);
  const esPestanaRecolecciones = esModoAbarrotes
    || pestana === 'recolecciones'
    || pestana === 'garage'
    || pestana === 'abarrotes';

  const pagaresPorSucursalAbiertos = useMemo(() => {
    if (esModoAbarrotes) return [];
    const relevantes = (pagares || []).filter((p) => {
      const est = String(p.estado || '').toLowerCase();
      if (est === 'cancelado' || est === 'en_transito' || est === 'recolectado') return false;
      return est === 'por_recolectar' || pagarePendienteRecoleccion(p) || est === 'abierto' || est === 'parcial';
    });
    const map = new Map();
    for (const p of relevantes) {
      const key = String(p.sucursal_id || 'SIN').toUpperCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pagares, esModoAbarrotes]);

  const pagaresEnTransitoPorRecolector = useMemo(() => {
    if (esModoAbarrotes) return [];
    const relevantes = (pagares || []).filter(pagareEnTransito);
    const map = new Map();
    for (const p of relevantes) {
      const key = nombreRecolectorPagare(p) || 'Sin recolector';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [pagares, esModoAbarrotes]);

  const totalPagaresTienda = pagaresPorSucursalAbiertos.reduce((n, [, list]) => n + list.length, 0);
  const totalPagaresTransito = pagaresEnTransitoPorRecolector.reduce((n, [, list]) => n + list.length, 0);
  const totalPagaresRc = totalPagaresTienda + totalPagaresTransito;

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    if (esModoAbarrotes) {
      const resA = await listarBandejaRVirtual(supabase, { area: 'abarrotes' });
      setRecolectoresAbarrotes(resA.recolectores || []);
      setPorEntregarAbarrotes(resA.porEntregarAbb || []);
      setError(resA.error || '');
      setCargando(false);
      return;
    }
    const [resV, resG, pagRes] = await Promise.all([
      listarBandejaRVirtual(supabase, { area: 'virtual' }),
      listarBandejaRVirtual(supabase, { area: 'garage' }),
      listarPagares(supabase, { limit: 200 }),
    ]);
    setRecolectoresVirtual(resV.recolectores || []);
    setRecolectoresGarage(resG.recolectores || []);
    setPorEntregarVirtual(resV.porEntregarAbb || []);
    setPorEntregarGarage(resG.porEntregarAbb || []);
    setPagares(pagRes.data || []);
    setError(resV.error || resG.error || (pagRes.faltaTabla ? AVISO_FALTA_PAGARES : '') || pagRes.error || '');
    setCargando(false);
  }, [supabase, esModoAbarrotes]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const recibir = async (grupo) => {
    const n = (grupo.items || []).filter((it) => it.receivable).length;
    if (!n) {
      setMsg(areaActiva === 'garage'
        ? 'No hay recolecciones de Garage pendientes de recibir a cuenta.'
        : areaActiva === 'abarrotes'
          ? 'No hay recolecciones de Abarrotes pendientes de recibir.'
          : 'No hay recolecciones de Virtual pendientes de recibir.');
      return;
    }
    if (!confirm(
      `¿Recibir ${n} recolección(es) de ${grupo.etiqueta} por ${fmtMonto(grupo.totalRecibir)}?\n\n`
      + `Se cargarán a tu cuenta (${adminNombre || 'admin'}).`
      + (adminEsDestinoFinal
        ? `\nComo ${destinoLbl}, quedan entregadas a ti`
          + (areaActiva === 'abarrotes' ? ` y pasan a ${ieLbl} (cuenta CEDIS).` : '.')
        : `\nDespués deberás entregarlas a ${destinoLbl}.`),
    )) return;
    setTrabajando(`rec-${grupo.clave}`);
    setMsg('');
    const res = await recibirRecoleccionesRVirtual(supabase, {
      recolectorClave: grupo.clave,
      adminNombre,
      items: grupo.items,
    });
    setTrabajando('');
    if (!res.ok) {
      setError(res.error || 'No se pudo recibir.');
      return;
    }
    const dest = res.destinoFinal || destinoLbl;
    setMsg(
      res.entregadoAbb
        ? `Recibido ${fmtMonto(res.total)} de ${grupo.etiqueta}. Entregado a: ${dest} (tu cuenta)`
          + (res.liquidadasIe ? ` · ${res.liquidadasIe} a ${ieLbl}.` : '.')
        : `Recibido ${fmtMonto(res.total)} de ${grupo.etiqueta} en tu cuenta. Pendiente de entregar a ${dest}.`,
    );
    await cargar();
  };

  const tomarEntrega = async (grupo) => {
    if (!adminEsDestinoFinal) return;
    if (!confirm(
      `¿Marcar entregado a: ${destinoLbl} las recolecciones de ${grupo.etiqueta} (${fmtMonto(grupo.total)})?\n\n`
      + `Se borrarán de la cuenta de ${grupo.nombre}.`
      + (areaActiva === 'abarrotes' ? `\nPasarán a ${ieLbl} (cuenta CEDIS / Francisco).` : ''),
    )) return;
    setTrabajando(`abb-${grupo.clave}`);
    setMsg('');
    const res = await entregarCustodiaAAbb(supabase, {
      recibidoPor: grupo.nombre,
      abbNombre: adminNombre,
      area: areaActiva,
    });
    setTrabajando('');
    if (!res.ok) {
      setError(res.error || 'No se pudo tomar la entrega.');
      return;
    }
    setMsg(
      `Entregado a: ${res.entregadoA}. Se quitaron ${fmtMonto(res.total)} de la cuenta de ${grupo.etiqueta}`
      + (res.liquidadasIe ? ` · ${res.liquidadasIe} a ${ieLbl}.` : '.'),
    );
    await cargar();
  };

  const verTicket = async (origenId, origen = 'corte') => {
    const key = String(origenId || '');
    if (!key) return;
    setImprimiendo(key);
    setError('');
    const res = await imprimirTicketRcVirtual(supabase, { origenId: key, origen });
    setImprimiendo('');
    if (!res.ok) {
      setError(res.error || 'No se pudo abrir el ticket.');
      return;
    }
  };

  const liquidarItem = async (it) => {
    if (!it?.origenId || it.origen !== 'corte') return;
    const ieTxt = it.temporal
      ? 'Recolección temporal de Garage: se quita de esta bandeja. Los gastos siguen en el corte hasta máquinas en cero.'
      : it.aprobadoIe
        ? `Ya está en ${ieLbl}; solo se quitará de esta bandeja.`
        : `Los ingresos y egresos pendientes se registrarán ahora en ${ieLbl}.`;
    if (!confirm(
      `¿Liquidar / borrar la recolección ${it.folio || it.origenId} (${fmtMonto(it.monto)})?\n\n${ieTxt}`,
    )) return;
    setTrabajando(`liq-${it.origenId}`);
    setMsg('');
    setError('');
    const res = await liquidarRecoleccionRcVirtual(supabase, {
      origenId: it.origenId,
      adminNombre,
    });
    setTrabajando('');
    if (!res.ok) {
      setError(res.error || 'No se pudo liquidar.');
      return;
    }
    if (res.yaLiquidada) {
      setMsg('Esa recolección ya estaba liquidada.');
    } else if (res.pasoIe) {
      setMsg(
        `Liquidada ${it.folio || ''}: pasó a ${ieLbl}`
        + (res.egresosLiberados ? ` · ${res.egresosLiberados} egreso(s) liberado(s)` : '')
        + '.',
      );
    } else if (res.temporal) {
      setMsg(`Liquidada ${it.folio || ''}: se quitó de RC Garage (temporal, no va a IE).`);
    } else {
      setMsg(`Liquidada ${it.folio || ''}: ya estaba en IE; se quitó de la bandeja.`);
    }
    await cargar();
  };

  const eliminarItem = async (it) => {
    if (!adminPuedeEliminar) return;
    if (!it?.origenId || it.origen !== 'corte') return;
    if (!confirm(
      `¿Eliminar / rechazar la recolección ${it.folio || it.origenId} (${fmtMonto(it.monto)})?\n\n`
      + `Se quitará de ${moduloLbl}. No se registrará en ${ieLbl}.`,
    )) return;
    setTrabajando(`elim-${it.origenId}`);
    setMsg('');
    setError('');
    const res = await eliminarRecoleccionRcVirtual(supabase, {
      origenId: it.origenId,
      adminNombre,
    });
    setTrabajando('');
    if (!res.ok) {
      setError(res.error || 'No se pudo eliminar.');
      return;
    }
    setMsg(res.yaEliminada
      ? 'Esa recolección ya estaba eliminada.'
      : `Eliminada/rechazada ${it.folio || ''}: salió de ${moduloLbl} (sin pasar a IE).`);
    await cargar();
  };

  const eliminarPagareItem = async (p) => {
    if (!adminPuedeEliminar) return;
    if (!confirm(
      `¿Eliminar / rechazar el pagaré ${p.folio || ''}?\n\n`
      + 'Quedará cancelado y dejará de aparecer en RC Virtual → Pagaré.',
    )) return;
    setTrabajando(`pag-${p.id}`);
    setMsg('');
    setError('');
    const res = await cancelarPagare(supabase, p, { user: { nombre: adminNombre }, nombreActor: adminNombre });
    setTrabajando('');
    if (!res.ok) {
      setError(res.error || 'No se pudo eliminar el pagaré.');
      return;
    }
    setMsg(res.mensaje || 'Pagaré eliminado.');
    await cargar();
  };

  const recibirPagareItem = async (p) => {
    if (!adminPuedeRecibir) return;
    const monto = montoPendienteRecoleccion(p) || saldoPagare(p);
    if (!confirm(
      `¿Recibir pagaré ${p.folio || ''} por ${fmtMonto(monto)}?\n\n`
      + `Recolectó: ${nombreRecolectorPagare(p) || '—'}\n`
      + `Quedará recibido en central a tu nombre (${adminNombre || '—'}).`,
    )) return;
    setTrabajando(`pag-rec-${p.id}`);
    setMsg('');
    setError('');
    const res = await recibirPagare(supabase, p, { user: { nombre: adminNombre }, nombreActor: adminNombre });
    setTrabajando('');
    if (!res.ok) {
      setError(res.error || 'No se pudo recibir el pagaré.');
      return;
    }
    setMsg(res.mensaje || 'Pagaré recibido.');
    await cargar();
  };


  const abrirGasto = (it) => {
    if (!adminEsAmr || !it?.origenId) return;
    setGastoModal(it);
    setGastoMonto('');
    setGastoDesc('');
    setError('');
  };

  const confirmarGasto = async () => {
    if (!gastoModal) return;
    setTrabajando(`gasto-${gastoModal.origenId}`);
    setMsg('');
    setError('');
    const res = await generarGastoRecoleccionRcVirtual(supabase, {
      origenId: gastoModal.origenId,
      monto: gastoMonto,
      descripcion: gastoDesc,
      usuarioNombre: adminNombre,
    });
    setTrabajando('');
    if (!res.ok) {
      setError(res.error || 'No se pudo generar el gasto.');
      return;
    }
    setMsg(
      `Gasto ${fmtMonto(res.monto)} descontado de ${gastoModal.folio || 'la recolección'}. `
      + `Efectivo restante: ${fmtMonto(res.efectivoRestante)}.`,
    );
    setGastoModal(null);
    await cargar();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>
          {esModoAbarrotes
            ? 'RC Abarrotes'
            : (pestana === 'garage' ? 'RC Garage' : 'RC Virtual')}
        </h3>
        <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
          {esModoAbarrotes ? (
            <>
              Recolecciones de <strong>Corte Abarrotes</strong> (AMR, Luis Enrique, etc.).
              ABB, FJBB y JLBB van directo a {ieLbl} y no aparecen aquí.
              Custodia → cuenta admin → <strong>FJBB</strong> (cuenta CEDIS / Francisco).
              Al recibir FJBB, las recolecciones pasan a <strong>{ieLbl}</strong>.
            </>
          ) : pestana === 'garage' ? (
            <>
              Registro de recolecciones de <strong>Corte Garage</strong> pendientes: qué se recolectó y quién.
              No se listan las de <strong>agosto 2026</strong> ni las que ya están en <strong>IE VIRTUAL</strong>.
              Temporales (máquinas sin cero) sí aparecen hasta que se liquiden o se recolecte en definitivo.
            </>
          ) : (
            <>
              Recolecciones de <strong>Corte Virtual</strong> (AMR, Luis Enrique, etc.).
              ABB, FJBB y JLBB van directo a IE Virtual y no aparecen aquí.
              Garage tiene su propia pestaña <strong>RC Garage</strong>.
              Abarrotes tiene su módulo <strong>RC Abarrotes</strong>.
            </>
          )}
          <strong> Liquidar / borrar</strong> en cada línea: si aún no pasó a {ieLbl}, registra ingresos y egresos pendientes; luego sale de la bandeja.
          {adminEsAmr
            ? ' Como AMR puedes Generar gasto sobre una recolección: se descuenta del efectivo y queda registrado en la misma línea.'
            : ''}
          {adminEsDestinoFinal
            ? ` Tú eres ${destinoLbl}: al recibir quedan en tu cuenta`
              + (esModoAbarrotes ? ` y pasan a ${ieLbl}` : '')
              + '; también puedes quitarle a quien te entregue.'
            : ` Al recibir se cargan a tu cuenta; después debes entregarlas a ${destinoLbl}.`}
        </p>
      </div>

      {!esModoAbarrotes && (
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn ${pestana === 'recolecciones' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setPestana('recolecciones'); setAbierto(null); setAbiertoAbb(null); }}
        >
          RC Virtual
          {recolectoresVirtual.reduce((n, g) => n + (g.items?.length || 0), 0) > 0
            ? ` (${recolectoresVirtual.reduce((n, g) => n + (g.items?.length || 0), 0)})`
            : ''}
        </button>
        <button
          type="button"
          className={`btn ${pestana === 'garage' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setPestana('garage'); setAbierto(null); setAbiertoAbb(null); }}
        >
          RC Garage
          {recolectoresGarage.reduce((n, g) => n + (g.items?.length || 0), 0) > 0
            ? ` (${recolectoresGarage.reduce((n, g) => n + (g.items?.length || 0), 0)})`
            : ''}
        </button>
        <button
          type="button"
          className={`btn ${pestana === 'pagare' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setPestana('pagare')}
        >
          Pagaré ({totalPagaresRc})
        </button>
      </div>
      )}

      {!esModoAbarrotes && pestana === 'pagare' && (
        <div className="card">
          <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue-dark)' }}>
            Pagaré · RC Virtual
          </h4>
          <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.84rem' }}>
            <strong>Por tienda:</strong> liquidados por el cajero («Por recolectar»).
            {' '}Al <strong>Recolectar</strong> pasan a <strong>En tránsito</strong> bajo el nombre del recolector.
            {' '}AMR / ABB / JLBB / FJBB pulsan <strong>Recibir</strong> para cerrarlos.
            {' '}El ticket dice pagar a <strong>las 3b (quién generó)</strong>.
          </p>
          {cargando ? (
            <p className="muted">Cargando…</p>
          ) : totalPagaresRc === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Sin pagarés pendientes ni en tránsito. Ejecuta <code>supabase/fix_pagares.sql</code> si falta la tabla.
            </p>
          ) : (
            <>
              <h4 style={{ margin: '0.5rem 0 0.4rem', color: 'var(--brand-blue)' }}>
                Por tienda · por recolectar ({totalPagaresTienda})
              </h4>
              {totalPagaresTienda === 0 ? (
                <p className="muted" style={{ margin: '0 0 1rem', fontSize: '0.84rem' }}>Sin pagarés pendientes por tienda.</p>
              ) : (
                pagaresPorSucursalAbiertos.map(([sucKey, lista]) => (
                  <div key={`suc-${sucKey}`} style={{ marginBottom: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.4rem', color: 'var(--brand-blue-dark)' }}>
                      {etiquetaTienda(sucKey)}
                      <span className="muted" style={{ fontWeight: 500, fontSize: '0.82rem', marginLeft: '0.35rem' }}>
                        ({lista.length})
                      </span>
                    </h4>
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Folio</th>
                            <th>Área</th>
                            <th>Pagar a</th>
                            <th>Cajero</th>
                            <th>Monto</th>
                            <th>Estado</th>
                            <th>Liquidó</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {lista.map((p) => (
                            <tr key={p.id}>
                              <td>{p.folio || '—'}</td>
                              <td>{ETIQUETA_AREA_PAGARE[p.area] || p.area}</td>
                              <td style={{ fontSize: '0.82rem' }}>{etiquetaPagarALas3b(p)}</td>
                              <td>
                                {p.cajero_nombre || '—'}
                                {p.turno_nombre ? <span className="muted"> · {p.turno_nombre}</span> : null}
                              </td>
                              <td>{fmtMonto(montoPendienteRecoleccion(p) || saldoPagare(p))}</td>
                              <td>{etiquetaEstadoPagare(p.estado)}</td>
                              <td className="muted" style={{ fontSize: '0.78rem' }}>
                                {p.liquidado_por || '—'}
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ fontSize: '0.78rem', padding: '0.2rem 0.4rem' }}
                                  onClick={() => imprimirPagare(p, { copias: 2 })}
                                >
                                  Ticket ×2
                                </button>
                                {adminPuedeEliminar ? (
                                  <button
                                    type="button"
                                    className="btn btn-ghost"
                                    style={{
                                      fontSize: '0.78rem',
                                      padding: '0.2rem 0.4rem',
                                      color: 'var(--danger)',
                                      border: '1px solid var(--danger)',
                                      marginLeft: '0.25rem',
                                    }}
                                    disabled={Boolean(trabajando)}
                                    onClick={() => eliminarPagareItem(p)}
                                  >
                                    {trabajando === `pag-${p.id}` ? '…' : 'Eliminar'}
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}

              <h4 style={{ margin: '1.25rem 0 0.4rem', color: 'var(--brand-gold-dark, #b45309)' }}>
                En tránsito · por recolector ({totalPagaresTransito})
              </h4>
              <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.82rem' }}>
                Separados de las tiendas. AMR / ABB / JLBB / FJBB reciben aquí.
              </p>
              {totalPagaresTransito === 0 ? (
                <p className="muted" style={{ margin: 0, fontSize: '0.84rem' }}>Sin pagarés en tránsito.</p>
              ) : (
                pagaresEnTransitoPorRecolector.map(([recoNombre, lista]) => {
                  const clave = `tr-${recoNombre}`;
                  const abiertoRec = abierto === clave;
                  const totalRec = lista.reduce((n, p) => n + (montoPendienteRecoleccion(p) || 0), 0);
                  return (
                    <div key={clave} style={{ marginBottom: '0.75rem', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{
                          width: '100%',
                          justifyContent: 'flex-start',
                          gap: '0.5rem',
                          padding: '0.65rem 0.85rem',
                          fontWeight: 700,
                        }}
                        onClick={() => setAbierto(abiertoRec ? null : clave)}
                      >
                        <Chevron abierto={abiertoRec} />
                        {recoNombre}
                        <span className="muted" style={{ fontWeight: 500, fontSize: '0.82rem' }}>
                          · {lista.length} · {fmtMonto(totalRec)}
                        </span>
                      </button>
                      {abiertoRec && (
                        <div className="table-wrap" style={{ padding: '0 0.5rem 0.65rem' }}>
                          <table className="data">
                            <thead>
                              <tr>
                                <th>Folio</th>
                                <th>Tienda</th>
                                <th>Área</th>
                                <th>Monto</th>
                                <th>Estado</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {lista.map((p) => (
                                <tr key={p.id}>
                                  <td>{p.folio || '—'}</td>
                                  <td>{etiquetaTienda(p.sucursal_id)}</td>
                                  <td>{ETIQUETA_AREA_PAGARE[p.area] || p.area}</td>
                                  <td>{fmtMonto(montoPendienteRecoleccion(p))}</td>
                                  <td>{etiquetaEstadoPagare(p.estado)}</td>
                                  <td style={{ whiteSpace: 'nowrap' }}>
                                    {adminPuedeRecibir ? (
                                      <button
                                        type="button"
                                        className="btn btn-gold"
                                        style={{ fontSize: '0.78rem', padding: '0.2rem 0.45rem' }}
                                        disabled={Boolean(trabajando)}
                                        onClick={() => recibirPagareItem(p)}
                                      >
                                        {trabajando === `pag-rec-${p.id}` ? '…' : 'Recibir'}
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="btn btn-ghost"
                                      style={{ fontSize: '0.78rem', padding: '0.2rem 0.4rem', marginLeft: '0.25rem' }}
                                      onClick={() => imprimirPagare(p, { copias: 1 })}
                                    >
                                      Ticket
                                    </button>
                                    {adminPuedeEliminar ? (
                                      <button
                                        type="button"
                                        className="btn btn-ghost"
                                        style={{
                                          fontSize: '0.78rem',
                                          padding: '0.2rem 0.4rem',
                                          color: 'var(--danger)',
                                          border: '1px solid var(--danger)',
                                          marginLeft: '0.25rem',
                                        }}
                                        disabled={Boolean(trabajando)}
                                        onClick={() => eliminarPagareItem(p)}
                                      >
                                        Eliminar
                                      </button>
                                    ) : null}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      )}

      {esPestanaRecolecciones && error && (
        <div className="card" style={{ borderLeft: '4px solid var(--danger)', padding: '0.75rem 1rem' }}>
          <p style={{ margin: 0, fontSize: '0.88rem' }}>{error}</p>
        </div>
      )}
      {msg && (
        <div className="card" style={{ padding: '0.65rem 1rem', background: 'rgba(59,105,181,0.08)' }}>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>{msg}</p>
        </div>
      )}

      {gastoModal && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', padding: '0.85rem 1rem' }}>
          <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue-dark)' }}>
            Generar gasto · {gastoModal.folio || gastoModal.origenId}
          </h4>
          <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
            {gastoModal.tipoItem} · {gastoModal.sucursal} · efectivo disponible {fmtMonto(gastoModal.monto)}
          </p>
          <div className="grid-2" style={{ gap: '0.75rem' }}>
            <label className="muted" style={{ display: 'block' }}>
              Monto ($)
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                style={{ marginTop: '0.35rem' }}
                value={gastoMonto}
                onChange={(e) => setGastoMonto(e.target.value)}
                autoFocus
              />
            </label>
            <label className="muted" style={{ display: 'block' }}>
              Descripción
              <input
                className="input"
                style={{ marginTop: '0.35rem' }}
                value={gastoDesc}
                onChange={(e) => setGastoDesc(e.target.value)}
                placeholder="Ej. Gasolina / taxi"
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-gold"
              disabled={Boolean(trabajando)}
              onClick={confirmarGasto}
            >
              {trabajando === `gasto-${gastoModal.origenId}` ? 'Guardando…' : 'Confirmar gasto'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={Boolean(trabajando)}
              onClick={() => setGastoModal(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {esPestanaRecolecciones && (cargando ? (
        <p className="muted">Cargando recolecciones…</p>
      ) : (
        <>
          {!adminEsDestinoFinal && porEntregarAbb.some((g) => g.clave === miClave) && (
            <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', padding: '0.75rem 1rem' }}>
              <p style={{ margin: 0, fontSize: '0.88rem' }}>
                Tienes {fmtMonto(porEntregarAbb.find((g) => g.clave === miClave)?.total || 0)} en tu cuenta
                por entregar a {destinoLbl}. Cuando se las entregues, {destinoLbl} las marcará «entregado a: {destinoLbl}» y saldrán de tu cuenta
                {esModoAbarrotes ? ` · pasan a ${ieLbl}` : ''}.
              </p>
            </div>
          )}
          {adminEsDestinoFinal && porEntregarAbb.length > 0 && (
            <div className="card">
              <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)' }}>
                Por entregar a {destinoLbl}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {porEntregarAbb.map((g) => {
                  const open = abiertoAbb === g.clave;
                  return (
                    <div key={g.clave} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setAbiertoAbb(open ? null : g.clave)}
                        style={{ width: '100%', justifyContent: 'space-between', borderRadius: 0, textAlign: 'left' }}
                      >
                        <span>
                          <Chevron abierto={open} /> <strong>{g.etiqueta}</strong>
                          <span className="muted" style={{ marginLeft: '0.5rem' }}>
                            {g.items.length} · {fmtMonto(g.total)}
                            {g.cuentaId ? ` · ${etiquetaCuentaRt(g.cuentaId)}` : ''}
                          </span>
                        </span>
                      </button>
                      {open && (
                        <div style={{ padding: '0.65rem 0.85rem 0.85rem' }}>
                          <div className="table-wrap">
                            <table className="data">
                              <thead>
                                <tr>
                                  <th>Fecha</th>
                                  <th>Tipo</th>
                                  <th>Folio</th>
                                  <th>Sucursal</th>
                                  <th>Monto</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {g.items.map((r) => (
                                  <tr key={r.id}>
                                    <td>{fmtFecha(r.recibido_at)}</td>
                                    <td>{r.tipo_item || r.origen}</td>
                                    <td>{r.folio || '—'}</td>
                                    <td>{r.sucursal || '—'}</td>
                                    <td>{fmtMonto(r.monto)}</td>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                      {r.origen === 'corte' && r.origen_id ? (
                                        <button
                                          type="button"
                                          className="btn btn-ghost"
                                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                                          disabled={Boolean(imprimiendo)}
                                          onClick={() => verTicket(r.origen_id, r.origen)}
                                        >
                                          {imprimiendo === String(r.origen_id) ? 'Abriendo…' : 'Ver ticket'}
                                        </button>
                                      ) : (
                                        <span className="muted">—</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ marginTop: '0.65rem' }}
                            disabled={Boolean(trabajando)}
                            onClick={() => tomarEntrega(g)}
                          >
                            {trabajando === `abb-${g.clave}`
                              ? 'Aplicando…'
                              : `Entregado a: ${destinoLbl} · borrar de ${g.etiqueta}`}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card">
            <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)' }}>
              {esModoAbarrotes
                ? 'Recolectores · Abarrotes'
                : (pestana === 'garage' ? 'Recolectores · Garage' : 'Recolectores · Virtual')}
            </h4>
            {recolectores.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {esModoAbarrotes
                  ? 'No hay recolecciones pendientes de Corte Abarrotes.'
                  : pestana === 'garage'
                    ? 'No hay recolecciones de Corte Garage pendientes. No se muestran las de agosto 2026 ni las ya registradas en IE VIRTUAL.'
                    : 'No hay recolecciones pendientes de Corte Virtual.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {recolectores.map((g) => {
                  const open = abierto === g.clave;
                  const nRec = (g.items || []).filter((it) => it.receivable).length;
                  return (
                    <div key={g.clave} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setAbierto(open ? null : g.clave)}
                        style={{ width: '100%', justifyContent: 'space-between', borderRadius: 0, textAlign: 'left' }}
                      >
                        <span>
                          <Chevron abierto={open} /> <strong>{g.etiqueta}</strong>
                          <span className="muted" style={{ marginLeft: '0.5rem' }}>
                            {g.items.length} movimiento(s)
                            {g.totalRecibir > 0 ? ` · recibir ${fmtMonto(g.totalRecibir)}` : ''}
                            {g.totalDeuda > 0 ? ` · deuda ${fmtMonto(g.totalDeuda)}` : ''}
                          </span>
                        </span>
                      </button>
                      {open && (
                        <div style={{ padding: '0.65rem 0.85rem 0.85rem' }}>
                          <div className="table-wrap">
                            <table className="data">
                              <thead>
                                <tr>
                                  <th>Fecha</th>
                                  <th>Tipo</th>
                                  <th>Folio</th>
                                  <th>Sucursal</th>
                                  <th>Recolector</th>
                                  <th>Efectivo</th>
                                  <th>Gastos</th>
                                  <th>IE</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {g.items.map((it) => (
                                  <tr key={`${it.origen}-${it.origenId}`}>
                                    <td>{fmtFecha(it.fecha)}</td>
                                    <td>{it.tipoItem}</td>
                                    <td>{it.folio || '—'}</td>
                                    <td>{it.sucursal || '—'}</td>
                                    <td>{it.recolectorEtiqueta || it.recolectorNombre || '—'}</td>
                                    <td>{fmtMonto(it.monto)}</td>
                                    <td>
                                      <ResumenGastosLinea gastos={it.gastosRc} />
                                    </td>
                                    <td style={{ fontSize: '0.78rem' }}>
                                      {it.temporal ? (
                                        <span className="muted">Temporal</span>
                                      ) : it.aprobadoIe ? (
                                        <span style={{ color: 'var(--brand-blue)' }}>En IE</span>
                                      ) : (
                                        <span className="muted">Pendiente</span>
                                      )}
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', justifyContent: 'flex-end' }}>
                                        {it.origen === 'corte' && it.origenId ? (
                                          <button
                                            type="button"
                                            className="btn btn-ghost"
                                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                                            disabled={Boolean(imprimiendo) || Boolean(trabajando)}
                                            onClick={() => verTicket(it.origenId, it.origen)}
                                          >
                                            {imprimiendo === String(it.origenId) ? 'Abriendo…' : 'Ver ticket'}
                                          </button>
                                        ) : null}
                                        {adminEsAmr && it.origen === 'corte' && it.origenId ? (
                                          <button
                                            type="button"
                                            className="btn btn-ghost"
                                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                                            disabled={Boolean(trabajando)}
                                            onClick={() => abrirGasto(it)}
                                          >
                                            Generar gasto
                                          </button>
                                        ) : null}
                                        {it.origen === 'corte' && it.origenId ? (
                                          <>
                                            <button
                                              type="button"
                                              className="btn btn-danger"
                                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                                              disabled={Boolean(trabajando)}
                                              onClick={() => liquidarItem(it)}
                                            >
                                              {trabajando === `liq-${it.origenId}` ? 'Liquidando…' : 'Liquidar'}
                                            </button>
                                            {adminPuedeEliminar ? (
                                              <button
                                                type="button"
                                                className="btn btn-ghost"
                                                style={{
                                                  padding: '0.2rem 0.5rem',
                                                  fontSize: '0.75rem',
                                                  color: 'var(--danger)',
                                                  border: '1px solid var(--danger)',
                                                }}
                                                disabled={Boolean(trabajando)}
                                                onClick={() => eliminarItem(it)}
                                              >
                                                {trabajando === `elim-${it.origenId}` ? 'Eliminando…' : 'Eliminar'}
                                              </button>
                                            ) : null}
                                          </>
                                        ) : (
                                          <span className="muted">—</span>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {nRec > 0 ? (
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ marginTop: '0.65rem' }}
                              disabled={Boolean(trabajando)}
                              onClick={() => recibir(g)}
                            >
                              {trabajando === `rec-${g.clave}`
                                ? 'Recibiendo…'
                                : `Recibir ${fmtMonto(g.totalRecibir)}`}
                            </button>
                          ) : (
                            <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.85rem' }}>
                              {pestana === 'garage'
                                ? 'Registro de quién recolectó. ABB/FJBB/JLBB no se vuelven a cargar a cuenta; usa Liquidar para quitar de la bandeja.'
                                : 'No hay monto por recibir en estas recolecciones.'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ))}
    </div>
  );
}
