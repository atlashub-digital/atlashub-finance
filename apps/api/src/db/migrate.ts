import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Sql } from "./client.js";

/**
 * Applies reviewed SQL files from infra/migrations in lexical order, once each,
 * recording name + checksum in aro_schema_migrations. Each file runs in its own
 * transaction. A changed checksum for an applied file aborts the run.
 *
 * Production execution is an Infrastructure action after review (CLAUDE.md);
 * the API never runs migrations on boot.
 */
export async function migrate(sql: Sql, dir: string, log: (m: string) => void = () => {}) {
  await sql`
    CREATE TABLE IF NOT EXISTS aro_schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      "appliedAt" timestamptz NOT NULL DEFAULT now()
    )`;
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Map(
    (await sql<{ name: string; checksum: string }[]>`SELECT name, checksum FROM aro_schema_migrations`).map(
      (r) => [r.name, r.checksum],
    ),
  );
  const ran: string[] = [];
  for (const file of files) {
    const body = await readFile(join(dir, file), "utf8");
    const checksum = createHash("sha256").update(body).digest("hex");
    const prior = applied.get(file);
    if (prior) {
      if (prior !== checksum) throw new Error(`Migration ${file} changed after being applied`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO aro_schema_migrations (name, checksum) VALUES (${file}, ${checksum})`;
    });
    log(`applied ${file}`);
    ran.push(file);
  }
  return ran;
}
