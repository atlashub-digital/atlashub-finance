import { z } from "zod";

const LogLevel = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: LogLevel.default("info"),
  ARO_VERSION: z.string().default("0.1.0"),
  DATABASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvError extends Error {}

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
  if (env.NODE_ENV === "production" && !env.DATABASE_URL) {
    throw new EnvError("Invalid environment: DATABASE_URL: required in production");
  }
  return env;
}
