import React from 'react';
import BrandLogo from './BrandLogo.jsx';
import InputPin from './InputPin.jsx';
import SelectorTemaInterfaz from './SelectorTemaInterfaz.jsx';
import { BtnLabel } from './Icon.jsx';
import { etiquetaTienda } from '../constants/sucursales.js';

export default function PantallaLogin({
  brandTitle,
  tiendaFijadaParaAcceso,
  sucursal,
  listaSucursales,
  onCambiarSucursal,
  onFijarTienda,
  sucursalFijaEnv,
  supabaseConfigured,
  pin,
  onPinChange,
  onLogin,
  puedeIngresarPin,
  pendienteCubreTurno,
  nombreCubre,
  telefonoCubre,
  onNombreCubreChange,
  onTelefonoCubreChange,
  onConfirmarCubreTurno,
  onCancelarCubreTurno,
  enviandoCubre,
  cubreTurnoHabilitado,
  pendienteAutorizacionTurno,
  pinAdminAutorizacion,
  onPinAdminChange,
  onAutorizarTurno,
  onCancelarAutorizacion,
  autorizandoTurno,
}) {
  return (
    <div className="login-shell">
      <div className="login-shell-deco" aria-hidden />
      <div className="login-card card">
        <div className="login-card-accent" aria-hidden />
        <div className="brand-logo-wrap login-logo-wrap">
          <BrandLogo alt={brandTitle} maxHeight={140} style={{ maxWidth: '100%' }} />
        </div>
        <h2 className="login-title">{brandTitle}</h2>
        <p className="login-sub muted">
          {pendienteCubreTurno
            ? 'Identifícate para cubrir turno en esta tienda.'
            : tiendaFijadaParaAcceso
              ? 'Ingresa tu PIN'
              : 'Elige la tienda y escribe tu PIN. En la caja puedes fijarla con el botón de abajo.'}
        </p>

        {!tiendaFijadaParaAcceso && !sucursalFijaEnv && (
          <>
            <label className="muted login-field">
              Tienda de este punto de venta
              <select className="select" value={sucursal} onChange={(e) => onCambiarSucursal(e.target.value)}>
                {listaSucursales.map((s) => (
                  <option key={s} value={s}>
                    {etiquetaTienda(s)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-gold login-btn-block" onClick={onFijarTienda}>
              Fijar tienda en este equipo
            </button>
            <p className="muted login-hint">
              En la PC de caja, al fijar la tienda y entrar con PIN de <strong>cajero</strong> o <strong>repartidor</strong>, ese PIN
              quedará ligado a esta computadora. Gerentes y administradores no quedan vinculados.
            </p>
          </>
        )}

        {tiendaFijadaParaAcceso && (
          <div className="login-tienda-badge">
            <span className="badge">Tienda asignada: {etiquetaTienda(sucursal)}</span>
            {sucursalFijaEnv ? (
              <p className="muted login-hint-sm">Fijada por instalación</p>
            ) : (
              <p className="muted login-hint-sm">Fijada en este navegador</p>
            )}
          </div>
        )}

        {!supabaseConfigured && (
          <p className="login-error">
            Falta configuración de Supabase. Configura <code>.env</code> o <code>public/pos3b-config.js</code>.
          </p>
        )}

        {!pendienteCubreTurno && (
        <>
        <InputPin
          value={pin}
          onChange={onPinChange}
          onKeyDown={(e) => e.key === 'Enter' && puedeIngresarPin && onLogin()}
          placeholder="PIN"
          autoFocus={puedeIngresarPin}
          disabled={!puedeIngresarPin}
          className="login-pin"
        />
        <button
          type="button"
          className="btn btn-primary login-btn-block login-btn-enter"
          onClick={onLogin}
          disabled={!puedeIngresarPin || Boolean(pendienteAutorizacionTurno)}
        >
          <BtnLabel icon="logIn">Entrar</BtnLabel>
        </button>
        {cubreTurnoHabilitado && (
          <p className="muted login-hint-sm" style={{ marginTop: '0.5rem' }}>
            Si cubres turno, usa el <strong>PIN de cubre turno</strong> configurado por el administrador en {etiquetaTienda(sucursal)}.
          </p>
        )}
        </>
        )}

        {pendienteCubreTurno && (
          <div className="login-auth-turno" style={{ borderColor: 'rgba(225,153,41,0.45)', background: 'rgba(225,153,41,0.08)' }}>
            <strong style={{ color: 'var(--brand-gold)' }}>Cubre turno · {etiquetaTienda(sucursal)}</strong>
            <p className="muted login-hint-sm" style={{ margin: '0.35rem 0 0.65rem' }}>
              Mismos permisos de cajero. Indica quién está en mostrador (queda registrado en bitácora).
            </p>
            <label className="muted login-field">
              Nombre completo
              <input
                className="input"
                value={nombreCubre}
                onChange={onNombreCubreChange}
                placeholder="Ej. María López"
                autoFocus
                maxLength={80}
              />
            </label>
            <label className="muted login-field">
              Teléfono de contacto
              <input
                className="input"
                type="tel"
                inputMode="tel"
                value={telefonoCubre}
                onChange={onTelefonoCubreChange}
                onKeyDown={(e) => e.key === 'Enter' && !enviandoCubre && onConfirmarCubreTurno()}
                placeholder="10 dígitos"
                maxLength={15}
              />
            </label>
            <div className="login-auth-actions">
              <button type="button" className="btn btn-gold" onClick={onConfirmarCubreTurno} disabled={enviandoCubre}>
                {enviandoCubre ? 'Entrando…' : 'Entrar a cubrir turno'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onCancelarCubreTurno} disabled={enviandoCubre}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {!pendienteCubreTurno && pendienteAutorizacionTurno && (
          <div className="login-auth-turno">
            <strong>Fuera de horario de turno</strong>
            <p className="muted">{pendienteAutorizacionTurno.error}</p>
            <p>
              Empleado: <strong>{pendienteAutorizacionTurno.user.nombre}</strong>
            </p>
            <p className="muted login-hint-sm">
              Un <strong>administrador</strong> puede autorizar la entrada en {etiquetaTienda(sucursal)} (válido 8 h).
            </p>
            <label className="muted login-field">
              PIN del administrador
              <InputPin
                value={pinAdminAutorizacion}
                onChange={onPinAdminChange}
                onKeyDown={(e) => e.key === 'Enter' && !autorizandoTurno && onAutorizarTurno()}
                placeholder="PIN admin"
                autoFocus
              />
            </label>
            <div className="login-auth-actions">
              <button type="button" className="btn btn-gold" onClick={onAutorizarTurno} disabled={autorizandoTurno}>
                {autorizandoTurno ? 'Verificando…' : 'Autorizar entrada'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onCancelarAutorizacion} disabled={autorizandoTurno}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="login-tema-picker">
          <SelectorTemaInterfaz compact />
        </div>
      </div>
    </div>
  );
}
