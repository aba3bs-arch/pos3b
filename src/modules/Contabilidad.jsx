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
    desc: 'Francisco · ingresos y egresos de Abarrotes',
    ayuda: 'Ingresos y egresos del área de Abarrotes (cuenta Francisco).',
  },
  'Auto Fin': {
    desc: 'Antonio · vehículos y préstamos con enganche y cuotas',
    ayuda: 'Control de vehículos financiados: enganche, cuotas e historial de pagos.',
  },
  Crédito: {
    desc: 'Cartera por cobrar de Venta en Ruta',
    ayuda: 'Saldos y movimientos de crédito CEDIS Ruta. La cobranza se registra en el subcomando Cobranza.',
  },
  Cobranza: {
    desc: 'Cobro de créditos de ruta (repartidor CEDIS)',
    ayuda: 'Formulario para registrar abonos a créditos por cobrar generados en Venta en Ruta.',
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
