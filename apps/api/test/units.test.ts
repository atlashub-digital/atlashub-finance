import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseBrDocument } from "../src/lib/document.js";
import { majorToMinor, minorToMajor } from "../src/lib/money.js";
import { backoffSeconds, signProjectWebhook } from "../src/modules/events/delivery.js";
import { canTransition, orderStatusFromDb } from "../src/modules/payments/transitions.js";
import { pixgoTime } from "../src/providers/pixgo/adapter.js";
import { checkoutSecretFor, verifyCheckoutSecret, verifyOperatorToken } from "../src/security/auth.js";
import { secretEnvName } from "../src/security/secrets.js";
import { signJwt } from "./helpers/jwt.js";


describe("money (provider edge)", () => {
  it("converts without float drift and rejects sub-cent precision", () => {
    expect(minorToMajor(1190)).toBe(11.9);
    expect(majorToMinor(11.9)).toBe(1190);
    expect(majorToMinor("0.29")).toBe(29);
    expect(majorToMinor(1.12)).toBe(112);
    expect(() => majorToMinor(1.005)).toThrow();
    expect(() => majorToMinor(-1)).toThrow();
  });
});

describe("Brazilian documents", () => {
  it("validates CPF/CNPJ check digits", () => {
    expect(parseBrDocument("529.982.247-25")).toEqual({ kind: "CPF", digits: "52998224725" });
    expect(parseBrDocument("11.222.333/0001-81")).toEqual({ kind: "CNPJ", digits: "11222333000181" });
    expect(parseBrDocument("111.111.111-11")).toBeNull();
    expect(parseBrDocument("52998224724")).toBeNull();
  });
});

describe("payment state machine", () => {
  it("allows provider evidence of payment to win and blocks regressions", () => {
    expect(canTransition("PENDING", "APPROVED")).toBe(true);
    expect(canTransition("EXPIRED", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "PENDING")).toBe(false);
    expect(canTransition("APPROVED", "FAILED")).toBe(false);
    expect(canTransition("APPROVED", "REFUNDED")).toBe(true);
    expect(canTransition("REFUNDED", "APPROVED")).toBe(false);
    expect(canTransition("PENDING", "REFUNDED")).toBe(false);
  });
  it("maps commerce_order statuses to the contract enum", () => {
    expect(orderStatusFromDb("pending_payment")).toBe("PENDING");
    expect(orderStatusFromDb("fulfilled")).toBe("APPROVED");
    expect(orderStatusFromDb("cancelled")).toBe("CANCELED");
  });
});

describe("PixGo timestamps", () => {
  it("treats naive timestamps as America/Sao_Paulo", () => {
    expect(pixgoTime("2025-01-15T12:20:00")).toBe("2025-01-15T15:20:00.000Z");
    expect(pixgoTime("2026-04-14 12:15:30")).toBe("2026-04-14T15:15:30.000Z");
    expect(pixgoTime("2026-04-14T12:15:30-03:00")).toBe("2026-04-14T15:15:30.000Z");
  });
});

describe("credentials", () => {
  it("checkout secret is derived per session and verified in constant time", () => {
    const s = checkoutSecretFor("k".repeat(32), "abc");
    expect(verifyCheckoutSecret("k".repeat(32), "abc", s)).toBe(true);
    expect(verifyCheckoutSecret("k".repeat(32), "abd", s)).toBe(false);
    expect(verifyCheckoutSecret("k".repeat(32), "abc", undefined)).toBe(false);
  });

  it("operator JWT: HS256 only, expiry enforced", () => {
    const secret = "s".repeat(32);
    const exp = Math.floor(Date.now() / 1000) + 60;
    const ok = signJwt(secret, { sub: "agent:hermes", projects: ["espelhomeu"], scopes: ["revenue:read"], exp });
    expect(verifyOperatorToken(secret, ok).sub).toBe("agent:hermes");
    expect(() => verifyOperatorToken("x".repeat(32), ok)).toThrow();
    expect(() => verifyOperatorToken(secret, signJwt(secret, { sub: "a", projects: [], scopes: [], exp: 1 }))).toThrow();
    expect(() => verifyOperatorToken(secret, signJwt(secret, { sub: "a", projects: [], scopes: [], exp }, "none"))).toThrow();
  });

  it("maps secret refs to env names without exposing values", () => {
    expect(secretEnvName("aro/atlashub/pixgo/prod", "api_key")).toBe("ARO_SECRET_ARO_ATLASHUB_PIXGO_PROD__API_KEY");
  });
});

describe("outbound webhook signing", () => {
  it("matches the project verification contract (timestamp.raw_body, v1=hex)", () => {
    const body = '{"id":"e1"}';
    const { timestamp, signature } = signProjectWebhook("whsec", body, 1_792_040_470_000);
    expect(timestamp).toBe("1792040470");
    expect(signature).toBe(`v1=${createHmac("sha256", "whsec").update(`1792040470.${body}`).digest("hex")}`);
  });
  it("backs off exponentially with a cap", () => {
    expect([1, 2, 3].map(backoffSeconds)).toEqual([30, 60, 120]);
    expect(backoffSeconds(20)).toBe(6 * 3600);
  });
});
