import test from 'node:test';
import assert from 'node:assert/strict';
import { extractUsage, usageView, aggregateUsage } from '../scripts/usage.mjs';

const codexUsage = { input_tokens: 100, cached_input_tokens: 60, output_tokens: 30, reasoning_output_tokens: 20 };
const claudeUsage = { input_tokens: 10, cache_read_input_tokens: 60, cache_creation_input_tokens: 20, output_tokens: 30 };
const codex = (usage = codexUsage, overrides = {}) => JSON.stringify({ type: 'turn.completed', usage, ...overrides });
const claude = (usage = claudeUsage, overrides = {}) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, usage, ...overrides });
const attempt = (number, provider, stdout, overrides = {}) => ({ number, stage: 'review', provider,
  status: 'succeeded', elapsed_ms: 100, usage_observation: extractUsage(provider, stdout), ...overrides });
const allUnknown = usage => assert.ok(Object.values(usage.counters).every(value => value === null));

test('Codex total input includes cache reads and output includes reasoning', () => {
  const value = extractUsage('codex', codex());
  assert.equal(value.version, 1);
  assert.equal(value.status, 'observed');
  assert.equal(value.counter_scope, 'terminal_turn');
  assert.equal(value.input_semantics, 'total_includes_cache_read');
  assert.deepEqual(value.counters, { input_tokens_total: 100, input_tokens_uncached: 40,
    input_tokens_cache_read: 60, input_tokens_cache_write: null, output_tokens_total: 30,
    output_tokens_reasoning: 20, total_tokens: 130 });
  assert.deepEqual(value.raw_usage, [codexUsage]);
  assert.deepEqual(usageView(value).unknown_counters, ['input_tokens_cache_write']);
});

test('Claude disjoint input categories are summed once and scoped to the main loop', () => {
  const value = extractUsage('claude', claude({ ...claudeUsage, output_tokens_details: { thinking_tokens: 12 } }));
  assert.equal(value.counter_scope, 'terminal_turn_main_loop');
  assert.equal(value.worker_scope, 'main_loop_only');
  assert.deepEqual(value.counters, { input_tokens_total: 90, input_tokens_uncached: 10,
    input_tokens_cache_read: 60, input_tokens_cache_write: 20, output_tokens_total: 30,
    output_tokens_reasoning: 12, total_tokens: 120 });
  assert.equal(value.status, 'observed');
});

test('pretty JSON envelopes and diagnostic-prefixed JSONL both retain terminal usage', () => {
  const pretty = JSON.stringify(JSON.parse(claude()), null, 2);
  assert.equal(extractUsage('claude', pretty).counters.total_tokens, 120);
  const stream = `diagnostic prose\r\n${JSON.stringify({ type: 'thread.started', thread_id: 'private' })}\r\n${JSON.stringify({ type: 'turn.started' })}\r\n${codex()}\r\n`;
  assert.equal(extractUsage('codex', stream).counters.total_tokens, 130);
});

test('observed zero is distinct from absent, null, or unobserved usage', () => {
  for (const [provider, stdout] of [
    ['codex', codex({ input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 })],
    ['claude', claude({ input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 })],
  ]) {
    const value = extractUsage(provider, stdout);
    assert.equal(value.counters.total_tokens, 0);
    assert.equal(value.status, 'observed');
    const aggregate = aggregateUsage([attempt(1, provider, stdout)]);
    assert.equal(aggregate.counters.total_tokens.observed_sum, 0);
    assert.equal(aggregate.counters.total_tokens.complete, true);
  }
  for (const stdout of ['', '{"type":"turn.completed"}', codex(null), codex({})]) {
    const value = extractUsage('codex', stdout);
    allUnknown(value);
    assert.equal(value.status, 'missing');
  }
});

test('missing cache detail never prevents a reported Codex input/output total', () => {
  const value = extractUsage('codex', codex({ input_tokens: 10, output_tokens: 5 }));
  assert.equal(value.counters.total_tokens, 15);
  assert.equal(value.counters.input_tokens_cache_read, null);
  assert.equal(value.counters.input_tokens_uncached, null);
});

test('missing Claude cache category cannot be silently filled with zero', () => {
  const value = extractUsage('claude', claude({ input_tokens: 10, cache_read_input_tokens: 60, output_tokens: 30 }));
  assert.equal(value.status, 'partial');
  assert.equal(value.counters.input_tokens_total, null);
  assert.equal(value.counters.total_tokens, null);
  assert.equal(value.counters.input_tokens_uncached, 10);
  assert.equal(value.counters.input_tokens_cache_read, 60);
  assert.equal(value.counters.output_tokens_total, 30);
});

test('terminal usage survives failed provider results and invalid report content', () => {
  const failed = extractUsage('claude', claude(claudeUsage, { subtype: 'error_during_execution', is_error: true,
    errors: ['private failure'], structured_output: { invalid: true } }));
  assert.equal(failed.counters.total_tokens, 120);
  assert.equal(failed.status, 'observed');
  assert.equal(extractUsage('codex', codex(codexUsage, { type: 'turn.failed', error: { message: 'private' } })).counters.total_tokens, 130);
  const malformedReport = JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{broken report' } });
  assert.equal(extractUsage('codex', `${malformedReport}\n${codex()}`).counters.total_tokens, 130);
  assert.equal(extractUsage('claude', claude(claudeUsage, { result: '{broken report' })).counters.total_tokens, 120);
});

test('stream snapshots and cumulative model totals are never added to terminal usage', () => {
  const stream = [
    { type: 'assistant', message: { id: 'same', usage: { input_tokens: 999, output_tokens: 999 } } },
    { type: 'assistant', message: { id: 'same', usage: { input_tokens: 999, output_tokens: 999 } } },
    { type: 'message_delta', usage: { input_tokens: 999, output_tokens: 999 } },
    JSON.parse(claude(claudeUsage, { total_cost_usd: 12345, modelUsage: { any: {
      inputTokens: 10000, outputTokens: 20000, cacheReadInputTokens: 30000, cacheCreationInputTokens: 40000,
    } } })),
  ].map(event => JSON.stringify(event)).join('\n');
  const value = extractUsage('claude', stream);
  assert.equal(value.counters.total_tokens, 120);
  assert.deepEqual(value.raw_usage, [claudeUsage]);
  const withoutTerminal = stream.slice(0, stream.lastIndexOf('\n'));
  const missing = extractUsage('claude', withoutTerminal);
  allUnknown(missing);
  assert.ok(missing.diagnostics.includes('nonterminal_usage_ignored'));
});

test('repeated cumulative terminal snapshots are ambiguous even when identical', () => {
  for (const [provider, stdout] of [['codex', codex()], ['claude', claude()]]) {
    const value = extractUsage(provider, `${stdout}\n${stdout}`);
    assert.equal(value.status, 'ambiguous');
    assert.equal(value.terminal_records, 2);
    assert.equal(value.raw_usage.length, 2);
    allUnknown(value);
  }
});

test('multiple different success/failure terminals are never silently chosen', () => {
  for (const [provider, stdout] of [
    ['codex', `${codex()}\n${codex({ input_tokens: 50, output_tokens: 12 }, { type: 'turn.failed' })}`],
    ['claude', `${claude()}\n${claude({ input_tokens: 0, output_tokens: 0 }, { subtype: 'error_max_turns', is_error: true })}`],
  ]) { const value = extractUsage(provider, stdout); assert.equal(value.status, 'ambiguous'); allUnknown(value); }
});

test('a terminal missing usage is still a competing terminal and cannot be discarded', () => {
  const value = extractUsage('claude', `${claude()}\n{"type":"result","subtype":"error_during_execution"}`);
  assert.equal(value.status, 'ambiguous');
  assert.equal(value.raw_usage[1], null);
  allUnknown(value);
});

test('multiple Codex turn starts with a single terminal leave attempt totals ambiguous', () => {
  const value = extractUsage('codex', `{"type":"turn.started"}\n{"type":"turn.started"}\n${codex()}`);
  assert.equal(value.status, 'ambiguous'); allUnknown(value);
});

test('malformed JSON can conceal a terminal and blocks selection while preserving counters privately', () => {
  const value = extractUsage('codex', `${codex()}\n{"type":"turn.failed",`);
  assert.equal(value.status, 'ambiguous');
  assert.ok(value.diagnostics.includes('malformed_json_record'));
  assert.deepEqual(value.raw_usage, [codexUsage]);
  allUnknown(value);
});

test('duplicate JSON usage keys, including escaped keys and duplicate envelopes, fail closed', () => {
  const streams = [
    '{"type":"turn.completed","usage":{"input_tokens":1,"input_tokens":2,"output_tokens":3}}',
    '{"type":"turn.completed","usage":{"input_tokens":1,"input_\\u0074okens":2,"output_tokens":3}}',
    '{"type":"turn.failed","type":"turn.completed","usage":{"input_tokens":1,"output_tokens":3}}',
    '{"type":"turn.completed","usage":{},"usage":{"input_tokens":1,"output_tokens":3}}',
  ];
  for (const stdout of streams) {
    const value = extractUsage('codex', stdout);
    assert.equal(value.status, 'ambiguous'); allUnknown(value);
    assert.ok(value.diagnostics.includes('duplicate_usage_key'));
  }
});

test('duplicate report keys and escaped string content do not contaminate terminal counter parsing', () => {
  const stdout = '{"type":"result","structured_output":{"private":"escaped\\\"}[]", "private":"invalid report"},"usage":{"input_tokens":1,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"output_tokens":2}}';
  assert.equal(extractUsage('claude', stdout).counters.total_tokens, 3);
});

test('noninteger, negative, unsafe, string and structured counter values stay unknown', () => {
  for (const input_tokens of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '123', true, [], { content: 'private' }]) {
    const value = extractUsage('codex', codex({ input_tokens, output_tokens: 4 }));
    assert.equal(value.counters.input_tokens_total, null);
    assert.equal(value.counters.total_tokens, null);
    assert.equal(value.counters.output_tokens_total, 4);
    assert.ok(value.diagnostics.includes('invalid_counter'));
  }
  const infinite = extractUsage('codex', '{"type":"turn.completed","usage":{"input_tokens":1e999,"output_tokens":4}}');
  assert.equal(infinite.counters.input_tokens_total, null);
  assert.ok(infinite.diagnostics.includes('invalid_counter'));
});

test('usage objects and incomplete supported schemas are validated without guessing aliases', () => {
  for (const usage of ['private', 12, true, []]) {
    const value = extractUsage('claude', claude(usage));
    assert.equal(value.status, 'invalid'); allUnknown(value);
    assert.deepEqual(value.raw_usage, [null]);
  }
  const future = extractUsage('codex', codex({ inputTokens: 20, outputTokens: 10, details: { total_tokens: 30 } }));
  assert.equal(future.status, 'missing'); allUnknown(future);
  assert.deepEqual(future.raw_usage, [{}]);
});

test('inconsistent cache/reasoning subsets never inflate inclusive totals', () => {
  const value = extractUsage('codex', codex({ input_tokens: 10, cached_input_tokens: 11, output_tokens: 3, reasoning_output_tokens: 4 }));
  assert.equal(value.counters.total_tokens, 13);
  assert.equal(value.counters.input_tokens_cache_read, null);
  assert.equal(value.counters.input_tokens_uncached, null);
  assert.equal(value.counters.output_tokens_reasoning, null);
  assert.ok(value.diagnostics.includes('inconsistent_cache_subset'));
  assert.ok(value.diagnostics.includes('inconsistent_reasoning_subset'));
  const claudeValue = extractUsage('claude', claude({ ...claudeUsage, output_tokens_details: { thinking_tokens: 31 } }));
  assert.equal(claudeValue.counters.output_tokens_reasoning, null);
  assert.equal(claudeValue.counters.total_tokens, 120);
});

test('conflicting reported total is unknown while consistent component counters remain available', () => {
  const bad = extractUsage('codex', codex({ ...codexUsage, total_tokens: 999 }));
  assert.equal(bad.counters.total_tokens, null);
  assert.equal(bad.counters.input_tokens_total, 100);
  assert.equal(bad.status, 'partial');
  assert.equal(extractUsage('codex', codex({ ...codexUsage, total_tokens: 130 })).counters.total_tokens, 130);
});

test('overflow in derived or aggregate sums remains unknown rather than losing integer precision', () => {
  const huge = Number.MAX_SAFE_INTEGER;
  const codexValue = extractUsage('codex', codex({ input_tokens: huge, output_tokens: 1 }));
  assert.equal(codexValue.counters.total_tokens, null);
  assert.ok(codexValue.diagnostics.includes('counter_overflow'));
  const claudeValue = extractUsage('claude', claude({ input_tokens: huge, cache_read_input_tokens: 1, cache_creation_input_tokens: 0, output_tokens: 0 }));
  assert.equal(claudeValue.counters.input_tokens_total, null);
  const aggregate = aggregateUsage([attempt(1, 'codex', codex({ input_tokens: huge, output_tokens: 0 })), attempt(2, 'codex', codex({ input_tokens: 1, output_tokens: 0 }))]);
  assert.equal(aggregate.counters.input_tokens_total.observed_sum, null);
  assert.equal(aggregate.counters.input_tokens_total.overflow, true);
  assert.equal(aggregate.counters.input_tokens_total.complete, false);
});

test('raw whitelist preserves relevant numeric evidence but strips all sensitive payloads from views', () => {
  const secret = 'PRIVATE_PAYLOAD_DO_NOT_RENDER';
  const value = extractUsage('claude', claude({ ...claudeUsage,
    unknown_field: secret, server_tool_use: { content: secret },
    output_tokens_details: { thinking_tokens: 4, content: secret },
  }, { session_id: secret, result: secret, modelUsage: { [secret]: { inputTokens: 999 } } }));
  assert.doesNotMatch(JSON.stringify(value), new RegExp(secret));
  value.raw_usage.push({ input_tokens: secret });
  value.diagnostics.push(secret); value.extra = secret; value.worker_scope = secret;
  const view = usageView(value);
  assert.doesNotMatch(JSON.stringify(view), new RegExp(secret));
  assert.equal(view.raw_usage, undefined);
  assert.equal(view.worker_scope, 'main_loop_only');
  assert.doesNotMatch(JSON.stringify(aggregateUsage([{ number: 1, usage_observation: value, secret }])), new RegExp(secret));
});

test('persisted observation schemas and counter consistency are revalidated before display', () => {
  for (const mutate of [
    value => { value.version = 999; }, value => { value.source = 'future'; },
    value => { value.counter_scope = 'session'; }, value => { value.status = 'fabricated'; },
    value => { value.counters.input_tokens_total = '100'; },
    value => { value.counters.output_tokens_reasoning = 99; },
    value => { value.counters.total_tokens = 999; },
    value => { value.terminal_records = 2; },
  ]) {
    const value = extractUsage('codex', codex()); mutate(value);
    allUnknown(usageView(value));
  }
});

test('legacy raw usage is not retroactively reinterpreted as a normalized observation', () => {
  const aggregate = aggregateUsage([{ number: 1, status: 'succeeded', usage: codexUsage, model_usage: { any: claudeUsage } }]);
  assert.equal(aggregate.counters.total_tokens.observed_sum, null);
  assert.equal(aggregate.counters.total_tokens.unknown_attempts, 1);
  assert.equal(aggregate.elapsed_ms.observed_sum, null);
  assert.equal(aggregate.usage_coverage.missing, 1);
});

test('aggregate counts failed attempts and retries without disguising missing coverage as zero', () => {
  const rows = [
    attempt(1, 'codex', codex(), { status: 'failed', elapsed_ms: 15 }),
    attempt(2, 'claude', claude(), { elapsed_ms: 25 }),
    { number: 3, stage: 'verify', status: 'failed', elapsed_ms: null },
    { number: 4, stage: 'verify', status: 'running' },
  ];
  const aggregate = aggregateUsage(rows);
  assert.deepEqual(aggregate.attempts, { recorded: 4, succeeded: 1, failed: 2, running: 1, interrupted: 0, unknown_outcome: 0, retries: 2, retry_unknown: 0, duplicate_numbers: 0 });
  assert.deepEqual(aggregate.counters.total_tokens, { observed_sum: 250, observed_attempts: 2, unknown_attempts: 2, complete: false, overflow: false });
  assert.deepEqual(aggregate.elapsed_ms, { observed_sum: 40, observed_attempts: 2, unknown_attempts: 2, complete: false, overflow: false });
  assert.deepEqual(aggregate.coordinator, { status: 'unobserved', includes_research_and_synthesis: false });
  assert.equal(aggregate.provider_internal_calls, null);
  assert.equal(aggregate.subscription_cost, null);
  assert.equal(aggregate.savings, null);
});

test('each counter reports its own coverage across partial provider observations', () => {
  const aggregate = aggregateUsage([attempt(1, 'codex', codex()), attempt(2, 'claude', claude({ input_tokens: 10, output_tokens: 5 }))]);
  assert.equal(aggregate.counters.input_tokens_total.observed_sum, 100);
  assert.equal(aggregate.counters.input_tokens_total.unknown_attempts, 1);
  assert.equal(aggregate.counters.output_tokens_total.observed_sum, 35);
  assert.equal(aggregate.counters.output_tokens_total.complete, true);
  assert.equal(aggregate.counters.input_tokens_cache_write.observed_sum, null);
  assert.equal(aggregate.counters.input_tokens_cache_write.unknown_attempts, 2);
});

test('recovered interrupted attempts retain unknown usage and a distinct failure outcome', () => {
  const aggregate = aggregateUsage([{ number: 1, stage: 'draft', status: 'interrupted', elapsed_ms: 500 }]);
  assert.equal(aggregate.attempts.interrupted, 1);
  assert.equal(aggregate.attempts.unknown_outcome, 0);
  assert.equal(aggregate.counters.total_tokens.observed_sum, null);
  assert.equal(aggregate.elapsed_ms.observed_sum, 500);
});

test('duplicate attempt numbers cannot double-count the same terminal snapshot', () => {
  const row = attempt(1, 'codex', codex());
  const aggregate = aggregateUsage([row, structuredClone(row)]);
  assert.equal(aggregate.attempts.duplicate_numbers, 1);
  assert.equal(aggregate.attempts.retry_unknown, 2);
  assert.equal(aggregate.counters.total_tokens.observed_sum, null);
  assert.equal(aggregate.counters.total_tokens.unknown_attempts, 2);
  assert.equal(aggregate.elapsed_ms.observed_sum, null);
});

test('empty or unsupported inputs do not imply zero usage or coordinator coverage', () => {
  for (const provider of ['other', '__proto__', null]) allUnknown(extractUsage(provider, codex()));
  for (const stdout of [null, {}, 123]) assert.ok(extractUsage('codex', stdout).diagnostics.includes('invalid_stdout'));
  for (const rows of [[], undefined, null, {}]) {
    const aggregate = aggregateUsage(rows);
    assert.equal(aggregate.attempts.recorded, 0);
    assert.equal(aggregate.counters.total_tokens.observed_sum, null);
    assert.equal(aggregate.counters.total_tokens.complete, false);
  }
});

test('all operations are pure and independent from stored raw payload mutation', () => {
  const rows = [attempt(1, 'codex', codex())], before = structuredClone(rows);
  aggregateUsage(rows); usageView(rows[0].usage_observation);
  assert.deepEqual(rows, before);
  const view = usageView(rows[0].usage_observation);
  view.counters.total_tokens = 0;
  assert.equal(rows[0].usage_observation.counters.total_tokens, 130);
});
