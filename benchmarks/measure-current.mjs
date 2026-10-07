// Offline v0.11.3 -> v0.12.0 input measurement; compare.mjs remains historical.
// Usage: node benchmarks/measure-current.mjs --baseline DIR --candidate DIR --output NEW_DIR [--case all|unique|duplicate-paths|distinct-same-content]
// To check reproducibility, run again with the current source as both variants.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { scenarioSmall, scenarioLarge, report } from './fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2);
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const write = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof value === 'string' ? value : json(value));
};
const EVIDENCE_INSTRUCTION = 'When a missing fact could change a material recommendation, use evidence_requests with the stage finding prefix plus -E1 (for example P-R-E1), a precise question, and a repository-relative path (empty when unknown). Request only necessary evidence; no credentials. Use [] otherwise. Requests authorize no access. Supplied revisions are coordinator-declared and may differ from the original snapshot; do not silently conflate versions.\n';
const OLD_VERIFY = 'This is the final peer round.';
const NEW_VERIFY = 'A single bounded revision check may follow consequential changes; do not request extra rounds for agreement alone.';
const EVIDENCE_SCHEMA = {
  type: 'array', maxItems: 10, items: {
    type: 'object', additionalProperties: false, required: ['id', 'question', 'path'],
    properties: { id: { type: 'string' }, question: { type: 'string' }, path: { type: 'string' } },
  },
};
const reportFields = ['coordinator_proposal', 'peer_proposal', 'coordinator_review', 'peer_review', 'security_review'];
const protocolChanges = [
  'v0.12.0 adds the exact evidence-request instruction line to the prompt prefix.',
  'v0.12.0 replaces the exact final-peer-round sentence in verify stage_instruction with a bounded revision-check sentence.',
  'v0.12.0 worker output schema adds only the specified evidence_requests array property and required key.',
  'Injected v0.12.0 worker reports add evidence_requests: []; every original report field remains exact. Coordinator-authored reports are unchanged.',
  'Local run format becomes 6, and current completion metadata records verification/evidence status; matching completion invariants remain exact.',
];

function originalReport(value) {
  const copy = structuredClone(value);
  if (Object.hasOwn(copy, 'evidence_requests')) {
    assert.deepEqual(copy.evidence_requests, [], 'Only empty evidence-request protocol metadata is allowed in these fixtures');
    delete copy.evidence_requests;
  }
  return copy;
}

function taskData(packet) {
  const copy = structuredClone(packet);
  delete copy.run_id; // Only nondeterministic transport ID; no task fields are removed.
  delete copy.stage_instruction; // Checked separately against the exact sentence allowlist.
  for (const key of reportFields) if (Object.hasOwn(copy, key)) copy[key] = originalReport(copy[key]);
  return copy;
}

function splitPrompt(raw) {
  const marker = '\nCOUNCIL_PACKET_JSON\n';
  const index = raw.indexOf(marker);
  assert.ok(index >= 0 && index === raw.lastIndexOf(marker), 'Expected exactly one packet boundary');
  const prefix = raw.slice(0, index);
  const packet = JSON.parse(raw.slice(index + marker.length));
  // Preserve the complete measured string; do not reserialize, deduplicate or strip it.
  const prompt = Object.hasOwn(packet, 'run_id')
    ? raw.replace(`"run_id":${JSON.stringify(packet.run_id)}`, '"run_id":"BENCHMARK_RUN"') : raw;
  return { prefix, packet, prompt };
}

function assertMatchingCapture(before, after) {
  assert.deepEqual(taskData(after.packet), taskData(before.packet), 'Exact task evidence, reports and participants must match');
  if (before.version === after.version) {
    assert.equal(after.prefix, before.prefix, 'Same-version prompt prefix must match');
    assert.equal(after.packet.stage_instruction, before.packet.stage_instruction, 'Same-version stage instruction must match');
    assert.deepEqual(after.schema, before.schema, 'Same-version schema must match');
    assert.equal(after.prompt, before.prompt, 'Same-version measured prompts must match exactly');
    assert.equal(after.schemaText, before.schemaText, 'Same-version measured schema text must match exactly');
    return;
  }
  assert.equal(before.version, '0.11.3');
  assert.equal(after.version, '0.12.0');
  assert.equal(after.prefix.split(EVIDENCE_INSTRUCTION).length, 2, 'Expected the exact new evidence instruction once');
  assert.equal(after.prefix.replace(EVIDENCE_INSTRUCTION, ''), before.prefix, 'Unlisted prompt-prefix change');
  const expectedInstruction = before.stage === 'verify'
    ? before.packet.stage_instruction.replace(OLD_VERIFY, NEW_VERIFY) : before.packet.stage_instruction;
  if (before.stage === 'verify') assert.ok(before.packet.stage_instruction.includes(OLD_VERIFY));
  assert.equal(after.packet.stage_instruction, expectedInstruction, 'Unlisted stage-instruction change');
  const schema = structuredClone(after.schema);
  assert.deepEqual(schema.properties.evidence_requests, EVIDENCE_SCHEMA, 'Unexpected evidence-request schema');
  assert.equal(schema.required.filter(key => key === 'evidence_requests').length, 1);
  delete schema.properties.evidence_requests;
  schema.required = schema.required.filter(key => key !== 'evidence_requests');
  assert.deepEqual(schema, before.schema, 'Unlisted response-schema change');
}

function selfChecks(capture) {
  assertMatchingCapture(capture, structuredClone(capture));
  const mutations = {
    evidence: changed => { changed.packet.shared_context.inputs[0].content += '\nMUTATED'; },
    participants: changed => { changed.packet.participants.peer_model = 'unexpected-model'; },
    instruction: changed => { changed.packet.stage_instruction += ' Unlisted instruction.'; },
    schema: changed => { changed.schema.properties.summary.type = 'number'; },
    report: changed => { changed.packet.coordinator_proposal.summary += ' MUTATED'; },
    nonempty_evidence_request: changed => { changed.packet.coordinator_proposal.evidence_requests = [{ id: 'C-D-E1', question: 'Unexpected?', path: '' }]; },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const changed = structuredClone(capture);
    mutate(changed);
    assert.throws(() => assertMatchingCapture(capture, changed), assert.AssertionError, `${name} mismatch must be detected`);
  }
  return { identical_capture: 'passed', rejected_mutations: Object.keys(mutations) };
}

async function requestSchema(request) {
  const inline = request.args.indexOf('--json-schema');
  const file = request.args.indexOf('--output-schema');
  assert.equal(Number(inline >= 0) + Number(file >= 0), 1, 'Expected exactly one observable response schema');
  const text = inline >= 0 ? request.args[inline + 1] : await fs.readFile(request.args[file + 1], 'utf8');
  return { text, schema: JSON.parse(text), transport: inline >= 0 ? 'inline-json-argument' : 'schema-file-content' };
}

async function sourceHashes(source) {
  const files = ['package.json', ...(await fs.readdir(path.join(source, 'scripts'))).filter(file => file.endsWith('.mjs')).sort().map(file => `scripts/${file}`)];
  return Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await fs.readFile(path.join(source, file)))])));
}

async function main() {
  const harnessHash = sha(await fs.readFile(fileURLToPath(import.meta.url)));
  const fixtureHash = sha(await fs.readFile(path.join(here, 'fixtures.mjs')));
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i];
    assert.ok(['--baseline', '--candidate', '--output', '--case'].includes(key), `Unknown argument: ${key}`);
    assert.ok(process.argv[i + 1] && !Object.hasOwn(options, key.slice(2)), `Missing or repeated argument: ${key}`);
    options[key.slice(2)] = process.argv[i + 1];
  }
  for (const key of ['baseline', 'candidate', 'output']) assert.ok(options[key], `--${key} is required`);
  const allCases = ['unique', 'duplicate-paths', 'distinct-same-content'];
  assert.ok(options.case === undefined || options.case === 'all' || allCases.includes(options.case), 'Invalid --case');
  const cases = options.case && options.case !== 'all' ? [options.case] : allCases;
  const destination = path.resolve(options.output);
  const variants = [];
  for (const name of ['baseline', 'candidate']) {
    const source = await fs.realpath(path.resolve(options[name]));
    const version = (await read(path.join(source, 'package.json'))).version;
    assert.ok(['0.11.3', '0.12.0'].includes(version), 'This harness only enumerates v0.11.3 and v0.12.0 protocol changes');
    const relative = path.relative(source, destination);
    assert.ok(relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), 'Output must be outside both source trees');
    variants.push({ name, source, version, sources: await sourceHashes(source), runner: await import(pathToFileURL(path.join(source, 'scripts/council.mjs'))) });
  }
  assert.ok(variants[0].version === variants[1].version || variants[0].version === '0.11.3' && variants[1].version === '0.12.0', 'Unsupported version direction');
  await fs.mkdir(destination); // Fresh output only. A failed run remains available for diagnosis.
  const captures = [], schemaCaptures = [], completed = [];
  for (const scenario of [scenarioSmall, scenarioLarge]) for (const route of ['host-cross', 'worker-author']) for (const caseName of cases) {
    const author = route === 'worker-author';
    // Fictional canonical IDs exercise routing, not model recommendations.
    const prepareExtra = author ? {
      'author-model': scenario.coordinator === 'codex' ? 'gpt-99.1-planner' : 'claude-opus-99-1',
      'peer-model': scenario.coordinator === 'codex' ? 'gpt-99.0-codex' : 'gpt-99.1-planner',
      pairing: scenario.mode === 'review' ? 'same' : 'cross',
    } : {};
    const expectedStages = author ? scenario.mode === 'plan' ? ['author-draft', 'draft', 'author-review', 'review', 'verify'] : ['author-draft', 'review', 'verify'] : scenario.mode === 'plan' ? ['draft', 'review', 'verify'] : ['review', 'verify'];
    const participants = {
      pairing: prepareExtra.pairing || 'cross', coordinator: scenario.coordinator,
      peer: prepareExtra.pairing === 'same' ? scenario.coordinator : scenario.coordinator === 'codex' ? 'claude' : 'codex',
      coordinator_model: null, peer_model: prepareExtra['peer-model'] || null,
      ...(author ? { author_model: prepareExtra['author-model'], author_provider: scenario.coordinator } : {}),
    };
    const reports = [scenario.draft, scenario.review, scenario.peerReview, scenario.security, ...(scenario.mode === 'plan' ? [scenario.peerDraft] : [])];
    const decisions = reports.flatMap(item => item.findings.map(finding => ({
      finding_id: finding.id, disposition: finding.id === 'C-S2' ? 'unresolved' : 'accepted',
      rationale: finding.id === 'C-S2' ? 'The roadmap blocks persistent leads until the owner approves retention and a named policy owner; the user decision remains open.' : `Final plan includes the correction and proposed acceptance gate: ${finding.action}`,
    })));
    const verification = report('The fixture preserves requirements, material corrections and policy gates.', '', [], {
      verdict: scenario.mode === 'plan' ? 'insufficient_context' : 'ready',
      open_questions: scenario.mode === 'plan' ? ['Lead retention approval remains a required user decision.'] : [],
    });
    const caseRoot = path.join(destination, scenario.name, route, caseName);
    const project = path.join(caseRoot, 'inputs/project');
    const inputs = path.dirname(project);
    await write(path.join(inputs, 'brief.txt'), scenario.brief);
    await write(path.join(inputs, 'assessment.json'), scenario.assessment);
    const context = [], expectedInputs = [{ kind: 'brief', path: 'brief-1.txt', content: scenario.brief }];
    for (const [name, content] of Object.entries(scenario.contexts)) {
      const file = path.join(project, name);
      await write(file, content); context.push(file);
      expectedInputs.push({ kind: 'context', path: name, content });
    }
    if (caseName === 'duplicate-paths') {
      await fs.mkdir(path.join(project, 'alias'));
      context.push(context[0], `${project}${path.sep}alias${path.sep}..${path.sep}${path.basename(context[0])}`);
    } else if (caseName === 'distinct-same-content') {
      const copy = path.join(project, 'independent-source-copy.md');
      const content = await fs.readFile(context[0], 'utf8');
      await write(copy, content); context.push(copy);
      expectedInputs.push({ kind: 'context', path: 'independent-source-copy.md', content });
    }
    for (const variant of variants) {
      const started = performance.now();
      const run = path.join(caseRoot, variant.name);
      await variant.runner.prepare({ ...prepareExtra, project, brief: path.join(inputs, 'brief.txt'), assessment: path.join(inputs, 'assessment.json'), context, coordinator: scenario.coordinator, mode: scenario.mode, out: run });
      const seenStages = [];
      const workerReport = fixed => variant.version === '0.12.0' ? { ...structuredClone(fixed), evidence_requests: [] } : structuredClone(fixed);
      const invoke = (stage, fixed) => async request => {
        seenStages.push(stage);
        const { packet, prefix, prompt } = splitPrompt(request.prompt);
        assert.deepEqual(packet.participants, participants, 'Exact declared/requested participant route');
        const expectedPacket = { shared_context: { project: '.', inputs: expectedInputs, project_assessment: scenario.assessment }, mode: scenario.mode, participants, stage };
        if (!stage.endsWith('draft')) {
          expectedPacket.coordinator_proposal = scenario.draft;
          if (scenario.mode === 'plan') expectedPacket.peer_proposal = scenario.peerDraft;
        }
        if (stage === 'verify') Object.assign(expectedPacket, { coordinator_review: scenario.review, peer_review: scenario.peerReview, final_plan: scenario.final, decisions, security_review: scenario.security });
        assert.deepEqual(taskData(packet), expectedPacket, 'Full fixture evidence/reports and independent-stage visibility');
        const expectedProvider = stage.startsWith('author-') ? scenario.coordinator : participants.peer;
        assert.equal(request.provider, expectedProvider);
        const modelIndex = request.args.indexOf('--model');
        if (author) assert.equal(request.args[modelIndex + 1], stage.startsWith('author-') ? prepareExtra['author-model'] : prepareExtra['peer-model']);
        else assert.equal(modelIndex, -1);
        const { schema, text: schemaText, transport } = await requestSchema(request);
        const expectedSchema = structuredClone(variant.runner.REPORT_SCHEMA);
        if (variant.version === '0.12.0') expectedSchema.required = Object.keys(expectedSchema.properties);
        assert.deepEqual(schema, expectedSchema);
        const file = path.join(caseRoot, `${variant.name}-${stage}.txt`);
        const schemaFile = path.join(caseRoot, `${variant.name}-${stage}.schema.txt`);
        await write(file, prompt);
        await write(schemaFile, schemaText);
        const identifiers = { scenario: scenario.name, route, case: caseName, variant: variant.name, stage };
        captures.push({ ...identifiers, file: path.relative(destination, file).split(path.sep).join('/'), bytes: Buffer.byteLength(prompt), sha256: sha(prompt), version: variant.version, packet, prefix, prompt, schema, schemaText });
        schemaCaptures.push({ ...identifiers, file: path.relative(destination, schemaFile).split(path.sep).join('/'), bytes: Buffer.byteLength(schemaText), sha256: sha(schemaText), canonical_sha256: sha(JSON.stringify(schema)), provider: request.provider, transport });
        const output = workerReport(fixed);
        return { code: 0, stderr: '', stdout: request.provider === 'claude'
          ? JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: output, result: JSON.stringify(output), session_id: 'offline-fixture' })
          : [{ type: 'thread.started', thread_id: 'offline-fixture' }, { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(output) } }, { type: 'turn.completed' }].map(item => JSON.stringify(item)).join('\n') };
      };
      // Supplying an invoker on every ask bypasses provider discovery, probing and execution.
      if (author) await variant.runner.ask({ run, stage: 'author-draft' }, invoke('author-draft', scenario.draft));
      else await write(path.join(run, 'coordinator-draft.json'), scenario.draft);
      if (scenario.mode === 'plan') await variant.runner.ask({ run, stage: 'draft' }, invoke('draft', scenario.peerDraft));
      if (author && scenario.mode === 'plan') await variant.runner.ask({ run, stage: 'author-review' }, invoke('author-review', scenario.review));
      else await write(path.join(run, 'coordinator-review.json'), scenario.review);
      await variant.runner.ask({ run, stage: 'review' }, invoke('review', scenario.peerReview));
      await write(path.join(run, 'security-review.json'), scenario.security);
      await write(path.join(run, 'final-plan.md'), scenario.final);
      await write(path.join(run, 'decisions.json'), decisions);
      await variant.runner.ask({ run, stage: 'verify' }, invoke('verify', verification));
      await variant.runner.finish({ run });
      const controllerWallMs = performance.now() - started;
      const completion = await read(path.join(run, 'completion.json'));
      const state = await read(path.join(run, 'run.json'));
      const calls = completion.successful_worker_calls ?? completion.successful_peer_calls;
      assert.deepEqual(seenStages, expectedStages);
      assert.deepEqual(Object.keys(state.stages), expectedStages);
      assert.ok(Object.values(state.stages).every(stage => stage.status === 'succeeded'));
      assert.equal(state.status, 'complete');
      assert.equal(calls, expectedStages.length);
      assert.equal(completion.successful_peer_calls, scenario.mode === 'plan' ? 3 : 2);
      assert.equal(completion.attempts_used, calls);
      assert.equal(completion.security_review.required, true);
      assert.equal(completion.changedSinceVerification, false);
      assert.deepEqual(completion.changed_artifacts, []);
      assert.deepEqual(completion.source_changes, []);
      assert.deepEqual(completion.unavailable_sources, []);
      assert.deepEqual(completion.final_hashes, completion.reviewed_hashes);
      assert.equal(completion.outcome, scenario.mode === 'plan' ? 'complete_with_unresolved_findings' : 'complete_with_recorded_decisions');
      assert.equal(completion.peer_verdict, verification.verdict);
      if (variant.version === '0.12.0') {
        assert.equal(state.version, 6);
        assert.equal(completion.verification_stage, 'verify');
        assert.equal(completion.delivered_plan_reviewed, true);
        assert.equal(completion.adjudications_changed_since_verification, false);
        assert.equal(completion.evidence_changed_since_verification, false);
        assert.equal(completion.unverified_revision_reason, null);
        assert.deepEqual(completion.evidence_requests, []);
      }
      const reportArtifacts = {
        'coordinator-draft.json': scenario.draft, 'coordinator-review.json': scenario.review,
        'peer-review.json': scenario.peerReview, 'security-review.json': scenario.security, 'peer-verify.json': verification,
        ...(scenario.mode === 'plan' ? { 'peer-draft.json': scenario.peerDraft } : {}),
      };
      const reportHashes = {};
      for (const [name, expected] of Object.entries(reportArtifacts)) {
        const actual = await read(path.join(run, name));
        const injectedWorker = name.startsWith('peer-') || author && (name === 'coordinator-draft.json' || name === 'coordinator-review.json' && scenario.mode === 'plan');
        assert.deepEqual(actual, injectedWorker ? workerReport(expected) : expected, `Exact saved report with enumerated protocol metadata: ${name}`);
        reportHashes[name] = sha(JSON.stringify(originalReport(actual)));
      }
      const finalHashes = Object.fromEntries(await Promise.all(['final-plan.md', 'decisions.json', 'security-review.json'].map(async name => [name, sha(await fs.readFile(path.join(run, name)))])));
      assert.equal(finalHashes['final-plan.md'], sha(scenario.final));
      assert.equal(finalHashes['decisions.json'], sha(json(decisions)));
      assert.deepEqual(completion.final_hashes, finalHashes);
      assert.deepEqual(completion.unresolved.map(item => item.finding_id), scenario.mode === 'plan' ? ['C-S2'] : []);
      completed.push({ scenario: scenario.name, route, case: caseName, variant: variant.name, calls,
        stages: expectedStages, successful_peer_calls: completion.successful_peer_calls, attempts_used: completion.attempts_used,
        outcome: completion.outcome, unresolved: completion.unresolved, participants: completion.participants,
        final_plan_sha256: finalHashes['final-plan.md'], decisions_sha256: finalHashes['decisions.json'], security_review_sha256: finalHashes['security-review.json'],
        original_report_data_sha256: reportHashes, completion_invariants: { security_review_required: true, changed_since_verification: false, final_hashes_match_reviewed: true, source_changes: [], unavailable_sources: [] },
        controller_wall_ms: Math.round(controllerWallMs * 1000) / 1000,
      });
    }
  }
  const identity = item => JSON.stringify([item.scenario, item.route, item.case, item.stage]);
  const nextCaptures = new Map(captures.filter(item => item.variant === 'candidate').map(item => [identity(item), item]));
  for (const before of captures.filter(item => item.variant === 'baseline')) {
    const after = nextCaptures.get(identity(before));
    assert.ok(after, 'Missing matching captured stage');
    assertMatchingCapture(before, after);
  }
  for (const before of completed.filter(item => item.variant === 'baseline')) {
    const after = completed.find(item => item.variant === 'candidate' && identity(item) === identity(before));
    const invariant = ({ variant, controller_wall_ms, ...rest }) => rest;
    assert.deepEqual(invariant(after), invariant(before), 'Matching workflow completion invariants');
  }
  const checks = selfChecks(captures.find(item => item.variant === 'candidate' && item.stage === 'verify'));
  // Recheck sources after execution, so silent source changes invalidate the result.
  for (const variant of variants) assert.deepEqual(await sourceHashes(variant.source), variant.sources, 'Source changed during measurement');
  assert.equal(sha(await fs.readFile(fileURLToPath(import.meta.url))), harnessHash, 'Harness changed during measurement');
  assert.equal(sha(await fs.readFile(path.join(here, 'fixtures.mjs'))), fixtureHash, 'Fixtures changed during measurement');
  const metrics = {
    measurement: 'offline-fixed-output-current-input', provider_calls: 0,
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    fixture_source_sha256: fixtureHash,
    harness_sha256: harnessHash,
    variants: variants.map(({ runner, source, ...metadata }) => metadata), protocol_changes_allowed: protocolChanges,
    method: 'Matching complete injected workflows using public fixed fixtures. Full prompts are measured without stripping instructions or metadata; only random run_id can be normalized. Exact original evidence, report data, participants, stage counts and final artifact hashes are asserted separately from the enumerated protocol changes. This is not prompt equivalence or model-quality equivalence.',
    scope: 'Two fixed scenarios, two historical routes, three context cases by default. No supplemental evidence requests or consequential post-verification revisions occur; their optional additional input/stage costs are outside this matched comparison. Current worker output adds only the schema-required empty evidence_requests array.',
    exclusions: 'No provider calls, account/authentication probes, model research, output/reasoning token measurement, billing, provider-added envelopes, cache measurement or end-to-end model latency. Separate schema text captures describe the observable CLI request only; provider schema serialization and billing are unknown. Prompt and schema token counts must not be presented as total billed input.',
    timing: 'controller_wall_ms spans prepare through finish, including injected-response capture writes, local locking, durable state writes and rendering. Runs are serial baseline-then-candidate without randomization or repetition. These are diagnostic controller times, not model response speed or a speed comparison.',
    self_checks: checks,
    captures: captures.map(({ packet, prefix, prompt, schema, schemaText, version, ...metadata }) => metadata),
    schema_captures: schemaCaptures, completed,
  };
  await write(path.join(destination, 'metrics.json'), metrics);
  console.log(JSON.stringify({ output: destination, workflows: completed.length, captured_prompts: captures.length, captured_schemas: schemaCaptures.length, provider_calls: 0, self_checks: checks }));
}

// The separate current-only revision fixture reuses capture primitives only.
export { sha, json, read, write, splitPrompt, requestSchema, sourceHashes, originalReport };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
