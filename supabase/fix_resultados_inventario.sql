-- POS 3B — Resultado manual de inventario (merma para bono)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
--
-- Solo Administrador / Auditor capturan estos datos en la app.
--
-- Campos:
-- 1. valor_contado          = Total de inventario (manual)
-- 2. valor_faltante         = Faltante de inventario (manual)
-- 2b. valor_bonificacion    = Bonificación (manual; se descuenta del faltante)
-- 3. valor_despues_ajuste   = Inv. después del ajuste (auto = total − faltante neto)
-- 4. pct_merma              = Merma % (auto = faltante neto ÷ total × 100)
--    faltante neto = max(0, faltante − bonificación)
-- 5. firmas                 = jsonb: 3 firmas de conformidad [{nombre, usuario_id, firmado_at}]
--    El PIN nunca se guarda; solo el nombre estampado al firmar.

create table if not exists public.pos_resultados_inventario (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null,
  desde date not null,
  hasta date not null,
  valor_contado numeric(14, 2) not null,
  valor_sistema numeric(14, 2),
  valor_contado_sistema numeric(14, 2),
  valor_faltante numeric(14, 2),
  valor_bonificacion numeric(14, 2) not null default 0,
  valor_despues_ajuste numeric(14, 2),
  pct_merma numeric(8, 2),
  pct_efectividad numeric(8, 2),
  firmas jsonb not null default '[]'::jsonb,
  usuario text,
  nota text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pos_resultados_inventario_rango check (hasta >= desde),
  constraint uq_pos_resultados_inventario_suc_periodo unique (sucursal_id, desde, hasta)
);

alter table public.pos_resultados_inventario
  add column if not exists valor_despues_ajuste numeric(14, 2);

alter table public.pos_resultados_inventario
  add column if not exists valor_bonificacion numeric(14, 2);

alter table public.pos_resultados_inventario
  add column if not exists firmas jsonb;

update public.pos_resultados_inventario
set valor_bonificacion = 0
where valor_bonificacion is null;

update public.pos_resultados_inventario
set firmas = '[]'::jsonb
where firmas is null;

create index if not exists idx_pos_resultados_inventario_suc_fechas
  on public.pos_resultados_inventario (sucursal_id, desde desc, hasta desc);

alter table public.pos_resultados_inventario enable row level security;

drop policy if exists "pos_resultados_inventario_anon_rw" on public.pos_resultados_inventario;
create policy "pos_resultados_inventario_anon_rw" on public.pos_resultados_inventario
  for all using (true) with check (true);

comment on table public.pos_resultados_inventario is
  'Captura Admin/Auditor: total + faltante + bonificación + 3 firmas PIN. Calcula inv. post-ajuste y % merma (faltante neto) para el bono.';
