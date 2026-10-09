// Bounded, coordinator-approved supplemental facts. No provider calls or writes.
// The caller owns locking, sealed artifact publication and original-context caps.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const EVIDENCE_LIMITS = Object.freeze({ requests_per_report: 10, records: 50, files: 20, bytes: 120000, file_bytes: 60000 });
export const EVIDENCE_REQUEST_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['id', 'question', 'path'],
  properties: { id: { type: 'string' }, question: { type: 'string' }, path: { type: 'string' } },
};
const required = (ok, message) => { if (!ok) throw new Error(message); };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value, label, max = 2000) => required(typeof value === 'string' && value.trim() && value.length <= max && !value.includes('\0'), `${label} must be nonempty bounded text`);
const fields = (value, names, label) => required(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name)), `Invalid ${label} fields`);
const stable = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const recordHash = record => { const { sha256, ...body } = record; return hash(JSON.stringify(stable(body))); };

/** Normalize a portable repository-relative path; do not accept traversal or ADS. */
export function evidencePath(value, { empty = false } = {}) {
  required(typeof value === 'string' && value.length <= 1000, 'Evidence path must be bounded text');
  if (empty && value === '') return '';
  const normalized = value.replaceAll('\\', '/');
  required(normalized && !/^[\/]|[:\x00-\x1f\x7f]/.test(normalized), 'Evidence path must be repository-relative');
  required(normalized.split('/').every(part => part && part !== '.' && part !== '..' && part.trim() === part), 'Evidence path cannot contain traversal or empty components');
  return normalized;
}

// Requests are descriptive hints, never file selectors. Accept common citation
// formatting while preserving the exact report value for sealing and matching.
// Actual supplied file/label paths continue to use strict evidencePath above.
function validateRequestPath(value) {
  required(typeof value === 'string' && value.length <= 1000, 'Evidence path must be bounded text');
  if (value === '') return;
  let candidate = value.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '');
  // Reject drive-relative forms before interpreting a numeric suffix as a line.
  required(!/^[a-z]:/i.test(candidate), 'Evidence path must be repository-relative');
  const line = candidate.match(/:([1-9][0-9]*)$/);
  if (line) {
    required(Number.isSafeInteger(Number(line[1])), 'Evidence line number must be a positive safe integer');
    candidate = candidate.slice(0, -line[0].length);
  }
  evidencePath(candidate.replace(/\/$/, ''));
}

/** Optional report field, with a separate ID namespace from findings. */
export function validateEvidenceRequests(requests = [], findingPrefix) {
  required(Array.isArray(requests) && requests.length <= EVIDENCE_LIMITS.requests_per_report, `Provide at most ${EVIDENCE_LIMITS.requests_per_report} evidence requests per report`);
  if (findingPrefix !== undefined) required(/^[CP]-[DRVSF]$/.test(findingPrefix), 'Invalid evidence request prefix');
  const ids = new Set();
  for (const request of requests) {
    fields(request, ['id', 'question', 'path'], 'evidence request');
    required(typeof request.id === 'string' && /^[CP]-[DRVSF]-E[1-9][0-9]*$/.test(request.id), 'Evidence request ID must use a stage prefix and -E followed by a positive integer');
    if (findingPrefix) required(request.id.startsWith(`${findingPrefix}-E`), `Evidence request ID must start with ${findingPrefix}-E`);
    required(!ids.has(request.id), `Duplicate evidence request ID: ${request.id}`);
    ids.add(request.id);
    text(request.question, 'Evidence question');
    validateRequestPath(request.path);
  }
  return requests;
}

function rejectCredentialPath(value) {
  required(!value.replaceAll('\\', '/').split('/').some(part => /^(?:\.git|\.env(?:\..*)?|auth\.json|credentials(?:\..*)?|id_(?:rsa|ed25519))$|\.(?:pem|p12|pfx|key)$/i.test(part)), 'Credential-like evidence input is not allowed');
}
function inside(project, target) {
  const relative = path.relative(project, target);
  return relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}
function readEvidence(project, file, label, sourceRevision, checkSecrets) {
  const root = fs.realpathSync(path.resolve(project));
  required(fs.statSync(root).isDirectory(), 'Evidence project must be a directory');
  const relative = evidencePath(file);
  rejectCredentialPath(relative);
  const real = fs.realpathSync(path.join(root, ...relative.split('/')));
  required(inside(root, real), 'Evidence file resolves outside the project');
  rejectCredentialPath(path.relative(root, real));
  const before = fs.statSync(real);
  required(before.isFile() && before.size <= EVIDENCE_LIMITS.file_bytes, `Evidence must be a regular file no larger than ${EVIDENCE_LIMITS.file_bytes} bytes`);
  const fd = fs.openSync(real, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  let bytes;
  try {
    const opened = fs.fstatSync(fd);
    required(opened.isFile() && opened.dev === before.dev && opened.ino === before.ino && fs.realpathSync(path.join(root, ...relative.split('/'))) === real, 'Evidence source changed during selection');
    // Bound allocation/read even if a file grows after stat.
    const buffer = Buffer.alloc(EVIDENCE_LIMITS.file_bytes + 1);
    let size = 0, n;
    while (size < buffer.length && (n = fs.readSync(fd, buffer, size, buffer.length - size, null)) > 0) size += n;
    required(size <= EVIDENCE_LIMITS.file_bytes, 'Evidence file exceeds the per-file byte limit');
    bytes = buffer.subarray(0, size);
  } finally { fs.closeSync(fd); }
  required(!bytes.includes(0), 'Binary evidence is unsupported');
  const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  checkSecrets(content);
  const publicPath = evidencePath(label ?? relative);
  rejectCredentialPath(publicPath);
  checkSecrets(publicPath);
  return { path: publicPath, sha256: hash(content), bytes: Buffer.byteLength(content), content, source_revision: sourceRevision };
}

/** Verify the entire ordered chain. Checksums detect damage, not malicious resealing. */
export function validateEvidenceLedger(records = []) {
  required(Array.isArray(records) && records.length <= EVIDENCE_LIMITS.records, `Evidence ledger allows at most ${EVIDENCE_LIMITS.records} resolutions`);
  const seen = new Set();
  let previous = null, files = 0, bytes = 0;
  for (const [index, record] of records.entries()) {
    fields(record, ['version', 'sequence', 'previous_sha256', 'created_at', 'request', 'request_source', 'status', 'reason', 'evidence', 'sha256'], 'evidence record');
    required(record.version === 1 && record.sequence === index + 1 && record.previous_sha256 === previous, 'Evidence ledger sequence or previous hash is invalid');
    required(typeof record.created_at === 'string' && Number.isFinite(Date.parse(record.created_at)), 'Evidence timestamp is invalid');
    validateEvidenceRequests([record.request]);
    required(!seen.has(record.request.id), `Evidence request already resolved: ${record.request.id}`);
    seen.add(record.request.id);
    fields(record.request_source, ['stage', 'report_sha256'], 'evidence request source');
    text(record.request_source.stage, 'Evidence source stage', 100);
    required(digest(record.request_source.report_sha256), 'Evidence source requires a SHA-256 report digest');
    required(['supplied', 'unavailable', 'rejected'].includes(record.status), 'Evidence resolution must be supplied, unavailable, or rejected');
    text(record.reason, 'Evidence resolution reason');
    required(record.reason.trim().length >= 12, 'Explain the evidence resolution in at least 12 characters');
    if (record.status === 'supplied') {
      fields(record.evidence, ['path', 'sha256', 'bytes', 'content', 'source_revision'], 'supplied evidence');
      const evidence = record.evidence;
      evidencePath(evidence.path); rejectCredentialPath(evidence.path);
      required(typeof evidence.content === 'string' && !evidence.content.includes('\0'), 'Supplied evidence must be text');
      required(digest(evidence.sha256) && hash(evidence.content) === evidence.sha256, 'Evidence content hash is invalid');
      required(evidence.bytes === Buffer.byteLength(evidence.content) && evidence.bytes <= EVIDENCE_LIMITS.file_bytes, 'Evidence byte count is invalid');
      text(evidence.source_revision, 'Evidence source revision', 200);
      files++; bytes += evidence.bytes;
    } else required(record.evidence === null, 'Unsupplied evidence cannot contain source content');
    required(digest(record.sha256) && recordHash(record) === record.sha256, 'Evidence record hash is invalid');
    previous = record.sha256;
  }
  required(files <= EVIDENCE_LIMITS.files && bytes <= EVIDENCE_LIMITS.bytes, `Supplemental evidence exceeds ${EVIDENCE_LIMITS.files} files or ${EVIDENCE_LIMITS.bytes} bytes`);
  return { records: records.length, files, bytes, sha256: previous };
}

/**
 * Create one terminal resolution without changing any existing object or file.
 * request_source is verified against a completed sealed report by the caller.
 * source_revision is coordinator-declared provenance, not an inferred Git state.
 * checkSecrets is the caller's mandatory outbound-content scanner.
 */
export function createEvidenceRecord(options, previousRecords = [], checkSecrets) {
  required(typeof checkSecrets === 'function', 'Evidence creation requires the outbound secret scanner');
  const prior = validateEvidenceLedger(previousRecords);
  validateEvidenceRequests([options.request]);
  const status = options.status;
  required(['supplied', 'unavailable', 'rejected'].includes(status), 'Evidence resolution must be supplied, unavailable, or rejected');
  required(status === 'supplied' ? typeof options.file === 'string' && options.file : options.file === undefined && options.label === undefined && options.source_revision === undefined, 'Only supplied evidence accepts a file, label, or source revision');
  const sourceRevision = options.source_revision ?? 'unknown (coordinator did not provide a revision)';
  text(sourceRevision, 'Evidence source revision', 200);
  // Scan public metadata as well as source contents; do not silently redact facts.
  checkSecrets(JSON.stringify({ request: options.request, request_source: options.request_source, reason: options.reason, label: options.label, source_revision: sourceRevision }));
  const record = {
    version: 1, sequence: prior.records + 1, previous_sha256: prior.sha256,
    created_at: new Date().toISOString(), request: structuredClone(options.request),
    request_source: structuredClone(options.request_source), status, reason: options.reason,
    evidence: status === 'supplied' ? readEvidence(options.project, options.file, options.label, sourceRevision, checkSecrets) : null,
  };
  record.sha256 = recordHash(record);
  validateEvidenceLedger([...previousRecords, record]);
  return record;
}

/**
 * Drafts receive none. Independent reviews see only facts, never another review's
 * question/rationale. Verification sees the complete public resolution record.
 */
export function evidenceForStage(records, stage) {
  validateEvidenceLedger(records);
  required(['author-draft', 'draft', 'author-review', 'review', 'verify', 'verify-final'].includes(stage), 'Unknown evidence stage');
  if (stage === 'author-draft' || stage === 'draft') return [];
  if (stage === 'author-review' || stage === 'review') return records.filter(record => record.status === 'supplied').map(record => structuredClone(record.evidence));
  return records.map(({ request, status, reason, evidence }) => structuredClone({ request, status, reason, evidence }));
}
