// Explicit runtime allowances and recovery accounting. No process or model calls.
import { requiredStages } from './participants.mjs';
const required = (ok, message) => { if (!ok) throw new Error(message); };
const PROFILES = {
  standard: { timeout_ms: 300000, budget_ms: 900000, idle_timeout_ms: 600000, max_attempts: 4 },
  project: { timeout_ms: 600000, budget_ms: 2400000, idle_timeout_ms: 1200000, max_attempts: 5 },
};
const OPTIONS = [
  ['timeout-seconds', 'timeout_ms', 1000, 10, 900],
  ['budget-seconds', 'budget_ms', 1000, 10, 3600],
  ['max-attempts', 'max_attempts', 1, 1, 6],
];
const IDLE_OPTION = ['idle-timeout-seconds', 'idle_timeout_ms', 1000, 60, 3600];
const optionSet = state => state.timeout_policy === undefined ? OPTIONS : [...OPTIONS, IDLE_OPTION];
const limitsOf = state => Object.fromEntries(optionSet(state).map(([, key]) => [key, state[key]]));
const seconds = milliseconds => milliseconds === null ? null : milliseconds / 1000;
const permitsNull = (policy, key) => policy === 'activity' && ['timeout_ms', 'budget_ms'].includes(key)
  || policy === 'fixed' && key === 'idle_timeout_ms';

function parsedLimits(options, defaults, policy) {
  return Object.fromEntries(optionSet({ timeout_policy: policy }).map(([option, key, multiplier, min, max]) => {
    if (options[option] === undefined && defaults[key] === null && permitsNull(policy, key)) return [key, null];
    required(!(policy === 'fixed' && key === 'idle_timeout_ms'), 'idle-timeout-seconds requires the activity timeout policy');
    const n = options[option] === undefined ? defaults[key] / multiplier : Number(options[option]);
    required(Number.isInteger(n) && n >= min && n <= max, `${option} must be an integer between ${min} and ${max}`);
    return [key, n * multiplier];
  }));
}

export function prepareBudget(options) {
  const profile = options['budget-profile'] ?? 'standard';
  required(Object.hasOwn(PROFILES, profile), 'budget-profile must be standard or project');
  const policy = options['timeout-policy'] ?? 'activity';
  required(['activity', 'fixed'].includes(policy), 'timeout-policy must be activity or fixed');
  const defaults = { ...PROFILES[profile] };
  if (policy === 'activity') defaults.timeout_ms = defaults.budget_ms = null;
  else defaults.idle_timeout_ms = null;
  if (options['author-model'] && (options.mode ?? 'plan') === 'plan') defaults.max_attempts = 6;
  const limits = parsedLimits(options, defaults, policy);
  // An explicit call deadline must not be shortened by an implicit silence
  // allowance. An explicitly selected inactivity guard remains authoritative.
  if (policy === 'activity' && options['idle-timeout-seconds'] === undefined && limits.timeout_ms !== null) {
    limits.idle_timeout_ms = Math.max(limits.idle_timeout_ms, limits.timeout_ms);
  }
  return { ...limits, timeout_policy: policy, budget_profile: profile, initial_limits: { ...limits }, limit_history: [] };
}

function validateRunningTimeout(state, attempt) {
  required(state.timeout_policy === 'activity' && attempt.timeout_ms === null
    || Number.isInteger(attempt.timeout_ms) && attempt.timeout_ms > 0 && attempt.timeout_ms <= (state.timeout_policy === 'activity' ? 3600000 : 900000),
  'Running attempt has an invalid reserved timeout');
}

/** Recorded running attempts reserve time until completion or locked recovery. */
export function budgetSummary(state) {
  required(Number.isSafeInteger(state.elapsed_ms) && state.elapsed_ms >= 0, 'Run elapsed runtime must be a nonnegative safe integer');
  required(Array.isArray(state.attempts) && state.stages && typeof state.stages === 'object' && !Array.isArray(state.stages), 'Run budget evidence is invalid');
  required(['plan', 'review'].includes(state.mode), 'Run budget mode is invalid');
  required(state.limit_history === undefined || Array.isArray(state.limit_history), 'Run limit history must be an array');
  required(state.budget_profile === undefined || Object.hasOwn(PROFILES, state.budget_profile), 'Run budget profile is invalid');
  required(state.timeout_policy === undefined || ['activity', 'fixed'].includes(state.timeout_policy), 'Run timeout policy is invalid');
  required(state.runtime_accounting_incomplete === undefined || typeof state.runtime_accounting_incomplete === 'boolean', 'Run runtime accounting flag is invalid');
  const limits = limitsOf(state);
  for (const [option, key, multiplier, min, max] of optionSet(state)) {
    if (limits[key] === null && permitsNull(state.timeout_policy, key)) continue;
    required(!(state.timeout_policy === 'fixed' && key === 'idle_timeout_ms'), 'Invalid idle-timeout-seconds in fixed run state');
    required(Number.isInteger(limits[key]) && limits[key] >= min * multiplier && limits[key] <= max * multiplier, `Invalid ${option} in run state`);
  }
  const pending = requiredStages(state)
    .filter(stage => state.stages[stage]?.status !== 'succeeded');
  const running = state.attempts.filter(attempt => attempt.status === 'running');
  for (const attempt of running) validateRunningTimeout(state, attempt);
  const uncappedRunning = running.some(attempt => attempt.timeout_ms === null);
  const remainingMs = state.budget_ms === null ? null : Math.max(0, state.budget_ms - state.elapsed_ms);
  const reservedMs = uncappedRunning
    ? remainingMs : running.reduce((sum, attempt) => sum + attempt.timeout_ms, 0);
  const incomplete = state.runtime_accounting_incomplete === true;
  const availableMs = remainingMs === null ? null : incomplete ? 0 : Math.max(0, remainingMs - reservedMs);
  const fullTimeoutMs = state.timeout_ms === null ? null : pending.length * state.timeout_ms;
  const attemptsRemaining = Math.max(0, state.max_attempts - state.attempts.length);
  return {
    profile: state.budget_profile ?? 'legacy',
    timeout_policy: state.timeout_policy ?? 'legacy',
    timeout_seconds: seconds(state.timeout_ms),
    budget_seconds: seconds(state.budget_ms),
    idle_seconds: state.timeout_policy === undefined ? null : seconds(state.idle_timeout_ms),
    max_attempts: state.max_attempts,
    pending_stages: pending,
    successful_calls_remaining: pending.length,
    attempts_remaining: attemptsRemaining,
    attempts_sufficient: running.length ? null : attemptsRemaining >= pending.length,
    attempts_sufficient_if_running_fails: running.length ? attemptsRemaining >= pending.length : null,
    assessment: running.length ? 'running_attempt_recorded' : !pending.length ? 'stages_complete' : attemptsRemaining < pending.length ? 'insufficient_attempts' : availableMs !== null && availableMs < 10000 ? 'runtime_exhausted' : 'ready_for_next_attempt',
    peer_seconds_used: incomplete ? null : Math.round(state.elapsed_ms / 1000),
    peer_seconds_used_known: Math.round(state.elapsed_ms / 1000),
    runtime_accounting_incomplete: incomplete,
    peer_seconds_reserved: seconds(reservedMs),
    peer_seconds_available: availableMs === null ? null : Math.floor(availableMs / 1000),
    full_timeout_seconds_needed: seconds(fullTimeoutMs),
    full_timeout_headroom: availableMs === null || fullTimeoutMs === null ? null : availableMs >= fullTimeoutMs,
    recovery_warning: state.timeout_policy === 'activity' && state.timeout_ms === null && state.budget_ms !== null
      ? 'Without a per-call deadline, a call reserves all remaining cumulative runtime. If the runner exits before saving completion, recovery can consume that entire remaining allowance even if the worker ran for less time. This is conservative allowance accounting, not measured model runtime; preserve the interrupted attempt and resume only within an authorized extension.'
      : null,
    activity_visibility_note: state.timeout_policy === 'activity' && (state.peer === 'codex' || state.author_model && state.coordinator === 'codex')
      ? 'Historical Codex CLI capture showed final output only; current-version mid-call activity is not established. If this worker stays silent until completion, the idle guard is the effective call deadline. For a long review, an authorized --idle-timeout-seconds value up to 3600 may help; it cannot guarantee completion or override hard caps.'
      : null,
    recorded_running_attempts: running.map(attempt => attempt.number),
    limit_changes: state.limit_history?.length ?? 0,
    note: incomplete
      ? 'At least one interrupted uncapped attempt has unknown runtime. Known accounting is retained separately; the total is unknown. Time and attempt allowances are not token or spending caps.'
      : state.timeout_policy === 'activity'
        ? 'Meaningful activity renews the inactivity guard; only explicitly configured hard deadlines cap total runtime. Null time values mean no configured cap or an unknown reservation/headroom, never zero. Activity is not validated completion, and these allowances are not token or spending caps.'
        : running.length
          ? 'Recorded running attempts reserve their full timeout. They may still be active or require locked recovery; these counts are conservative. Time headroom is an allowance, not a completion or cost guarantee.'
          : 'Time headroom is advisory: calls may finish early or fail. These allowances do not guarantee completion and are not token or spending caps.',
  };
}

/** Call only under the run lock, then persist before validation can reject work. */
export function recoverInterruptedAttempts(state, at) {
  budgetSummary(state);
  const interrupted = state.attempts.filter(attempt => attempt.status === 'running');
  // Validate all charges before changing any record. Recovery time includes
  // downtime and cannot establish how long an uncapped worker actually ran.
  let recoveredTotal = state.elapsed_ms;
  const charges = interrupted.map(attempt => {
    validateRunningTimeout(state, attempt);
    let charge = attempt.timeout_ms, basis = 'reserved_timeout_after_interruption', unknown = false;
    if (charge === null && state.budget_ms !== null) {
      charge = Math.max(0, state.budget_ms - recoveredTotal);
      basis = 'remaining_budget_after_interruption';
    } else if (charge === null) {
      charge = attempt.elapsed_ms ?? 0;
      required(Number.isSafeInteger(charge) && charge >= 0, 'Interrupted attempt has invalid known elapsed runtime');
      basis = 'unknown_after_interruption'; unknown = true;
    }
    recoveredTotal += charge;
    required(Number.isSafeInteger(recoveredTotal), 'Recovered runtime would exceed a safe integer');
    return { charge, basis, unknown };
  });
  for (const [index, attempt] of interrupted.entries()) {
    const { charge, basis, unknown } = charges[index];
    attempt.status = 'interrupted';
    attempt.error = 'Previous runner exited before recording completion';
    attempt.recovered_at = at;
    attempt.runtime_charge_ms = unknown ? null : charge;
    attempt.runtime_charge_basis = basis;
    if (unknown) {
      attempt.runtime_known_ms = charge;
      state.runtime_accounting_incomplete = true;
    }
    state.elapsed_ms += charge;
  }
  if (interrupted.length) state.status = 'peer_failed';
  return interrupted.length;
}

/** Amend absolute totals; never remove used allowance or change sealed evidence. */
export function extendBudget(state, options, at) {
  budgetSummary(state);
  required(typeof options.reason === 'string' && options.reason.trim().length > 0 && options.reason.length <= 500 && !/[\u0000-\u001f\u007f]/.test(options.reason), 'extend requires a nonempty --reason of at most 500 characters on one line');
  required(options['timeout-policy'] === undefined, 'extend cannot change the timeout policy');
  required(!(state.timeout_policy === undefined && options['idle-timeout-seconds'] !== undefined), 'Legacy runs retain their original timeout contract');
  const fields = optionSet(state);
  required(fields.some(([option]) => options[option] !== undefined), 'extend requires at least one absolute limit');
  const before = limitsOf(state);
  const after = parsedLimits(options, before, state.timeout_policy);
  for (const [option, key] of fields) required(before[key] === null ? after[key] === null : after[key] !== null && after[key] >= before[key], `extend cannot decrease ${option} or replace an uncapped limit; previous attempts and runtime must remain charged`);
  if (fields.every(([, key]) => after[key] === before[key])) return false;
  state.initial_limits ??= { ...before };
  state.limit_history ??= [];
  state.limit_history.push({ at, reason: options.reason.trim(), before, after: { ...after }, attempts_used: state.attempts.length, elapsed_ms: state.elapsed_ms });
  Object.assign(state, after);
  return true;
}
