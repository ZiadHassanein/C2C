// Fictional current route. Authentication exists; project authorization is incomplete.
export async function issueUpload(req, storage) {
  const user = req.authenticatedUser;
  if (!user) throw new Error('unauthenticated');
  // projects contain { id, contributorUserIds }; lookup helper exists separately.
  return storage.signPut(req.body.projectId + '/' + req.body.filename, req.body.mime);
}
// Current public viewer serves every object under the requested project prefix.
// Storage supports quarantine and published prefixes, scoped server-issued keys,
// signed upload size limits, and a worker that validates actual bytes before promotion.
