import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deliverDueWebhooks } from "../src/modules/events/delivery.js";
import { reconcilePendingAttempts } from "../src/modules/payments/reconciler.js";
import { TEST_DATABASE_URL } from "./helpers/db.js";
import { signJwt } from "./helpers/jwt.js";
import { type Harness, SECRETS, VALID_CNPJ, checkoutBody, createCheckout, makeHarness } from "./helpers/harness.js";

const PIXGO_SECRET = "whsec_pixgo_test";
const PROJECT_SECRET = "project_webhook_secret_espelhomeu";
const count = async (q: PromiseLike<{ n: number }[]>) => (await q)[0]!.n;

describe.skipIf(!TEST_DATABASE_URL)("ARO checkout → payment → order → entitlement", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness();
  });
  afterAll(async () => h?.close());
  beforeEach(() => {
    h.pixgo.createMode = "ok";
    h.pixgo.lookupDown = false;
    h.mistic.createMode = "ok";
    h.receiver.received = [];
    h.receiver.status = 200;
  });

  const getSession = (id: string, secret: string) =>
    h.app.inject({ method: "GET", url: `/v1/checkout-sessions/${id}`, headers: { "x-aro-checkout-secret": secret } });
  const pixgoWebhook = (paymentId: string, event: Parameters<Harness["pixgo"]["webhook"]>[2], opts?: { amount?: number }) => {
    const w = h.pixgo.webhook(PIXGO_SECRET, paymentId, event, opts);
    return h.app.inject({ method: "POST", url: "/v1/webhooks/providers/pixgo", headers: w.headers, payload: w.body });
  };
  const resolve = (email: string) =>
    h.app.inject({
      method: "POST",
      url: "/v1/entitlements/resolve",
      headers: { authorization: `Bearer ${h.serverKey}` },
      payload: { project: "espelhomeu", identity: { email } },
    });
  const pixgoIdOf = async (sessionId: string) => {
    const [a] = await h.sql<{ providerPaymentId: string }[]>`
      SELECT "providerPaymentId" FROM aro_payment_attempt WHERE "checkoutSessionId" = ${sessionId} AND provider = 'pixgo'`;
    return a!.providerPaymentId;
  };

  it("EspelhoMeu P01: PIX via PixGo → APPROVED → entitlement ACTIVE → signed project webhooks", async () => {
    const email = `p01-${randomUUID()}@example.com`;
    const res = await createCheckout(h, checkoutBody({ payer: { name: "Cliente", email, document: "52998224725" } }));
    expect(res.statusCode).toBe(201);
    const s = res.json();
    expect(s).toMatchObject({
      project: "espelhomeu",
      offer: "p01-br",
      state: "PENDING",
      amount: { amount_minor: 1190, currency: "BRL" },
      payment: { kind: "PIX", copy_paste: expect.stringMatching(/^000201/), qr_payload: expect.any(String), expires_at: expect.any(String) },
    });
    expect(s.checkout_secret).toMatch(/^aro_cs_/);
    // Provider details never leak into the project contract.
    const { payment: _instruction, ...rest } = s;
    expect(JSON.stringify(rest)).not.toMatch(/pixgo|misticpay|stripe|dep_/i);
    // PixGo got decimal BRL and the CPF; webhook URL derived from ARO base URL.
    expect(h.pixgo.calls).toContain("POST /payment/create");

    // Browser return state cannot unlock anything: still PENDING, no entitlement.
    expect((await getSession(s.id, s.checkout_secret)).json().state).toBe("PENDING");
    expect((await resolve(email)).json().entitlements).toEqual([]);

    const wh = await pixgoWebhook(await pixgoIdOf(s.id), "payment.completed");
    expect(wh.statusCode).toBe(200);
    expect(wh.json()).toMatchObject({ status: "processed" });

    expect((await getSession(s.id, s.checkout_secret)).json().state).toBe("APPROVED");
    const order = await h.app.inject({ method: "GET", url: `/v1/orders/${s.order_id}`, headers: { authorization: `Bearer ${h.serverKey}` } });
    expect(order.json()).toMatchObject({
      id: s.order_id,
      project: "espelhomeu",
      status: "APPROVED",
      amount: { amount_minor: 1190, currency: "BRL" },
      items: [{ offer: "p01-br", quantity: 1, unit_amount: { amount_minor: 1190, currency: "BRL" } }],
      approved_at: expect.any(String),
    });
    const ents = (await resolve(email.toUpperCase())).json();
    expect(ents.entitlements).toEqual([
      expect.objectContaining({ key: "espelhomeu:p01", status: "ACTIVE", source_order_id: s.order_id }),
    ]);
    // Resolve by canonical customer id gives the same answer.
    const byId = await h.app.inject({
      method: "POST",
      url: "/v1/entitlements/resolve",
      headers: { authorization: `Bearer ${h.serverKey}` },
      payload: { project: "espelhomeu", customer_id: ents.customer_id },
    });
    expect(byId.json().entitlements).toHaveLength(1);

    // Fee/net captured from PixGo amounts, in minor units.
    const [att] = await h.sql`SELECT "feeMinor", "netMinor", state FROM aro_payment_attempt WHERE "checkoutSessionId" = ${s.id}`;
    expect(att).toMatchObject({ feeMinor: 50, netMinor: 1140, state: "APPROVED" });

    // Outbox → signed project webhooks.
    await deliverDueWebhooks(h.ctx, 100);
    const mine = h.receiver.received.filter((r) => JSON.parse(r.body).data.order_id === s.order_id);
    expect(mine.map((r) => JSON.parse(r.body).type).sort()).toEqual(
      ["checkout.started", "entitlement.granted", "order.approved", "payment.approved", "payment.pending"].sort(),
    );
    for (const r of mine) {
      expect(r.url).toBe("https://espelho.lia.doctor/api/aro/webhook");
      const expected = createHmac("sha256", PROJECT_SECRET).update(`${r.headers["x-aro-timestamp"]}.${r.body}`).digest("hex");
      expect(r.headers["x-aro-signature"]).toBe(`v1=${expected}`);
      expect(r.headers["x-aro-event-id"]).toBe(JSON.parse(r.body).id);
    }
    const granted = mine.map((r) => JSON.parse(r.body)).find((e) => e.type === "entitlement.granted");
    expect(granted.data.entitlements).toEqual(["espelhomeu:p01"]);

    // Duplicate provider webhook is harmless.
    const dup = await pixgoWebhook(await pixgoIdOf(s.id), "payment.completed");
    expect(dup.json()).toMatchObject({ status: "duplicate" });
    const events = await count(h.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM aro_outbound_event WHERE body::jsonb -> 'data' ->> 'order_id' = ${s.order_id}`);
    expect(events).toBe(5);
    const grants = await count(h.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM commerce_entitlement WHERE "sourceId" = ${s.order_id}`);
    expect(grants).toBe(1);

    // Refund → order REFUNDED → entitlement revoked → Reader access removed.
    const refund = await pixgoWebhook(await pixgoIdOf(s.id), "payment.refunded");
    expect(refund.json()).toMatchObject({ status: "processed" });
    expect((await getSession(s.id, s.checkout_secret)).json().state).toBe("REFUNDED");
    const order2 = await h.app.inject({ method: "GET", url: `/v1/orders/${s.order_id}`, headers: { authorization: `Bearer ${h.serverKey}` } });
    expect(order2.json().status).toBe("REFUNDED");
    expect((await resolve(email)).json().entitlements).toEqual([]);
    h.receiver.received = [];
    await deliverDueWebhooks(h.ctx, 100);
    expect(h.receiver.events().map((e) => e.type).sort()).toEqual(["entitlement.revoked", "payment.refunded"]);

    // Audit trail written to the shared AuditEvent table.
    const audits = await h.sql<{ action: string }[]>`SELECT action FROM "AuditEvent" WHERE "objectId" IN (${s.id}, ${s.order_id})`;
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["aro.checkout.created", "aro.order.approved", "aro.entitlement.revoked"]));
  });

  it("Collection grants P01–P05 in one order", async () => {
    const email = `col-${randomUUID()}@example.com`;
    const s = (await createCheckout(h, checkoutBody({ offer: "colecao-br", payer: { name: "Ccx", email, document: "52998224725" } }))).json();
    await pixgoWebhook(await pixgoIdOf(s.id), "payment.completed");
    const keys = (await resolve(email)).json().entitlements.map((e: { key: string }) => e.key);
    expect(keys).toEqual(["espelhomeu:p01", "espelhomeu:p02", "espelhomeu:p03", "espelhomeu:p04", "espelhomeu:p05"]);
  });

  it("order bumps add items and entitlements to the same order", async () => {
    const email = `bump-${randomUUID()}@example.com`;
    const res = await createCheckout(h, checkoutBody({ bump_offers: ["guia-bump"], payer: { name: "Bbx", email, document: "52998224725" } }));
    expect(res.json().amount).toEqual({ amount_minor: 2090, currency: "BRL" });
    await pixgoWebhook(await pixgoIdOf(res.json().id), "payment.completed");
    expect((await resolve(email)).json().entitlements.map((e: { key: string }) => e.key)).toEqual(["espelhomeu:guia", "espelhomeu:p01"]);
  });

  it("idempotent create: same key+body replays, different body conflicts", async () => {
    const key = randomUUID();
    const a = await createCheckout(h, checkoutBody(), key);
    const b = await createCheckout(h, checkoutBody(), key);
    expect(b.statusCode).toBe(201);
    expect(b.headers["idempotent-replayed"]).toBe("true");
    expect(b.json()).toEqual(a.json());
    const c = await createCheckout(h, checkoutBody({ offer: "colecao-br" }), key);
    expect(c.statusCode).toBe(409);
    expect(c.json().error).toBe("IDEMPOTENCY_CONFLICT");
    const n = await count(h.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM aro_checkout_session WHERE "idempotencyKey" = ${key}`);
    expect(n).toBe(1);
  });

  it("fails over PixGo → MisticPay on a definitive rejection; MisticPay is verified by fetch", async () => {
    h.pixgo.createMode = "reject";
    const email = `fo-${randomUUID()}@example.com`;
    const res = await createCheckout(h, checkoutBody({ payer: { name: "Ffx", email, document: "52998224725" } }));
    expect(res.statusCode).toBe(201);
    const s = res.json();
    expect(s.payment.copy_paste).toMatch(/MISTIC/);
    const attempts = await h.sql`SELECT provider, state, "attemptNumber", "errorCode" FROM aro_payment_attempt WHERE "checkoutSessionId" = ${s.id} ORDER BY "attemptNumber"`;
    expect(attempts).toMatchObject([
      { provider: "pixgo", state: "FAILED", attemptNumber: 1, errorCode: "REJECTED:LIMIT_EXCEEDED" },
      { provider: "misticpay", state: "PENDING", attemptNumber: 2 },
    ]);

    const [att] = await h.sql<{ id: string }[]>`SELECT id FROM aro_payment_attempt WHERE "checkoutSessionId" = ${s.id} AND provider = 'misticpay'`;
    // Unsigned webhook claiming COMPLETO while the provider still says PENDENTE: no state change.
    const fake = h.mistic.webhook(att!.id, "COMPLETO");
    const r1 = await h.app.inject({ method: "POST", url: "/v1/webhooks/providers/misticpay", headers: fake.headers, payload: fake.body });
    expect(r1.statusCode).toBe(200);
    expect((await getSession(s.id, s.checkout_secret)).json().state).toBe("PENDING");

    h.mistic.byClientId(att!.id).state = "COMPLETO";
    const real = h.mistic.webhook(att!.id, "COMPLETO");
    // The first signal re-read a stale PENDENTE, so its inbox row stayed retryable: the re-sent signal re-fetches.
    const r2 = await h.app.inject({ method: "POST", url: "/v1/webhooks/providers/misticpay", headers: real.headers, payload: real.body });
    expect(r2.json().status).toBe("processed");
    expect((await getSession(s.id, s.checkout_secret)).json().state).toBe("APPROVED");
    // MisticPay check returns decimal reais; normalized to minor units at the edge.
    const [paid] = await h.sql`SELECT "feeMinor", "netMinor" FROM aro_payment_attempt WHERE id = ${att!.id}`;
    expect(paid).toMatchObject({ feeMinor: 23, netMinor: 1167 });
  });

  it("ambiguous create: recovers the PixGo payment by external_id instead of failing over", async () => {
    h.pixgo.createMode = "timeout_created";
    const res = await createCheckout(h);
    expect(res.statusCode).toBe(201);
    expect(res.json().payment.copy_paste).toMatch(/PIXGO/);
    const attempts = await h.sql`SELECT provider, state FROM aro_payment_attempt WHERE "checkoutSessionId" = ${res.json().id}`;
    expect(attempts).toEqual([{ provider: "pixgo", state: "PENDING" }]);
  });

  it("ambiguous create with provider lookup down: 503, no failover; replay with same key resumes safely", async () => {
    h.pixgo.createMode = "timeout_not_created";
    h.pixgo.lookupDown = true;
    const key = randomUUID();
    const first = await createCheckout(h, checkoutBody(), key);
    expect(first.statusCode).toBe(503);
    expect(first.json().error).toBe("PROVIDER_UNAVAILABLE");
    const mistic = await count(h.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM aro_payment_attempt a JOIN aro_checkout_session s ON s.id = a."checkoutSessionId"
      WHERE s."idempotencyKey" = ${key} AND a.provider = 'misticpay'`);
    expect(mistic).toBe(0);

    h.pixgo.lookupDown = false; // PixGo now proves the payment was never created
    const second = await createCheckout(h, checkoutBody(), key);
    expect(second.statusCode).toBe(201);
    expect(second.json().state).toBe("PENDING");
    const attempts = await h.sql`
      SELECT a.provider, a.state, a."errorCode" FROM aro_payment_attempt a JOIN aro_checkout_session s ON s.id = a."checkoutSessionId"
      WHERE s."idempotencyKey" = ${key} ORDER BY a."attemptNumber"`;
    expect(attempts).toMatchObject([
      { provider: "pixgo", state: "FAILED", errorCode: "NOT_CREATED" },
      { provider: "misticpay", state: "PENDING" },
    ]);
  });

  it("replay never second-guesses an in-flight create; a stale CREATED attempt is recovered", async () => {
    const key = randomUUID();
    const first = await createCheckout(h, checkoutBody(), key);
    const [a] = await h.sql<{ id: string }[]>`SELECT id FROM aro_payment_attempt WHERE "checkoutSessionId" = ${first.json().id}`;
    // Simulate a crash/in-flight request: attempt CREATED, session without instruction.
    await h.sql`UPDATE aro_payment_attempt SET state = 'CREATED', "createdAt" = now() WHERE id = ${a!.id}`;
    await h.sql`UPDATE aro_checkout_session SET state = 'CREATED', "paymentInstruction" = NULL WHERE id = ${first.json().id}`;
    const busy = await createCheckout(h, checkoutBody(), key);
    expect(busy.statusCode).toBe(409);
    await h.sql`UPDATE aro_payment_attempt SET "createdAt" = now() - interval '5 minutes' WHERE id = ${a!.id}`;
    const resumed = await createCheckout(h, checkoutBody(), key);
    expect(resumed.statusCode).toBe(201);
    expect(resumed.json().payment.copy_paste).toBe(first.json().payment.copy_paste); // same PixGo charge, found by external_id
  });

  it("all providers rejecting yields PROVIDER_REJECTED and a FAILED session; replay returns the same error", async () => {
    h.pixgo.createMode = "reject";
    h.mistic.createMode = "reject";
    const key = randomUUID();
    const r = await createCheckout(h, checkoutBody(), key);
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toBe("PROVIDER_REJECTED");
    const again = await createCheckout(h, checkoutBody(), key);
    expect(again.json().error).toBe("PROVIDER_REJECTED");
    const [s] = await h.sql`SELECT s.state, o.status FROM aro_checkout_session s JOIN commerce_order o ON o.id = s."orderId" WHERE s."idempotencyKey" = ${key}`;
    expect(s).toEqual({ state: "FAILED", status: "cancelled" });
  });

  it("CNPJ payer is routed only to providers accepting CNPJ (PixGo, not MisticPay)", async () => {
    h.pixgo.createMode = "reject";
    const r = await createCheckout(h, checkoutBody({ payer: { name: "Empresa", email: "e@example.com", document: VALID_CNPJ } }));
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toBe("PROVIDER_REJECTED");
  });

  it("rejects an approval whose amount differs from the attempt", async () => {
    const s = (await createCheckout(h)).json();
    await pixgoWebhook(await pixgoIdOf(s.id), "payment.completed", { amount: 1.0 });
    expect((await getSession(s.id, s.checkout_secret)).json().state).toBe("PENDING");
    const [a] = await h.sql`SELECT "errorCode" FROM aro_payment_attempt WHERE "checkoutSessionId" = ${s.id}`;
    expect(a).toEqual({ errorCode: "AMOUNT_MISMATCH" });
  });

  it("expiry then late confirmed payment still approves (provider evidence wins)", async () => {
    const s = (await createCheckout(h)).json();
    const pid = await pixgoIdOf(s.id);
    await pixgoWebhook(pid, "payment.expired");
    expect((await getSession(s.id, s.checkout_secret)).json().state).toBe("EXPIRED");
    await pixgoWebhook(pid, "payment.completed");
    expect((await getSession(s.id, s.checkout_secret)).json().state).toBe("APPROVED");
  });

  it("reconciler approves a payment whose webhook was lost", async () => {
    const s = (await createCheckout(h)).json();
    const pid = await pixgoIdOf(s.id);
    h.pixgo.payments.get(pid)!.status = "completed";
    await h.sql`UPDATE aro_payment_attempt SET "updatedAt" = now() - interval '10 minutes' WHERE "checkoutSessionId" = ${s.id}`;
    const r = await reconcilePendingAttempts(h.ctx, { limit: 500 });
    expect(r.changed).toBeGreaterThanOrEqual(1);
    expect((await getSession(s.id, s.checkout_secret)).json().state).toBe("APPROVED");
  });

  it("rejects provider webhooks with a bad signature or stale timestamp", async () => {
    const s = (await createCheckout(h)).json();
    const w = h.pixgo.webhook("wrong-secret", await pixgoIdOf(s.id), "payment.completed");
    const bad = await h.app.inject({ method: "POST", url: "/v1/webhooks/providers/pixgo", headers: w.headers, payload: w.body });
    expect(bad.statusCode).toBe(400);
    const old = h.pixgo.webhook(PIXGO_SECRET, await pixgoIdOf(s.id), "payment.completed", {});
    old.headers["x-webhook-timestamp"] = String(Math.floor(Date.now() / 1000) - 3600);
    const stale = await h.app.inject({ method: "POST", url: "/v1/webhooks/providers/pixgo", headers: old.headers, payload: old.body });
    expect(stale.statusCode).toBe(400);
    expect((await getSession(s.id, s.checkout_secret)).json().state).toBe("PENDING");
  });

  it("international CARD routes to Stripe and returns a client secret only", async () => {
    const r = await createCheckout(
      h,
      checkoutBody({ offer: "p01-eu", market: "EU", country: "PT", currency: "EUR", payment_method: "CARD", payer: { name: "Ana", email: "ana@example.pt" } }),
    );
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ state: "PENDING", amount: { amount_minor: 500, currency: "EUR" }, payment: { kind: "CARD", client_secret: expect.any(String) } });
    const [a] = await h.sql<{ providerPaymentId: string }[]>`SELECT "providerPaymentId" FROM aro_payment_attempt WHERE "checkoutSessionId" = ${r.json().id}`;
    const w = h.stripe.webhook(SECRETS[Object.keys(SECRETS).find((k) => k.includes("STRIPE_PROD__WEBHOOK"))!]!, a!.providerPaymentId, "payment_intent.succeeded");
    const wh = await h.app.inject({ method: "POST", url: "/v1/webhooks/providers/stripe", headers: w.headers, payload: w.body });
    expect(wh.json().status).toBe("processed");
    expect((await getSession(r.json().id, r.json().checkout_secret)).json().state).toBe("APPROVED");
  });

  describe("validation and auth", () => {
    it("422s: unknown offer, currency mismatch, missing/invalid CPF, no route", async () => {
      expect((await createCheckout(h, checkoutBody({ offer: "nope" }))).json().error).toBe("INVALID_OFFER");
      expect((await createCheckout(h, checkoutBody({ currency: "USD" }))).json().error).toBe("INVALID_OFFER");
      const noDoc = await createCheckout(h, checkoutBody({ payer: { name: "Xxx", email: "x@example.com" } }));
      expect(noDoc.statusCode).toBe(422);
      expect(noDoc.json().error).toBe("INVALID_PAYER");
      expect((await createCheckout(h, checkoutBody({ payer: { name: "Xxx", email: "x@example.com", document: "123" } }))).json().error).toBe("INVALID_PAYER");
      expect((await createCheckout(h, checkoutBody({ payment_method: "CARD" }))).json().error).toBe("NO_PAYMENT_ROUTE");
    });

    it("400 on schema violations and short Idempotency-Key", async () => {
      expect((await createCheckout(h, checkoutBody({ payment_method: "BOLETO" }))).statusCode).toBe(400);
      expect((await createCheckout(h, checkoutBody(), "short")).json().error).toBe("INVALID_REQUEST");
    });

    it("401/403 for bad keys, foreign project, disallowed origin, wrong checkout secret", async () => {
      const noKey = await h.app.inject({ method: "POST", url: "/v1/checkout-sessions", headers: { "idempotency-key": randomUUID() }, payload: checkoutBody() });
      expect(noKey.statusCode).toBe(401);
      expect((await createCheckout(h, checkoutBody({ project: "levelab" }))).statusCode).toBe(403);
      const badOrigin = await createCheckout(h, checkoutBody(), randomUUID(), { origin: "https://evil.example" });
      expect(badOrigin.statusCode).toBe(403);
      const good = await createCheckout(h, checkoutBody(), randomUUID(), { origin: "https://espelho.lia.doctor" });
      expect(good.statusCode).toBe(201);
      expect(good.headers["access-control-allow-origin"]).toBe("https://espelho.lia.doctor");
      expect((await getSession(good.json().id, "aro_cs_wrong")).statusCode).toBe(401);
      // Server key is not a public key and vice versa.
      const order = await h.app.inject({ method: "GET", url: `/v1/orders/${good.json().order_id}`, headers: { authorization: `Bearer ${h.publicKey}` } });
      expect(order.statusCode).toBe(401);
      const missing = await h.app.inject({ method: "GET", url: `/v1/orders/${randomUUID()}`, headers: { authorization: `Bearer ${h.serverKey}` } });
      expect(missing.statusCode).toBe(404);
    });

    it("CORS preflight only for allowlisted origins", async () => {
      const ok = await h.app.inject({ method: "OPTIONS", url: "/v1/checkout-sessions", headers: { origin: "https://espelho.lia.doctor" } });
      expect(ok.headers["access-control-allow-origin"]).toBe("https://espelho.lia.doctor");
      const no = await h.app.inject({ method: "OPTIONS", url: "/v1/checkout-sessions", headers: { origin: "https://evil.example" } });
      expect(no.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  describe("operator revenue overview", () => {
    const secret = "test-operator-jwt-secret-0123456789abcdef";
    const token = (claims: Record<string, unknown>) =>
      signJwt(secret, { sub: "agent:aro-revenue-operator", exp: Math.floor(Date.now() / 1000) + 300, ...claims });

    it("returns integer-minor-unit money in the reporting currency, scoped by token", async () => {
      const ok = await h.app.inject({
        method: "GET",
        url: "/v1/operator/projects/espelhomeu/revenue/overview?reporting_currency=BRL",
        headers: { authorization: `Bearer ${token({ projects: ["espelhomeu"], scopes: ["revenue:read"] })}` },
      });
      expect(ok.statusCode).toBe(200);
      const body = ok.json();
      expect(body).toMatchObject({ project: "espelhomeu", gross: { currency: "BRL" }, refunds: { currency: "BRL" } });
      expect(Number.isInteger(body.gross.amount_minor)).toBe(true);
      expect(body.gross.amount_minor).toBeGreaterThan(0);
      expect(body.refunds.amount_minor).toBeGreaterThanOrEqual(1190); // the refunded P01
      expect(body.net.amount_minor).toBe(body.gross.amount_minor - body.refunds.amount_minor);
      expect(body.approved_orders).toBeGreaterThan(0);

      const eur = await h.app.inject({
        method: "GET",
        url: "/v1/operator/projects/espelhomeu/revenue/overview?reporting_currency=EUR",
        headers: { authorization: `Bearer ${token({ projects: ["espelhomeu"], scopes: ["revenue:read"] })}` },
      });
      expect(eur.json().gross).toEqual({ amount_minor: 500, currency: "EUR" }); // no implicit FX
    });

    it("401 without token, 403 outside project or scope", async () => {
      const url = "/v1/operator/projects/espelhomeu/revenue/overview";
      expect((await h.app.inject({ method: "GET", url })).statusCode).toBe(401);
      const other = token({ projects: ["levelab"], scopes: ["revenue:read"] });
      expect((await h.app.inject({ method: "GET", url, headers: { authorization: `Bearer ${other}` } })).statusCode).toBe(403);
      const noScope = token({ projects: ["espelhomeu"], scopes: ["payments:read"] });
      expect((await h.app.inject({ method: "GET", url, headers: { authorization: `Bearer ${noScope}` } })).statusCode).toBe(403);
    });
  });

  describe("outbound delivery", () => {
    it("retries with backoff on project errors and dead-letters after the limit", async () => {
      h.receiver.status = 500;
      await createCheckout(h);
      await h.sql`UPDATE aro_webhook_delivery SET status = 'delivered' WHERE status = 'pending' AND "nextAttemptAt" > now()`;
      await deliverDueWebhooks(h.ctx, 100);
      const [d] = await h.sql<{ id: string; attempts: number; status: string; lastStatusCode: number }[]>`
        SELECT id, attempts, status, "lastStatusCode" FROM aro_webhook_delivery WHERE "lastStatusCode" = 500 LIMIT 1`;
      expect(d).toMatchObject({ attempts: 1, status: "pending", lastStatusCode: 500 });
      await h.sql`UPDATE aro_webhook_delivery SET attempts = 11, "nextAttemptAt" = now() WHERE id = ${d!.id}`;
      await deliverDueWebhooks(h.ctx, 100);
      const [dead] = await h.sql`SELECT status, attempts FROM aro_webhook_delivery WHERE id = ${d!.id}`;
      expect(dead).toEqual({ status: "dead", attempts: 12 });
    });
  });
});
