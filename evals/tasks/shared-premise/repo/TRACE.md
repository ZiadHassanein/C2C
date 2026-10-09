# Raw fixture observations and product invariant

Accounts: U1 is a member of tenant T1 only; U2 is a member of tenant T2 only. E9 belongs to T1. Cache entries are reused across authenticated users of a tenant and contain private CSV bytes. The HTTP download route is the only membership gate; the cache service does not authorize users.
Trace A: U1 /T1/E9 -> membership true; cache MISS; export query T1/E9; response 200.
Trace B: U2 /T1/E9 -> membership false; response 403; cache not read.
Trace C: U1 /T1/E9 -> membership true; cache HIT; response 200.
A revoked member must be denied on the next request, including an existing cache hit. No latency measurement is supplied. An export may be cached only within its owning tenant. Cache hit optimization must preserve per-request membership checks.
