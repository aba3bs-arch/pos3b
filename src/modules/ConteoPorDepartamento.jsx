import React, { useEffect, useMemo, useRef, useState } from 'react';
import { agregarDepartamentoExtra, etiquetaDepartamento, listarDepartamentos } from '../lib/departamentos.js';
import {
  aplicarConteoDepartamento,
  construirLineaConteo,
  productosEnDepartamento,
  resumirConteoDepartamento,
} from '../lib/conteoDepartamento.js';
import { buscarProductoInventario } from '../lib/comprasRecepcion.js';
import { fmtMxn } from '../lib/valorInventario.js';
import { imprimirAjusteInventario } from '../lib/impresion.js';
import Icon from '../components/Icon.jsx';
import CampoCodigo from '../components/CampoCodigo.jsx';
import {
  borradorTieneDatos,
  eliminarAjusteEnEspera,
  guardarAjusteEnEspera,
  idAutoBorrador,
  leerBorradorAuto,
} from '../lib/ajusteInventarioBorrador.js';
import { useAutoGuardarBorrador } from '../hooks/useAutoGuardarBorrador.js';

function estadoInicialDesdeBorrador(borradorInicial, departamentoInicial, sucursal) {
  let base = borradorInicial;
  if (!base) {
    const auto = leerBorradorAuto('departamento', sucursal);
    if (borradorTieneDatos(auto)) base = auto;
  }
  return {
    departamento: base?.departamento || departamentoInicial || 'GENERAL',
    conteoActivo: Boolean(base && borradorTieneDatos(base)),
    conteos: base?.conteos && typeof base.conteos === 'object' ? { ...base.conteos } : {},
    indiceActual: Number(base?.indiceActual) || 0,
    borradorId: base?.id || idAutoBorrador('departamento', sucursal),
    recuperado: Boolean(!borradorInicial && base && borradorTieneDatos(base)),
  };
}

export default function ConteoPorDepartamento({
  supabase,
  inventario,
  cargarDatos,
  user,
  sucursal,
  onHistorialChange,
  departamentoInicial,
  borradorInicial,
}) {
  const init = useMemo(
    () => estadoInicialDesdeBorrador(borradorInicial, departamentoInicial, sucursal),
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [departamento, setDepartamento] = useState(init.departamento);
  const [nuevoDepto, setNuevoDepto] = useState('');
  const [conteoActivo, setConteoActivo] = useState(init.conteoActivo);
  const [conteos, setConteos] = useState(init.conteos);
  const [indiceActual, setIndiceActual] = useState(init.indiceActual);
  const [codigoEscaneo, setCodigoEscaneo] = useState('');
  const [mostrarResumen, setMostrarResumen] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [folioAplicado, setFolioAplicado] = useState(null);
  const [ultimoAjuste, setUltimoAjuste] = useState(null);
  const [borradorId, setBorradorId] = useState(init.borradorId);
  const [avisoRecuperado, setAvisoRecuperado] = useState(init.recuperado);
  const contadaInputRef = useRef(null);
  const scanInputRef = useRef(null);

  const departamentos = useMemo(() => listarDepartamentos(inventario), [inventario]);
  const productosDept = useMemo(() => productosEnDepartamento(inventario, departamento), [inventario, departamento]);

  useEffect(() => {
    if (departamentoInicial && !borradorInicial) {
      setDepartamento(departamentoInicial);
    }
  }, [departamentoInicial, borradorInicial]);

  const lineas = useMemo(
    () => productosDept.map((p) => construirLineaConteo(p, conteos[p.id] ?? '')),
    [productosDept, conteos],
  );

  const resumen = useMemo(() => resumirConteoDepartamento(lineas), [lineas]);
  const articuloActual = lineas[indiceActual] || null;

  useEffect(() => {
    if (conteoActivo && !mostrarResumen && !folioAplicado) contadaInputRef.current?.focus();
  }, [conteoActivo, indiceActual, mostrarResumen, folioAplicado]);

  useAutoGuardarBorrador(
    () => {
      if (!conteoActivo || folioAplicado) return null;
      if (!borradorTieneDatos({ conteos })) return null;
      return {
        id: borradorId || idAutoBorrador('departamento', sucursal),
        tipo: 'departamento',
        titulo: `Por departamento · ${etiquetaDepartamento(departamento)}`,
        departamento,
        conteos,
        indiceActual,
        sucursal,
        usuario: user?.nombre,
        auto: true,
      };
    },
    (draft) => {
      const saved = guardarAjusteEnEspera(draft);
      if (saved?.id && saved.id !== borradorId) setBorradorId(saved.id);
    },
    { enabled: Boolean(conteoActivo && !folioAplicado) },
  );

  const iniciarConteo = () => {
    if (!productosDept.length) return alert('No hay productos en este departamento.');
    const autoId = idAutoBorrador('departamento', sucursal);
    setConteos({});
    setIndiceActual(0);
    setMostrarResumen(false);
    setFolioAplicado(null);
    setUltimoAjuste(null);
    setConteoActivo(true);
    setCodigoEscaneo('');
    setBorradorId(autoId);
    setAvisoRecuperado(false);
  };

  const cambiarDepartamento = (dept) => {
    setDepartamento(dept);
    setConteoActivo(false);
    setConteos({});
    setMostrarResumen(false);
    setFolioAplicado(null);
    setUltimoAjuste(null);
  };

  const setContada = (productoId, valor) => {
    setConteos((prev) => ({ ...prev, [productoId]: valor }));
  };

  const irAProducto = (productoId) => {
    const idx = lineas.findIndex((l) => l.productoId === productoId);
    if (idx >= 0) {
      setIndiceActual(idx);
      setMostrarResumen(false);
    }
  };

  const procesarEscaneo = (raw) => {
    const codigo = String(raw ?? codigoEscaneo).trim();
    if (!codigo) return;
    const { producto, ambiguo } = buscarProductoInventario(inventario, codigo);
    if (ambiguo) {
      setCodigoEscaneo('');
      return alert('Varios productos coinciden con ese código.');
    }
    if (!producto) {
      setCodigoEscaneo('');
      scanInputRef.current?.focus();
      return alert(
        `No está en inventario: ${codigo}\n\n` +
          'El ajuste solo busca en Productos. Si lo agregaste al catálogo del proveedor, regístralo en inventario desde Proveedores.',
      );
    }
    if (String(producto.cat || 'GENERAL').toUpperCase() !== String(departamento).toUpperCase()) {
      setCodigoEscaneo('');
      return alert(`"${producto.nombre}" pertenece a ${etiquetaDepartamento(producto.cat)}, no a ${etiquetaDepartamento(departamento)}.`);
    }
    irAProducto(producto.id);
    setCodigoEscaneo('');
    contadaInputRef.current?.focus();
    contadaInputRef.current?.select();
  };

  const onScanKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      procesarEscaneo(e.target.value);
    }
  };

  const onContadaKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      siguienteArticulo();
    }
  };

  const siguienteArticulo = () => {
    if (!articuloActual) return;
    const pid = articuloActual.productoId;
    const raw = conteos[pid];
    const contadaFinal = raw === undefined || String(raw).trim() === '' ? String(articuloActual.existencia) : String(raw);
    const nextConteos = { ...conteos, [pid]: contadaFinal };
    setConteos(nextConteos);

    const lineasNext = productosDept.map((p) => construirLineaConteo(p, nextConteos[p.id] ?? ''));
    const nextIdx = lineasNext.findIndex((l, i) => i > indiceActual && l.contadaNum == null);
    if (nextIdx >= 0) {
      setIndiceActual(nextIdx);
      return;
    }
    const firstPending = lineasNext.findIndex((l) => l.contadaNum == null && l.productoId !== pid);
    if (firstPending >= 0) {
      setIndiceActual(firstPending);
      return;
    }
    setMostrarResumen(true);
  };

  const agregarDepto = () => {
    const r = agregarDepartamentoExtra(nuevoDepto);
    if (r.ok) {
      setNuevoDepto('');
      cambiarDepartamento(r.codigo);
      alert(`Departamento "${etiquetaDepartamento(r.codigo)}" agregado.`);
    } else alert(r.error);
  };

  const aplicarAjuste = async () => {
    if (!resumen.listoParaAplicar) {
      return alert(`Aún faltan ${resumen.skusPendientes} producto(s) por contar. Usa "Siguiente artículo" en cada uno.`);
    }
    const msg = resumen.hayDiferencias
      ? `¿Aplicar ajuste?\n\nFaltante: ${resumen.piezasFaltantes} pzs (${fmtMxn(resumen.valorFaltante)})\nSobrante: ${resumen.piezasSobrantes} pzs (${fmtMxn(resumen.valorSobrante)})\n\nSe actualizará el stock en Supabase.`
      : '¿Cerrar conteo sin diferencias? Se generará folio de cierre.';
    if (!confirm(msg)) return;

    setAplicando(true);
    const lineasFinales = lineas.map((l) => {
      if (l.contadaNum != null) return l;
      return construirLineaConteo(
        productosDept.find((p) => p.id === l.productoId),
        String(l.existencia),
      );
    });
    const r = await aplicarConteoDepartamento(supabase, {
      lineas: lineasFinales,
      inventario,
      departamento,
      usuario: user?.nombre,
      sucursal,
    });
    setAplicando(false);

    if (!r.ok) return alert(r.error);

    setFolioAplicado(r.folio);
    setUltimoAjuste(r.ajuste);
    onHistorialChange?.(r.log);
    if (borradorId) {
      eliminarAjusteEnEspera(borradorId);
      eliminarAjusteEnEspera(idAutoBorrador('departamento', sucursal));
      setBorradorId(null);
    }
    setAvisoRecuperado(false);
    cargarDatos();
    alert(`${r.mensaje}\n\nFolio de ajuste: ${r.folio}`);
  };

  const guardarEnEspera = () => {
    if (!conteoActivo || folioAplicado) return;
    const saved = guardarAjusteEnEspera({
      id: borradorId || idAutoBorrador('departamento', sucursal),
      tipo: 'departamento',
      titulo: `Por departamento · ${etiquetaDepartamento(departamento)}`,
      departamento,
      conteos,
      indiceActual,
      sucursal,
      usuario: user?.nombre,
      auto: false,
    });
    setBorradorId(saved?.id || null);
    alert('Ajuste guardado en espera. Puedes continuar después desde «Abrir ajuste en espera».');
  };

  const imprimirResumen = () => {
    if (!ultimoAjuste && !lineas.length) return;
    imprimirAjusteInventario({
      folio: folioAplicado || 'BORRADOR',
      sucursal,
      usuario: user?.nombre,
      departamento: etiquetaDepartamento(departamento),
      resumen: ultimoAjuste?.resumen || resumen,
      lineas: (ultimoAjuste?.lineas || lineas).filter((l) => l.contadaNum != null),
      aplicado: Boolean(folioAplicado),
    });
  };

  const etiquetaDiferencia = (l) => {
    if (l.contadaNum == null) return '—';
    if (l.diferencia === 0) return '0';
    if (l.diferencia > 0) return `+${l.diferencia} sobrante`;
    return `${l.diferencia} faltante`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
        <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Conteo físico por departamento</h4>
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          Selecciona el departamento, cuenta pieza por pieza y al terminar aplica el ajuste. Se genera un folio único.
          El progreso se guarda solo en este equipo (si llega una llamada no se pierde).
        </p>
        {avisoRecuperado && conteoActivo && !folioAplicado && (
          <p
            style={{
              margin: '0.65rem 0 0',
              padding: '0.55rem 0.65rem',
              borderRadius: 8,
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.35)',
              fontSize: '0.85rem',
            }}
          >
            Se recuperó el conteo que tenías en curso ({Object.keys(conteos).length} artículo(s)).
            <button type="button" className="btn btn-ghost" style={{ marginLeft: '0.5rem', padding: '0.2rem 0.45rem', fontSize: '0.8rem' }} onClick={() => setAvisoRecuperado(false)}>
              Entendido
            </button>
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="muted" style={{ flex: '1 1 200px' }}>
            Departamento
            <select
              className="select"
              style={{ marginTop: '0.35rem' }}
              value={departamento}
              onChange={(e) => cambiarDepartamento(e.target.value)}
              disabled={conteoActivo && !folioAplicado}
            >
              {departamentos.map((d) => (
                <option key={d} value={d}>
                  {etiquetaDepartamento(d)}
                </option>
              ))}
            </select>
          </label>
          {!conteoActivo && (
            <button type="button" className="btn btn-primary" onClick={iniciarConteo} disabled={!productosDept.length}>
              Iniciar conteo ({productosDept.length} artículos)
            </button>
          )}
          {conteoActivo && !folioAplicado && (
            <>
              <button type="button" className="btn btn-ghost" onClick={guardarEnEspera}>
                Guardar en espera
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  if (confirm('¿Cancelar el conteo en curso? Se borrará el borrador automático de este equipo.')) {
                    eliminarAjusteEnEspera(borradorId || idAutoBorrador('departamento', sucursal));
                    eliminarAjusteEnEspera(idAutoBorrador('departamento', sucursal));
                    setConteoActivo(false);
                    setConteos({});
                    setMostrarResumen(false);
                    setBorradorId(idAutoBorrador('departamento', sucursal));
                    setAvisoRecuperado(false);
                  }
                }}
              >
                Cancelar conteo
              </button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="muted" style={{ flex: '1 1 180px' }}>
            Nuevo departamento
            <input className="input" style={{ marginTop: '0.35rem' }} value={nuevoDepto} onChange={(e) => setNuevoDepto(e.target.value)} placeholder="Ej. FARMACIA" />
          </label>
          <button type="button" className="btn btn-ghost" onClick={agregarDepto}>
            Agregar
          </button>
        </div>
      </div>

      {folioAplicado && (
        <div className="card" style={{ borderTop: '4px solid var(--brand-green)', background: 'rgba(34,139,34,0.06)' }}>
          <h4 style={{ margin: '0 0 0.35rem', color: 'var(--brand-green)' }}>Ajuste aplicado</h4>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--brand-blue)', fontFamily: 'ui-monospace, monospace' }}>{folioAplicado}</div>
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
            Guarda este folio para auditoría. Puedes imprimir el resumen o iniciar un nuevo conteo.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={imprimirResumen}>
              Imprimir folio
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setConteoActivo(false);
                setConteos({});
                setMostrarResumen(false);
                setFolioAplicado(null);
                setUltimoAjuste(null);
              }}
            >
              Nuevo conteo
            </button>
          </div>
        </div>
      )}

      {conteoActivo && !folioAplicado && (
        <>
          <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>
                Artículo {indiceActual + 1} de {lineas.length}
              </h4>
              <span className="badge">{etiquetaDepartamento(departamento)}</span>
            </div>

            <label className="muted" style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Icon name="scan" size={16} />
                Escanear código
              </span>
              <div style={{ marginTop: '0.35rem' }}>
                <CampoCodigo
                  inputRef={scanInputRef}
                  value={codigoEscaneo}
                  onChange={(e) => setCodigoEscaneo(e.target.value)}
                  onEscanear={procesarEscaneo}
                  onKeyDown={onScanKeyDown}
                  placeholder="Escanea para saltar al producto…"
                  tituloCamara="Escanear en conteo"
                  inputStyle={{ fontSize: '1.05rem', letterSpacing: '0.04em' }}
                />
              </div>
            </label>

            {articuloActual && (
              <div style={{ padding: '1rem', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{articuloActual.nombre}</div>
                <div className="muted" style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
                  Código / barras: <strong>{articuloActual.codigo}</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.65rem', marginTop: '0.85rem' }}>
                  <div>
                    <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>En existencia</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-blue)' }}>{articuloActual.existencia}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>Cantidad contada</div>
                    <input
                      ref={contadaInputRef}
                      className="input"
                      type="number"
                      min={0}
                      style={{ marginTop: '0.2rem', fontSize: '1.35rem', fontWeight: 700, padding: '0.5rem' }}
                      value={conteos[articuloActual.productoId] ?? ''}
                      onChange={(e) => setContada(articuloActual.productoId, e.target.value)}
                      onKeyDown={onContadaKeyDown}
                      placeholder={String(articuloActual.existencia)}
                    />
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>Diferencia</div>
                    <div
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: 700,
                        marginTop: '0.35rem',
                        color:
                          articuloActual.contadaNum == null
                            ? 'inherit'
                            : articuloActual.diferencia === 0
                              ? 'var(--brand-green)'
                              : articuloActual.diferencia > 0
                                ? 'var(--brand-gold-dark)'
                                : 'var(--brand-red)',
                      }}
                    >
                      {articuloActual.contadaNum == null
                        ? '—'
                        : articuloActual.diferencia === 0
                          ? 'Cuadra'
                          : articuloActual.diferencia > 0
                            ? `+${articuloActual.diferencia} sobrante`
                            : `${articuloActual.diferencia} faltante`}
                    </div>
                  </div>
                </div>
                <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.78rem' }}>
                  Si dejas vacío y pulsas Siguiente, se asume que coincide con existencia ({articuloActual.existencia}).
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={siguienteArticulo} disabled={!articuloActual}>
                Siguiente artículo
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setIndiceActual((i) => Math.max(0, i - 1))}
                disabled={indiceActual <= 0}
              >
                Anterior
              </button>
              <button type="button" className="btn btn-gold" onClick={() => setMostrarResumen(true)}>
                Ver resumen
              </button>
            </div>
          </div>

          <div className="card">
            <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Listado del departamento</h4>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Artículo</th>
                    <th>Existencia</th>
                    <th>Contada</th>
                    <th>Diferencia</th>
                    <th>Valor dif.</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, idx) => (
                    <tr
                      key={l.productoId}
                      style={{
                        background: idx === indiceActual ? 'rgba(59,105,181,0.08)' : l.estado === 'ok' ? 'rgba(34,139,34,0.04)' : undefined,
                        cursor: 'pointer',
                      }}
                      onClick={() => setIndiceActual(idx)}
                    >
                      <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }}>{l.codigo}</td>
                      <td>{l.nombre}</td>
                      <td>{l.existencia}</td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          style={{ width: '4.5rem', padding: '0.25rem 0.4rem', fontSize: '0.85rem' }}
                          value={conteos[l.productoId] ?? ''}
                          onChange={(e) => setContada(l.productoId, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td
                        style={{
                          fontWeight: 600,
                          color: l.estado === 'faltante' ? 'var(--brand-red)' : l.estado === 'sobrante' ? 'var(--brand-gold-dark)' : l.estado === 'ok' ? 'var(--brand-green)' : undefined,
                        }}
                      >
                        {etiquetaDiferencia(l)}
                      </td>
                      <td className="muted" style={{ fontSize: '0.82rem' }}>{l.valorDiferencia > 0 ? fmtMxn(l.valorDiferencia) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {conteoActivo && (mostrarResumen || resumen.skusPendientes === 0) && !folioAplicado && (
        <div className="card" style={{ borderTop: '4px solid var(--brand-green)' }}>
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Resumen del conteo</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.65rem' }}>
            <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Artículos</div>
              <div style={{ fontWeight: 700 }}>{resumen.totalSkus}</div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>{resumen.skusPendientes} pendientes</div>
            </div>
            <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Piezas contadas</div>
              <div style={{ fontWeight: 700 }}>{resumen.piezasContadas}</div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>Sistema: {resumen.piezasExistencia}</div>
            </div>
            <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'rgba(220,53,69,0.06)', border: '1px solid rgba(220,53,69,0.2)' }}>
              <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Faltante</div>
              <div style={{ fontWeight: 700, color: 'var(--brand-red)' }}>{resumen.piezasFaltantes} pzs</div>
              <div style={{ fontWeight: 600, color: 'var(--brand-red)' }}>{fmtMxn(resumen.valorFaltante)}</div>
            </div>
            <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'rgba(225,153,41,0.08)', border: '1px solid rgba(225,153,41,0.25)' }}>
              <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Sobrante</div>
              <div style={{ fontWeight: 700, color: 'var(--brand-gold-dark)' }}>{resumen.piezasSobrantes} pzs</div>
              <div style={{ fontWeight: 600, color: 'var(--brand-gold-dark)' }}>{fmtMxn(resumen.valorSobrante)}</div>
            </div>
            <div style={{ padding: '0.65rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Cuadran</div>
              <div style={{ fontWeight: 700, color: 'var(--brand-green)' }}>{resumen.skusOk} SKU</div>
            </div>
          </div>

          {resumen.skusPendientes > 0 && (
            <p className="muted" style={{ margin: '0.75rem 0 0', color: 'var(--brand-gold-dark)' }}>
              Faltan {resumen.skusPendientes} producto(s) por contar antes de aplicar.
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-success" onClick={aplicarAjuste} disabled={aplicando || !resumen.listoParaAplicar}>
              {aplicando ? 'Aplicando…' : 'Aplicar ajuste de inventario'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={imprimirResumen}>
              Imprimir borrador
            </button>
            {mostrarResumen && resumen.skusPendientes > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => setMostrarResumen(false)}>
                Seguir contando
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
