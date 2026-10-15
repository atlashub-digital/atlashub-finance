-- Rollback for 202610150001_aro_v1_additive.sql.
-- ONLY valid before ARO holds production data. After the first real order,
-- disable aro_project_config / aro_payment_route rows instead.
-- Not picked up by the migration runner (subdirectory).
BEGIN;

DROP TABLE IF EXISTS aro_webhook_delivery, aro_outbound_event, aro_refund, aro_payment_attempt,
  aro_order_item, aro_checkout_session, aro_payment_route, aro_provider_account,
  aro_fulfillment_rule, aro_offer, aro_catalog_revision,
  aro_api_key, aro_project_config;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Tenant','Project','catalog_product','catalog_price','crm_contact',
    'commerce_order','commerce_entitlement','billing_webhook_event','AuditEvent'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS aro_runtime_access ON %I', t);
  END LOOP;
END $$;

ALTER TABLE billing_webhook_event DROP CONSTRAINT IF EXISTS billing_webhook_event_trust_check,
  DROP COLUMN IF EXISTS "trustLevel", DROP COLUMN IF EXISTS "projectId",
  DROP COLUMN IF EXISTS "paymentAttemptId", DROP COLUMN IF EXISTS "normalizedType";

DROP INDEX IF EXISTS commerce_entitlement_resolve_idx;
ALTER TABLE commerce_entitlement DROP CONSTRAINT IF EXISTS commerce_entitlement_project_fkey,
  DROP CONSTRAINT IF EXISTS commerce_entitlement_contact_fkey,
  DROP COLUMN IF EXISTS "projectId", DROP COLUMN IF EXISTS "contactId", DROP COLUMN IF EXISTS "revokedAt";

DROP INDEX IF EXISTS commerce_order_project_idx;
ALTER TABLE commerce_order DROP CONSTRAINT IF EXISTS commerce_order_project_fkey,
  DROP CONSTRAINT IF EXISTS commerce_order_contact_fkey,
  DROP COLUMN IF EXISTS "projectId", DROP COLUMN IF EXISTS "contactId", DROP COLUMN IF EXISTS "approvedAt";
-- Narrowing checks fails if rows use the new values; that is intentional.
ALTER TABLE commerce_order DROP CONSTRAINT IF EXISTS commerce_order_status_check;
ALTER TABLE commerce_order ADD CONSTRAINT commerce_order_status_check
  CHECK (status = ANY (ARRAY['pending_payment','paid','fulfilling','fulfilled','cancelled']));
ALTER TABLE catalog_product DROP CONSTRAINT IF EXISTS catalog_product_kind_check;
ALTER TABLE catalog_product ADD CONSTRAINT catalog_product_kind_check
  CHECK (kind = ANY (ARRAY['mission','subscription','addon','setup','credit_pack']));

DELETE FROM aro_schema_migrations WHERE name = '202610150001_aro_v1_additive.sql';
COMMIT;
-- aro_runtime role is left in place; drop manually once no login user depends on it.
