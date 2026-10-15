# Testing & Release Gates

## Test pyramid

### Contract tests
- offer normalization
- money minor units
- routing rules
- canonical statuses
- entitlement mappings

### Provider adapter tests
- create payment
- pending
- approved
- expired/canceled
- refund where supported
- malformed response
- timeout
- duplicate callback
- provider authentication failure

### Commerce tests
- order creation
- bump
- duplicate idempotency key
- grant
- revoke
- collection multi-grant
- no grant before payment

### Security tests
- webhook invalid signature
- stale timestamp/replay
- invalid project scope
- invalid entitlement claim
- public client cannot read finance tables
- secrets absent from logs

### Browser tests
- checkout desktop/mobile
- error states
- QR and copy/paste
- pending state
- success state
- locked vs acquired reader

## Provider production proof

When no sandbox exists, controlled low-value production proof is mandatory.

Evidence:
- ARO order ID
- provider external ref
- amount/currency
- webhook/status evidence
- entitlement grant
- reconciliation
- no secret/PII exposure in stored evidence.

## Release levels

### READY_FOR_DEV
Contracts documented.

### READY_FOR_PILOT
Adapter works in controlled environment.

### READY_FOR_TRAFFIC
Real end-to-end payment + entitlement + revoke validated.

### SALES_READY
Project release explicitly approved.

## No implied release

CI green ≠ provider ready.
Provider ready ≠ SALES READY.
Merge ≠ public release.
