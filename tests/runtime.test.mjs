import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { RUNTIME_FILES, packageRuntimeIdentity, pinRuntime, inspectRunRuntime, assertMatchingRuntime, validateRunOutput } from '../scripts/runtime.mjs';
import { readRunState, writeRunState } from '../scripts/state.mjs';

const sourceRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tempParent = fs.realpathSync(os.tmpdir());
const root = fs.mkdtempSync(path.join(tempParent, 'c2c-runtime-test-'));
const previousHome = process.env.C2C_RUNTIME_HOME;
after(() => {
  if (previousHome === undefined) delete process.env.C2C_RUNTIME_HOME; else process.env.C2C_RUNTIME_HOME = previousHome;
  assert.equal(path.dirname(fs.realpathSync(root)), tempParent);
  assert.ok(path.basename(root).startsWith('c2c-runtime-test-'));
  fs.rmSync(root, { recursive: true, force: true });
});
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(label) {
  const dir = fs.mkdtempSync(path.join(root, `${label}-`));
  const source = path.join(dir, 'package'), home = path.join(dir, 'trusted runtimes'), project = path.join(dir, 'project');
  for (const file of RUNTIME_FILES) {
    const target = path.join(source, file);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.copyFileSync(path.join(sourceRoot, file), target);
  }
  fs.mkdirSync(project);
  process.env.C2C_RUNTIME_HOME = home;
  return { dir, source, home, project, out: path.join(dir, 'run'), runner: path.join(source, 'scripts/council.mjs') };
}
function cli(f, args, runner = f.runner) {
  const result = spawnSync(process.execPath, [runner, ...args], { encoding: 'utf8', windowsHide: true, shell: false, timeout: 15000,
    env: { ...process.env, C2C_RUNTIME_HOME: f.home }, cwd: f.dir });
  if (result.error) throw result.error;
  return result;
}
function prepareFixture(label, extra = []) {
  const f = fixture(label);
  const brief = path.join(f.dir, 'brief.md'), assessment = path.join(f.dir, 'assessment.json');
  write(brief, 'Private fixture brief: add deterministic export. No provider call is authorized by this test.');
  write(assessment, {
    assessed_at: '2026-10-08T12:00:00.000Z', summary: 'Private local test fixture.', project_type: 'software',
    deployment: { status: 'non_production', evidence: ['E1'] },
    readiness: { status: 'not_assessed', scope: 'This fixture only', gaps: [], evidence: [] },
    evidence: [{ id: 'E1', source: 'Test fixture', observation: 'Temporary directory created by the test.', kind: 'observed' }],
    direction: { route: 'extend_existing', clarity: 'ready', goal: 'Deterministic export', scope: ['Escaping'], success_criteria: ['Fields round-trip'], constraints: ['No model calls'], next_step: 'Inspect exporter' }, unknowns: [],
  });
  const prepared = cli(f, ['prepare', '--project', f.project, '--brief', brief, '--assessment', assessment, '--out', f.out, '--coordinator', 'codex', ...extra]);
  assert.equal(prepared.status, 0, prepared.stderr);
  f.prepared = JSON.parse(prepared.stdout);
  return f;
}

test('prepare pins only package runtime and instructions in a shared trusted store', () => {
  const f = prepareFixture('pinned');
  const runtime = inspectRunRuntime(f.out);
  assert.equal(runtime.version, json(path.join(f.source, 'package.json')).version);
  assert.equal(runtime.runner, f.prepared.runtime.runner);
  assert.equal(runtime.instructions, f.prepared.runtime.instructions);
  assert.ok(!runtime.root.startsWith(f.out + path.sep));
  assert.deepEqual(Object.keys(json(path.join(runtime.root, 'runtime.json')).files).sort(), RUNTIME_FILES);
  for (const file of RUNTIME_FILES) assert.deepEqual(fs.readFileSync(path.join(runtime.root, file)), fs.readFileSync(path.join(f.source, file)));
  assert.equal(fs.existsSync(path.join(runtime.root, 'brief.md')), false);
  assert.equal(fs.existsSync(path.join(runtime.root, 'run.json')), false);
  const again = pinRuntime(f.source, packageRuntimeIdentity(f.source));
  assert.equal(again.root, runtime.root);
  assert.equal(fs.readdirSync(f.home).length, 1);
});

test('installed update routes read and mutation commands through the original runtime', () => {
  const f = prepareFixture('updated');
  const originalVersion = f.prepared.runtime.version;
  const packageFile = path.join(f.source, 'package.json');
  write(packageFile, { ...json(packageFile), version: '99.0.0' });
  const status = cli(f, ['status', '--run', f.out]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).runtime.version, originalVersion);
  assert.throws(() => assertMatchingRuntime(f.out, packageRuntimeIdentity(f.source)), /different C2C runtime/);
  const extension = cli(f, ['extend', '--run', f.out, '--max-attempts', '5', '--reason', 'Synthetic authorized extension']);
  assert.equal(extension.status, 0, extension.stderr);
  const saved = readRunState(f.out);
  assert.equal(saved.runtime.version, originalVersion);
  assert.equal(saved.max_attempts, 5);
  assert.deepEqual(saved.attempts, []);
  assert.equal(saved.limit_history.length, 1);
  const direct = cli(f, ['progress', '--run', f.out], f.prepared.runtime.runner);
  assert.equal(direct.status, 0, direct.stderr);
  assert.equal(JSON.parse(direct.stdout).run, f.out);
});

test('a reviewed plan continues through verification and finish after installation changes without replay', async () => {
  const f = prepareFixture('active-review', ['--mode', 'review', '--peer-model', 'claude-opus-4-6']);
  const retained = await import(pathToFileURL(f.prepared.runtime.runner));
  const report = (summary, findings = []) => ({ summary, verdict: findings.length ? 'needs_changes' : 'ready',
    proposal_markdown: 'Proposed fixture plan with escaping and an acceptance check.', findings, assumptions: [], open_questions: [], limitations: ['Synthetic transport; no real provider called.'], evidence_requests: [] });
  const finding = { id: 'P-R1', severity: 'major', claim: 'Export must escape quoted input.', evidence: 'The supplied fixture explicitly requires field round-tripping.', action: 'Add a quoted-field acceptance check.', verification: 'Proposed test: quotes round-trip without splitting fields.' };
  const invoke = response => async () => ({ code: 0, stderr: '', stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: response, model: 'claude-opus-4-6', session_id: 'synthetic-runtime-review' }) });
  write(path.join(f.out, 'coordinator-draft.json'), report('Coordinator proposal'));
  write(path.join(f.out, 'coordinator-review.json'), report('Coordinator review'));
  await assert.rejects(() => retained.ask({ run: f.out, stage: 'review' }, async () => ({ code: 1, stderr: 'Synthetic transport failure.', stdout: '' })));
  await retained.ask({ run: f.out, stage: 'review' }, invoke(report('Critic identifies one concrete missing test.', [finding])));
  const before = readRunState(f.out), reviewBytes = fs.readFileSync(path.join(f.out, 'peer-review.json'));
  assert.equal(before.attempts.length, 2);
  assert.equal(before.attempts[0].status, 'failed');
  assert.equal(before.attempts[1].status, 'succeeded');
  assert.equal(before.stages.review.status, 'succeeded');
  const installedPackage = path.join(f.source, 'package.json');
  write(installedPackage, { ...json(installedPackage), version: '99.0.0' });
  const resumed = cli(f, ['status', '--run', f.out]);
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(JSON.parse(resumed.stdout).successful_peer_calls, 1);
  const synced = cli(f, ['decisions', '--run', f.out]);
  assert.equal(synced.status, 0, synced.stderr);
  write(path.join(f.out, 'decisions.json'), [{ finding_id: 'P-R1', disposition: 'accepted', rationale: 'Final plan requires a quoted-field round-trip test before implementation acceptance.' }]);
  write(path.join(f.out, 'security-review.json'), report('Security proposal: sanitize exported cells and enforce input bounds; implementation tests remain proposed.'));
  write(path.join(f.out, 'final-plan.md'), '# Plan\nImplement bounded field escaping. Proposed acceptance: quoted fields round-trip. Start by inspecting the fixture exporter.\n');
  await retained.ask({ run: f.out, stage: 'verify' }, invoke(report('Verification confirms the missing test is now specified; execution remains untested.')));
  await assert.rejects(() => retained.ask({ run: f.out, stage: 'review' }, invoke(report('Must never run'))), /already succeeded/);
  const finished = cli(f, ['finish', '--run', f.out]);
  assert.equal(finished.status, 0, finished.stderr);
  const result = JSON.parse(finished.stdout), after = readRunState(f.out);
  assert.equal(result.delivered_plan_reviewed, true);
  assert.equal(result.successful_peer_calls, 2);
  assert.equal(after.status, 'complete');
  assert.equal(after.attempts.length, 3);
  assert.deepEqual(after.attempts.slice(0, 2), before.attempts);
  assert.ok(after.elapsed_ms >= before.elapsed_ms);
  assert.deepEqual(after.runtime, before.runtime);
  assert.deepEqual(after.stages.review, before.stages.review);
  assert.deepEqual(fs.readFileSync(path.join(f.out, 'peer-review.json')), reviewBytes);
  assert.equal(after.seals['peer-review.json'], before.seals['peer-review.json']);
  assert.deepEqual(after.attempts.flatMap(attempt => attempt.reported_models), ['claude-opus-4-6', 'claude-opus-4-6']);
});

test('missing or changed cached runtime fails closed without current-version substitution', () => {
  const f = prepareFixture('changed');
  const runtime = inspectRunRuntime(f.out);
  const file = path.join(runtime.root, 'references/protocol.md');
  const original = fs.readFileSync(file);
  fs.appendFileSync(file, '\nChanged after preparation.\n');
  assert.throws(() => inspectRunRuntime(f.out), /runtime changed/);
  let result = cli(f, ['progress', '--run', f.out]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /runtime changed/);
  fs.writeFileSync(file, original);
  fs.renameSync(runtime.root, path.join(f.dir, 'saved-runtime'));
  result = cli(f, ['progress', '--run', f.out]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing from this user's trusted store/);
  assert.deepEqual(fs.readdirSync(f.home), []);
});

test('run-local code and forged runtime paths cannot become trusted dispatch targets', () => {
  const f = prepareFixture('forged');
  const marker = path.join(f.dir, 'executed');
  const evil = path.join(f.out, 'evil.mjs');
  write(evil, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'unsafe');`);
  const state = readRunState(f.out), snapshotFile = path.join(f.out, 'snapshot.json'), snapshot = json(snapshotFile);
  state.runtime = { ...state.runtime, runner: evil };
  snapshot.runtime = state.runtime;
  write(snapshotFile, snapshot);
  state.seals['snapshot.json'] = digest(fs.readFileSync(snapshotFile));
  writeRunState(f.out, state);
  const result = cli(f, ['status', '--run', f.out]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid pinned C2C runtime identity/);
  assert.equal(fs.existsSync(marker), false);
});

test('trusted runtime rejects directory links and unexpected files', () => {
  const f = prepareFixture('links');
  const runtime = inspectRunRuntime(f.out);
  write(path.join(runtime.root, 'unrecorded.mjs'), 'throw new Error("unexpected")');
  assert.throws(() => inspectRunRuntime(f.out), /Unexpected pinned runtime entry/);
  fs.unlinkSync(path.join(runtime.root, 'unrecorded.mjs'));
  const actual = path.join(f.dir, 'moved-runtime');
  fs.renameSync(runtime.root, actual);
  fs.symlinkSync(actual, runtime.root, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => inspectRunRuntime(f.out), /Linked or non-directory runtime path/);
});

test('legacy run inspection remains available but new runner refuses legacy mutation', () => {
  const f = prepareFixture('legacy');
  const state = readRunState(f.out), snapshotFile = path.join(f.out, 'snapshot.json'), snapshot = json(snapshotFile);
  delete state.runtime; delete snapshot.runtime;
  state.attempts.push({ number: 1, stage: 'draft', status: 'failed', elapsed_ms: 25,
    usage: { input_tokens: 100, output_tokens: 10, private: 'PRIVATE_LEGACY_USAGE' } });
  state.elapsed_ms = 25;
  write(snapshotFile, snapshot);
  state.seals['snapshot.json'] = digest(fs.readFileSync(snapshotFile));
  writeRunState(f.out, state);
  assert.equal(inspectRunRuntime(f.out, { allowLegacy: true }).pinned, false);
  assert.throws(() => inspectRunRuntime(f.out), /Legacy run has no pinned/);
  assert.equal(cli(f, ['status', '--run', f.out]).status, 0);
  assert.equal(cli(f, ['progress', '--run', f.out]).status, 0);
  const before = Object.fromEntries(fs.readdirSync(f.out).map(name => [name, fs.readFileSync(path.join(f.out, name))]));
  const usageResult = cli(f, ['usage', '--run', f.out, '--compact']);
  assert.equal(usageResult.status, 0, usageResult.stderr);
  const usage = JSON.parse(usageResult.stdout);
  assert.equal(usage.attempts.failed, 1);
  assert.equal(usage.counters.total_tokens.observed_sum, null);
  assert.equal(usage.counters.total_tokens.unknown_attempts, 1);
  assert.equal(usage.observations[0].usage.status, 'missing');
  assert.doesNotMatch(usageResult.stdout, /PRIVATE_LEGACY_USAGE/);
  assert.deepEqual(Object.fromEntries(fs.readdirSync(f.out).map(name => [name, fs.readFileSync(path.join(f.out, name))])), before);
  const result = cli(f, ['extend', '--run', f.out, '--max-attempts', '5', '--reason', 'Do not migrate']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /finish it with its original installation/);
  assert.equal(readRunState(f.out).max_attempts, 4);
});

test('preparation rejects changed loaded package identity and cache inside installation', () => {
  const f = fixture('race');
  const loaded = packageRuntimeIdentity(f.source);
  fs.appendFileSync(path.join(f.source, 'SKILL.md'), '\nNew instructions.\n');
  assert.throws(() => pinRuntime(f.source, loaded), /changed after this process started/);
  assert.equal(fs.existsSync(f.home), false);
  process.env.C2C_RUNTIME_HOME = path.join(f.source, 'runtime-store');
  assert.throws(() => pinRuntime(f.source, packageRuntimeIdentity(f.source)), /must be outside the installation/);
});

test('runtime store permission failures are actionable and never relocate or create a run', t => {
  for (const code of ['EACCES', 'EPERM', 'EROFS']) {
    const f = fixture(`access-${code}`), loaded = packageRuntimeIdentity(f.source);
    const denied = Object.assign(new Error(`${code}: synthetic trusted-store denial`), { code });
    const original = fs.mkdirSync;
    const mkdir = t.mock.method(fs, 'mkdirSync', function (file, ...args) {
      if (file === f.home) throw denied;
      return original.call(this, file, ...args);
    });
    try {
      assert.throws(() => pinRuntime(f.source, loaded), error => {
        assert.equal(error.code, code);
        assert.equal(error.cause, denied);
        assert.equal(error.reason, 'runtime_access_denied');
        assert.match(error.message, /Request the required filesystem access from the host/);
        assert.match(error.message, /C2C_RUNTIME_HOME.*private, persistent, user-owned/);
        assert.match(error.message, /do not reset attempts or substitute current code/);
        return true;
      });
    } finally { mkdir.mock.restore(); }
    assert.equal(fs.existsSync(f.home), false);
    assert.equal(fs.existsSync(f.out), false);
    assert.deepEqual(fs.readdirSync(f.dir).sort(), ['package', 'project']);
  }
});

test('inaccessible pinned runtime preserves the original plan and failure provenance', t => {
  const f = prepareFixture('read-denied'), runtime = inspectRunRuntime(f.out);
  const stateBefore = fs.readFileSync(path.join(f.out, 'run.json'));
  const denied = Object.assign(new Error('EPERM: synthetic pinned runtime denial'), { code: 'EPERM' });
  const original = fs.readFileSync;
  const read = t.mock.method(fs, 'readFileSync', function (file, ...args) {
    if (file === path.join(runtime.root, 'runtime.json')) throw denied;
    return original.call(this, file, ...args);
  });
  try {
    assert.throws(() => inspectRunRuntime(f.out), error => {
      assert.equal(error.cause, denied);
      assert.equal(error.reason, 'runtime_access_denied');
      assert.match(error.message, /Cannot read the pinned C2C runtime/);
      assert.match(error.message, /For an existing run, preserve its original trusted runtime and plan/);
      return true;
    });
  } finally { read.mock.restore(); }
  assert.deepEqual(fs.readFileSync(path.join(f.out, 'run.json')), stateBefore);
  assert.equal(inspectRunRuntime(f.out).digest, runtime.digest);
});

test('unrelated runtime store errors retain their original classification', t => {
  const f = fixture('unexpected-error'), loaded = packageRuntimeIdentity(f.source);
  const original = fs.mkdirSync, failure = Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
  const mkdir = t.mock.method(fs, 'mkdirSync', function (file, ...args) {
    if (file === f.home) throw failure;
    return original.call(this, file, ...args);
  });
  try { assert.throws(() => pinRuntime(f.source, loaded), error => error === failure); }
  finally { mkdir.mock.restore(); }
});

test('invalid nested output locations never create files inside installation or cache', () => {
  const f = fixture('output-boundary');
  for (const destination of [path.join(f.source, 'new-folder', 'run'), path.join(f.home, 'new-folder', 'run'), f.dir]) {
    assert.throws(() => validateRunOutput(destination, f.source), /outside the C2C installation and trusted runtime store/);
  }
  assert.equal(fs.existsSync(path.join(f.source, 'new-folder')), false);
  assert.equal(fs.existsSync(f.home), false);
});

test('sealed runtime identity changes and unregistered digests fail closed', () => {
  const f = prepareFixture('identity');
  const state = readRunState(f.out), snapshotFile = path.join(f.out, 'snapshot.json'), snapshot = json(snapshotFile);
  state.runtime = { ...state.runtime, digest: 'a'.repeat(64) };
  writeRunState(f.out, state);
  assert.throws(() => inspectRunRuntime(f.out), /identity changed after preparation/);
  snapshot.runtime = state.runtime;
  write(snapshotFile, snapshot);
  assert.throws(() => inspectRunRuntime(f.out), /Sealed artifact changed/);
  state.seals['snapshot.json'] = digest(fs.readFileSync(snapshotFile));
  writeRunState(f.out, state);
  assert.throws(() => inspectRunRuntime(f.out), /missing from this user's trusted store/);
});

test('POSIX cached runtime files reject unsafe write permissions', { skip: process.platform === 'win32' }, () => {
  const f = prepareFixture('permissions');
  const runtime = inspectRunRuntime(f.out), file = path.join(runtime.root, 'SKILL.md');
  fs.chmodSync(file, 0o666);
  assert.throws(() => inspectRunRuntime(f.out), /not writable by others/);
});
