import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Sql } from "../db/client.js";
import { randomToken, sha256Hex } from "../lib/crypto.js";

/**
 * Tenant-level provider accounts/routes and project keys. Project catalogs are
 * synced from aro.project.yaml (see catalog.ts). Applied by Infrastructure
 * with an owner connection; idempotent.
 */

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/);

export const ProviderManifest = z.object({
  tenant: z.string(),
  accounts: z.array(
    z.object({
      id: slug,
      provider: z.enum(["pixgo", "misticpay", "stripe"]),
      environment: z.enum(["production", "test"]).default("production"),
      credential_ref: z.string().regex(/^[a-z0-9/_-]+$/),
      status: z.enum(["active", "degraded", "disabled"]).default("active"),
    }),
  ),
  routes: z.array(
    z.object({
      id: slug,
      market: z.string().min(1).max(16),
      currency: z.string().regex(/^[A-Z]{3}$/),
      method: z.enum(["PIX", "CARD"]),
      account: slug,
      priority: z.number().int(),
      active: z.boolean().default(true),
    }),
  ),
});

export type ProviderManifest = z.infer<typeof ProviderManifest>;

export async function tenantId(sql: Sql, tenantSlug: string) {
  const [t] = await sql<{ id: string }[]>`SELECT id FROM "Tenant" WHERE slug = ${tenantSlug}`;
  if (!t) throw new Error(`Tenant not found: ${tenantSlug}`);
  return t.id;
}

export async function applyProviderManifest(sql: Sql, input: unknown) {
  const m = ProviderManifest.parse(input);
  const tid = await tenantId(sql, m.tenant);
  await sql.begin(async (tx) => {
    for (const a of m.accounts) {
      await tx`
        INSERT INTO aro_provider_account (id, "tenantId", provider, environment, "credentialRef", status)
        VALUES (${a.id}, ${tid}, ${a.provider}, ${a.environment}, ${a.credential_ref}, ${a.status})
        ON CONFLICT (id) DO UPDATE SET environment = EXCLUDED.environment,
          "credentialRef" = EXCLUDED."credentialRef", status = EXCLUDED.status`;
    }
    for (const r of m.routes) {
      await tx`
        INSERT INTO aro_payment_route (id, "tenantId", market, currency, method, "providerAccountId", priority, active)
        VALUES (${r.id}, ${tid}, ${r.market}, ${r.currency}, ${r.method}, ${r.account}, ${r.priority}, ${r.active})
        ON CONFLICT (id) DO UPDATE SET market = EXCLUDED.market, currency = EXCLUDED.currency,
          method = EXCLUDED.method, "providerAccountId" = EXCLUDED."providerAccountId",
          priority = EXCLUDED.priority, active = EXCLUDED.active,
          "ruleVersion" = aro_payment_route."ruleVersion" + 1`;
    }
  });
}

/** Issues a project key. The plaintext is returned once and never stored. */
export async function issueApiKey(sql: Sql, projectSlug: string, kind: "public" | "server") {
  const [c] = await sql<{ projectId: string }[]>`SELECT "projectId" FROM aro_project_config WHERE slug = ${projectSlug}`;
  if (!c) throw new Error(`ARO project not registered: ${projectSlug}`);
  const key = `aro_${kind === "public" ? "pk" : "sk"}_${randomToken(24)}`;
  await sql`
    INSERT INTO aro_api_key (id, "projectId", kind, "keyHash", "keyPrefix")
    VALUES (${randomUUID()}, ${c.projectId}, ${kind}, ${sha256Hex(key)}, ${key.slice(0, 12)})`;
  return key;
}

export async function revokeApiKey(sql: Sql, keyPrefix: string) {
  return sql`UPDATE aro_api_key SET "revokedAt" = now() WHERE "keyPrefix" = ${keyPrefix} AND "revokedAt" IS NULL RETURNING id`;
}
