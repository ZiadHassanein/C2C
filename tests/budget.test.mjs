import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBudget, budgetSummary, recoverInterruptedAttempts, extendBudget } from '../scripts/budget.mjs';

const activeState = options => ({ ...prepareBudget(options ?? {}), mode: 'plan', elapsed_ms: 0, attempts: [], stages: {}, status: 'prepared' });
const state = options => {
  const run = activeState({ ...options, 'timeout-policy': 'fixed' });
  delete run.timeout_policy; delete run.idle_timeout_ms; delete run.initial_limits.idle_timeout_ms;
  return run;
};
const at = '2026-10-07T12:00:00.000Z';

test('Codex activity visibility note distinguishes historical silence from current unknowns', () => {
  const note = budgetSummary({ ...activeState(), peer: 'codex' }).activity_visibility_note;
  assert.match(note, /current-version mid-call activity is not established/);
  assert.match(note, /effective call deadline/);
  assert.match(note, /up to 3600/);
  assert.equal(budgetSummary({ ...activeState(), peer: 'claude' }).activity_visibility_note, null);
});

test('total-only recovery at normal and maximum caps preserves the reservation basis and extension ceiling', () => {
  for (const cap of [1800, 3600]) {
    const run = activeState({ 'budget-seconds': cap });
    assert.match(budgetSummary(run).recovery_warning, /not measured model runtime/);
    run.attempts = [{ number: 1, status: 'running', timeout_ms: cap * 1000 }];
    recoverInterruptedAttempts(run, at);
    assert.equal(run.elapsed_ms, cap * 1000);
    assert.equal(budgetSummary(run).assessment, 'runtime_exhausted');
    assert.equal(run.attempts[0].runtime_charge_basis, 'reserved_timeout_after_interruption');
    if (cap === 1800) {
      extendBudget(run, { 'budget-seconds': 3600, reason: 'Authorized test extension' }, at);
      assert.equal(budgetSummary(run).peer_seconds_available, 1800);
    } else assert.throws(() => extendBudget(run, { 'budget-seconds': 3601, reason: 'Beyond ceiling' }, at));
  }
});

test('activity profiles avoid implicit hard deadlines while explicit caps remain authoritative', () => {
  assert.deepEqual(prepareBudget({}).initial_limits, { timeout_ms: null, budget_ms: null, max_attempts: 4, idle_timeout_ms: 600000 });
  assert.deepEqual(prepareBudget({ 'budget-profile': 'project' }).initial_limits, { timeout_ms: null, budget_ms: null, max_attempts: 5, idle_timeout_ms: 1200000 });
  const custom = prepareBudget({ 'budget-profile': 'project', 'timeout-seconds': '20', 'budget-seconds': '30', 'max-attempts': '2' });
  assert.deepEqual(custom.initial_limits, { timeout_ms: 20000, budget_ms: 30000, max_attempts: 2, idle_timeout_ms: 1200000 });
  assert.equal(custom.budget_profile, 'project');
  assert.equal(custom.timeout_policy, 'activity');
  assert.throws(() => prepareBudget({ 'budget-profile': 'unlimited' }), /budget-profile/);
  assert.throws(() => prepareBudget({ 'timeout-policy': 'unlimited' }), /timeout-policy/);
  for (const [name, values] of [['timeout-seconds', [0, 901, 1.5, 'NaN']], ['budget-seconds', [0, 3601, Infinity]], ['max-attempts', [0, 7, 1.5]], ['idle-timeout-seconds', [0, 59, 3601, 60.5, Infinity]]]) {
    for (const value of values) assert.throws(() => prepareBudget({ [name]: value }), /must be an integer/);
  }
});

test('explicit fixed policy preserves old profile durations without an inactivity timer', () => {
  const fixed = prepareBudget({ 'timeout-policy': 'fixed' });
  assert.deepEqual(fixed.initial_limits, { timeout_ms: 300000, budget_ms: 900000, max_attempts: 4, idle_timeout_ms: null });
  assert.equal(fixed.timeout_policy, 'fixed');
  assert.deepEqual(prepareBudget({ 'budget-profile': 'project', 'timeout-policy': 'fixed' }).initial_limits,
    { timeout_ms: 600000, budget_ms: 2400000, max_attempts: 5, idle_timeout_ms: null });
  assert.throws(() => prepareBudget({ 'timeout-policy': 'fixed', 'idle-timeout-seconds': 600 }), /requires the activity/);
});

test('implicit inactivity allowance cannot preempt an explicit call deadline', () => {
  const standard = prepareBudget({ 'timeout-seconds': 900 });
  assert.equal(standard.timeout_ms, 900000);
  assert.equal(standard.idle_timeout_ms, 900000);
  assert.equal(standard.initial_limits.idle_timeout_ms, 900000, 'The adjusted default is frozen into the initial contract');
  assert.equal(standard.budget_ms, null);
  assert.equal(prepareBudget({ 'timeout-seconds': 300 }).idle_timeout_ms, 600000, 'A short cap does not shorten the profile silence allowance');
  assert.equal(prepareBudget({ 'budget-profile': 'project', 'timeout-seconds': 900 }).idle_timeout_ms, 1200000);
  const explicitIdle = prepareBudget({ 'timeout-seconds': 900, 'idle-timeout-seconds': 60 });
  assert.equal(explicitIdle.idle_timeout_ms, 60000, 'An explicit shorter guard still wins');
  const totalCapped = activeState({ 'timeout-seconds': 900, 'budget-seconds': 300 });
  assert.equal(totalCapped.idle_timeout_ms, 900000);
  assert.equal(totalCapped.budget_ms, 300000, 'Raising the default guard never raises the total runtime cap');
  assert.equal(budgetSummary(totalCapped).peer_seconds_available, 300);
  assert.equal(prepareBudget({ 'timeout-policy': 'fixed', 'timeout-seconds': 900 }).idle_timeout_ms, null);
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

test('activity summaries distinguish uncapped time from zero and retain finite attempt limits', () => {
  const run = activeState();
  const idle = budgetSummary(run);
  assert.equal(idle.timeout_policy, 'activity');
  assert.equal(idle.idle_seconds, 600);
  for (const key of ['timeout_seconds', 'budget_seconds', 'peer_seconds_available', 'full_timeout_seconds_needed', 'full_timeout_headroom']) assert.equal(idle[key], null, key);
  assert.equal(idle.peer_seconds_reserved, 0);
  assert.equal(idle.assessment, 'ready_for_next_attempt');
  run.attempts.push({ number: 1, status: 'running', timeout_ms: null });
  const before = structuredClone(run), running = budgetSummary(run);
  assert.equal(running.peer_seconds_reserved, null);
  assert.equal(running.assessment, 'running_attempt_recorded');
  assert.equal(running.attempts_remaining, 3);
  assert.equal(running.attempts_sufficient, null);
  assert.equal(running.attempts_sufficient_if_running_fails, true);
  assert.deepEqual(JSON.parse(JSON.stringify(running)), running, 'No Infinity or NaN is hidden by JSON serialization');
  assert.deepEqual(run, before, 'Reading progress does not change accounting');
});

test('activity recovery retains unknown uncapped runtime without charging recovery downtime', () => {
  const run = activeState();
  run.elapsed_ms = 7000;
  run.attempts = [{ number: 1, status: 'running', timeout_ms: null, started_at: '2026-10-01T00:00:00.000Z', elapsed_ms: 1234 }];
  assert.equal(recoverInterruptedAttempts(run, at), 1);
  assert.equal(run.elapsed_ms, 8234);
  assert.equal(run.runtime_accounting_incomplete, true);
  assert.equal(run.attempts[0].runtime_charge_ms, null);
  assert.equal(run.attempts[0].runtime_known_ms, 1234);
  assert.equal(run.attempts[0].runtime_charge_basis, 'unknown_after_interruption');
  const summary = budgetSummary(run);
  assert.equal(summary.peer_seconds_used, null);
  assert.equal(summary.peer_seconds_used_known, 8);
  assert.equal(summary.assessment, 'ready_for_next_attempt');
  assert.match(summary.note, /total is unknown/);
  assert.equal(recoverInterruptedAttempts(run, '2099-01-01T00:00:00.000Z'), 0);
  assert.equal(run.elapsed_ms, 8234);
});

test('activity recovery without an observed duration marks unknown rather than inventing a duration', () => {
  const run = activeState();
  run.attempts = [{ status: 'running', timeout_ms: null }];
  recoverInterruptedAttempts(run, at);
  assert.equal(run.attempts[0].runtime_charge_ms, null);
  assert.equal(run.attempts[0].runtime_known_ms, 0);
  assert.equal(budgetSummary(run).peer_seconds_used, null);
  assert.equal(budgetSummary(run).peer_seconds_used_known, 0);
});

test('a finite total remains fully reserved and charged after an uncapped interrupted attempt', () => {
  const run = activeState({ 'budget-seconds': 100 });
  run.elapsed_ms = 11000;
  run.attempts = [{ number: 1, status: 'running', timeout_ms: null }];
  assert.equal(budgetSummary(run).peer_seconds_reserved, 89);
  assert.equal(budgetSummary(run).peer_seconds_available, 0);
  recoverInterruptedAttempts(run, at);
  assert.equal(run.attempts[0].runtime_charge_ms, 89000);
  assert.equal(run.attempts[0].runtime_charge_basis, 'remaining_budget_after_interruption');
  assert.equal(run.elapsed_ms, 100000);
  assert.equal(budgetSummary(run).assessment, 'runtime_exhausted');
  assert.equal(run.runtime_accounting_incomplete, undefined);
});

test('a total-only runtime cap discloses conservative recovery before any worker call', () => {
  const capped = activeState({ 'budget-seconds': 100 });
  const before = structuredClone(capped);
  const warning = budgetSummary(capped).recovery_warning;
  assert.match(warning, /reserves all remaining cumulative runtime/);
  assert.match(warning, /recovery can consume that entire remaining allowance/);
  assert.match(warning, /not measured model runtime/);
  assert.deepEqual(capped, before, 'The warning does not reserve or charge runtime');
  assert.equal(budgetSummary(activeState()).recovery_warning, null);
  assert.equal(budgetSummary(activeState({ 'timeout-seconds': 50, 'budget-seconds': 100 })).recovery_warning, null);
  assert.equal(budgetSummary(state()).recovery_warning, null);
});

test('new policy permits a hard deadline derived from a one-hour total and retains its charge', () => {
  const run = activeState({ 'budget-seconds': 3600 });
  run.attempts = [{ status: 'running', timeout_ms: 3600000 }];
  assert.equal(budgetSummary(run).peer_seconds_reserved, 3600);
  recoverInterruptedAttempts(run, at);
  assert.equal(run.elapsed_ms, 3600000);
  assert.equal(run.attempts[0].runtime_charge_basis, 'reserved_timeout_after_interruption');
  const legacy = state();
  legacy.attempts = [{ status: 'running', timeout_ms: 900001 }];
  assert.throws(() => budgetSummary(legacy), /reserved timeout/);
});

test('activity budget amendment preserves uncapped fields, policy and prior accounting', () => {
  const run = activeState();
  const before = structuredClone(run.initial_limits);
  assert.equal(extendBudget(run, { 'idle-timeout-seconds': 1200, 'max-attempts': 5, reason: 'Allow longer silent intervals.' }, at), true);
  assert.equal(run.idle_timeout_ms, 1200000);
  assert.equal(run.timeout_policy, 'activity');
  assert.equal(run.timeout_ms, null); assert.equal(run.budget_ms, null);
  assert.deepEqual(run.initial_limits, before);
  const amended = structuredClone(run);
  for (const changes of [{ 'timeout-seconds': 900 }, { 'budget-seconds': 3600 }, { 'timeout-policy': 'fixed' }, { 'idle-timeout-seconds': 1199 }]) {
    assert.throws(() => extendBudget(run, { ...changes, reason: 'An extension cannot tighten or replace the contract.' }, at), /cannot/);
    assert.deepEqual(run, amended);
  }
  const capped = activeState({ 'timeout-seconds': 100, 'budget-seconds': 200 });
  extendBudget(capped, { 'timeout-seconds': 200, 'budget-seconds': 300, reason: 'Raise existing explicit allowances.' }, at);
  assert.equal(capped.timeout_ms, 200000); assert.equal(capped.budget_ms, 300000);
  assert.equal(capped.idle_timeout_ms, 600000);
});

test('legacy contracts reject null timers and activity controls without mutation', () => {
  const legacy = state(), before = structuredClone(legacy);
  assert.equal(budgetSummary(legacy).timeout_policy, 'legacy');
  assert.equal(budgetSummary(legacy).idle_seconds, null);
  assert.throws(() => extendBudget(legacy, { 'idle-timeout-seconds': 900, reason: 'Cannot migrate in place.' }, at), /Legacy/);
  assert.deepEqual(legacy, before);
  for (const key of ['timeout_ms', 'budget_ms']) {
    const malformed = structuredClone(legacy); malformed[key] = null;
    assert.throws(() => budgetSummary(malformed), /Invalid/);
  }
  const running = structuredClone(legacy); running.attempts = [{ status: 'running', timeout_ms: null }];
  assert.throws(() => recoverInterruptedAttempts(running, at), /reserved timeout/);
  assert.equal(running.attempts[0].status, 'running');
});

test('invalid activity limits and interrupted accounting fail atomically', () => {
  for (const change of [{ timeout_policy: 'other' }, { idle_timeout_ms: null }, { idle_timeout_ms: 59000 }, { runtime_accounting_incomplete: 'yes' }]) {
    assert.throws(() => budgetSummary({ ...activeState(), ...change }), /invalid/i);
  }
  const run = activeState();
  run.attempts = [{ status: 'running', timeout_ms: 20000 }, { status: 'running', timeout_ms: null, elapsed_ms: -1 }];
  const before = structuredClone(run);
  assert.throws(() => recoverInterruptedAttempts(run, at), /known elapsed/);
  assert.deepEqual(run, before);
  const capped = activeState({ 'budget-seconds': 100 }); capped.runtime_accounting_incomplete = true;
  assert.equal(budgetSummary(capped).peer_seconds_available, 0, 'Unknown prior runtime cannot bypass a finite cap');
});
