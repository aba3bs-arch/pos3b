-- PIN de cubre turno por sucursal — sincroniza todas las cajas del mismo código de tienda.
-- Ejecutar en Supabase → SQL Editor → Run (obligatorio para que el PIN funcione en todas las cajas).
create table if not exists public.pos_pin_cubre_turno (
  sucursal_id text primary key,
  pin text not null default '',
  updated_at timestamptz not null default now()
);

comment on table public.pos_pin_cubre_turno is
  'PIN universal de cubre turno por sucursal (vacío = desactivado). Valor solo en nube; no cachear en el navegador.';

alter table public.pos_pin_cubre_turno enable row level security;

drop policy if exists pos_pin_cubre_turno_anon_all on public.pos_pin_cubre_turno;
create policy pos_pin_cubre_turno_anon_all on public.pos_pin_cubre_turno
  for all to anon, authenticated
  using (true)
  with check (true);

-- Normaliza filas antiguas con distinta capitalización (p. ej. 3b3 → 3B3).
-- Conserva el PIN más reciente por código canónico.
do $$
declare
  r record;
  canon text;
  best_pin text;
  best_at timestamptz;
begin
  for r in
    select upper(trim(sucursal_id)) as canon_id
    from public.pos_pin_cubre_turno
    group by upper(trim(sucursal_id))
    having count(*) > 1
       or bool_or(sucursal_id is distinct from upper(trim(sucursal_id)))
  loop
    canon := r.canon_id;
    select pin, updated_at into best_pin, best_at
    from public.pos_pin_cubre_turno
    where upper(trim(sucursal_id)) = canon
    order by updated_at desc nulls last,
             case when sucursal_id = canon then 0 else 1 end
    limit 1;

    delete from public.pos_pin_cubre_turno
    where upper(trim(sucursal_id)) = canon;

    insert into public.pos_pin_cubre_turno (sucursal_id, pin, updated_at)
    values (canon, coalesce(best_pin, ''), coalesce(best_at, now()))
    on conflict (sucursal_id) do update
      set pin = excluded.pin,
          updated_at = excluded.updated_at;
  end loop;
end $$;
