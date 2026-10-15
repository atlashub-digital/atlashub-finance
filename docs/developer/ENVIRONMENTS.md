# ARO Environments

## Goal

Keep development, preview/staging and production clearly separated.

## Recommended matrix

| Environment | Project app | ARO | Provider | Purpose |
|---|---|---|---|---|
| local/dev | local/cloud dev | ARO dev/mock | mocked/test where available | coding/tests |
| preview | Vercel preview or project staging | ARO staging/controlled | controlled | integration smoke |
| production | production domain | ARO production | production providers | real sales |

## Project variables

### Development / Preview

```
ARO_API_URL=<dev-or-staging-url>
ARO_PROJECT_SLUG=<project>
ARO_PUBLIC_KEY=<non-production-key>
ARO_SERVER_KEY=<non-production-secret>
ARO_WEBHOOK_SECRET=<non-production-secret>
```

### Production

Same variable names, production values supplied by infrastructure.

## Secrets boundary

Frontend/browser:
- only project-scoped public checkout credential where allowed.

Server only:
- ARO_SERVER_KEY;
- ARO_WEBHOOK_SECRET.

ARO runtime only:
- provider credentials;
- provider webhook secrets;
- DB privileged credentials;
- signing/encryption keys.

## Branch rule

A project branch/PR may prepare ARO integration before production ARO is live.

Use mocks/contract tests until a controlled ARO endpoint is available.

Do not block content development waiting for provider secrets.

## Deployment rule

Changing a project from staging to production should primarily be an environment/configuration change, not a rewrite of payment code.
