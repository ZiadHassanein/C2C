# Current plan before the approved change

D1. For newly created exports, expires_at = creation + 7 days; purge_after = expires_at + 24 hours. Existing export deadlines stay unchanged.
P1. Preserve owner checks and expires_at enforcement in the download and link-renewal paths.
P2. Writer records expires_at and purge_after together and includes both in queued jobs. Signed links are capped at the stored expires_at.
P3. Storage lifecycle configuration is currently a fixed delete-at-8-days rule. Reconcile objects versus stored deadlines before switching deletion rules.
P4. Acceptance: new export denies download after day 7 and is not deleted before day 8; old jobs still parse both fields; cross-owner requests fail.
P5. Rollback: switch to the old 7-day writer for future exports and keep already-stored deadlines and queue fields; do not rewrite existing records or destroy objects.
