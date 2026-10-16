# Documentation & Publishing

## Rule

- **GitHub repository = technical source of truth.** Contracts, schemas, code and docs change only through reviewed pull requests.
- **GitBook = publication and communication layer.** It mirrors the repository via Git Sync; nobody edits contracts in GitBook.
- **No hand-copied contracts.** Pages link to `openapi/aro-v1.yaml` and `schemas/project-commerce-manifest.schema.json` instead of duplicating them. CI (`npm run docs:check`) fails if a page names an API path, event type or error code that is not in the OpenAPI, or if a link/SUMMARY entry is broken.

## Spaces

| GitBook space | Repository directory | Audience | Visibility |
|---|---|---|---|
| ARO Developer Handbook | `docs/handbook/` (`.gitbook.yaml`, `SUMMARY.md`) | project developers, partners, ARO operations | can be published |
| ARO Engineering (internal) | `docs/` (`docs/.gitbook.yaml`, `docs/SUMMARY.md`) | AtlasHub engineering and infrastructure | internal only |

## Current GitBook setup

- Organization **AtlasHub** with two sites, both **unpublished** until approved:
  - **ARO Developer Handbook** (visibility: public once published) — space "ARO Developer Handbook";
  - **ARO Engineering (internal)** (visibility: share-link) — space "ARO Engineering (internal)".
- OpenAPI spec **`aro-v1`** in the organization, sourced from `https://raw.githubusercontent.com/atlashub-digital/atlashub-finance/main/openapi/aro-v1.yaml`. Pages embed it with `{% openapi-operation spec="aro-v1" … %}` blocks; when the file changes on `main`, refresh the spec from the GitBook OpenAPI settings (or re-run the spec update via the GitBook API).

## Setting up Git Sync (one-time, GitBook admin)

1. In each space, enable **GitHub Sync** with `atlashub-digital/atlashub-finance`.
2. Choose the branch to publish (`main` after the V1 merge).
3. Set the **project directory**: `docs/handbook` for the handbook space, `docs` for the engineering space.
4. Sync direction: **GitHub → GitBook**. Edits made in GitBook must come back as pull requests.
5. In the handbook's API Reference page, add an OpenAPI block pointing to the raw `openapi/aro-v1.yaml` URL on the published branch.

## Changing documentation

1. Edit Markdown in the repository; run `npm run docs:check`.
2. If behavior or contract changes: update the OpenAPI/schema first, then the pages.
3. Merge → GitBook updates automatically.
