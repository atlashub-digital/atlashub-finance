import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "../src/db/client.js";
import { migrate } from "../src/db/migrate.js";
import { MIGRATIONS_DIR, TEST_DATABASE_URL, freshDatabase } from "./helpers/db.js";

describe.skipIf(!TEST_DATABASE_URL)("ARO additive migration on AtlasHub substrate", () => {
  let sql: Sql;
  let drop: () => Promise<void>;
  beforeAll(async () => ({ sql, drop } = await freshDatabase()));
  afterAll(async () => drop?.());

  it("is idempotent on re-run", async () => {
    expect(await migrate(sql, MIGRATIONS_DIR)).toEqual([]);
  });

  it("keeps pre-existing rows valid (widened checks only)", async () => {
    await sql`INSERT INTO "Tenant" (id, slug, name) VALUES ('t1','t1','T1')`;
    await sql`INSERT INTO commerce_order (id, "tenantId", currency, "totalMinor") VALUES ('o1','t1','BRL',100)`;
    await sql`UPDATE commerce_order SET status = 'refunded' WHERE id = 'o1'`;
    await expect(sql`UPDATE commerce_order SET status = 'bogus' WHERE id = 'o1'`).rejects.toThrow();
  });

  it("enables RLS on every aro_ table with no anon/authenticated policy", async () => {
    const rows = await sql<{ relname: string; rls: boolean }[]>`
      SELECT relname, relrowsecurity AS rls FROM pg_class
      WHERE relkind = 'r' AND relname LIKE 'aro\\_%' AND relname <> 'aro_schema_migrations'`;
    expect(rows.length).toBe(11);
    expect(rows.every((r) => r.rls)).toBe(true);
    const policies = await sql<{ roles: string }[]>`
      SELECT roles::text AS roles FROM pg_policies WHERE tablename LIKE 'aro\\_%'`;
    expect(policies.every((p) => p.roles === "{aro_runtime}")).toBe(true);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("rollback script", () => {
  it("reverts cleanly on an empty ARO data plane and re-applies", async () => {
    const { readFile } = await import("node:fs/promises");
    const { sql, drop } = await freshDatabase();
    try {
      const conn = await sql.reserve();
      await conn.unsafe(
        await readFile(`${MIGRATIONS_DIR}/rollback/202610150001_aro_v1_additive.down.sql`, "utf8"),
      );
      conn.release();
      const [row] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_class WHERE relkind = 'r' AND relname LIKE 'aro\\_%' AND relname <> 'aro_schema_migrations'`;
      expect(row?.n).toBe(0);
      expect(await migrate(sql, MIGRATIONS_DIR)).toHaveLength(1);
    } finally {
      await drop();
    }
  });
});
