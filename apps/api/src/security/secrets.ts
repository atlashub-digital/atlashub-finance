/**
 * Resolves secrets by reference. V1 backend: environment variables provisioned
 * by Infrastructure. A reference such as "aro/atlashub/pixgo/prod" with field
 * "api_key" maps to ARO_SECRET_ARO_ATLASHUB_PIXGO_PROD__API_KEY.
 *
 * Secrets never live in the database or in git; the DB stores only the ref.
 */
export type SecretResolver = (ref: string, field: string) => string | undefined;

export const secretEnvName = (ref: string, field: string) =>
  `ARO_SECRET_${ref.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}__${field.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;

export const envSecretResolver =
  (env: NodeJS.ProcessEnv = process.env): SecretResolver =>
  (ref, field) => {
    const v = env[secretEnvName(ref, field)];
    return v && v.length > 0 ? v : undefined;
  };

export class MissingSecretError extends Error {
  constructor(ref: string, field: string) {
    super(`Secret not provisioned: ${secretEnvName(ref, field)}`);
  }
}

export function requireSecret(resolve: SecretResolver, ref: string, field: string): string {
  const v = resolve(ref, field);
  if (!v) throw new MissingSecretError(ref, field);
  return v;
}
