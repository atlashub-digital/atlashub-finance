import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Sql } from "../db/client.js";
import { canonicalJson, sha256Hex } from "../lib/crypto.js";
import { tenantId } from "./manifests.js";

/**
 * Catalog-first sync (docs/developer/PROJECT_COMMERCE_BOOTSTRAP.md).
 *
 *   project repo aro.project.yaml   → desired catalog (products, offers, fulfillment)
 *   infra/projects/<slug>.config.json → ARO-side integration (tenant, origins, webhook)
 *   sync → AtlasHub catalog_product / catalog_price + aro_offer + revision record
 *
 * Checkout then accepts only registered offer codes; the DB snapshot is the
 * financial authority at transaction time, never the request.
 */

/** Live catalog_price.currency check (AtlasHub schema, 2026-10-15). */
const CATALOG_CURRENCIES = ["BRL", "EUR", "USD"];

export type ProjectCommerceManifest = {
  version: "1";
  project: { slug: string; name: string; default_market?: string; default_currency?: string };
  products: { code: string; name: string; type: string; metadata?: Record<string, unknown> }[];
  offers: {
    code: string;
    name: string;
    products: string[];
    market: string;
    currency: string;
    amount_minor: number;
    cadence: "once" | "month" | "year";
    payment_methods?: ("PIX" | "CARD")[];
    entitlements: string[];
    status?: "active" | "inactive" | "draft";
    metadata?: Record<string, unknown>;
  }[];
  fulfillment?: { entitlement: string; type: string; target?: string; metadata?: Record<string, unknown> }[];
};

export const ProjectConfig = z.object({
  tenant: z.string(),
  project: z.object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
    allowed_origins: z.array(z.url()).default([]),
    webhook_url: z.url().optional(),
    webhook_secret_ref: z
      .string()
      .regex(/^[a-z0-9/_-]+$/)
      .optional(),
  }),
});
export type ProjectConfig = z.infer<typeof ProjectConfig>;

function schemaPath() {
  return (
    process.env.ARO_MANIFEST_SCHEMA ??
    fileURLToPath(new URL("../../../../schemas/project-commerce-manifest.schema.json", import.meta.url))
  );
}

let validator: ReturnType<Ajv2020["compile"]> | undefined;

/** Validates against the canonical JSON Schema, then ARO semantic rules. Returns all problems. */
export function validateManifest(input: unknown): { ok: true; manifest: ProjectCommerceManifest } | { ok: false; errors: string[] } {
  validator ??= new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(readFileSync(schemaPath(), "utf8")));
  if (!validator(input)) {
    return { ok: false, errors: (validator.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`) };
  }
  const m = input as ProjectCommerceManifest;
  const errors: string[] = [];
  const productCodes = new Set<string>();
  for (const p of m.products) {
    if (productCodes.has(p.code)) errors.push(`duplicate product code ${p.code}`);
    productCodes.add(p.code);
  }
  const offerCodes = new Set<string>();
  const granted = new Set<string>();
  for (const o of m.offers) {
    if (offerCodes.has(o.code)) errors.push(`duplicate offer code ${o.code}`);
    offerCodes.add(o.code);
    for (const p of o.products) if (!productCodes.has(p)) errors.push(`offer ${o.code}: unknown product ${p}`);
    if (!CATALOG_CURRENCIES.includes(o.currency)) {
      errors.push(`offer ${o.code}: currency ${o.currency} not supported by the AtlasHub catalog (${CATALOG_CURRENCIES.join("/")})`);
    }
    for (const k of o.entitlements) {
      // Namespacing prevents one project from granting another project's rights.
      if (!k.startsWith(`${m.project.slug}:`)) errors.push(`offer ${o.code}: entitlement ${k} must start with "${m.project.slug}:"`);
      granted.add(k);
    }
  }
  for (const f of m.fulfillment ?? []) {
    if (!granted.has(f.entitlement)) errors.push(`fulfillment: entitlement ${f.entitlement} is not granted by any offer`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, manifest: m };
}

export function readManifestFile(text: string): unknown {
  return parseYaml(text);
}

const INTERVAL = { once: "one_time", month: "month", year: "year" } as const;
const OFFER_STATUS = { active: "active", inactive: "retired", draft: "draft" } as const;

/**
 * Idempotent sync of one project: registers the AtlasHub Project if missing,
 * upserts ARO integration config, products, prices and offers, replaces the
 * fulfillment mapping, and records the manifest as a catalog revision.
 * Offers absent from the manifest are retired (never deleted: orders reference them).
 */
export async function syncProject(sql: Sql, configInput: unknown, manifestInput: unknown, appliedBy: string) {
  const config = ProjectConfig.parse(configInput);
  const v = validateManifest(manifestInput);
  if (!v.ok) throw new Error(`Invalid aro.project.yaml:\n  - ${v.errors.join("\n  - ")}`);
  const m = v.manifest;
  const p = config.project;
  if (p.slug !== m.project.slug) throw new Error(`Config slug ${p.slug} does not match manifest slug ${m.project.slug}`);
  if (Boolean(p.webhook_url) !== Boolean(p.webhook_secret_ref)) {
    throw new Error("webhook_url and webhook_secret_ref must be set together");
  }
  const tid = await tenantId(sql, config.tenant);
  const manifestSha = sha256Hex(canonicalJson(m));

  return sql.begin(async (tx) => {
    let [proj] = await tx<{ id: string }[]>`SELECT id FROM "Project" WHERE "tenantId" = ${tid} AND slug = ${p.slug}`;
    if (!proj) {
      [proj] = await tx<{ id: string }[]>`
        INSERT INTO "Project" (id, "tenantId", slug, name, status)
        VALUES (${randomUUID()}, ${tid}, ${p.slug}, ${m.project.name}, 'active') RETURNING id`;
    }
    const projectId = proj!.id;
    await tx`
      INSERT INTO aro_project_config ("projectId", "tenantId", slug, "allowedOrigins", "webhookUrl", "webhookSecretRef",
        "defaultMarket", "defaultCurrency")
      VALUES (${projectId}, ${tid}, ${p.slug}, ${p.allowed_origins}, ${p.webhook_url ?? null}, ${p.webhook_secret_ref ?? null},
        ${m.project.default_market ?? "BR"}, ${m.project.default_currency ?? "BRL"})
      ON CONFLICT ("projectId") DO UPDATE SET "allowedOrigins" = EXCLUDED."allowedOrigins",
        "webhookUrl" = EXCLUDED."webhookUrl", "webhookSecretRef" = EXCLUDED."webhookSecretRef",
        "defaultMarket" = EXCLUDED."defaultMarket", "defaultCurrency" = EXCLUDED."defaultCurrency", "updatedAt" = now()`;

    const [latest] = await tx<{ id: string; manifestSha256: string }[]>`
      SELECT id, "manifestSha256" FROM aro_catalog_revision WHERE "projectId" = ${projectId}
      ORDER BY "appliedAt" DESC LIMIT 1`;
    if (latest?.manifestSha256 === manifestSha) return { projectId, revisionId: latest.id, changed: false };

    const revisionId = randomUUID();
    await tx`
      INSERT INTO aro_catalog_revision (id, "tenantId", "projectId", "manifestSha256", manifest, "appliedBy")
      VALUES (${revisionId}, ${tid}, ${projectId}, ${manifestSha}, ${tx.json(m as never)}, ${appliedBy})`;

    const productId = (code: string) => `aro-${p.slug}-${code}`;
    for (const prod of m.products) {
      const recurring = m.offers.some((o) => o.products.includes(prod.code) && o.cadence !== "once");
      await tx`
        INSERT INTO catalog_product (id, kind, status) VALUES (${productId(prod.code)}, ${recurring ? "subscription" : "digital_good"}, 'active')
        ON CONFLICT (id) DO UPDATE SET status = 'active'`;
    }

    for (const o of m.offers) {
      // Prices are immutable once sold: any change of amount/currency/market/cadence is a new price row.
      const primary = productId(o.products[0]!);
      const priceId = `${primary}-${o.code}-${o.currency.toLowerCase()}-${o.amount_minor}-${o.market.toLowerCase().replace("*", "any")}-${o.cadence}`;
      await tx`
        INSERT INTO catalog_price (id, "productId", currency, "pricingModel", "interval", "amountMinor", market, "taxBehavior", status)
        VALUES (${priceId}, ${primary}, ${o.currency}, 'flat', ${INTERVAL[o.cadence]}, ${o.amount_minor}, ${o.market}, 'inclusive', 'active')
        ON CONFLICT (id) DO UPDATE SET status = 'active'`;
      const [prev] = await tx<{ priceId: string }[]>`SELECT "priceId" FROM aro_offer WHERE "projectId" = ${projectId} AND slug = ${o.code}`;
      if (prev && prev.priceId !== priceId) await tx`UPDATE catalog_price SET status = 'retired' WHERE id = ${prev.priceId}`;
      await tx`
        INSERT INTO aro_offer (id, "tenantId", "projectId", slug, "priceId", title, "entitlementKeys", "productIds", cadence,
          "paymentMethods", metadata, "catalogRevisionId", status)
        VALUES (${randomUUID()}, ${tid}, ${projectId}, ${o.code}, ${priceId}, ${o.name}, ${o.entitlements},
          ${o.products.map(productId)}, ${o.cadence}, ${o.payment_methods ?? []}, ${tx.json((o.metadata ?? {}) as never)},
          ${revisionId}, ${OFFER_STATUS[o.status ?? "active"]})
        ON CONFLICT ("projectId", slug) DO UPDATE SET "priceId" = EXCLUDED."priceId", title = EXCLUDED.title,
          "entitlementKeys" = EXCLUDED."entitlementKeys", "productIds" = EXCLUDED."productIds", cadence = EXCLUDED.cadence,
          "paymentMethods" = EXCLUDED."paymentMethods", metadata = EXCLUDED.metadata,
          "catalogRevisionId" = EXCLUDED."catalogRevisionId", status = EXCLUDED.status`;
    }
    await tx`
      UPDATE aro_offer SET status = 'retired', "catalogRevisionId" = ${revisionId}
      WHERE "projectId" = ${projectId} AND status <> 'retired' AND NOT (slug = ANY(${m.offers.map((o) => o.code)}))`;

    await tx`DELETE FROM aro_fulfillment_rule WHERE "projectId" = ${projectId}`;
    for (const f of m.fulfillment ?? []) {
      await tx`
        INSERT INTO aro_fulfillment_rule (id, "projectId", "entitlementKey", type, target, metadata, "catalogRevisionId")
        VALUES (${randomUUID()}, ${projectId}, ${f.entitlement}, ${f.type}, ${f.target ?? null},
          ${tx.json((f.metadata ?? {}) as never)}, ${revisionId})`;
    }
    await tx`
      INSERT INTO "AuditEvent" (id, "tenantId", "actorId", action, "objectId")
      VALUES (${randomUUID()}, ${tid}, ${appliedBy}, 'aro.catalog.synced', ${revisionId})`;
    return { projectId, revisionId, changed: true };
  });
}
