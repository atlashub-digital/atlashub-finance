# ARO Project Acceptance Checklist

## Contract

- [ ] Project uses ARO API, not provider API.
- [ ] Offer code exists in ARO.
- [ ] Entitlement mapping is explicit.
- [ ] Money uses integer minor units + ISO currency.
- [ ] Project states use normalized ARO states.

## Checkout

- [ ] Create checkout succeeds.
- [ ] Idempotency key is sent.
- [ ] Payment instruction renders.
- [ ] PENDING state renders.
- [ ] APPROVED state renders.
- [ ] Failure/expiry state renders safely.
- [ ] Provider name is not required by business logic.

## Webhook

- [ ] Raw body is available for verification.
- [ ] X-ARO-Timestamp verified.
- [ ] X-ARO-Signature HMAC verified.
- [ ] Constant-time comparison used.
- [ ] Event ID deduplicated.
- [ ] Handler returns 2xx quickly.
- [ ] Duplicate event is harmless.

## Entitlement

- [ ] Protected route resolves entitlement server-side.
- [ ] ACTIVE allows access.
- [ ] missing/revoked/expired denies access.
- [ ] purchase recovery path exists or is planned.
- [ ] bundle grants all intended rights.

## Security

- [ ] No provider secrets in project repo.
- [ ] No ARO server key in browser.
- [ ] No payer tax/document data in logs.
- [ ] No raw provider payload exposed to frontend.
- [ ] Production secrets are infrastructure-managed.

## Release

- [ ] controlled payment PASS;
- [ ] order APPROVED;
- [ ] entitlement ACTIVE;
- [ ] protected content opens;
- [ ] duplicate event PASS;
- [ ] refund/revoke PASS where applicable;
- [ ] rollback path known.

## Result

When every applicable item passes, the project may be marked:

```
ARO INTEGRATION READY
```

Production sales still require the project's normal release approval.
