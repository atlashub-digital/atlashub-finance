import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProjectManifest, ProviderManifest, applyProjectManifest, issueApiKey } from "../src/admin/manifests.js";
import { TEST_DATABASE_URL } from "./helpers/db.js";
import { type Harness, VALID_CPF, makeHarness } from "./helpers/harness.js";

const manifest = async (name: string) =>
  JSON.parse(await readFile(fileURLToPath(new URL(`../../../infra/projects/${name}`, import.meta.url)), "utf8"));

describe("committed manifests", () => {
  it("parse against the manifest schema and carry no provider settings per project", async () => {
    ProviderManifest.parse(await manifest("atlashub.providers.json"));
    for (const f of ["espelhomeu.json", "atlas-club.json"]) {
      const m = await manifest(f);
      ProjectManifest.parse(m);
      expect(JSON.stringify(m.project) + JSON.stringify(m.offers)).not.toMatch(/pixgo|misticpay|stripe/i);
    }
  });

  it("LeveLab manifest is blocked until its price is decided", async () => {
    expect(ProjectManifest.safeParse(await manifest("levelab.json")).success).toBe(false);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("E8 reuse: other projects use the same API without provider code", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness();
    await applyProjectManifest(h.sql, await manifest("atlas-club.json"));
    // LeveLab with a test-only price: the real manifest waits for PDG.
    const levelab = await manifest("levelab.json");
    levelab.offers[0].amount_minor = 2100;
    await applyProjectManifest(h.sql, levelab);
  });
  afterAll(async () => h?.close());

  it.each([
    ["atlas-club", "genesis-01-standard", 49000, "atlas-club:genesis-01"],
    ["levelab", "levelab-reset21-br", 2100, "levelab:reset21"],
  ])("%s: checkout → PIX → approval → entitlement", async (project, offer, amount, entitlement) => {
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
