// A readable view of validated public reports. No model calls, log reads, or raw prompts.
import { participantLabel, requiredStages } from './participants.mjs';
const PRODUCTS = { codex: 'Codex', claude: 'Claude Code' };
const REPORTS = [
  { name: 'coordinator-draft.json', owner: 'coordinator', title: 'Proposal' },
  { name: 'peer-draft.json', owner: 'peer', title: 'Independent proposal', stage: 'draft' },
  { name: 'coordinator-review.json', owner: 'coordinator', title: 'Review' },
  { name: 'peer-review.json', owner: 'peer', title: 'Review', stage: 'review' },
  { name: 'security-review.json', owner: 'coordinator', title: 'Security review' },
  { name: 'peer-verify.json', owner: 'peer', title: 'Final verification', stage: 'verify' },
  { name: 'peer-verify-final.json', owner: 'peer', title: 'Revision verification', stage: 'verify-final' },
];
const VERDICTS = { ready: 'ready', needs_changes: 'needs changes', insufficient_context: 'insufficient context' };
const STAGES = { 'author-draft': 'Planner proposal', 'author-review': 'Planner review', draft: 'Independent proposal', review: 'Review', verify: 'Final verification', 'verify-final': 'Revision verification' };

function reportSpecs(state) {
  return REPORTS.map(spec => state.author_model && (spec.name === 'coordinator-draft.json' || spec.name === 'coordinator-review.json' && state.mode === 'plan')
    ? { ...spec, owner: 'author', stage: spec.name === 'coordinator-draft.json' ? 'author-draft' : 'author-review' } : spec);
}

// Encode punctuation before Markdown parsing, including URL punctuation and HTML.
// Flatten authored newlines so they cannot introduce headings, lists, or link definitions.
const authored = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/[\u202a-\u202e\u2066-\u2069]/g, '')
  .replace(/\s+/g, ' ').trim().replace(/[!-/:-@\[-`{-~]/g, char => `&#${char.charCodeAt(0)};`);

function reportSource(state, entry) {
  if (entry.source === undefined) return entry.name;
  if (entry.name !== 'security-review.json' || typeof entry.source !== 'string' || !state.seals?.[entry.source]) return null;
  if (entry.source === 'security-review-submitted.json') return entry.source;
  const match = /^attempt-([1-9][0-9]*)-security-review\.json$/.exec(entry.source);
  if (!match) return null;
  return (state.attempts || []).some(attempt => Number.isSafeInteger(attempt.number)
    && String(attempt.number) === match[1] && attempt.security_report_file === entry.source) ? entry.source : null;
}

function visibleReports(state, reports) {
  return reportSpecs(state).flatMap(spec => {
    if (state.mode === 'review' && spec.stage === 'draft') return [];
    if (spec.stage && (state.stages?.[spec.stage]?.status !== 'succeeded' || !state.seals?.[spec.name])) return [];
    const entry = reports.find(item => item.name === spec.name);
    const source = entry && reportSource(state, entry);
    return source ? [{ ...spec, report: entry.report, source, priorSubmission: entry.source !== undefined, sealed: Boolean(state.seals?.[source]) }] : [];
  });
}

function stageStatus(state, stage) {
  if (state.stages?.[stage]?.status === 'succeeded') return 'succeeded';
  const latest = (state.attempts || []).filter(attempt => attempt.stage === stage).at(-1);
  if (!latest) return 'pending';
  if (latest.status === 'running') return 'running (last recorded state)';
  if (latest.status === 'failed' || latest.status === 'interrupted') return latest.status;
  return 'pending';
}

/** Inputs must already be loaded and validated by the runner. Unknown report names are ignored. */
export function discussionSummary({ state, reports = [], decisions = [] }) {
  const visible = visibleReports(state, reports);
  const dispositions = new Map(decisions.map(item => [item.finding_id, item.disposition]));
  const counts = { accepted: 0, rejected: 0, unresolved: 0, awaiting_response: 0 };
  for (const { report } of visible) {
    for (const finding of report.findings) {
      const disposition = dispositions.get(finding.id);
      counts[Object.hasOwn(counts, disposition) ? disposition : 'awaiting_response']++;
    }
  }
  const stages = requiredStages(state)
    .map(stage => ({ stage, status: stageStatus(state, stage) }));
  return {
    coordinator: state.author_model || state.pairing === 'same' || state.coordinator_model ? participantLabel(state, 'coordinator') : PRODUCTS[state.coordinator] || 'Coordinator',
    peer: state.pairing === 'same' || state.peer_model ? participantLabel(state, 'peer') : PRODUCTS[state.peer] || 'Peer',
    ...(state.author_model ? { author: participantLabel(state, 'author'), successful_worker_calls: (state.attempts || []).filter(attempt => attempt.status === 'succeeded').length } : {}),
    pairing: state.pairing || 'cross',
    mode: state.mode, status: state.status, stages, findings: counts,
    successful_peer_calls: (state.attempts || []).filter(attempt => attempt.status === 'succeeded' && attempt.role !== 'author').length,
    attempts_used: (state.attempts || []).length,
  };
}

/** Render only report summaries, findings, questions, and recorded coordinator decisions. */
export function renderDiscussion({ state, reports = [], decisions = [], completion = state.completion, changesSinceVerification, warnings = [], evidenceRequests = [] }) {
  const summary = discussionSummary({ state, reports, decisions });
  const labels = { coordinator: authored(summary.coordinator), peer: authored(summary.peer), ...(summary.author ? { author: authored(summary.author) } : {}) };
  const visible = visibleReports(state, reports);
  const dispositions = new Map(decisions.map(item => [item.finding_id, item]));
  const counts = summary.findings;
  const lines = [
    '# C2C — discussion', '',
    `**${labels.coordinator} coordinates · ${labels.peer} reviews · ${state.mode === 'review' ? 'Focused review' : 'Independent planning'}**`, '',
    ...(state.author_model ? [`**${labels.author}** drafts${state.mode === 'plan' ? ' and reviews the peer proposal' : ''}. The current chat synthesizes the plan and owns security review and finding decisions.`, ''] : []),
    ...(state.pairing === 'same' || state.coordinator_model || state.peer_model ? [
      `Pairing: **${state.pairing === 'same' ? 'same provider, separate model sessions' : 'cross provider'}**. Coordinator model: declared by the host or user. Peer model: ${state.peer_model ? 'requested via the CLI' : 'provider default'}. These labels do not attest the runtime model identity.`, '',
    ] : []),
    'This view shows authored report summaries, findings, and recorded responses. It is not a verbatim conversation or private reasoning. It refreshes at saved transitions or when the discussion command runs.', '',
    state.mode === 'review'
      ? `One ${state.author_model ? 'selected planner' : 'coordinator'} proposal is reviewed. This mode does not produce two independent proposals.`
      : 'Both agents propose independently, then review. The coordinator records each decision; final verification checks the submitted synthesis.', '',
    '## Progress', '',
    `Run: **${state.status === 'complete' ? 'complete' : 'in progress'}**. Successful peer calls: **${summary.successful_peer_calls}**; attempts: **${summary.attempts_used}**.`, '',
    ...(state.author_model ? [`Successful worker calls (author and peer): **${summary.successful_worker_calls}**.`, ''] : []),
    '| Worker stage | Status |', '| --- | --- |',
    ...summary.stages.map(stage => `| ${STAGES[stage.stage]} | ${stage.status} |`), '',
  ];
  if (summary.stages.some(stage => stage.status.startsWith('running'))) {
    lines.push('Running is the last saved state; this document cannot prove the process is still active.', '');
  }
  if (summary.stages.some(stage => ['failed', 'interrupted'].includes(stage.status))) {
    lines.push('Failed or interrupted attempts provide no validated peer position. Partial output is excluded from this discussion.', '');
  }
  lines.push(`Findings: **${counts.accepted} accepted · ${counts.rejected} rejected · ${counts.unresolved} unresolved · ${counts.awaiting_response} awaiting response**.`, '',
    'Decisions are the coordinator’s recorded judgments. An accepted concern may use an adapted remedy; read the rationale for the recorded choice. Counts do not establish peer agreement, and no unrecorded reply is inferred. An accepted finding does not prove the fix was implemented; a rejected finding does not prove the peer agreed.', '',
    state.seals?.['decisions.json'] ? 'Decision record: sealed at completion.' : 'Decision record: current working record; responses may change.', '');
  const unavailable = reportSpecs(state).filter(spec => spec.stage && state.stages?.[spec.stage]?.status === 'succeeded'
    && !visible.some(entry => entry.name === spec.name));
  const rejectedSources = reports.filter(entry => REPORTS.some(spec => spec.name === entry.name) && !reportSource(state, entry));
  const viewWarnings = [...warnings,
    ...rejectedSources.map(entry => `${entry.name}: an unrecognized or unsealed submission source was excluded from this view.`),
    ...unavailable.map(spec => `${spec.name}: the completed stage has no validated sealed report available in this view.`)];
  if (viewWarnings.length) {
    lines.push('### Unavailable information', '', ...viewWarnings.map(message => `- ${authored(message)}`), '',
      'Missing or invalid working records are not evidence that there are no findings or decisions.', '');
  }
  if (!visible.length) lines.push('No validated reports are available yet.', '');
  for (const entry of visible) {
    const product = labels[entry.owner];
    const report = entry.report;
    const provenance = entry.priorSubmission ? 'Sealed prior submission; current working copy is invalid'
      : entry.sealed ? 'Sealed submitted report'
      : entry.name === 'security-review.json' ? 'Current working copy; not sealed' : 'Current working draft; not yet submitted';
    const title = entry.name === 'coordinator-review.json'
      ? state.mode === 'review' ? 'Review of the candidate plan' : `Review of the ${labels.peer} proposal`
      : entry.name === 'peer-review.json' ? `Review of the ${labels.author || labels.coordinator} proposal` : entry.title;
    lines.push(`## ${product} · ${title}`, '', `**${provenance}.** [Report](${entry.source})`, '',
      authored(report.summary), '', `Report verdict: **${VERDICTS[report.verdict] || 'not recorded'}**.`, '');
    if (entry.stage && (state.pairing === 'same' || state.author_model)) {
      const attemptNumber = state.stages?.[entry.stage]?.attempt;
      const attempt = Number.isSafeInteger(attemptNumber)
        ? (state.attempts || []).find(item => item.number === attemptNumber && item.status === 'succeeded') : null;
      const models = Array.isArray(attempt?.reported_models) ? attempt.reported_models.filter(model => typeof model === 'string') : [];
      lines.push(models.length
        ? `CLI-reported model metadata: ${models.map(authored).join(', ')}. This records the successful attempt; it is not independent attestation.`
        : 'The successful peer attempt has no recorded model metadata. Its requested model is not independently verified.', '');
    }
    if (report.findings.length) {
      for (const finding of report.findings) {
        const decision = dispositions.get(finding.id);
        lines.push(`### ${authored(finding.id)} · ${authored(finding.severity)}`, '',
          `**${product}:** ${authored(finding.claim)}`, '',
          `- **Evidence:** ${authored(finding.evidence)}`,
          `- **Proposed change:** ${authored(finding.action)}`,
          `- **Check:** ${authored(finding.verification)}`, '',
          decision
            ? `**${labels.coordinator} · Coordinator decision — ${authored(decision.disposition)}:** ${authored(decision.rationale)}`
            : `**${labels.coordinator} · Coordinator decision:** Awaiting a recorded decision.`, '');
      }
    } else {
      lines.push('No findings recorded in this report. This does not establish agreement or absence of risk.', '');
    }
    for (const [key, label] of [['assumptions', 'Assumption'], ['open_questions', 'Open question'], ['limitations', 'Limitation']]) {
      for (const item of report[key] || []) lines.push(`- **${label}:** ${authored(item)}`);
    }
    if (report.assumptions?.length || report.open_questions?.length || report.limitations?.length) lines.push('');
  }
  if (evidenceRequests.length) lines.push('## Evidence requests', '', ...evidenceRequests.map(request => `- **${authored(request.id)} · ${authored(request.status)}:** ${authored(request.question)}${request.path ? ` (${authored(request.path)})` : ''}${request.reason ? ` — ${authored(request.reason)}` : ''}${/^evidence-[1-9][0-9]*\.json$/.test(request.artifact || '') ? ` [Record](${request.artifact})` : ''}`), '', 'Resolved requests are preserved in sealed evidence records. File access is controlled by the coordinator.', '');
  lines.push('## Review boundary', '');
  const verified = state.stages?.verify?.status === 'succeeded';
  const changes = changesSinceVerification ?? completion?.changed_artifacts;
  if (!verified) {
    lines.push('Final peer verification has not completed. The current plan must not be described as finally reviewed.', '');
  } else if (Array.isArray(changes)) {
    lines.push(changes.includes('final-plan.md')
      ? 'The plan changed after final peer verification. The current revision has not been reviewed again.'
      : 'The plan matches the version submitted for final peer verification.', '');
    if (changes.includes('decisions.json')) lines.push('The coordinator updated the decision record after peer verification.', '');
    if (changes.includes('security-review.json')) lines.push('The coordinator updated the security review after peer verification; that revision has not been reviewed again.', '');
  } else {
    lines.push('Final peer verification completed for its submitted artifacts. Whether the current plan still matches that submission has not been established in this view.', '');
  }
  if (state.status === 'complete' && completion) {
    lines.push('The workflow is complete. [Final result](RESULT.md)', '');
    if (completion.peer_verdict) lines.push(`Final peer verdict: **${VERDICTS[completion.peer_verdict] || 'not recorded'}**.`, '');
    if (completion.unverified_revision_reason) lines.push(`**Provisional revision:** ${authored(completion.unverified_revision_reason)}`, '');
    if (completion.source_changes?.length) lines.push('Some source inputs changed after the saved snapshot; the discussion uses that original snapshot.', '');
    if (completion.unavailable_sources?.length) lines.push('Some original inputs are now unavailable, so their current contents could not be compared.', '');
  }
  lines.push('Unresolved findings and open questions remain visible; completion does not imply consensus, permission to implement, or successful implementation tests.', '');
  return lines.join('\n');
}
