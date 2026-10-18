// @ts-nocheck -- Immutable external compatibility fixture; ARO types fetch JSON as unknown.
// Compatibility fixture copied verbatim from atlashub-digital/espelhomeu PR #33
// commit dabc2e49171cc8f23e6e70ddfdb60fe89b3eaab5, apps/api/src/access/claim.ts.
/** Future ARO #24 exchange. Only trusted backend responses may populate these fields.
 * The HTTP endpoint deliberately returns 409 until the hosted proof contract exists.
 */
export interface HostedCheckoutProof {
  project: "espelhomeu";
  orderId: string;
  checkoutSessionId: string;
  proof: string;
  offerId: string;
}
export interface AuthorizedPurchaseBinding {
  principalId: string;
  project: "espelhomeu";
  orderId: string;
  aroCustomerId: string;
  offerId: string;
  checkoutSessionId: string;
  expiresAt: number;
}
export interface AroClaimAdapter {
  resolve?(binding: AuthorizedPurchaseBinding): Promise<string[]>;
  claim(proof: HostedCheckoutProof, principalId: string): Promise<AuthorizedPurchaseBinding | null>;
}
export const unavailableAroClaim: AroClaimAdapter = { async claim() { return null; } };

/** Consumer contract proposal for ARO #24. Enable only after the issuer agrees
 * this response shape and implements atomic consumption + current entitlement checks. */
export function remoteAroClaim(endpoint: string, serverKey: string, now = Date.now): AroClaimAdapter {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) throw new Error("aro_configuration");
  return { async resolve(binding) {
    try {
      const call = async (path: string, body?: unknown) => {
        const r = await fetch(new URL(path, url), { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + serverKey, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error("aro_unavailable");
        return r.json();
      };
      const order = await call("/v1/orders/" + encodeURIComponent(binding.orderId));
      if (order.project !== "espelhomeu" || order.id !== binding.orderId || order.customer_id !== binding.aroCustomerId || order.status !== "APPROVED") return [];
      const p = await call("/v1/entitlements/resolve", { project: "espelhomeu", customer_id: binding.aroCustomerId });
      if (p.project !== "espelhomeu" || p.customer_id !== binding.aroCustomerId || !Array.isArray(p.entitlements)) return [];
      return ["p01", "p02", "p03", "p04", "p05"].filter(id => p.entitlements.some((e: { key: string; status: string; source_order_id: string; starts_at: string; expires_at?: string }) => e.key === "espelhomeu:" + id && e.status === "ACTIVE" && e.source_order_id === binding.orderId && Date.parse(e.starts_at) <= now() && (e.expires_at === undefined || Date.parse(e.expires_at) > now())));
    } catch { return []; }
  }, async claim(proof, principalId) {
    try {
      const response = await fetch(url, { method: "POST", headers: { authorization: "Bearer " + serverKey, "content-type": "application/json" }, body: JSON.stringify({ ...proof, principalId }), redirect: "error", signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      const b = await response.json();
      if (b.project !== "espelhomeu" || b.project !== proof.project || b.orderId !== proof.orderId || b.checkoutSessionId !== proof.checkoutSessionId || b.principalId !== principalId || b.orderStatus !== "APPROVED" || b.entitlementStatus !== "ACTIVE" || typeof b.issuedAt !== "number" || typeof b.expiresAt !== "number" || b.issuedAt > now() || b.expiresAt <= now() || b.expiresAt - b.issuedAt > 120000 || b.expiresAt <= b.issuedAt || b.offerId !== proof.offerId || typeof b.aroCustomerId !== "string" || !b.aroCustomerId || !Number.isSafeInteger(b.issuedAt) || !Number.isSafeInteger(b.expiresAt)) return null;
      return { principalId, project: "espelhomeu", orderId: b.orderId, aroCustomerId: b.aroCustomerId, offerId: b.offerId, checkoutSessionId: b.checkoutSessionId, expiresAt: b.expiresAt };
    } catch { return null; }
  } };
}
