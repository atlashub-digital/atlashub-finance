import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const ClaimBinding = z.object({
  project: z.string().min(1).max(128), tenantId: z.string().min(1),
  orderId: z.uuid(), checkoutSessionId: z.uuid(), offerId: z.uuid(),
  aroCustomerId: z.string().min(1),
});
const Proof = ClaimBinding.extend({ issuedAt: z.number().int().safe(), expiresAt: z.number().int().safe() }).strict();
export type ClaimBinding = z.infer<typeof ClaimBinding>;
export function signClaimProof(binding: ClaimBinding, key: string, now = Date.now()) {
  const payload = { ...binding, issuedAt: now, expiresAt: now + 120_000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", key).update(`aro:hosted-claim:v1:${body}`).digest("base64url");
  return { proof: `hc1.${body}.${signature}`, issuedAt: payload.issuedAt, expiresAt: payload.expiresAt };
}
export function readClaimProof(proof: string, key: string, now = Date.now()) {
  if (proof.length > 4096 || !/^hc1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(proof)) return null;
  const [, body, signature] = proof.split(".") as [string, string, string];
  const expected = createHmac("sha256", key).update(`aro:hosted-claim:v1:${body}`).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const parsed = Proof.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    if (!parsed.success) return null;
    const p = parsed.data;
    return p.issuedAt <= now && p.expiresAt > now && p.expiresAt > p.issuedAt && p.expiresAt - p.issuedAt <= 120_000 ? p : null;
  } catch { return null; }
}
