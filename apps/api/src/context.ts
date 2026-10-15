import type { FastifyBaseLogger } from "fastify";
import type { Sql } from "./db/client.js";
import type { Env } from "./env.js";
import type { ProviderRegistry } from "./providers/registry.js";
import type { SecretResolver } from "./security/secrets.js";

/** Runtime dependencies shared by routes, services and workers. */
export type AroContext = {
  sql: Sql;
  env: Env;
  providers: ProviderRegistry;
  secrets: SecretResolver;
  log: FastifyBaseLogger;
  /** Keys resolved at boot (env, or ephemeral in dev/test). */
  keys: { checkoutSecret: string; operatorJwt: string };
  /** Outbound HTTP for project webhooks (injectable for tests). */
  fetch: typeof fetch;
};
