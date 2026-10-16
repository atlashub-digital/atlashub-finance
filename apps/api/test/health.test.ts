import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { EnvError, loadEnv } from "../src/env.js";

const env = loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent" });

describe("GET /health", () => {
  it("returns the HealthResponse contract with db unknown when no probe", async () => {
    const app = buildApp({ env });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", service: "aro-api", version: "0.1.0", db: "unknown" });
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("reports degraded when the database probe fails", async () => {
    const app = buildApp({ env, dbProbe: async () => { throw new Error("down"); } });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.json()).toMatchObject({ status: "degraded", db: "down" });
  });

  it("returns contract Error shape on unknown routes", async () => {
    const app = buildApp({ env });
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "NOT_FOUND", request_id: expect.any(String) });
  });
});

describe("loadEnv", () => {
  it("requires DATABASE_URL in production", () => {
    expect(() => loadEnv({ NODE_ENV: "production" })).toThrow(EnvError);
  });

  it("does not echo invalid values", () => {
    try {
      loadEnv({ PORT: "not-a-port-supersecret" });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain("supersecret");
    }
  });
});
