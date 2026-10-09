// Current simplified route: one authorization check for every request.
export async function download(req, db, cache) {
  const session = await db.session(req.cookie);
  const membership = await db.membership(session.userId, req.params.tenant);
  if (!membership) return { status: 403 };
  const key = `export:${req.params.tenant}:${req.params.exportId}`;
  const hit = await cache.get(key);
  if (hit) return { status: 200, csv: hit };
  const csv = await db.exportForTenant(req.params.tenant, req.params.exportId);
  await cache.set(key, csv);
  return { status: 200, csv };
}
