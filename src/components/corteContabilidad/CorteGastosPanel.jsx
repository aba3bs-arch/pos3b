import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  agregarSubcategoriaGasto,
  eliminarCategoriaGasto,
  guardarCategoriaGasto,
  listarCatalogoGastos,
  renombrarCategoriaGasto,
  gastoRequiereEmpleado,
  gastoDescuentaNomina,
} from '../../lib/corteContabilidad/catalogoGastos.js';
import {
  agruparEmpleadosParaSelectCorte,
  empleadosParaCorte,
  esEmpleadoConsumoPinCorte,
  empleadoPermitidoEnGastoCorte,
  etiquetaEmpleadoSelectGastos,
  gastoCorteRequierePinConsumoBeneficiario,
  textoMencionaPersonalIndirecto,
} from '../../lib/empleadosVisibles.js';
import {
  resolverBeneficiarioConsumoPin,
  verificarPinBeneficiarioConsumo,
} from '../../lib/pinBeneficiarioConsumo.js';
import InputPin from '../InputPin.jsx';
import { esUsuarioCubreTurno } from '../../lib/cubreTurno.js';
import { esCategoriaEmpleado } from '../../lib/catalogoEmpleadoGastos.js';
import { etiquetaTienda, normalizarCodigoTienda } from '../../constants/sucursales.js';
import { asegurarCamposSinReservadoOPin } from '../../lib/reservadoAdminPrincipal.js';
import { esGastoSmokingAbarrotes } from '../../lib/corteContabilidad/smokingSustentoInventario.js';
import { normalizarFolioTrp } from '../../lib/foliosInventario.js';

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

const btnSm = { fontSize: '0.75rem', padding: '0.25rem 0.5rem' };

function contarReales(lista) {
  return (lista || []).filter((e) => {
    if (!e) return false;
    const id = String(e.id || '');
    return !id.startsWith('indirect:') && !id.startsWith('consumo-pin:');
  }).length;
}

function normalizarParaTokens(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function esGastoTraspasoTxt(txt) {
  const k = normalizarParaTokens(txt);
  return k.includes('TRASPASO') || k.includes('ENVIO MAIN');
}

function parseFoliosTraspasoInput(raw) {
  const s = String(raw || '');
  return s
    .split(/[\s,;\n]+/g)
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .map((x) => normalizarFolioTrp(x.replace(/\s+/g, '')))
    .filter(Boolean)
    .filter((x, i, arr) => arr.indexOf(x) === i);
}

export default function CorteGastosPanel({
  modulo,
  supabase,
  sucursal,
  user,
  gastos,
  empleados,
  onAgregar,
  onEliminar,
  onEditar,
  habilitado,
  puedeCatalogo,
  puedeEditarGastos,
  notaNomina,
}) {
  const [catalogo, setCatalogo] = useState([]);
  const [cat, setCat] = useState('');
  const [sub, setSub] = useState('');
  const [monto, setMonto] = useState('');
  const [comentario, setComentario] = useState('');
  const [folioTraspaso, setFolioTraspaso] = useState('');
  const [folioInventarioSmoking, setFolioInventarioSmoking] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [pinConsumoBenef, setPinConsumoBenef] = useState('');
  const [mostrarCat, setMostrarCat] = useState(false);
  const [usuariosRaw, setUsuariosRaw] = useState([]);
  const [avisoEmp, setAvisoEmp] = useState('');

  const cargarUsuarios = useCallback(async () => {
    if (!supabase) {
      setUsuariosRaw([]);
      return;
    }
    const intentos = [
      'id, nombre, rol, sucursal_id, tipo_empleado, nomina_pagador, activo',
      'id, nombre, rol, sucursal_id, tipo_empleado, activo',
      'id, nombre, rol, sucursal_id, activo',
      '*',
    ];
    let lastErr = null;
    for (const cols of intentos) {
      const res = await supabase.from('usuarios').select(cols).order('nombre');
      if (!res.error) {
        setUsuariosRaw(res.data || []);
        setAvisoEmp('');
        return;
      }
      lastErr = res.error;
    }
    setUsuariosRaw([]);
    setAvisoEmp(lastErr?.message || 'No se pudieron cargar empleados desde usuarios.');
  }, [supabase]);

  useEffect(() => {
    cargarUsuarios();
  }, [cargarUsuarios]);

  const empleadosEfectivos = useMemo(() => {
    const opts = { esCubreTurno: esUsuarioCubreTurno(user), user };
    const desdeRaw = empleadosParaCorte(usuariosRaw, sucursal, modulo, user?.rol, opts);
    const desdeProp = empleadosParaCorte(empleados || [], sucursal, modulo, user?.rol, opts);
    return contarReales(desdeRaw) >= contarReales(desdeProp) ? desdeRaw : desdeProp.length ? desdeProp : desdeRaw;
  }, [usuariosRaw, empleados, sucursal, modulo, user]);

  const gruposEmpleados = useMemo(
    () => agruparEmpleadosParaSelectCorte(empleadosEfectivos),
    [empleadosEfectivos],
  );
  const totalEmpleadosSelect = (gruposEmpleados.tienda?.length || 0)
    + (gruposEmpleados.consumoPin?.length || 0);

  const empSeleccionadoPreview = useMemo(
    () => (empleadosEfectivos || []).find((e) => String(e.id) === String(usuarioId)) || null,
    [empleadosEfectivos, usuarioId],
  );
  const requierePinConsumo = Boolean(
    empSeleccionadoPreview
    && gastoCorteRequierePinConsumoBeneficiario(empSeleccionadoPreview, sub),
  );
  const pinConsumoMeta = requierePinConsumo
    ? resolverBeneficiarioConsumoPin(empSeleccionadoPreview?.nombre)
    : null;

  const cargarCat = useCallback(async () => {
    const res = await listarCatalogoGastos(supabase, sucursal, modulo);
    const lista = res.data?.length ? res.data : [];
    setCatalogo(lista);
  }, [supabase, sucursal, modulo]);

  useEffect(() => {
    cargarCat();
  }, [cargarCat]);

  const subsDeCat = catalogo.find((c) => c.categoria === cat)?.subcategorias || [];
  const filaCat = catalogo.find((c) => c.categoria === cat);
  const esCatEmpleado = Boolean(
    filaCat?.es_categoria_empleado || esCategoriaEmpleado(filaCat || { categoria: cat }),
  );
  // Flujo EMPLEADO: Categoría → lista Empleado → Concepto (Consumo…). Legacy igual pide persona.
  const requiereEmpleado = esCatEmpleado || gastoRequiereEmpleado(modulo, cat, sub);
  const conceptosEmpleado = esCatEmpleado ? subsDeCat : [];

  const empSeleccionado = requiereEmpleado
    ? (empleadosEfectivos || []).find((e) => String(e.id) === String(usuarioId))
    : null;
  const rutaGasto = esCatEmpleado
    ? [cat || null, empSeleccionado?.nombre || 'Empleado', sub || null].filter(Boolean).join(' · ')
    : [cat || null, sub || null].filter(Boolean).join(' · ');

  const esGastoTraspaso =
    String(modulo || '').toLowerCase() === 'abarrotes' && esGastoTraspasoTxt(`${cat} ${sub} ${comentario}`);

  const esGastoSmoking = esGastoSmokingAbarrotes(modulo, {
    categoria: cat,
    subcategoria: sub,
    comentario,
  });

  useEffect(() => {
    if (!habilitado || !catalogo.length) return;
    setCat((prev) => {
      if (prev && catalogo.some((c) => c.categoria === prev)) return prev;
      const emp = catalogo.find((c) => c.es_categoria_empleado || esCategoriaEmpleado(c));
      return emp?.categoria || catalogo[0].categoria;
    });
  }, [habilitado, catalogo]);

  useEffect(() => {
    if (!habilitado || !cat) return;
    const row = catalogo.find((c) => c.categoria === cat);
    const esEmp = Boolean(row?.es_categoria_empleado || esCategoriaEmpleado(row || { categoria: cat }));
    const subs = row?.subcategorias || [];
    // En EMPLEADO, "sub" guarda el concepto (Consumo…); la persona va en usuarioId.
    setSub((prev) => {
      if (prev && subs.includes(prev)) return prev;
      return subs[0] || '';
    });
    if (!esEmp && !gastoRequiereEmpleado(modulo, cat, subs[0] || '')) {
      setUsuarioId('');
    }
  }, [habilitado, cat, catalogo, modulo]);

  const agregar = async () => {
    const m = Number(monto);
    if (!(m > 0)) return alert('Monto inválido.');
    if (!cat.trim()) return alert('Selecciona categoría.');
    if (requiereEmpleado && !usuarioId) {
      return alert('Selecciona el empleado a quien se descontará el consumo en nómina.');
    }
    let emp = requiereEmpleado
      ? (empleadosEfectivos || []).find((e) => String(e.id) === String(usuarioId))
      : null;
    if (emp && !empleadoPermitidoEnGastoCorte(emp, { modulo })) {
      return alert(
        'En cortes solo se permiten empleados de tienda (directos), o Misael / Luis Enrique en consumo con su PIN.',
      );
    }
    let usuarioIdFinal = emp?.id;
    let usuarioNombreFinal = emp?.nombre || null;
    if (emp && gastoCorteRequierePinConsumoBeneficiario(emp, sub)) {
      const quien = resolverBeneficiarioConsumoPin(emp.nombre)?.etiqueta || emp.nombre;
      if (!String(pinConsumoBenef || '').trim()) {
        return alert(`Consumo a nombre de ${quien}: él debe ingresar su PIN (invisible).`);
      }
      const pinRes = await verificarPinBeneficiarioConsumo(supabase, pinConsumoBenef, emp.nombre);
      if (!pinRes.ok) return alert(pinRes.error);
      // Usar el usuario real del PIN (no el placeholder consumo-pin:…).
      if (pinRes.usuario?.id) {
        usuarioIdFinal = pinRes.usuario.id;
        usuarioNombreFinal = pinRes.usuario.nombre || emp.nombre;
        emp = { ...emp, id: pinRes.usuario.id, nombre: usuarioNombreFinal };
      }
    }
    const comentarioTrim = comentario.trim();
    if (textoMencionaPersonalIndirecto(comentarioTrim, usuariosRaw)) {
      const soloElMismo = emp
        && esEmpleadoConsumoPinCorte(emp)
        && !textoMencionaPersonalIndirecto(
          comentarioTrim.replace(
            new RegExp(String(emp.nombre || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'),
            '',
          ),
          usuariosRaw,
        );
      if (!soloElMismo) {
        return alert(
          'No puedes escribir nombres de personal indirecto / MAIN en el comentario del gasto.',
        );
      }
    }
    if (esGastoTraspaso) {
      const folios = parseFoliosTraspasoInput(folioTraspaso);
      if (!folios.length) {
        return alert(
          'Traspaso requiere el folio del envío (ej. trp-5-0020).\n\n' +
            'Ve a Productos → Traspasos y copia el folio trp-{suc}-XXXX del traspaso recibido o enviado a esta tienda.',
        );
      }
    }
    if (esGastoSmoking) {
      const folios = String(folioInventarioSmoking || '')
        .split(/[\s,;\n]+/g)
        .map((x) => x.trim())
        .filter(Boolean);
      if (!folios.length) {
        return alert(
          'Smoking requiere folio de inventario (CMP-…, ING-… o trp-…).\n\n' +
            'Así se evita registrar el mismo ticket varias veces sin mercancía.\n' +
            'Cópialo de Compras (recepción/entrega) o de Consultas → Inventario.',
        );
      }
    }
    const authTxt = await asegurarCamposSinReservadoOPin(
      supabase,
      [cat, sub, comentario, folioTraspaso, folioInventarioSmoking],
      { user, sucursal },
    );
    if (!authTxt.ok) return alert(authTxt.error);
    const uid = usuarioIdFinal != null ? String(usuarioIdFinal) : '';
    const esPlaceholder = !uid
      || uid.startsWith('indirect:')
      || uid.startsWith('consumo-pin:');
    // Nómina toma gastos EMPLEADO·CONSUMO con descontado_nomina = false (pendiente de periodo).
    try {
      const res = await onAgregar?.({
        categoria: cat.trim().toUpperCase(),
        subcategoria: sub.trim().toUpperCase(),
        monto: m,
        comentario: comentarioTrim.toUpperCase(),
        usuario_id: requiereEmpleado && !esPlaceholder ? uid : null,
        usuario_nombre: usuarioNombreFinal || emp?.nombre || '',
        descontado_nomina: false,
        folio_traspaso: esGastoTraspaso ? parseFoliosTraspasoInput(folioTraspaso) : [],
        folios_inventario: esGastoSmoking
          ? String(folioInventarioSmoking || '')
              .split(/[\s,;\n]+/g)
              .map((x) => x.trim())
              .filter(Boolean)
          : [],
      });
      if (res && res.ok === false) return;
    } catch (e) {
      return alert(e?.message || 'Error al agregar el gasto.');
    }
    setMonto('');
    setComentario('');
    setFolioTraspaso('');
    setFolioInventarioSmoking('');
    setPinConsumoBenef('');
    if (!requiereEmpleado) setUsuarioId('');
  };

  const nuevaCategoria = async () => {
    const nombre = prompt('Nombre de la categoría:');
    if (!nombre?.trim()) return;
    const authTxt = await asegurarCamposSinReservadoOPin(supabase, [nombre], { user, sucursal });
    if (!authTxt.ok) return alert(authTxt.error);
    const res = await guardarCategoriaGasto(supabase, sucursal, modulo, nombre, []);
    if (!res.ok) return alert(res.error);
    cargarCat();
  };

  const nuevaSubcategoria = async (categoria) => {
    const nombre = prompt(`Subcategoría para ${categoria}:`);
    if (!nombre?.trim()) return;
    const authTxt = await asegurarCamposSinReservadoOPin(supabase, [nombre], { user, sucursal });
    if (!authTxt.ok) return alert(authTxt.error);
    const res = await agregarSubcategoriaGasto(supabase, sucursal, modulo, categoria, nombre);
    if (!res.ok) return alert(res.error);
    cargarCat();
  };

  const editarCategoria = async (categoria) => {
    const row = catalogo.find((c) => c.categoria === categoria);
    if (!row) return;
    const esEmp = Boolean(row.es_categoria_empleado || esCategoriaEmpleado(row));
    let nombre = row.categoria;
    if (!esEmp) {
      const nuevo = prompt('Nuevo nombre de categoría:', row.categoria);
      if (!nuevo?.trim()) return;
      nombre = nuevo;
    }
    const subsTxt = prompt(
      esEmp
        ? 'Tipos de EMPLEADO (Consumo, Anticipo…). Separados por coma. No renombres la categoría ni pongas nombres de personas aquí.'
        : 'Subcategorías (separadas por coma):',
      (row.subcategorias || []).join(', '),
    );
    if (subsTxt == null) return;
    const authTxt = await asegurarCamposSinReservadoOPin(supabase, [nombre, subsTxt], { user, sucursal });
    if (!authTxt.ok) return alert(authTxt.error);
    const subs = subsTxt
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await renombrarCategoriaGasto(supabase, sucursal, modulo, categoria, nombre, subs);
    if (!res.ok) return alert(res.error);
    if (cat === categoria && !esEmp) setCat(nombre.trim().toUpperCase());
    cargarCat();
  };

  const borrarCat = async (categoria) => {
    const row = catalogo.find((c) => c.categoria === categoria);
    if (row?.es_categoria_empleado || esCategoriaEmpleado(row || { categoria })) {
      return alert('EMPLEADO no se elimina. Es la categoría de nómina (empleados de tienda).');
    }
    if (!confirm(`¿Eliminar categoría ${categoria}?`)) return;
    const res = await eliminarCategoriaGasto(supabase, sucursal, modulo, categoria);
    if (!res.ok) return alert(res.error);
    if (cat === categoria) {
      setCat('');
      setSub('');
    }
    cargarCat();
  };

  return (
    <div className="card" style={{ margin: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>Gastos del turno</h4>
        {puedeCatalogo && (
          <button type="button" className="btn btn-ghost" style={btnSm} onClick={() => setMostrarCat((o) => !o)}>
            {mostrarCat ? 'Ocultar catálogo' : 'Catálogo'}
          </button>
        )}
      </div>
      <p className="muted" style={{ fontSize: '0.75rem', margin: '0.35rem 0 0.5rem' }}>
        {notaNomina ||
          (modulo === 'abarrotes'
            ? 'Categorías de IE Abarrotes (+ PROVEEDORES). Smoking exige folio CMP-/ING-/trp de la recepción para no duplicar gastos fantasma. CUBRE TURNO va a IE Abarrotes (nómina). Solo CONSUMO/RECARGAS/ANTICIPOS/FALTANTE descuentan al empleado.'
            : 'Categorías de IE Virtual. Gastos del corte no requieren aprobación. CUBRE TURNO va a IE (nómina). Solo CONSUMO/RECARGAS/ANTICIPOS/FALTANTE descuentan al empleado. Vales y préstamos sí requieren admin.')}
        {modulo === 'abarrotes'
          ? ' No registres el mismo gasto dos veces en Abarrotes: el sistema avisa si ya existe (proveedores / compras).'
          : ''}
      </p>

      {mostrarCat && puedeCatalogo && (
        <div style={{ marginBottom: '0.75rem', padding: '0.5rem', background: 'var(--surface)', borderRadius: 8 }}>
          <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 0.5rem' }}>
            {modulo === 'abarrotes' ? (
              <>
                Catálogo de <strong>IE Abarrotes</strong> (compartido con IE Virtual) más <strong>PROVEEDORES</strong> solo en este corte.
                Proveedores no se mueven a IE.
              </>
            ) : (
              <>
                Catálogo compartido desde <strong>IE Virtual</strong>. También se edita en Contabilidad → IE Virtual → Catálogo.
              </>
            )}
          </p>
          <button type="button" className="btn btn-ghost" style={{ ...btnSm, marginBottom: '0.5rem' }} onClick={nuevaCategoria}>
            + Categoría
          </button>
          {catalogo.map((c) => {
            const esEmp = esCategoriaEmpleado(c) || c.es_categoria_empleado;
            return (
            <div
              key={c.ieId || c.categoria}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.35rem',
                marginBottom: '0.4rem',
                padding: '0.35rem 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <strong style={{ fontSize: '0.85rem', minWidth: 90 }}>
                {c.categoria}
                {c.fuente === 'proveedores' ? (
                  <span className="muted" style={{ fontWeight: 500, fontSize: '0.72rem' }}>
                    {' '}
                    · prov.
                  </span>
                ) : null}
              </strong>
              <span className="muted" style={{ fontSize: '0.8rem', flex: 1 }}>
                {(c.subcategorias || []).length ? c.subcategorias.join(' · ') : 'Sin subcategorías'}
                {esEmp ? ' · captura: Empleado → Concepto' : ''}
              </span>
              <button type="button" className="btn btn-ghost" style={btnSm} onClick={() => nuevaSubcategoria(c.categoria)}>
                {esEmp ? '+ Tipo' : '+ Sub'}
              </button>
              <button type="button" className="btn btn-ghost" style={btnSm} onClick={() => editarCategoria(c.categoria)}>
                {esEmp ? 'Editar tipos' : 'Editar'}
              </button>
              {!esEmp && (
                <button type="button" className="btn btn-ghost" style={{ ...btnSm, color: 'var(--danger)' }} onClick={() => borrarCat(c.categoria)}>
                  Eliminar
                </button>
              )}
            </div>
            );
          })}
          {!catalogo.length && <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>Sin categorías. Usa + Categoría.</p>}
        </div>
      )}

      {habilitado ? (
        <>
          {!catalogo.length && (
            <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.5rem', color: 'var(--brand-gold)' }}>
              Sin categorías de gasto. Pide al administrador que configure el catálogo o usa el botón Catálogo si tienes permiso.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.72rem', fontWeight: 700 }}>
              <span className="muted">Categoría</span>
              <select
                className="select"
                value={cat}
                onChange={(e) => {
                  setCat(e.target.value);
                  setSub('');
                  setUsuarioId('');
                }}
              >
                <option value="">Categoría</option>
                {catalogo.map((c) => (
                  <option key={c.categoria} value={c.categoria}>
                    {c.categoria}
                  </option>
                ))}
              </select>
            </label>

            {esCatEmpleado ? (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.72rem', fontWeight: 700, gridColumn: '1 / -1' }}>
                  <span className="muted">Empleado</span>
                  <select
                    className="select"
                    value={usuarioId}
                    onChange={(e) => {
                      setUsuarioId(e.target.value);
                      setPinConsumoBenef('');
                    }}
                    style={{ fontSize: '1rem', minHeight: 42 }}
                  >
                    <option value="">Elige empleado…</option>
                    {gruposEmpleados.tienda.length > 0 && (
                      <optgroup label="Empleados de tienda (diurno y nocturno)">
                        {gruposEmpleados.tienda.map((e) => (
                          <option key={e.id} value={e.id}>
                            {normalizarCodigoTienda(sucursal) === 'MAIN' || !sucursal
                              ? `${etiquetaEmpleadoSelectGastos(e)} · ${etiquetaTienda(e.sucursal_id)}`
                              : etiquetaEmpleadoSelectGastos(e)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {(gruposEmpleados.consumoPin || []).length > 0 && (
                      <optgroup label="MAIN · consumo con PIN (Misael / Luis Enrique)">
                        {(gruposEmpleados.consumoPin || []).map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.etiqueta_consumo_pin || e.nombre}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.72rem', fontWeight: 700 }}>
                  <span className="muted">Concepto</span>
                  <select className="select" value={sub} onChange={(e) => setSub(e.target.value)}>
                    <option value="">Concepto…</option>
                    {conceptosEmpleado.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.72rem', fontWeight: 700 }}>
                <span className="muted">Subcategoría</span>
                <select className="select" value={sub} onChange={(e) => setSub(e.target.value)} disabled={!cat}>
                  <option value="">Subcategoría</option>
                  {subsDeCat.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!esCatEmpleado && requiereEmpleado && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.72rem', fontWeight: 700, gridColumn: '1 / -1' }}>
                <span className="muted">Empleado</span>
                <select
                  className="select"
                  value={usuarioId}
                  onChange={(e) => {
                    setUsuarioId(e.target.value);
                    setPinConsumoBenef('');
                  }}
                >
                  <option value="">Elige empleado…</option>
                  {gruposEmpleados.tienda.map((e) => (
                    <option key={e.id} value={e.id}>{etiquetaEmpleadoSelectGastos(e)}</option>
                  ))}
                  {(gruposEmpleados.consumoPin || []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.etiqueta_consumo_pin || e.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.72rem', fontWeight: 700 }}>
              <span className="muted">Monto</span>
              <input
                className="input corte-campo-editable"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Monto"
                value={monto}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setMonto(e.target.value)}
              />
            </label>
          </div>
          {requierePinConsumo && (
            <div style={{ marginBottom: '0.55rem', padding: '0.55rem 0.65rem', borderRadius: 8, background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.35)' }}>
              <label className="muted" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem' }}>
                PIN de {pinConsumoMeta?.etiqueta || empSeleccionadoPreview?.nombre || 'beneficiario'}
              </label>
              <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 0.4rem' }}>
                Gasto a nombre de <strong>{pinConsumoMeta?.etiqueta || 'él'}</strong>:
                solo se autoriza con su PIN (invisible) y siempre descuenta nómina.
              </p>
              <InputPin
                value={pinConsumoBenef}
                onChange={(e) => setPinConsumoBenef(e.target.value)}
                placeholder={`PIN de ${pinConsumoMeta?.etiqueta || 'beneficiario'}`}
                allowReveal={false}
                autoComplete="off"
                name="corte-pin-beneficiario-consumo"
                style={{ maxWidth: 280, marginBottom: 0 }}
              />
            </div>
          )}
          {rutaGasto ? (
            <p className="muted" style={{ fontSize: '0.78rem', margin: '0 0 0.45rem', fontWeight: 600 }}>
              {rutaGasto}
            </p>
          ) : null}
          {esCatEmpleado ? (
            <p className="muted" style={{ fontSize: '0.72rem', margin: '0 0 0.4rem' }}>
              Elige <strong>EMPLEADO</strong> → persona (tienda o Misael/Luis Enrique) → <strong>concepto</strong> (Consumo…).
            </p>
          ) : null}
          {requiereEmpleado && avisoEmp ? (
            <p className="muted" style={{ fontSize: '0.75rem', color: 'var(--danger)', margin: '0 0 0.4rem' }}>
              {avisoEmp}
            </p>
          ) : null}
          {requiereEmpleado && !avisoEmp && totalEmpleadosSelect === 0 ? (
            <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 0.4rem' }}>
              Sin empleados cargados. Da de alta tipo <strong>tienda</strong> (máx. 2 por sucursal).
              Misael / Luis Enrique deben aparecer aquí automáticamente en Abarrotes y Virtual.
            </p>
          ) : null}
          <p className="muted" style={{ fontSize: '0.72rem', margin: '0 0 0.4rem' }}>
            Categoría EMPLEADO: personal de tienda (<strong>diurno y nocturno</strong>) +{' '}
            <strong>Misael / Luis Enrique</strong> (consumo con su PIN).
            Otros indirectos / MAIN no aplican.
          </p>
          {esGastoTraspaso && (
            <div style={{ marginBottom: '0.75rem' }}>
              <label className="muted" style={{ display: 'block', fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                Folio del traspaso (Productos → Traspasos)
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="Ej. trp-5-0020 (varios separados por coma)"
                value={folioTraspaso}
                onChange={(e) => setFolioTraspaso(e.target.value)}
              />
            </div>
          )}
          {esGastoSmoking && !esGastoTraspaso && (
            <div style={{ marginBottom: '0.75rem' }}>
              <label className="muted" style={{ display: 'block', fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                Folio de inventario Smoking (obligatorio · evita gastos fantasma)
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                placeholder="Ej. ING-5-0309-0001 · CMP-5-A1B2C3D4 · trp-5-0020"
                value={folioInventarioSmoking}
                onChange={(e) => setFolioInventarioSmoking(e.target.value)}
              />
              <p className="muted" style={{ fontSize: '0.72rem', margin: '0.25rem 0 0' }}>
                Vale ingreso libre (ING-… en Inventario), recepción CMP-… o traspaso trp-…. El monto debe cuadrar; un folio no se reusa.
              </p>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <input
              className="input"
              placeholder="Comentario (opcional)"
              style={{ flex: 1, minWidth: 140 }}
              value={comentario}
              inputMode="text"
              onChange={(e) => setComentario(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && agregar()}
            />
            <button type="button" className="btn btn-primary" onClick={agregar}>
              Agregar
            </button>
          </div>
        </>
      ) : (
        <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
          Sin permiso para capturar gastos en este corte.
        </p>
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Hora</th>
              <th>Empleado</th>
              <th>Cat.</th>
              <th>Sub</th>
              <th>Monto</th>
              <th>Estado</th>
              <th>Nota</th>
              {habilitado && <th />}
            </tr>
          </thead>
          <tbody>
            {(gastos || []).map((g) => {
              const est = g.estado_aprobacion || 'aprobado';
              const pendiente = est === 'pendiente_admin';
              const rechazado = est === 'rechazado';
              const hora = g.created_at
                ? new Date(g.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                : '—';
              const esEmpGasto =
                esCategoriaEmpleado({ categoria: g.categoria })
                || gastoDescuentaNomina(modulo, g.categoria, g.subcategoria);
              return (
              <tr key={g.id} style={pendiente ? { background: 'rgba(225,153,41,0.08)' } : rechazado ? { opacity: 0.55 } : undefined}>
                <td style={{ fontWeight: 700, whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{hora}</td>
                <td style={{ fontWeight: esEmpGasto ? 700 : 400 }}>
                  {esEmpGasto ? (g.usuario_nombre || 'Sin empleado') : <span className="muted">—</span>}
                </td>
                <td>
                  {esEmpGasto ? <span className="muted">—</span> : g.categoria}
                </td>
                <td className="muted">{g.subcategoria || '—'}</td>
                <td style={{ fontWeight: 700 }}>
                  {puedeEditarGastos ? (
                    <input
                      className="input corte-campo-editable"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      style={{ width: '90px', fontWeight: 700 }}
                      value={g.monto}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => onEditar?.(g.id, { monto: e.target.value })}
                    />
                  ) : (
                    fmt(g.monto)
                  )}
                </td>
                <td style={{ fontSize: '0.75rem', fontWeight: 700, color: pendiente ? 'var(--brand-gold)' : rechazado ? 'var(--danger)' : '#2e7d32' }}>
                  {pendiente ? 'Pendiente admin' : rechazado ? 'Rechazado' : 'Aprobado'}
                </td>
                <td className="muted">{g.comentario || '—'}</td>
                {habilitado && (
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '0.2rem 0.4rem', color: 'var(--danger)' }}
                      onClick={() => onEliminar?.(g.id)}
                    >
                      Eliminar
                    </button>
                  </td>
                )}
              </tr>
            );
            })}
            {(!gastos || gastos.length === 0) && (
              <tr>
                <td colSpan={habilitado ? 8 : 7} className="muted">
                  Sin gastos en este turno.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
