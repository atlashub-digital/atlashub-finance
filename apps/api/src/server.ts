import { buildApp } from "./app.js";
import { createSql } from "./db/client.js";
import { loadEnv } from "./env.js";
import { startWorkers } from "./worker.js";

const env = loadEnv();
const sql = env.DATABASE_URL ? createSql(env.DATABASE_URL) : undefined;
const app = buildApp({ env, ...(sql ? { sql } : {}) });
const stopWorkers = app.aro && env.ARO_WORKER_ENABLED ? startWorkers(app.aro) : () => {};

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  stopWorkers();
  await app.close();
  await sql?.end({ timeout: 5 });
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: env.HOST, port: env.PORT });
