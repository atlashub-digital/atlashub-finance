import { fileURLToPath } from "node:url";
import { createSql } from "./db/client.js";
import { migrate } from "./db/migrate.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const dir =
  process.env.ARO_MIGRATIONS_DIR ?? fileURLToPath(new URL("../../../infra/migrations", import.meta.url));
const sql = createSql(url, { max: 1 });
try {
  const ran = await migrate(sql, dir, (m) => console.log(m));
  console.log(ran.length ? `done (${ran.length} applied)` : "up to date");
} finally {
  await sql.end();
}
