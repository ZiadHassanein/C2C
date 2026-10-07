# Observed application and operational constraints

- This service is already used in production. Two dealers requested a pilot;
  existing records belong to the original dealer, except 130 imported records
  whose owner mapping has not been reviewed. Public listing IDs and slugs are stable.
- A partner polls `/api/cars?since=TIMESTAMP` and depends on existing IDs, field
  names and sold-listing visibility. Staged deployment runs old/new app versions
  concurrently for up to 30 minutes. Queue messages may wait for 24 hours.
- Email worker messages currently contain `{listingId, customerEmail, message}`.
  The worker reads `seller_email` when executing. At-least-once delivery can retry.
  A recipient policy when ownership changes is undecided.
- Nightly database backups exist. The most recent restore drill was nine months
  ago; current restore feasibility, RPO/RTO and migration rollback are unverified.
- Lead retention/deletion and destructive dealer removal policies are undecided.
  Contact data must not appear in application logs or public API responses.
- Existing endpoints trust one global admin role. Dealer invitations and role
  revocation do not exist. Tenant IDs from the client are not trusted identity.
- Photo uploads accept filenames today. No remote-URL import is needed for MVP.
  Accepted formats, object ownership, byte/pixel limits and processing policy need
  definition; originals must not be exposed before validation.
- CI runs `dotnet test`; frontend tests run `npm test` under `web/`. Existing tests
  cover the public catalogue, not tenant isolation or retry idempotency. Proposed
  API changes belong under `src/Marketplace.Api/`; migration tooling must be inspected.
- Performance limits and release operator are not supplied. Do not invent them.
