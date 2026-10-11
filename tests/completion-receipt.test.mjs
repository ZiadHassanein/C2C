import test from 'node:test';
import assert from 'node:assert/strict';
import { completionReceipt } from '../scripts/completion-receipt.mjs';
import { aggregateUsage, extractUsage } from '../scripts/usage.mjs';

const hash = 'a'.repeat(64);
const observed = extractUsage('codex', JSON.stringify({ type: 'turn.completed', usage: {
  input_tokens: 100, cached_input_tokens: 60, output_tokens: 20, reasoning_output_tokens: 5,
} }));
const completeUsage = () => aggregateUsage([{ number: 1, stage: 'review', status: 'succeeded', elapsed_ms: 12, usage_observation: observed }]);
function result(overrides = {}) {
  return { run: '/workspace/run', plan: '/workspace/run/final-plan.md', discussion: '/workspace/run/DISCUSSION.md', result: '/workspace/run/RESULT.md',
    completed_at: '2026-10-11T12:00:00.000Z', outcome: 'complete_with_recorded_decisions',
    verification_stage: 'verify', delivered_plan_reviewed: true, peer_verdict: 'ready',
    changedSinceVerification: false, changed_artifacts: [], plan_changed_since_verification: false,
    decisions_changed_since_verification: false, adjudications_changed_since_verification: false,
    plan_map_changed_since_verification: false, assurance_changed_since_verification: false, evidence_changed_since_verification: false,
    unverified_revision_reason: null, reviewed_hashes: { 'final-plan.md': hash }, final_hashes: { 'final-plan.md': hash },
    unresolved: [], questions_raised_during_review: [], source_changes: [], unavailable_sources: [], evidence_requests: [],
    security_review: { required: true, verdict: 'ready', limitations: [], open_questions: [], changed_since_verification: false },
    plan_quality: { status: 'not_recorded', issues: [], issues_truncated: false, counts: {}, gated_steps: [], full_context_required: true,
      limitation: 'Structure does not prove feasibility.' },
    assurance: { status: 'recorded', readiness: 'ready_for_review', issues: [], issues_truncated: false,
      counts: { passed: 1, failed: 0, blocked: 0 }, evidence_receipts: [{ id: 'E1', sha256: hash, observed_revision: 'r1' }],
      limitation: 'Coordinator observations are not independently attested.' },
    participants: { coordinator: { provider: 'codex', model: 'gpt-6.1-sol', identity_status: 'declared' },
      peer: { provider: 'codex', model: 'gpt-6-astra', identity_status: 'requested' } },
    worker_effort: { selection: { peer: { requested: 'medium' } }, attempts: [{ attempt: 1, requested_effort: 'medium', effective_effort: null, effective_effort_status: 'unreported' }] },
    peer_model_reports: [{ attempt: 1, requested: 'gpt-6-astra', reported: [], identity_status: 'unreported', status: 'succeeded' }],
    spending_policy: { version: 1, spending: 'included-only' },
    attempt_spending_policies: [{ attempt: 1, status: 'succeeded', policy: { spending: 'included-only' }, allowance_evidence_sha256: hash }],
    budget: { max_attempts: 4, peer_seconds_used: 12, runtime_accounting_incomplete: false }, limit_history: [],
    successful_peer_calls: 2, attempts_used: 2, context_profile: 'full', purpose: 'planning', resource_usage: completeUsage(),
    project_assessment: { required: true, assessed_at: '2026-10-10T12:00:00Z', summary: 'BACKGROUND_SUMMARY '.repeat(200), project_type: 'software',
      deployment: { status: 'unknown', evidence: [] },
      readiness: { status: 'gaps_found', scope: 'Supplied snapshot only.', gaps: ['Restore remains blocked by missing data.'], evidence: ['E1'] },
      evidence: [{ id: 'E1', source: 'SOURCE_BACKGROUND', observation: 'BACKGROUND_EVIDENCE '.repeat(200), kind: 'observed' }],
      direction: { route: 'extend_existing', clarity: 'discovery_needed', goal: 'BACKGROUND_GOAL', scope: ['BACKGROUND_SCOPE'],
        success_criteria: ['BACKGROUND_CRITERION'], constraints: ['BACKGROUND_CONSTRAINT'], next_step: 'Frozen assessment step; consult final plan for the current action.' },
      unknowns: ['Ownership confirmation is needed before implementation.'] },
    note: 'Workflow completion is not a correctness guarantee or permission to implement or publish.', ...overrides };
}

test('receipt removes repeated assessment prose while preserving readiness scope, gaps and every unknown', () => {
  const input = result();
  const receipt = completionReceipt(input);
  const text = JSON.stringify(receipt);
  for (const marker of ['BACKGROUND_SUMMARY', 'BACKGROUND_EVIDENCE', 'SOURCE_BACKGROUND', 'BACKGROUND_GOAL', 'BACKGROUND_SCOPE', 'BACKGROUND_CRITERION']) assert.ok(!text.includes(marker), marker);
  assert.deepEqual(receipt.project_assessment.readiness, { status: 'gaps_found', scope: 'Supplied snapshot only.', gaps: input.project_assessment.readiness.gaps });
  assert.deepEqual(receipt.project_assessment.unknowns, input.project_assessment.unknowns);
  assert.equal(receipt.project_assessment.direction.next_step, input.project_assessment.direction.next_step);
  assert.equal(receipt.project_assessment.direction.clarity, 'discovery_needed');
  assert.equal(receipt.project_assessment.deployment.status, 'unknown');
  assert.match(receipt.receipt_note, /frozen pre-planning/);
  assert.ok(!receipt.next_actions.some(action => JSON.stringify(action).includes(input.project_assessment.direction.next_step)), 'Historical assessment step is not promoted to an execution instruction');
});

test('unreviewed changes, exact hash boundary and reasons remain intact without another review instruction', () => {
  const changed = { outcome: 'complete_with_unreviewed_revision', delivered_plan_reviewed: false, changedSinceVerification: true,
    changed_artifacts: ['final-plan.md', 'security-review.json', 'decisions.json'], plan_changed_since_verification: true,
    decisions_changed_since_verification: true, adjudications_changed_since_verification: true, plan_map_changed_since_verification: true,
    assurance_changed_since_verification: true, evidence_changed_since_verification: true,
    final_hashes: { 'final-plan.md': 'b'.repeat(64) }, unverified_revision_reason: 'The original worker allowance is exhausted; revised material remains unreviewed.' };
  const receipt = completionReceipt(result(changed));
  for (const [key, value] of Object.entries(changed)) assert.deepEqual(receipt[key], value, key);
  assert.ok(receipt.next_actions.some(item => item.action === 'disclose_unreviewed_revision'));
  assert.ok(receipt.next_actions.every(item => !Object.hasOwn(item, 'command')), 'Receipt never starts or resets a review stage');
});

test('unresolved findings, evidence reasons and attributed review questions are never excerpted', () => {
  const long = 'Important gate detail. '.repeat(300);
  const input = result({ outcome: 'complete_with_unresolved_findings',
    unresolved: Array.from({ length: 12 }, (_, i) => ({ finding_id: `P-V${i + 1}`, severity: 'major', disposition: 'unresolved', rationale: `${long} Unique limit ${i}.` })),
    questions_raised_during_review: [{ source: 'peer-review.json', question: long }, { source: 'peer-verify.json', question: 'Prior question remains unresolved.' }],
    evidence_requests: [{ id: 'P-R-E1', status: 'unavailable', reason: long, question: 'Supply scope evidence.', source: 'peer-review.json' },
      { id: 'P-R-E2', status: 'rejected', reason: 'Broader access was not authorized.' }],
    source_changes: ['/workspace/source.ts'], unavailable_sources: [{ path: '/workspace/missing.ts', reason: 'unreadable' }] });
  const receipt = completionReceipt(input);
  for (const key of ['outcome', 'unresolved', 'questions_raised_during_review', 'evidence_requests', 'source_changes', 'unavailable_sources']) assert.deepEqual(receipt[key], input[key], key);
  assert.ok(receipt.next_actions.some(item => item.action === 'retain_unresolved_gates'));
});

test('security blockers, assurance failures and structural warnings retain their full detail and truncation flags', () => {
  const input = result({ security_review: { required: true, verdict: 'insufficient_context', limitations: ['Permission boundary unverified.'], open_questions: ['Who owns approval?'], changed_since_verification: true },
    plan_quality: { status: 'invalid', issues: [{ code: 'unanchored_step', node: 'S2' }], issues_truncated: true, warnings: ['Additional failures remain.'], gated_steps: ['S2'] },
    assurance: { status: 'recorded', readiness: 'needs_changes', issues: [], issues_truncated: false, counts: { failed: 1, blocked: 2 },
      evidence_receipts: [{ id: 'E9', status: 'failed', observed_revision: 'old', sha256: hash }], limitation: 'A recorded check failure remains a failure.' },
    warnings: ['Discussion refresh failed.'], errors: ['Delivery artifact missing.'] });
  const receipt = completionReceipt(input);
  for (const key of ['security_review', 'plan_quality', 'assurance', 'warnings', 'errors']) assert.deepEqual(receipt[key], input[key], key);
  assert.ok(receipt.next_actions.some(item => item.action === 'disclose_recorded_limits'));
});

test('failed and unknown usage coverage, cached subsets and unreported identity/effort stay unchanged', () => {
  const usage = aggregateUsage([{ number: 1, stage: 'review', status: 'failed', elapsed_ms: 30, usage_observation: observed },
    { number: 2, stage: 'review', status: 'succeeded', elapsed_ms: null }]);
  const input = result({ resource_usage: usage, attempts_used: 2, budget: { max_attempts: 4, peer_seconds_used: null, peer_seconds_used_known: 0.03, runtime_accounting_incomplete: true },
    limit_history: [{ reason: 'Original authorization', max_attempts: 4 }] });
  const receipt = completionReceipt(input);
  assert.deepEqual(receipt.resource_usage, usage);
  assert.equal(receipt.resource_usage.counters.total_tokens.observed_sum, 120);
  assert.equal(receipt.resource_usage.counters.total_tokens.unknown_attempts, 1);
  assert.equal(receipt.resource_usage.counters.total_tokens.complete, false);
  assert.equal(receipt.resource_usage.coordinator.status, 'unobserved');
  assert.equal(receipt.resource_usage.provider_internal_calls, null);
  for (const key of ['participants', 'worker_effort', 'peer_model_reports', 'spending_policy', 'attempt_spending_policies', 'budget', 'limit_history']) assert.deepEqual(receipt[key], input[key], key);
  assert.ok(receipt.next_actions.some(item => item.action === 'disclose_incomplete_usage'));
});

test('complete worker totals retain their limited scope without a false incomplete-counter warning', () => {
  const usage = completeUsage();
  const receipt = completionReceipt(result({ resource_usage: usage }));
  assert.equal(usage.counters.total_tokens.complete, true);
  assert.equal(usage.counters.input_tokens_cache_write.complete, false);
  assert.deepEqual(receipt.resource_usage, usage);
  assert.equal(receipt.resource_usage.scope, 'recorded_worker_attempts_only');
  assert.equal(receipt.resource_usage.coordinator.status, 'unobserved');
  assert.equal(receipt.resource_usage.provider_internal_calls, null);
  assert.equal(receipt.resource_usage.subscription_cost, null);
  assert.equal(receipt.resource_usage.savings, null);
  assert.ok(!receipt.next_actions.some(item => item.action === 'disclose_incomplete_usage'));
});

test('all three supplied paths remain exact and missing discussion is visible without invented files', () => {
  const input = result({ discussion: null });
  const receipt = completionReceipt(input);
  for (const key of ['plan', 'discussion', 'result']) assert.equal(receipt[key], input[key]);
  assert.deepEqual(receipt.next_actions.find(item => item.action === 'report_missing_artifact_paths').artifacts, ['discussion']);
  assert.deepEqual(receipt.next_actions.find(item => item.action === 'deliver_available_artifact_paths').artifacts, ['plan', 'result']);
  const absent = completionReceipt({ outcome: 'legacy' });
  assert.equal(absent.plan, null); assert.equal(absent.discussion, null); assert.equal(absent.result, null);
  assert.equal(absent.project_assessment, null);
  assert.equal(absent.delivered_plan_reviewed, undefined);
  assert.equal(absent.resource_usage, undefined);
});

test('projection is deterministic and does not mutate or retain mutable aliases to completion', () => {
  const input = result();
  const original = structuredClone(input);
  const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } };
  freeze(input);
  const receipt = completionReceipt(input);
  assert.deepEqual(receipt, completionReceipt(input));
  assert.deepEqual(input, original);
  receipt.unresolved.push({ finding_id: 'P-V99' });
  receipt.project_assessment.readiness.gaps.push('Added only to display object.');
  receipt.resource_usage.attempts.failed = 900;
  assert.deepEqual(input, original);
});

test('future material fields and upstream next actions survive the display projection', () => {
  const input = result({ future_critical_warning: { state: 'blocked', reason: 'Preserve future material warning.' },
    next_actions: [{ action: 'existing_required_gate', reason: 'Must not disappear.' }],
    recorded_next_actions: [{ action: 'older_gate', reason: 'This field also remains unchanged.' }] });
  input.project_assessment.future_blocker = 'Unrecognized but potentially material.';
  input.project_assessment.readiness.future_warning = 'Keep nested warning.';
  const receipt = completionReceipt(input);
  assert.deepEqual(receipt.future_critical_warning, input.future_critical_warning);
  assert.deepEqual(receipt.next_actions, input.next_actions);
  assert.deepEqual(receipt.recorded_next_actions, input.recorded_next_actions);
  assert.ok(receipt.receipt_delivery_actions.some(item => item.action === 'deliver_available_artifact_paths'));
  assert.equal(receipt.project_assessment.future_blocker, input.project_assessment.future_blocker);
  assert.equal(receipt.project_assessment.readiness.future_warning, input.project_assessment.readiness.future_warning);
});

test('legacy assessment and security do not gain an observed-readiness or security assertion', () => {
  const input = result({ project_assessment: { required: false, summary: 'Legacy context', deployment: { status: 'unknown' },
    readiness: { status: 'not_assessed', scope: 'Unknown scope', gaps: [] }, unknowns: ['No mandatory assessment was recorded.'] },
    security_review: { required: false, verdict: 'not_required_by_legacy_run', limitations: ['Mandatory security review was not enforced.'] },
    assurance: { status: 'not_recorded', readiness: 'incomplete', issues: [] } });
  const receipt = completionReceipt(input);
  assert.equal(receipt.project_assessment.required, false);
  assert.equal(receipt.project_assessment.readiness.status, 'not_assessed');
  assert.deepEqual(receipt.project_assessment.unknowns, input.project_assessment.unknowns);
  assert.deepEqual(receipt.security_review, input.security_review);
  assert.deepEqual(receipt.assurance, input.assurance);
});

test('receipt rejects non-object inputs rather than manufacturing a completion', () => {
  for (const input of [undefined, null, [], 'complete', 1]) assert.throws(() => completionReceipt(input), /finish result object/);
});
