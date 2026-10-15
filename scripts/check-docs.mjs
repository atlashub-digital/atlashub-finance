// Documentation integrity gate (ADR-018): the repo is the source of truth and
// GitBook publishes it, so published pages must not drift from the contract.
//
//  1. every relative Markdown link in README.md and docs/** resolves;
//  2. each GitBook SUMMARY.md entry exists, and every handbook page is listed;
//  3. handbook pages only name API paths, event types and error codes that
//     exist in openapi/aro-v1.yaml.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const rel = (p) => relative(root, p);
const linksOf = (text) => [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);

// 1. Relative links
const mdFiles = [join(root, "README.md"), ...walk(join(root, "docs")).filter((f) => f.endsWith(".md"))];
for (const file of mdFiles) {
  for (const link of linksOf(readFileSync(file, "utf8"))) {
    if (/^(https?:|mailto:|#)/.test(link)) continue;
    const target = resolve(dirname(file), decodeURIComponent(link.split("#")[0]));
    if (!existsSync(target)) errors.push(`${rel(file)}: broken link ${link}`);
  }
}

// 2. GitBook summaries
for (const space of ["docs", "docs/handbook"]) {
  const summary = join(root, space, "SUMMARY.md");
  const listed = new Set(linksOf(readFileSync(summary, "utf8")).map((l) => resolve(dirname(summary), l)));
  for (const p of listed) if (!existsSync(p)) errors.push(`${space}/SUMMARY.md: missing ${rel(p)}`);
  if (space === "docs/handbook") {
    for (const page of walk(join(root, space)).filter((f) => f.endsWith(".md") && !f.endsWith("SUMMARY.md"))) {
      if (!listed.has(page)) errors.push(`${rel(page)} is not in docs/handbook/SUMMARY.md`);
    }
  }
}

// 3. Handbook vs OpenAPI
const api = parse(readFileSync(join(root, "openapi/aro-v1.yaml"), "utf8"));
const norm = (p) => p.replace(/\{[^}]+\}/g, "{}").replace(/\/$/, "");
const paths = new Set(Object.keys(api.paths).map(norm));
const events = new Set(api.components.schemas.ProjectEvent.properties.type.enum);
const codes = new Set(api.components.schemas.Error.properties.error.enum);
for (const file of walk(join(root, "docs/handbook")).filter((f) => f.endsWith(".md"))) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/(?<![\w./:])(\/(?:v1\/[A-Za-z0-9_{}\/.-]+|health))/g)) {
    const p = norm(m[1].replace(/[.,)]+$/, "").replace(/\/[a-z0-9-]+-?[0-9a-f]{0,}…$/, ""));
    if (p.startsWith("/v1/") || p === "/health") {
      const candidate = p.replace(/\/\{[^}]*\}|\/[0-9a-f-]{8,}|…/g, "/{}");
      if (!paths.has(p) && !paths.has(candidate)) errors.push(`${rel(file)}: API path not in OpenAPI: ${m[1]}`);
    }
  }
  // Event names: first column of the event table, plus any `type` value in examples.
  const eventMentions = [
    ...[...text.matchAll(/^\| `([a-z]+\.[a-z_]+)` \|/gm)].map((m) => m[1]),
    ...[...text.matchAll(/"type": "([a-z]+\.[a-z_]+)"/g)].map((m) => m[1]),
  ];
  for (const e of eventMentions) {
    if (!events.has(e)) errors.push(`${rel(file)}: event type not in OpenAPI: ${e}`);
  }
  if (file.endsWith("api/errors.md")) {
    for (const m of text.matchAll(/`([A-Z][A-Z_]{4,})`/g)) {
      if (!codes.has(m[1])) errors.push(`${rel(file)}: error code not in OpenAPI: ${m[1]}`);
    }
  }
}

if (errors.length) {
  console.error(`docs:check failed (${errors.length}):\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}
console.log(`docs:check OK (${mdFiles.length} Markdown files, ${paths.size} API paths, ${events.size} events, ${codes.size} error codes)`);
