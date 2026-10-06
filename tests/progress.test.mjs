import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readPeerProgress } from '../scripts/progress.mjs';

const parent = fs.realpathSync(os.tmpdir());
const root = fs.mkdtempSync(path.join(parent, 'council-progress-tests-'));
after(() => {
  const resolved = fs.realpathSync(root);
  assert.equal(path.dirname(resolved), parent);
  assert.ok(path.basename(resolved).startsWith('council-progress-tests-'));
  fs.rmSync(resolved, { recursive: true, force: true });
});
const began = Date.parse('2026-01-01T00:00:00.000Z');
const secret = 'PRIVATE_PROVIDER_CONTENT_DO_NOT_COPY';
function fixture(name, overrides = {}) {
  const dir = path.join(root, name); fs.mkdirSync(dir);
  const state = { peer: 'claude', attempts: [{ number: 1, stage: 'draft', status: 'running', started_at: new Date(began).toISOString(), timeout_ms: 300000, ...overrides }], stages: {} };
  return { dir, state };
}
function log(f, entries, file = 'stdout', number = 1) {
  const filename = path.join(f.dir, `attempt-${number}-${file}.txt`);
  fs.writeFileSync(filename, typeof entries === 'string' ? entries : entries.map(entry => JSON.stringify(entry)).join('\n'));
  fs.utimesSync(filename, (began + 1000) / 1000, (began + 1000) / 1000);
  return filename;
}

test('missing logs and attempts produce honest waiting diagnostics without creating files', () => {
  const f = fixture('missing');
  assert.equal(readPeerProgress(f.dir, { attempts: [] }), null);
  const status = readPeerProgress(f.dir, f.state, began + 5000);
  assert.equal(status.phase, 'waiting_for_output');
  assert.equal(status.elapsed_ms, 5000);
  assert.equal(status.remaining_ms, 295000);
  assert.equal(status.stdout_log_state, 'missing');
  assert.equal(status.last_activity_at, null);
  assert.equal(status.report_validated, false);
  assert.deepEqual(fs.readdirSync(f.dir), []);
});

test('reasoning events report activity while withholding every private payload and model name', () => {
  const f = fixture('working');
  const output = log(f, [
    { type: 'system', subtype: 'init', model: secret, session_id: secret, cwd: secret },
    { type: 'system', subtype: 'thinking_tokens', estimated_tokens: 23450, message: secret },
    { type: 'assistant', message: { model: secret, content: [{ type: 'thinking', thinking: secret }] }, timestamp: secret },
  ]);
  const original = fs.readFileSync(output);
  const status = readPeerProgress(f.dir, f.state, began + 299000);
  assert.equal(status.phase, 'model_working');
  assert.equal(status.response_received, false);
  assert.equal(status.report_validated, false);
  assert.equal(status.remaining_ms, 1000);
  assert.equal(status.last_activity_age_ms, 298000);
  assert.equal(status.stdout_bytes, original.length);
  assert.doesNotMatch(JSON.stringify(status), new RegExp(`${secret}|23450|thinking`));
  assert.deepEqual(fs.readFileSync(output), original);
});

test('structured and final responses remain unvalidated until authoritative stage completion', () => {
  const f = fixture('structured');
  const structured = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'StructuredOutput', input: { text: secret } }] } };
  log(f, [structured]);
  assert.equal(readPeerProgress(f.dir, f.state, began + 2000).phase, 'structured_output');
  log(f, [structured, { type: 'result', subtype: 'success', is_error: false, structured_output: { private: secret } }]);
  const pending = readPeerProgress(f.dir, f.state, began + 2000);
  assert.equal(pending.phase, 'response_received');
  assert.equal(pending.response_received, true);
  assert.equal(pending.report_validated, false);
  f.state.attempts[0].status = 'succeeded';
  f.state.stages.draft = { status: 'succeeded', attempt: 2 };
  assert.equal(readPeerProgress(f.dir, f.state).report_validated, false);
  f.state.stages.draft.attempt = 1;
  assert.equal(readPeerProgress(f.dir, f.state).report_validated, true);
  assert.doesNotMatch(JSON.stringify(pending), new RegExp(secret));
});

test('timed-out activity preserves phase without claiming a response or ongoing process', () => {
  const f = fixture('timeout', { status: 'failed', reason: 'timeout', elapsed_ms: 300122, ended_at: new Date(began + 300122).toISOString() });
  log(f, [{ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 23450 }]);
  const status = readPeerProgress(f.dir, f.state, began + 500000);
  assert.equal(status.phase, 'model_working');
  assert.equal(status.recorded_running, false);
  assert.equal(status.elapsed_ms, 300122);
  assert.equal(status.remaining_ms, null);
  assert.equal(status.response_received, false);
  assert.equal(status.report_validated, false);
});

test('partial and malformed JSON cannot leak text or hide earlier activity', () => {
  const f = fixture('partial');
  log(f, `not json ${secret}\n${JSON.stringify({ type: 'system', subtype: 'thinking_tokens' })}\n{"type":"assistant","message":"${secret}`);
  const status = readPeerProgress(f.dir, f.state, began + 2000);
  assert.equal(status.phase, 'model_working');
  assert.doesNotMatch(JSON.stringify(status), new RegExp(secret));
  log(f, [{ type: secret, subtype: secret, message: secret }, { type: 'assistant', message: { content: [{ type: 'tool_use', name: secret }] } }]);
  assert.equal(readPeerProgress(f.dir, f.state, began + 2000).phase, 'output_received');
});

test('provider retry diagnostics allow only bounded numeric metadata and no error content', () => {
  const f = fixture('retry');
  log(f, [{ type: 'system', subtype: 'api_retry', attempt: 2, max_retries: 4, retry_delay_ms: 500, error_status: 429, error: secret, message: secret }]);
  const retry = readPeerProgress(f.dir, f.state, began + 2000);
  assert.equal(retry.phase, 'provider_retry');
  assert.deepEqual(retry.provider_retry, { attempt: 2, max_retries: 4, delay_ms: 500, http_status: 429 });
  assert.doesNotMatch(JSON.stringify(retry), new RegExp(secret));
  log(f, '{"type":"system","subtype":"api_retry","attempt":1e309,"max_retries":"4","retry_delay_ms":-1,"error_status":99}');
  assert.deepEqual(readPeerProgress(f.dir, f.state, began + 2000).provider_retry, { attempt: null, max_retries: null, delay_ms: null, http_status: null });
});

test('legacy result JSON and Codex events expose receipt without interpreting private responses', () => {
  const f = fixture('legacy');
  log(f, JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: secret }, null, 2));
  assert.equal(readPeerProgress(f.dir, f.state, began + 2000).response_received, true);
  assert.equal(readPeerProgress(f.dir, f.state, began + 2000).report_validated, false);
  f.state.peer = 'codex';
  log(f, [{ type: 'thread.started', thread_id: secret }, { type: 'item.completed', item: { type: 'reasoning', text: secret } }]);
  assert.equal(readPeerProgress(f.dir, f.state, began + 2000).phase, 'model_working');
  log(f, [{ type: 'turn.completed', usage: { secret } }]);
  assert.equal(readPeerProgress(f.dir, f.state, began + 2000).phase, 'response_received');
  log(f, [{ type: 'turn.failed', error: { message: secret } }]);
  const failed = readPeerProgress(f.dir, f.state, began + 2000);
  assert.equal(failed.phase, 'provider_error');
  assert.doesNotMatch(JSON.stringify(failed), new RegExp(secret));
});

test('latest attempt owns progress and stderr contributes only byte counts and modification time', () => {
  const f = fixture('latest');
  log(f, [{ type: 'result', subtype: 'success' }]);
  f.state.attempts.push({ ...f.state.attempts[0], number: 2, stage: 'review' });
  const stderr = log(f, secret, 'stderr', 2);
  const status = readPeerProgress(f.dir, f.state, began + 2000);
  assert.equal(status.attempt, 2);
  assert.equal(status.phase, 'diagnostic_output');
  assert.equal(status.stderr_bytes, fs.statSync(stderr).size);
  assert.equal(status.response_received, false);
  assert.doesNotMatch(JSON.stringify(status), new RegExp(secret));
});

test('invalid clocks, paths, durations and timestamps remain finite or null', () => {
  const f = fixture('invalid', { started_at: secret, timeout_ms: Infinity });
  log(f, []);
  for (const now of [Infinity, NaN, -1, secret]) {
    const status = readPeerProgress(f.dir, f.state, now);
    assert.equal(status.observed_at, null);
    assert.equal(status.elapsed_ms, null);
    assert.equal(status.deadline_at, null);
    assert.equal(status.remaining_ms, null);
    assert.doesNotMatch(JSON.stringify(status), new RegExp(secret));
  }
  f.state.attempts[0].number = '../private';
  assert.equal(readPeerProgress(f.dir, f.state), null);
  f.state.attempts[0].number = 1;
  f.state.attempts[0].status = 'failed'; f.state.attempts[0].elapsed_ms = Infinity;
  assert.equal(readPeerProgress(f.dir, f.state).elapsed_ms, null);
});

test('oversized and nonregular log files are skipped and symbolic links are not followed', t => {
  const f = fixture('files');
  const filename = log(f, secret);
  fs.truncateSync(filename, 4 * 1024 * 1024 + 1);
  assert.equal(readPeerProgress(f.dir, f.state).stdout_log_state, 'oversized');
  fs.unlinkSync(filename); fs.mkdirSync(filename);
  assert.equal(readPeerProgress(f.dir, f.state).stdout_log_state, 'unsafe');
  fs.rmdirSync(filename);
  const target = path.join(f.dir, 'private.txt'); fs.writeFileSync(target, secret);
  try { fs.symlinkSync(target, filename, 'file'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.diagnostic('File symlinks unavailable on this host; regular/oversized guards still verified.'); return; }
    throw error;
  }
  const status = readPeerProgress(f.dir, f.state);
  assert.equal(status.stdout_log_state, 'unsafe');
  assert.equal(status.stdout_bytes, null);
  assert.doesNotMatch(JSON.stringify(status), new RegExp(secret));
});
