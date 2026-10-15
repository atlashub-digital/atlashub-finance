import { randomUUID } from "node:crypto";
import { buildApp } from "../../src/app.js";
import { applyProjectManifest, applyProviderManifest, issueApiKey } from "../../src/admin/manifests.js";
import { createSql, type Sql } from "../../src/db/client.js";
import { loadEnv } from "../../src/env.js";
import { MisticPayAdapter } from "../../src/providers/misticpay/adapter.js";
import { PixGoAdapter } from "../../src/providers/pixgo/adapter.js";
import { StripeAdapter } from "../../src/providers/stripe/adapter.js";
import { secretEnvName } from "../../src/security/secrets.js";
import { TEST_DATABASE_URL, freshDatabase } from "./db.js";
import { MisticPaySim, PixGoSim, ProjectReceiver, StripeSim } from "./simulators.js";

export const SECRETS: Record<string, string> = {
  [secretEnvName("aro/atlashub/pixgo/prod", "api_key")]: "pk_test_pixgo",
  [secretEnvName("aro/atlashub/pixgo/prod", "webhook_secret")]: "whsec_pixgo_test",
  [secretEnvName("aro/atlashub/misticpay/prod", "client_id")]: "pk_mp",
  [secretEnvName("aro/atlashub/misticpay/prod", "client_secret")]: "sk_mp",
  [secretEnvName("aro/atlashub/stripe/prod", "secret_key")]: "sk_test_stripe",
  [secretEnvName("aro/atlashub/stripe/prod", "webhook_secret")]: "whsec_stripe_test",
  [secretEnvName("aro/espelhomeu/webhook", "secret")]: "project_webhook_secret_espelhomeu",
};

export const PROVIDERS = {
  tenant: "atlashub",
  accounts: [
    { id: "pixgo-main", provider: "pixgo", credential_ref: "aro/atlashub/pixgo/prod" },
    { id: "misticpay-main", provider: "misticpay", credential_ref: "aro/atlashub/misticpay/prod" },
    { id: "stripe-main", provider: "stripe", credential_ref: "aro/atlashub/stripe/prod" },
  ],
  routes: [
    { id: "br-pix-pixgo", market: "BR", currency: "BRL", method: "PIX", account: "pixgo-main", priority: 10 },
    { id: "br-pix-misticpay", market: "BR", currency: "BRL", method: "PIX", account: "misticpay-main", priority: 20 },
    { id: "intl-card-eur", market: "*", currency: "EUR", method: "CARD", account: "stripe-main", priority: 10 },
    { id: "intl-card-usd", market: "*", currency: "USD", method: "CARD", account: "stripe-main", priority: 10 },
  ],
};

export const ESPELHOMEU = {
  tenant: "atlashub",
  project: {
    slug: "espelhomeu",
    name: "EspelhoMeu",
    allowed_origins: ["https://espelho.lia.doctor"],
    webhook_url: "https://espelho.lia.doctor/api/aro/webhook",
    webhook_secret_ref: "aro/espelhomeu/webhook",
  },
  offers: [
    { slug: "p01-br", title: "EspelhoMeu P01", amount_minor: 1190, currency: "BRL", market: "BR", entitlements: ["espelhomeu:p01"] },
    {
      slug: "colecao-br",
      title: "EspelhoMeu Coleção",
      amount_minor: 4990,
      currency: "BRL",
      market: "BR",
      entitlements: ["espelhomeu:p01", "espelhomeu:p02", "espelhomeu:p03", "espelhomeu:p04", "espelhomeu:p05"],
    },
    { slug: "p01-eu", title: "EspelhoMeu P01 (EU)", amount_minor: 500, currency: "EUR", market: "EU", entitlements: ["espelhomeu:p01"] },
    { slug: "guia-bump", title: "Guia bónus", amount_minor: 900, currency: "BRL", market: "BR", entitlements: ["espelhomeu:guia"] },
  ],
};

export const VALID_CPF = "529.982.247-25";
export const VALID_CNPJ = "11.222.333/0001-81";

export async function makeHarness() {
  const db = await freshDatabase();
  await db.sql`INSERT INTO "Tenant" (id, slug, name) VALUES ('tenant-atlashub', 'atlashub', 'AtlasHub')`;
  await applyProviderManifest(db.sql, PROVIDERS);
  await applyProjectManifest(db.sql, ESPELHOMEU);
  const publicKey = await issueApiKey(db.sql, "espelhomeu", "public");
  const serverKey = await issueApiKey(db.sql, "espelhomeu", "server");

  // The API connects as a login role inside aro_runtime: proves the grants/RLS policies suffice.
  const role = `aro_app_${randomUUID().slice(0, 8)}`;
  await db.sql.unsafe(`CREATE ROLE ${role} LOGIN PASSWORD 'aro_app' IN ROLE aro_runtime`);
  const appUrl = new URL(db.url);
  appUrl.username = role;
  appUrl.password = "aro_app";
  const appSql: Sql = createSql(appUrl.toString(), { max: 5 });

  const pixgo = new PixGoSim();
  const mistic = new MisticPaySim();
  const stripe = new StripeSim();
  const receiver = new ProjectReceiver();
  const env = loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    ARO_PUBLIC_BASE_URL: "https://aro.test",
    ARO_CHECKOUT_SECRET_KEY: "test-checkout-secret-key-0123456789abcdef",
    ARO_OPERATOR_JWT_SECRET: "test-operator-jwt-secret-0123456789abcdef",
  });
  const app = buildApp({
    env,
    sql: appSql,
    providers: {
      pixgo: new PixGoAdapter(pixgo.fetch, "https://pixgo.test/api/v1"),
      misticpay: new MisticPayAdapter(mistic.fetch, "https://misticpay.test/api"),
      stripe: new StripeAdapter(stripe.fetch, "https://stripe.test/v1"),
    },
    secrets: (ref, field) => SECRETS[secretEnvName(ref, field)],
    fetch: receiver.fetch,
  });
  await app.ready();

  return {
    app,
    ctx: app.aro!,
    sql: db.sql,
    pixgo,
    mistic,
    stripe,
    receiver,
    publicKey,
    serverKey,
    async close() {
      await app.close();
      await appSql.end();
      await db.sql.unsafe(`DROP OWNED BY ${role}`).catch(() => {});
      await db.drop();
      const admin = createSql(TEST_DATABASE_URL!, { max: 1 });
      await admin.unsafe(`DROP ROLE IF EXISTS ${role}`).catch(() => {});
      await admin.end();
    },
  };
}

export type Harness = Awaited<ReturnType<typeof makeHarness>>;

export const checkoutBody = (over: Record<string, unknown> = {}) => ({
  project: "espelhomeu",
  offer: "p01-br",
  market: "BR",
  country: "BR",
  currency: "BRL",
  payment_method: "PIX",
  payer: { name: "Cliente Teste", email: "Cliente@Example.com", document: VALID_CPF },
  attribution: { utm_source: "instagram", utm_campaign: "p01_launch" },
  ...over,
});

export async function createCheckout(h: Harness, body = checkoutBody(), key: string = randomUUID(), headers: Record<string, string> = {}) {
  return h.app.inject({
    method: "POST",
    url: "/v1/checkout-sessions",
    headers: { "x-aro-public-key": h.publicKey, "idempotency-key": key, ...headers },
    payload: body,
  });
}
