import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prepare, preview, ask } from '../scripts/council.mjs';

const limit = 1024 * 1024;
const tempParent = await fs.realpath(os.tmpdir());
const root = await fs.mkdtemp(path.join(tempParent, 'council-diff-boundary-'));
process.env.C2C_RUNTIME_HOME = path.join(root, 'runtimes');
after(async () => {
  const resolved = await fs.realpath(root);
  assert.equal(path.dirname(resolved), tempParent);
  assert.ok(path.basename(resolved).startsWith('council-diff-boundary-'));
  await fs.rm(resolved, { recursive: true, force: true });
});
const write = (file, value) => fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
const report = { summary: 'Synthetic boundary review.', verdict: 'ready', proposal_markdown: 'Inspect the supplied exporter, then propose an acceptance check.', findings: [], assumptions: [], open_questions: [], limitations: [] };
const invoke = async ({ provider }) => ({ code: 0, stderr: '', stdout: provider === 'claude'
  ? JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: report, result: JSON.stringify(report), session_id: 'fixture' })
  : [{ type: 'thread.started', thread_id: 'fixture' }, { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(report) } }, { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }].map(JSON.stringify).join('\n') });

test('revision prompt drops only auxiliary excerpts at the size boundary and accounts for the actual packet', async () => {
  const project = path.join(root, 'project'), out = path.join(root, 'run');
  await fs.mkdir(project);
  const brief = path.join(root, 'brief.txt'), context = path.join(project, 'context.txt'), assessment = path.join(root, 'assessment.json');
  await write(brief, 'Plan reliable export.');
  await write(context, 'Authoritative source evidence must remain present.');
  await write(assessment, {
    assessed_at: '2026-10-06T12:00:00.000Z', summary: 'Synthetic fixture.', project_type: 'software',
    deployment: { status: 'non_production', evidence: ['E1'] },
    readiness: { status: 'not_assessed', scope: 'Only this fixture.', gaps: [], evidence: [] },
    evidence: [{ id: 'E1', source: 'Fixture setup', observation: 'A temporary project with no deployed service.', kind: 'observed' }],
    direction: { route: 'extend_existing', clarity: 'ready', goal: 'Plan reliable export.', scope: ['Escaping.'], success_criteria: ['Fields round-trip.'], constraints: ['Supplied context.'], next_step: 'Inspect the exporter interface.' }, unknowns: [],
  });
  await prepare({ project, brief, assessment, context: [context], coordinator: 'codex', mode: 'review', 'timeout-policy': 'fixed', out });
  await write(path.join(out, 'coordinator-draft.json'), report);
  await write(path.join(out, 'coordinator-review.json'), report);
  await ask({ run: out, stage: 'review' }, invoke);
  await write(path.join(out, 'security-review.json'), { ...report, summary: 'Security review evidence remains authoritative.' });
  await write(path.join(out, 'decisions.json'), []);
  const before = '# Plan\nOld action.\n';
  const planPath = path.join(out, 'final-plan.md');
  await write(planPath, before);
  await ask({ run: out, stage: 'verify' }, invoke);

  let length = 10000;
  const currentPlan = () => '# Plan\nChanged action.\n' + 'x'.repeat(length);
  const inspect = async () => {
    await write(planPath, currentPlan());
    return preview({ run: out, stage: 'verify-final' });
  };
  let shown = await inspect();
  assert.equal(shown.projection.plan_changes_omission, undefined);
  // Cross the normal prompt bound by less than the omitted diff's size. The
  // input itself remains within its original read cap throughout these cases.
  length += limit - shown.prompt.bytes + 100;
  shown = await inspect();
  assert.equal(shown.projection.plan_changes_omission.worker_notice, true);
  assert.equal(shown.projection.plan_changes_omission.reason, 'prompt_size_limit');
  assert.ok(shown.prompt.bytes <= limit);
  assert.ok(shown.projection.plan_changes_omission.omitted_packet_bytes > 0);
  assert.equal(shown.projection.saved_bytes, 0, 'Diff omission is not attributed to projection savings');

  // Leave too little room for even the marker: disclose omission in local
  // metadata, while sending all authoritative context to the worker.
  length += limit - shown.prompt.bytes + 50;
  shown = await inspect();
  assert.equal(shown.projection.plan_changes_omission.worker_notice, false);
  const originalPlan = currentPlan(), stablePreview = shown;
  let captured;
  await ask({ run: out, stage: 'verify-final' }, async request => {
    captured = request.prompt;
    return invoke(request);
  });
  const packet = JSON.parse(captured.split('\nCOUNCIL_PACKET_JSON\n')[1]);
  assert.equal(packet.plan_changes, undefined);
  assert.equal(packet.final_plan, originalPlan);
  assert.deepEqual(packet.decisions, []);
  assert.equal(packet.security_review.summary, 'Security review evidence remains authoritative.');
  assert.deepEqual(packet.previous_verification, report);
  assert.equal(packet.shared_context.inputs[1].content, 'Authoritative source evidence must remain present.');
  assert.equal(Buffer.byteLength(captured), stablePreview.prompt.bytes);
  assert.equal(sha(captured), stablePreview.prompt.sha256);
  assert.equal(Buffer.byteLength(JSON.stringify(packet)), stablePreview.projection.sent_bytes);
  assert.equal(stablePreview.projection.sent_bytes, stablePreview.projection.full_bytes);
  const state = JSON.parse(await fs.readFile(path.join(out, 'run.json'), 'utf8'));
  assert.deepEqual(state.attempts.at(-1).context_projection, stablePreview.projection);
  assert.equal(stablePreview.projection.plan_changes_omission.before_sha256, sha(before));
  assert.equal(stablePreview.projection.plan_changes_omission.after_sha256, sha(originalPlan));
});
