import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const sha256Hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

export const hmacSha256Hex = (key: string | Buffer, data: string | Buffer) =>
  createHmac("sha256", key).update(data).digest("hex");

/** Constant-time comparison of two hex strings; false on any malformed input. */
export function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]*$/i.test(a) || !/^[0-9a-f]*$/i.test(b) || a.length !== b.length || a.length === 0) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");

/** Deterministic JSON (sorted keys) for request fingerprints. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}
