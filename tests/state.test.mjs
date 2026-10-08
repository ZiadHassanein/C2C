import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { atomicWriteFile, readRunState, writeRunState, acquireRunLock, recoverRunLock, inspectProcess } from '../scripts/state.mjs';

const parent = fs.realpathSync(os.tmpdir());
const root = fs.mkdtempSync(path.join(parent, 'council-state-test-'));
after(() => {
  const actual = fs.realpathSync(root);
  assert.equal(path.dirname(actual), parent);
  assert.ok(path.basename(actual).startsWith('council-state-test-'));
  fs.rmSync(actual, { recursive: true, force: true });
});
const fixture = label => fs.mkdtempSync(path.join(root, `${label}-`));
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const read = dir => readRunState(dir, { onRecovery() {} });
const state = () => ({ version: 3, id: crypto.randomUUID(), elapsed_ms: 0, attempts: [], stages: {}, seals: {}, status: 'prepared' });
const reserve = manifest => {
  manifest.attempts.push({ number: 1, stage: 'review', status: 'running', timeout_ms: 10000 });
  manifest.seals['attempt-1-review-input.txt'] = 'f'.repeat(64);
  manifest.status = 'running';
};

test('atomic file publication preserves complete data and leaves no temporary files', () => {
  const dir = fixture('atomic');
  const file = path.join(dir, 'artifact.json');
  atomicWriteFile(file, { first: true });
  atomicWriteFile(file, { second: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { second: true });
  assert.deepEqual(fs.readdirSync(dir), ['artifact.json']);
});

test('durable manifests recover a reserved attempt and its seals after zero-filled run.json', () => {
  const dir = fixture('zeroed');
  const manifest = state();
  writeRunState(dir, manifest);
  reserve(manifest);
  writeRunState(dir, manifest);
  fs.writeFileSync(path.join(dir, 'run.json'), Buffer.alloc(100));
  const warnings = [];
  const recovered = readRunState(dir, { onRecovery: message => warnings.push(message) });
  assert.equal(recovered.attempts.length, 1);
  assert.equal(recovered.attempts[0].status, 'running');
  assert.equal(recovered.seals['attempt-1-review-input.txt'], 'f'.repeat(64));
  assert.equal(recovered._storage.revision, 2);
  assert.match(warnings[0], /attempt reservations and sealed evidence are preserved/);
  recovered.attempts[0].status = 'interrupted';
  recovered.elapsed_ms += recovered.attempts[0].timeout_ms;
  writeRunState(dir, recovered);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'run.json')), fs.readFileSync(path.join(dir, 'run.checkpoint.json')));
  assert.equal(read(dir).elapsed_ms, 10000);
  assert.equal(read(dir).attempts.length, 1);
});

test('a valid older manifest never overrides a newer checkpointed reservation', () => {
  const dir = fixture('write-ahead');
  const manifest = state();
  writeRunState(dir, manifest);
  const olderManifest = fs.readFileSync(path.join(dir, 'run.json'));
  reserve(manifest);
  writeRunState(dir, manifest);
  fs.writeFileSync(path.join(dir, 'run.json'), olderManifest);
  assert.equal(read(dir).attempts.length, 1);
  assert.equal(read(dir)._storage.revision, 2);
});

test('completed stages survive manifest loss and cannot become retryable on recovery', () => {
  const dir = fixture('success');
  const manifest = state();
  reserve(manifest);
  manifest.attempts[0].status = 'succeeded';
  manifest.stages.review = { status: 'succeeded', file: 'peer-review.json', attempt: 1 };
  manifest.seals['peer-review.json'] = 'e'.repeat(64);
  writeRunState(dir, manifest);
  fs.unlinkSync(path.join(dir, 'run.json'));
  assert.deepEqual(read(dir).stages, manifest.stages);
  assert.deepEqual(read(dir).seals, manifest.seals);
});

test('one damaged copy uses the other complete revision without a silent budget reset', () => {
  for (const corruptFile of ['run.json', 'run.checkpoint.json']) {
    const dir = fixture('one-copy');
    const manifest = state();
    reserve(manifest); manifest.elapsed_ms = 7200;
    writeRunState(dir, manifest);
    fs.writeFileSync(path.join(dir, corruptFile), '');
    assert.equal(read(dir).attempts.length, 1);
    assert.equal(read(dir).elapsed_ms, 7200);
  }
});

test('valid JSON with damaged content is rejected by checksum and recovered from intact copy', () => {
  const dir = fixture('checksum');
  const manifest = state();
  reserve(manifest); writeRunState(dir, manifest);
  const damaged = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'));
  damaged.attempts = [];
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(damaged));
  assert.equal(read(dir).attempts.length, 1);
  assert.equal(read(dir)._storage.revision, 1);
});

test('two damaged copies fail closed and preserve all forensic files', () => {
  const dir = fixture('both-damaged');
  writeRunState(dir, state());
  for (const file of ['run.json', 'run.checkpoint.json']) fs.writeFileSync(path.join(dir, file), '');
  assert.throws(() => read(dir), /no complete checkpoint.*Preserve this run; do not reset its attempts/);
  for (const file of ['run.json', 'run.checkpoint.json']) assert.equal(fs.statSync(path.join(dir, file)).size, 0);
});

test('same-revision divergent states or foreign-run checkpoints are ambiguous and never resumed', () => {
  const dir = fixture('divergent');
  const manifest = state();
  writeRunState(dir, manifest);
  const original = fs.readFileSync(path.join(dir, 'run.json'));
  // Independently valid copies at the same revision cannot be ordered safely.
  const other = { ...manifest, attempts: [{ number: 1, status: 'running' }] };
  delete other._storage;
  writeRunState(dir, other);
  fs.writeFileSync(path.join(dir, 'run.json'), original);
  assert.throws(() => read(dir), /same revision.*ambiguous/);
  other.id = crypto.randomUUID();
  writeRunState(dir, other);
  fs.writeFileSync(path.join(dir, 'run.json'), original);
  assert.throws(() => read(dir), /different runs/);
});

test('legacy runs remain readable and gain current redundant storage on the next write', () => {
  const dir = fixture('legacy');
  const legacy = state(); legacy.version = 1;
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(legacy));
  assert.deepEqual(read(dir), legacy);
  const loaded = read(dir); reserve(loaded); writeRunState(dir, loaded);
  assert.equal(read(dir)._storage.revision, 1);
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(legacy));
  assert.throws(() => read(dir), /Legacy manifest conflicts with a checkpoint/);
});

test('corrupt legacy runs with no checkpoint fail clearly without inventing recovery state', () => {
  const dir = fixture('legacy-damaged');
  fs.writeFileSync(path.join(dir, 'run.json'), Buffer.alloc(20));
  assert.throws(() => read(dir), /no complete checkpoint is available/);
  assert.deepEqual(fs.readdirSync(dir), ['run.json']);
});

const syntheticIdentity = pid => ({ status: 'alive', identity: `start-${pid}` });

test('lock publication permission failures preserve existing ownership and recorded allowance', t => {
  for (const code of ['EACCES', 'EPERM', 'EROFS']) {
    for (const existingOwner of [false, true]) {
      const dir = fixture(`lock-${code}-${existingOwner}`), file = path.join(dir, '.lock');
      const manifest = state(); reserve(manifest); manifest.elapsed_ms = 7200;
      manifest.max_attempts = 4; manifest.limit_history = [{ reason: 'Prior authorized extension', max_attempts: 4 }];
      writeRunState(dir, manifest);
      const before = fs.readFileSync(path.join(dir, 'run.json'));
      const ownerBytes = Buffer.from(JSON.stringify({ version: 1, pid: process.pid, identity: `start-${process.pid}`, token: 'existing-owner' }));
      if (existingOwner) fs.writeFileSync(file, ownerBytes);
      const denied = Object.assign(new Error(`${code}: synthetic link denial`), { code });
      const original = fs.linkSync;
      const link = t.mock.method(fs, 'linkSync', function (from, to) {
        if (to === file) throw denied;
        return original.call(this, from, to);
      });
      try {
        assert.throws(() => acquireRunLock(dir, { inspect: syntheticIdentity }), error => {
          assert.equal(error.code, code);
          assert.equal(error.cause, denied);
          assert.equal(error.reason, 'run_lock_access_denied');
          assert.match(error.message, /Cannot acquire the C2C run lock/);
          assert.match(error.message, /do not delete locks or reset attempts/);
          assert.match(error.message, /retry the unchanged command through the approved execution path/);
          return true;
        });
      } finally { link.mock.restore(); }
      assert.deepEqual(fs.readFileSync(path.join(dir, 'run.json')), before);
      assert.deepEqual(fs.readFileSync(path.join(dir, 'run.checkpoint.json')), before);
      if (existingOwner) assert.deepEqual(fs.readFileSync(file), ownerBytes);
      else assert.equal(fs.existsSync(file), false);
      assert.equal(fs.readdirSync(dir).some(name => name.endsWith('.tmp')), false);
    }
  }
});

test('recovery gate or archival permission failure preserves lock bytes and prior attempts', t => {
  for (const boundary of ['gate', 'archive']) {
    const dir = fixture(`recovery-access-${boundary}`), file = path.join(dir, '.lock');
    const manifest = state(); reserve(manifest); manifest.elapsed_ms = 7200;
    writeRunState(dir, manifest);
    const before = fs.readFileSync(path.join(dir, 'run.json'));
    const ownerBytes = Buffer.from('incomplete legacy owner record');
    fs.writeFileSync(file, ownerBytes);
    const denied = Object.assign(new Error('EPERM: synthetic recovery denial'), { code: 'EPERM' });
    const original = fs.linkSync;
    const link = t.mock.method(fs, 'linkSync', function (from, to) {
      if (boundary === 'gate' && to === path.join(dir, '.lock.reclaim') || boundary === 'archive' && from === file) throw denied;
      return original.call(this, from, to);
    });
    try {
      assert.throws(() => recoverRunLock(dir, { expectedHash: digest(ownerBytes), confirmedStopped: true, inspect: syntheticIdentity }), error => {
        assert.equal(error.code, 'EPERM');
        assert.equal(error.cause, denied);
        assert.equal(error.reason, 'run_lock_access_denied');
        assert.match(error.message, /Cannot recover the C2C run lock/);
        return true;
      });
    } finally { link.mock.restore(); }
    assert.deepEqual(fs.readFileSync(file), ownerBytes);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'run.json')), before);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'run.checkpoint.json')), before);
    assert.equal(fs.existsSync(path.join(dir, '.lock.reclaim')), false);
    assert.equal(fs.readdirSync(dir).some(name => name.endsWith('.tmp') || name.startsWith('.lock.recovered-')), false);
  }
});

test('release permission failure retains the owner token and permits an unchanged later release', t => {
  const dir = fixture('release-access'), file = path.join(dir, '.lock');
  const release = acquireRunLock(dir, { inspect: syntheticIdentity });
  const manifest = state(); reserve(manifest);
  manifest.attempts[0].status = 'succeeded'; manifest.elapsed_ms = 7200;
  manifest.stages.review = { status: 'succeeded', file: 'peer-review.json', attempt: 1 };
  manifest.status = 'awaiting_coordinator';
  writeRunState(dir, manifest);
  const savedResult = fs.readFileSync(path.join(dir, 'run.json'));
  const ownerBytes = fs.readFileSync(file);
  const denied = Object.assign(new Error('EACCES: synthetic release denial'), { code: 'EACCES' });
  const original = fs.unlinkSync;
  const unlink = t.mock.method(fs, 'unlinkSync', function (target) {
    if (target === file) throw denied;
    return original.call(this, target);
  });
  try {
    assert.throws(release, error => {
      assert.equal(error.code, 'EACCES');
      assert.equal(error.cause, denied);
      assert.match(error.message, /Cannot release the C2C run lock/);
      assert.match(error.message, /worker result may already be saved/);
      assert.match(error.message, /Inspect run status and the recorded lock owner/);
      assert.match(error.message, /do not repeat a completed worker stage/);
      assert.doesNotMatch(error.message, /retry the unchanged command/);
      return true;
    });
  } finally { unlink.mock.restore(); }
  assert.deepEqual(fs.readFileSync(file), ownerBytes);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'run.json')), savedResult);
  release();
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'run.json')), savedResult);
});

test('nonpermission lock publication failures retain their original classification', t => {
  const dir = fixture('lock-unrelated'), file = path.join(dir, '.lock');
  const failure = Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
  const original = fs.linkSync;
  const link = t.mock.method(fs, 'linkSync', function (from, to) {
    if (to === file) throw failure;
    return original.call(this, from, to);
  });
  try { assert.throws(() => acquireRunLock(dir, { inspect: syntheticIdentity }), error => error === failure); }
  finally { link.mock.restore(); }
  assert.equal(fs.existsSync(file), false);
});

test('exclusive lock contains a complete process identity and never replaces a live owner', () => {
  const dir = fixture('lock-live');
  const release = acquireRunLock(dir, { inspect: syntheticIdentity });
  const record = JSON.parse(fs.readFileSync(path.join(dir, '.lock'), 'utf8'));
  assert.equal(record.pid, process.pid);
  assert.equal(record.identity, `start-${process.pid}`);
  assert.ok(record.token);
  assert.throws(() => acquireRunLock(dir, { inspect: syntheticIdentity }), /Another process is using this run/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.lock'), 'utf8')), record);
  release(); release();
  assert.ok(!fs.existsSync(path.join(dir, '.lock')));
});

test('reused PID is distinguished by process start identity and cannot block forever', () => {
  const dir = fixture('reused-pid');
  atomicWriteFile(path.join(dir, '.lock'), { pid: process.pid, identity: 'old-process-incarnation', token: 'old', at: '2000-01-01T00:00:00Z' });
  const release = acquireRunLock(dir, { inspect: syntheticIdentity });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.lock'), 'utf8')).identity, `start-${process.pid}`);
  assert.ok(!fs.existsSync(path.join(dir, '.lock.reclaim')));
  release();
});

test('age alone never makes a matching live process safe to reclaim', () => {
  const dir = fixture('old-live');
  atomicWriteFile(path.join(dir, '.lock'), { pid: process.pid, identity: `start-${process.pid}`, token: 'still-live', at: '1900-01-01T00:00:00Z' });
  assert.throws(() => acquireRunLock(dir, { inspect: syntheticIdentity }), /Another process is using this run/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.lock'), 'utf8')).token, 'still-live');
});

test('a provably dead owner is reclaimed, while unknown process ownership fails closed', () => {
  const dir = fixture('dead-owner');
  atomicWriteFile(path.join(dir, '.lock'), { pid: 987654, identity: 'dead', token: 'old' });
  const inspect = pid => pid === process.pid ? syntheticIdentity(pid) : { status: 'dead', identity: null };
  const release = acquireRunLock(dir, { inspect });
  release();
  atomicWriteFile(path.join(dir, '.lock'), { pid: 987654, identity: 'unknown', token: 'old' });
  assert.throws(() => acquireRunLock(dir, { inspect: pid => pid === process.pid ? syntheticIdentity(pid) : { status: 'unknown', identity: null } }), /ownership is ambiguous/);
});

test('zero-byte legacy lock has an actionable bounded recovery that preserves its exact bytes and budget', () => {
  const dir = fixture('empty-lock');
  const manifest = state(); reserve(manifest); writeRunState(dir, manifest);
  fs.writeFileSync(path.join(dir, '.lock'), '');
  assert.throws(() => acquireRunLock(dir, { inspect: syntheticIdentity }), /recover-lock.*expected-sha256.*confirm-owner-stopped/);
  const expectedHash = digest('');
  assert.throws(() => recoverRunLock(dir, { expectedHash, inspect: syntheticIdentity }), /confirm-owner-stopped/);
  const result = recoverRunLock(dir, { expectedHash, confirmedStopped: true, inspect: syntheticIdentity });
  assert.equal(result.attempts_reset, false);
  assert.equal(fs.statSync(path.join(dir, result.archived)).size, 0);
  assert.equal(read(dir).attempts.length, 1);
  assert.ok(!fs.existsSync(path.join(dir, '.lock')));
  const release = acquireRunLock(dir, { inspect: syntheticIdentity }); release();
});

test('explicit recovery rejects changed lock content and a matching live process identity', () => {
  const dir = fixture('recover-race');
  fs.writeFileSync(path.join(dir, '.lock'), '');
  assert.throws(() => recoverRunLock(dir, { expectedHash: 'a'.repeat(64), confirmedStopped: true, inspect: syntheticIdentity }), /lock changed/);
  assert.equal(fs.statSync(path.join(dir, '.lock')).size, 0);
  fs.unlinkSync(path.join(dir, '.lock'));
  const release = acquireRunLock(dir, { inspect: syntheticIdentity });
  const bytes = fs.readFileSync(path.join(dir, '.lock'));
  assert.throws(() => recoverRunLock(dir, { expectedHash: digest(bytes), confirmedStopped: true, inspect: syntheticIdentity }), /owner process is still alive/);
  assert.deepEqual(fs.readFileSync(path.join(dir, '.lock')), bytes);
  release();
});

test('live modern owners with unreadable start identity remain protected during explicit recovery', () => {
  const dir = fixture('unreadable-identity');
  atomicWriteFile(path.join(dir, '.lock'), { version: 1, pid: process.pid, identity: null, token: 'live' });
  const bytes = fs.readFileSync(path.join(dir, '.lock'));
  const inspect = () => ({ status: 'alive', identity: null });
  assert.throws(() => acquireRunLock(dir, { inspect }), /Another process is using this run/);
  assert.throws(() => recoverRunLock(dir, { expectedHash: digest(bytes), confirmedStopped: true, inspect }), /lock belongs to a live owner/);
  assert.deepEqual(fs.readFileSync(path.join(dir, '.lock')), bytes);
});

test('legacy PID reuse ambiguity requires explicit inspected-hash recovery', () => {
  const dir = fixture('legacy-pid');
  atomicWriteFile(path.join(dir, '.lock'), { pid: process.pid, at: '2000-01-01T00:00:00Z' });
  const bytes = fs.readFileSync(path.join(dir, '.lock'));
  assert.throws(() => acquireRunLock(dir, { inspect: syntheticIdentity }), /ownership is ambiguous/);
  const recovered = recoverRunLock(dir, { expectedHash: digest(bytes), confirmedStopped: true, inspect: syntheticIdentity });
  assert.deepEqual(fs.readFileSync(path.join(dir, recovered.archived)), bytes);
  assert.ok(!fs.existsSync(path.join(dir, '.lock')));
});

test('localized macOS lock identities require inspected recovery when the PID is still alive', () => {
  const dir = fixture('darwin-legacy-live');
  atomicWriteFile(path.join(dir, '.lock'), { version: 1, pid: process.pid, identity: 'darwin:Wed Oct 7 10:00:00 2026', token: 'localized' });
  const bytes = fs.readFileSync(path.join(dir, '.lock'));
  const inspect = () => ({ status: 'alive', identity: 'darwin-v2:Wed Oct 7 00:00:00 2026' });
  assert.throws(() => acquireRunLock(dir, { inspect }), /ownership is ambiguous.*recover-lock/);
  assert.deepEqual(fs.readFileSync(path.join(dir, '.lock')), bytes, 'Canonicalization must not silently replace a live legacy owner');
  assert.throws(() => recoverRunLock(dir, { expectedHash: digest(bytes), inspect }), /confirm-owner-stopped/);
  const recovered = recoverRunLock(dir, { expectedHash: digest(bytes), confirmedStopped: true, inspect });
  assert.deepEqual(fs.readFileSync(path.join(dir, recovered.archived)), bytes);
  assert.ok(!fs.existsSync(path.join(dir, '.lock')));
});

test('dead localized macOS owners remain reclaimable and canonical live owners remain protected', () => {
  const dir = fixture('darwin-legacy-dead');
  const identity = 'darwin-v2:Wed Oct 7 00:00:00 2026';
  const deadPid = 987654;
  const inspect = pid => pid === deadPid ? { status: 'dead', identity: null } : { status: 'alive', identity };
  atomicWriteFile(path.join(dir, '.lock'), { version: 1, pid: deadPid, identity: 'darwin:Wed Oct 7 10:00:00 2026', token: 'dead' });
  const release = acquireRunLock(dir, { inspect });
  try {
    const bytes = fs.readFileSync(path.join(dir, '.lock'));
    assert.equal(JSON.parse(bytes).identity, identity);
    assert.throws(() => acquireRunLock(dir, { inspect }), /Another process is using this run/);
    assert.throws(() => recoverRunLock(dir, { expectedHash: digest(bytes), confirmedStopped: true, inspect }), /owner process is still alive/);
    assert.deepEqual(fs.readFileSync(path.join(dir, '.lock')), bytes);
  } finally { release(); }
});

test('an old release callback cannot remove a new owner token', () => {
  const dir = fixture('owner-token');
  const release = acquireRunLock(dir, { inspect: syntheticIdentity });
  atomicWriteFile(path.join(dir, '.lock'), { pid: process.pid, identity: `start-${process.pid}`, token: 'replacement' });
  release();
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.lock'), 'utf8')).token, 'replacement');
});

test('a crashed recovery marker blocks ordinary acquisition instead of silently stealing work', () => {
  const dir = fixture('reclaim-crash');
  fs.writeFileSync(path.join(dir, '.lock.reclaim'), '');
  assert.throws(() => acquireRunLock(dir, { inspect: syntheticIdentity }), /Lock recovery is in progress/);
  assert.ok(!fs.existsSync(path.join(dir, '.lock')));
});

test('OS process identities distinguish invalid PIDs and observe this process without a shell', () => {
  assert.equal(inspectProcess(0).status, 'unknown');
  assert.equal(inspectProcess(-1).status, 'unknown');
  assert.equal(inspectProcess('1; exit').status, 'unknown');
  const current = inspectProcess(process.pid);
  assert.equal(current.status, 'alive');
  if (['win32', 'linux', 'darwin'].includes(process.platform)) assert.ok(current.identity, 'Current process start identity was unavailable on a supported platform');
});

test('native macOS process identities and live locks are stable across caller locales and timezones', { skip: process.platform !== 'darwin' }, () => {
  const dir = fixture('darwin-environments');
  const expected = inspectProcess(process.pid);
  assert.equal(expected.status, 'alive');
  assert.match(expected.identity, /^darwin-v2:/);
  const release = acquireRunLock(dir);
  const bytes = fs.readFileSync(path.join(dir, '.lock'));
  const moduleURL = new URL('../scripts/state.mjs', import.meta.url).href;
  const source = `import { inspectProcess, acquireRunLock } from ${JSON.stringify(moduleURL)};
    const observed = inspectProcess(Number(process.argv[1]));
    let lockError = null;
    try { const release = acquireRunLock(process.argv[2]); release(); }
    catch (error) { lockError = error.message; }
    process.stdout.write(JSON.stringify({ observed, lockError }));`;
  try {
    for (const settings of [
      { TZ: 'UTC', LC_ALL: 'C', LANG: 'C' },
      { TZ: 'Pacific/Honolulu', LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' },
      { TZ: 'Asia/Tokyo', LC_ALL: 'fr_FR.UTF-8', LANG: 'fr_FR.UTF-8' },
    ]) {
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', source, String(process.pid), dir], {
        env: { ...process.env, ...settings }, encoding: 'utf8', shell: false, timeout: 10000,
      });
      assert.equal(result.status, 0, result.stderr || result.error?.message);
      const observed = JSON.parse(result.stdout);
      assert.deepEqual(observed.observed, expected, JSON.stringify(settings));
      assert.match(observed.lockError, /Another process is using this run/);
      assert.deepEqual(fs.readFileSync(path.join(dir, '.lock')), bytes);
    }
  } finally { release(); }
});

test('simultaneous real subprocesses cannot both hold the same published lock', async () => {
  const dir = fixture('concurrent');
  const moduleURL = new URL('../scripts/state.mjs', import.meta.url).href;
  const childSource = `import {acquireRunLock} from ${JSON.stringify(moduleURL)};
    try {const release=acquireRunLock(process.argv[1]); process.stdout.write('acquired\\n'); setTimeout(()=>{release();},1800);}
    catch(error) {process.stdout.write('blocked\\n');}`;
  const launch = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', childSource, dir], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr || `child exited ${code}`)));
  });
  const outcomes = await Promise.all([launch(), launch(), launch(), launch()]);
  assert.equal(outcomes.filter(outcome => outcome === 'acquired').length, 1, outcomes.join(', '));
  assert.equal(outcomes.filter(outcome => outcome === 'blocked').length, 3, outcomes.join(', '));
  assert.ok(!fs.existsSync(path.join(dir, '.lock')));
});
