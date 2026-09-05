import React, { useEffect, useState } from 'react';
import {
  EVENTO_TURNOS,
  leerConfigHorario,
  leerTurnos,
  turnoActual,
  nombreTurnoLegible,
  TIPOS_HORARIO,
} from '../lib/turnos.js';
import ManualAdministrador from './ManualAdministrador.jsx';
import { puedeGestionarUsuarios } from '../lib/roles.js';

const SECCIONES = [
  {
    id: 'alta-empleado',
    title: 'Cómo dar de alta o reingresar un empleado',
    body: (
      <>
        <p style={{ margin: '0 0 0.5rem' }}>
          <strong>Alta</strong> = persona nueva. <strong>Reingreso</strong> = alguien que ya tuvo baja. No crees un usuario duplicado para reingresar.
        </p>
        <p style={{ margin: '0 0 0.35rem' }}><strong>Alta nueva — Usuarios (Administrador)</strong></p>
        <ol style={{ margin: '0 0 0.65rem', paddingLeft: '1.2rem' }}>
          <li>Menú <strong>Usuarios</strong> → recuadro <strong>Cómo dar de alta un empleado</strong>.</li>
          <li>Nombre, PIN, sucursal, rol y turno. Pulsa <strong>Añadir empleado</strong>.</li>
          <li>Ya entra al POS con ese PIN. El expediente queda en RH ABA3B.</li>
        </ol>
        <p style={{ margin: '0 0 0.35rem' }}><strong>Alta de expediente — RH ABA3B (Gerente o Admin)</strong></p>
        <ol style={{ margin: '0 0 0.65rem', paddingLeft: '1.2rem' }}>
          <li>Menú <strong>RH ABA3B</strong> → <strong>+ Alta de empleado</strong>.</li>
          <li>Nombre, tipo, sucursal, puesto. <strong>Registrar alta</strong>.</li>
          <li>Si debe cobrar en caja, el Admin le crea el PIN en <strong>Usuarios</strong>.</li>
        </ol>
        <p style={{ margin: '0 0 0.35rem' }}><strong>Reingreso</strong></p>
        <ol style={{ margin: '0 0 0.65rem', paddingLeft: '1.2rem' }}>
          <li>Usuarios: recuadro <strong>Cómo reingresar</strong> → elige el nombre dado de baja → <strong>Reingresar alta</strong>.</li>
          <li>O RH ABA3B → <strong>Inactivos / bajas</strong> → <strong>Reingresar alta</strong> en la fila.</li>
          <li>Si está marcado no recontratable, pide el PIN del administrador principal.</li>
        </ol>
        <p style={{ margin: 0 }}>
          Vuelve a nómina, turnos y Usuarios. Puede entrar otra vez con su PIN.
        </p>
      </>
    ),
  },
  {
    id: 'baja-empleado',
    title: 'Cómo dar de baja un empleado',
    body: (
      <>
        <p style={{ margin: '0 0 0.5rem' }}>
          Solo <strong>Administrador</strong> (módulo <strong>Usuarios</strong>) o <strong>Gerente / Administrador</strong> (módulo <strong>RH ABA3B</strong>).
          No borres el usuario: la baja conserva el historial y permite reingreso.
        </p>
        <p style={{ margin: '0 0 0.35rem' }}><strong>Opción A — Usuarios</strong></p>
        <ol style={{ margin: '0 0 0.65rem', paddingLeft: '1.2rem' }}>
          <li>Menú <strong>Usuarios</strong>.</li>
          <li>Arriba, en <strong>Cómo dar de baja un empleado</strong>, elige el nombre y pulsa <strong>Dar de baja</strong>.</li>
          <li>Elige motivo, fecha y si puede reingresar. Pulsa <strong>Confirmar baja</strong>.</li>
        </ol>
        <p style={{ margin: '0 0 0.35rem' }}><strong>Opción B — RH ABA3B</strong></p>
        <ol style={{ margin: '0 0 0.65rem', paddingLeft: '1.2rem' }}>
          <li>Menú <strong>RH ABA3B</strong> → pestaña <strong>Activos</strong>.</li>
          <li>Elige el nombre arriba o pulsa <strong>Dar de baja</strong> en la fila.</li>
          <li>Confirma motivo y reingreso.</li>
        </ol>
        <p style={{ margin: 0 }}>
          El empleado <strong>ya no entra con su PIN</strong> y sale de nómina y turnos.
          El expediente queda en <strong>RH ABA3B → Inactivos / bajas</strong>. Para reactivar: <strong>Reactivar</strong> en Usuarios o <strong>Reingresar alta</strong> en RH.
        </p>
      </>
    ),
  },
  {
    id: 'acceso',
    title: 'Primer acceso y PIN',
    body: (
      <>
        <p style={{ margin: '0 0 0.5rem' }}>
          Ingresa tu PIN en la pantalla de entrada. La tienda debe estar fijada en este equipo antes de cobrar.
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li>Si el PIN no funciona, verifica que estés en la sucursal correcta.</li>
          <li>Solo el administrador crea usuarios en el módulo <strong>Usuarios</strong>.</li>
          <li>Si ves error de turno, revisa la sección <strong>Turnos diurno / nocturno</strong> abajo.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'turnos',
    title: 'Turnos diurno y nocturno (12 h)',
    body: null,
  },
  {
    id: 'ventas',
    title: 'Ventas en mostrador',
    body: 'Busca o escanea productos, ajusta cantidades y pulsa Cobrar. Elige MXN o USD; el cambio se calcula con el tipo de cambio de Configuración. Los favoritos aparecen como botones rápidos si el producto está marcado en Productos.',
  },
  {
    id: 'corte',
    title: 'Corte de caja',
    body: 'Al terminar tu turno haz el corte. Solo puedes cerrar el turno que te corresponde (diurno o nocturno). Gerente, supervisor y administrador pueden cortar cualquier turno. Un corte por tienda, fecha y turno.',
  },
  {
    id: 'productos',
    title: 'Productos e inventario',
    body: 'Alta de códigos, precios, IVA, departamentos y stock. En Ajuste de inventario puedes registrar entradas, retiros y traspasos. Importa catálogo desde Excel con la plantilla CSV.',
  },
  {
    id: 'compras',
    title: 'Compras y proveedores',
    body: 'Elige proveedor, genera pedido con sugerencias de stock y ventas, recibe mercancía escaneando y confirma para sumar inventario. Solo el administrador da de alta proveedores nuevos.',
  },
  {
    id: 'problemas',
    title: 'Problemas frecuentes',
    body: (
      <>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li>
            <strong>¿Cómo doy de alta o reingreso a un empleado?</strong> Alta nueva: <strong>Usuarios</strong> → nombre + PIN → Añadir empleado. Reingreso (ya tuvo baja): Usuarios → <strong>Cómo reingresar</strong> o <strong>RH ABA3B → Inactivos / bajas → Reingresar alta</strong>. No crees un usuario duplicado.
          </li>
          <li>
            <strong>¿Cómo doy de baja un empleado?</strong> Menú <strong>Usuarios</strong> (elige el nombre → Dar de baja → Confirmar) o <strong>RH ABA3B → Activos → Dar de baja</strong>. No borres el usuario.
          </li>
          <li>
            <strong>Columnas faltantes en Supabase:</strong> ejecuta <code>supabase/fix_supabase_todas_columnas.sql</code> en el SQL Editor.
          </li>
          <li>
            <strong>No puedo entrar — turno incorrecto:</strong> el cajero diurno solo entra en horario diurno y el nocturno en horario nocturno. Revisa Usuarios → Turno.
          </li>
          <li>
            <strong>PIN de otra tienda:</strong> cambia la tienda fijada o pide al admin mover tu usuario.
          </li>
          <li>
            <strong>App en celular:</strong> misma Wi‑Fi que la PC, abre <code>http://IP-DE-LA-PC:5173</code> con el servidor encendido.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'roles',
    title: 'Roles',
    body: (
      <>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li><strong>Cajero:</strong> ventas, cortes, checador, compras, proveedores, consultas, reportes, traspasos, preinventario y vales; productos solo consulta (sin editar).</li>
          <li><strong>Supervisor / Gerente:</strong> operación completa; gerente también configura.</li>
          <li><strong>Administrador:</strong> usuarios, proveedores y acceso total.</li>
          <li><strong>Auditor:</strong> consultas e inventario sin ventas en mostrador.</li>
        </ul>
      </>
    ),
  },
];

function BloqueTurnos() {
  const [turnos, setTurnos] = useState(() => leerTurnos());
  const [config, setConfig] = useState(() => leerConfigHorario());
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const sync = () => {
      setTurnos(leerTurnos());
      setConfig(leerConfigHorario());
    };
    window.addEventListener(EVENTO_TURNOS, sync);
    const id = setInterval(() => setAhora(new Date()), 60_000);
    return () => {
      window.removeEventListener(EVENTO_TURNOS, sync);
      clearInterval(id);
    };
  }, []);

  const activo = turnoActual(turnos, ahora);
  const meta = TIPOS_HORARIO[config.tipo] || TIPOS_HORARIO['12x12'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ margin: 0 }}>
        La tienda opera con turnos de <strong>12 horas</strong>: <strong>Diurno</strong> (día) y <strong>Nocturno</strong> (noche).
        El cajero diurno <em>no puede entrar</em> durante el turno nocturno, y viceversa. Cada venta queda registrada con el turno activo; el corte solo suma ventas de ese turno.
      </p>
      <p style={{ margin: 0 }}>
        Configuración actual: <span className="badge">{meta.label}</span>
        {activo && (
          <>
            {' '}
            · Turno en curso: <span className="badge">{nombreTurnoLegible(activo)}</span> ({activo.hora_inicio} – {activo.hora_fin})
          </>
        )}
      </p>
      <div className="table-wrap">
        <table className="data" style={{ fontSize: '0.9rem' }}>
          <thead>
            <tr>
              <th>Turno</th>
              <th>Entrada</th>
              <th>Salida</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {turnos.map((t) => (
              <tr key={t.id}>
                <td>{nombreTurnoLegible(t)}</td>
                <td>{t.hora_inicio}</td>
                <td>{t.hora_fin}</td>
                <td>{activo?.id === t.id ? <span style={{ color: 'var(--brand-green)', fontWeight: 700 }}>Activo ahora</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        El administrador define horarios en <strong>Configuración → Turnos de caja</strong> y asigna a cada cajero
        <strong> Diurno</strong> o <strong> Nocturno</strong> en <strong>Usuarios</strong> (solo administrador).
      </p>
    </div>
  );
}

export default function Ayuda({ user }) {
  const [open, setOpen] = useState('turnos');
  const [pestaña, setPestaña] = useState(() => (puedeGestionarUsuarios(user?.rol) ? 'manual' : 'rapida'));
  const esAdmin = puedeGestionarUsuarios(user?.rol);

  return (
    <div style={{ maxWidth: '860px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Centro de ayuda</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Guías rápidas, turnos y solución de problemas del POS CONTROL 3B.
          Para <strong>dar de alta o reingresar</strong>: Usuarios (nombre + PIN, o Reingresar alta).
          Para <strong>dar de baja</strong>: Usuarios o RH ABA3B (elige el nombre y Confirmar baja).
          Abre también el módulo <strong>Tutorial</strong> del menú para las guías ilustradas
          (incluye <strong>Corte Abarrotes</strong> con captura real de pantalla).
          (<strong>Cómo cobrar en el POS</strong>, ingreso de compras, negativos / pagaré / abonos).
          En <strong>Vales y Préstamos → RIF</strong> puedes hacer requisición de fondo
          <strong>entre tiendas</strong> o <strong>misma tienda · compra mercancía</strong>.
          {esAdmin && (
            <>
              {' '}
              Como administrador, abre el <strong>Manual administrador</strong> (instructivo completo con buscador).
            </>
          )}
        </p>
        {esAdmin && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className={pestaña === 'rapida' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setPestaña('rapida')}>
              Guías rápidas
            </button>
            <button type="button" className={pestaña === 'manual' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setPestaña('manual')}>
              Manual administrador (instructivo)
            </button>
          </div>
        )}
      </div>

      {pestaña === 'manual' && esAdmin ? (
        <ManualAdministrador />
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {SECCIONES.map((s) => (
          <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
            <button
              type="button"
              onClick={() => setOpen(open === s.id ? '' : s.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.85rem 1rem',
                border: 'none',
                background: open === s.id ? 'rgba(59,105,181,0.08)' : '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                color: 'var(--brand-blue-dark)',
              }}
            >
              {s.title}
            </button>
            {open === s.id && (
              <div style={{ padding: '0 1rem 1rem', color: 'var(--muted)', lineHeight: 1.55 }}>
                {s.id === 'turnos' ? <BloqueTurnos /> : s.body}
              </div>
            )}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
