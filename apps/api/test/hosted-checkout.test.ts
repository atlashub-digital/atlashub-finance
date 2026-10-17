import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHostedToken, readHostedToken } from "../src/hosted/token.js";
import { hostedCheckoutHtml } from "../src/hosted/ui.js";
import { TEST_DATABASE_URL } from "./helpers/db.js";
import { makeHarness, VALID_CPF, type Harness } from "./helpers/harness.js";

const secret = "test-aro-hosted-checkout-hmac-secret-0123456";

describe("ARO hosted universal checkout — signed links and HTML", () => {
  const link = { projectId:"prj-a", project:"espelhomeu", offer:"p01-br", reference:"IG-001", exp:Date.now()+3600_000 };
  it("opaque link is encrypted, authenticated and bound to project/offer", () => {
    const token = createHostedToken(link,secret);
    expect(token).toMatch(/^hl1\./);
    expect(token).not.toContain("espelhomeu");
    expect(token).not.toContain("IG-001");
    expect(readHostedToken(token,secret)).toEqual(link);
    expect(readHostedToken(token,"this-is-another-secret-of-same-length-12345")).toBeNull();
    const parts = token.split(".");
    parts[1] = (parts[1]!.startsWith("A") ? "B" : "A") + parts[1]!.slice(1);
    expect(readHostedToken(parts.join("."),secret)).toBeNull();
    expect(readHostedToken(createHostedToken({...link, exp:Date.now()-5000},secret),secret)).toBeNull();
  });
  it("untrusted product title is HTML-escaped; no payer values in markup", () => {
    const html = hostedCheckoutHtml({token:"hl1.safe",project:"p",title:'<script>alert("x")</script>',amountMinor:1190,currency:"BRL",origins:[]});
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Pix Copia e Cola");
    expect(html).toContain("ARO Systems");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("ARO hosted checkout HTTP + Pix", () => {
  let h: Harness;
  beforeAll(async()=> {h=await makeHarness();});
  afterAll(async()=> {await h?.close();});
  it("server scoped key creates one reusable offer link; anonymous buyer pays using canonical price",async()=>{
    const noAuth=await h.app.inject({method:"POST",url:"/v1/checkout-links",payload:{offer:"p01-br"}});
    expect(noAuth.statusCode).toBe(401);
    const issued=await h.app.inject({method:"POST",url:"/v1/checkout-links",
      headers:{authorization:"Bearer "+h.serverKey},
      payload:{offer:"p01-br",reference:"LL01-IG",expires_in_days:2}});
    expect(issued.statusCode).toBe(201);
    const link=issued.json();
    expect(link.amount).toEqual({amount_minor:1190,currency:"BRL"});
    const pathname=new URL(link.url).pathname;
    const page=await h.app.inject({method:"GET",url:pathname});
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-security-policy"]).toContain("frame-ancestors 'self' https://espelho.lia.doctor");
    expect(page.body).toContain("EspelhoMeu P01");
    const code=await h.app.inject({method:"GET",url:"/assets/aro-checkout.js"});
    expect(code.statusCode).toBe(200);
    expect(code.body).toContain("AROCheckout");

    const idempotency=randomUUID();
    const pay=await h.app.inject({method:"POST",url:pathname+"/checkout",
      headers:{"Idempotency-Key":idempotency,origin:"https://aro.test"},
      payload:{name:"Cliente Teste",email:"hosted-"+randomUUID()+"@example.com",phone:"+5562999999999",
        document:VALID_CPF,accept_terms:true,marketing:false}});
    expect(pay.statusCode).toBe(201);
    const view=pay.json();
    expect(view.amount.amount_minor).toBe(1190);
    expect(view.payment.kind).toBe("PIX");
    expect(view.qr_svg).toContain("<svg");
    expect(view.payment.copy_paste).toBeTruthy();
    const polling=await h.app.inject({method:"GET",url:pathname+"/checkout/"+view.id,
      headers:{"X-ARO-Checkout-Secret":view.checkout_secret}});
    expect(polling.statusCode).toBe(200);
    expect(polling.json().amount.amount_minor).toBe(1190);
    const blocked=await h.app.inject({method:"POST",url:pathname+"/checkout",
      headers:{"Idempotency-Key":randomUUID(),origin:"https://evil.example"},
      payload:{name:"Cliente Teste",email:"e@example.com",document:VALID_CPF,accept_terms:true}});
    expect(blocked.statusCode).toBe(403);
  });
});
