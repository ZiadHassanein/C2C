// Compact completion view. No filesystem reads, model calls, or source mutation.
import { escapeAuthoredText as authored, excerptAuthoredText as excerpt } from './discussion.mjs';
import { participantLabel } from './participants.mjs';

const REPORTS = ['coordinator-draft.json', 'peer-draft.json', 'coordinator-review.json', 'peer-review.json',
  'security-review.json', 'peer-verify.json', 'peer-verify-final.json'];
const ARTIFACTS = ['final-plan.md', 'decisions.json', 'security-review.json'];
const OUTCOMES = ['complete_with_recorded_decisions', 'complete_with_unresolved_findings', 'complete_with_unreviewed_revision'];
const array = value => Array.isArray(value) ? value : [];
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 'unknown';
const seconds = value => value === null || value === undefined ? 'not set'
  : typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `${value} seconds` : 'unknown';
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? `\`${value}\`` : 'not recorded';
const sourceLink = source => REPORTS.includes(source) || /^evidence-[1-9][0-9]*\.json$/.test(source || '')
  ? `[${source}](${source})` : '[completion record](completion.json)';

// A few explicitly labelled excerpts locate the gate; complete lists stay in
// their authoritative records. Keep all finding references even beyond a cut.
function detailExcerpts(lines, label, values, source, limit = 3) {
  const items = array(values);
  if (!items.length) return;
  lines.push(`- **${label}: ${items.length}.** ${items.slice(0, limit).map(value => excerpt(value, 140)).join(' · ')}${items.length > limit
    ? ` … ${items.length - limit} more in the linked record.${omittedReferences(items.slice(limit))}` : ''} ${source}`);
}
function omittedReferences(values) {
  const ids = [...new Set(values.flatMap(value => String(value).match(/\b[CP]-[DRVSF](?:-E)?[1-9][0-9]*\b/g) || []))];
  return ids.length ? ` References: ${ids.map(authored).join(', ')}.` : '';
}

/** Inputs are validated completion data supplied by finish. Prose remains inert.
 * RESULT is an index/status record; final-plan.md is the sole plan deliverable.
 */
export function renderResult({ state, completion = state.completion, discussionAvailable = true,
  projectContextAvailable = state.version >= 3 }) {
  const c = completion || {};
  const changed = new Set(array(c.changed_artifacts));
  const security = c.security_review || {};
  const assessment = c.project_assessment || {};
  const budget = c.budget || {};
  const lines = ['# C2C — result', '', '[Open the revised plan](final-plan.md)',
    ...(discussionAvailable ? ['[Discussion and decisions](DISCUSSION.md)'] : []),
    '[Full completion record](completion.json) · [Finding decisions](decisions.json)', '',
    `**Outcome:** ${OUTCOMES.includes(c.outcome) ? `\`${c.outcome}\`` : excerpt(c.outcome || 'not recorded', 100)}.`,
    `**Final peer verdict:** ${authored(c.peer_verdict || 'not recorded')}. **Security review:** ${authored(security.verdict || 'not recorded')}.`, ''];

  if (c.unverified_revision_reason) lines.push(`**Provisional revision:** ${excerpt(c.unverified_revision_reason, 500)}`, '');
  if (changed.has('final-plan.md') || c.plan_changed_since_verification || c.delivered_plan_reviewed === false) {
    lines.push('The final plan was revised after peer verification; the delivered revision has not had another peer review.', '');
  } else if (c.delivered_plan_reviewed === true) {
    lines.push('The delivered plan matches the version used for the final peer review.', '');
  } else lines.push('Whether the delivered plan matches the peer-reviewed submission is not established in this record.', '');
  if (changed.has('decisions.json') || c.decisions_changed_since_verification) lines.push('The decision record was updated after peer verification.', '');
  if (changed.has('security-review.json') || security.changed_since_verification) lines.push('The security review was updated by the coordinator after peer verification; this revision has not been peer-reviewed.', '');
  if (c.adjudications_changed_since_verification) lines.push('Earlier finding adjudications changed after peer verification.', '');
  if (c.plan_map_changed_since_verification) lines.push('The recorded plan map changed after peer verification.', '');
  if (c.assurance_changed_since_verification) lines.push('The assurance record changed after peer verification; its current checks have not been reviewed again.', '');
  if (c.evidence_changed_since_verification) lines.push('Evidence changed after peer verification; dependent conclusions need review.', '');
  if (array(c.source_changes).length) lines.push(`Source inputs have changed since the snapshot (${c.source_changes.length}); this plan uses the saved snapshot. [Changed-source records](completion.json)`, '');
  if (array(c.unavailable_sources).length) lines.push(`Some original inputs are missing or unreadable (${c.unavailable_sources.length}); their current contents could not be compared. [Unavailable-source records](completion.json)`, '');
  lines.push('Workflow completion is not a correctness guarantee, consensus, or permission to implement or publish. Security review assesses the plan; it does not certify the implementation or prove proposed tests passed.', '');

  if (c.assurance) lines.push(`Assurance: **${excerpt(c.assurance.status || 'not recorded', 100)}**. Readiness: **${excerpt(c.assurance.readiness || 'not recorded', 100)}**. [Assurance record](completion.json)`, '');
  if (c.spending_policy) lines.push(`Prepared spending policy: **${excerpt(c.spending_policy.spending || 'not recorded', 100)}**. Each attempt records its effective restriction and any allowance-evidence digest. [Policy history](completion.json)`, '');

  lines.push('## Outstanding gates and review limits', '');
  const unresolved = array(c.unresolved);
  if (unresolved.length) {
    lines.push(`**${unresolved.length} unresolved finding(s).** Rationales and dispositions remain in [the decision record](decisions.json); completion does not resolve them.`, '',
      '| Status | Finding IDs and severity |', '| --- | --- |');
    // No finding is dropped; bound each row instead of copying rationale prose.
    for (let i = 0; i < unresolved.length; i += 8) lines.push(`| unresolved | ${unresolved.slice(i, i + 8)
      .map(item => `${authored(item.finding_id)} (${authored(item.severity || 'not recorded')})`).join('; ')} |`);
    lines.push('');
  } else lines.push('No unresolved finding dispositions were recorded; this does not establish absence of risk.', '');
  const securitySource = security.required ? '[Security report](security-review.json)' : '[Legacy security limits](completion.json)';
  detailExcerpts(lines, 'Security limitations', security.limitations, securitySource);
  detailExcerpts(lines, 'Security questions', security.open_questions, securitySource);
  const requests = array(c.evidence_requests);
  if (requests.length) {
    lines.push('', '| Evidence request | Status | Record |', '| --- | --- | --- |');
    for (const request of requests) lines.push(`| ${authored(request.id)} | ${authored(request.status)} | ${sourceLink(request.artifact || request.source)} |`);
    lines.push('Unavailable evidence remains a limit on dependent conclusions; supplied status alone does not verify a claim. Full questions and reasons remain in the linked records.', '');
  }
  const questionSources = new Map();
  for (const item of array(c.questions_raised_during_review)) {
    const key = REPORTS.includes(item.source) ? item.source : 'completion.json';
    // The security questions are already represented above.
    if (key === 'security-review.json') continue;
    if (!questionSources.has(key)) questionSources.set(key, []);
    if (!questionSources.get(key).includes(item.question)) questionSources.get(key).push(item.question);
  }
  for (const [source, questions] of questionSources) detailExcerpts(lines, 'Questions raised during review (not automatically resolved)', questions, sourceLink(source), 1);
  lines.push('', 'Excerpts locate recorded limits; an ellipsis marks shortened text, not a complete summary. Read the linked records before resolving a dependent gate.', '');

  lines.push('## Assessment and provenance', '',
    `${authored(participantLabel(state, 'coordinator'))} → ${authored(participantLabel(state, 'peer'))}. Pairing: ${authored(state.pairing || 'cross')}.`,
    ...(state.author_model ? [`Background planner: ${authored(participantLabel(state, 'author'))}.`] : []),
    'Coordinator identity is declared; worker identities are requested. CLI-reported metadata is not independent attestation. [Full participant and effort records](completion.json)', '');
  const modelReports = array(c.worker_model_reports ?? c.peer_model_reports);
  const reported = modelReports.filter(item => array(item.reported).length);
  if (reported.length) {
    lines.push(...reported.map(item => `- CLI model metadata, attempt ${count(item.attempt)} (${authored(item.status)}${item.role ? `, ${authored(item.role)}` : ''}): ${excerpt(array(item.reported).join(', '), 160)}.`), '');
  } else lines.push('Model metadata: not reported by the CLI; distinct runtime identities are unverified.', '');
  if (assessment.required) {
    const assessmentSource = projectContextAvailable ? '[Assessment](PROJECT_CONTEXT.md)' : '[Assessment data](project-assessment.json)';
    lines.push(`Frozen assessment: deployment **${authored(assessment.deployment?.status || 'unknown')}**; readiness **${authored(assessment.readiness?.status || 'not_assessed')}**.`,
      `Readiness scope: ${excerpt(assessment.readiness?.scope || 'not recorded', 160)}.`,
      `${projectContextAvailable ? '[Full assessment and evidence](PROJECT_CONTEXT.md) · ' : ''}[Assessment data](project-assessment.json)`, '');
    detailExcerpts(lines, 'Readiness gaps', assessment.readiness?.gaps, assessmentSource);
    detailExcerpts(lines, 'Assessment unknowns', assessment.unknowns, assessmentSource);
    lines.push('Deployment and readiness describe the recorded evidence scope; neither a production label nor plan completion certifies the project.', '');
  } else lines.push('Legacy run: no mandatory project assessment was recorded; deployment and readiness were not established by this workflow.', '');
  lines.push(`Plan map: ${authored(c.plan_quality?.status || 'not recorded')}. Structural links are not proof of truth or complete coverage. [Structure checks](completion.json)`, '',
    `Verification stage: ${authored(c.verification_stage || 'not recorded')}. Exact SHA-256 values identify recorded content; they are not correctness or identity attestations.`, '',
    '| Artifact | Peer-reviewed SHA-256 | Delivered SHA-256 |', '| --- | --- | --- |');
  for (const name of ARTIFACTS.filter(name => c.reviewed_hashes?.[name] || c.final_hashes?.[name])) lines.push(`| [${name}](${name}) | ${hash(c.reviewed_hashes?.[name])} | ${hash(c.final_hashes?.[name])} |`);
  const reportLinks = REPORTS.filter(name => state.seals?.[name] || name === 'security-review.json' && security.required).map(sourceLink);
  if (reportLinks.length) lines.push('', `Full reports: ${reportLinks.join(' · ')}`);
  lines.push('', '## Recorded resources', '',
    `Successful peer calls: ${count(c.successful_peer_calls)}; attempts: ${count(c.attempts_used)}${state.author_model ? `; successful worker calls: ${count(c.successful_worker_calls)}` : ''}.`,
    `Final allowance: per-call cap ${seconds(budget.timeout_seconds)}, cumulative cap ${seconds(budget.budget_seconds)}, inactivity guard ${seconds(budget.idle_seconds)}, ${count(budget.max_attempts)} attempts. Recorded limit changes: ${count(budget.limit_changes)}; earlier attempts and runtime remain charged.`,
    `Runtime accounting: ${budget.runtime_accounting_incomplete || budget.peer_seconds_used === null ? `unknown total; known ${seconds(budget.peer_seconds_used_known)}` : seconds(budget.peer_seconds_used)}. Time and attempt allowances are not token or spending caps.`, '');
  const usage = c.resource_usage;
  const total = usage?.counters?.total_tokens;
  lines.push(`Observed terminal token subtotal: ${count(total?.observed_sum)}; attempts with total counters: ${count(total?.observed_attempts)}; unknown attempts: ${count(total?.unknown_attempts)}.`,
    `Coverage: ${['observed', 'partial', 'missing', 'invalid', 'ambiguous'].map(status => `${status} ${count(usage?.usage_coverage?.[status])}`).join(' · ')}.`,
    'Scope: recorded worker attempts, including failures and retries; observed terminal turns only (Claude main loop only). Coordinator research and synthesis, unreported internal calls, and other task work are unobserved. This is not whole-task usage, subscription cost, remaining quota, or savings. [Full usage and runtime ledger](completion.json)', '');
  return lines.join('\n');
}
