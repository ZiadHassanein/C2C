import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDiscussion, discussionSummary } from '../scripts/discussion.mjs';

function state(overrides = {}) {
  return { coordinator: 'codex', peer: 'claude', mode: 'plan', status: 'prepared', stages: {}, attempts: [], seals: {}, ...overrides };
}
function report(overrides = {}) {
  return { summary: 'Keep the MVP focused.', verdict: 'ready', proposal_markdown: 'RAW PROPOSAL IS NOT A TRANSCRIPT',
    findings: [], assumptions: [], open_questions: [], limitations: [], ...overrides };
}
function finding(id, overrides = {}) {
  return { id, severity: 'major', claim: 'Anonymous inventory writes are possible.', evidence: 'The proposal has no authorization step.',
    action: 'Check the admin role for every inventory mutation.', verification: 'An unauthenticated request must fail.', ...overrides };
}

test('empty discussion shows honest pending stages without inventing reports or consensus', () => {
  const text = renderDiscussion({ state: state() });
  assert.match(text, /Codex coordinates · Claude Code reviews/);
  assert.match(text, /Independent proposal \| pending/);
  assert.match(text, /No validated reports are available yet/);
  assert.match(text, /Final peer verification has not completed/);
  assert.match(text, /not a verbatim conversation or private reasoning/);
  assert.doesNotMatch(text, /Final result\]\(/);
});

test('reverse-role review attributes findings and recorded decisions to actual products', () => {
  const run = state({ coordinator: 'claude', peer: 'codex', mode: 'review', status: 'awaiting_coordinator',
    stages: { review: { status: 'succeeded' } }, attempts: [{ stage: 'review', status: 'succeeded' }],
    seals: { 'peer-review.json': 'hash' } });
  const text = renderDiscussion({ state: run, reports: [{ name: 'peer-review.json', report: report({ findings: [finding('P-R1')] }) }],
    decisions: [{ finding_id: 'P-R1', disposition: 'accepted', rationale: 'Add the role check to the plan.' }] });
  assert.match(text, /Claude Code coordinates · Codex reviews · Focused review/);
  assert.match(text, /does not produce two independent proposals/);
  assert.doesNotMatch(text, /\| Independent proposal \|/);
  assert.match(text, /## Codex · Review/);
  assert.match(text, /Anonymous inventory writes are possible\./);
  assert.match(text, /\*\*accepted\*\* — Add the role check to the plan\./);
  assert.match(text, /Sealed submitted report/);
  assert.match(text, /\[Report\]\(peer-review.json\)/);
});

test('working coordinator reports stay distinct from submitted peer reports and private data', () => {
  const text = renderDiscussion({ state: state(), reports: [
    { name: 'coordinator-draft.json', report: report({ findings: [finding('C-D1')], limitations: ['Deployment is unknown.'] }) },
    { name: 'attempt-1-stdout.txt', report: report({ summary: 'RAW_PRIVATE_OUTPUT' }) },
    { name: '../attacker.json', report: report({ summary: 'UNTRUSTED_PATH' }) },
  ] });
  assert.match(text, /Current working draft; not yet submitted/);
  assert.match(text, /Awaiting a recorded decision/);
  assert.match(text, /Deployment is unknown\./);
  assert.doesNotMatch(text, /RAW_PRIVATE_OUTPUT|UNTRUSTED_PATH|RAW PROPOSAL/);
});

test('failed and interrupted peer attempts never become positions, and success counts exclude failures', () => {
  const run = state({ status: 'peer_failed', attempts: [
    { stage: 'draft', status: 'failed' }, { stage: 'draft', status: 'succeeded' },
    { stage: 'review', status: 'interrupted' }, { stage: 'verify', status: 'failed' },
  ], stages: { draft: { status: 'succeeded' } }, seals: { 'peer-draft.json': 'hash' } });
  const text = renderDiscussion({ state: run, reports: [
    { name: 'peer-draft.json', report: report({ summary: 'Successful independent draft' }) },
    { name: 'peer-review.json', report: report({ summary: 'FAILED_PARTIAL_REVIEW', findings: [finding('P-R1')] }) },
    { name: 'peer-verify.json', report: report({ summary: 'FAILED_PARTIAL_VERIFY' }) },
  ] });
  assert.match(text, /Successful peer calls: \*\*1\*\*; attempts: \*\*4\*\*/);
  assert.match(text, /Review \| interrupted/);
  assert.match(text, /Final verification \| failed/);
  assert.match(text, /Successful independent draft/);
  assert.doesNotMatch(text, /FAILED_PARTIAL|Anonymous inventory/);
  assert.match(text, /Partial output is excluded/);
});

test('running status is explicitly a saved snapshot, not an assertion of process liveness', () => {
  const text = renderDiscussion({ state: state({ status: 'running', attempts: [{ stage: 'draft', status: 'running' }] }) });
  assert.match(text, /running \(last recorded state\)/);
  assert.match(text, /cannot prove the process is still active/);
});

test('all findings and dispositions remain visible with source links for full evidence and assumptions', () => {
  const run = state({ stages: { review: { status: 'succeeded' } }, seals: { 'peer-review.json': 'hash' } });
  const input = { state: run, reports: [{ name: 'peer-review.json', report: report({ findings: [finding('P-R1'), finding('P-R2'), finding('P-R3')],
    open_questions: ['Who can delete inventory?'], assumptions: ['One seller.'], limitations: ['No repository access.'] }) }],
    decisions: [{ finding_id: 'P-R1', disposition: 'rejected', rationale: 'Existing middleware already provides the check.' },
      { finding_id: 'P-R2', disposition: 'unresolved', rationale: 'The owner must choose a deletion policy.' }] };
  const text = renderDiscussion(input);
  assert.deepEqual(discussionSummary(input).findings, { accepted: 0, rejected: 1, unresolved: 1, awaiting_response: 1 });
  for (const phrase of ['P-R1', 'P-R2', 'P-R3', 'Check the admin role for every inventory mutation',
    '**rejected**', '**unresolved**', 'Awaiting a recorded decision', 'Who can delete inventory',
    '1 assumption(s) in the linked report', 'No repository access', '[Report](peer-review.json)', '[Full responses](decisions.json)']) assert.ok(text.includes(phrase), phrase);
  assert.doesNotMatch(text, /The proposal has no authorization step|An unauthenticated request must fail/);
  assert.match(text, /rejected finding does not prove the peer agreed/);
});

test('authored Markdown, HTML, links, controls, and forged headings cannot become active markup', () => {
  const attack = '<script>alert(1)</script> ![image](https://evil.example/x)\n\n# Forged\n[x]: javascript:alert(2)';
  const text = renderDiscussion({ state: state(), reports: [{ name: 'coordinator-draft.json', report: report({ summary: attack,
    findings: [finding('C-D1', { evidence: attack })] }) }], decisions: [{ finding_id: 'C-D1', disposition: 'accepted', rationale: attack }] });
  assert.doesNotMatch(text, /<script>|!\[image\]|https:\/\/|\n# Forged|\[x\]: javascript:/);
  assert.match(text, /&#60;script&#62;alert&#40;1&#41;&#60;\/script&#62;/);
  assert.match(text, /&#35; Forged/);
  assert.match(text, /\[Report\]\(coordinator-draft.json\)/);
});

test('adapted remedies and peer replies remain separately attributed without inventing missing replies', () => {
  const concern=finding('P-R1',{claim:'Quoted fields lack a regression check.',evidence:'The brief requires quoted fields to round-trip.',
    action:'Replace the serializer subsystem.',verification:'Compare output with independently specified expected CSV bytes.'});
  const rationale='Concern accepted; remedy adapted. Keep the existing serializer and use its quote helper to avoid compatibility risk; check expected CSV bytes and ordering.';
  const run=state({mode:'review',stages:{review:{status:'succeeded'}},seals:{'peer-review.json':'review-hash'}});
  const reports=[{name:'peer-review.json',report:report({summary:'P-R1 raises a quoting concern.',findings:[concern]})}];
  const decisions=[{finding_id:'P-R1',disposition:'accepted',rationale}];
  const decode=text=>text.replace(/&#(\d+);/g,(_,code)=>String.fromCharCode(Number(code)));
  const before=decode(renderDiscussion({state:run,reports,decisions}));
  assert.ok(before.includes(`**Proposed:** ${concern.action}`));
  assert.ok(before.includes(`**accepted** — ${rationale}`));
  assert.match(before,/accepted concern may use an adapted remedy/);
  assert.match(before,/Counts do not establish peer agreement/);
  assert.match(before,/no unrecorded reply is inferred/);
  assert.doesNotMatch(before,/## Claude Code · Final verification/);
  const reply='On P-R1, I revise my rewrite recommendation: the supplied quote helper supports the narrower remedy without changing the format contract.';
  run.stages.verify={status:'succeeded'};
  run.seals['peer-verify.json']='verify-hash';
  reports.push({name:'peer-verify.json',report:report({summary:reply,proposal_markdown:''})});
  const after=decode(renderDiscussion({state:run,reports,decisions}));
  assert.ok(!before.includes(reply));
  assert.ok(!after.split('## Claude Code · Final verification')[0].includes(reply));
  assert.ok(after.split('## Claude Code · Final verification')[1].includes(reply));
  assert.match(after,/No findings recorded in this report. This does not establish agreement or absence of risk/);
  assert.deepEqual(discussionSummary({state:run,reports,decisions}).findings,{accepted:1,rejected:0,unresolved:0,awaiting_response:0});
});

test('verification limits distinguish changed plan, changed decisions, and unknown current hashes', () => {
  const run = state({ stages: { verify: { status: 'succeeded' } } });
  const changed = renderDiscussion({ state: run, changesSinceVerification: ['final-plan.md', 'security-review.json'] });
  assert.match(changed, /The plan changed after final peer verification/);
  assert.match(changed, /security review after peer verification/);
  assert.doesNotMatch(changed, /plan matches/);
  const decisionsOnly = renderDiscussion({ state: run, changesSinceVerification: ['decisions.json'] });
  assert.match(decisionsOnly, /The plan matches the version submitted/);
  assert.match(decisionsOnly, /updated the decision record/);
  const unknown = renderDiscussion({ state: run });
  assert.match(unknown, /Whether the current plan still matches.*has not been established/);
});

test('completion preserves outstanding issues and changed-source boundaries without implying agreement', () => {
  const run = state({ status: 'complete', stages: { verify: { status: 'succeeded' } }, completion: { changed_artifacts: [],
    source_changes: ['PRIVATE_SOURCE_PATH'], unavailable_sources: [{ path: 'OTHER_PRIVATE_PATH' }], peer_verdict: 'needs_changes' } });
  const text = renderDiscussion({ state: run });
  assert.match(text, /workflow is complete/);
  assert.match(text, /\[Final result\]\(RESULT.md\)/);
  assert.match(text, /Some source inputs changed/);
  assert.match(text, /Some original inputs are now unavailable/);
  assert.match(text, /completion does not imply consensus/);
  assert.match(text, /Final peer verdict: \*\*needs changes\*\*/);
  assert.doesNotMatch(text, /PRIVATE_SOURCE_PATH|OTHER_PRIVATE_PATH/);
});

test('invalid working data and missing sealed peer reports remain visibly unavailable', () => {
  const run = state({ stages: { review: { status: 'succeeded' } } });
  const text = renderDiscussion({ state: run, warnings: ['decisions.json is invalid: <untrusted error>'],
    reports: [{ name: 'peer-review.json', report: report({ summary: 'UNSEALED_PEER_OUTPUT' }) }] });
  assert.match(text, /Unavailable information/);
  assert.match(text, /decisions\.json is invalid&#58; &#60;untrusted error&#62;/);
  assert.match(text, /no validated sealed report available/);
  assert.match(text, /not evidence that there are no findings or decisions/);
  assert.doesNotMatch(text, /UNSEALED_PEER_OUTPUT|<untrusted error>/);
});

test('coordinator critiques name their actual target and mutable security does not imply no prior submission', () => {
  const reports = [{ name: 'coordinator-review.json', report: report() }, { name: 'security-review.json', report: report() }];
  const plan = renderDiscussion({ state: state({ seals: { 'coordinator-review.json': 'hash', 'security-review-submitted.json': 'hash' } }), reports });
  assert.match(plan, /Codex · Review of the Claude Code proposal/);
  assert.match(plan, /Codex · Security review\n\n\*\*Current working copy; not sealed/);
  const review = renderDiscussion({ state: state({ mode: 'review' }), reports });
  assert.match(review, /Codex · Review of the candidate plan/);
});

test('a sealed security fallback links the actual prior submission and preserves its findings', () => {
  for (const source of ['security-review-submitted.json', 'attempt-3-security-review.json']) {
    const run = state({ attempts: [{ number: 3, stage: 'verify', status: 'failed', security_report_file: 'attempt-3-security-review.json' }],
      seals: { [source]: 'hash' } });
    const text = renderDiscussion({ state: run, reports: [{ name: 'security-review.json', source,
      report: report({ findings: [finding('C-S1')] }) }] });
    assert.match(text, /Codex · Security review/);
    assert.match(text, /Sealed prior submission; current working copy is invalid/);
    assert.ok(text.includes(`[Report](${source})`));
    assert.match(text, /Anonymous inventory writes are possible/);
    assert.match(text, /Awaiting a recorded decision/);
    assert.doesNotMatch(text, /\[Report\]\(security-review.json\)/);
  }
});

test('unrecognized or unsealed fallback sources cannot supply a report or become active links', () => {
  const cases = [
    { source: '../outside.json', seals: { '../outside.json': 'hash' }, attempts: [] },
    { source: 'https://evil.example/report', seals: { 'https://evil.example/report': 'hash' }, attempts: [] },
    { source: 'security-review-submitted.json', seals: {}, attempts: [] },
    { source: 'attempt-3-security-review.json', seals: { 'attempt-3-security-review.json': 'hash' }, attempts: [] },
    { source: 'attempt-3-security-review.json', seals: { 'attempt-3-security-review.json': 'hash' }, attempts: [{ number: 2, security_report_file: 'attempt-3-security-review.json' }] },
    { source: 'attempt-3-security-review.json', seals: { 'attempt-3-security-review.json': 'hash' }, attempts: [{ number: 3, security_report_file: 'attempt-4-security-review.json' }] },
    { source: 'attempt-03-security-review.json', seals: { 'attempt-03-security-review.json': 'hash' }, attempts: [{ number: 3, security_report_file: 'attempt-03-security-review.json' }] },
  ];
  for (const { source, seals, attempts } of cases) {
    const text = renderDiscussion({ state: state({ seals, attempts }), reports: [{ name: 'security-review.json', source,
      report: report({ summary: 'UNTRUSTED_FALLBACK' }) }] });
    assert.match(text, /unrecognized or unsealed submission source was excluded/);
    assert.doesNotMatch(text, /UNTRUSTED_FALLBACK|\[Report\]\(/);
  }
});

test('prior security submissions cannot be relabeled as another agent report', () => {
  const text = renderDiscussion({ state: state({ seals: { 'security-review-submitted.json': 'hash' } }), reports: [
    { name: 'coordinator-draft.json', source: 'security-review-submitted.json', report: report({ summary: 'RELABELLED_SOURCE' }) },
  ] });
  assert.match(text, /unrecognized or unsealed submission source was excluded/);
  assert.doesNotMatch(text, /RELABELLED_SOURCE|Sealed prior submission/);
});

test('same-provider discussions distinguish the model roles and retain disagreement', () => {
  for (const [provider, coordinatorModel, peerModel] of [
    ['codex', 'gpt-5.4', 'gpt-5.3-codex'],
    ['claude', 'claude-opus-4-6', 'claude-sonnet-4-6'],
  ]) {
    const run = state({ coordinator: provider, peer: provider, pairing: 'same', coordinator_model: coordinatorModel,
      peer_model: peerModel, stages: { review: { status: 'succeeded' } }, seals: { 'peer-review.json': 'hash' } });
    const input = { state: run, reports: [{ name: 'peer-review.json', report: report({ findings: [finding('P-R1')] }) }],
      decisions: [{ finding_id: 'P-R1', disposition: 'unresolved', rationale: 'The access policy still needs an owner decision.' }] };
    const summary = discussionSummary(input);
    assert.ok(summary.coordinator.includes(coordinatorModel));
    assert.ok(summary.peer.includes(peerModel));
    assert.notEqual(summary.coordinator, summary.peer);
    assert.equal(summary.findings.unresolved, 1);
    const text = renderDiscussion(input).replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
    assert.ok(text.includes(`${peerModel} (peer) · Review`));
    assert.ok(text.includes(`${coordinatorModel} (coordinator) coordinates`));
    assert.match(text, /Anonymous inventory writes are possible/);
    assert.match(text, /\*\*unresolved\*\*/);
    assert.match(text, /separate model sessions/);
    assert.match(text, /do not attest the runtime model identity/);
    assert.match(text, /access policy still needs an owner decision/);
    assert.match(text, /Final peer verification has not completed/);
  }
});

test('model labels cannot introduce active markup into a discussion', () => {
  const text = renderDiscussion({ state: state({ coordinator_model: '<img src="https://evil.example">', peer_model: '[click](https://evil.example)' }) });
  assert.doesNotMatch(text, /<img|https:\/\/|\[click\]/);
  assert.match(text, /&#60;img/);
  assert.match(text, /&#91;click&#93;/);
});

test('discussion model metadata comes only from the successful stage attempt', () => {
  const run = state({ pairing: 'same', coordinator: 'codex', peer: 'codex', coordinator_model: 'gpt-5.4', peer_model: 'gpt-5.3-codex',
    stages: { review: { status: 'succeeded', attempt: 2 } }, seals: { 'peer-review.json': 'hash' },
    attempts: [{ number: 1, status: 'failed', reported_models: ['WRONG_FAILED_MODEL'] },
      { number: 2, status: 'succeeded', reported_models: ['gpt-5.3-codex'] }] });
  const input = { state: run, reports: [{ name: 'peer-review.json', report: report() }] };
  const text = renderDiscussion(input).replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  assert.match(text, /CLI-reported model metadata: gpt-5\.3-codex/);
  assert.doesNotMatch(text, /WRONG_FAILED_MODEL/);
  run.attempts[1].reported_models = [];
  assert.match(renderDiscussion(input), /requested model is not independently verified/);
});

test('long discussion is compact without dropping findings, source evidence or superseding references', () => {
  const long = 'A detailed public explanation with evidence and alternatives. '.repeat(100);
  const findings = Array.from({ length: 30 }, (_, i) => finding(`P-R${i + 1}`, {
    claim: `Concern ${i + 1}. ${long}`, action: `Proposed fix ${i + 1}. ${long}`, evidence: long, verification: long,
  }));
  const decisions = findings.slice(0, 29).map((item, i) => ({ finding_id: item.id,
    disposition: ['accepted', 'rejected', 'unresolved'][i % 3], rationale: `${long} Superseded by P-R30.` }));
  const input = { state: state({ mode: 'review', stages: { review: { status: 'succeeded' } }, seals: { 'peer-review.json': 'hash' } }),
    reports: [{ name: 'peer-review.json', report: report({ summary: long, findings, limitations: [long], open_questions: [long] }) }], decisions };
  const before = JSON.stringify(input);
  const text = renderDiscussion(input);
  assert.equal(JSON.stringify(input), before, 'The compact view must never rewrite source reports or decisions');
  assert.ok(text.length < before.length / 10, 'Repeated detail belongs in linked sources, not hidden in HTML');
  assert.match(text, /ellipsis.*shortened text, not a complete summary/);
  for (const item of findings) assert.ok(text.includes(`**${item.id} · major**`), item.id);
  assert.match(text, /references: P-R30/);
  for (const decision of decisions) assert.ok(text.includes(`**${decision.disposition}**`));
  assert.match(text, /Awaiting a recorded decision/);
  assert.match(text, /\[Report\]\(peer-review.json\)/);
  assert.match(text, /\[Full responses\]\(decisions.json\)/);
});

test('revision warnings stay above excerpts and the plan link requires an existing file', () => {
  const input = { state: state({ status: 'complete', stages: { verify: { status: 'succeeded' } },
    completion: { changed_artifacts: ['final-plan.md'], peer_verdict: 'needs_changes', unverified_revision_reason: 'New corrections need review.' } }),
    reports: [{ name: 'coordinator-draft.json', report: report() }] };
  assert.doesNotMatch(renderDiscussion(input), /\[Open the revised plan\]/);
  const text = renderDiscussion({ ...input, planAvailable: true });
  assert.match(text, /\[Open the revised plan\]\(final-plan.md\)/);
  for (const message of ['plan changed after final peer verification', 'Final peer verdict: **needs changes**', 'New corrections need review.']) {
    assert.ok(text.indexOf(message) < text.indexOf('<details>'), message);
  }
});

test('shortened responses keep exact omitted IDs rather than treating an ID prefix as present', () => {
  const text = renderDiscussion({ state: state(), reports: [{ name: 'coordinator-draft.json', report: report({ findings: [finding('C-D1')] }) }],
    decisions: [{ finding_id: 'C-D1', disposition: 'accepted', rationale: 'P-R10 was checked. ' + 'Earlier context. '.repeat(30) + ' P-R1 and C-D-E1 supersede that context.' }] });
  assert.match(text, /references: P-R1, C-D-E1/);
});

test('excerpt cuts keep Unicode and markup inert, including adversarial table content', () => {
  const input = { state: state(), reports: [{ name: 'coordinator-draft.json', report: report({
    summary: '😀'.repeat(300), findings: [finding('C-D1', { claim: '| <img src="https://bad.example"> ' + 'x'.repeat(200) })],
  }) }] };
  const text = renderDiscussion(input);
  assert.ok(text.includes('😀'.repeat(280) + ' …'));
  assert.doesNotMatch(text, /<img|https:\/\/|�/);
  assert.match(text, /&#124; &#60;img/);
});

test('pending evidence links its validated report and unavailable evidence keeps the reason', () => {
  const input = { state: state(), reports: [{ name: 'coordinator-draft.json', report: report() }], evidenceRequests: [
    { id: 'C-D-E1', status: 'pending', question: 'Who owns access?', source: 'coordinator-draft.json' },
    { id: 'P-R-E1', status: 'unavailable', question: 'What is production state?', reason: 'No supplied deployment evidence.', artifact: 'evidence-1.json' },
    { id: 'P-R-E2', status: 'pending', question: 'Unknown source?', source: 'https://bad.example', artifact: '../outside.json' },
  ] };
  const text = renderDiscussion(input);
  assert.match(text, /pending:\*\* Who owns access\? \[Record\]\(coordinator-draft.json\)/);
  assert.match(text, /No supplied deployment evidence\. \[Record\]\(evidence-1.json\)/);
  assert.doesNotMatch(text, /https:\/\/bad|outside.json/);
});
