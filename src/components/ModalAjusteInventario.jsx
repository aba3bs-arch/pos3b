import React, { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { etiquetaDepartamento, listarDepartamentos } from '../lib/departamentos.js';
import { eliminarAjusteEnEspera, listarAjustesEnEspera } from '../lib/ajusteInventarioBorrador.js';

const ACCIONES = [
  {
    id: 'nuevo',
    icon: 'file',
    label: 'Nuevo ajuste de inventario',
    desc: 'Contar y ajustar existencias reales en almacén.',
  },
  {
    id: 'ingreso',
    icon: 'plus',
    label: 'Ingreso de inventario',
    desc: 'Dar entrada a productos en almacén.',
  },
  {
    id: 'retiro',
    icon: 'trash',
    label: 'Retiro de inventario',
    desc: 'Dar salida a productos en almacén.',
  },
  {
    id: 'espera',
    icon: 'file',
    label: 'Abrir ajuste en espera',
    desc: 'Continuar ejecutando Ajustes de inventario inconclusos.',
  },
];

const SUBTIPOS_NUEVO = [
  { id: 'libre', icon: 'file', label: 'Libre/Normal' },
  { id: 'departamento', icon: 'package', label: 'Por departamento' },
  { id: 'categoria', icon: 'package', label: 'Por categoría' },
];

function fmtFecha(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

export default function ModalAjusteInventario({
  open,
  onClose,
  inventario,
  sucursal,
  onElegir,
  onBorrarInventario,
}) {
  const [accion, setAccion] = useState('nuevo');
  const [paso, setPaso] = useState('menu'); // menu | departamentos
  const [qDepto, setQDepto] = useState('');
  const [deptosSel, setDeptosSel] = useState(() => new Set());
  const [tickEspera, setTickEspera] = useState(0);

  const departamentos = useMemo(() => listarDepartamentos(inventario), [inventario]);
  const deptosFiltrados = useMemo(() => {
    const t = qDepto.trim().toLowerCase();
    if (!t) return departamentos;
    return departamentos.filter((d) => etiquetaDepartamento(d).toLowerCase().includes(t) || d.toLowerCase().includes(t));
  }, [departamentos, qDepto]);

  const enEspera = useMemo(() => listarAjustesEnEspera(sucursal), [sucursal, tickEspera, open]);

  if (!open) return null;

  const resetYCerrar = () => {
    setPaso('menu');
    setAccion('nuevo');
    setQDepto('');
    setDeptosSel(new Set());
    onClose?.();
  };

  const toggleDepto = (d) => {
    setDeptosSel((prev) => {
      const n = new Set(prev);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });
  };

  const elegirSubtipo = (subtipo) => {
    if (subtipo === 'departamento' || subtipo === 'categoria') {
      setPaso('departamentos');
      setDeptosSel(new Set());
      return;
    }
    onElegir?.({ accion: 'nuevo', modo: 'libre', tipo: 'entrada' });
    resetYCerrar();
  };

  const confirmarDepartamentos = () => {
    if (!deptosSel.size) return;
    onElegir?.({
      accion: 'nuevo',
      modo: 'departamento',
      departamentos: [...deptosSel],
      departamento: [...deptosSel][0],
    });
    resetYCerrar();
  };

  const elegirAccionDirecta = (id) => {
    setAccion(id);
    if (id === 'ingreso') {
      onElegir?.({ accion: 'ingreso', modo: 'masivo', tipo: 'entrada' });
      resetYCerrar();
      return;
    }
    if (id === 'retiro') {
      onElegir?.({ accion: 'retiro', modo: 'movimiento', tipo: 'retiro' });
      resetYCerrar();
      return;
    }
    if (id === 'espera') {
      setPaso('menu');
      setTickEspera((n) => n + 1);
    }
  };

  const abrirEspera = (draft) => {
    onElegir?.({ accion: 'espera', modo: 'departamento', borrador: draft });
    resetYCerrar();
  };

  return (
    <div className="prod-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-ajuste-titulo">
      <div className="prod-modal-ajuste">
        <header className="prod-modal-header">
          <button type="button" className="prod-modal-close" onClick={resetYCerrar} aria-label="Cerrar">
            <Icon name="x" size={20} />
          </button>
          <h2 id="modal-ajuste-titulo">Ajuste de inventario</h2>
          <span style={{ width: 40 }} />
        </header>

        <div className="prod-modal-body">
          {paso === 'departamentos' ? (
            <div className="prod-modal-deptos">
              <div className="prod-modal-deptos-head">
                <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.5rem' }} onClick={() => setPaso('menu')}>
                  <Icon name="chevronRight" size={16} style={{ transform: 'rotate(180deg)' }} />
                </button>
                <strong>Departamentos</strong>
              </div>
              <div className="prod-search-row" style={{ margin: '0.75rem 0' }}>
                <Icon name="search" size={16} />
                <input className="input" value={qDepto} onChange={(e) => setQDepto(e.target.value)} placeholder="Buscar" />
              </div>
              <div className="prod-modal-deptos-list">
                {deptosFiltrados.map((d) => (
                  <label key={d} className="prod-modal-depto-item">
                    <input type="checkbox" checked={deptosSel.has(d)} onChange={() => toggleDepto(d)} />
                    <span>{etiquetaDepartamento(d)}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '0.75rem', opacity: deptosSel.size ? 1 : 0.5 }}
                disabled={!deptosSel.size}
                onClick={confirmarDepartamentos}
              >
                SIGUIENTE
              </button>
            </div>
          ) : (
            <>
              <aside className="prod-modal-acciones">
                {ACCIONES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`prod-modal-accion ${accion === a.id ? 'activo' : ''}`}
                    onClick={() => elegirAccionDirecta(a.id)}
                  >
                    <Icon name={a.icon} size={22} />
                    <span>
                      <strong>{a.label}</strong>
                      <small>{a.desc}</small>
                    </span>
                  </button>
                ))}
              </aside>

              <section className="prod-modal-panel">
                {accion === 'nuevo' && (
                  <>
                    <div className="prod-modal-subtipos">
                      {SUBTIPOS_NUEVO.map((s) => (
                        <button key={s.id} type="button" className="prod-modal-subtipo" onClick={() => elegirSubtipo(s.id)}>
                          <Icon name={s.icon} size={22} />
                          <strong>{s.label}</strong>
                        </button>
                      ))}
                    </div>
                    {typeof onBorrarInventario === 'function' && (
                      <button type="button" className="prod-modal-borrar" onClick={() => { onBorrarInventario(); resetYCerrar(); }}>
                        <Icon name="alert" size={22} />
                        <span>
                          <strong>Borrar inventario</strong>
                          <small>Resetear todos los productos a 0 existencias</small>
                        </span>
                      </button>
                    )}
                  </>
                )}

                {accion === 'espera' && (
                  <div className="prod-modal-espera">
                    <div className="prod-modal-espera-head">
                      <span>AJUSTES EN ESPERA</span>
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={() => setTickEspera((n) => n + 1)}>
                        <Icon name="refresh" size={16} />
                      </button>
                    </div>
                    {enEspera.length === 0 ? (
                      <div className="prod-modal-espera-vacio">
                        <Icon name="file" size={48} />
                        <p className="muted">No hay ajustes en espera</p>
                      </div>
                    ) : (
                      <ul className="prod-modal-espera-lista">
                        {enEspera.map((d) => (
                          <li key={d.id}>
                            <button type="button" className="prod-modal-espera-item" onClick={() => abrirEspera(d)}>
                              <Icon name="file" size={20} />
                              <span>
                                <strong>{d.titulo || d.departamento || 'Ajuste'}</strong>
                                <small>{fmtFecha(d.savedAt)} · {Object.keys(d.conteos || {}).length} contado(s)</small>
                              </span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: '0.35rem', color: 'var(--brand-red)' }}
                              title="Eliminar borrador"
                              onClick={() => {
                                eliminarAjusteEnEspera(d.id);
                                setTickEspera((n) => n + 1);
                              }}
                            >
                              <Icon name="trash" size={16} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {(accion === 'ingreso' || accion === 'retiro') && (
                  <div className="prod-modal-espera-vacio">
                    <Icon name={accion === 'ingreso' ? 'plus' : 'trash'} size={40} />
                    <p className="muted">Abriendo {accion === 'ingreso' ? 'ingreso' : 'retiro'} de inventario…</p>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
