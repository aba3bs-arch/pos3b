import React, { useState } from 'react';
import BrandLogo from './BrandLogo.jsx';
import InputPin from './InputPin.jsx';
import SelectorTemaInterfaz from './SelectorTemaInterfaz.jsx';
import SelectorSucursal from './SelectorSucursal.jsx';
import { BtnLabel } from './Icon.jsx';
import { etiquetaTienda } from '../constants/sucursales.js';

export default function PantallaLogin({
  brandTitle,
  tiendaFijadaParaAcceso,
  sucursal,
  listaSucursales,
  presenciaMap,
  avisoPresencia,
  onCambiarSucursal,
  onFijarTienda,
  sucursalFijaEnv,
  onDesbloquearTiendaConAdmin,
  desbloqueandoTienda = false,
  supabaseConfigured,
  pin,
  onPinChange,
  onLogin,
  puedeIngresarPin,
  pinFieldKey = 0,
  pendienteCubreTurno,
  nombreCubre,
  telefonoCubre,
  onNombreCubreChange,
  onTelefonoCubreChange,
  onConfirmarCubreTurno,
  onCancelarCubreTurno,
  enviandoCubre,
  cubreDatosListos = false,
  cubreTurnoHabilitado,
  pendienteAutorizacionTurno,
  pinAdminAutorizacion,
  onPinAdminChange,
  onAutorizarTurno,
  onCancelarAutorizacion,
  autorizandoTurno,
}) {
  const [pedirAdminDesbloqueo, setPedirAdminDesbloqueo] = useState(false);
  const [pinAdminDesbloqueo, setPinAdminDesbloqueo] = useState('');

  const cancelarDesbloqueo = () => {
    setPedirAdminDesbloqueo(false);
    setPinAdminDesbloqueo('');
  };

  const confirmarDesbloqueo = () => {
    if (typeof onDesbloquearTiendaConAdmin !== 'function') return;
    void onDesbloquearTiendaConAdmin(pinAdminDesbloqueo).then((ok) => {
      if (ok) cancelarDesbloqueo();
    });
  };

  return (
    <div className="login-shell">
      <div className="login-shell-deco" aria-hidden />
      <div className="login-card card">
        <div className="login-card-accent" aria-hidden />
        <div className="brand-logo-wrap login-logo-wrap">
          <BrandLogo alt={brandTitle} maxHeight={140} style={{ maxWidth: '100%' }} />
        </div>
        <h2 className="login-title">{brandTitle}</h2>
        <p className="brand-credit">By: A.Marrero</p>
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
              <SelectorSucursal
                className="select"
                style={{ marginTop: '0.35rem' }}
                value={sucursal}
                onChange={onCambiarSucursal}
                lista={listaSucursales}
                presenciaMap={presenciaMap}
                title="Tienda de este punto de venta"
                mostrarLeyenda
                avisoPresencia={avisoPresencia}
              />
            </label>
            <button type="button" className="btn btn-gold login-btn-block" onClick={onFijarTienda}>
              Fijar tienda en este equipo
            </button>
            <p className="muted login-hint">
              En la PC de caja, al fijar la tienda y entrar con PIN de <strong>cajero</strong> o <strong>repartidor</strong>, ese PIN
              quedará ligado a esta computadora. El <strong>administrador</strong> no se ancla a ninguna sucursal ni dispositivo: puede
              entrar desde cualquier caja o celular.
            </p>
          </>
        )}

        {tiendaFijadaParaAcceso && (
          <div className="login-tienda-badge">
            <span className="badge">Tienda asignada: {etiquetaTienda(sucursal)}</span>
            {sucursalFijaEnv ? (
              <p className="muted login-hint-sm">Fijada por instalación</p>
            ) : (
              <>
                <p className="muted login-hint-sm">Fijada en este navegador</p>
                {typeof onDesbloquearTiendaConAdmin === 'function' && !pedirAdminDesbloqueo && (
                  <button
                    type="button"
                    className="btn btn-ghost login-btn-block"
                    style={{ marginTop: '0.65rem', fontSize: '0.82rem' }}
                    onClick={() => setPedirAdminDesbloqueo(true)}
                  >
                    Desbloquear tienda (solo admin)
                  </button>
                )}
                {pedirAdminDesbloqueo && (
                  <div
                    className="login-auth-turno"
                    style={{ marginTop: '0.75rem', borderColor: 'rgba(220,38,38,0.35)', background: 'rgba(220,38,38,0.06)' }}
                  >
                    <strong style={{ color: 'var(--brand-red)' }}>Autorización de administrador</strong>
                    <p className="muted login-hint-sm" style={{ margin: '0.35rem 0 0.65rem' }}>
                      Sin PIN de <strong>Administrador</strong> no se puede cambiar la tienda de esta caja.
                    </p>
                    <label className="muted login-field">
                      PIN del administrador
                      <InputPin
                        value={pinAdminDesbloqueo}
                        onChange={(e) => setPinAdminDesbloqueo(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !desbloqueandoTienda && confirmarDesbloqueo()}
                        placeholder="PIN admin"
                        autoFocus
                        autoComplete="off"
                        name="desbloqueo-tienda-admin"
                      />
                    </label>
                    <div className="login-auth-actions">
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={confirmarDesbloqueo}
                        disabled={desbloqueandoTienda || !pinAdminDesbloqueo.trim()}
                      >
                        {desbloqueandoTienda ? 'Verificando…' : 'Desbloquear'}
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={cancelarDesbloqueo} disabled={desbloqueandoTienda}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {!supabaseConfigured && (
          <p className="login-error">
            Falta configuración de Supabase. Configura <code>.env</code> o <code>public/pos3b-config.js</code>.
          </p>
        )}

        {!pendienteCubreTurno && !pedirAdminDesbloqueo && (
          <>
            <InputPin
              key={`login-pin-${pinFieldKey}`}
              value={pin}
              onChange={onPinChange}
              onKeyDown={(e) => e.key === 'Enter' && puedeIngresarPin && !pendienteAutorizacionTurno && onLogin()}
              placeholder="PIN"
              autoFocus={puedeIngresarPin}
              disabled={!puedeIngresarPin}
              autoComplete="off"
              name={`login-pin-${pinFieldKey}`}
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
              Obligatorio: <strong>nombre y apellido</strong> + <strong>teléfono</strong> (10 dígitos). Sin esos datos no puedes entrar.
            </p>
            <label className="muted login-field">
              Nombre y apellido completos
              <input
                className="input"
                value={nombreCubre}
                onChange={onNombreCubreChange}
                placeholder="Ej. María López García"
                autoFocus
                maxLength={80}
                required
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
                onKeyDown={(e) => e.key === 'Enter' && cubreDatosListos && !enviandoCubre && onConfirmarCubreTurno()}
                placeholder="10 dígitos"
                maxLength={15}
                required
              />
            </label>
            {!cubreDatosListos && (
              <p className="muted login-hint-sm" style={{ margin: '0 0 0.5rem', color: 'var(--brand-gold)' }}>
                Completa nombre y apellido + teléfono para continuar.
              </p>
            )}
            <div className="login-auth-actions">
              <button
                type="button"
                className="btn btn-gold"
                onClick={onConfirmarCubreTurno}
                disabled={enviandoCubre || !cubreDatosListos}
              >
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
                autoComplete="off"
                name="autorizacion-turno-admin"
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
