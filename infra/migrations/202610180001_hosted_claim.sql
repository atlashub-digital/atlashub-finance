-- Server-owned provenance; caller-supplied checkout metadata is not authority.
ALTER TABLE aro_checkout_session ADD COLUMN "hostedClaimEligible" boolean NOT NULL DEFAULT false;

-- One successful binding per hosted session, independently of proof refreshes.
-- AuditEvent is committed in the same transaction. No secrets or payer PII.
CREATE TABLE aro_checkout_claim (
  "checkoutSessionId" text PRIMARY KEY REFERENCES aro_checkout_session(id),
  "tenantId" text NOT NULL,
  "projectId" text NOT NULL REFERENCES aro_project_config("projectId"),
  "orderId" text NOT NULL UNIQUE,
  "offerId" text NOT NULL REFERENCES aro_offer(id),
  "contactId" text NOT NULL,
  "principalId" text NOT NULL,
  "issuedAt" timestamptz NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "consumedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY ("tenantId", "orderId") REFERENCES commerce_order("tenantId", id),
  CHECK ("expiresAt" > "issuedAt" AND "expiresAt" <= "issuedAt" + interval '120 seconds')
);
ALTER TABLE aro_checkout_claim ENABLE ROW LEVEL SECURITY;
CREATE POLICY aro_runtime_access ON aro_checkout_claim TO aro_runtime USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON aro_checkout_claim TO aro_runtime;
