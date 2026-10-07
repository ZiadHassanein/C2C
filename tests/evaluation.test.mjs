import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARMS, packet, importOutcome, blind, report, validateScore } from '../evals/evaluate.mjs';

// All model names, outputs and measurements below are fictional unit-test input.
// No model is called; accepted provenance fields test validation, not outcomes.
const CONFIG = {
  arms: ARMS,
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
  for (const task of ['feature', 'production']) {
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
  assert.equal(result.rows.length, 8);
  assert.equal(result.status, 'insufficient-matched-evidence');
  assert.equal(result.superiority_claim_supported, false);
  assert.equal(result.efficiency_comparison_available, false);
  assert.equal(result.limitations.filter(item => item.startsWith('Synthetic output')).length, 8);
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
