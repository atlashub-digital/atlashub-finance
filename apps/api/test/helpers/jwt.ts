import { createHmac } from "node:crypto";

export function signJwt(secret: string, claims: Record<string, unknown>, alg = "HS256") {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg, typ: "JWT" });
  const body = enc(claims);
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
