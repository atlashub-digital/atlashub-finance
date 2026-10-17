import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Opaque, authenticated, scoped offer link. No payer PII or amount in URL. */
export type HostedOfferLink = {
  projectId: string;
  project: string;
  offer: string;
  reference: string;
  exp: number;
};

function key(secret: string): Buffer {
  if (secret.length < 32) throw new Error("ARO_CHECKOUT_SECRET_KEY is required");
  return createHash("sha256").update("aro:hosted-offer-link:v1:").update(secret).digest();
}

export function createHostedToken(link: HostedOfferLink, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(link), "utf8"), cipher.final()]);
  return ["hl1", iv.toString("base64url"), body.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function readHostedToken(token: string, secret: string, now = Date.now()): HostedOfferLink | null {
  if (token.length > 2048 || !/^hl1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const [, nonce, encrypted, tag] = token.split(".");
    const iv = Buffer.from(nonce!, "base64url");
    if (iv.length !== 12 || Buffer.from(tag!, "base64url").length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(secret), iv);
    decipher.setAuthTag(Buffer.from(tag!, "base64url"));
    const data = JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted!, "base64url")), decipher.final()]).toString("utf8")) as HostedOfferLink;
    if (!data || typeof data.projectId !== "string" || typeof data.project !== "string"
       || typeof data.offer !== "string" || typeof data.reference !== "string"
       || !Number.isSafeInteger(data.exp) || data.exp <= now || data.exp > now + 31*86400_000) return null;
    return data;
  } catch { return null; }
}
