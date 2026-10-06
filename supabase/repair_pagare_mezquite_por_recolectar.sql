-- Repara PAG-20261001-7ALP (3B10 El Mezquite):
-- quedó en «liquidado» por abono a $0 sin pasar a por_recolectar.
-- Debe quedar pendiente de Recolectar → RC Virtual.

update public.pagares
set
  estado = 'por_recolectar',
  rc_monto = coalesce(nullif(rc_monto, 0), nullif(abono, 0), monto),
  saldo = coalesce(nullif(rc_monto, 0), nullif(abono, 0), monto)
where folio = 'PAG-20261001-7ALP'
  and lower(coalesce(estado, '')) = 'liquidado'
  and coalesce(rc_recolectado_por, rc_recibido_por, '') = '';

-- Verificación:
-- select folio, sucursal_id, estado, monto, saldo, rc_monto, liquidado_por
-- from public.pagares
-- where folio = 'PAG-20261001-7ALP';
