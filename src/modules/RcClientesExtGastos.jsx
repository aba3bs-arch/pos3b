import React, { useMemo, useState } from 'react';
import { fmtMonto } from '../lib/consultasUi.js';
import {
  crearNodoCatalogoExt,
  prepararGastoExt,
  puedeQuitarDelCatalogo,
  quitarGastoClienteExt,
  quitarNodoCatalogoExt,
  registrarGastoClienteExt,
  resumenVentaConGastos,
} from '../lib/rcClientesExtGastos.js';

const COLOR = '#0f766e';

const campo = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: '16px',
  minHeight: 44,
};

function fecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-MX', {
    timeZone: 'America/Phoenix',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Fila({ children }) {
  return <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>{children}</label>;
}

export default function RcClientesExtGastos({
  supabase,
  user,
  totales,
  arbol = [],
  gastos = [],
  avisoTabla = '',
  onCambio,
}) {
  const resumen = resumenVentaConGastos(totales, gastos);
  const [categoriaId, setCategoriaId] = useState('');
  const [subcategoriaId, setSubcategoriaId] = useState('');
  const [detalleId, setDetalleId] = useState('');
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [nombreCat, setNombreCat] = useState('');
  const [catPadre, setCatPadre] = useState('');
  const [nombreSub, setNombreSub] = useState('');
  const [catDetalle, setCatDetalle] = useState('');
  const [subDetalle, setSubDetalle] = useState('');
  const [nombreDet, setNombreDet] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);

  const catGasto = arbol.find((c) => c.id === categoriaId) || null;
  const subsGasto = catGasto?.subcategorias || [];
  const subGasto = subsGasto.find((s) => s.id === subcategoriaId) || null;
  const detsGasto = subGasto?.detalles || [];
  const subsDeDetalle = useMemo(
    () => arbol.find((c) => c.id === catDetalle)?.subcategorias || [],
    [arbol, catDetalle],
  );

  const terminar = async (res, limpiar) => {
    setGuardando(false);
    if (!res.ok) {
      setAviso(res.error || 'No se pudo guardar.');
      return;
    }
    setAviso('');
    if (limpiar) limpiar();
    if (onCambio) await onCambio();
  };

  const agregar = async (nivel, parentId, nombre, limpiar) => {
    if (guardando) return;
    setGuardando(true);
    const res = await crearNodoCatalogoExt(supabase, { nivel, parentId, nombre, arbol });
    await terminar(res, limpiar);
  };

  const quitarNodo = async (id, nombre) => {
    const puede = puedeQuitarDelCatalogo(arbol, id, gastos);
    if (!puede.ok) {
      setAviso(puede.error);
      return;
    }
    if (!window.confirm(`¿Quitar «${nombre}» del catálogo?`)) return;
    setGuardando(true);
    const res = await quitarNodoCatalogoExt(supabase, { id, arbol, gastos });
    await terminar(res);
  };

  const registrar = async () => {
    if (guardando) return;
    const listo = prepararGastoExt({
      categoriaId, subcategoriaId, detalleId, monto, nota, arbol,
    });
    if (!listo.ok) {
      setAviso(listo.error);
      return;
    }
    const ruta = `${listo.gasto.categoria_nombre} › ${listo.gasto.subcategoria_nombre} › ${listo.gasto.detalle_nombre}`;
    if (!window.confirm(`¿Registrar gasto de ${fmtMonto(listo.gasto.monto)}?\n${ruta}\nSe resta de la venta.`)) return;
    setGuardando(true);
    const res = await registrarGastoClienteExt(supabase, {
      categoriaId,
      subcategoriaId,
      detalleId,
      monto,
      nota,
      arbol,
      usuarioNombre: user?.nombre || '',
    });
    await terminar(res, () => {
      setMonto('');
      setNota('');
    });
  };

  const quitarGasto = async (gasto) => {
    const ruta = `${gasto.categoria_nombre} › ${gasto.subcategoria_nombre} › ${gasto.detalle_nombre}`;
    if (!window.confirm(`¿Quitar el gasto de ${fmtMonto(gasto.monto)}?\n${ruta}\nVuelve a sumarse a la venta.`)) return;
    setGuardando(true);
    const res = await quitarGastoClienteExt(supabase, { id: gasto.id });
    await terminar(res);
  };

  return (
    <div style={{ display: 'grid', gap: '0.85rem' }}>
      <div className="card" style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>Venta</p>
          <strong>{fmtMonto(resumen.venta)}</strong>
        </div>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>Gastos</p>
          <strong>{fmtMonto(resumen.gastos)}</strong>
        </div>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>Venta neta</p>
          <strong style={{ color: resumen.neta < 0 ? '#b45309' : COLOR }}>{fmtMonto(resumen.neta)}</strong>
        </div>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
        La venta es el efectivo más el crédito dejado. Cada gasto se resta de esa venta.
      </p>
      {(aviso || avisoTabla) && (
        <div className="card" style={{ borderLeft: '4px solid #b45309' }}>
          <p style={{ margin: 0 }}>{aviso || avisoTabla}</p>
        </div>
      )}

      <div className="card" style={{ borderTop: `4px solid ${COLOR}`, display: 'grid', gap: '0.7rem' }}>
        <strong style={{ color: COLOR }}>Registrar gasto</strong>
        <Fila>
          Categoría
          <select className="input" style={campo} value={categoriaId} onChange={(e) => {
            setCategoriaId(e.target.value);
            setSubcategoriaId('');
            setDetalleId('');
          }}>
            <option value="">Elige categoría</option>
            {arbol.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Fila>
        <Fila>
          Subcategoría
          <select className="input" style={campo} value={subcategoriaId} onChange={(e) => {
            setSubcategoriaId(e.target.value);
            setDetalleId('');
          }}>
            <option value="">Elige subcategoría</option>
            {subsGasto.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </Fila>
        <Fila>
          Detalle
          <select className="input" style={campo} value={detalleId} onChange={(e) => setDetalleId(e.target.value)}>
            <option value="">Elige detalle</option>
            {detsGasto.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </Fila>
        <Fila>
          Monto
          <input className="input" inputMode="decimal" style={campo} value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" />
        </Fila>
        <Fila>
          Nota
          <input className="input" style={campo} value={nota} maxLength={160} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" />
        </Fila>
        <button type="button" className="btn btn-primary" style={{ minHeight: 44 }} disabled={guardando} onClick={() => { void registrar(); }}>
          {guardando ? 'Guardando…' : 'Registrar gasto'}
        </button>
      </div>

      <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
        <strong style={{ color: COLOR }}>Catálogo</strong>
        <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
          Tres niveles: categoría, subcategoría y detalle. El gasto siempre se registra en el detalle.
        </p>
        <Fila>
          Nueva categoría
          <input className="input" style={campo} value={nombreCat} maxLength={80} onChange={(e) => setNombreCat(e.target.value)} placeholder="Ej. Operación" />
        </Fila>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} disabled={guardando || !nombreCat.trim()} onClick={() => { void agregar(1, null, nombreCat, () => setNombreCat('')); }}>
          Agregar categoría
        </button>
        <Fila>
          Nueva subcategoría
          <select className="input" style={campo} value={catPadre} onChange={(e) => setCatPadre(e.target.value)}>
            <option value="">Categoría</option>
            {arbol.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <input className="input" style={campo} value={nombreSub} maxLength={80} onChange={(e) => setNombreSub(e.target.value)} placeholder="Ej. Combustible" />
        </Fila>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} disabled={guardando || !nombreSub.trim() || !catPadre} onClick={() => { void agregar(2, catPadre, nombreSub, () => setNombreSub('')); }}>
          Agregar subcategoría
        </button>
        <Fila>
          Nuevo detalle
          <select className="input" style={campo} value={catDetalle} onChange={(e) => { setCatDetalle(e.target.value); setSubDetalle(''); }}>
            <option value="">Categoría</option>
            {arbol.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className="input" style={campo} value={subDetalle} onChange={(e) => setSubDetalle(e.target.value)}>
            <option value="">Subcategoría</option>
            {subsDeDetalle.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <input className="input" style={campo} value={nombreDet} maxLength={80} onChange={(e) => setNombreDet(e.target.value)} placeholder="Ej. Gasolina" />
        </Fila>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} disabled={guardando || !nombreDet.trim() || !subDetalle} onClick={() => { void agregar(3, subDetalle, nombreDet, () => setNombreDet('')); }}>
          Agregar detalle
        </button>

        {arbol.length === 0 && <p className="muted" style={{ margin: 0 }}>Todavía no hay categorías.</p>}
        {arbol.map((cat) => (
          <div key={cat.id} style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: '0.45rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', minHeight: 44 }}>
              <strong>{cat.nombre}</strong>
              <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} disabled={guardando} onClick={() => { void quitarNodo(cat.id, cat.nombre); }}>Quitar</button>
            </div>
            {(cat.subcategorias || []).map((sub) => (
              <div key={sub.id} style={{ paddingLeft: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', minHeight: 44 }}>
                  <span>{sub.nombre}</span>
                  <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} disabled={guardando} onClick={() => { void quitarNodo(sub.id, sub.nombre); }}>Quitar</button>
                </div>
                {(sub.detalles || []).map((det) => (
                  <div key={det.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', minHeight: 44, paddingLeft: '0.75rem' }}>
                    <span className="muted">{det.nombre}</span>
                    <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} disabled={guardando} onClick={() => { void quitarNodo(det.id, det.nombre); }}>Quitar</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="card" style={{ display: 'grid', gap: '0.55rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
          <strong style={{ color: COLOR }}>Gastos registrados</strong>
          <strong>{fmtMonto(resumen.gastos)}</strong>
        </div>
        {gastos.length === 0 && <p className="muted" style={{ margin: 0 }}>Todavía no hay gastos.</p>}
        {gastos.map((g) => (
          <div key={g.id} style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: '0.45rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: 'block' }}>{g.categoria_nombre} › {g.subcategoria_nombre} › {g.detalle_nombre}</strong>
                <span className="muted" style={{ fontSize: '0.78rem' }}>
                  {fecha(g.created_at)}{g.notas ? ` · ${g.notas}` : ''}{g.usuario_nombre ? ` · ${g.usuario_nombre}` : ''}
                </span>
              </span>
              <strong style={{ flexShrink: 0 }}>{fmtMonto(g.monto)}</strong>
            </div>
            <button type="button" className="btn btn-ghost" style={{ minHeight: 44, marginTop: 4 }} disabled={guardando} onClick={() => { void quitarGasto(g); }}>
              Quitar gasto
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
