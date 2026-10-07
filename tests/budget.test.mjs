import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBudget, budgetSummary, recoverInterruptedAttempts, extendBudget } from '../scripts/budget.mjs';

const state = options => ({ ...prepareBudget(options ?? {}), mode: 'plan', elapsed_ms: 0, attempts: [], stages: {}, status: 'prepared' });
const at = '2026-10-07T12:00:00.000Z';

test('budget profiles provide bounded allowances while explicit values remain authoritative', () => {
  assert.deepEqual(prepareBudget({}).initial_limits, { timeout_ms: 300000, budget_ms: 900000, max_attempts: 4 });
  assert.deepEqual(prepareBudget({ 'budget-profile': 'project' }).initial_limits, { timeout_ms: 600000, budget_ms: 2400000, max_attempts: 5 });
  const custom = prepareBudget({ 'budget-profile': 'project', 'timeout-seconds': '20', 'budget-seconds': '30', 'max-attempts': '2' });
  assert.deepEqual(custom.initial_limits, { timeout_ms: 20000, budget_ms: 30000, max_attempts: 2 });
  assert.equal(custom.budget_profile, 'project');
  assert.throws(() => prepareBudget({ 'budget-profile': 'unlimited' }), /budget-profile/);
  for (const [name, values] of [['timeout-seconds', [0, 901, 1.5, 'NaN']], ['budget-seconds', [0, 3601, Infinity]], ['max-attempts', [0, 7, 1.5]]]) {
    for (const value of values) assert.throws(() => prepareBudget({ [name]: value }), /must be an integer/);
  }
});

test('budget status separates definite attempt shortage from advisory runtime headroom', () => {
  const run = state();
  run.attempts = [{ number: 1, status: 'failed' }, { number: 2, status: 'failed' }];
  run.elapsed_ms = 301000;
  const summary = budgetSummary(run);
  assert.deepEqual(summary.pending_stages, ['draft', 'review', 'verify']);
  assert.equal(summary.attempts_sufficient, false);
  assert.equal(summary.assessment, 'insufficient_attempts');
  assert.equal(summary.peer_seconds_available, 599);
  assert.equal(summary.full_timeout_headroom, false);
  assert.match(summary.note, /advisory/);
  run.stages.draft = { status: 'succeeded' };
  assert.equal(budgetSummary(run).attempts_sufficient, true);
  assert.equal(budgetSummary(run).full_timeout_headroom, false, 'Two remaining stages may finish before their full timeouts');
  run.stages.review = { status: 'succeeded' };
  run.stages.verify = { status: 'succeeded' };
  assert.equal(budgetSummary(run).assessment, 'stages_complete');
});

test('background worker stages share the attempt allowance and explicit caps remain authoritative', () => {
  const options = { 'author-model': 'gpt-5.4', 'budget-profile': 'project' };
  assert.equal(prepareBudget(options).max_attempts, 6);
  assert.equal(prepareBudget({ ...options, 'max-attempts': 5 }).max_attempts, 5);
  assert.equal(prepareBudget({ ...options, mode: 'review' }).max_attempts, 5);
  const run = { ...state(options), author_model: 'gpt-5.4' };
  assert.deepEqual(budgetSummary(run).pending_stages, ['author-draft', 'draft', 'author-review', 'review', 'verify']);
  run.attempts.push({ number: 1, stage: 'author-draft', status: 'failed' });
  assert.equal(budgetSummary(run).attempts_sufficient, true);
  run.attempts.push({ number: 2, stage: 'author-draft', status: 'failed' });
  assert.equal(budgetSummary(run).attempts_sufficient, false);
  run.stages['author-draft'] = { status: 'succeeded' };
  assert.equal(budgetSummary(run).successful_calls_remaining, 4);
  assert.equal(budgetSummary(run).attempts_sufficient, true);
  run.mode = 'review';
  assert.deepEqual(budgetSummary(run).pending_stages, ['review', 'verify']);
});

test('running reservations are conservative projections and recover exactly once', () => {
  const run = state();
  run.elapsed_ms = 1000;
  run.attempts = [{ number: 1, status: 'failed' }, { number: 2, status: 'running', timeout_ms: 300000 }];
  const original = structuredClone(run);
  const summary = budgetSummary(run);
  assert.equal(summary.assessment, 'running_attempt_recorded');
  assert.equal(summary.attempts_sufficient, null);
  assert.equal(summary.attempts_sufficient_if_running_fails, false);
  assert.equal(summary.peer_seconds_reserved, 300);
  assert.equal(summary.peer_seconds_available, 599);
  assert.deepEqual(run, original, 'A status read must not consume the running reservation');
  assert.equal(recoverInterruptedAttempts(run, at), 1);
  assert.equal(run.elapsed_ms, 301000);
  assert.equal(run.attempts[1].runtime_charge_ms, 300000);
  assert.equal(run.attempts[1].runtime_charge_basis, 'reserved_timeout_after_interruption');
  assert.equal(budgetSummary(run).peer_seconds_reserved, 0);
  assert.equal(recoverInterruptedAttempts(run, at), 0);
  assert.equal(run.elapsed_ms, 301000);
});

test('budget extension preserves charged evidence and is idempotent with absolute totals', () => {
  const run = state();
  run.elapsed_ms = 301000;
  run.attempts = [{ number: 1, status: 'failed', reason: 'timeout' }];
  run.stages.draft = { status: 'succeeded', attempt: 2 };
  const evidence = structuredClone({ attempts: run.attempts, stages: run.stages, elapsed_ms: run.elapsed_ms });
  const options = { 'timeout-seconds': '600', 'budget-seconds': '2400', 'max-attempts': '5', reason: 'Preserve earlier work and allow the remaining review stages.' };
  assert.equal(extendBudget(run, options, at), true);
  assert.deepEqual({ attempts: run.attempts, stages: run.stages, elapsed_ms: run.elapsed_ms }, evidence);
  assert.deepEqual(run.initial_limits, { timeout_ms: 300000, budget_ms: 900000, max_attempts: 4 });
  assert.deepEqual(run.limit_history, [{ at, reason: options.reason, before: run.initial_limits, after: { timeout_ms: 600000, budget_ms: 2400000, max_attempts: 5 }, attempts_used: 1, elapsed_ms: 301000 }]);
  assert.equal(extendBudget(run, options, at), false);
  assert.equal(run.limit_history.length, 1);
  const before = structuredClone(run);
  for (const extra of [{ 'max-attempts': '4' }, { 'budget-seconds': '2399' }, { 'timeout-seconds': '599' }, { 'max-attempts': '7' }, { 'timeout-seconds': '901' }, { 'budget-seconds': '3601' }, { reason: '' }, { reason: 'x'.repeat(501) }, { reason: 'two\nlines' }]) {
    assert.throws(() => extendBudget(run, { ...options, ...extra }, at));
    assert.deepEqual(run, before);
  }
  assert.throws(() => extendBudget(run, { reason: 'No limit was supplied.' }, at), /at least one/);
});

test('invalid runtime counters and reserved time fail before budget mutation', () => {
  for (const value of [-1, '5', NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const run = state();
    run.elapsed_ms = value;
    assert.throws(() => budgetSummary(run), /elapsed runtime/);
    assert.throws(() => extendBudget(run, { 'max-attempts': '5', reason: 'Cannot repair unknown charged runtime.' }, at), /elapsed runtime/);
    assert.throws(() => recoverInterruptedAttempts(run, at), /elapsed runtime/);
    assert.equal(run.limit_history.length, 0);
  }
  const run = state();
  run.attempts = [{ status: 'running', timeout_ms: NaN }];
  assert.throws(() => recoverInterruptedAttempts(run, at), /reserved timeout/);
  assert.equal(run.elapsed_ms, 0);
  assert.equal(run.attempts[0].status, 'running');
});
