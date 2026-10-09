import test from 'node:test';
import assert from 'node:assert/strict';
import { renderResult } from '../scripts/result.mjs';
import { aggregateUsage, extractUsage } from '../scripts/usage.mjs';

const reviewed = 'a'.repeat(64), delivered = 'b'.repeat(64);
function state(overrides = {}) {
  return { version: 7, coordinator: 'codex', peer: 'claude', mode: 'review', status: 'complete',
    seals: { 'coordinator-draft.json': reviewed, 'coordinator-review.json': reviewed, 'peer-review.json': reviewed,
      'security-review.json': reviewed, 'peer-verify.json': reviewed }, ...overrides };
}
function completion(overrides = {}) {
  return { outcome: 'complete_with_recorded_decisions', verification_stage: 'verify', peer_verdict: 'ready',
    delivered_plan_reviewed: true, changed_artifacts: [], unresolved: [], questions_raised_during_review: [],
    source_changes: [], unavailable_sources: [], evidence_requests: [],
    reviewed_hashes: { 'final-plan.md': reviewed, 'decisions.json': reviewed, 'security-review.json': reviewed },
    final_hashes: { 'final-plan.md': reviewed, 'decisions.json': reviewed, 'security-review.json': reviewed },
    security_review: { required: true, verdict: 'ready', limitations: [], open_questions: [] },
    project_assessment: { required: true, deployment: { status: 'production' },
      readiness: { status: 'gaps_found', scope: 'Restore rehearsals only.', gaps: ['Restore rehearsal has no observed passing result.'] },
      unknowns: ['Recovery-time objective is unconfirmed.'] },
    successful_peer_calls: 2, attempts_used: 3, peer_model_reports: [], plan_quality: { status: 'absent' },
    budget: { timeout_seconds: null, budget_seconds: null, idle_seconds: 600, max_attempts: 4, limit_changes: 1,
      peer_seconds_used: 23, peer_seconds_used_known: 23, runtime_accounting_incomplete: false },
    resource_usage: aggregateUsage([]), ...overrides };
}

test('result is a short index of the canonical plan, findings, assessment, reports and exact hash provenance', () => {
  const c = completion();
  const text = renderResult({ state: state(), completion: c });
  assert.match(text, /\[Open the revised plan\]\(final-plan.md\)/);
  assert.match(text, /\[Discussion and decisions\]\(DISCUSSION.md\)/);
  assert.match(text, /\[Full completion record\]\(completion.json\)/);
  assert.match(text, /\[Finding decisions\]\(decisions.json\)/);
  assert.match(text, /delivered plan matches/);
  assert.ok(text.includes(c.outcome));
  assert.match(text, /production/);
  assert.match(text, /Restore rehearsal has no observed passing result/);
  assert.match(text, /Recovery-time objective is unconfirmed/);
  for (const source of ['coordinator-draft.json', 'coordinator-review.json', 'peer-review.json', 'security-review.json', 'peer-verify.json', 'PROJECT_CONTEXT.md', 'project-assessment.json']) {
    assert.ok(text.includes(`](${source})`), source);
  }
  for (const name of Object.keys(c.final_hashes)) assert.ok(text.includes(`| [${name}](${name}) | \`${reviewed}\` | \`${reviewed}\` |`));
  assert.match(text, /not a correctness guarantee, consensus, or permission to implement or publish/);
  assert.match(text, /does not certify the implementation or prove proposed tests passed/);
  assert.doesNotMatch(text, /## Final plan|## Finding decisions/);
});

test('material revision and source warnings stay ahead of gate excerpts without exposing private paths', () => {
  const c = completion({ outcome: 'complete_with_unreviewed_revision', delivered_plan_reviewed: false,
    changed_artifacts: ['final-plan.md', 'decisions.json', 'security-review.json'],
    adjudications_changed_since_verification: true, plan_map_changed_since_verification: true, assurance_changed_since_verification: true, evidence_changed_since_verification: true,
    final_hashes: { 'final-plan.md': delivered, 'decisions.json': delivered, 'security-review.json': delivered },
    unverified_revision_reason: 'Worker allowance exhausted before revision review.', peer_verdict: 'needs_changes',
    source_changes: ['PRIVATE_SOURCE'], unavailable_sources: [{ path: 'PRIVATE_MISSING_SOURCE' }] });
  const text = renderResult({ state: state(), completion: c });
  const top = text.split('## Outstanding gates')[0];
  for (const phrase of ['Provisional revision', 'has not had another peer review', 'decision record was updated',
    'security review was updated', 'adjudications changed', 'plan map changed', 'assurance record changed', 'Evidence changed',
    'Source inputs have changed', 'inputs are missing or unreadable']) assert.ok(top.includes(phrase), phrase);
  assert.ok(text.includes(delivered));
  assert.doesNotMatch(text, /PRIVATE_SOURCE|PRIVATE_MISSING_SOURCE|delivered plan matches/);
});

test('many unresolved IDs and evidence statuses remain visible without duplicating long rationale prose', () => {
  const long = 'Repeated full detail belongs in the authoritative report. '.repeat(200);
  const unresolved = Array.from({ length: 150 }, (_, i) => ({ finding_id: `P-R${i + 1}`, severity: i % 2 ? 'major' : 'critical',
    disposition: 'unresolved', rationale: `RATIONALE_MARKER ${long}` }));
  const requests = Array.from({ length: 150 }, (_, i) => ({ id: `P-R-E${i + 1}`, status: i % 2 ? 'supplied' : 'unavailable',
    question: `QUESTION_MARKER ${long}`, reason: long, artifact: `evidence-${i + 1}.json` }));
  const c = completion({ unresolved, evidence_requests: requests, final_plan: `PLAN_MARKER ${long}`, decisions: unresolved,
    security_review: { required: true, verdict: 'insufficient_context', proposal_markdown: `SECURITY_MARKER ${long}`,
      limitations: Array.from({ length: 20 }, (_, i) => `${long} C-S${i + 1}`), open_questions: [] },
    questions_raised_during_review: Array.from({ length: 20 }, (_, i) => ({ source: 'peer-review.json', question: `${long} P-V${i + 1}` })) });
  const original = JSON.stringify(c);
  const text = renderResult({ state: state(), completion: c });
  assert.equal(JSON.stringify(c), original, 'No authoritative record is rewritten');
  for (const item of unresolved) assert.ok(text.includes(`${item.finding_id} (${item.severity})`), item.finding_id);
  for (const item of requests) assert.ok(text.includes(`| ${item.id} | ${item.status} | [${item.artifact}](${item.artifact}) |`), item.id);
  for (let i = 1; i <= 20; i++) assert.ok(text.includes(`C-S${i}`) && text.includes(`P-V${i}`), `Retain excerpt references ${i}`);
  assert.doesNotMatch(text, /RATIONALE_MARKER|PLAN_MARKER|SECURITY_MARKER|QUESTION_MARKER/);
  assert.match(text, /17 more in the linked record/);
  assert.ok(text.length < 26000, `Bounded result: ${text.length} characters for 150 findings and 150 evidence records`);
});

test('untrusted prose is inert and arbitrary sources and artifact names never become active links', () => {
  const attack = '<img src="https://evil.example/pixel"> ![tracking](https://evil.example)\n# Forged | [click](javascript:alert(1))';
  const c = completion({ unverified_revision_reason: attack,
    peer_model_reports: [{ attempt: 1, status: 'succeeded', reported: [attack] }],
    questions_raised_during_review: [{ source: attack, question: attack }],
    evidence_requests: [{ id: 'P-R-E1', status: 'unavailable', source: 'https://evil.example', artifact: '../outside.json' }],
    security_review: { required: true, verdict: 'insufficient_context', limitations: [attack], open_questions: [attack] },
    final_hashes: { 'final-plan.md': attack, 'https://evil.example': reviewed }, assurance: { status: attack, readiness: attack },
    spending_policy: { spending: attack } });
  const text = renderResult({ state: state({ coordinator_model: attack, seals: { [attack]: reviewed } }), completion: c });
  assert.doesNotMatch(text, /<img|!\[tracking\]|https:\/\/|javascript:|\n# Forged|\| \[click\]|outside.json/);
  assert.match(text, /&#60;img/);
  assert.match(text, /&#124;/);
  assert.match(text, /\| \[final-plan.md\]\(final-plan.md\) \| .* \| not recorded \|/);
});

test('unknown and legacy state does not gain a reviewed-plan, assessment or security assertion', () => {
  const c = completion({ delivered_plan_reviewed: undefined, reviewed_hashes: {}, final_hashes: {},
    project_assessment: { required: false }, security_review: { required: false, verdict: 'not_required_by_legacy_run',
      limitations: ['Legacy run: the mandatory security-review artifact was not enforced.'] } });
  const text = renderResult({ state: state({ version: 1, seals: {} }), completion: c, discussionAvailable: false });
  assert.match(text, /matches the peer-reviewed submission is not established/);
  assert.match(text, /Legacy run: no mandatory project assessment/);
  assert.match(text, /mandatory security-review artifact was not enforced/);
  assert.doesNotMatch(text, /\]\(DISCUSSION.md\)|\]\(PROJECT_CONTEXT.md\)|\]\(security-review.json\)/);
});

test('usage distinguishes counter coverage and failed attempts from whole-task usage or cost', () => {
  const observed = extractUsage('codex', JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 20,
    output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 110 } }));
  const usage = aggregateUsage([{ number: 1, status: 'failed', stage: 'review', usage_observation: observed },
    { number: 2, status: 'succeeded', stage: 'review' }]);
  const text = renderResult({ state: state(), completion: completion({ resource_usage: usage,
    budget: { timeout_seconds: null, budget_seconds: null, idle_seconds: 600, max_attempts: 4, limit_changes: 1,
      runtime_accounting_incomplete: true, peer_seconds_used: null, peer_seconds_used_known: 17 } }) });
  assert.match(text, /Observed terminal token subtotal: 110; attempts with total counters: 1; unknown attempts: 1/);
  assert.match(text, /Coverage: observed 1 · partial 0 · missing 1 · invalid 0 · ambiguous 0/);
  assert.match(text, /including failures and retries/);
  assert.match(text, /Coordinator research and synthesis.*are unobserved/);
  assert.match(text, /not whole-task usage, subscription cost, remaining quota, or savings/);
  assert.match(text, /per-call cap not set, cumulative cap not set, inactivity guard 600 seconds/);
  assert.match(text, /Recorded limit changes: 1; earlier attempts and runtime remain charged/);
  assert.match(text, /Runtime accounting: unknown total; known 17 seconds/);
  assert.doesNotMatch(text, /(?:NaN|Infinity|null) seconds/);
});
