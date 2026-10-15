import { readFile } from "node:fs/promises";
import { applyProjectManifest, applyProviderManifest, issueApiKey, revokeApiKey } from "./admin/manifests.js";
import { createSql } from "./db/client.js";
import { replayDelivery } from "./modules/events/delivery.js";

const usage = `ARO admin (Infrastructure use; owner DATABASE_URL)
  apply-providers <manifest.json>
  apply-project   <manifest.json>
  issue-key       <project-slug> <public|server>   prints the key ONCE
  revoke-key      <key-prefix>
  replay-event    <event-id>                       re-arms project webhook delivery`;

const [cmd, a, b] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!cmd || !url) {
  console.error(usage);
  process.exit(1);
}
const sql = createSql(url, { max: 1 });
const json = async (f: string) => JSON.parse(await readFile(f, "utf8"));
try {
  switch (cmd) {
    case "apply-providers":
      await applyProviderManifest(sql, await json(a!));
      console.log("providers applied");
      break;
    case "apply-project":
      console.log(JSON.stringify(await applyProjectManifest(sql, await json(a!))));
      break;
    case "issue-key":
      if (b !== "public" && b !== "server") throw new Error("kind must be public|server");
      console.log(await issueApiKey(sql, a!, b));
      break;
    case "revoke-key":
      console.log(`revoked ${(await revokeApiKey(sql, a!)).length}`);
      break;
    case "replay-event":
      console.log(`re-armed ${(await replayDelivery({ sql }, a!)).length}`);
      break;
    default:
      console.error(usage);
      process.exitCode = 1;
  }
} finally {
  await sql.end();
}
