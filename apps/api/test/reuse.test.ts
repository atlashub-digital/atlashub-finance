import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readManifestFile, syncProject, validateManifest } from "../src/admin/catalog.js";
import { ProviderManifest, issueApiKey } from "../src/admin/manifests.js";
import { TEST_DATABASE_URL } from "./helpers/db.js";
import { ESPELHOMEU_CONFIG, ESPELHOMEU_MANIFEST, type Harness, VALID_CPF, makeHarness } from "./helpers/harness.js";

const repo = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const yaml = async (p: string) => readManifestFile(await readFile(repo(p), "utf8"));
const json = async (p: string) => JSON.parse(await readFile(repo(p), "utf8"));

describe("catalog-first manifests (schemas/project-commerce-manifest.schema.json)", () => {
  it("committed manifests and the canonical example validate; providers stay out of project catalogs", async () => {
    ProviderManifest.parse(await json("infra/projects/atlashub.providers.json"));
    for (const f of ["infra/projects/espelhomeu/aro.project.yaml", "infra/projects/atlas-club/aro.project.yaml", "examples/manifests/training-platform.yaml"]) {
      const m = await yaml(f);
      expect(validateManifest(m)).toMatchObject({ ok: true });
      expect(JSON.stringify(m)).not.toMatch(/pixgo|misticpay|stripe/i);
    }
  });

  it("LeveLab manifest is blocked until its price is decided", async () => {
    const v = validateManifest(await yaml("infra/projects/levelab/aro.project.yaml"));
    expect(v.ok).toBe(false);
  });

  it("semantic rules: unknown product, foreign entitlement namespace, unsupported currency, orphan fulfillment", () => {
    const bad = structuredClone(ESPELHOMEU_MANIFEST) as typeof ESPELHOMEU_MANIFEST;
    bad.offers[0]!.products = ["nope"];
    bad.offers[1]!.entitlements = ["levelab:reset21"];
    bad.offers[2]!.currency = "GBP";
    bad.fulfillment = [{ entitlement: "espelhomeu:ghost", type: "telegram" }];
    const v = validateManifest(bad);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join("\n")).toMatch(/unknown product[\s\S]*levelab:reset21[\s\S]*GBP[\s\S]*ghost/);
    expect(validateManifest({ ...ESPELHOMEU_MANIFEST, extra: 1 }).ok).toBe(false);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("catalog sync + E8 reuse through the same API", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness();
    await syncProject(h.sql, await json("infra/projects/atlas-club/aro.config.json"), await yaml("infra/projects/atlas-club/aro.project.yaml"), "test");
    // LeveLab with a test-only price: the committed manifest waits for PDG.
    const levelab = (await yaml("infra/projects/levelab/aro.project.yaml")) as { offers: { amount_minor: unknown }[] };
    levelab.offers[0]!.amount_minor = 2100;
    await syncProject(h.sql, await json("infra/projects/levelab/aro.config.json"), levelab, "test");
  });
  afterAll(async () => h?.close());

  it("re-syncing an identical manifest is a no-op; a price change creates a new price and revision", async () => {
    expect((await syncProject(h.sql, ESPELHOMEU_CONFIG, ESPELHOMEU_MANIFEST, "test")).changed).toBe(false);
    const changed = structuredClone(ESPELHOMEU_MANIFEST);
    changed.offers[1]!.amount_minor = 5490;
    const r = await syncProject(h.sql, ESPELHOMEU_CONFIG, changed, "test");
    expect(r.changed).toBe(true);
    const [offer] = await h.sql`
      SELECT o."catalogRevisionId", p."amountMinor", p.status FROM aro_offer o JOIN catalog_price p ON p.id = o."priceId"
      WHERE o.slug = 'colecao-br'`;
    expect(offer).toEqual({ catalogRevisionId: r.revisionId, amountMinor: 5490, status: "active" });
    const prices = await h.sql`SELECT status FROM catalog_price WHERE id LIKE 'aro-espelhomeu-p01-colecao-br-%' ORDER BY "amountMinor"`;
    expect(prices.map((p) => p.status)).toEqual(["retired", "active"]);
    expect((await h.sql`SELECT 1 FROM aro_catalog_revision WHERE "projectId" = ${r.projectId}`).length).toBe(2);
    await syncProject(h.sql, ESPELHOMEU_CONFIG, ESPELHOMEU_MANIFEST, "test"); // restore
  });

  it("checkout enforces offer payment methods and rejects recurring offers in V1", async () => {
    const post = (offer: string, payment_method: string, currency = "BRL", market = "BR") =>
      h.app.inject({
        method: "POST",
        url: "/v1/checkout-sessions",
        headers: { "x-aro-public-key": h.publicKey, "idempotency-key": `${offer}-${payment_method}-0000000001` },
        payload: { project: "espelhomeu", offer, market, currency, payment_method, payer: { name: "Pessoa", email: "p@example.com", document: VALID_CPF } },
      });
    expect((await post("p01-br", "CARD")).json()).toMatchObject({ error: "INVALID_OFFER" });
    expect((await post("clube-mensal", "PIX")).json()).toMatchObject({ error: "INVALID_OFFER" });
  });

  it.each([
    ["atlas-club", "genesis-01-standard", 49000, "atlas-club:genesis-01"],
    ["levelab", "levelab-reset21-br", 2100, "levelab:reset21"],
  ])("%s: checkout → PIX → approval → entitlement, no provider code", async (project, offer, amount, entitlement) => {
    const pk = await issueApiKey(h.sql, project, "public");
    const sk = await issueApiKey(h.sql, project, "server");
    const email = `${project}@example.com`;
    const res = await h.app.inject({
      method: "POST",
      url: "/v1/checkout-sessions",
      headers: { "x-aro-public-key": pk, "idempotency-key": `${project}-reuse-proof-0001` },
      payload: { project, offer, market: "BR", currency: "BRL", payment_method: "PIX", payer: { name: "Pessoa", email, document: VALID_CPF } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ project, offer, state: "PENDING", amount: { amount_minor: amount, currency: "BRL" }, payment: { kind: "PIX" } });

    const [a] = await h.sql<{ providerPaymentId: string }[]>`
      SELECT "providerPaymentId" FROM aro_payment_attempt WHERE "checkoutSessionId" = ${res.json().id}`;
    const w = h.pixgo.webhook("whsec_pixgo_test", a!.providerPaymentId, "payment.completed");
    await h.app.inject({ method: "POST", url: "/v1/webhooks/providers/pixgo", headers: w.headers, payload: w.body });

    const ents = await h.app.inject({
      method: "POST",
      url: "/v1/entitlements/resolve",
      headers: { authorization: `Bearer ${sk}` },
      payload: { project, identity: { email } },
    });
    expect(ents.json().entitlements.map((e: { key: string }) => e.key)).toEqual([entitlement]);

    // Project isolation: EspelhoMeu's server key cannot read this project's data.
    const cross = await h.app.inject({
      method: "POST",
      url: "/v1/entitlements/resolve",
      headers: { authorization: `Bearer ${h.serverKey}` },
      payload: { project, identity: { email } },
    });
    expect(cross.statusCode).toBe(403);
    const order = await h.app.inject({ method: "GET", url: `/v1/orders/${res.json().order_id}`, headers: { authorization: `Bearer ${h.serverKey}` } });
    expect(order.statusCode).toBe(404);
  });
});
