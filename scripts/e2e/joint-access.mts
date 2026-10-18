/** Local-only real HTTP integration. Run with EspelhoMeu's tsx (see evidence).
 * No provider checkout, network mocks, identity stubs or external delivery.
 * Synthetic purchase fixtures and preview WA possession exercise real session code.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildApp } from '../../apps/api/src/app.js';
import { loadEnv } from '../../apps/api/src/env.js';
import { freshDatabase } from '../../apps/api/test/helpers/db.js';
import { ESPELHOMEU_CONFIG, ESPELHOMEU_MANIFEST } from '../../apps/api/test/helpers/harness.js';
import { syncProject } from '../../apps/api/src/admin/catalog.js';
import { issueApiKey } from '../../apps/api/src/admin/manifests.js';
import { checkoutSecretFor } from '../../apps/api/src/security/auth.js';
import { grantOrderEntitlements } from '../../apps/api/src/modules/entitlements/service.js';
import { createSql } from '../../apps/api/src/db/client.js';
const consumer = process.env.ESPELHOMEU_PATH;
if (!consumer || !/^postgres(?:ql)?:\/\/[^/]*@127\.0\.0\.1:/.test(process.env.TEST_DATABASE_URL ?? '')) throw new Error('Local disposable database and ESPELHOMEU_PATH required');
const external = (p: string) => import(pathToFileURL(consumer + '/apps/api/' + p).href);
const [{ AccessService }, { postgresAccessStore }, { accessRoutes }, { remoteAroClaim }, { default: Fastify }] = await Promise.all([
  external('src/access/service.ts'), external('src/access/store.ts'), external('src/routes/access.ts'), external('src/access/claim.ts'), external('node_modules/fastify/fastify.js'),
]);
const db = await freshDatabase();
let aro: any, app: any, runtime: any;
const log = (label: string, actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected, label); console.log('PASS ' + label + ' ' + JSON.stringify(actual)); };
try {
  const sql = db.sql;
  await sql`INSERT INTO "Tenant" (id,slug,name) VALUES ('tenant-atlashub','atlashub','AtlasHub'), ('other','other','Other')`;
  await syncProject(sql, ESPELHOMEU_CONFIG, ESPELHOMEU_MANIFEST, 'joint-e2e');
  await sql.unsafe(await readFile(consumer + '/apps/api/drizzle/0004_access_v1.sql', 'utf8'));
  await sql.unsafe('CREATE ROLE joint_runtime LOGIN IN ROLE aro_runtime');
  const runtimeUrl = new URL(db.url); runtimeUrl.username = 'joint_runtime'; runtimeUrl.password = '';
  runtime = createSql(runtimeUrl.toString());
  const serverKey = await issueApiKey(sql, 'espelhomeu', 'server');
  const checkoutKey = randomBytes(32).toString('hex');
  aro = buildApp({ sql: runtime, env: loadEnv({ NODE_ENV:'test', LOG_LEVEL:'silent', ARO_PUBLIC_BASE_URL:'http://127.0.0.1', ARO_HOSTED_CHECKOUT_ENABLED:'true', ARO_CLAIM_SERVER_KEY:serverKey, ARO_CHECKOUT_SECRET_KEY:checkoutKey }) });
  const aroUrl = await aro.listen({ host:'127.0.0.1', port:0 });
  // Real PostgreSQL store. Native WA identity is local: email identity methods
  // must never run. No transport is installed; preview possession only.
  const service = new AccessService(postgresAccessStore({ sql }), undefined, randomBytes(32), true);
  app = Fastify({ logger:false });
  await app.register(accessRoutes, { enabled:true, service, origins:['http://localhost:3100'], aroClaim:remoteAroClaim(aroUrl + '/v1/checkout-claims', serverKey) });
  const consumerUrl = await app.listen({ host:'127.0.0.1', port:0 });
  console.log('REAL_HTTP ARO=127.0.0.1 EspelhoMeu=127.0.0.1 PostgreSQL=16 disposable; aro_runtime role; no simulators');
  async function call(base: string, path: string, body?: any, headers = {}) {
    const r = await fetch(base + path, { method:body ? 'POST':'GET', headers:{ 'content-type':'application/json', ...headers }, ...(body ? {body:JSON.stringify(body)}:{}) });
    return { status:r.status, body:await r.json(), cookie:r.headers.get('set-cookie')?.split(';')[0] };
  }
  const challenge = await call(consumerUrl, '/access/challenges', {project:'espelhomeu',channel:'whatsapp',method:'otp',identifier:'+351910000000',transactionalConsent:true}, {origin:'http://localhost:3100'});
  log('challenge request',challenge.status,200);
  assert.ok(challenge.body.challenge_id, JSON.stringify(challenge.body));
  const secret = await service.previewSecret(challenge.body.challenge_id);
  assert.ok(secret, 'preview possession proof exists');
  const verified = await call(consumerUrl, '/access/challenges/verify', {project:'espelhomeu',challenge_id:challenge.body.challenge_id,secret}, {origin:'http://localhost:3100'});
  log('Atlas Access local preview possession/session', verified.status, 200);
  const headers = { origin:'http://localhost:3100', cookie:verified.cookie! };
  log('authenticated session', (await call(consumerUrl,'/access/session',undefined,headers)).status,200);
  const [offer] = await sql`SELECT * FROM aro_offer WHERE slug='p01-br'`;
  async function fixture(approved = true) {
    const orderId = randomUUID(), checkoutSessionId = randomUUID(), contactId = randomUUID();
    await sql`INSERT INTO crm_contact (id,"tenantId","fullName") VALUES (${contactId},'tenant-atlashub','Synthetic Buyer')`;
    await sql`INSERT INTO commerce_order (id,"tenantId",status,currency,"totalMinor","projectId","contactId") VALUES (${orderId},'tenant-atlashub',${approved?'paid':'pending_payment'},'BRL',1190,${offer.projectId},${contactId})`;
    await sql`INSERT INTO aro_order_item (id,"tenantId","orderId","offerId","productId",title,"unitAmountMinor",currency,"entitlementKeys") VALUES (${randomUUID()},'tenant-atlashub',${orderId},${offer.id},${offer.productIds[0]},'P01',1190,'BRL',${['espelhomeu:p01']})`;
    await sql`INSERT INTO aro_checkout_session (id,"tenantId","projectId","orderId","offerId","contactId","idempotencyKey","requestHash",state,market,method,"amountMinor",currency,"hostedClaimEligible") VALUES (${checkoutSessionId},'tenant-atlashub',${offer.projectId},${orderId},${offer.id},${contactId},${randomUUID()},'synthetic',${approved?'APPROVED':'PENDING'},'BR','PIX',1190,'BRL',true)`;
    if (approved) await grantOrderEntitlements(sql, {id:orderId,tenantId:'tenant-atlashub',projectId:offer.projectId,contactId});
    const proof = await call(aroUrl,`/v1/checkout-sessions/${checkoutSessionId}/claim-proof`,{}, {'x-aro-checkout-secret':checkoutSecretFor(checkoutKey,checkoutSessionId)});
    return {orderId,checkoutSessionId,contactId,proof, input:{project:'espelhomeu',orderId,checkoutSessionId,offerId:offer.id,proof:proof.body.proof}};
  }
  const exchange = (f: any) => call(consumerUrl,'/access/aro/claim',f.input,headers);
  const reader = async () => (await call(consumerUrl,'/access/entitlements',undefined,headers)).body;
  const good = await fixture();
  log('APPROVED/ACTIVE proof issued',good.proof.status,200);
  log('claim accepted by real consumer',(await exchange(good)).status,200);
  log('Reader authorization backend',await reader(),{productRefs:['p01']});
  log('replay consumer',(await exchange(good)).status,409);
  log('replay issuer',(await call(aroUrl,'/v1/checkout-claims',{...good.input,principalId:randomUUID()},{authorization:'Bearer '+serverKey})).status,409);
  for (const state of ['refunded','chargeback','revoked']) {
    const f = await fixture();
    if (state !== 'revoked') await sql`UPDATE commerce_order SET status=${state} WHERE id=${f.orderId}`;
    await sql`UPDATE commerce_entitlement SET status='revoked',"revokedAt"=now() WHERE "sourceId"=${f.orderId}`;
    log(state+' between issue/exchange',(await exchange(f)).status,409);
  }
  await sql`UPDATE commerce_order SET status='refunded' WHERE id=${good.orderId}`;
  log('Reader fail-closed after refund',await reader(),{productRefs:[]});
  for (const state of ['chargeback','revoked']) {
    const f = await fixture(); log(state+' initial claim',(await exchange(f)).status,200);
    if (state === 'chargeback') await sql`UPDATE commerce_order SET status='chargeback' WHERE id=${f.orderId}`;
    else await sql`UPDATE commerce_entitlement SET status='revoked',"revokedAt"=now() WHERE "sourceId"=${f.orderId}`;
    log('Reader fail-closed '+state,await reader(),{productRefs:[]});
  }
  const cross = await fixture();
  await sql`UPDATE aro_offer SET "tenantId"='other' WHERE id=${offer.id}`;
  log('cross-tenant',(await exchange(cross)).status,409);
  await sql`UPDATE aro_offer SET "tenantId"='tenant-atlashub' WHERE id=${offer.id}`;
  const first = await fixture(), second = await fixture();
  first.input.checkoutSessionId = second.checkoutSessionId;
  log('other checkout session',(await exchange(first)).status,409);
  const pending = await fixture(false);
  log('PENDING proof issuance',pending.proof.status,409);
  pending.input.proof = second.input.proof;
  log('PENDING consumer claim',(await exchange(pending)).status,409);
  const ttl = await fixture();
  console.log('WAIT real proof TTL 120s (no fake clock/signing)');
  await new Promise(resolve => setTimeout(resolve,120100));
  log('expired claim',(await exchange(ttl)).status,409);
  const [counts] = await sql`SELECT (SELECT count(*)::int FROM aro_checkout_claim) AS claims,(SELECT count(*)::int FROM "AuditEvent" WHERE action='aro.claim.consumed') AS audits`;
  log('atomic consumption audit',counts,{claims:3,audits:3});
  log('negative claims unconsumed',(await sql`SELECT 1 FROM aro_checkout_claim WHERE "checkoutSessionId"=${ttl.checkoutSessionId}`).length,0);
  await aro.close(); aro = undefined;
  log('Reader fail-closed issuer unavailable',await reader(),{productRefs:[]});
  console.log('PASS all backend joint paths; UI/browser and external OTP delivery NOT exercised');
} finally {
  await app?.close(); await aro?.close(); await runtime?.end(); await db.drop();
  const admin = createSql(process.env.TEST_DATABASE_URL!); await admin.unsafe('DROP ROLE IF EXISTS joint_runtime'); await admin.end();
}
