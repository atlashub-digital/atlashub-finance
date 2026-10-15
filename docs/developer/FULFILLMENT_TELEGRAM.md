# Fulfillment Recipe — Online Course + Telegram Access

## Example business

```
Course A → R$39,90
Course B → R$49,90
Course C → R$39,90
```

Each course includes:
- protected online lessons;
- Telegram student channel/group access.

## Product catalog

```
course-a
course-b
course-c
```

## Offers

```
course-a-br → 3990 BRL
course-b-br → 4990 BRL
course-c-br → 3990 BRL
```

## Entitlements

Course A:

```
academy:course:course-a
academy:telegram:students
```

Course B:

```
academy:course:course-b
academy:telegram:students
```

Course C:

```
academy:course:course-c
academy:telegram:students
```

If the Telegram group is course-specific, use:

```
academy:telegram:course-a
academy:telegram:course-b
academy:telegram:course-c
```

## After payment

ARO performs:

```
payment APPROVED
→ order APPROVED
→ entitlements ACTIVE
→ entitlement.granted events
```

Project backend performs:

```
academy:course:course-a ACTIVE
→ unlock /courses/course-a
```

Telegram automation performs:

```
academy:telegram:students ACTIVE
→ create/resolve Telegram identity
→ generate one-time invite or approve membership
→ record fulfillment result
```

## Telegram ownership

Telegram automation is a fulfillment service, not a payment service.

It may store:
- ARO customer id;
- Telegram user id;
- invite status;
- joined_at;
- removed_at;
- entitlement key;
- last fulfillment event id.

It must not store or infer:
- provider payment truth;
- arbitrary paid=true;
- payment amount as access authority.

## Revocation

ARO event:

```
entitlement.revoked
```

Telegram automation:

```
→ remove/restrict Telegram access according to project policy
→ record result
```

Course backend:

```
→ protected route denies future access
```

## Idempotency

The Telegram worker must deduplicate ARO event id.

Receiving the same entitlement.granted twice must not create duplicate invites/actions.

## Failure model

Payment must remain APPROVED even if Telegram delivery fails.

Instead:

```
payment APPROVED
entitlement ACTIVE
fulfillment = PENDING/FAILED
```

The automation retries or creates an operational exception.

This distinction is critical:
**money truth and delivery truth are separate.**
