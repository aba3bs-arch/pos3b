import React, { useEffect, useMemo, useState } from 'react';
import { etiquetaDepartamento, listarDepartamentos } from '../lib/departamentos.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import {
  construirLineasDesdeProductos,
  eliminarPlantillaPreinventario,
  guardarPlantillaPreinventario,
  guardarSesionPreinventario,
  listarPlantillasPreinventario,
  productosParaPlantilla,
  resumenPreinventario,
} from '../lib/preinventario.js';
import { productoCoincideBusqueda, productoPorCodigoExacto } from '../lib/buscarProductoTexto.js';
import { imprimirPreinventario } from '../lib/impresion.js';
import CampoCodigo from '../components/CampoCodigo.jsx';
import { BtnLabel } from '../components/Icon.jsx';

export default function Preinventario({ supabase, inventario, user, sucursal, onVolver }) {
  const [plantillas, setPlantillas] = useState([]);
  const [aviso, setAviso] = useState('');
  const [msg, setMsg] = useState('');
  const [modo, setModo] = useState('lista'); // lista | nueva | conteo
  const [nombrePlantilla, setNombrePlantilla] = useState('');
  const [tipoPlantilla, setTipoPlantilla] = useState('personal');
  const [departamento, setDepartamento] = useState('GENERAL');
  const [qProd, setQProd] = useState('');
  const [selIds, setSelIds] = useState(() => new Set());
  const [plantillaActiva, setPlantillaActiva] = useState(null);
  const [conteos, setConteos] = useState({});
  const [codigo, setCodigo] = useState('');

  const departamentos = useMemo(() => listarDepartamentos(inventario), [inventario]);

  const recargar = async () => {
    const r = await listarPlantillasPreinventario(supabase, sucursal);
    setPlantillas(r.data || []);
    if (r.aviso) setAviso(r.aviso);
  };

  useEffect(() => {
    void recargar();
  }, [supabase, sucursal]);

  const productosFiltro = useMemo(() => {
    const t = qProd.trim();
    let list = inventario || [];
    if (t) list = list.filter((p) => productoCoincideBusqueda(p, t));
    return list.slice(0, 80);
  }, [inventario, qProd]);

  const mapaProd = useMemo(() => {
    const m = new Map();
    for (const p of inventario || []) m.set(String(p.id), p);
    return m;
  }, [inventario]);

  const lineas = useMemo(() => {
    if (!plantillaActiva) return [];
    const prods = (plantillaActiva.productos || [])
      .map((ref) => mapaProd.get(String(ref.id)))
      .filter(Boolean);
    return construirLineasDesdeProductos(prods, sucursal, conteos);
  }, [plantillaActiva, mapaProd, sucursal, conteos]);

  const resumen = useMemo(() => resumenPreinventario(lineas), [lineas]);

  const crearPlantilla = async () => {
    setMsg('');
    const productos = productosParaPlantilla(inventario, {
      tipo: tipoPlantilla,
      departamento,
      idsSeleccionados: [...selIds],
    });
    if (!productos.length) {
      setMsg('Agrega productos o elige un departamento con mercancía.');
      return;
    }
    const res = await guardarPlantillaPreinventario(supabase, {
      sucursal_id: sucursal,
      nombre: nombrePlantilla || (tipoPlantilla === 'departamento' ? `Depto ${departamento}` : 'Mi plantilla'),
      tipo: tipoPlantilla,
      departamento: tipoPlantilla === 'departamento' ? departamento : null,
      creado_por: user?.nombre,
      creado_por_id: user?.id,
      productos,
    });
    if (!res.ok) {
      setMsg(res.error || 'No se pudo guardar.');
      return;
    }
    if (res.aviso) setAviso(res.aviso);
    setMsg('Plantilla guardada. No afecta el inventario teórico.');
    setModo('lista');
    setNombrePlantilla('');
    setSelIds(new Set());
    await recargar();
  };

  const abrirConteo = (plantilla) => {
    setPlantillaActiva(plantilla);
    setConteos({});
    setModo('conteo');
    setMsg('');
  };

  const registrarEscaneo = (raw) => {
    const codigoTxt = String(raw || '').trim();
    if (!codigoTxt) return;
    const prod = productoPorCodigoExacto(inventario, codigoTxt);
    if (!prod) {
      setMsg(`No se encontró ${codigoTxt}`);
      return;
    }
    const enPlantilla = (plantillaActiva?.productos || []).some((p) => String(p.id) === String(prod.id));
    if (!enPlantilla) {
      setMsg(`${prod.nombre} no está en esta plantilla.`);
      return;
    }
    setConteos((prev) => {
      const actual = prev[prod.id];
      const n = actual == null || String(actual).trim() === '' ? 0 : Math.floor(Number(actual) || 0);
      return { ...prev, [prod.id]: String(n + 1) };
    });
    setMsg(`+1 ${prod.nombre}`);
    setCodigo('');
  };

  const imprimir = () => {
    imprimirPreinventario({
      sucursal,
      usuario: user?.nombre,
      nombre: plantillaActiva?.nombre,
      departamento: plantillaActiva?.departamento,
      lineas,
      resumen,
    });
  };

  const cerrarYGuardar = async () => {
    const res = await guardarSesionPreinventario(supabase, {
      sucursal_id: sucursal,
      plantilla_id: plantillaActiva?.id,
      nombre: plantillaActiva?.nombre || 'Preinventario',
      creado_por: user?.nombre,
      creado_por_id: user?.id,
      lineas,
      estado: 'cerrada',
    });
    if (!res.ok) {
      setMsg(res.error || 'No se pudo guardar el conteo.');
      return;
    }
    if (res.aviso) setAviso(res.aviso);
    setMsg('Preinventario cerrado. El inventario teórico no cambió.');
    imprimir();
    setModo('lista');
    setPlantillaActiva(null);
  };

  const borrarPlantilla = async (p) => {
    if (!confirm(`¿Borrar plantilla «${p.nombre}»?`)) return;
    const res = await eliminarPlantillaPreinventario(supabase, p.id, sucursal);
    if (!res.ok) setMsg(res.error || 'No se pudo borrar.');
    else {
      setMsg('Plantilla borrada.');
      await recargar();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--brand-blue-dark)' }}>Preinventario</h3>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            {etiquetaTienda(sucursal)} · control interno de mercancía · no modifica el inventario teórico
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {modo !== 'lista' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setModo('lista'); setPlantillaActiva(null); }}>
              Volver a plantillas
            </button>
          )}
          {onVolver && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onVolver}>
              Cerrar
            </button>
          )}
        </div>
      </div>

      {aviso && <p className="muted" style={{ margin: 0 }}>{aviso}</p>}
      {msg && <p style={{ margin: 0, color: 'var(--brand-blue)' }}>{msg}</p>}

      {modo === 'lista' && (
        <>
          <button type="button" className="btn btn-primary" style={{ alignSelf: 'start' }} onClick={() => setModo('nueva')}>
            <BtnLabel icon="plus">Nueva plantilla</BtnLabel>
          </button>
          {plantillas.length === 0 ? (
            <p className="muted">Aún no hay plantillas. Crea una personal o por departamento.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Productos</th>
                    <th>Creó</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {plantillas.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.nombre}</strong></td>
                      <td>
                        {p.tipo === 'departamento'
                          ? `Depto · ${etiquetaDepartamento(p.departamento || 'GENERAL')}`
                          : 'Personal'}
                      </td>
                      <td>{(p.productos || []).length}</td>
                      <td className="muted">{p.creado_por || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => abrirConteo(p)}>
                            Contar
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => borrarPlantilla(p)}>
                            Borrar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modo === 'nueva' && (
        <div className="card" style={{ display: 'grid', gap: '0.75rem', maxWidth: 640 }}>
          <label>
            <span className="muted" style={{ fontSize: '0.82rem' }}>Nombre</span>
            <input className="input" value={nombrePlantilla} onChange={(e) => setNombrePlantilla(e.target.value)} placeholder="Ej. Mi anaquel frío" />
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="radio" checked={tipoPlantilla === 'personal'} onChange={() => setTipoPlantilla('personal')} />
              Personal (elijo productos)
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="radio" checked={tipoPlantilla === 'departamento'} onChange={() => setTipoPlantilla('departamento')} />
              Por departamento
            </label>
          </div>
          {tipoPlantilla === 'departamento' ? (
            <label>
              <span className="muted" style={{ fontSize: '0.82rem' }}>Departamento</span>
              <select className="select" value={departamento} onChange={(e) => setDepartamento(e.target.value)}>
                {departamentos.map((d) => (
                  <option key={d} value={d}>{etiquetaDepartamento(d)}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <input className="input" value={qProd} onChange={(e) => setQProd(e.target.value)} placeholder="Buscar producto…" />
              <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {productosFiltro.map((p) => {
                  const on = selIds.has(String(p.id));
                  return (
                    <label
                      key={p.id}
                      style={{
                        display: 'flex',
                        gap: 8,
                        padding: '0.45rem 0.6rem',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: on ? 'rgba(59,105,181,0.08)' : undefined,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          setSelIds((prev) => {
                            const n = new Set(prev);
                            if (n.has(String(p.id))) n.delete(String(p.id));
                            else n.add(String(p.id));
                            return n;
                          });
                        }}
                      />
                      <span style={{ flex: 1 }}>{p.nombre}</span>
                      <span className="muted" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.id}</span>
                    </label>
                  );
                })}
              </div>
              <p className="muted" style={{ margin: 0 }}>{selIds.size} seleccionado(s)</p>
            </>
          )}
          <button type="button" className="btn btn-primary" onClick={crearPlantilla}>
            Guardar plantilla
          </button>
        </div>
      )}

      {modo === 'conteo' && plantillaActiva && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="card" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <strong>{plantillaActiva.nombre}</strong>
            <span className="muted">
              Contados {resumen.contados}/{resumen.productos} · Faltante {resumen.faltante} · Sobrante {resumen.sobrante}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={imprimir}>
                <BtnLabel icon="print">Imprimir ticket</BtnLabel>
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={cerrarYGuardar}>
                Cerrar e imprimir
              </button>
            </div>
          </div>
          <CampoCodigo
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onEscanear={registrarEscaneo}
            beepAlEnter
            placeholder="Escanear o escribir código…"
            tituloCamara="Escanear preinventario"
          />
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Teórico*</th>
                  <th>Contado</th>
                  <th>Dif.</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontFamily: 'monospace' }}>{l.id}</td>
                    <td>{l.nombre}</td>
                    <td>{l.teorico}</td>
                    <td style={{ minWidth: 90 }}>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={conteos[l.id] ?? ''}
                        onChange={(e) => setConteos((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        style={{ width: 80 }}
                      />
                    </td>
                    <td style={{ color: l.diferencia == null ? undefined : l.diferencia < 0 ? 'var(--danger)' : l.diferencia > 0 ? '#15803d' : undefined }}>
                      {l.diferencia == null ? '—' : l.diferencia > 0 ? `+${l.diferencia}` : l.diferencia}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
            *Referencia del sistema. Este preinventario no aplica ni corrige el inventario teórico.
          </p>
        </div>
      )}
    </div>
  );
}
