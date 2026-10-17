#!/usr/bin/env node
/**
 * P0 no-money smoke for the ARO runtime. Only creates a reusable checkout LINK,
 * never generates a Pix charge, approves an order or changes settlement.
 *
 * ARO_BASE_URL=https://aro.atlashub.si node scripts/aro-p0-smoke.mjs
 * ARO_BASE_URL=... ARO_PROJECT_SERVER_KEY=... ARO_OFFER_CODE=... node scripts/aro-p0-smoke.mjs --checkout-link
 */
import { setTimeout as sleep } from "node:timers/promises";

const baseValue=process.env.ARO_BASE_URL || process.env.ARO_PUBLIC_BASE_URL || "";
const offer=process.env.ARO_OFFER_CODE || "";
const secret=process.env.ARO_PROJECT_SERVER_KEY || "";
const canLink=process.argv.includes("--checkout-link");
const outputs=[];
function report(test,ok,message) {
  const data={test,status:ok?"PASS":"FAIL",message};
  outputs.push(data);
  process.stdout.write((ok?"✓ ":"✗ ")+test+" — "+message+"\n");
  if(!ok) process.exitCode=1;
}
async function request(url,opts={}) {
  try {
    return await fetch(url,{...opts,signal:AbortSignal.timeout(7000),redirect:"error",
      cache:"no-store"});
  } catch(e) {
    throw Error(e?.name==="TimeoutError"?"timeout":"connection_failed");
  }
}
if(!baseValue){report("config",false,"ARO_BASE_URL required");process.exit(1);}
let base;
try {
  base=new URL(baseValue);
  if(base.protocol!=="https:" && base.hostname!=="localhost" && base.hostname!=="127.0.0.1")
    throw Error("https_required");
  if(base.username||base.password||base.search||base.hash) throw Error("untrusted_url");
} catch {report("config",false,"Use a valid HTTPS ARO_BASE_URL");process.exit(1);}
try {
  const health=await request(new URL("/health",base));
  const data=await health.json().catch(()=>({}));
  report("api_health",health.ok&&data.status==="ok"&&data.db==="up",
    "HTTP "+health.status+"; db="+String(data.db||"unknown"));
} catch(e){report("api_health",false,e.message);}
if(canLink){
  if(!secret||!offer){report("checkout_credentials",false,"ARO_PROJECT_SERVER_KEY and ARO_OFFER_CODE required");}
  else {
    try {
      // Project inferred from server key; never pass project or payment value.
      const r=await request(new URL("/v1/checkout-links",base),{
        method:"POST",headers:{"authorization":"Bearer "+secret,"content-type":"application/json"},
        body:JSON.stringify({offer,reference:"P0-SMOKE-READONLY",expires_in_days:1}),
      });
      const value=await r.json().catch(()=>({}));
      if(r.status!==201||!value.url){
        report("create_link",false,"HTTP "+r.status+"; code="+String(value.error||"unexpected"));
      }else{
        const href=new URL(value.url);
        const pathOkay=href.origin===base.origin && href.pathname.startsWith("/pay/hl1.");
        report("create_link",pathOkay, pathOkay?"URL issued; price resolved by ARO":"checkout link origin invalid");
        if(pathOkay){
          const page=await request(href);
          const html=await page.text();
          report("hosted_checkout",page.ok&&html.includes("Pix Copia e Cola")&&html.includes("ARO Systems"),
            "HTTP "+page.status+"; payment not initiated");
          const js=await request(new URL("/assets/aro-checkout.js",base));
          report("checkout_loader",js.ok,"HTTP "+js.status);
        }
      }
    } catch(e){report("checkout_link_flow",false,e.message);}
  }
}
process.stdout.write("\n"+JSON.stringify({result:outputs.every(x=>x.status==="PASS")?"PASS":"FAIL",
  checks:outputs.length,failed:outputs.filter(x=>x.status==="FAIL").map(x=>x.test)},null,2)+"\n");
