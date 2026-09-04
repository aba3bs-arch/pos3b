-- Endurece la bitácora existente: quita DELETE/UPDATE (auditoría permanente).
-- Ejecutar en Supabase → SQL Editor si ya tenías movimientos_inventario con política "for all".

alter table public.movimientos_inventario enable row level security;

drop policy if exists "movimientos_inventario_anon_rw" on public.movimientos_inventario;
drop policy if exists "movimientos_inventario_anon_select" on public.movimientos_inventario;
drop policy if exists "movimientos_inventario_anon_insert" on public.movimientos_inventario;

create policy "movimientos_inventario_anon_select" on public.movimientos_inventario
  for select using (true);

create policy "movimientos_inventario_anon_insert" on public.movimientos_inventario
  for insert with check (true);

revoke update, delete on public.movimientos_inventario from anon, authenticated;
grant select, insert on public.movimientos_inventario to anon, authenticated;

comment on table public.movimientos_inventario is
  'Bitácora append-only: insert+select. No update/delete desde el POS.';
