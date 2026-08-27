/**
 * Monta el módulo REAL `Ventas.jsx` con inventario de demo para capturas.
 * URL: /tutorial-shots.html
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Ventas from './modules/Ventas.jsx';
import { guardarMetodosPago, METODOS_PAGO_BASE, guardarTipoCambio } from './lib/posConfig.js';
import { guardarCarritoVenta } from './lib/carritoVentaPersistencia.js';
import './index.css';

const SUCURSAL = '3B5';

const inventario = [
  {
    id: '75010001',
    nombre: 'Coca Cola 600ml',
    precio: 20,
    stock: 48,
    cat: 'Bebidas',
    departamento: 'Bebidas',
    favorito: true,
    en_favoritos: true,
    en_venta: true,
    foto_url: null,
  },
  {
    id: '75010002',
    nombre: 'Sabritas Original 45g',
    precio: 18,
    stock: 30,
    cat: 'Botanas',
    departamento: 'Botanas',
    favorito: true,
    en_favoritos: true,
    en_venta: true,
    foto_url: null,
  },
  {
    id: '75010003',
    nombre: 'Pan Bimbo Grande',
    precio: 42,
    stock: 12,
    cat: 'Panadería',
    departamento: 'Panadería',
    favorito: true,
    en_favoritos: true,
    en_venta: true,
    foto_url: null,
  },
];

try {
  guardarTipoCambio(17.5, { silencioso: true });
  guardarMetodosPago(METODOS_PAGO_BASE.map((m) => ({ ...m, activo: true })));
  guardarCarritoVenta(SUCURSAL, [
    { id: '75010001', nombre: 'Coca Cola 600ml', precio: 20, qty: 2, foto_url: null },
    { id: '75010002', nombre: 'Sabritas Original 45g', precio: 18, qty: 1, foto_url: null },
  ]);
} catch {
  /* ignore */
}

const user = { id: 'demo', nombre: 'Cajero demo', rol: 'Administrador' };

function Shell() {
  const [busqueda, setBusqueda] = useState('');
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #f0f3f8)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1.25rem',
          background: 'linear-gradient(90deg, #2f5aa8 0%, #3b66b5 55%, #4a74c0 100%)',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <strong>POS CONTROL 3B</strong>
          <span className="badge" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
            Sucursal 3B5
          </span>
        </div>
        <div style={{ fontSize: '0.85rem' }}>Dólar: $17.50 · {user.nombre}</div>
      </header>
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
        <aside
          style={{
            width: 190,
            background: '#fff',
            borderRight: '1px solid var(--border)',
            padding: '0.75rem 0.5rem',
          }}
        >
          {['Inicio', 'Ventas', 'Corte de caja', 'Productos', 'Tutorial'].map((m) => (
            <div
              key={m}
              style={{
                padding: '0.55rem 0.75rem',
                borderRadius: 8,
                marginBottom: 4,
                fontWeight: m === 'Ventas' ? 700 : 500,
                background: m === 'Ventas' ? 'rgba(59,105,181,0.12)' : 'transparent',
                color: m === 'Ventas' ? 'var(--brand-blue)' : 'inherit',
              }}
            >
              {m}
            </div>
          ))}
        </aside>
        <main className="app-content" style={{ flex: 1, padding: '1rem 1.25rem' }}>
          <Ventas
            supabase={{
              from: () => ({
                insert: async () => ({ error: null }),
              }),
              rpc: async () => ({ data: { ok: true, antes: 10, despues: 8 }, error: null }),
              channel: () => ({
                on: function () { return this; },
                subscribe: () => ({ unsubscribe: () => {} }),
              }),
              removeChannel: () => {},
            }}
            user={user}
            sucursal={SUCURSAL}
            tipoCambio={17.5}
            inventario={inventario}
            cargarDatos={() => {}}
            busqueda={busqueda}
            setBusqueda={setBusqueda}
          />
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Shell />);
