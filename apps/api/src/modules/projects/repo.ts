import type { Db } from "../../db/client.js";
import { sha256Hex } from "../../lib/crypto.js";

export type Project = {
  projectId: string;
  tenantId: string;
  slug: string;
  allowedOrigins: string[];
  webhookUrl: string | null;
  webhookSecretRef: string | null;
  defaultMarket: string;
  defaultCurrency: string;
};

export async function findProjectByApiKey(db: Db, kind: "public" | "server", key: string) {
  const [row] = await db<Project[]>`
    SELECT c."projectId", c."tenantId", c.slug, c."allowedOrigins", c."webhookUrl",
           c."webhookSecretRef", c."defaultMarket", c."defaultCurrency"
    FROM aro_api_key k
    JOIN aro_project_config c ON c."projectId" = k."projectId"
    WHERE k."keyHash" = ${sha256Hex(key)} AND k.kind = ${kind}
      AND k."revokedAt" IS NULL AND c.status = 'active'`;
  return row;
}

export async function findProjectBySlug(db: Db, slug: string) {
  const [row] = await db<Project[]>`
    SELECT c."projectId", c."tenantId", c.slug, c."allowedOrigins", c."webhookUrl",
           c."webhookSecretRef", c."defaultMarket", c."defaultCurrency"
    FROM aro_project_config c WHERE c.slug = ${slug} AND c.status = 'active'`;
  return row;
}

export async function findProjectById(db: Db, projectId: string) {
  const [row] = await db<Project[]>`
    SELECT c."projectId", c."tenantId", c.slug, c."allowedOrigins", c."webhookUrl",
           c."webhookSecretRef", c."defaultMarket", c."defaultCurrency"
    FROM aro_project_config c WHERE c."projectId" = ${projectId}`;
  return row;
}

export async function isOriginAllowedAnywhere(db: Db, origin: string) {
  const [row] = await db`
    SELECT 1 FROM aro_project_config WHERE status = 'active' AND ${origin} = ANY("allowedOrigins") LIMIT 1`;
  return Boolean(row);
}
