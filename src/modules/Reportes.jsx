import React, { useState } from 'react';
import { consultarVentas } from '../lib/ventasQuery.js';
import { imprimirInventario, imprimirReporte } from '../lib/impresion.js';
import { BtnLabel } from '../components/Icon.jsx';
import FiltroRangoCalendario from '../components/FiltroRangoCalendario.jsx';
import ReporteGastosDetalle from '../components/ReporteGastosDetalle.jsx';
import ReporteInventario from '../components/ReporteInventario.jsx';

function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => esc(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => esc(c.value(row))).join(','));
  return [header, ...lines].join('\n');
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reportes({ supabase, inventario, sucursal }) {
  const [desde, setDesde] = useState(() => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));

  const exportProductos = () => {
    const cols = [
      { label: 'codigo', value: (p) => p.id },
      { label: 'nombre', value: (p) => p.nombre },
      { label: 'precio', value: (p) => p.precio },
      { label: 'stock', value: (p) => p.stock },
      { label: 'categoria', value: (p) => p.cat },
    ];
    download(`productos_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(inventario, cols));
  };

  const exportVentas = async () => {
    if (!supabase) return;
    const ini = new Date(desde);
    ini.setHours(0, 0, 0, 0);
    const fin = new Date(hasta);
    fin.setHours(23, 59, 59, 999);
    const { data, error } = await consultarVentas(supabase, {
      columns: '*',
      desde: ini,
      hasta: fin,
      limit: 2000,
      orderAsc: true,
    });
    if (error) {
      alert(error);
      return;
    }
    exportVentasRows(data || []);
  };

  const exportVentasRows = (rows) => {
    const cols = [
      { label: 'id', value: (v) => v.id },
      { label: 'fecha', value: (v) => (v.created_at ? new Date(v.created_at).toISOString() : '') },
      { label: 'vendedor', value: (v) => v.vendedor },
      { label: 'sucursal', value: (v) => v.sucursal_id },
      { label: 'total', value: (v) => v.total },
      { label: 'metodo_pago', value: (v) => v.metodo_pago },
      { label: 'articulos_json', value: (v) => JSON.stringify(v.articulos || []) },
    ];
    download(`ventas_${desde}_${hasta}.csv`, toCsv(rows, cols));
    return rows;
  };

  const imprimirInventarioActual = () => {
    imprimirInventario({
      sucursal,
      titulo: `Catálogo completo · ${inventario.length} productos`,
      productos: inventario,
    });
  };

  const imprimirVentasRango = async () => {
    if (!supabase) return;
    const ini = new Date(desde);
    ini.setHours(0, 0, 0, 0);
    const fin = new Date(hasta);
    fin.setHours(23, 59, 59, 999);
    const { data, error } = await consultarVentas(supabase, {
      columns: '*',
      desde: ini,
      hasta: fin,
      limit: 500,
      orderAsc: true,
    });
    if (error) return alert(error);
    const rows = data || [];
    const total = rows.reduce((a, v) => a + Number(v.total || 0), 0);
    await imprimirReporte({
      sucursal,
      titulo: 'REPORTE DE VENTAS',
      rango: `${desde} — ${hasta}`,
      secciones: [
        { titulo: 'Resumen', lineas: [`Tickets: ${rows.length}`, `Total: $${total.toFixed(2)} MXN`] },
      ],
      tabla: {
        cols: [
          { label: 'Fecha', key: 'created_at', fmt: (r) => (r.created_at ? new Date(r.created_at).toLocaleString('es-MX') : '—') },
          { label: 'Vendedor', key: 'vendedor' },
          { label: 'Total', key: 'total', align: 'right', fmt: (r) => `$${Number(r.total).toFixed(2)}` },
          { label: 'Pago', key: 'metodo_pago' },
        ],
        rows,
      },
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '1100px' }}>
      <div className="card">
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Reportes y exportación</h3>
        <p className="muted">Genera archivos CSV para contabilidad o análisis en Excel / Google Sheets.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button type="button" className="btn btn-primary" onClick={exportProductos}>
              <BtnLabel icon="download">Descargar inventario (CSV)</BtnLabel>
            </button>
            <button type="button" className="btn btn-ghost" onClick={imprimirInventarioActual}>
              <BtnLabel icon="print">Imprimir inventario</BtnLabel>
            </button>
          </div>
          <div style={{ padding: '1rem', borderRadius: '12px', background: 'var(--surface)' }}>
            <div className="muted" style={{ marginBottom: '0.5rem' }}>
              Rango para ventas
            </div>
            <FiltroRangoCalendario desde={desde} hasta={hasta} onDesdeChange={setDesde} onHastaChange={setHasta} />
            <button type="button" className="btn btn-gold" style={{ width: '100%', marginTop: '0.75rem' }} onClick={() => exportVentas()}>
              <BtnLabel icon="download">Descargar ventas del rango</BtnLabel>
            </button>
            <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: '0.35rem' }} onClick={imprimirVentasRango}>
              <BtnLabel icon="print">Imprimir reporte de ventas</BtnLabel>
            </button>
          </div>
        </div>
      </div>

      <ReporteInventario sucursal={sucursal} />

      <ReporteGastosDetalle supabase={supabase} sucursal={sucursal} />
    </div>
  );
}
