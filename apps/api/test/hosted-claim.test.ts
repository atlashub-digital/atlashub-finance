import { remoteAroClaim } from "./fixtures/espelhomeu-claim.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { signClaimProof, readClaimProof } from "../src/hosted/claim-token.js";
import { applyProviderSnapshot } from "../src/modules/payments/transitions.js";
import { issueApiKey } from "../src/admin/manifests.js";
import { TEST_DATABASE_URL } from "./helpers/db.js";
import { makeHarness, createCheckout, VALID_CPF, type Harness } from "./helpers/harness.js";

const key = "claim-test-key-012345678901234567890";
const binding = { project: "espelhomeu", tenantId: "tenant-a", orderId: randomUUID(), checkoutSessionId: randomUUID(), offerId: randomUUID(), aroCustomerId: "customer" };
describe("short hosted possession proofs", () => {
  it("authenticates all bindings, expires in 120s and rejects forged/future proofs", () => {
    const p = signClaimProof(binding, key, 1000);
    expect(readClaimProof(p.proof, key, 1000)).toEqual({ ...binding, issuedAt: 1000, expiresAt: 121000 });
    expect(readClaimProof(p.proof, key, 121000)).toBeNull();
    expect(readClaimProof(p.proof, key, 999)).toBeNull();
    expect(readClaimProof(p.proof, key + "wrong", 1000)).toBeNull();
    expect(readClaimProof(p.proof.replace('hc1.', 'hc2.'), key, 1000)).toBeNull();
    expect(readClaimProof("hc1.invalid.invalid", key)).toBeNull();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("hosted claim HTTP with real PostgreSQL runtime role", () => {
  let h: Harness;
  beforeAll(async () => { h = await makeHarness(); });
  afterAll(async () => { await h?.close(); });
  const tls = { "x-forwarded-proto": "https" };
  let buyerIp = 1;
  async function session(approve = true) {
    const link = await h.app.inject({ method: "POST", url: "/v1/checkout-links", headers: { authorization: "Bearer " + h.serverKey }, payload: { offer: "p01-br" } });
    expect(link.statusCode).toBe(201);
    const r = await h.app.inject({ method: "POST", url: new URL(link.json().url).pathname + "/checkout", headers: { "idempotency-key": randomUUID(), "x-forwarded-for": `192.0.2.${buyerIp++}` }, payload: { name: "Test Buyer", email: randomUUID() + "@example.com", document: VALID_CPF, accept_terms: true } });
    expect(r.statusCode).toBe(201);
    const v = r.json();
    const [attempt] = await h.sql<{ id: string }[]>`SELECT id FROM aro_payment_attempt WHERE "checkoutSessionId" = ${v.id}`;
    const change = (state: "APPROVED" | "REFUNDED" | "CHARGEBACK") => applyProviderSnapshot(h.ctx.sql, attempt!.id, { state, providerStatus: state }, "test");
    if (approve) await change("APPROVED");
    const [s] = await h.sql<{ offerId: string; contactId: string }[]>`SELECT "offerId", "contactId" FROM aro_checkout_session WHERE id = ${v.id}`;
    return { v, s: s!, change };
  }
  async function proof(v: { id: string; checkout_secret: string }) {
    return h.app.inject({ method: "POST", url: `/v1/checkout-sessions/${v.id}/claim-proof`, headers: { ...tls, "x-aro-checkout-secret": v.checkout_secret }, payload: {} });
  }
  function exchange(v: { id: string; order_id: string }, offerId: string, p: string, over = {}, auth?: string) {
    return h.app.inject({ method: "POST", url: "/v1/checkout-claims", headers: { ...tls, authorization: "Bearer " + (auth ?? h.serverKey) }, payload: { project: "espelhomeu", orderId: v.order_id, checkoutSessionId: v.id, proof: p, offerId, principalId: "principal-1", ...over } });
  }
  it("returns consumer-compatible binding once under concurrent exchange, audits atomically and blocks refreshed proof", async () => {
    const { v, s } = await session();
    const p = await proof(v);
    const refreshed = await proof(v);
    expect(p.statusCode).toBe(200);
    expect(p.headers["cache-control"]).toBe("no-store");
    const results = await Promise.all([exchange(v, s.offerId, p.json().proof), exchange(v, s.offerId, p.json().proof, { principalId: "principal-2" })]);
    expect(results.map(r => r.statusCode).sort()).toEqual([200, 409]);
    const b = results.find(r => r.statusCode === 200)!.json();
    expect(b).toEqual({ project: "espelhomeu", orderId: v.order_id, checkoutSessionId: v.id, offerId: s.offerId, aroCustomerId: s.contactId, principalId: b.principalId, orderStatus: "APPROVED", entitlementStatus: "ACTIVE", issuedAt: expect.any(Number), expiresAt: expect.any(Number) });
    expect(Number.isSafeInteger(b.issuedAt) && Number.isSafeInteger(b.expiresAt)).toBe(true);
    expect(b.expiresAt - b.issuedAt).toBeGreaterThan(0);
    expect(b.expiresAt - b.issuedAt).toBeLessThanOrEqual(120000);
    expect((await exchange(v, s.offerId, refreshed.json().proof)).statusCode).toBe(409);
    expect((await proof(v)).statusCode).toBe(409);
    const records = await h.sql`SELECT * FROM aro_checkout_claim WHERE "checkoutSessionId" = ${v.id}`;
    const audits = await h.sql`SELECT * FROM "AuditEvent" WHERE "objectId" = ${v.id} AND action = 'aro.claim.consumed'`;
    expect(records).toHaveLength(1); expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toContain(v.checkout_secret);
    const order = await h.app.inject({ method: "GET", url: "/v1/orders/" + b.orderId, headers: { authorization: "Bearer " + h.serverKey } });
    expect(order.json()).toMatchObject({ status: "APPROVED", customer_id: b.aroCustomerId });
    const ent = await h.app.inject({ method: "POST", url: "/v1/entitlements/resolve", headers: { authorization: "Bearer " + h.serverKey }, payload: { project: "espelhomeu", customer_id: b.aroCustomerId } });
    expect(ent.json().entitlements).toContainEqual(expect.objectContaining({ source_order_id: b.orderId, status: "ACTIVE" }));
  });
  it("runs the unchanged EspelhoMeu PR #33 adapter through claim, resolve, replay and refund", async () => {
    const { v, s, change } = await session();
    const p = (await proof(v)).json().proof;
    vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
      const r = await h.app.inject({ method: init.method as "GET" | "POST", url: new URL(url).pathname,
        headers: { ...tls, ...init.headers as Record<string, string> }, ...(init.body ? { payload: String(init.body) } : {}) });
      return new Response(r.body, { status: r.statusCode, headers: { "content-type": "application/json" } });
    });
    try {
      const adapter = remoteAroClaim("https://aro.test/v1/checkout-claims", h.serverKey);
      const input = { project: "espelhomeu" as const, orderId: v.order_id, checkoutSessionId: v.id, offerId: s.offerId, proof: p };
      const b = await adapter.claim(input, "authenticated-principal");
      expect(b).not.toBeNull();
      expect(await adapter.resolve!(b!)).toContain("p01");
      expect(await adapter.claim(input, "authenticated-principal")).toBeNull();
      await change("REFUNDED");
      expect(await adapter.resolve!(b!)).toEqual([]);
    } finally { vi.unstubAllGlobals(); }
  });
  it("fails closed for pending, wrong possession, other session/order/offer/project, forged and expired proof", async () => {
    const pending = await session(false);
    expect((await proof(pending.v)).statusCode).toBe(409);
    const { v, s } = await session();
    expect((await proof({ ...v, checkout_secret: pending.v.checkout_secret })).statusCode).toBe(403);
    const p = (await proof(v)).json().proof;
    for (const over of [{ project: "other" }, { orderId: randomUUID() }, { offerId: randomUUID() }]) expect((await exchange(v, s.offerId, p, over)).statusCode).toBe(403);
    expect((await exchange(pending.v, pending.s.offerId, p)).statusCode).toBe(409);
    expect((await exchange(v, s.offerId, p + "x")).statusCode).toBe(403);
    const expired = signClaimProof({ ...binding, tenantId: "tenant-atlashub", checkoutSessionId: v.id, orderId: v.order_id, offerId: s.offerId, aroCustomerId: s.contactId }, h.serverKey, Date.now() - 120001);
    expect((await exchange(v, s.offerId, expired.proof)).statusCode).toBe(403);
    expect((await exchange(v, s.offerId, p, {}, "wrong")).statusCode).toBe(401);
    const otherKey = await issueApiKey(h.sql, "espelhomeu", "server");
    expect((await exchange(v, s.offerId, p, {}, otherKey)).statusCode).toBe(401);
    expect((await exchange(v, s.offerId, p)).statusCode).toBe(200);
  });
  it("rolls consumption back if its audit insert fails", async () => {
    const { v, s } = await session();
    const p = (await proof(v)).json().proof;
    await h.sql.unsafe(`CREATE FUNCTION reject_claim_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action = 'aro.claim.consumed' THEN RAISE EXCEPTION 'test audit unavailable'; END IF;
      RETURN NEW; END $$;
      CREATE TRIGGER reject_claim_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_claim_audit()`);
    try {
      expect((await exchange(v, s.offerId, p)).statusCode).toBe(500);
      expect(await h.sql`SELECT 1 FROM aro_checkout_claim WHERE "checkoutSessionId" = ${v.id}`).toHaveLength(0);
    } finally {
      await h.sql.unsafe('DROP TRIGGER reject_claim_audit ON "AuditEvent"; DROP FUNCTION reject_claim_audit()');
    }
    expect((await exchange(v, s.offerId, p)).statusCode).toBe(200);
  });
  it.each(["FAILED", "CANCELED", "EXPIRED"])("rejects session %s even with an approved order", async state => {
    const { v, s } = await session();
    const p = (await proof(v)).json().proof;
    await h.sql`UPDATE aro_checkout_session SET state = ${state} WHERE id = ${v.id}`;
    expect((await exchange(v, s.offerId, p)).statusCode).toBe(409);
  });
  it.each(["REFUNDED", "CHARGEBACK"] as const)("rechecks %s between proof issuance and exchange", async state => {
    const { v, s, change } = await session();
    const p = (await proof(v)).json().proof;
    await change(state);
    expect((await exchange(v, s.offerId, p)).statusCode).toBe(409);
    expect((await proof(v)).statusCode).toBe(409);
  });
  it("rejects revoked, expired, future or wrong-source entitlements without consuming", async () => {
    const { v, s } = await session();
    const p = (await proof(v)).json().proof;
    for (const update of ["status = 'revoked'", '"validUntil" = (now() AT TIME ZONE \'UTC\') - interval \'1 second\'', '"validFrom" = (now() AT TIME ZONE \'UTC\') + interval \'1 day\'', '"sourceId" = \'other-order\'']) {
      await h.sql.unsafe(`UPDATE commerce_entitlement SET ${update} WHERE "contactId" = $1`, [s.contactId]);
      expect((await exchange(v, s.offerId, p)).statusCode).toBe(409);
      await h.sql`UPDATE commerce_entitlement SET status = 'active', "validUntil" = NULL, "validFrom" = (now() AT TIME ZONE 'UTC'), "sourceId" = ${v.order_id} WHERE "contactId" = ${s.contactId}`;
    }
  });
  it("does not trust caller-supplied hosted metadata on public checkout", async () => {
    const r = await createCheckout(h, undefined, randomUUID());
    expect(r.statusCode).toBe(201);
    const v = r.json();
    const [a] = await h.sql<{ id: string }[]>`SELECT id FROM aro_payment_attempt WHERE "checkoutSessionId" = ${v.id}`;
    await applyProviderSnapshot(h.ctx.sql, a!.id, { state: "APPROVED", providerStatus: "APPROVED" }, "test");
    await h.sql`UPDATE aro_checkout_session SET metadata = '{"source":"aro_checkout_link"}'::jsonb WHERE id = ${v.id}`;
    expect((await proof(v)).statusCode).toBe(403);
  });
  it("rejects cross-tenant corruption and cleartext transport", async () => {
    const { v, s } = await session();
    const p = (await proof(v)).json().proof;
    await h.sql`INSERT INTO "Tenant" (id,slug,name) VALUES ('claim-other','claim-other','Other')`;
    await h.sql`UPDATE aro_offer SET "tenantId" = 'claim-other' WHERE id = ${s.offerId}`;
    expect((await exchange(v, s.offerId, p)).statusCode).toBe(403);
    await h.sql`UPDATE aro_offer SET "tenantId" = 'tenant-atlashub' WHERE id = ${s.offerId}`;
    // Existing checkout schema allows a mismatched contact; issuer must reject it.
    await h.sql`UPDATE aro_checkout_session SET "contactId" = NULL WHERE id = ${v.id}`;
    expect((await exchange(v, s.offerId, p)).statusCode).toBe(403);
    const r = await h.app.inject({ method: "POST", url: "/v1/checkout-claims", payload: {} });
    expect(r.statusCode).toBe(403);
  });
});
