// Explicit runtime allowances and recovery accounting. No process or model calls.
import { requiredStages } from './participants.mjs';
const required = (ok, message) => { if (!ok) throw new Error(message); };
const PROFILES = {
  standard: { timeout_ms: 300000, budget_ms: 900000, max_attempts: 4 },
  project: { timeout_ms: 600000, budget_ms: 2400000, max_attempts: 5 },
};
const OPTIONS = [
  ['timeout-seconds', 'timeout_ms', 1000, 10, 900],
  ['budget-seconds', 'budget_ms', 1000, 10, 3600],
  ['max-attempts', 'max_attempts', 1, 1, 6],
];
const limitsOf = state => Object.fromEntries(OPTIONS.map(([, key]) => [key, state[key]]));

function parsedLimits(options, defaults) {
  return Object.fromEntries(OPTIONS.map(([option, key, multiplier, min, max]) => {
    const n = options[option] === undefined ? defaults[key] / multiplier : Number(options[option]);
    required(Number.isInteger(n) && n >= min && n <= max, `${option} must be an integer between ${min} and ${max}`);
    return [key, n * multiplier];
  }));
}

export function prepareBudget(options) {
  const profile = options['budget-profile'] ?? 'standard';
  required(Object.hasOwn(PROFILES, profile), 'budget-profile must be standard or project');
  const defaults = { ...PROFILES[profile] };
  if (options['author-model'] && (options.mode ?? 'plan') === 'plan') defaults.max_attempts = 6;
  const limits = parsedLimits(options, defaults);
  return { ...limits, budget_profile: profile, initial_limits: { ...limits }, limit_history: [] };
}

/** Recorded running attempts reserve time until completion or locked recovery. */
export function budgetSummary(state) {
  required(Number.isSafeInteger(state.elapsed_ms) && state.elapsed_ms >= 0, 'Run elapsed runtime must be a nonnegative safe integer');
  required(Array.isArray(state.attempts) && state.stages && typeof state.stages === 'object' && !Array.isArray(state.stages), 'Run budget evidence is invalid');
  required(['plan', 'review'].includes(state.mode), 'Run budget mode is invalid');
  required(state.limit_history === undefined || Array.isArray(state.limit_history), 'Run limit history must be an array');
  required(state.budget_profile === undefined || Object.hasOwn(PROFILES, state.budget_profile), 'Run budget profile is invalid');
  const limits = limitsOf(state);
  for (const [option, key, multiplier, min, max] of OPTIONS) {
    required(Number.isInteger(limits[key]) && limits[key] >= min * multiplier && limits[key] <= max * multiplier, `Invalid ${option} in run state`);
  }
  const pending = requiredStages(state)
    .filter(stage => state.stages[stage]?.status !== 'succeeded');
  const running = state.attempts.filter(attempt => attempt.status === 'running');
  for (const attempt of running) required(Number.isInteger(attempt.timeout_ms) && attempt.timeout_ms > 0 && attempt.timeout_ms <= 900000, 'Running attempt has an invalid reserved timeout');
  const reservedMs = running.reduce((sum, attempt) => sum + attempt.timeout_ms, 0);
  const availableMs = Math.max(0, state.budget_ms - state.elapsed_ms - reservedMs);
  const attemptsRemaining = Math.max(0, state.max_attempts - state.attempts.length);
  return {
    profile: state.budget_profile ?? 'legacy',
    timeout_seconds: state.timeout_ms / 1000,
    budget_seconds: state.budget_ms / 1000,
    max_attempts: state.max_attempts,
    pending_stages: pending,
    successful_calls_remaining: pending.length,
    attempts_remaining: attemptsRemaining,
    attempts_sufficient: running.length ? null : attemptsRemaining >= pending.length,
    attempts_sufficient_if_running_fails: running.length ? attemptsRemaining >= pending.length : null,
    assessment: running.length ? 'running_attempt_recorded' : !pending.length ? 'stages_complete' : attemptsRemaining < pending.length ? 'insufficient_attempts' : availableMs < 1000 ? 'runtime_exhausted' : 'ready_for_next_attempt',
    peer_seconds_used: Math.round(state.elapsed_ms / 1000),
    peer_seconds_reserved: reservedMs / 1000,
    peer_seconds_available: Math.floor(availableMs / 1000),
    full_timeout_seconds_needed: pending.length * state.timeout_ms / 1000,
    full_timeout_headroom: availableMs >= pending.length * state.timeout_ms,
    recorded_running_attempts: running.map(attempt => attempt.number),
    limit_changes: state.limit_history?.length ?? 0,
    note: running.length
      ? 'Recorded running attempts reserve their full timeout. They may still be active or require locked recovery; these counts are conservative. Time headroom is an allowance, not a completion or cost guarantee.'
      : 'Time headroom is advisory: calls may finish early or fail. These allowances do not guarantee completion and are not token or spending caps.',
  };
}

/** Call only under the run lock, then persist before validation can reject work. */
export function recoverInterruptedAttempts(state, at) {
  budgetSummary(state);
  const interrupted = state.attempts.filter(attempt => attempt.status === 'running');
  for (const attempt of interrupted) required(Number.isInteger(attempt.timeout_ms) && attempt.timeout_ms > 0 && attempt.timeout_ms <= 900000, 'Running attempt has an invalid reserved timeout');
  required(Number.isSafeInteger(state.elapsed_ms + interrupted.reduce((sum, attempt) => sum + attempt.timeout_ms, 0)), 'Recovered runtime would exceed a safe integer');
  for (const attempt of interrupted) {
    attempt.status = 'interrupted';
    attempt.error = 'Previous runner exited before recording completion';
    attempt.recovered_at = at;
    attempt.runtime_charge_ms = attempt.timeout_ms;
    attempt.runtime_charge_basis = 'reserved_timeout_after_interruption';
    state.elapsed_ms += attempt.timeout_ms;
  }
  if (interrupted.length) state.status = 'peer_failed';
  return interrupted.length;
}

/** Amend absolute totals; never remove used allowance or change sealed evidence. */
export function extendBudget(state, options, at) {
  budgetSummary(state);
  required(typeof options.reason === 'string' && options.reason.trim().length > 0 && options.reason.length <= 500 && !/[\u0000-\u001f\u007f]/.test(options.reason), 'extend requires a nonempty --reason of at most 500 characters on one line');
  required(OPTIONS.some(([option]) => options[option] !== undefined), 'extend requires at least one absolute limit');
  const before = limitsOf(state);
  const after = parsedLimits(options, before);
  for (const [option, key] of OPTIONS) required(after[key] >= before[key], `extend cannot decrease ${option}; previous attempts and runtime must remain charged`);
  if (OPTIONS.every(([, key]) => after[key] === before[key])) return false;
  state.initial_limits ??= { ...before };
  state.limit_history ??= [];
  state.limit_history.push({ at, reason: options.reason.trim(), before, after: { ...after }, attempts_used: state.attempts.length, elapsed_ms: state.elapsed_ms });
  Object.assign(state, after);
  return true;
}
