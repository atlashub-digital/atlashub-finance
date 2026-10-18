import { z } from "zod";

const LogLevel = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);
const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: LogLevel.default("info"),
  ARO_VERSION: z.string().default("0.1.0"),
  DATABASE_URL: z.string().url().optional(),
  /** Public base URL of this API; provider webhook URLs are derived from it. */
  ARO_PUBLIC_BASE_URL: z.string().url().default("http://localhost:8080"),
  /** HMAC key deriving per-session checkout secrets and request fingerprints. */
  ARO_CHECKOUT_SECRET_KEY: z.string().min(32).optional(),
  /** Opt-in claim signing/authentication key; must be a registered project server key. */
  ARO_CLAIM_SERVER_KEY: z.string().min(32).optional(),
  /** HS256 key for operator (Atlas WorkForce / Hermes) tokens. */
  ARO_OPERATOR_JWT_SECRET: z.string().min(32).optional(),
  ARO_WORKER_ENABLED: bool.default(true),
  /** Checkout hospedado opt-in, sem ativação financeira no deploy do código. */
  ARO_HOSTED_CHECKOUT_ENABLED: bool.default(false),
  ARO_CHECKOUT_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(30),
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvError extends Error {}

const PRODUCTION_REQUIRED = [
  "DATABASE_URL",
  "ARO_CHECKOUT_SECRET_KEY",
  "ARO_OPERATOR_JWT_SECRET",
] as const;

/**
 * Validates process environment. Fails fast with a message that names the
 * offending keys but never echoes their values (they may be secrets).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new EnvError(`Invalid environment: ${keys.join("; ")}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production") {
    const missing = PRODUCTION_REQUIRED.filter((k) => !env[k]);
    if (missing.length) throw new EnvError(`Invalid environment: required in production: ${missing.join(", ")}`);
    if (!source.ARO_PUBLIC_BASE_URL) {
      throw new EnvError("Invalid environment: required in production: ARO_PUBLIC_BASE_URL");
    }
  }
  return env;
}
