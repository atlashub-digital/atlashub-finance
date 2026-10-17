import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL } from "./helpers/db.js";
import { makeHarness, type Harness } from "./helpers/harness.js";

const key = "test-operator-jwt-secret-0123456789abcdef";
function token(projects: string[], scopes: string[]) {
  const header = Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url");
  const body = Buffer.from(JSON.stringify({
    sub:"agent:aro-p0-test",projects,scopes,exp:Math.floor(Date.now()/1000)+300,
  })).toString("base64url");
  const sign=createHmac("sha256",key).update(header+"."+body).digest("base64url");
  return header+"."+body+"."+sign;
}
describe.skipIf(!TEST_DATABASE_URL)("Hermes ARO P0 operations observer",()=>{
  let h:Harness;
  beforeAll(async()=>{h=await makeHarness();});
  afterAll(async()=>{await h.close();});
  it("returns finance/exception counts by project, without exposing contact PII",async()=>{
    const r=await h.app.inject({
      method:"GET",url:"/v1/operator/projects/espelhomeu/operations/p0?reporting_currency=BRL",
      headers:{authorization:"Bearer "+token(["espelhomeu"],["revenue:read"])},
    });
    expect(r.statusCode).toBe(200);
    const v=r.json();
    expect(v.project).toBe("espelhomeu");
    expect(v.payments).toHaveProperty("stale_pending_or_unknown");
    expect(v.webhooks).toHaveProperty("undelivered");
    expect(v.financial).toHaveProperty("settled_balance_available",false);
    expect(v.financial.gross_approved).toHaveProperty("currency","BRL");
    expect(JSON.stringify(v)).not.toContain("emailNorm");
    expect(JSON.stringify(v)).not.toContain("webhookSecretRef");
  });
  it("denies another project and missing operator scope",async()=>{
    for(const t of [token(["atlas-club"],["revenue:read"]),token(["espelhomeu"],["payments:read"])]) {
      const r=await h.app.inject({method:"GET",
        url:"/v1/operator/projects/espelhomeu/operations/p0",
        headers:{authorization:"Bearer "+t}});
      expect(r.statusCode).toBe(403);
    }
  });
});
