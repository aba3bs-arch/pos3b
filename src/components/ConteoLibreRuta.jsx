import React, { useMemo, useRef, useState } from 'react';
import CampoCodigo from './CampoCodigo.jsx';
import Icon from './Icon.jsx';
import { buscarProductoInventario } from '../lib/comprasRecepcion.js';
import { etiquetaDepartamento } from '../lib/departamentos.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { resumirDepartamentoAuditoria } from '../lib/auditoriaCamionRuta.js';

const FILTROS_VACIOS = { diferencia: 'todo', estado: 'todo', departamento: '' };

function textoDiferencia(l) {
  if (l.contado == null) return '—';
  if (l.diferencia === 0) return 'Cuadra';
  return l.diferencia > 0 ? `+${l.diferencia} sobrante` : `${l.diferencia} faltante`;
}

function colorDiferencia(l) {
  if (l.contado == null) return 'inherit';
  if (l.diferencia === 0) return 'var(--brand-green)';
  return l.diferencia > 0 ? 'var(--brand-gold-dark)' : 'var(--brand-red)';
}

/**
 * Inventario libre del camión (como "Inventario libre" de sucursales):
 * se escanean o buscan productos, se captura la cantidad contada y se cierra.
 */
export default function ConteoLibreRuta({
  lineas,
  inventarioCamion,
  inventario,
  libreIds,
  setLibreIds,
  conteos,
  setConteo,
  onTerminar,
  onVolver,
  guardando,
}) {
  const [codigo, setCodigo] = useState('');
  const [q, setQ] = useState('');
  const [pendiente, setPendiente] = useState(null);
  const [cantidad, setCantidad] = useState('');
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [verFiltros, setVerFiltros] = useState(false);
  const cantRef = useRef(null);

  const porId = useMemo(() => new Map(lineas.map((l) => [String(l.id), l])), [lineas]);
  const lineasLibre = useMemo(
    () => libreIds.map((id) => porId.get(String(id))).filter(Boolean),
    [libreIds, porId],
  );
  const resumen = useMemo(() => resumirDepartamentoAuditoria(lineasLibre), [lineasLibre]);

  const departamentos = useMemo(
    () => [...new Set(lineasLibre.map((l) => l.cat))].sort((a, b) => a.localeCompare(b, 'es')),
    [lineasLibre],
  );

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = lineasLibre;
    if (t) list = list.filter((l) => l.nombre.toLowerCase().includes(t) || String(l.id).toLowerCase().includes(t));
    if (filtros.diferencia === 'sin') list = list.filter((l) => l.contado != null && l.diferencia === 0);
    if (filtros.diferencia === 'negativa') list = list.filter((l) => l.contado != null && l.diferencia < 0);
    if (filtros.diferencia === 'positiva') list = list.filter((l) => l.contado != null && l.diferencia > 0);
    if (filtros.estado === 'contado') list = list.filter((l) => l.contado != null);
    if (filtros.estado === 'no_contado') list = list.filter((l) => l.contado == null);
    if (filtros.departamento) list = list.filter((l) => l.cat === filtros.departamento);
    return list;
  }, [lineasLibre, q, filtros]);

  const filtrosActivos = (filtros.diferencia !== 'todo' ? 1 : 0)
    + (filtros.estado !== 'todo' ? 1 : 0)
    + (filtros.departamento ? 1 : 0);

  const buscarEnCamion = (raw) => {
    const code = String(raw ?? '').trim();
    if (!code) return null;
    const hit = buscarProductoInventario(inventarioCamion, code)?.producto
      || buscarProductoInventario(inventario, code)?.producto
      || inventarioCamion.find((p) => String(p.id) === code);
    if (!hit || !inventarioCamion.some((p) => String(p.id) === String(hit.id))) return false;
    return porId.get(String(hit.id)) || false;
  };

  const abrirProducto = (raw) => {
    const code = String(raw ?? codigo).trim();
    if (!code) return;
    setCodigo('');
    const linea = buscarEnCamion(code);
    if (linea === false || linea === null) {
      return alert(`No está en el camión: ${code}`);
    }
    setPendiente(linea);
    setCantidad(conteos[linea.id] != null ? String(conteos[linea.id]) : '');
    window.setTimeout(() => cantRef.current?.focus(), 30);
  };

  const aceptarCantidad = () => {
    if (!pendiente) return;
    const n = String(cantidad).trim();
    const final = n === '' ? String(pendiente.teorico) : String(Math.max(0, Math.floor(Number(n) || 0)));
    setConteo(pendiente.id, final);
    setLibreIds((prev) => (prev.includes(pendiente.id) ? prev : [...prev, pendiente.id]));
    setPendiente(null);
    setCantidad('');
  };

  const quitar = (id) => {
    setLibreIds((prev) => prev.filter((x) => x !== id));
    setConteo(id, '');
  };

  const sugerencias = useMemo(() => {
    const t = codigo.trim().toLowerCase();
    if (t.length < 2) return [];
    return lineas
      .filter((l) => l.nombre.toLowerCase().includes(t) || String(l.id).toLowerCase().includes(t))
      .slice(0, 6);
  }, [codigo, lineas]);

  const opcionesDif = [
    ['todo', 'Todo'],
    ['sin', 'Sin diferencia'],
    ['negativa', 'Faltante'],
    ['positiva', 'Sobrante'],
  ];
  const opcionesEstado = [
    ['todo', 'Todo'],
    ['contado', 'Contados'],
    ['no_contado', 'Sin contar'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={onVolver}>
            ← Departamentos
          </button>
          <h4 style={{ margin: 0, color: 'var(--brand-blue)', flex: 1 }}>Inventario libre</h4>
        </div>
        <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
          Escanea o busca productos del camión, indica cuántas piezas contaste y ciérralo. Útil para revisar
          productos sueltos sin recorrer todo un departamento.
        </p>

        <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Icon name="scan" size={16} />
            Escanear o buscar producto
          </span>
          <div style={{ marginTop: '0.35rem' }}>
            <CampoCodigo
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onEscanear={abrirProducto}
              beepAlEnter
              placeholder="Código de barras o nombre…"
              tituloCamara="Inventario libre · camión"
              inputStyle={{ fontSize: '1.05rem', letterSpacing: '0.04em' }}
            />
          </div>
        </label>
        {sugerencias.length > 0 && (
          <div style={{ marginTop: '0.4rem', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {sugerencias.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => abrirProducto(l.id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '0.55rem 0.7rem',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--surface)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span>{l.nombre}</span>
                <span className="muted" style={{ fontSize: '0.8rem' }}>{etiquetaDepartamento(l.cat)} · {l.teorico} pza</span>
              </button>
            ))}
          </div>
        )}

        {pendiente && (
          <div style={{ marginTop: '0.75rem', padding: '0.85rem', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700 }}>{pendiente.nombre}</div>
            <div className="muted" style={{ fontSize: '0.82rem' }}>
              {pendiente.id} · {etiquetaDepartamento(pendiente.cat)} · En el camión: <strong>{pendiente.teorico}</strong>
            </div>
            <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase', marginTop: '0.6rem' }}>Cantidad contada</div>
            <input
              ref={cantRef}
              className="input"
              type="number"
              min={0}
              inputMode="numeric"
              value={cantidad}
              placeholder={String(pendiente.teorico)}
              onChange={(e) => setCantidad(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  aceptarCantidad();
                }
              }}
              style={{ marginTop: '0.2rem', fontSize: '1.35rem', fontWeight: 700, padding: '0.5rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={aceptarCantidad}>
                Agregar a la lista
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPendiente(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.6rem' }}>
          <div className="prod-search-row" style={{ flex: 1, margin: 0 }}>
            <Icon name="search" size={16} />
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la lista" />
          </div>
          <button
            type="button"
            className={`btn ${verFiltros || filtrosActivos ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setVerFiltros((v) => !v)}
          >
            Filtros{filtrosActivos ? ` (${filtrosActivos})` : ''}
          </button>
        </div>

        {verFiltros && (
          <div style={{ display: 'grid', gap: '0.6rem', padding: '0.7rem', border: '1px solid var(--border)', borderRadius: 10, marginBottom: '0.7rem' }}>
            <div>
              <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>Diferencia</div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {opcionesDif.map(([id, label]) => (
                  <button key={id} type="button" className={`btn btn-sm ${filtros.diferencia === id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFiltros({ ...filtros, diferencia: id })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>Estado</div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {opcionesEstado.map(([id, label]) => (
                  <button key={id} type="button" className={`btn btn-sm ${filtros.estado === id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFiltros({ ...filtros, estado: id })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="muted" style={{ fontSize: '0.75rem' }}>
              Departamento
              <select className="select" style={{ marginTop: '0.3rem' }} value={filtros.departamento} onChange={(e) => setFiltros({ ...filtros, departamento: e.target.value })}>
                <option value="">Todos</option>
                {departamentos.map((d) => (
                  <option key={d} value={d}>{etiquetaDepartamento(d)}</option>
                ))}
              </select>
            </label>
            {filtrosActivos > 0 && (
              <div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiltros(FILTROS_VACIOS)}>
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        )}

        {lineasLibre.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Aún no agregas productos. Escanea o busca arriba.</p>
        ) : visibles.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No hay productos con estos filtros.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th>Camión</th>
                  <th>Contada</th>
                  <th>Diferencia</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibles.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.nombre}
                      <div className="muted" style={{ fontSize: '0.72rem' }}>{l.id} · {etiquetaDepartamento(l.cat)}</div>
                    </td>
                    <td>{l.teorico}</td>
                    <td>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        style={{ width: '4.5rem', padding: '0.25rem 0.4rem', fontSize: '0.85rem' }}
                        value={conteos[l.id] ?? ''}
                        onChange={(e) => setConteo(l.id, e.target.value)}
                      />
                    </td>
                    <td style={{ fontWeight: 600, color: colorDiferencia(l) }}>
                      {textoDiferencia(l)}
                      {l.contado != null && l.faltante > 0 ? (
                        <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 400 }}>{fmtMonto(l.perdidaPublico)}</div>
                      ) : null}
                    </td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" title="Quitar de la lista" onClick={() => quitar(l.id)}>
                        <Icon name="trash" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {lineasLibre.length > 0 && (
        <div className="card" style={{ borderTop: '4px solid var(--brand-green)' }}>
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Resumen del inventario libre</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.65rem' }}>
            <div style={{ padding: '0.65rem', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Productos</div>
              <div style={{ fontWeight: 700 }}>{resumen.productos}</div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>{resumen.cuadran} cuadran</div>
            </div>
            <div style={{ padding: '0.65rem', borderRadius: 10, background: 'rgba(220,53,69,0.06)', border: '1px solid rgba(220,53,69,0.2)' }}>
              <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Faltante</div>
              <div style={{ fontWeight: 700, color: 'var(--brand-red)' }}>{resumen.piezasFaltantes} pzs</div>
              <div style={{ fontWeight: 600, color: 'var(--brand-red)', fontSize: '0.8rem' }}>
                Costo {fmtMonto(resumen.perdidaCosto)} · Público {fmtMonto(resumen.perdidaPublico)}
              </div>
            </div>
            <div style={{ padding: '0.65rem', borderRadius: 10, background: 'rgba(225,153,41,0.08)', border: '1px solid rgba(225,153,41,0.25)' }}>
              <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Sobrante</div>
              <div style={{ fontWeight: 700, color: 'var(--brand-gold-dark)' }}>{resumen.piezasSobrantes} pzs</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-success" disabled={guardando} onClick={onTerminar}>
              {guardando ? 'Guardando…' : 'Terminar y generar ticket'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
