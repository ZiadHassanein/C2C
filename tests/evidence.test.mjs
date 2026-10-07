import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { EVIDENCE_LIMITS, evidencePath, validateEvidenceRequests, createEvidenceRecord, validateEvidenceLedger, evidenceForStage } from '../scripts/evidence.mjs';

const tempParent = fs.realpathSync(os.tmpdir());
const testRoot = fs.mkdtempSync(path.join(tempParent, 'c2c-evidence-test-'));
after(() => {
  const resolved = fs.realpathSync(testRoot);
  assert.equal(path.dirname(resolved), tempParent);
  assert.ok(path.basename(resolved).startsWith('c2c-evidence-test-'));
  fs.rmSync(resolved, { recursive: true, force: true });
});
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const scanner = value => { assert.equal(typeof value, 'string'); if (value.includes('FIXTURE_CREDENTIAL')) throw new Error('Possible credential in outbound content'); };
const request = (n = 1) => ({ id: `P-D-E${n}`, question: 'What is the current export interface?', path: 'src/export.js' });
function fixture(label) {
  const project = fs.mkdtempSync(path.join(testRoot, `${label}-`));
  fs.mkdirSync(path.join(project, 'src'));
  fs.writeFileSync(path.join(project, 'src/export.js'), 'export const encode = value => JSON.stringify(value);\n');
  return project;
}
function options(project, n = 1, extra = {}) {
  return { project, request: request(n), request_source: { stage: 'draft', report_sha256: sha('sealed fixture report') }, status: 'supplied', file: 'src/export.js', reason: 'Supplied the requested interface from the local repository.', ...extra };
}
const create = (project, n = 1, extra = {}, prior = []) => createEvidenceRecord(options(project, n, extra), prior, scanner);

test('evidence requests are optional, bounded, and use stage-specific IDs', () => {
  assert.deepEqual(validateEvidenceRequests(), []);
  assert.deepEqual(validateEvidenceRequests([request()], 'P-D'), [request()]);
  assert.doesNotThrow(() => validateEvidenceRequests([{ ...request(), path: '' }]));
  for (const id of ['P-D1', 'P-D-E0', 'P-D-E01', 'P-R-E1']) assert.throws(() => validateEvidenceRequests([{ ...request(), id }], 'P-D'));
  assert.throws(() => validateEvidenceRequests([request(), request()]), /Duplicate/);
  assert.throws(() => validateEvidenceRequests(Array.from({ length: 11 }, (_, i) => request(i + 1))), /at most 10/);
  assert.throws(() => validateEvidenceRequests([{ ...request(), unexpected: true }]), /fields/);
  assert.throws(() => validateEvidenceRequests([{ ...request(), question: ' ' }]), /nonempty/);
});

test('portable paths reject absolute paths, traversal, alternate streams, and ambiguous components', () => {
  assert.equal(evidencePath('src\\export.js'), 'src/export.js');
  for (const value of ['/etc/passwd', 'C:\\Users\\private', '\\\\host\\share', '../secret', 'src/../secret', './src', 'src//file', 'src/file:stream', 'src\0/file', 'src/ file']) assert.throws(() => evidencePath(value));
  assert.throws(() => evidencePath(''));
  assert.equal(evidencePath('', { empty: true }), '');
});

test('supplied evidence records exact selected content and declared provenance without host path metadata', () => {
  const project = fixture('provenance');
  const source = options(project, 1, { label: 'reviewed/export-interface.js', source_revision: 'abc1234 (working tree)' });
  const record = createEvidenceRecord(source, [], scanner);
  assert.deepEqual(validateEvidenceLedger([record]), { records: 1, files: 1, bytes: 54, sha256: record.sha256 });
  assert.equal(record.evidence.content, fs.readFileSync(path.join(project, 'src/export.js'), 'utf8'));
  assert.equal(record.evidence.sha256, sha(record.evidence.content));
  assert.equal(record.evidence.path, 'reviewed/export-interface.js');
  assert.equal(record.evidence.source_revision, 'abc1234 (working tree)');
  assert.equal(record.previous_sha256, null);
  assert.equal(JSON.stringify(record).includes(project), false);
  source.request.question = 'Changed external object';
  source.request_source.stage = 'Changed external object';
  assert.equal(record.request.question, request().question);
  assert.equal(record.request_source.stage, 'draft');
});

test('source revisions are explicit unknown when absent, never invented', () => {
  assert.match(create(fixture('unknown')).evidence.source_revision, /unknown/);
});

test('ledger preserves prior facts after source changes and forbids resolving the same request again', () => {
  const project = fixture('chain');
  const first = create(project);
  const preserved = JSON.stringify(first);
  fs.writeFileSync(path.join(project, 'src/export.js'), 'export const encode = () => "new revision";');
  const second = create(project, 2, {}, [first]);
  assert.equal(second.previous_sha256, first.sha256);
  assert.equal(second.sequence, 2);
  assert.notEqual(first.evidence.sha256, second.evidence.sha256);
  assert.equal(JSON.stringify(first), preserved);
  assert.throws(() => create(project, 1, {}, [first]), /already resolved/);
  assert.throws(() => validateEvidenceLedger([second, first]), /sequence/);
  const corrupt = structuredClone(second); corrupt.evidence.content += 'edited';
  assert.throws(() => validateEvidenceLedger([first, corrupt]), /content hash/);
  const rewrittenReason = structuredClone(first); rewrittenReason.reason = 'A silently rewritten justification';
  assert.throws(() => validateEvidenceLedger([rewrittenReason]), /record hash/);
  const wrongReport = structuredClone(first); wrongReport.request_source.report_sha256 = 'bad';
  assert.throws(() => validateEvidenceLedger([wrongReport]), /report digest/);
});

test('unavailable and rejected requests preserve an explicit rationale without reading a file', () => {
  let records = [];
  for (const [index, status] of ['unavailable', 'rejected'].entries()) {
    const record = createEvidenceRecord({ request: request(index + 1), request_source: { stage: 'draft', report_sha256: sha('report') }, status, reason: status === 'unavailable' ? 'No such interface exists in this project.' : 'The requested data is outside the authorized scope.' }, records, scanner);
    assert.equal(record.evidence, null);
    records.push(record);
  }
  assert.equal(validateEvidenceLedger(records).files, 0);
  assert.throws(() => create(fixture('refuse-file'), 1, { status: 'rejected' }), /Only supplied/);
  assert.throws(() => create(fixture('reason'), 1, { reason: 'no' }), /12 characters/);
});

test('drafts remain blind; independent review receives facts without request arguments; verification sees resolutions', () => {
  const first = create(fixture('stages'));
  const records = [first];
  for (const stage of ['draft', 'author-draft']) assert.deepEqual(evidenceForStage(records, stage), []);
  for (const stage of ['review', 'author-review']) {
    const facts = evidenceForStage(records, stage);
    assert.deepEqual(facts, [first.evidence]);
    assert.equal(JSON.stringify(facts).includes(first.request.question), false);
    assert.equal(JSON.stringify(facts).includes(first.reason), false);
    facts[0].content = 'mutated packet';
    assert.notEqual(first.evidence.content, 'mutated packet');
  }
  for (const stage of ['verify', 'verify-final']) assert.equal(evidenceForStage(records, stage)[0].request.id, first.request.id);
  assert.throws(() => evidenceForStage(records, 'unknown'), /Unknown evidence stage/);
});

test('outbound secret scanner is mandatory and scans both metadata and contents', () => {
  const project = fixture('secrets');
  assert.throws(() => createEvidenceRecord(options(project)), /secret scanner/);
  assert.throws(() => create(project, 1, { reason: 'Do not publish FIXTURE_CREDENTIAL in a rationale.' }), /credential/);
  assert.throws(() => create(project, 1, { request: { ...request(), question: 'Find FIXTURE_CREDENTIAL please' } }), /credential/);
  fs.writeFileSync(path.join(project, 'FIXTURE_CREDENTIAL.txt'), 'ordinary source');
  assert.throws(() => create(project, 1, { file: 'FIXTURE_CREDENTIAL.txt' }), /credential/);
  fs.writeFileSync(path.join(project, 'src/export.js'), 'FIXTURE_CREDENTIAL');
  assert.throws(() => create(project), /credential/);
});

test('binary, invalid UTF-8, credential-like paths, directories, and oversized files are rejected', () => {
  const project = fixture('inputs');
  for (const [name, bytes, pattern] of [
    ['zero.txt', Buffer.from([65, 0, 66]), /Binary/],
    ['invalid.txt', Buffer.from([0xc3, 0x28]), /encoded data/],
    ['.env.local', Buffer.from('safe looking text'), /Credential-like/],
    ['key.pem', Buffer.from('safe looking text'), /Credential-like/],
    ['large.txt', Buffer.alloc(EVIDENCE_LIMITS.file_bytes + 1, 65), /no larger/],
  ]) {
    fs.writeFileSync(path.join(project, name), bytes);
    assert.throws(() => create(project, 1, { file: name }), pattern);
  }
  assert.throws(() => create(project, 1, { file: 'src' }), /regular file/);
});

test('a directory symlink or junction cannot expose files outside the project', () => {
  const project = fixture('symlink');
  const outside = fixture('outside');
  fs.symlinkSync(outside, path.join(project, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => create(project, 1, { file: 'linked/src/export.js' }), /outside the project/);
});

test('the real target of an in-project symlink is checked for credential-like names', () => {
  const project = fixture('credential-link');
  fs.mkdirSync(path.join(project, '.git'));
  fs.writeFileSync(path.join(project, '.git/config'), 'repository configuration');
  fs.symlinkSync(path.join(project, '.git'), path.join(project, 'configuration'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => create(project, 1, { file: 'configuration/config' }), /Credential-like/);
});

test('supplemental byte and file limits are cumulative and include repeat retrievals', () => {
  const project = fixture('caps');
  fs.writeFileSync(path.join(project, 'src/export.js'), 'x'.repeat(60000));
  const first = create(project), second = create(project, 2, {}, [first]);
  assert.equal(validateEvidenceLedger([first, second]).bytes, EVIDENCE_LIMITS.bytes);
  fs.writeFileSync(path.join(project, 'src/export.js'), 'x');
  assert.throws(() => create(project, 3, {}, [first, second]), /Supplemental evidence exceeds/);
  const records = [];
  for (let n = 1; n <= EVIDENCE_LIMITS.files; n++) records.push(create(project, n, {}, records));
  assert.throws(() => create(project, EVIDENCE_LIMITS.files + 1, {}, records), /Supplemental evidence exceeds/);
});

test('resolution count is bounded even when no file was disclosed', () => {
  const records = [];
  for (let n = 1; n <= EVIDENCE_LIMITS.records; n++) records.push(createEvidenceRecord({ request: request(n), request_source: { stage: 'review', report_sha256: sha('report') }, status: 'unavailable', reason: 'Requested evidence does not exist in this repository.' }, records, scanner));
  assert.throws(() => createEvidenceRecord({ request: request(51), request_source: { stage: 'review', report_sha256: sha('report') }, status: 'unavailable', reason: 'Requested evidence does not exist in this repository.' }, records, scanner), /at most 50/);
});
