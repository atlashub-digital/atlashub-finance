-- Review/export audit records before rollback. Removes claim bindings only.
DROP TABLE IF EXISTS aro_checkout_claim;
ALTER TABLE aro_checkout_session DROP COLUMN "hostedClaimEligible";
DELETE FROM aro_schema_migrations WHERE name = '202610180001_hosted_claim.sql';
