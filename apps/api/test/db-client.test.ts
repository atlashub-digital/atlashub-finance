import { describe, expect, it } from "vitest";
import { createSql } from "../src/db/client.js";

describe("db client", () => {
  it("disables named prepared statements (Supabase pooler compatibility)", async () => {
    const sql = createSql("postgres://u:p@127.0.0.1:1/db", { max: 1 });
    expect(sql.options.prepare).toBe(false);
    await sql.end({ timeout: 0 });
  });
});
