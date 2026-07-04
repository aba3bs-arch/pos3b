-- Registro de accesos por cubre turno (nombre + teléfono en login).
alter table public.logins add column if not exists telefono text;

comment on column public.logins.telefono is 'Teléfono de contacto en accesos CUBRE_TURNO (sin usuario fijo en usuarios)';
