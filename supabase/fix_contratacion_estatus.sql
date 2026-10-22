-- POS 3B — Estatus del proceso de contratación (candidato ↔ empresa)
-- Agrega a pos_contratacion_solicitudes los datos que ve el candidato:
-- entrevista, contratación, inicio de labores, rechazo (y en qué etapa) y mensajes.
-- También crea el código de seguimiento y la consulta pública segura por código + teléfono.
-- Requiere haber ejecutado antes supabase/fix_contratacion.sql.
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar).

alter table public.pos_contratacion_solicitudes
  add column if not exists codigo_seguimiento text;
alter table public.pos_contratacion_solicitudes
  add column if not exists entrevista_fecha timestamptz;
alter table public.pos_contratacion_solicitudes
  add column if not exists entrevista_lugar text;
alter table public.pos_contratacion_solicitudes
  add column if not exists entrevista_mensaje text;
alter table public.pos_contratacion_solicitudes
  add column if not exists contratacion_fecha date;
alter table public.pos_contratacion_solicitudes
  add column if not exists inicio_labores date;
alter table public.pos_contratacion_solicitudes
  add column if not exists inicio_sucursal text;
alter table public.pos_contratacion_solicitudes
  add column if not exists inicio_horario text;
alter table public.pos_contratacion_solicitudes
  add column if not exists rechazo_etapa text;
alter table public.pos_contratacion_solicitudes
  add column if not exists rechazo_motivo text;
alter table public.pos_contratacion_solicitudes
  add column if not exists rechazo_at timestamptz;
alter table public.pos_contratacion_solicitudes
  add column if not exists estatus_mensajes jsonb not null default '[]'::jsonb;

-- Código que el candidato usa (junto con su teléfono) para consultar su estatus.
alter table public.pos_contratacion_solicitudes
  alter column codigo_seguimiento
  set default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

-- Candidatos actuales: asignar código a los que no tienen.
update public.pos_contratacion_solicitudes
set codigo_seguimiento = upper(substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 8))
where codigo_seguimiento is null;

create unique index if not exists pos_contratacion_codigo_idx
  on public.pos_contratacion_solicitudes (codigo_seguimiento)
  where codigo_seguimiento is not null;

-- Consulta pública: solo devuelve datos del proceso (sin teléfono, evaluación ni notas internas).
create or replace function public.pos_contratacion_consultar_estatus(p_codigo text, p_telefono text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.pos_contratacion_solicitudes%rowtype;
  tel text;
begin
  tel := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10);
  if length(coalesce(trim(p_codigo), '')) < 4 or length(tel) < 10 then
    return null;
  end if;

  select * into r
  from public.pos_contratacion_solicitudes
  where upper(codigo_seguimiento) = upper(trim(p_codigo))
    and right(regexp_replace(coalesce(telefono, ''), '\D', '', 'g'), 10) = tel
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'codigo_seguimiento', r.codigo_seguimiento,
    'nombre', r.nombre,
    'tipo', r.tipo,
    'estado', r.estado,
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'sucursales_interes', r.sucursales_interes,
    'entrevista_fecha', r.entrevista_fecha,
    'entrevista_lugar', r.entrevista_lugar,
    'entrevista_mensaje', r.entrevista_mensaje,
    'contratacion_fecha', r.contratacion_fecha,
    'inicio_labores', r.inicio_labores,
    'inicio_sucursal', r.inicio_sucursal,
    'inicio_horario', r.inicio_horario,
    'rechazo_etapa', r.rechazo_etapa,
    'rechazo_motivo', r.rechazo_motivo,
    'rechazo_at', r.rechazo_at,
    'estatus_mensajes', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('id', m->>'id', 'at', m->>'at', 'texto', m->>'texto')
          order by m->>'at'
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(coalesce(r.estatus_mensajes, '[]'::jsonb)) m
    )
  );
end;
$$;

grant execute on function public.pos_contratacion_consultar_estatus(text, text) to anon, authenticated;

comment on column public.pos_contratacion_solicitudes.codigo_seguimiento is
  'Código corto que el candidato usa con su teléfono para ver su estatus.';
comment on column public.pos_contratacion_solicitudes.estatus_mensajes is
  'Mensajes de la empresa visibles al candidato: [{id, at, texto, por}].';
