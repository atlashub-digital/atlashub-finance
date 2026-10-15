# ARO Project Handoff Template

Copy this file into the implementation issue/PR for each project.

## Project

```yaml
project:
  slug:
  name:
  repository:
  production_url:
  preview_url:
```

## Product type

Select all that apply:

- [ ] eBook / Reader
- [ ] Video course
- [ ] Community / group
- [ ] Membership
- [ ] Download
- [ ] Bundle
- [ ] Other

## Offers

```yaml
offers:
  - code:
    product:
    market:
    currency:
    amount_minor:
    cadence: once
    entitlements:
      -
```

## Integration

```yaml
aro:
  api_url_env: ARO_API_URL
  project_slug_env: ARO_PROJECT_SLUG
  public_key_env: ARO_PUBLIC_KEY
  server_key_env: ARO_SERVER_KEY
  webhook_secret_env: ARO_WEBHOOK_SECRET
  webhook_path: /api/aro/webhook
```

## Protected surfaces

List routes/features that require entitlement:

```
/reader/...
/course/...
/members/...
```

## Events consumed

Select:

- [ ] payment.approved
- [ ] payment.refunded
- [ ] payment.chargeback
- [ ] order.approved
- [ ] entitlement.granted
- [ ] entitlement.revoked

## Acceptance

Use `ACCEPTANCE_CHECKLIST.md`.

## Engineering instruction

Implement only against:
- ARO OpenAPI V1;
- Developer Integration Kit;
- released ARO client/example code.

Do not add provider-specific payment code to this project.
