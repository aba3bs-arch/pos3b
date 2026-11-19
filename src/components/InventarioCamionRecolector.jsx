import React, { useEffect, useState } from 'react';
import { fmtMonto } from '../lib/controlEfectivo.js';
import { listarRecolectoresCargaRuta } from '../lib/ventaEnRuta.js';
import { resolverCamionDeRecolector } from '../lib/auditoriaCamionRuta.js';
import { leerFilasInventario, resumirInventarioCamion } from '../lib/resumenInventarioCamion.js';
import { TZ_NOGALES } from './RelojNogales.jsx';

const formato = new Intl.DateTimeFormat('es-MX', {
  timeZone: TZ_NOGALES, day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const fecha = (valor) => valor && Number.isFinite(new Date(valor).getTime())
  ? formato.format(new Date(valor)) : 'Sin fecha disponible';

/** Consulta los registros existentes; no crea otra copia del inventario. */
export function useInventariosCamion(supabase, habilitado) {
  const [estado, setEstado] = useState({ porRecolector: {}, cargando: true, error: null });
  useEffect(() => {
    if (!supabase || !habilitado) return;
    let activo = true;
    let ocupado = false;
    let pendiente = false;
    let debounce;
    setEstado({ porRecolector: {}, cargando: true, error: null });

    const cargar = async () => {
      if (!activo) return;
      if (ocupado) { pendiente = true; return; }
      ocupado = true;
      try {
        const [camiones, recolectores] = await Promise.all([
          leerFilasInventario(() => supabase.from('ruta_camiones')
            .select('id, codigo, alias, usuario_id, repartidor_id, activo').eq('activo', true)),
          listarRecolectoresCargaRuta(supabase),
        ]);
        if (recolectores.error) throw new Error(recolectores.error);
        const entradas = await Promise.all((recolectores.data || []).map(async (r) => {
          const camion = resolverCamionDeRecolector(camiones, r);
          if (!camion) return [r.id, { sinCamion: true }];
          const [cargas, evento] = await Promise.all([
            leerFilasInventario(() => supabase.from('ruta_cargas')
              .select('id').eq('camion_id', camion.id).eq('estado', 'en_ruta')),
            supabase.from('ruta_carga_eventos').select('created_at').eq('camion_id', camion.id)
              .order('created_at', { ascending: false }).limit(1),
          ]);
          const lineas = [];
          const ultimaCarga = evento.error ? null : evento.data?.[0]?.created_at;
          for (let i = 0; i < cargas.length; i += 100) {
            const ids = cargas.slice(i, i + 100).map((c) => c.id);
            const filas = await leerFilasInventario(() => supabase.from('ruta_carga_lineas')
              .select('id, producto_id, precio, qty_cargada, qty_vendida, qty_devuelta').in('carga_id', ids));
            lineas.push(...filas);
          }
          const productos = [];
          const idsProducto = [...new Set(lineas.map((l) => l.producto_id))];
          for (let i = 0; i < idsProducto.length; i += 100) {
            productos.push(...await leerFilasInventario(() => supabase.from('productos')
              .select('id, precio_ruta').in('id', idsProducto.slice(i, i + 100))));
          }
          return [r.id, {
            ...resumirInventarioCamion(lineas, productos),
            camion: camion.alias || camion.codigo,
            sinCargas: !cargas.length,
            ultimaCarga,
            actualizado: new Date().toISOString(),
          }];
        }));
        if (activo) setEstado({ porRecolector: Object.fromEntries(entradas), cargando: false, error: null });
      } catch {
        if (activo) setEstado((anterior) => ({ ...anterior, cargando: false,
          error: 'No se pudo actualizar el inventario. Se reintenta automáticamente.' }));
      } finally {
        ocupado = false;
        if (activo && pendiente) { pendiente = false; programar(); }
      }
    };
    const programar = () => {
      clearTimeout(debounce);
      debounce = setTimeout(cargar, 600);
    };
    void cargar();
    const intervalo = setInterval(() => { if (!document.hidden) void cargar(); }, 15000);
    const alMostrar = () => { if (!document.hidden) void cargar(); };
    const alDesconectar = () => setEstado((anterior) => ({ ...anterior,
      error: 'Sin conexión. Se muestra el último inventario recibido.' }));
    window.addEventListener('online', programar);
    window.addEventListener('offline', alDesconectar);
    document.addEventListener('visibilitychange', alMostrar);
    const canal = supabase.channel(`inventario-rc-${Math.random().toString(36).slice(2)}`);
    for (const tabla of ['ruta_camiones', 'ruta_cargas', 'ruta_carga_lineas', 'ruta_carga_eventos', 'productos']) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, programar);
    }
    canal.subscribe();
    return () => {
      activo = false;
      clearTimeout(debounce);
      clearInterval(intervalo);
      window.removeEventListener('online', programar);
      window.removeEventListener('offline', alDesconectar);
      document.removeEventListener('visibilitychange', alMostrar);
      void supabase.removeChannel(canal);
    };
  }, [supabase, habilitado]);
  return estado;
}

export default function InventarioCamionRecolector({ datos, cargando, error, variante = 'detalle' }) {
  if (variante === 'caratula') {
    if (!datos || datos.sinCamion) return null;
    return (
      <div style={{ border: '1px solid rgba(15, 23, 42, 0.12)', borderRadius: 10, padding: '0.75rem 0.85rem', background: '#fff' }}>
        <div style={{ fontWeight: 800, color: 'var(--brand-blue)', marginBottom: '0.55rem', fontSize: '0.95rem' }}>
          Inventario del camión{datos.camion ? ` · ${datos.camion}` : ''}
        </div>
        {error && <p role="status" style={{ color: 'var(--brand-red)', margin: '0 0 0.4rem', fontSize: '0.75rem' }}>{error}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0.65rem' }}>
          <div>
            <div className="muted" style={{ fontSize: '0.78rem' }}>Cargado en ruta</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtMonto(datos.cargado)}</div>
          </div>
          <div style={{ borderLeft: '1px solid rgba(15, 23, 42, 0.12)', paddingLeft: '0.75rem' }}>
            <div style={{ color: 'var(--brand-blue)', fontSize: '0.78rem', fontWeight: 700 }}>Disponible actual</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--brand-blue)', fontVariantNumeric: 'tabular-nums' }}>{fmtMonto(datos.disponible)}</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: '0.7rem 0.85rem', borderTop: '1px solid var(--border, rgba(15,23,42,0.12))', fontSize: '0.72rem' }}>
      <div style={{ fontWeight: 700, color: 'var(--brand-blue)', marginBottom: '0.5rem' }}>
        Inventario del camión{datos?.camion ? ` · ${datos.camion}` : ''}
      </div>
      {cargando && <span className="muted" role="status">Consultando inventario…</span>}
      {error && <p role="status" style={{ color: 'var(--brand-red)', margin: '0 0 0.4rem' }}>{error}</p>}
      {datos?.sinCamion ? <span className="muted">Sin camión asignado.</span> : datos && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0.65rem' }}>
            <div>
              <span className="muted">Cargado en ruta</span>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtMonto(datos.cargado)}</div>
              <div className="muted">Última carga</div>
              <div>{fecha(datos.ultimaCarga)}</div>
            </div>
            <div style={{ borderLeft: '1px solid var(--border, rgba(15,23,42,0.12))', paddingLeft: '0.65rem' }}>
              <span style={{ color: 'var(--brand-blue)' }}>Disponible actual</span>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--brand-blue)', fontVariantNumeric: 'tabular-nums' }}>{fmtMonto(datos.disponible)}</div>
              <div className="muted">{error ? 'Último dato recibido' : 'Actualizado'}</div>
              <time dateTime={datos.actualizado}>{fecha(datos.actualizado)}</time>
            </div>
          </div>
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.68rem' }}>
            Precio de venta en ruta · Cargas abiertas acumuladas · Hora de Nogales
          </p>
          {datos.sinCargas && <p className="muted" style={{ margin: '0.35rem 0 0' }}>Sin cargas abiertas.</p>}
          {datos.sinPrecio && <p role="status" style={{ color: 'var(--brand-red)', margin: '0.35rem 0 0' }}>Importe parcial: hay productos sin precio de ruta.</p>}
        </>
      )}
    </div>
  );
}
