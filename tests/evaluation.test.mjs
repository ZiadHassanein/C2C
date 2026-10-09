import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { ARMS, TASKS, packet, importOutcome, blind, report, validateScore, validateBaseline, validateCaptureManifest } from '../evals/evaluate.mjs';

// All model names, outputs and measurements below are fictional unit-test input.
// No model is called; accepted provenance fields test validation, not outcomes.
const CONFIG = {
  arms: ARMS,
  tasks: ['feature', 'production'],
  available_models: [{ provider: 'fixture', model: 'model-a' }, { provider: 'fixture', model: 'model-b' }],
  limits: { max_calls: 12, max_seconds: 100, max_input_tokens: null, max_output_tokens: null },
};
const PLAN = 'A fictional plan quotation for testing evidence binding only. No quality result is established.';
const meta = (arm = 'solo', override = {}) => ({
  arm, provenance: 'synthetic', tool_version: 'fixture-v1',
  models: [{ provider: 'fixture', model: 'model-a', role: 'author' }],
  elapsed_seconds: 30, calls: 2, usage: { scope: 'whole-task', input_tokens: 100, output_tokens: 30 },
  unavailable_reason: '', execution_notes: 'Fictional unit fixture, not empirical evidence.',
  completed_at: '2026-10-07T00:00:00Z', ...override,
});
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const write = (file, data) => fs.writeFile(file, JSON.stringify(data));
const checkout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAPTURE = await read(path.join(checkout, 'evals/baselines/c2c-2.2.0.capture.json'));
const BASELINE = { arm: 'external', candidate_arm: 'c2c', capture_id: CAPTURE.capture_id, tool_version: CAPTURE.tool_version, source_revision: CAPTURE.source_revision };
const CONTROLS = { tools: 'Same offline fixture files; no tools beyond reading.', research_inputs: 'Same frozen fictional inputs; no external research.', settings: 'Fictional model settings, fixed across routes.', role_policy: 'Fixed author/critic assignments; independent drafts never see each other; every host counted.' };
const BASELINE_CONFIG = { ...CONFIG, arms: ['c2c', 'external'], tasks: TASKS, baseline: BASELINE, controls: CONTROLS };
const baselineMeta = value => ({ ...value, provenance: 'native-evaluation', source_revision: 'a'.repeat(40), ...(value.arm === BASELINE.arm ? { tool_version: BASELINE.tool_version, source_revision: BASELINE.source_revision, capture_id: BASELINE.capture_id } : {}) });
async function workspace(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'c2c-outcome-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
async function fillScores(batch, change = () => {}) {
  for (const entry of await read(path.join(batch, 'mapping.private.json'))) {
    const dir = path.join(batch, 'review', entry.id);
    const score = await read(path.join(dir, 'score-template.json'));
    score.evaluator.id = 'fixture-evaluator';
    for (const group of ['requirements', 'risks', 'implementability']) {
      for (const row of score[group]) { row.met = true; row.evidence = PLAN; }
    }
    change(score);
    await write(path.join(dir, 'score.json'), score);
  }
}
async function completeBatch(t, changeMeta = value => value, configForArm = () => CONFIG, selectedArms = ARMS) {
  const root = await workspace(t), runs = [];
  for (const task of configForArm(selectedArms[0]).tasks ?? TASKS) {
    for (const arm of selectedArms) {
      const packetDir = path.join(root, `${task}-${arm}-packet`);
      const outcomeDir = path.join(root, `${task}-${arm}-outcome`);
      await packet(task, configForArm(arm), packetDir);
      await importOutcome(packetDir, PLAN, changeMeta(meta(arm), task), outcomeDir);
      runs.push(outcomeDir);
    }
  }
  const batch = path.join(root, 'batch');
  await blind(runs, batch);
  await fillScores(batch);
  return { root, batch, runs };
}

test('participant packet freezes evidence and omits evaluator rubric', async t => {
  const root = await workspace(t), dir = path.join(root, 'packet');
  const manifest = await packet('feature', CONFIG, dir);
  assert.equal(manifest.task, 'feature');
  assert.equal(manifest.task_hash.length, 64);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['manifest.json', 'repo', 'task.md']);
  assert.match(await fs.readFile(path.join(dir, 'repo', 'catalogue.ts'), 'utf8'), /priceCents/);
  await assert.rejects(packet('feature', CONFIG, dir), /exist/i);
  const checkout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  await assert.rejects(packet('feature', CONFIG, path.join(checkout, 'eval-outcome-should-not-exist')), /outside/);
});

test('default arms omit external; selected two-arm comparison needs only those cells', async t => {
  const root = await workspace(t);
  const { arms: unused, ...defaultConfig } = CONFIG;
  const defaultPacket = path.join(root, 'default');
  const manifest = await packet('feature', defaultConfig, defaultPacket);
  assert.deepEqual(manifest.protocol.arms, ['solo', 'independent-review', 'c2c']);
  await assert.rejects(importOutcome(defaultPacket, PLAN, meta('external'), path.join(root, 'unselected')), /not preregistered/);
  await assert.rejects(packet('feature', { ...CONFIG, arms: ['solo'] }, path.join(root, 'one-arm')), /at least two/);
  const selected = ['solo', 'c2c'];
  const { batch } = await completeBatch(t, value => ({ ...value, provenance: 'native-evaluation' }), () => ({ ...CONFIG, arms: selected }), selected);
  const result = await report(batch);
  assert.equal(result.rows.length, 4);
  assert.equal(result.status, 'descriptive-matched-observations');
  assert.deepEqual(result.rows[0].protocol.arms, selected);
});

test('changed inputs and undeclared models cannot be imported', async t => {
  const root = await workspace(t), dir = path.join(root, 'packet');
  await packet('feature', CONFIG, dir);
  await assert.rejects(importOutcome(dir, PLAN, meta('solo', { models: [{ provider: 'fixture', model: 'undeclared', role: 'author' }] }), path.join(root, 'bad-model')), /outside.*pool/);
  await fs.appendFile(path.join(dir, 'task.md'), '\nNew unregistered requirement');
  await assert.rejects(importOutcome(dir, PLAN, meta(), path.join(root, 'bad-input')), /changed after preregistration/);
});

test('unknown measurements require explanation and do not become zero', async t => {
  const root = await workspace(t), dir = path.join(root, 'packet');
  await packet('feature', CONFIG, dir);
  const unknown = meta('solo', { elapsed_seconds: null, calls: null, usage: { scope: 'whole-task', input_tokens: null, output_tokens: null } });
  await assert.rejects(importOutcome(dir, PLAN, unknown, path.join(root, 'bad')), /Explain unavailable/);
  unknown.unavailable_reason = 'Fixture for UI measurement unavailability.';
  const record = await importOutcome(dir, PLAN, unknown, path.join(root, 'unknown'));
  assert.equal(record.metadata.calls, null);
  assert.equal(record.metadata.usage.input_tokens, null);
  await assert.rejects(importOutcome(dir, PLAN, meta('solo', { usage: { scope: 'workers-only', input_tokens: 10, output_tokens: 2 } }), path.join(root, 'partial')), /whole task/);
});

test('blinding strips metadata and preserves actual plan; missing outcomes block comparisons', async t => {
  const root = await workspace(t), dir = path.join(root, 'packet'), run = path.join(root, 'run'), batch = path.join(root, 'batch');
  await packet('feature', CONFIG, dir);
  await importOutcome(dir, PLAN, meta('solo'), run);
  await blind([run], batch);
  const mapping = await read(path.join(batch, 'mapping.private.json'));
  assert.match(mapping[0].id, /^[a-f0-9]{16}$/);
  const review = path.join(batch, 'review', mapping[0].id);
  assert.equal(await fs.readFile(path.join(review, 'plan.md'), 'utf8'), PLAN);
  assert.equal((await fs.readdir(review)).includes('outcome.json'), false);
  assert.equal(JSON.stringify(await read(path.join(review, 'score-template.json'))).includes('model-a'), false);
  const result = await report(batch);
  assert.equal(result.status, 'insufficient-matched-evidence');
  assert.ok(result.limitations.some(item => item.includes('Missing score')));
  assert.ok(result.limitations.some(item => item.includes('production/c2c')));
  await assert.rejects(blind([run, run], path.join(root, 'duplicate')), /one outcome/);
  await write(path.join(batch, 'mapping.private.json'), []);
  await assert.rejects(report(batch), /No imported outcomes/);
});

test('scoring requires full rubric coverage and exact evidence; adverse judgments stay separate', async t => {
  const root = await workspace(t), dir = path.join(root, 'packet'), run = path.join(root, 'run'), batch = path.join(root, 'batch');
  await packet('feature', CONFIG, dir);
  await importOutcome(dir, PLAN, meta(), run);
  await blind([run], batch);
  await fillScores(batch);
  const [{ id }] = await read(path.join(batch, 'mapping.private.json'));
  const score = await read(path.join(batch, 'review', id, 'score.json'));
  const rubric = await read(path.join(run, 'rubric.json'));
  const good = validateScore(score, id, PLAN, rubric);
  assert.equal(good.missing_requirements, 0);
  score.requirements[0].evidence = 'This quotation was invented.';
  assert.throws(() => validateScore(score, id, PLAN, rubric), /exact plan quotation/);
  score.requirements[0] = { id: 'F1', met: false, evidence: 'Requirement is omitted.' };
  score.harmful_remedies.push({ plan_quote: PLAN, explanation: 'Fictional adverse judgment.', evidence_reference: 'repo/CONTRACT.md' });
  const adverse = validateScore(score, id, PLAN, rubric);
  assert.equal(adverse.missing_requirements, 1);
  assert.equal(adverse.harmful_remedies, 1);
  score.requirements.pop();
  assert.throws(() => validateScore(score, id, PLAN, rubric), /Complete every/);
});

test('complete synthetic scores never establish outcome evidence', async t => {
  const { batch } = await completeBatch(t);
  const result = await report(batch);
  assert.equal(result.rows.length, 2 * ARMS.length);
  assert.equal(result.status, 'insufficient-matched-evidence');
  assert.equal(result.superiority_claim_supported, false);
  assert.equal(result.efficiency_comparison_available, false);
  assert.equal(result.limitations.filter(item => item.startsWith('Synthetic output')).length, 2 * ARMS.length);
});

test('matched available model pool permits role differences but never proves superiority', async t => {
  const { batch } = await completeBatch(t, value => ({ ...value, provenance: 'native-evaluation', models: value.arm === 'c2c' ? [{ provider: 'fixture', model: 'model-b', role: 'planner' }, { provider: 'fixture', model: 'model-a', role: 'critic' }] : value.models }));
  const result = await report(batch);
  assert.equal(result.status, 'descriptive-matched-observations');
  assert.equal(result.superiority_claim_supported, false);
  assert.equal(result.efficiency_comparison_available, true);
  assert.match(result.interpretation, /not provider-attested/);
});

test('unknown usage blocks efficiency even when quality judgments are matched', async t => {
  const { batch } = await completeBatch(t, value => ({ ...value, provenance: 'native-evaluation', usage: { scope: 'whole-task', input_tokens: null, output_tokens: null }, unavailable_reason: 'Fictional missing usage fixture.' }));
  const result = await report(batch);
  assert.equal(result.status, 'descriptive-matched-observations');
  assert.equal(result.efficiency_comparison_available, false);
});

test('unmatched limits and over-budget outcomes block matched comparisons', async t => {
  const { batch } = await completeBatch(t, value => ({ ...value, provenance: 'native-evaluation', calls: value.arm === 'c2c' ? 20 : 2 }), arm => ({ ...CONFIG, limits: { ...CONFIG.limits, max_calls: arm === 'external' ? 11 : 12 } }));
  const result = await report(batch);
  assert.equal(result.status, 'insufficient-matched-evidence');
  assert.ok(result.limitations.some(item => item.includes('allowance exceeded')));
  assert.ok(result.limitations.some(item => item.includes('Unmatched protocol_hash')));
});

test('compromised blinding and inconsistent evaluators block matched comparisons', async t => {
  const { batch } = await completeBatch(t, value => ({ ...value, provenance: 'native-evaluation' }));
  const [{ id }] = await read(path.join(batch, 'mapping.private.json'));
  const scoreFile = path.join(batch, 'review', id, 'score.json');
  const score = await read(scoreFile);
  score.evaluator.id = 'different-evaluator';
  score.evaluator.blindness_compromised = true;
  await write(scoreFile, score);
  const result = await report(batch);
  assert.equal(result.status, 'insufficient-matched-evidence');
  assert.ok(result.limitations.some(item => item.includes('Blinding compromised')));
  assert.ok(result.limitations.some(item => item.includes('Evaluator configuration differs')));
});

test('modified blinded plan or imported metadata cannot reuse old scores', async t => {
  const { batch, runs } = await completeBatch(t);
  const [{ id }] = await read(path.join(batch, 'mapping.private.json'));
  const planFile = path.join(batch, 'review', id, 'plan.md');
  await fs.appendFile(planFile, '\nChanged after scoring.');
  await assert.rejects(report(batch), /Reviewer evidence changed/);
  await fs.writeFile(planFile, PLAN);
  const recordFile = path.join(runs[0], 'outcome.json');
  const record = await read(recordFile);
  record.metadata.tool_version = 'modified';
  await write(recordFile, record);
  await assert.rejects(report(batch), /metadata changed after blinding/);
});

test('expanded frozen suite is fictional, source-bound and withheld from participants', async t => {
  const root = await workspace(t);
  const scenarios = {
    bilingual: ['B2', 'BI2'],
    'mixed-upload': ['M1', 'M3', 'M5'],
    'shared-premise': ['S1', 'S2'],
    'sound-plan': ['N1', 'N2', 'N4'],
    'revision-dependency': ['D2', 'D3', 'D5'],
  };
  for (const [task, consequentialIds] of Object.entries(scenarios)) {
    const dir = path.join(root, task);
    const manifest = await packet(task, { ...CONFIG, tasks: TASKS }, dir);
    assert.deepEqual(manifest.protocol.tasks, TASKS);
    assert.equal((await fs.readdir(dir)).includes('rubric.json'), false);
    const rubric = await read(path.join(checkout, 'evals/tasks', task, 'rubric.json'));
    assert.equal(rubric.fictional, true);
    const criteria = ['requirements', 'risks', 'implementability'].flatMap(group => rubric[group]);
    assert.equal(new Set(criteria.map(item => item.id)).size, criteria.length);
    for (const item of criteria) for (const ref of item.evidence) {
      assert.ok((await fs.readFile(path.join(dir, ref.path), 'utf8')).includes(ref.quote), `${task}/${item.id} needs visible raw evidence`);
    }
    for (const id of consequentialIds) assert.ok(criteria.some(item => item.id === id));
  }
  assert.match(await fs.readFile(path.join(root, 'bilingual/repo/DRAFTS.md'), 'utf8'), /ابتداءً/);
  const sound = await fs.readFile(path.join(root, 'sound-plan/repo/REVIEW.md'), 'utf8');
  assert.match(sound, /retaining the original plan/);
  assert.match(sound, /Remove the server membership check/);
});

test('omitted task selection defaults to all seven; independent synthesis is opt-in', async t => {
  const root = await workspace(t);
  const { tasks, arms, ...config } = CONFIG;
  const defaultManifest = await packet('bilingual', config, path.join(root, 'default'));
  assert.deepEqual(defaultManifest.protocol.tasks, TASKS);
  assert.equal(defaultManifest.protocol.arms.includes('independent-synthesis'), false);
  const selected = ['solo', 'independent-synthesis'];
  const { batch } = await completeBatch(t, value => ({ ...value, provenance: 'native-evaluation' }), () => ({ ...CONFIG, arms: selected, tasks: ['shared-premise'] }), selected);
  assert.equal((await report(batch)).quality_comparison_available, true);
  await assert.rejects(packet('production', { ...CONFIG, tasks: ['feature'] }, path.join(root, 'unselected')), /not preregistered/);
});

test('legacy v1 packets retain original protocol hashes and two-task comparison', async t => {
  const selected = ['solo', 'c2c'];
  const { tasks, ...legacyConfig } = { ...CONFIG, arms: selected, protocol: 'c2c-outcomes-v1' };
  // completeBatch needs the explicit loop selection; packet strips legacy tasks.
  const { batch } = await completeBatch(t, value => ({ ...value, provenance: 'native-evaluation' }), () => ({ ...legacyConfig, tasks }), selected);
  const result = await report(batch);
  assert.equal(result.rows.length, 4);
  assert.equal(result.quality_comparison_available, true);
  const protocol = result.rows[0].protocol;
  assert.deepEqual(Object.keys(protocol).sort(), ['arms', 'available_models', 'limits', 'protocol']);
  const canonical = value => JSON.stringify(value, (_, item) => item && !Array.isArray(item) && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  assert.equal(result.rows[0].protocol_hash, createHash('sha256').update(canonical(protocol)).digest('hex'));
});

test('capture template freezes 2.2.0 and seven cases without fabricating outcomes', async () => {
  await validateCaptureManifest(CAPTURE);
  assert.equal(CAPTURE.tool_version, '2.2.0');
  assert.deepEqual(CAPTURE.outcomes, []);
  assert.equal(Object.keys(CAPTURE.instruction_sha256).length, 5);
  for (const mutate of [
    value => { value.source_revision = 'main'; },
    value => { value.outcomes = [{ score: 100 }]; },
    value => { value.tasks.pop(); },
    value => { delete value.instruction_sha256['SKILL.md']; },
    value => { value.suite_sha256['evals/tasks/sound-plan/repo/PLAN.md'] = '0'.repeat(64); },
    value => { value.suite_sha256['../outside'] = '0'.repeat(64); },
  ]) {
    const damaged = structuredClone(CAPTURE);
    mutate(damaged);
    await assert.rejects(validateCaptureManifest(damaged), /baseline|Baseline/);
  }
});

test('malformed or relabeled baselines and wrong source captures cannot import', async t => {
  const root = await workspace(t);
  for (const baseline of [null, [], {}, { ...BASELINE, candidate_arm: 'external' }, { ...BASELINE, source_revision: 'main' }, { ...BASELINE, source_revision: 'a'.repeat(40) }, { ...BASELINE, tool_version: '2.1.4' }, { ...BASELINE, capture_id: 'other' }, { ...BASELINE, measured_gain: 42 }]) {
    assert.throws(() => validateBaseline(baseline, BASELINE_CONFIG.arms), /Baseline|baseline/);
  }
  await assert.rejects(packet('feature', { ...BASELINE_CONFIG, baseline: null }, path.join(root, 'null-baseline')), /Baseline/);
  const dir = path.join(root, 'packet');
  await packet('feature', BASELINE_CONFIG, dir);
  await assert.rejects(importOutcome(dir, PLAN, meta('external'), path.join(root, 'wrong-baseline')), /Baseline comparisons/);
  await assert.rejects(importOutcome(dir, PLAN, { ...baselineMeta(meta('external')), source_revision: 'a'.repeat(40) }, path.join(root, 'wrong-revision')), /Baseline metadata/);
});

test('unknown capped tokens preserve quality but block resource and promotion gates', async t => {
  const config = { ...BASELINE_CONFIG, limits: { ...CONFIG.limits, max_input_tokens: 1000, max_output_tokens: 1000 } };
  const { batch } = await completeBatch(t, value => ({ ...baselineMeta(value), usage: { scope: 'whole-task', input_tokens: null, output_tokens: null }, unavailable_reason: 'Fictional host counters unavailable.' }), () => config, config.arms);
  const result = await report(batch);
  assert.equal(result.quality_comparison_available, true);
  assert.equal(result.efficiency_comparison_available, false);
  assert.equal(result.promotion.quality_gate_passed, true);
  assert.equal(result.promotion.eligible_for_followup, false);
  assert.deepEqual(result.quality_limitations, []);
  assert.ok(result.efficiency_limitations.some(item => item.includes('allowance cannot be verified')));
  assert.equal(result.rows[0].metadata.usage.input_tokens, null);
});

test('matched complete frozen suite permits followup but no release or gains claim', async t => {
  const { batch } = await completeBatch(t, baselineMeta, () => BASELINE_CONFIG, BASELINE_CONFIG.arms);
  const result = await report(batch);
  assert.equal(result.rows.length, TASKS.length * 2);
  assert.equal(result.promotion.eligible_for_followup, true);
  assert.equal(result.promotion.release_or_gain_claim_supported, false);
  assert.equal(result.superiority_claim_supported, false);
  const first = (await read(path.join(batch, 'mapping.private.json')))[0];
  const blindedFiles = await fs.readdir(path.join(batch, 'review', first.id));
  assert.equal(blindedFiles.includes('manifest.json'), false);
  assert.equal(blindedFiles.includes('outcome.json'), false);
  assert.equal(JSON.stringify(await read(path.join(batch, 'review', first.id, 'score-template.json'))).includes(CAPTURE.capture_id), false);
});

test('promotion detects source-specific critical failures, harmful remedies and lost criteria despite equal totals', async t => {
  const { batch } = await completeBatch(t, baselineMeta, () => BASELINE_CONFIG, BASELINE_CONFIG.arms);
  const mapping = await read(path.join(batch, 'mapping.private.json'));
  for (const entry of mapping) {
    const outcome = await read(path.join(entry.directory, 'outcome.json'));
    const scoreFile = path.join(batch, 'review', entry.id, 'score.json');
    const score = await read(scoreFile);
    if (outcome.task === 'sound-plan' && outcome.metadata.arm === 'c2c') {
      score.requirements.find(row => row.id === 'N1').met = false;
      score.harmful_remedies.push({ plan_quote: PLAN, explanation: 'Fixture reviewer annotates removal of the required authorization transaction.', evidence_reference: 'repo/CONTRACT.md' });
    }
    if (outcome.task === 'bilingual') {
      // Equal requirement totals must not hide losing a previously met criterion.
      score.requirements.find(row => row.id === (outcome.metadata.arm === 'c2c' ? 'B3' : 'B4')).met = false;
    }
    await write(scoreFile, score);
  }
  const result = await report(batch);
  assert.equal(result.quality_comparison_available, true);
  assert.equal(result.promotion.quality_gate_passed, false);
  for (const expected of ['Critical failure in candidate: sound-plan', 'Quality regression: bilingual/B3', 'Increased harmful_remedies: sound-plan']) assert.ok(result.promotion.blockers.some(item => item.includes(expected)), expected);
});

test('synthetic runs, partial suites and mismatched controls cannot promote', async t => {
  const config = { ...BASELINE_CONFIG, tasks: ['feature'] };
  const { batch } = await completeBatch(t, value => ({ ...baselineMeta(value), provenance: 'synthetic' }), () => config, config.arms);
  const result = await report(batch);
  assert.equal(result.promotion.eligible_for_followup, false);
  assert.ok(result.promotion.blockers.some(item => item.includes('complete frozen baseline suite')));
  assert.equal(result.quality_comparison_available, false);
  const changed = await completeBatch(t, baselineMeta, arm => ({ ...config, controls: { ...CONTROLS, tools: arm === 'c2c' ? 'Extra tool access' : CONTROLS.tools } }), config.arms);
  const mismatch = await report(changed.batch);
  assert.equal(mismatch.quality_comparison_available, false);
  assert.ok(mismatch.quality_limitations.some(item => item.includes('protocol_hash')));
});

test('changed blinded task evidence and duplicate mappings cannot support reports', async t => {
  const { batch } = await completeBatch(t);
  const mapPath = path.join(batch, 'mapping.private.json');
  const mapping = await read(mapPath);
  const taskPath = path.join(batch, 'review', mapping[0].id, 'task.md');
  const original = await fs.readFile(taskPath, 'utf8');
  await fs.appendFile(taskPath, '\nFabricated reviewer-only requirement.');
  await assert.rejects(report(batch), /Reviewer task evidence changed/);
  await fs.writeFile(taskPath, original);
  await write(mapPath, [...mapping, mapping[0]]);
  await assert.rejects(report(batch), /Duplicate task\/arm/);
});

test('2.3 capture is independently registered without replacing the 2.2 baseline', async t => {
  const capture = await read(path.join(checkout, 'evals/baselines/c2c-2.3.0.capture.json'));
  await validateCaptureManifest(capture);
  const baseline = { ...BASELINE, capture_id: capture.capture_id, tool_version: capture.tool_version, source_revision: capture.source_revision };
  assert.deepEqual(validateBaseline(BASELINE, BASELINE_CONFIG.arms), BASELINE);
  assert.deepEqual(validateBaseline(baseline, BASELINE_CONFIG.arms), baseline);
  assert.throws(() => validateBaseline({ ...baseline, source_revision: BASELINE.source_revision }, BASELINE_CONFIG.arms), /frozen capture/);
  const root = await workspace(t), dir = path.join(root, 'registered-2-3');
  await packet('sound-plan', { ...BASELINE_CONFIG, baseline }, dir);
  const metadata = { ...baselineMeta(meta('external')), tool_version: baseline.tool_version, source_revision: baseline.source_revision, capture_id: baseline.capture_id };
  const outcome = await importOutcome(dir, PLAN, metadata, path.join(root, 'valid'));
  assert.equal(outcome.metadata.capture_id, capture.capture_id);
  await assert.rejects(importOutcome(dir, PLAN, baselineMeta(meta('external')), path.join(root, 'wrong-baseline')), /Baseline metadata/);
  assert.deepEqual(capture.outcomes, []);
  const config = { ...BASELINE_CONFIG, baseline };
  const { batch } = await completeBatch(t, value => ({ ...baselineMeta(value), ...(value.arm === baseline.arm ? { tool_version: baseline.tool_version, source_revision: baseline.source_revision, capture_id: baseline.capture_id } : {}) }), () => config, config.arms);
  const comparison = await report(batch);
  assert.equal(comparison.promotion.eligible_for_followup, true);
  assert.equal(comparison.superiority_claim_supported, false);
});
