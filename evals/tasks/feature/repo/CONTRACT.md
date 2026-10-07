# Existing contract

- `GET /api/cars?page=2` returns an array, not an envelope. One old mobile client
  depends on that shape. `/cars?page=2` is a shareable route.
- Public availability means published cars or sold cars. Drafts are never public.
  The default remains published only. Sold-car detail pages already exist.
- Prices are USD. Product wants inclusive dollar bounds, accepting two decimal
  places. Zero is a valid lower bound. Negative, reversed, non-finite and malformed
  bounds must be rejected with a useful client error, not silently ignored.
- Existing tests cover the default published-only list and page=2. No filter
  tests exist. Test command: `npm test`; route tests live in `test/catalogue.test.ts`.
- The database has an index on `(status, createdAt, id)`. No latency objective or
  realistic data volume is supplied. Do not claim performance without measurement.
- Database library values are parameterized; do not replace them with string SQL.
- Scope is filtering only: no authentication rewrite, checkout or database rebuild.
