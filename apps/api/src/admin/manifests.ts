import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Sql } from "../db/client.js";
import { randomToken, sha256Hex } from "../lib/crypto.js";

/**
 * Declarative registration of ARO configuration. A project integrates by
 * shipping a manifest (offers, prices, entitlement keys) — never provider code.
 * Applied by Infrastructure with an owner connection; idempotent.
 */

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/);
const currency = z.enum(["BRL", "EUR", "USD"]); // catalog_price currency check (live schema)

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

export const ProjectManifest = z.object({
  tenant: z.string(),
  project: z.object({
    slug,
    name: z.string().min(1),
    allowed_origins: z.array(z.url()).default([]),
    webhook_url: z.url().optional(),
    webhook_secret_ref: z.string().regex(/^[a-z0-9/_-]+$/).optional(),
    default_market: z.string().default("BR"),
    default_currency: currency.default("BRL"),
  }),
  offers: z.array(
    z.object({
      slug: z.string().min(1).max(128),
      title: z.string().min(1),
      amount_minor: z.number().int().min(0),
      currency,
      market: z.string().default("*"),
      entitlements: z.array(z.string().min(3)),
      status: z.enum(["active", "retired"]).default("active"),
    }),
  ),
});

export type ProviderManifest = z.infer<typeof ProviderManifest>;
export type ProjectManifest = z.infer<typeof ProjectManifest>;

async function tenantId(sql: Sql, tenantSlug: string) {
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

export async function applyProjectManifest(sql: Sql, input: unknown) {
  const m = ProjectManifest.parse(input);
  const p = m.project;
  if (Boolean(p.webhook_url) !== Boolean(p.webhook_secret_ref)) {
    throw new Error("webhook_url and webhook_secret_ref must be set together");
  }
  for (const o of m.offers) {
    for (const k of o.entitlements) {
      if (!k.startsWith(`${p.slug}:`)) throw new Error(`Entitlement ${k} must be namespaced "${p.slug}:"`);
    }
  }
  const tid = await tenantId(sql, m.tenant);
  return sql.begin(async (tx) => {
    let [proj] = await tx<{ id: string }[]>`SELECT id FROM "Project" WHERE "tenantId" = ${tid} AND slug = ${p.slug}`;
    if (!proj) {
      [proj] = await tx<{ id: string }[]>`
        INSERT INTO "Project" (id, "tenantId", slug, name, status) VALUES (${randomUUID()}, ${tid}, ${p.slug}, ${p.name}, 'active')
        RETURNING id`;
    }
    const projectId = proj!.id;
    await tx`
      INSERT INTO aro_project_config ("projectId", "tenantId", slug, "allowedOrigins", "webhookUrl", "webhookSecretRef",
        "defaultMarket", "defaultCurrency")
      VALUES (${projectId}, ${tid}, ${p.slug}, ${p.allowed_origins}, ${p.webhook_url ?? null}, ${p.webhook_secret_ref ?? null},
        ${p.default_market}, ${p.default_currency})
      ON CONFLICT ("projectId") DO UPDATE SET "allowedOrigins" = EXCLUDED."allowedOrigins",
        "webhookUrl" = EXCLUDED."webhookUrl", "webhookSecretRef" = EXCLUDED."webhookSecretRef",
        "defaultMarket" = EXCLUDED."defaultMarket", "defaultCurrency" = EXCLUDED."defaultCurrency", "updatedAt" = now()`;

    for (const o of m.offers) {
      const productId = `aro-${p.slug}-${o.slug}`;
      // Prices are immutable once sold: a new amount/currency/market is a new price row.
      const priceId = `${productId}-${o.currency.toLowerCase()}-${o.amount_minor}-${o.market.toLowerCase().replace("*", "any")}`;
      await tx`
        INSERT INTO catalog_product (id, kind, status) VALUES (${productId}, 'digital_good', 'active')
        ON CONFLICT (id) DO UPDATE SET status = 'active'`;
      await tx`
        INSERT INTO catalog_price (id, "productId", currency, "pricingModel", "interval", "amountMinor", market, "taxBehavior", status)
        VALUES (${priceId}, ${productId}, ${o.currency}, 'flat', 'one_time', ${o.amount_minor}, ${o.market}, 'inclusive', 'active')
        ON CONFLICT (id) DO UPDATE SET status = 'active'`;
      const [prev] = await tx<{ priceId: string }[]>`
        SELECT "priceId" FROM aro_offer WHERE "projectId" = ${projectId} AND slug = ${o.slug}`;
      if (prev && prev.priceId !== priceId) {
        await tx`UPDATE catalog_price SET status = 'retired' WHERE id = ${prev.priceId}`;
      }
      await tx`
        INSERT INTO aro_offer (id, "tenantId", "projectId", slug, "priceId", title, "entitlementKeys", status)
        VALUES (${randomUUID()}, ${tid}, ${projectId}, ${o.slug}, ${priceId}, ${o.title}, ${o.entitlements}, ${o.status})
        ON CONFLICT ("projectId", slug) DO UPDATE SET "priceId" = EXCLUDED."priceId", title = EXCLUDED.title,
          "entitlementKeys" = EXCLUDED."entitlementKeys", status = EXCLUDED.status`;
    }
    return { projectId };
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
