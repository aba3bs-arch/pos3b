import Icon from './Icon.jsx';
import { fmtMonto } from '../lib/controlEfectivo.js';
import InventarioCamionRecolector from './InventarioCamionRecolector.jsx';

const CASILLAS = [
  { id: 'venta', label: 'Rc/venta', icon: 'dollar', fondo: '#1b9e4b' },
  { id: 'creditos', label: 'Rc/créditos', icon: 'card', fondo: '#2f6fe4' },
  { id: 'servicios', label: 'Rc/servicios', icon: null, fondo: '#a3521a' },
];

/** Enteros se ven como en la carátula ($23,000); el cero y los centavos conservan dos decimales. */
export function fmtCasillaRc(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) < 0.005) return '$0.00';
  if (Math.abs(v - Math.round(v)) < 0.005) {
    return `$${Math.round(v).toLocaleString('es-MX')}`;
  }
  return fmtMonto(v);
}

function lineaMovimientos(r) {
  return `${r.count} mov. en tránsito (${r.venta?.count || 0} rc)`;
}

function lineaDesglose(r) {
  return `ventas ${r.venta?.count || 0} rc / créditos por cobrar ${r.creditos?.count || 0} rc / servicios ${r.servicios?.count || 0} rc`;
}

function camionesDeCaratula(resumenReps, porRecolector) {
  const vistos = new Set();
  const lista = [];
  for (const r of resumenReps || []) {
    const datos = porRecolector?.[r.id];
    if (!datos?.camion || datos.sinCamion) continue;
    const clave = String(datos.camion);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    lista.push(datos);
  }
  return lista;
}

/**
 * Carátula de efectivo en tránsito: una tarjeta por recolector y, debajo,
 * el inventario de cada camión a precio de venta en ruta.
 */
export default function CaratulaRcRecolectores({
  resumenReps = [],
  cargando = false,
  inventarios = null,
  onAbrirVenta,
  onAbrirCreditos,
  onAbrirServicios,
}) {
  const abrir = {
    venta: onAbrirVenta,
    creditos: onAbrirCreditos,
    servicios: onAbrirServicios,
  };
  const camiones = camionesDeCaratula(resumenReps, inventarios?.porRecolector);

  if (!resumenReps.length) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        {cargando ? 'Cargando recolectores…' : 'Sin recolectores activos.'}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxWidth: 480 }}>
      {resumenReps.map((r) => {
        const conMonto = Number(r.total) > 0;
        return (
          <div
            key={r.id}
            style={{
              border: '1px solid rgba(15, 23, 42, 0.1)',
              borderRadius: 10,
              padding: '0.7rem 0.75rem 0.75rem',
              background: conMonto ? '#fff4e0' : '#f7f4ef',
            }}
          >
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--brand-blue)' }}>{r.nombre}</div>
            <div
              style={{
                marginTop: '0.15rem',
                fontSize: '1.45rem',
                lineHeight: 1.15,
                fontWeight: 800,
                color: conMonto ? '#c9840b' : 'var(--muted)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {fmtMonto(r.total)}
            </div>
            <div className="muted" style={{ marginTop: '0.15rem', fontSize: '0.75rem' }}>
              {lineaMovimientos(r)}
            </div>
            <div className="muted" style={{ marginTop: '0.1rem', fontSize: '0.72rem', lineHeight: 1.35 }}>
              {lineaDesglose(r)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.4rem', marginTop: '0.55rem' }}>
              {CASILLAS.map((c) => {
                const parte = r[c.id] || { total: 0, count: 0 };
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => abrir[c.id]?.(r.id)}
                    aria-label={`${c.label} de ${r.nombre}: ${fmtCasillaRc(parte.total)}`}
                    style={{
                      textAlign: 'left',
                      background: c.fondo,
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '0.4rem 0.45rem 0.45rem',
                      cursor: 'pointer',
                      minWidth: 0,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.68rem', fontWeight: 700, lineHeight: 1.15 }}>
                      {c.icon ? <Icon name={c.icon} size={13} strokeWidth={2.4} /> : null}
                      {c.label}
                    </span>
                    <span style={{ display: 'block', marginTop: '0.2rem', fontSize: '0.95rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCasillaRc(parte.total)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {camiones.map((datos) => (
        <InventarioCamionRecolector
          key={datos.camion}
          variante="caratula"
          datos={datos}
          cargando={inventarios?.cargando}
          error={inventarios?.error}
        />
      ))}
      {!camiones.length && inventarios?.error && (
        <p role="status" style={{ color: 'var(--brand-red)', margin: 0, fontSize: '0.78rem' }}>{inventarios.error}</p>
      )}
    </div>
  );
}
