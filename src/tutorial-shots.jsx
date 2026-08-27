/**
 * Escenas de captura con la CSS y componentes reales del POS
 * (mismas clases/botones que Ventas y Corte de caja).
 * Abrir: /tutorial-shots.html?scene=ventas-ticket
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import Icon, { BtnLabel } from './components/Icon.jsx';
import './index.css';

const params = new URLSearchParams(window.location.search);
const scene = params.get('scene') || 'ventas-ticket';

function Shell({ title, children, badge = 'Sucursal 3B5' }) {
  return (
    <div className="app-shell" style={{ minHeight: '100vh', background: 'var(--bg, #f0f3f8)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '0.75rem 1.25rem',
          background: 'linear-gradient(90deg, #2f5aa8 0%, #3b66b5 55%, #4a74c0 100%)',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <strong style={{ fontSize: '1.05rem' }}>POS CONTROL 3B</strong>
          <span className="badge" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>{badge}</span>
        </div>
        <div style={{ fontSize: '0.85rem', opacity: 0.95 }}>Dólar: $17.50 · Cajero demo</div>
      </header>
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
        <aside
          style={{
            width: 200,
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
                fontWeight: m === title ? 700 : 500,
                background: m === title ? 'rgba(59,105,181,0.12)' : 'transparent',
                color: m === title ? 'var(--brand-blue)' : 'inherit',
              }}
            >
              {m}
            </div>
          ))}
        </aside>
        <main className="app-content" style={{ flex: 1, padding: '1.25rem' }}>
          <h2 style={{ margin: '0 0 1rem', color: 'var(--brand-blue)' }}>{title}</h2>
          {children}
        </main>
      </div>
    </div>
  );
}

function TicketVentas() {
  return (
    <Shell title="Ventas">
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <label className="muted" style={{ display: 'block' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Icon name="scan" size={16} />
              Escanear · buscar
            </span>
            <input className="input" style={{ marginTop: '0.35rem' }} defaultValue="" placeholder="Código o nombre…" readOnly />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-gold" style={{ fontSize: '0.85rem' }}>Coca Cola 600ml</button>
            <button type="button" className="btn btn-gold" style={{ fontSize: '0.85rem' }}>Sabritas 45g</button>
            <button type="button" className="btn btn-gold" style={{ fontSize: '0.85rem' }}>Pan Bimbo</button>
          </div>
        </div>
        <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)' }}>Ticket</h3>
          <table className="data">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Importe</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Coca Cola 600ml</td>
                <td>2</td>
                <td>$40.00</td>
              </tr>
              <tr>
                <td>Sabritas Original 45g</td>
                <td>1</td>
                <td>$18.00</td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: '1rem', fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-blue)' }}>
            TOTAL $58.00 MXN
          </div>
          <button type="button" className="btn btn-success" style={{ width: '100%', marginTop: '0.85rem', padding: '0.85rem', fontSize: '1.05rem' }}>
            <BtnLabel icon="cart">Cobrar</BtnLabel>
          </button>
        </div>
      </div>
    </Shell>
  );
}

function ModalCobro({ children }) {
  return (
    <Shell title="Ventas">
      <div className="prod-modal-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 40 }}>
        <div className="ventas-cobro-modal" style={{ maxWidth: 420, margin: '4vh auto' }}>
          <header className="prod-modal-header">
            <button type="button" className="prod-modal-close" aria-label="Cerrar">
              <Icon name="x" size={18} />
            </button>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Cobrar venta</h2>
            <span style={{ width: 36 }} />
          </header>
          <div className="ventas-cobro-body">
            <div className="ventas-cobro-total">
              TOTAL <strong>$58.00</strong> MXN
            </div>
            {children}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function CobroEfectivoMxn() {
  return (
    <ModalCobro>
      <label className="muted" style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
        Forma de pago
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
        <button type="button" className="btn btn-primary" style={{ flex: '1 1 calc(50% - 0.4rem)' }}>Efectivo</button>
        <button type="button" className="btn btn-ghost" style={{ flex: '1 1 calc(50% - 0.4rem)' }}>Tarjeta</button>
        <button type="button" className="btn btn-ghost" style={{ flex: '1 1 calc(50% - 0.4rem)' }}>Transferencia</button>
        <button type="button" className="btn btn-ghost" style={{ flex: '1 1 calc(50% - 0.4rem)' }}>QR</button>
      </div>
      <select className="select" style={{ marginBottom: '0.5rem' }} defaultValue="MXN">
        <option value="MXN">Pesos (MXN)</option>
        <option value="USD">Dólares (USD)</option>
      </select>
      <button type="button" className="btn btn-ghost" style={{ width: '100%', marginBottom: '0.5rem', fontWeight: 700 }}>
        Monto exacto · $58.00 MXN
      </button>
      <select className="select" style={{ marginBottom: '0.5rem' }} defaultValue="100">
        <option value="">O pagar con billete…</option>
        <option value="20">$20 MXN</option>
        <option value="50">$50 MXN</option>
        <option value="100">$100 MXN</option>
        <option value="200">$200 MXN</option>
        <option value="500">$500 MXN</option>
        <option value="1000">$1000 MXN</option>
      </select>
      <div className="ventas-cobro-cambio-previo">Cambio: $42.00 MXN</div>
      <button type="button" className="btn btn-success" style={{ width: '100%', padding: '0.85rem', fontSize: '1.05rem', marginTop: '0.5rem' }}>
        <BtnLabel icon="check">Finalizar venta</BtnLabel>
      </button>
      <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: '0.4rem' }}>Cancelar</button>
    </ModalCobro>
  );
}

function CobroEfectivoUsd() {
  return (
    <ModalCobro>
      <label className="muted" style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
        Forma de pago
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
        <button type="button" className="btn btn-primary" style={{ flex: '1 1 calc(50% - 0.4rem)' }}>Efectivo</button>
        <button type="button" className="btn btn-ghost" style={{ flex: '1 1 calc(50% - 0.4rem)' }}>Tarjeta</button>
      </div>
      <select className="select" style={{ marginBottom: '0.5rem' }} defaultValue="USD">
        <option value="MXN">Pesos (MXN)</option>
        <option value="USD">Dólares (USD)</option>
      </select>
      <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.82rem' }}>Tipo de cambio: $17.50 · el cambio se da en pesos</p>
      <button type="button" className="btn btn-ghost" style={{ width: '100%', marginBottom: '0.5rem', fontWeight: 700 }}>
        Monto exacto · $58.00 MXN
      </button>
      <select className="select" style={{ marginBottom: '0.5rem' }} defaultValue="5">
        <option value="">O pagar con billete…</option>
        <option value="1">$1 USD</option>
        <option value="5">$5 USD</option>
        <option value="10">$10 USD</option>
        <option value="20">$20 USD</option>
      </select>
      <div className="ventas-cobro-cambio-previo">Cambio: $29.50 MXN</div>
      <button type="button" className="btn btn-success" style={{ width: '100%', padding: '0.85rem', fontSize: '1.05rem', marginTop: '0.5rem' }}>
        <BtnLabel icon="check">Finalizar venta</BtnLabel>
      </button>
    </ModalCobro>
  );
}

function CobroTarjeta() {
  return (
    <ModalCobro>
      <label className="muted" style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
        Forma de pago
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
        <button type="button" className="btn btn-ghost" style={{ flex: '1 1 calc(50% - 0.4rem)' }}>Efectivo</button>
        <button type="button" className="btn btn-primary" style={{ flex: '1 1 calc(50% - 0.4rem)' }}>Tarjeta</button>
      </div>
      <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
        Cobro exacto · <strong>Tarjeta</strong> · $58.00 MXN
      </p>
      <div
        style={{
          margin: '0 0 0.75rem',
          padding: '0.65rem 0.75rem',
          borderRadius: 8,
          borderLeft: '4px solid var(--brand-gold)',
          background: 'rgba(225,153,41,0.12)',
          fontSize: '0.88rem',
          lineHeight: 1.45,
        }}
      >
        <strong>Importante:</strong> cobra primero en la <strong>terminal</strong>. Anota los{' '}
        <strong>últimos 4 o 5 dígitos</strong> del ticket de la terminal en la referencia.
      </div>
      <label className="muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
        Referencia / folio (opcional)
        <input
          className="input"
          style={{ marginTop: '0.35rem' }}
          defaultValue="45821"
          placeholder="Últimos 4 o 5 dígitos del ticket…"
          readOnly
        />
      </label>
      <button type="button" className="btn btn-success" style={{ width: '100%', padding: '0.85rem', fontSize: '1.05rem' }}>
        <BtnLabel icon="check">Finalizar venta</BtnLabel>
      </button>
    </ModalCobro>
  );
}

function VentaRegistrada() {
  return (
    <Shell title="Ventas">
      <div className="prod-modal-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 40 }}>
        <div className="card" style={{ maxWidth: 400, margin: '12vh auto', textAlign: 'center' }}>
          <div style={{ color: 'var(--brand-green)', fontWeight: 800, fontSize: '1.15rem', marginBottom: '0.5rem' }}>
            Venta registrada
          </div>
          <p style={{ margin: '0 0 0.35rem' }}>Cobro: <strong>Efectivo MXN</strong></p>
          <p style={{ margin: '0 0 0.35rem' }}>Total: <strong>$58.00</strong></p>
          <p style={{ margin: '0 0 1rem' }}>Cambio: <strong>$42.00 MXN</strong></p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }}>Imprimir ticket</button>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }}>Cerrar</button>
          </div>
        </div>
      </div>
    </Shell>
  );
}


const SCENES = {
  'ventas-ticket': TicketVentas,
  'cobro-mxn': CobroEfectivoMxn,
  'cobro-usd': CobroEfectivoUsd,
  'cobro-tarjeta': CobroTarjeta,
  'venta-ok': VentaRegistrada,
};

const Comp = SCENES[scene] || TicketVentas;
createRoot(document.getElementById('root')).render(<Comp />);
