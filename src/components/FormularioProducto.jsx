import React, { useRef, useState } from 'react';
import { agregarDepartamentoExtra, etiquetaDepartamento } from '../lib/departamentos.js';
import { leerImagenProductoComoDataUrl } from '../lib/imagenProducto.js';
import {
  OPCIONES_IMPUESTO,
  IVA_DEFAULT,
  GANANCIA_DEFAULT,
  actualizarCampoProducto,
  productoVacio,
} from '../lib/productoForm.js';
import { normalizarCodigosAlt } from '../lib/buscarProductoTexto.js';
import Icon, { BtnLabel } from './Icon.jsx';
import CampoCodigo from './CampoCodigo.jsx';
import { etiquetaTienda } from '../constants/sucursales.js';
import { esAlmacenCentral, etiquetaCedisEmpresa } from '../lib/inventarioMultitienda.js';

export default function FormularioProducto({
  form,
  setForm,
  departamentos,
  onGuardar,
  onEliminar,
  onLimpiar,
  esEdicion,
  onDepartamentoAgregado,
  sucursal,
}) {
  const tiendaLabel = sucursal ? etiquetaTienda(sucursal) : null;
  const enCentral = esAlmacenCentral(sucursal);
  const fotoRef = useRef(null);
  const camaraRef = useRef(null);
  const [nuevoDepto, setNuevoDepto] = useState('');
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [codigoAltDraft, setCodigoAltDraft] = useState('');
  const codigosAlt = normalizarCodigosAlt(form.codigos_alt);

  const setCampo = (campo, valor) => {
    setForm((prev) => actualizarCampoProducto(prev, campo, valor));
  };

  const setCampoSimple = (campo, valor) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  };

  const agregarCodigoAlterno = (raw) => {
    const codigo = String(raw || codigoAltDraft || '').trim();
    if (!codigo) return;
    const idKey = String(form.id || '').trim().toLowerCase();
    if (idKey && codigo.toLowerCase() === idKey) {
      return alert('Ese código ya es el principal del producto.');
    }
    const ya = normalizarCodigosAlt(form.codigos_alt);
    if (ya.some((c) => c.toLowerCase() === codigo.toLowerCase())) {
      setCodigoAltDraft('');
      return;
    }
    setCampoSimple('codigos_alt', [...ya, codigo]);
    setCodigoAltDraft('');
  };

  const quitarCodigoAlterno = (codigo) => {
    const key = String(codigo || '').toLowerCase();
    setCampoSimple(
      'codigos_alt',
      normalizarCodigosAlt(form.codigos_alt).filter((c) => c.toLowerCase() !== key),
    );
  };

  const aplicarFoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProcesandoFoto(true);
    try {
      const dataUrl = await leerImagenProductoComoDataUrl(file);
      setCampoSimple('foto_url', dataUrl);
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setProcesandoFoto(false);
    }
  };

  const agregarDepto = () => {
    const r = agregarDepartamentoExtra(nuevoDepto);
    if (!r.ok) return alert(r.error);
    setCampoSimple('cat', r.codigo);
    setNuevoDepto('');
    onDepartamentoAgregado?.(r.codigo);
    alert(`Departamento "${etiquetaDepartamento(r.codigo)}" agregado.`);
  };

  const sinFoto = !String(form.foto_url || '').trim();

  return (
    <div className="card">
      <h3 style={{ margin: '0 0 1rem', color: 'var(--brand-blue)' }}>{esEdicion ? 'Editar producto' : 'Nuevo producto'}</h3>
      {tiendaLabel && (
        <p className="muted" style={{ margin: '0 0 1rem', fontSize: '0.85rem', padding: '0.65rem 0.75rem', borderRadius: 8, background: 'rgba(59,105,181,0.08)', border: '1px solid rgba(59,105,181,0.18)' }}>
          Catálogo compartido entre todas las tiendas. Precios y datos del producto aplican a toda la cadena.
          {enCentral ? (
            <> En MAIN puedes editar el <strong>{etiquetaCedisEmpresa()}</strong> y el piso de venta.</>
          ) : (
            <> El <strong>piso de venta</strong> que edites es solo de <strong>{tiendaLabel}</strong>. El CEDIS central se administra desde MAIN.</>
          )}
        </p>
      )}

      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 140px', textAlign: 'center' }}>
          <div className="prod-form-foto-wrap" style={{ width: 140, margin: '0 auto' }}>
            <div
              style={{
                width: '140px',
                height: '140px',
                borderRadius: '12px',
                border: '2px dashed var(--border)',
                background: 'var(--surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {form.foto_url ? (
                <img src={form.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span className="muted" style={{ fontSize: '0.75rem', padding: '0.5rem' }}>
                  Sin foto
                </span>
              )}
            </div>
            <button
              type="button"
              className="btn btn-camera btn-camera--icon prod-form-foto-cam"
              disabled={procesandoFoto}
              onClick={() => camaraRef.current?.click()}
              title={procesandoFoto ? 'Procesando…' : 'Tomar foto'}
              aria-label={procesandoFoto ? 'Procesando foto' : 'Tomar foto del producto'}
            >
              <Icon name="camera" size={18} />
            </button>
          </div>
          <input ref={fotoRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" style={{ display: 'none' }} onChange={aplicarFoto} />
          <input
            ref={camaraRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={aplicarFoto}
          />
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: '0.5rem', fontSize: '0.8rem', width: '100%' }}
            disabled={procesandoFoto}
            onClick={() => fotoRef.current?.click()}
          >
            {sinFoto ? 'Subir foto' : 'Cambiar foto'}
          </button>
          {!sinFoto && (
            <button type="button" className="btn btn-ghost" style={{ marginTop: '0.35rem', fontSize: '0.75rem', width: '100%' }} onClick={() => setCampoSimple('foto_url', '')}>
              Quitar foto
            </button>
          )}
        </div>

        <div style={{ flex: '1 1 320px', minWidth: 0 }} className="grid-2">
          <label>
            <span className="muted">Código de barras / código (principal)</span>
            {esEdicion ? (
              <input
                className="input"
                style={{ marginTop: '0.35rem' }}
                value={form.id}
                readOnly
                placeholder="EAN, UPC o clave interna"
              />
            ) : (
              <div style={{ marginTop: '0.35rem' }}>
                <CampoCodigo
                  value={form.id}
                  onChange={(e) => setCampoSimple('id', e.target.value)}
                  onEscanear={(codigo) => setCampoSimple('id', codigo)}
                  beepAlEnter
                  placeholder="Apunta lector o usa Cámara…"
                  tituloCamara="Escanear código de producto"
                />
                <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.78rem' }}>
                  Lector USB/Bluetooth → Enter · Celular → botón Cámara (suena al capturar).
                </p>
              </div>
            )}
          </label>
          <label>
            <span className="muted">Nombre del producto</span>
            <input className="input" style={{ marginTop: '0.35rem' }} value={form.nombre} onChange={(e) => setCampoSimple('nombre', e.target.value)} />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <span className="muted">Códigos alternos (mismo artículo, otro código)</span>
            <p className="muted" style={{ margin: '0.25rem 0 0.5rem', fontSize: '0.78rem' }}>
              Si la compañía saca el mismo producto con código provisional o nuevo, agrégalo aquí: en ventas e
              inventario abrirá este producto (no hay que duplicarlo).
            </p>
            {codigosAlt.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                {codigosAlt.map((c) => (
                  <span
                    key={c}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.25rem 0.45rem',
                      borderRadius: 8,
                      background: 'rgba(59,105,181,0.1)',
                      border: '1px solid rgba(59,105,181,0.35)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    {c}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '0.1rem 0.25rem', color: 'var(--brand-red)' }}
                      title="Quitar código alterno"
                      onClick={() => quitarCodigoAlterno(c)}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 220px' }}>
                <CampoCodigo
                  value={codigoAltDraft}
                  onChange={(e) => setCodigoAltDraft(e.target.value)}
                  onEscanear={(codigo) => agregarCodigoAlterno(codigo)}
                  beepAlEnter
                  placeholder="Escanear o escribir código alterno…"
                  tituloCamara="Escanear código alterno"
                />
              </div>
              <button type="button" className="btn btn-primary" onClick={() => agregarCodigoAlterno()}>
                Agregar código
              </button>
            </div>
          </div>
          <label style={{ gridColumn: '1 / -1' }}>
            <span className="muted">Descripción</span>
            <textarea
              className="input"
              style={{ marginTop: '0.35rem', minHeight: '64px' }}
              value={form.descripcion}
              onChange={(e) => setCampoSimple('descripcion', e.target.value)}
              placeholder="Presentación, contenido, notas para caja…"
            />
          </label>
          <label>
            <span className="muted">Departamento</span>
            <select className="select" style={{ marginTop: '0.35rem' }} value={form.cat} onChange={(e) => setCampoSimple('cat', e.target.value)}>
              {departamentos.map((d) => (
                <option key={d} value={d}>
                  {etiquetaDepartamento(d)}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ flex: '1 1 160px' }}>
              <span className="muted">Nuevo departamento</span>
              <input
                className="input"
                style={{ marginTop: '0.35rem' }}
                value={nuevoDepto}
                onChange={(e) => setNuevoDepto(e.target.value)}
                placeholder="Ej. FARMACIA"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    agregarDepto();
                  }
                }}
              />
            </label>
            <button type="button" className="btn btn-ghost" style={{ marginBottom: '0.05rem' }} onClick={agregarDepto}>
              Agregar
            </button>
          </div>
          <label>
            <span className="muted">Clave SAT (c_ClaveProdServ)</span>
            <input className="input" style={{ marginTop: '0.35rem' }} value={form.clave_sat} onChange={(e) => setCampoSimple('clave_sat', e.target.value)} placeholder="Ej. 50181900" />
          </label>
          <label>
            <span className="muted">Impuesto (IVA)</span>
            <select
              className="select"
              style={{ marginTop: '0.35rem' }}
              value={Number(form.impuesto ?? IVA_DEFAULT)}
              onChange={(e) => setCampo('impuesto', Number(e.target.value))}
            >
              {OPCIONES_IMPUESTO.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div style={{ marginTop: '1.25rem', padding: '1rem', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h4 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)', fontSize: '0.95rem' }}>Precio de compra</h4>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.75rem' }}>
          El <strong>con impuestos</strong> es el precio de Venta en Ruta / CEDIS (no el de mostrador).
        </p>
        <div className="grid-2">
          <label className="muted">
            Sin impuestos (MXN)
            <input
              className="input"
              type="number"
              step="0.01"
              min={0}
              style={{ marginTop: '0.35rem' }}
              value={form.precio_compra_sin}
              onChange={(e) => setCampo('precio_compra_sin', parseFloat(e.target.value) || 0)}
            />
          </label>
          <label className="muted">
            Con impuestos (MXN) — CEDIS Ruta
            <input
              className="input"
              type="number"
              step="0.01"
              min={0}
              style={{ marginTop: '0.35rem', fontWeight: 700, borderColor: '#0f766e' }}
              value={form.precio_compra_con}
              onChange={(e) => setCampo('precio_compra_con', parseFloat(e.target.value) || 0)}
            />
          </label>
        </div>
      </div>

      <div style={{ marginTop: '0.75rem', padding: '1rem', borderRadius: '12px', background: 'rgba(59,105,181,0.06)', border: '1px solid rgba(59,105,181,0.2)' }}>
        <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)', fontSize: '0.95rem' }}>
          Precio de venta
          <span className="muted" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 400, marginTop: '0.2rem' }}>
            Margen {GANANCIA_DEFAULT}% + IVA {Number(form.impuesto ?? IVA_DEFAULT)}% · precio al consumidor en pesos enteros
          </span>
        </h4>
        <div className="grid-2">
          <label className="muted">
            Ganancia (%)
            <input
              className="input"
              type="number"
              step="0.1"
              style={{ marginTop: '0.35rem' }}
              value={form.ganancia_pct}
              onChange={(e) => setCampo('ganancia_pct', parseFloat(e.target.value) || 0)}
            />
          </label>
          <label className="muted">
            Sin impuestos (MXN)
            <input
              className="input"
              type="number"
              step="0.01"
              min={0}
              style={{ marginTop: '0.35rem' }}
              value={form.precio_venta_sin}
              onChange={(e) => setCampo('precio_venta_sin', parseFloat(e.target.value) || 0)}
            />
          </label>
          <label className="muted">
            Con impuestos (MXN) — cobro en caja (pesos enteros)
            <input
              className="input"
              type="number"
              step="1"
              min={0}
              style={{ marginTop: '0.35rem', fontWeight: 700 }}
              value={form.precio_venta_con}
              onChange={(e) => setCampo('precio_venta_con', parseInt(e.target.value, 10) || 0)}
            />
          </label>
          <label className="muted">
            {tiendaLabel ? `Piso · ${tiendaLabel}` : 'Stock piso (mostrador)'}
            <input className="input" type="number" min={0} style={{ marginTop: '0.35rem' }} value={form.stock} onChange={(e) => setCampoSimple('stock', parseInt(e.target.value, 10) || 0)} />
          </label>
          {enCentral && (
            <label className="muted">
              {etiquetaCedisEmpresa()}
              <input className="input" type="number" min={0} style={{ marginTop: '0.35rem' }} value={form.stock_cedis ?? 0} onChange={(e) => setCampoSimple('stock_cedis', parseInt(e.target.value, 10) || 0)} />
            </label>
          )}
          <label className="muted">
            Stock mínimo
            <input className="input" type="number" min={0} style={{ marginTop: '0.35rem' }} value={form.stock_minimo} onChange={(e) => setCampoSimple('stock_minimo', parseInt(e.target.value, 10) || 0)} />
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem', alignItems: 'center' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.en_venta !== false} onChange={(e) => setCampoSimple('en_venta', e.target.checked)} />
          <span className="muted">Disponible en venta (caja)</span>
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={Boolean(form.en_favoritos)} onChange={(e) => setCampoSimple('en_favoritos', e.target.checked)} />
          <span className="muted">Mostrar en favoritos</span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-success" onClick={onGuardar}>
          <BtnLabel icon="save">Guardar producto</BtnLabel>
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => { setForm(productoVacio()); onLimpiar?.(); }}>
          <BtnLabel icon="x">Limpiar formulario</BtnLabel>
        </button>
        {esEdicion && onEliminar && (
          <button type="button" className="btn btn-danger" onClick={onEliminar}>
            <BtnLabel icon="trash">Eliminar producto</BtnLabel>
          </button>
        )}
      </div>
    </div>
  );
}
