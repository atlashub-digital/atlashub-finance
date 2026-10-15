import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createSql, type Sql } from "../../src/db/client.js";
import { migrate } from "../../src/db/migrate.js";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const repo = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
export const MIGRATIONS_DIR = repo("infra/migrations");

/**
 * Creates a throwaway database containing the AtlasHub substrate fixture plus
 * all ARO migrations. Returns a pool on it and a drop function.
 */
export async function freshDatabase(): Promise<{ sql: Sql; url: string; drop: () => Promise<void> }> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL not set");
  const admin = createSql(TEST_DATABASE_URL, { max: 1 });
  const name = `aro_t_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const sql = createSql(url.toString(), { max: 5 });
  await sql.unsafe(await readFile(repo("infra/test/atlashub_substrate.sql"), "utf8"));
  await migrate(sql, MIGRATIONS_DIR);
  return {
    sql,
    url: url.toString(),
    drop: async () => {
      await sql.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
