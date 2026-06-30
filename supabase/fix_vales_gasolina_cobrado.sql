-- =============================================================================
-- POS 3B — Vales gasolina: cobrado = día laboral; no cobrado = falta en nómina
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.vales add column if not exists cobrado boolean;
alter table public.vales add column if not exists cobrado_at timestamptz;
alter table public.vales add column if not exists cobrado_por text;

-- Vales ya existentes (sin valor): tratarlos como cobrados para no generar faltas retroactivas.
update public.vales
set cobrado = true
where categoria = 'gasolina'
  and estado_aprobacion = 'aprobado'
  and cobrado is null;

alter table public.vales alter column cobrado set default false;

update public.vales set cobrado = false where cobrado is null;

create index if not exists idx_vales_gasolina_cobrado on public.vales (categoria, cobrado, fecha desc);
