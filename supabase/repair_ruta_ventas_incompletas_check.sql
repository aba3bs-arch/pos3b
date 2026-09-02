-- =============================================================================
-- Repair one-shot: folios de ruta_ventas incompletos (2026-09-02)
-- Preferible: node scripts/reparar-ruta-ventas-incompletas.mjs
-- Este SQL documenta el estado esperado post-repair (referencia).
-- =============================================================================

-- Esperado tras repair:
-- VR-MTHRKPJY  efectivo  compra_id NOT NULL, transito_id NOT NULL, estado_credito NULL
-- VR-MSHWR0PK  efectivo  compra_id NOT NULL, transito_id NOT NULL
-- VR-MSHWRL9Y  efectivo  compra_id NOT NULL, transito_id NOT NULL
-- VR-MSHWW24U  credito   compra_id NOT NULL, estado_credito = 'pagado'
-- VR-MSHZZEH0  credito   compra_id NOT NULL, estado_credito = 'pagado'
-- VR-MSI5OJCK  credito   compra_id NOT NULL, estado_credito = 'pagado'

select folio, metodo_pago, cliente_id, total, compra_id, transito_id, estado_credito
from public.ruta_ventas
where folio in (
  'VR-MTHRKPJY', 'VR-MSI5OJCK', 'VR-MSHZZEH0',
  'VR-MSHWW24U', 'VR-MSHWRL9Y', 'VR-MSHWR0PK'
)
order by created_at desc;
