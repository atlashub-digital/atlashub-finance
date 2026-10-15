import type { FastifyInstance } from "fastify";

export type DbProbe = () => Promise<boolean>;

export async function healthRoutes(
  app: FastifyInstance,
  opts: { version: string; dbProbe?: DbProbe },
) {
  app.get("/health", async () => {
    let db: "up" | "down" | "unknown" = "unknown";
    if (opts.dbProbe) {
      try {
        db = (await opts.dbProbe()) ? "up" : "down";
      } catch {
        db = "down";
      }
    }
    return {
      status: db === "down" ? "degraded" : "ok",
      service: "aro-api",
      version: opts.version,
      db,
    };
  });
}
