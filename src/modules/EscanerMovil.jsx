import React, { useEffect, useState } from 'react';
import CampoCodigo from '../components/CampoCodigo.jsx';
import { BtnLabel } from '../components/Icon.jsx';
import { etiquetaTienda } from '../constants/sucursales.js';
import { enviarCodigoEscanerRemoto, canalEscanerRemoto } from '../lib/escanerRemoto.js';
import { productoPorCodigoExacto } from '../lib/buscarProductoTexto.js';

/**
 * Modo teléfono: escanea y manda el código en tiempo real al carrito del POS
 * de la misma sucursal + mismo PIN (usuario).
 */
export default function EscanerMovil({ supabase, user, sucursal, inventario, onVolver }) {
  const [codigo, setCodigo] = useState('');
  const [msg, setMsg] = useState('');
  const [ultimo, setUltimo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [okCount, setOkCount] = useState(0);

  useEffect(() => {
    setMsg(
      `Canal: ${canalEscanerRemoto(sucursal, user?.id)}. Abre Ventas en la computadora con el mismo PIN.`,
    );
  }, [sucursal, user?.id]);

  const enviar = async (raw) => {
    const code = String(raw || codigo || '').trim();
    if (!code || enviando) return;
    setEnviando(true);
    setMsg('');
    const prod = productoPorCodigoExacto(inventario, code);
    const res = await enviarCodigoEscanerRemoto(supabase, {
      sucursal,
      userId: user?.id,
      codigo: code,
      usuarioNombre: user?.nombre,
    });
    setEnviando(false);
    if (!res.ok) {
      setMsg(res.error || 'No se envió.');
      return;
    }
    setOkCount((n) => n + 1);
    setUltimo(prod ? `${prod.nombre} (${prod.id})` : code);
    setMsg(prod ? `Enviado al carrito: ${prod.nombre}` : `Código enviado: ${code}`);
    setCodigo('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 480, margin: '0 auto' }}>
      <div>
        <h2 style={{ margin: 0, color: 'var(--brand-blue)' }}>Escáner móvil</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          {etiquetaTienda(sucursal)} · {user?.nombre || 'Cajero'} · lo que escanees llega al carrito de la PC
        </p>
      </div>

      <div
        className="card"
        style={{
          background: 'linear-gradient(145deg, #f8fafc, #eef4fb)',
          border: '1px solid var(--border)',
        }}
      >
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.92rem' }}>
          1. En la computadora de tienda, inicia sesión con el <strong>mismo PIN</strong> y abre <strong>Ventas</strong>.
          <br />
          2. Aquí escanea con la cámara o el lector del teléfono.
        </p>
        <CampoCodigo
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onEscanear={enviar}
          beepAlEnter
          autoFocus
          placeholder="Apunta al código de barras…"
          tituloCamara="Escanear para el carrito"
        />
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '0.75rem' }}
          disabled={enviando || !codigo.trim()}
          onClick={() => enviar(codigo)}
        >
          <BtnLabel icon="scan">{enviando ? 'Enviando…' : 'Enviar al carrito'}</BtnLabel>
        </button>
      </div>

      {msg && <p style={{ margin: 0, color: 'var(--brand-blue)' }}>{msg}</p>}
      {ultimo && (
        <div className="card">
          <div className="muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>Último enviado</div>
          <div style={{ fontWeight: 700, marginTop: 4 }}>{ultimo}</div>
          <div className="muted" style={{ marginTop: 6 }}>{okCount} escaneo(s) en esta sesión</div>
        </div>
      )}

      {onVolver && (
        <button type="button" className="btn btn-ghost" onClick={onVolver}>
          Salir del escáner
        </button>
      )}
    </div>
  );
}
