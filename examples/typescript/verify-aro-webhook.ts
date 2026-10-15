import { createHmac, timingSafeEqual } from "node:crypto";

export type AroProjectEvent = {
  id: string;
  type:
    | "checkout.started"
    | "payment.pending"
    | "payment.approved"
    | "payment.failed"
    | "payment.refunded"
    | "payment.chargeback"
    | "order.approved"
    | "entitlement.granted"
    | "entitlement.revoked";
  created_at: string;
  project: string;
  data: Record<string, unknown>;
};

export function verifyAroWebhook(input: {
  rawBody: string | Buffer;
  timestamp: string;
  signatureHeader: string;
  secret: string;
  toleranceSeconds?: number;
}): boolean {
  const tolerance = input.toleranceSeconds ?? 300;
  const timestampNumber = Number(input.timestamp);

  if (!Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Date.now() / 1000 - timestampNumber) > tolerance) return false;

  const raw =
    typeof input.rawBody === "string"
      ? input.rawBody
      : input.rawBody.toString("utf8");

  const expected = createHmac("sha256", input.secret)
    .update(input.timestamp + "." + raw)
    .digest("hex");

  const received = input.signatureHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("v1="))
    ?.slice(3);

  if (!received) return false;

  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(received, "hex");

  return left.length === right.length && timingSafeEqual(left, right);
}

// Framework integration requirements:
//
// 1. Read the RAW request body before JSON parsing.
// 2. Read:
//      X-ARO-Event-Id
//      X-ARO-Timestamp
//      X-ARO-Signature
// 3. Verify HMAC.
// 4. Deduplicate by X-ARO-Event-Id.
// 5. Persist/enqueue.
// 6. Return 2xx quickly.
// 7. Resolve canonical entitlement from ARO for protected access.
//
// Never unlock a paid product only because a browser redirect says "success".
