import React from 'react';
import { MOTIVOS_BAJA_RH } from '../lib/rhAba3b.js';

/**
 * Formulario compartido de baja (Usuarios y RH ABA3B).
 */
export default function FormularioBajaEmpleado({
  nombre,
  form,
  setForm,
  onConfirm,
  onCancel,
  trabajando = false,
  notasPlaceholder = 'Notas de baja (opcional)',
  children,
}) {
  return (
    <div className="card" style={{ borderLeft: '4px solid var(--danger)' }}>
      <h3 style={{ margin: '0 0 0.5rem' }}>Dar de baja · {nombre}</h3>
      {children || (
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          Dejará de iniciar sesión con su PIN y saldrá de <strong>nómina</strong>,{' '}
          <strong>empleados por turno</strong> y <strong>Usuarios</strong>.
          El expediente queda en <strong>RH ABA3B → Inactivos / bajas</strong>.
        </p>
      )}
      <div className="grid-2">
        <label className="muted" style={{ fontSize: '0.8rem' }}>
          Motivo
          <select
            className="select"
            style={{ marginTop: '0.35rem' }}
            value={form.motivo_baja}
            onChange={(e) => setForm({ ...form, motivo_baja: e.target.value })}
          >
            {MOTIVOS_BAJA_RH.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="muted" style={{ fontSize: '0.8rem' }}>
          Fecha de baja
          <input
            className="input"
            type="date"
            style={{ marginTop: '0.35rem' }}
            value={form.fecha_baja}
            onChange={(e) => setForm({ ...form, fecha_baja: e.target.value })}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={form.recontratable}
            onChange={(e) => setForm({ ...form, recontratable: e.target.checked })}
          />
          Puede reingresar (recontratable)
        </label>
        {!form.recontratable && (
          <input
            className="input"
            placeholder="Motivo por el que NO es recontratable"
            value={form.motivo_no_recontratable}
            onChange={(e) => setForm({ ...form, motivo_no_recontratable: e.target.value })}
          />
        )}
        <input
          className="input"
          style={{ gridColumn: '1 / -1' }}
          placeholder={notasPlaceholder}
          value={form.notas_baja}
          onChange={(e) => setForm({ ...form, notas_baja: e.target.value })}
        />
      </div>
      {!form.recontratable && (
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: '0.65rem' }}>
          Sin reingreso: para volver a darlo de alta se necesita el <strong>PIN del administrador principal</strong>.
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-danger" disabled={trabajando} onClick={onConfirm}>
          {trabajando ? 'Guardando…' : 'Confirmar baja'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
