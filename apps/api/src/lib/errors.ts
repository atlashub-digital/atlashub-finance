/** Error codes from openapi/aro-v1.yaml#/components/schemas/Error. */
export type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_OFFER"
  | "INVALID_PAYER"
  | "NO_PAYMENT_ROUTE"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "PAYMENT_PENDING"
  | "PAYMENT_FAILED"
  | "CHECKOUT_EXPIRED"
  | "ENTITLEMENT_NOT_READY"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class AroError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const errors = {
  invalidRequest: (m = "Invalid request") => new AroError(400, "INVALID_REQUEST", m),
  unauthorized: (m = "Authentication failed") => new AroError(401, "UNAUTHORIZED", m),
  forbidden: (m = "Not permitted") => new AroError(403, "FORBIDDEN", m),
  notFound: (m = "Not found") => new AroError(404, "NOT_FOUND", m),
};
