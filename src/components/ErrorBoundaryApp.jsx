import React from 'react';
import { limpiarCacheTemporal } from '../lib/limpiarCache.js';
import { registrarEventoAuditoria } from '../lib/auditoriaUso.js';
import { esErrorCargaChunk, resumenErrorPantalla } from '../lib/errorPantalla.js';

const LS_ULTIMO_ERROR = 'pos3b_ultimo_error_pantalla';

/**
 * Evita la pantalla en blanco: si algo falla al pintar, muestra el motivo y
 * permite recargar o limpiar el caché temporal (sin perder tienda ni equipo).
 */
export default class ErrorBoundaryApp extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, limpiando: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const resumen = resumenErrorPantalla(error, info);
    try {
      localStorage.setItem(LS_ULTIMO_ERROR, JSON.stringify({ ...resumen, at: new Date().toISOString() }));
    } catch {
      /* sin espacio: no bloquear */
    }
    try {
      void registrarEventoAuditoria(null, {
        tipo: 'SEGURIDAD',
        accion: 'ERROR_PANTALLA_EN_BLANCO',
        severidad: 'warning',
        detalle: resumen,
      });
    } catch {
      /* best-effort */
    }
    if (esErrorCargaChunk(error)) this.recargarLimpio();
  }

  recargarLimpio = async () => {
    this.setState({ limpiando: true });
    try {
      await limpiarCacheTemporal();
    } catch {
      /* seguir con la recarga */
    }
    window.location.reload();
  };

  render() {
    const { error, limpiando } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="login-shell">
        <div className="login-card card" style={{ maxWidth: 460 }}>
          <h2 className="login-title">La pantalla tuvo un problema</h2>
          <p className="muted" style={{ margin: '0.5rem 0 0.75rem' }}>
            No se perdió nada: la tienda y este equipo siguen configurados. Pulsa «Limpiar y recargar».
            Si vuelve a pasar, avisa al administrador con este mensaje:
          </p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: '0.78rem',
              background: 'rgba(220,38,38,0.08)',
              border: '1px solid rgba(220,38,38,0.3)',
              borderRadius: 8,
              padding: '0.6rem',
              maxHeight: 160,
              overflow: 'auto',
            }}
          >
            {String(error?.message || error).slice(0, 400)}
          </pre>
          <button
            type="button"
            className="btn btn-primary login-btn-block"
            onClick={this.recargarLimpio}
            disabled={limpiando}
          >
            {limpiando ? 'Limpiando…' : 'Limpiar y recargar'}
          </button>
          <button
            type="button"
            className="btn btn-ghost login-btn-block"
            style={{ marginTop: '0.5rem' }}
            onClick={() => window.location.reload()}
          >
            Solo recargar
          </button>
        </div>
      </div>
    );
  }
}
