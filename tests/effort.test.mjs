import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { prepare, preview, ask, status, buildPeerArgs } from '../scripts/council.mjs';
import { writeRunState } from '../scripts/state.mjs';

const tempParent = await fs.realpath(os.tmpdir());
const root = await fs.mkdtemp(path.join(tempParent, 'c2c-effort-test-'));
const previousRuntime = process.env.C2C_RUNTIME_HOME;
process.env.C2C_RUNTIME_HOME = path.join(root, 'runtimes');
after(async () => {
  if (previousRuntime === undefined) delete process.env.C2C_RUNTIME_HOME;
  else process.env.C2C_RUNTIME_HOME = previousRuntime;
  const resolved = await fs.realpath(root);
  assert.equal(path.dirname(resolved), tempParent);
  assert.ok(path.basename(resolved).startsWith('c2c-effort-test-'));
  await fs.rm(resolved, { recursive: true, force: true });
});
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const write = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2));
const report = {
  summary: 'Synthetic effort transport fixture.', verdict: 'ready', proposal_markdown: 'Implement the export and check escaped fields.',
  findings: [], assumptions: [], open_questions: [], limitations: [],
};
function result(provider, extra = {}) {
  return { code: 0, stderr: '', stdout: provider === 'claude'
    ? JSON.stringify({ type: 'result', subtype: 'success', structured_output: report, ...extra })
    : [{ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(report) } },
      { type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 20, reasoning_output_tokens: 0 }, ...extra }].map(JSON.stringify).join('\n') };
}
async function inputs(extra = {}) {
  const dir = await fs.mkdtemp(path.join(root, 'run-'));
  const project = path.join(dir, 'project'); await fs.mkdir(project);
  const brief = path.join(dir, 'brief.txt'); await fs.writeFile(brief, 'Add export with correctly escaped fields.');
  const assessment = path.join(dir, 'assessment.json');
  await write(assessment, {
    assessed_at: '2026-10-09T12:00:00Z', summary: 'Synthetic local fixture.', project_type: 'software',
    deployment: { status: 'non_production', evidence: ['E1'] },
    readiness: { status: 'not_assessed', scope: 'Temporary fixture only.', gaps: [], evidence: [] },
    evidence: [{ id: 'E1', source: 'Fixture creation', observation: 'Empty temporary directory.', kind: 'observed' }],
    direction: { route: 'extend_existing', clarity: 'ready', goal: 'Add export.', scope: ['Field escaping.'], success_criteria: ['Escaped fields round-trip.'], constraints: ['Supplied context only.'], next_step: 'Specify export interface.' },
    unknowns: [],
  });
  return { project, brief, assessment, coordinator: 'codex', mode: 'review', out: path.join(dir, 'run'), ...extra };
}
async function fixture(extra = {}) {
  const options = await inputs(extra); prepare(options);
  if (!extra['author-model']) {
    await write(path.join(options.out, 'coordinator-draft.json'), report);
    await write(path.join(options.out, 'coordinator-review.json'), report);
  }
  return options;
}

test('prepare pins explicit role effort provenance and preview discloses the selected role', async () => {
  const f = await fixture({ 'author-model': 'gpt-6-astra', 'peer-model': 'claude-opus-5-5', 'author-effort': 'ultra', 'peer-effort': 'xhigh' });
  const state = await read(path.join(f.out, 'run.json'));
  const snapshot = await read(path.join(f.out, 'snapshot.json'));
  assert.deepEqual(state.worker_effort, snapshot.worker_effort);
  assert.deepEqual(state.worker_effort, { version: 1,
    peer: { provider: 'claude', model: 'claude-opus-5-5', requested: 'xhigh', source: 'explicit_option' },
    author: { provider: 'codex', model: 'gpt-6-astra', requested: 'ultra', source: 'explicit_option' } });
  assert.deepEqual(preview({ run: f.out, stage: 'author-draft' }).effort, state.worker_effort.author);
  assert.deepEqual(status({ run: f.out }).worker_effort.selection, state.worker_effort);
  assert.equal(state.attempts.length, 0);
});

test('prepare rejects invalid, cross-provider, and orphan author effort before creating a run', async () => {
  for (const extra of [{ 'peer-effort': 'ultra' }, { 'peer-effort': 'auto' }, { 'peer-effort': '' }, { 'peer-effort': 'ultracode' }, { 'author-effort': 'high' }]) {
    const options = await inputs(extra);
    assert.throws(() => prepare(options), /Unsupported claude effort|author-effort requires/);
    await assert.rejects(fs.stat(options.out), { code: 'ENOENT' });
  }
});

test('sealed effort cannot be changed, deleted, or relabelled after preparation', async () => {
  for (const change of [
    s => { s.worker_effort.peer.requested = 'high'; },
    s => { delete s.worker_effort; },
    s => { delete s.worker_effort.peer; },
    s => { s.worker_effort.peer.source = 'provider_reported'; },
    s => { s.worker_effort.peer.provider = 'codex'; },
  ]) {
    const f = await fixture({ 'peer-effort': 'xhigh' });
    const state = await read(path.join(f.out, 'run.json')); change(state); writeRunState(f.out, state);
    assert.throws(() => preview({ run: f.out, stage: 'review' }), /Worker effort selection/);
    await assert.rejects(ask({ run: f.out, stage: 'review' }, () => assert.fail('Do not launch changed effort')), /Worker effort selection/);
  }
});

test('author and peer launches use their own pinned effort and never infer effective effort from output', async () => {
  const f = await fixture({ 'author-model': 'gpt-6-astra', 'peer-model': 'claude-opus-5-5', 'author-effort': 'ultra', 'peer-effort': 'xhigh' });
  const author = await ask({ run: f.out, stage: 'author-draft' }, async ({ provider, args }) => {
    assert.equal(provider, 'codex'); assert.ok(args.includes('model_reasoning_effort="ultra"'));
    assert.ok(args.includes('--ignore-user-config')); assert.ok(args.includes('approval_policy="never"'));
    return result(provider, { effort: 'ultra', reasoning_effort: 'ultra' });
  });
  assert.deepEqual(author.effort, { requested_effort: 'ultra', effort_source: 'explicit_option', effective_effort: null, effective_effort_status: 'unreported' });
  await write(path.join(f.out, 'coordinator-review.json'), report);
  const peer = await ask({ run: f.out, stage: 'review' }, async ({ provider, args, env }) => {
    assert.equal(provider, 'claude'); assert.equal(args[args.indexOf('--effort') + 1], 'xhigh');
    assert.equal(env.CLAUDE_CODE_EFFORT_LEVEL, 'xhigh');
    assert.equal(args[args.indexOf('--tools') + 1], ''); assert.ok(args.includes('--safe-mode'));
    return result(provider, { effort: 'xhigh', effective_effort: 'xhigh' });
  });
  assert.equal(peer.effort.requested_effort, 'xhigh');
  assert.equal(peer.effort.effective_effort, null, 'Uncontracted fields or requested args do not attest applied effort');
  assert.deepEqual(status({ run: f.out }).worker_effort.attempts.map(a => [a.role, a.requested_effort, a.effective_effort_status]), [['author', 'ultra', 'unreported'], ['peer', 'xhigh', 'unreported']]);
});

test('unsupported explicit Claude effort blocks before an attempt or model invocation', async () => {
  for (const capability of [{ claude_effort: false }, { claude_effort: true, claude_effort_levels: ['low', 'medium', 'high'] }]) {
    const f = await fixture({ 'peer-effort': 'xhigh' });
    let probes = 0;
    await assert.rejects(ask({ run: f.out, stage: 'review' }, () => assert.fail('No model call'), { probe: async (provider, cwd, options) => {
      probes++; assert.equal(provider, 'claude'); assert.equal(options.effort, 'xhigh');
      assert.equal(options.env.CLAUDE_CODE_EFFORT_LEVEL, 'xhigh');
      return { authenticated: true, version: 'injected-preflight', executable: 'never-executed', ...capability };
    } }), /does not advertise/);
    assert.equal(probes, 1);
    assert.equal((await read(path.join(f.out, 'run.json'))).attempts.length, 0);
  }
});

test('failed and retried attempts preserve requested effort while effective effort stays unknown', async () => {
  const f = await fixture({ 'peer-effort': 'max' });
  await assert.rejects(ask({ run: f.out, stage: 'review' }, async ({ args }) => {
    assert.equal(args[args.indexOf('--effort') + 1], 'max');
    return { code: 0, stderr: '', stdout: JSON.stringify({ type: 'result', subtype: 'success', structured_output: {} }) };
  }), /report|summary|Invalid|required/i);
  await ask({ run: f.out, stage: 'review' }, async ({ provider, args }) => {
    assert.equal(args[args.indexOf('--effort') + 1], 'max'); return result(provider);
  });
  const state = await read(path.join(f.out, 'run.json'));
  assert.deepEqual(state.attempts.map(a => [a.status, a.requested_effort, a.effective_effort, a.effective_effort_status]), [['failed', 'max', null, 'unreported'], ['succeeded', 'max', null, 'unreported']]);
});

test('omitted and historical effort remain unknown and do not add launch flags', async () => {
  for (const legacy of [false, true]) {
    const f = await fixture({ coordinator: 'claude' });
    if (legacy) {
      const state = await read(path.join(f.out, 'run.json')); delete state.worker_effort;
      const snapshot = await read(path.join(f.out, 'snapshot.json')); delete snapshot.worker_effort;
      await write(path.join(f.out, 'snapshot.json'), snapshot);
      state.seals['snapshot.json'] = createHash('sha256').update(await fs.readFile(path.join(f.out, 'snapshot.json'))).digest('hex');
      writeRunState(f.out, state);
    }
    const view = preview({ run: f.out, stage: 'review' });
    assert.equal(view.effort.requested, null);
    assert.equal(view.effort.source, legacy ? 'legacy_unspecified' : 'unspecified');
    await ask({ run: f.out, stage: 'review' }, async ({ provider, args }) => {
      assert.equal(args.some(a => a.startsWith('model_reasoning_effort=')), false);
      assert.equal(args.includes('--effort'), false); return result(provider);
    });
    const state = await read(path.join(f.out, 'run.json'));
    assert.equal(state.attempts[0].requested_effort, null);
    assert.equal(state.attempts[0].effective_effort, null);
  }
});

test('effort CLI flags are prepare-only and help describes the provider-specific contract', async () => {
  const runner = new URL('../scripts/council.mjs', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const invoke = args => spawnSync(process.execPath, [fileURLToPath(runner), ...args], { encoding: 'utf8', env: process.env, timeout: 30000 });
  const help = invoke(['help']); assert.equal(help.status, 0); assert.match(help.stdout, /--peer-effort LEVEL.*--author-effort LEVEL/);
  const f = await inputs({ coordinator: 'claude', 'peer-effort': 'xhigh' });
  const prepared = invoke(['prepare', ...Object.entries(f).flatMap(([key, value]) => [`--${key}`, value])]);
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal((await read(path.join(f.out, 'run.json'))).worker_effort.peer.requested, 'xhigh');
  const invalid = invoke(['ask', '--run', f.out, '--stage', 'review', '--peer-effort', 'high']);
  assert.notEqual(invalid.status, 0); assert.match(invalid.stderr, /Invalid option: --peer-effort/);
});

test('Claude explicit effort arguments retain the tool-less safe-mode boundary', () => {
  const args = buildPeerArgs('claude', { schemaPath: 'schema.json', effort: 'max', model: 'claude-opus-5-5' });
  assert.equal(args[args.indexOf('--effort') + 1], 'max');
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'plan');
  assert.equal(args[args.indexOf('--mcp-config') + 1], '{"mcpServers":{}}');
  assert.ok(args.includes('--strict-mcp-config')); assert.ok(args.includes('--no-session-persistence'));
  assert.equal(buildPeerArgs('claude', { schemaPath: 'schema.json' }).includes('--effort'), false);
});
