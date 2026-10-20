-- Diagnóstico Disk IO (Supabase).
-- Ejecutar en SQL Editor cuando el dashboard avise "Disk IO Budget".
-- Baseline Nano (free) = ~5 MB/s; al agotar el burst, el proyecto se frena ahí.

-- 1) Cache hit: ideal > 0.99. Si es bajo, las queries leen disco en vez de RAM.
select
  'index hit rate' as metric,
  round((sum(idx_blks_hit)::numeric / nullif(sum(idx_blks_hit + idx_blks_read), 0))::numeric, 4) as ratio
from pg_statio_user_indexes
union all
select
  'table hit rate',
  round((sum(heap_blks_hit)::numeric / nullif(sum(heap_blks_hit + heap_blks_read), 0))::numeric, 4)
from pg_statio_user_tables;

-- 2) Tablas con más sequential scans (candidatas a índices / menos SELECT *).
select
  schemaname,
  relname as table,
  seq_scan,
  seq_tup_read,
  idx_scan,
  n_live_tup as approx_rows
from pg_stat_user_tables
order by seq_scan desc
limit 25;

-- 3) Queries más costosas (requiere pg_stat_statements; en Supabase suele estar activo).
-- Si falla: Dashboard → Reports → Query performance.
select
  calls,
  round(total_exec_time::numeric, 1) as total_ms,
  round(mean_exec_time::numeric, 2) as mean_ms,
  round((100 * total_exec_time / sum(total_exec_time) over ())::numeric, 2) as pct,
  left(query, 180) as query
from pg_stat_statements
where userid = (select usesysid from pg_user where usename = current_user)
order by total_exec_time desc
limit 20;

-- 4) Tamaño de tablas + índices (bloat / tablas enormes).
select
  relname as table,
  pg_size_pretty(pg_total_relation_size(relid)) as total,
  pg_size_pretty(pg_relation_size(relid)) as table_bytes,
  pg_size_pretty(pg_indexes_size(relid)) as indexes
from pg_catalog.pg_statio_user_tables
order by pg_total_relation_size(relid) desc
limit 20;

-- 5) Índices poco usados (candidatos a limpiar si confirman que no hacen falta).
select
  schemaname,
  relname as table,
  indexrelname as index,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
from pg_stat_user_indexes
where idx_scan < 50
order by pg_relation_size(indexrelid) desc
limit 30;
