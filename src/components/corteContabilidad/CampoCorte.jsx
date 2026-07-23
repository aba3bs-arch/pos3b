import React from 'react';

function valorInput(value, editable) {
  if (!editable) {
    if (value === '' || value == null) return '0';
    return String(value);
  }
  if (value === null || value === undefined) return '';
  return String(value);
}

export function avanzarCampoCorte(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const form = e.target.closest('[data-corte-form]');
  if (!form) return;
  const fields = [...form.querySelectorAll('[data-corte-tab]')].filter(
    (el) => !el.readOnly && !el.disabled,
  );
  const idx = fields.indexOf(e.target);
  if (idx >= 0 && idx < fields.length - 1) fields[idx + 1].focus();
}

export default function CampoCorte({
  label,
  value,
  onChange,
  editable = true,
  hint,
  color,
  className = '',
  inputClassName = '',
  inputStyle = {},
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem' }} className={className}>
      <span style={{ fontWeight: 700, color: color || 'var(--muted)' }}>{label}</span>
      <input
        className={`input${editable ? ' corte-campo-editable' : ''}${inputClassName ? ` ${inputClassName}` : ''}`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        data-corte-tab={editable ? '1' : undefined}
        value={valorInput(value, editable)}
        readOnly={!editable}
        onChange={editable ? (e) => onChange?.(e.target.value) : undefined}
        onFocus={editable ? (e) => e.target.select() : undefined}
        onKeyDown={editable ? avanzarCampoCorte : undefined}
        style={{
          fontWeight: 700,
          textAlign: 'center',
          ...(editable ? {} : { opacity: 0.85, cursor: 'default', background: 'var(--surface)' }),
          ...inputStyle,
        }}
      />
      {hint && <span className="muted" style={{ fontSize: '0.7rem' }}>{hint}</span>}
    </label>
  );
}

export function InputCorteInline({ value, onChange, editable = true, style = {} }) {
  return (
    <input
      className={`input${editable ? ' corte-campo-editable' : ''}`}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      data-corte-tab={editable ? '1' : undefined}
      value={valorInput(value, editable)}
      readOnly={!editable}
      onChange={editable ? (e) => onChange?.(e.target.value) : undefined}
      onFocus={editable ? (e) => e.target.select() : undefined}
      onKeyDown={editable ? avanzarCampoCorte : undefined}
      style={{ textAlign: 'center', fontWeight: 700, ...style }}
    />
  );
}
