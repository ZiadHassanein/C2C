import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createActivityObserver, readPeerProgress } from '../scripts/progress.mjs';

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

test('background author activity uses that attempt provider and preserves role attribution', () => {
  const f = fixture('author-provider', { stage: 'author-draft', provider: 'codex', role: 'author', status: 'succeeded' });
  f.state.author_model = 'gpt-5.4';
  f.state.stages['author-draft'] = { status: 'succeeded', attempt: 1 };
  log(f, [{ type: 'thread.started', thread_id: secret }, { type: 'turn.completed', usage: { private: secret } }]);
  const status = readPeerProgress(f.dir, f.state, began + 2000);
  assert.equal(f.state.peer, 'claude');
  assert.equal(status.provider, 'codex');
  assert.equal(status.role, 'author');
  assert.equal(status.stage, 'author-draft');
  assert.equal(status.phase, 'response_received');
  assert.equal(status.report_validated, true);
  assert.doesNotMatch(JSON.stringify(status), new RegExp(secret));
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
  log(f, `not json ${secret}\n${JSON.stringify({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 1 })}\n{"type":"assistant","message":"${secret}`);
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

test('activity waiting reports its idle allowance without a hard deadline or fake semantic clock', () => {
  const f = fixture('activity', { timeout_ms: null, idle_timeout_ms: 300000, stage: 'verify-final' });
  log(f, [{ type: 'system', subtype: 'api_retry', attempt: 2 }]);
  const status = readPeerProgress(f.dir, f.state, began + 3 * 24 * 60 * 60 * 1000);
  assert.equal(status.timeout_ms, null);
  assert.equal(status.idle_timeout_ms, 300000);
  assert.equal(status.deadline_at, null);
  assert.equal(status.remaining_ms, null);
  assert.equal(status.elapsed_ms, 3 * 24 * 60 * 60 * 1000);
  assert.equal(status.stage, 'verify-final');
  assert.equal(status.last_activity_source, 'log_mtime');
  assert.equal(status.last_activity_at, status.last_output_at);
  assert.equal(status.last_activity_age_ms, status.last_output_age_ms);
  f.state.attempts[0].status = 'succeeded';
  f.state.attempts[0].elapsed_ms = status.elapsed_ms;
  f.state.stages['verify-final'] = { status: 'succeeded', attempt: 1 };
  assert.equal(readPeerProgress(f.dir, f.state).report_validated, true);
  assert.equal(readPeerProgress(f.dir, f.state).elapsed_ms, status.elapsed_ms);
});

test('explicit hard deadlines remain visible alongside an idle allowance', () => {
  const f = fixture('fixed-and-idle', { timeout_ms: 600000, idle_timeout_ms: 300000 });
  const status = readPeerProgress(f.dir, f.state, began + 1000);
  assert.equal(status.timeout_ms, 600000);
  assert.equal(status.idle_timeout_ms, 300000);
  assert.equal(status.deadline_at, new Date(began + 600000).toISOString());
  assert.equal(status.remaining_ms, 599000);
  f.state.attempts[0].idle_timeout_ms = Infinity;
  assert.equal(readPeerProgress(f.dir, f.state).idle_timeout_ms, null);
});

test('progress phase cannot mistake replayed reasoning or tool noise for new model work', () => {
  const f = fixture('stale-phase');
  log(f, [{ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 50 },
    { type: 'system', subtype: 'api_retry', attempt: 1 },
    { type: 'system', subtype: 'thinking_tokens', estimated_tokens: 50, uuid: 'new-envelope' }]);
  assert.equal(readPeerProgress(f.dir, f.state).phase, 'provider_retry');
  f.state.peer = 'codex';
  log(f, [{ type: 'thread.started' }, { type: 'turn.started' },
    { type: 'item.updated', item: { type: 'command_execution', text: secret } }]);
  assert.equal(readPeerProgress(f.dir, f.state).phase, 'initializing');
});

test('Claude thinking activity requires a strictly increasing safe counter, not fresh event IDs', () => {
  const observe = createActivityObserver('claude');
  const thinking = (tokens, uuid = 'event') => ({ type: 'system', subtype: 'thinking_tokens', session_id: 'session', uuid, estimated_tokens: tokens, estimated_tokens_delta: 99 });
  for (const tokens of [undefined, null, -1, 0, 1.5, Infinity, '1', Number.MAX_SAFE_INTEGER + 1]) assert.equal(observe(thinking(tokens)), false);
  assert.equal(observe(thinking(50)), true);
  assert.equal(observe(thinking(50, 'fresh-but-stale')), false);
  assert.equal(observe(thinking(40)), false);
  assert.equal(observe(thinking(100)), true);
  assert.equal(observe(thinking(50)), false);
  assert.equal(createActivityObserver('claude')(thinking(50)), true);
});

test('Claude snapshots reject replayed text and track actual structured content instead of tool metadata', () => {
  const observe = createActivityObserver('claude');
  const assistant = content => ({ type: 'assistant', message: { id: 'message-1', content } });
  const first = assistant([{ type: 'thinking', thinking: secret }]);
  assert.equal(observe(first), true);
  assert.equal(observe({ ...first, uuid: 'changed-envelope', timestamp: 'later' }), false);
  assert.equal(observe(assistant([{ type: 'thinking', thinking: `${secret} continued` }])), true);
  assert.equal(observe(first), false);
  assert.equal(observe(assistant([{ type: 'tool_use', name: 'Bash', input: { command: secret } }])), false);
  assert.equal(observe(assistant([{ type: 'tool_use', name: 'StructuredOutput', input: {} }])), false);
  const report = assistant([{ type: 'tool_use', name: 'StructuredOutput', input: { summary: secret, verdict: 'ready' } }]);
  assert.equal(observe(report), true);
  assert.equal(observe(report), false);
  assert.equal(observe(assistant([{ type: 'tool_use', name: 'StructuredOutput', input: { verdict: 'ready', summary: secret } }])), false);
  assert.equal(observe(assistant([{ type: 'text', text: '   ' }])), false);
});

test('Claude streaming deltas require content and reject replayed IDs; tool JSON is not generic activity', () => {
  const observe = createActivityObserver('claude');
  const stream = (event, uuid) => ({ type: 'stream_event', uuid, session_id: 's', event });
  assert.equal(observe(stream({ type: 'message_start', message: { id: 'm' } })), false);
  assert.equal(observe(stream({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })), false);
  const delta = stream({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: secret } }, 'unique-1');
  assert.equal(observe(delta), true);
  assert.equal(observe(delta), false);
  assert.equal(observe({ ...delta, uuid: 'unique-2' }), true);
  assert.equal(observe(stream({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '' } }, 'unique-3')), false);
  const json = { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"summary":' } };
  assert.equal(observe(stream(json)), false);
  assert.equal(observe(stream({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', name: 'Bash', input: {} } })), false);
  assert.equal(observe(stream(json)), false);
  assert.equal(observe(stream({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', name: 'StructuredOutput', input: {} } })), false);
  assert.equal(observe(stream(json)), true);
  assert.equal(observe(stream(json)), false);
  assert.equal(observe(stream({ type: 'message_delta', usage: { output_tokens: 8 } })), true);
  assert.equal(observe(stream({ type: 'message_delta', usage: { output_tokens: 8 } })), false);
});

test('Codex activity follows model items and rejects tool output, status changes and stale snapshots', () => {
  const observe = createActivityObserver('codex');
  const item = (type, text, event = 'item.updated') => ({ type: event, item: { id: 'item-1', type, text } });
  for (const kind of ['command_execution', 'mcp_tool_call', 'file_change', 'web_search', 'todo_list']) assert.equal(observe(item(kind, secret)), false);
  assert.equal(observe(item('reasoning', '')), false);
  assert.equal(observe(item('reasoning', secret, 'item.started')), true);
  assert.equal(observe(item('reasoning', secret, 'item.completed')), false);
  assert.equal(observe(item('reasoning', `${secret} more`)), true);
  assert.equal(observe(item('reasoning', secret)), false);
  assert.equal(observe(item('agent_message', secret)), true);
  const structured = { type: 'item.completed', item: { id: 'item-2', type: 'structured_output', structured_output: { summary: secret } } };
  assert.equal(observe(structured), true);
  assert.equal(observe(structured), false);
});

test('Codex deltas use advancing sequence metadata and conservative content replay checks without it', () => {
  const observe = createActivityObserver('codex');
  const delta = { type: 'response.reasoning_text.delta', item_id: 'r', delta: secret, sequence_number: 0 };
  assert.equal(observe(delta), true);
  assert.equal(observe(delta), false);
  assert.equal(observe({ ...delta, sequence_number: 1 }), true);
  assert.equal(observe(delta), false);
  assert.equal(observe({ ...delta, sequence_number: 2, delta: '' }), false);
  assert.equal(observe({ ...delta, sequence_number: Number.MAX_SAFE_INTEGER }), false);
  const unsequenced = { type: 'response.output_text.delta', item_id: 't', delta: secret };
  assert.equal(observe(unsequenced), true);
  assert.equal(observe(unsequenced), false);
  assert.equal(observe({ ...unsequenced, delta: `${secret} more` }), true);
});

test('initialization, lifecycle markers, retries, errors and heartbeat noise never extend idle waiting', () => {
  const noise = [null, [], 'text', 5, {}, { type: 'system', subtype: 'init', model: secret },
    { type: 'system', subtype: 'api_retry', attempt: 2, estimated_tokens: 50 },
    { type: 'system', subtype: 'heartbeat', estimated_tokens: 50 }, { type: 'thread.started' }, { type: 'turn.started' },
    { type: 'turn.completed', usage: { output_tokens: 100 } }, { type: 'turn.failed', error: { message: secret } },
    { type: 'error', message: secret }, { type: 'result', result: secret }, { type: 'ping' },
    { type: 'assistant', is_error: true, message: { content: [{ type: 'text', text: secret }] } },
    { type: 'item.updated', error: { message: secret }, item: { type: 'reasoning', text: secret } },
    { type: 'stream_event', event: { type: 'ping' } }, { type: 'stream_event', event: { type: 'error', error: secret } }];
  for (const provider of ['claude', 'codex', 'unknown']) {
    const observe = createActivityObserver(provider);
    for (const event of noise) assert.equal(observe(event), false, `${provider}: ${JSON.stringify(event)}`);
  }
});
