// Current-only conditional branch; never combine with matching-workflow savings.
// Usage: node benchmarks/measure-final-revision.mjs --candidate DIR --output NEW_DIR
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { scenarioSmall, scenarioLarge, report } from './fixtures.mjs';
import { sha, json, read, write, splitPrompt, requestSchema, sourceHashes, originalReport } from './measure-current.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  assert.ok(['--candidate', '--output'].includes(key), `Unknown argument: ${key}`);
  assert.ok(process.argv[i + 1] && !Object.hasOwn(options, key.slice(2)), `Missing or repeated argument: ${key}`);
  options[key.slice(2)] = process.argv[i + 1];
}
assert.ok(options.candidate && options.output, '--candidate and --output are required');
const source = await fs.realpath(path.resolve(options.candidate));
assert.equal((await read(path.join(source, 'package.json'))).version, '0.12.0', 'This fixture targets v0.12.0');
const destination = path.resolve(options.output);
const relative = path.relative(source, destination);
assert.ok(relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), 'Output must be outside the source tree');
const sources = await sourceHashes(source);
const harnessFiles = ['measure-final-revision.mjs', 'measure-current.mjs', 'fixtures.mjs'];
const harnessHashes = Object.fromEntries(await Promise.all(harnessFiles.map(async name => [name, sha(await fs.readFile(path.join(here, name)))])));
const runner = await import(pathToFileURL(path.join(source, 'scripts/council.mjs')));
await fs.mkdir(destination); // Fresh runs only, never reset or reuse completed runs.

const captures = [], schemaCaptures = [], completed = [], setupCaptures = [];
const corrections = {
  'small-feature': '\nStart here: inspect the existing URL/filter parser, pagination reset and accessible field labels. Implement bounded price parsing first, then verify inclusive/equal bounds and preserved make/model/sort state before exposing the controls. These are proposed steps, not executed checks.\n',
  'production-roadmap': '\nStart here: map actual routes, schema ownership, partner response fields and queued photo-worker payloads. Use that discovery to define the additive dealer-mapping rehearsal and synthetic cross-dealer authorization checks before implementing dealer administration. These are proposed steps, not observed readiness evidence.\n',
};
for (const scenario of [scenarioSmall, scenarioLarge]) for (const route of ['host-cross', 'worker-author']) {
  const author = route === 'worker-author';
  const prepareExtra = author ? {
    'author-model': scenario.coordinator === 'codex' ? 'gpt-99.1-planner' : 'claude-opus-99-1',
    'peer-model': scenario.coordinator === 'codex' ? 'gpt-99.0-codex' : 'gpt-99.1-planner',
    pairing: scenario.mode === 'review' ? 'same' : 'cross',
  } : {};
  const participants = {
    pairing: prepareExtra.pairing || 'cross', coordinator: scenario.coordinator,
    peer: prepareExtra.pairing === 'same' ? scenario.coordinator : scenario.coordinator === 'codex' ? 'claude' : 'codex',
    coordinator_model: null, peer_model: prepareExtra['peer-model'] || null,
    ...(author ? { author_model: prepareExtra['author-model'], author_provider: scenario.coordinator } : {}),
  };
  const baseStages = author ? scenario.mode === 'plan' ? ['author-draft', 'draft', 'author-review', 'review', 'verify'] : ['author-draft', 'review', 'verify'] : scenario.mode === 'plan' ? ['draft', 'review', 'verify'] : ['review', 'verify'];
  const expectedStages = [...baseStages, 'verify-final'];
  const reports = [scenario.draft, scenario.review, scenario.peerReview, scenario.security, ...(scenario.mode === 'plan' ? [scenario.peerDraft] : [])];
  const decisions = reports.flatMap(item => item.findings.map(finding => ({
    finding_id: finding.id, disposition: finding.id === 'C-S2' ? 'unresolved' : 'accepted',
    rationale: finding.id === 'C-S2' ? 'The roadmap blocks persistent leads until the owner approves retention and a named policy owner; the user decision remains open.' : `Final plan includes the correction and proposed acceptance gate: ${finding.action}`,
  })));
  const verification = report('The fixture preserves requirements, material corrections and policy gates.', '', [], {
    verdict: scenario.mode === 'plan' ? 'insufficient_context' : 'ready',
    open_questions: scenario.mode === 'plan' ? ['Lead retention approval remains a required user decision.'] : [],
  });
  const finalVerification = { ...structuredClone(verification), summary: 'The fixture revision makes the first work item explicit and preserves the previously reviewed scope and policy gates.' };
  const revisedPlan = scenario.final + corrections[scenario.name];
  const caseRoot = path.join(destination, scenario.name, route, 'unique');
  const project = path.join(caseRoot, 'inputs/project');
  const inputs = path.dirname(project), run = path.join(caseRoot, 'candidate');
  await write(path.join(inputs, 'brief.txt'), scenario.brief);
  await write(path.join(inputs, 'assessment.json'), scenario.assessment);
  const context = [], expectedInputs = [{ kind: 'brief', path: 'brief-1.txt', content: scenario.brief }];
  for (const [name, content] of Object.entries(scenario.contexts)) {
    const file = path.join(project, name); await write(file, content); context.push(file);
    expectedInputs.push({ kind: 'context', path: name, content });
  }
  const started = performance.now();
  await runner.prepare({ ...prepareExtra, project, brief: path.join(inputs, 'brief.txt'), assessment: path.join(inputs, 'assessment.json'), context, coordinator: scenario.coordinator, mode: scenario.mode, out: run });
  const seenStages = [];
  const workerReport = fixed => ({ ...structuredClone(fixed), evidence_requests: [] });
  const invoke = (stage, fixed) => async request => {
    seenStages.push(stage);
    const { packet, prompt } = splitPrompt(request.prompt);
    const expected = { shared_context: { project: '.', inputs: expectedInputs, project_assessment: scenario.assessment }, mode: scenario.mode, participants, stage };
    if (!stage.endsWith('draft')) {
      expected.coordinator_proposal = author ? workerReport(scenario.draft) : scenario.draft;
      if (scenario.mode === 'plan') expected.peer_proposal = workerReport(scenario.peerDraft);
    }
    if (stage === 'verify' || stage === 'verify-final') Object.assign(expected, {
      coordinator_review: author && scenario.mode === 'plan' ? workerReport(scenario.review) : scenario.review,
      peer_review: workerReport(scenario.peerReview), final_plan: stage === 'verify-final' ? revisedPlan : scenario.final,
      decisions, security_review: scenario.security,
    });
    if (stage === 'verify-final') Object.assign(expected, { previous_verification: workerReport(verification), changed_artifacts: ['final-plan.md'] });
    const { stage_instruction, ...data } = packet;
    assert.deepEqual(data, expected, 'Exact evidence, reports, participants and stage visibility');
    assert.ok(stage_instruction.endsWith(`Use ${stage === 'author-draft' ? 'C-D' : stage === 'author-review' ? 'C-R' : stage === 'draft' ? 'P-D' : stage === 'review' ? 'P-R' : stage === 'verify-final' ? 'P-F' : 'P-V'}1 etc. for finding IDs.`));
    if (stage === 'verify-final') assert.ok(stage_instruction.includes('This is the single bounded revision check:'));
    assert.equal(request.provider, stage.startsWith('author-') ? scenario.coordinator : participants.peer);
    const modelIndex = request.args.indexOf('--model');
    if (author) assert.equal(request.args[modelIndex + 1], stage.startsWith('author-') ? prepareExtra['author-model'] : prepareExtra['peer-model']);
    else assert.equal(modelIndex, -1);
    const { schema, text: schemaText, transport } = await requestSchema(request);
    assert.deepEqual(schema, { ...runner.REPORT_SCHEMA, required: Object.keys(runner.REPORT_SCHEMA.properties) });
    const file = path.join(caseRoot, `candidate-${stage}.txt`);
    const schemaFile = path.join(caseRoot, `candidate-${stage}.schema.txt`);
    await write(file, prompt); await write(schemaFile, schemaText);
    const ids = { scenario: scenario.name, route, case: 'unique', variant: 'candidate', stage };
    const captured = { ...ids, file: path.relative(destination, file).split(path.sep).join('/'), bytes: Buffer.byteLength(prompt), sha256: sha(prompt) };
    const capturedSchema = { ...ids, file: path.relative(destination, schemaFile).split(path.sep).join('/'), bytes: Buffer.byteLength(schemaText), sha256: sha(schemaText), canonical_sha256: sha(JSON.stringify(schema)), provider: request.provider, transport };
    if (stage === 'verify-final') { captures.push(captured); schemaCaptures.push(capturedSchema); }
    else setupCaptures.push({ prompt: captured, schema: capturedSchema });
    const output = workerReport(fixed);
    return { code: 0, stderr: '', stdout: request.provider === 'claude'
      ? JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: output, result: JSON.stringify(output), session_id: 'offline-fixture' })
      : [{ type: 'thread.started', thread_id: 'offline-fixture' }, { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(output) } }, { type: 'turn.completed' }].map(item => JSON.stringify(item)).join('\n') };
  };
  if (author) await runner.ask({ run, stage: 'author-draft' }, invoke('author-draft', scenario.draft));
  else await write(path.join(run, 'coordinator-draft.json'), scenario.draft);
  if (scenario.mode === 'plan') await runner.ask({ run, stage: 'draft' }, invoke('draft', scenario.peerDraft));
  if (author && scenario.mode === 'plan') await runner.ask({ run, stage: 'author-review' }, invoke('author-review', scenario.review));
  else await write(path.join(run, 'coordinator-review.json'), scenario.review);
  await runner.ask({ run, stage: 'review' }, invoke('review', scenario.peerReview));
  await write(path.join(run, 'security-review.json'), scenario.security);
  await write(path.join(run, 'final-plan.md'), scenario.final);
  await write(path.join(run, 'decisions.json'), decisions);
  await runner.ask({ run, stage: 'verify' }, invoke('verify', verification));
  const verifiedState = await read(path.join(run, 'run.json'));
  assert.equal(verifiedState.status, 'awaiting_coordinator');
  assert.deepEqual(Object.keys(verifiedState.stages), baseStages);
  await write(path.join(run, 'final-plan.md'), revisedPlan);
  const finalCheckStarted = performance.now();
  await runner.ask({ run, stage: 'verify-final' }, invoke('verify-final', finalVerification));
  const finalCheckMs = performance.now() - finalCheckStarted;
  await runner.finish({ run });
  const controllerWallMs = performance.now() - started;
  const completion = await read(path.join(run, 'completion.json'));
  const state = await read(path.join(run, 'run.json'));
  assert.deepEqual(seenStages, expectedStages);
  assert.deepEqual(Object.keys(state.stages), expectedStages);
  assert.ok(Object.values(state.stages).every(item => item.status === 'succeeded'));
  assert.equal(state.status, 'complete');
  assert.equal(state.attempts.length, expectedStages.length);
  assert.equal(state.attempts.filter(item => item.stage === 'verify-final').length, 1);
  assert.ok(state.attempts.every(item => item.status === 'succeeded'));
  assert.equal(completion.successful_worker_calls ?? completion.successful_peer_calls, expectedStages.length);
  assert.equal(completion.successful_peer_calls, scenario.mode === 'plan' ? 4 : 3);
  assert.equal(completion.verification_stage, 'verify-final');
  assert.equal(completion.delivered_plan_reviewed, true);
  assert.equal(completion.changedSinceVerification, false);
  assert.equal(completion.adjudications_changed_since_verification, false);
  assert.equal(completion.evidence_changed_since_verification, false);
  assert.equal(completion.unverified_revision_reason, null);
  assert.equal(completion.security_review.required, true);
  assert.equal(completion.outcome, scenario.mode === 'plan' ? 'complete_with_unresolved_findings' : 'complete_with_recorded_decisions');
  assert.deepEqual(completion.unresolved.map(item => item.finding_id), scenario.mode === 'plan' ? ['C-S2'] : []);
  for (const key of ['changed_artifacts', 'evidence_requests', 'source_changes', 'unavailable_sources']) assert.deepEqual(completion[key], []);
  assert.deepEqual(completion.final_hashes, completion.reviewed_hashes);
  assert.equal(completion.final_hashes['final-plan.md'], sha(revisedPlan));
  assert.equal(completion.final_hashes['decisions.json'], sha(json(decisions)));
  assert.equal(completion.final_hashes['security-review.json'], sha(json(scenario.security)));
  assert.equal(state.stages.verify.reviewed_hashes['final-plan.md'], sha(scenario.final));
  assert.notEqual(completion.final_hashes['final-plan.md'], state.stages.verify.reviewed_hashes['final-plan.md']);
  assert.deepEqual(await read(path.join(run, 'peer-verify.json')), workerReport(verification));
  assert.deepEqual(await read(path.join(run, 'peer-verify-final.json')), workerReport(finalVerification));
  assert.deepEqual(originalReport(await read(path.join(run, 'security-review.json'))), scenario.security);
  completed.push({ scenario: scenario.name, route, case: 'unique', variant: 'candidate', calls: expectedStages.length, base_calls: baseStages.length, incremental_calls: 1,
    stages: expectedStages, attempts_used: state.attempts.length, successful_peer_calls: completion.successful_peer_calls,
    verification_stage: completion.verification_stage, delivered_plan_reviewed: true, changed_since_verification: false,
    outcome: completion.outcome, unresolved: completion.unresolved, participants: completion.participants,
    initial_plan_sha256: sha(scenario.final), final_plan_sha256: sha(revisedPlan), correction_sha256: sha(corrections[scenario.name]),
    decisions_sha256: completion.final_hashes['decisions.json'], security_review_sha256: completion.final_hashes['security-review.json'],
    controller_wall_ms: Math.round(controllerWallMs * 1000) / 1000, verify_final_controller_wall_ms: Math.round(finalCheckMs * 1000) / 1000,
  });
}
assert.deepEqual(await sourceHashes(source), sources, 'Source changed during measurement');
for (const [file, expected] of Object.entries(harnessHashes)) assert.equal(sha(await fs.readFile(path.join(here, file))), expected, 'Harness/fixture changed during measurement');
const metrics = {
  schema_version: 1, measurement: 'optional_final_revision', provider_calls: 0,
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  variants: [{ name: 'candidate', version: '0.12.0', sources }],
  harness_sha256: harnessHashes['measure-final-revision.mjs'], shared_harness_sha256: harnessHashes['measure-current.mjs'], fixture_source_sha256: harnessHashes['fixtures.mjs'],
  method: 'Four fresh current-only unique-evidence fixture workflows each complete initial verify, receive the specified plan appendix, then complete one actual verify-final and finish. Only the four incremental final-check prompts and schemas are in captures/schema_captures; prior fixed-stage captures are recorded separately for audit. All responses are injected, including schema-required empty evidence_requests. No provider discovery, authentication probing or model execution occurs.',
  scope: 'The optional branch is conditional, not a typical-workflow estimate or a matched baseline comparison. Revisions add an explicit first work item based on existing fixture facts; no supplemental evidence is requested. Initial verification remains preserved and final hashes match the final-check reviewed hashes.',
  exclusions: 'No real plan-quality, total/billed tokens, output/reasoning tokens, model latency or cost claims. Schema text is the observable CLI request, not the provider-added schema envelope. Do not combine this conditional branch with matched-workflow savings percentages.',
  timing: 'Per-run and final-check controller wall times include injected capture writes, local locks, durable state writes and rendering. Single serial runs are diagnostics, not model speed evidence.',
  corrections, captures, schema_captures: schemaCaptures, completed, setup_captures_excluded_from_incremental_counts: setupCaptures,
};
await write(path.join(destination, 'metrics.json'), metrics);
console.log(JSON.stringify({ output: destination, workflows: completed.length, captured_incremental_prompts: captures.length, captured_incremental_schemas: schemaCaptures.length, total_injected_calls: completed.reduce((sum, item) => sum + item.calls, 0), provider_calls: 0 }));
