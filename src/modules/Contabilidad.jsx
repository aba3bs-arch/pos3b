import React from 'react';
import SubcomandosHub from '../components/SubcomandosHub.jsx';
import { colorDeModulo, iconoDeModulo } from '../lib/moduloIcons.js';
import { SUBMODULOS_CONTABILIDAD } from '../lib/roles.js';

const DESCRIPCIONES = {
  Nómina: {
    desc: 'Periodos, sueldos, asistencia y recibos',
    ayuda: 'Arma periodos de nómina, registra asistencia, calcula sueldos y genera recibos por empleado.',
  },
  'Panel RT': {
    desc: 'Reportes, servicios, recolectores y gastos',
    ayuda: 'Centro operativo RT: reportes de tienda, servicios, recolectores y autorización de gastos.',
  },
  'Liquidación recolecciones': {
    desc: 'Sellar efectivo en tránsito por tienda y día',
    ayuda: 'Cierra y sella el efectivo recolectado por tienda/día para liquidarlo en contabilidad.',
  },
  'RC Virtual': {
    desc: 'Custodia Virtual/Garage → cuenta admin → ABB',
    ayuda: 'Recibe recolecciones de cortes Virtual y Garage a tu cuenta y entrégalas a ABB.',
  },
  'IE VIRTUAL': {
    desc: 'Antonio · ingresos y egresos Virtual + Garage',
    ayuda: 'Ingresos y egresos de Virtual y Garage (cuenta Antonio). Incluye liberar recolecciones a IE.',
  },
  'IE ABARROTES': {
    desc: 'Francisco · ingresos, egresos, proveedores y utilidades',
    ayuda: 'Ingresos y egresos de Abarrotes (cuenta Francisco). Incluye ventas/gastos por proveedor, utilidad bruta y ganancia neta.',
  },
  'Auto Fin': {
    desc: 'Antonio · vehículos y préstamos a externos o empleados (MAIN)',
    ayuda: 'Financia clientes externos (no 3B) o empleados de tiendas y MAIN. Enganche, cuotas e historial de pagos.',
  },
  Crédito: {
    desc: 'Cartera por cobrar de Venta en Ruta',
    ayuda: 'Consulta de saldos. El pago lo hace el cajero en Cobranza con PIN.',
  },
  Cobranza: {
    desc: 'Pagar créditos de ruta (cajero + PIN)',
    ayuda: 'Selecciona créditos, ingresa PIN. Gasto abarrotes «credito liquidado» + efectivo a tránsito.',
  },
  'RH ABA3B': {
    desc: 'Altas, bajas y expediente de personal',
    ayuda: 'Empleados de tienda, cubre turnos e indirectos. Activos / inactivos, perfil, historial y recontratación con PIN de administradores.',
  },
};

/** Hub de Contabilidad: solo botones; cada submódulo abre su pantalla. */
export default function Contabilidad({ submodulosVisibles, onNavigate }) {
  const items = (submodulosVisibles || []).map((id) => {
    const meta = DESCRIPCIONES[id] || {};
    return {
      id,
      label: id,
      desc: meta.desc || '',
      ayuda: meta.ayuda || meta.desc || '',
      icon: iconoDeModulo(id),
      color: colorDeModulo(id),
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#7c3aed' }}>Contabilidad</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Elige un subcomando. Solo se muestra el panel que selecciones.
        </p>
      </div>
      <SubcomandosHub
        items={items}
        onSelect={(id) => onNavigate(id)}
        color="#7c3aed"
      />
      <p className="muted" style={{ fontSize: '0.78rem' }}>
        Submódulos disponibles: {SUBMODULOS_CONTABILIDAD.join(' · ')}
      </p>
    </div>
  );
}
