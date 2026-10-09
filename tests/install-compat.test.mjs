import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageFiles = ['SKILL.md', 'agents/openai.yaml', 'references/protocol.md', 'references/project-assessment.md', 'references/plan-presentation.md', 'references/model-selection.md', 'scripts/council.mjs', 'scripts/process.mjs', 'scripts/assessment.mjs', 'scripts/adapters.mjs', 'scripts/state.mjs', 'scripts/discussion.mjs', 'scripts/participants.mjs', 'scripts/budget.mjs', 'scripts/progress.mjs', 'scripts/evidence.mjs', 'scripts/usage.mjs', 'scripts/plan-quality.mjs', 'scripts/guidance.mjs', 'scripts/projection.mjs','scripts/review-diff.mjs', 'scripts/preferences.mjs', 'scripts/allowance.mjs', 'scripts/assurance.mjs', 'scripts/result.mjs', 'references/developer-qa.md', 'scripts/install.mjs', 'scripts/install-baselines.json', 'scripts/setup.mjs', 'scripts/runtime.mjs', 'scripts/updates.mjs', 'package.json', 'LICENSE'];
const temporaryParent = await fs.realpath(os.tmpdir());
const testRoot = await fs.mkdtemp(path.join(temporaryParent, 'council-install-compat-'));
after(async () => {
  const resolved = await fs.realpath(testRoot);
  assert.equal(path.dirname(resolved), temporaryParent);
  assert.ok(path.basename(resolved).startsWith('council-install-compat-'));
  await fs.rm(resolved, { recursive: true, force: true });
});

async function fixture(label) {
  const root = await fs.mkdtemp(path.join(testRoot, `${label}-`));
  const source = path.join(root, 'package');
  // Exercise the current package's actual installer from a simulated LF clone.
  for (const file of packageFiles) {
    const output = path.join(source, file);
    await fs.mkdir(path.dirname(output), { recursive: true });
    const contents = await fs.readFile(path.join(packageRoot, file), 'utf8');
    await fs.writeFile(output, contents.replace(/\r\n/g, '\n'));
  }
  const codexHome = path.join(root, 'codex');
  const claudeHome = path.join(root, 'claude');
  return { root, source, codexHome, claudeHome, codexSkill: path.join(codexHome, 'skills', 'C2C'), claudeSkill: path.join(claudeHome, 'skills', 'C2C') };
}
function install(f, args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [path.join(f.source, 'scripts/install.mjs'), ...args], {
    cwd: f.root, env: { ...process.env, CODEX_HOME: f.codexHome, CLAUDE_CONFIG_DIR: f.claudeHome, ...extraEnv },
    shell: false, windowsHide: true, timeout: 10000, encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return result;
}
async function contentsAndTimes(directory) {
  return Promise.all(packageFiles.map(async file => ({
    file, bytes: await fs.readFile(path.join(directory, file)), mtimeMs: (await fs.stat(path.join(directory, file))).mtimeMs,
  })));
}

test('fresh installation through paths with spaces includes package version and every runtime helper', async () => {
  const f = await fixture('package with spaces');
  const result = install(f);
  assert.equal(result.status, 0, result.stderr);
  for (const destination of [f.codexSkill, f.claudeSkill]) {
    for (const file of packageFiles) {
      assert.deepEqual(await fs.readFile(path.join(destination, file)), await fs.readFile(path.join(f.source, file)), `${file} missing or different`);
    }
    const loaded = spawnSync(process.execPath, [path.join(destination, 'scripts', 'council.mjs'), 'help'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    assert.equal(loaded.status, 0, loaded.stderr);
    assert.match(loaded.stdout, /C2C/);
  }
});

test('latest-update guard checks all selected versions under installer locks and leaves explicit source changes available', async () => {
  const f = await fixture('locked-version-check');
  for (const args of [['--no-downgrade'], ['--uninstall', '--no-downgrade']]) {
    const invalid = install(f, args);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /requires --update/);
  }
  assert.equal(install(f).status, 0);
  const manifestPath = path.join(f.source, 'package.json');
  const original = await fs.readFile(manifestPath, 'utf8');
  await fs.writeFile(manifestPath, JSON.stringify({ ...JSON.parse(original), version: '99.1.0' }));
  assert.equal(install(f, ['--update', '--target', 'claude']).status, 0);
  await fs.writeFile(manifestPath, original);
  const before = await Promise.all([f.codexSkill, f.claudeSkill].map(contentsAndTimes));
  const refused = install(f, ['--update', '--no-downgrade']);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Installed C2C 99\.1\.0 is newer/);
  assert.deepEqual(await Promise.all([f.codexSkill, f.claudeSkill].map(contentsAndTimes)), before);
  assert.equal(install(f, ['--update', '--target', 'claude']).status, 0, 'explicit local source update remains available');
});

test('POSIX installation follows linked configuration roots and runs readable scripts through Node', { skip: process.platform === 'win32' }, async () => {
  const f = await fixture('linked configuration with spaces');
  for (const [name, home] of [['codex', f.codexHome], ['claude', f.claudeHome]]) {
    const actual = path.join(f.root, `${name} actual configuration`);
    await fs.mkdir(actual);
    await fs.symlink(path.relative(path.dirname(home), actual), home);
  }
  assert.equal(install(f).status, 0);
  for (const destination of [f.codexSkill, f.claudeSkill]) {
    for (const file of packageFiles) assert.deepEqual(await fs.readFile(path.join(destination, file)), await fs.readFile(path.join(f.source, file)));
    const entry = path.join(destination, 'scripts', 'council.mjs');
    assert.equal((await fs.stat(entry)).mode & 0o111, 0, 'documented Node invocation needs no execute bit on installed scripts');
    const loaded = spawnSync(process.execPath, [entry, 'help'], { encoding: 'utf8', shell: false, timeout: 10000 });
    if (loaded.error) throw loaded.error;
    assert.equal(loaded.status, 0, loaded.stderr);
    assert.match(loaded.stdout, /C2C/);
  }
  const before = await Promise.all([f.codexSkill, f.claudeSkill].map(contentsAndTimes));
  const repeated = install(f);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal((repeated.stdout.match(/Already installed:/g) || []).length, 2);
  assert.deepEqual(await Promise.all([f.codexSkill, f.claudeSkill].map(contentsAndTimes)), before);
});

test('CRLF-only installed differences are accepted without rewriting either skill', async () => {
  const f = await fixture('crlf-installed');
  assert.equal(install(f).status, 0);
  for (const destination of [f.codexSkill, f.claudeSkill]) {
    for (const file of packageFiles) {
      const installed = path.join(destination, file);
      const contents = await fs.readFile(installed, 'utf8');
      await fs.writeFile(installed, contents.replace(/\n/g, '\r\n'));
    }
  }
  const before = await Promise.all([f.codexSkill, f.claudeSkill].map(contentsAndTimes));
  assert.notDeepEqual(before[0][0].bytes, await fs.readFile(path.join(f.source, packageFiles[0])), 'fixture must actually differ in line endings');
  const repeated = install(f);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal((repeated.stdout.match(/Already installed:/g) || []).length, 2);
  assert.deepEqual(await Promise.all([f.codexSkill, f.claudeSkill].map(contentsAndTimes)), before, 'installer rewrote existing bytes or timestamps');
});

test('CRLF source clone also accepts an existing LF installation', async () => {
  const f = await fixture('crlf-source');
  assert.equal(install(f).status, 0);
  const before = await contentsAndTimes(f.codexSkill);
  for (const file of packageFiles) {
    const sourceFile = path.join(f.source, file);
    await fs.writeFile(sourceFile, (await fs.readFile(sourceFile, 'utf8')).replace(/\n/g, '\r\n'));
  }
  const repeated = install(f);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.deepEqual(await contentsAndTimes(f.codexSkill), before);
});

test('line-ending compatibility still rejects real edits before creating another destination', async () => {
  for (const [label, suffix] of [['content', Buffer.from('\nLocal customization.\n')], ['whitespace', Buffer.from(' ')], ['bare-cr', Buffer.from('\r')], ['invalid-byte', Buffer.from([0xff])]]) {
    const f = await fixture(`changed-${label}`);
    assert.equal(install(f, ['--target', 'claude']).status, 0);
    const changedFile = path.join(f.claudeSkill, 'SKILL.md');
    const contents = (await fs.readFile(changedFile, 'utf8')).replace(/\n/g, '\r\n');
    const edited = Buffer.concat([Buffer.from(contents), suffix]);
    await fs.writeFile(changedFile, edited);
    const before = await contentsAndTimes(f.claudeSkill);
    const result = install(f);
    assert.notEqual(result.status, 0, label);
    assert.match(result.stderr, /different installation exists/);
    await assert.rejects(fs.access(f.codexSkill), 'installer wrote the first destination before checking the second');
    assert.deepEqual(await contentsAndTimes(f.claudeSkill), before, `installer modified ${label} content`);
  }
});

const normalizedHash = bytes => crypto.createHash('sha256').update(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1').digest('hex');
const backupId = result => {
  assert.equal(result.status, 0, result.stderr);
  const id = result.stdout.match(/Backup ID: (\d{17}-[a-f0-9]{12})/)?.[1];
  assert.ok(id, result.stdout);
  return id;
};
async function advance(f, version = '99.1.0') {
  const packageFile = path.join(f.source, 'package.json');
  const metadata = JSON.parse(await fs.readFile(packageFile, 'utf8'));
  metadata.version = version;
  await fs.writeFile(packageFile, JSON.stringify(metadata, null, 2) + '\n');
  await fs.appendFile(path.join(f.source, 'SKILL.md'), `\nFixture release ${version}.\n`);
}
async function snapshots(f) {
  return Promise.all([f.codexSkill, f.claudeSkill].map(contentsAndTimes));
}
async function injector(f, code) {
  const script = path.join(f.root, 'installer-fault.cjs');
  await fs.writeFile(script, `const fs=require('node:fs');const path=require('node:path');\n${code}\n`);
  return { NODE_OPTIONS: `--require ${JSON.stringify(script)}` };
}

test('managed update and explicit rollback preserve originals outside discovery and permit redo', async () => {
  const f = await fixture('managed-update');
  assert.equal(install(f).status, 0);
  const original = await snapshots(f);
  await advance(f);
  const withoutUpdate = install(f);
  assert.notEqual(withoutUpdate.status, 0);
  assert.match(withoutUpdate.stderr, /--update/);
  assert.deepEqual(await snapshots(f), original);
  const id = backupId(install(f, ['--update']));
  for (const [home, skill] of [[f.codexHome, f.codexSkill], [f.claudeHome, f.claudeSkill]]) {
    assert.equal(JSON.parse(await fs.readFile(path.join(skill, 'package.json'), 'utf8')).version, '99.1.0');
    const receipt = JSON.parse(await fs.readFile(path.join(skill, '.c2c-install.json'), 'utf8'));
    assert.equal(receipt.version, '99.1.0');
    for (const file of packageFiles) assert.equal(receipt.files[file], normalizedHash(await fs.readFile(path.join(skill, file))));
    assert.deepEqual(await fs.readFile(path.join(home, 'c2c-install-backups', id, 'original', 'SKILL.md')), original[0][0].bytes);
    assert.deepEqual(await fs.readdir(path.join(home, 'skills')), ['C2C']);
  }
  const newBytes = await fs.readFile(path.join(f.codexSkill, 'SKILL.md'));
  const redo = backupId(install(f, ['--rollback', id]));
  for (const [index, skill] of [f.codexSkill, f.claudeSkill].entries()) {
    for (const { file, bytes } of original[index]) assert.deepEqual(await fs.readFile(path.join(skill, file)), bytes);
  }
  backupId(install(f, ['--rollback', redo]));
  assert.deepEqual(await fs.readFile(path.join(f.codexSkill, 'SKILL.md')), newBytes);
});

test('managed receipt protects edits, missing files and untracked entries in every target before update', async () => {
  for (const kind of ['edit', 'missing', 'extra', 'empty-directory', 'receipt']) {
    const f = await fixture(`update-refuses-${kind}`);
    assert.equal(install(f).status, 0);
    await advance(f);
    const untouched = await contentsAndTimes(f.codexSkill);
    const changed = path.join(f.claudeSkill, 'SKILL.md');
    if (kind === 'edit') await fs.appendFile(changed, '\nLocal customization.\n');
    if (kind === 'missing') await fs.unlink(changed);
    if (kind === 'extra') await fs.writeFile(path.join(f.claudeSkill, 'notes.md'), 'Private user notes.');
    if (kind === 'empty-directory') await fs.mkdir(path.join(f.claudeSkill, 'notes'));
    if (kind === 'receipt') await fs.writeFile(path.join(f.claudeSkill, '.c2c-install.json'), '{broken');
    const result = install(f, ['--update']);
    assert.notEqual(result.status, 0, kind);
    assert.match(result.stderr, /different installation exists/);
    assert.deepEqual(await contentsAndTimes(f.codexSkill), untouched, 'first target changed before second was checked');
    if (kind === 'edit') assert.match(await fs.readFile(changed, 'utf8'), /Local customization/);
    if (kind === 'extra') assert.equal(await fs.readFile(path.join(f.claudeSkill, 'notes.md'), 'utf8'), 'Private user notes.');
  }
});

test('update accepts normalized line endings without treating them as a customization', async () => {
  const f = await fixture('update-crlf');
  assert.equal(install(f, ['--target', 'codex']).status, 0);
  for (const file of packageFiles) {
    const dest = path.join(f.codexSkill, file);
    await fs.writeFile(dest, (await fs.readFile(dest, 'utf8')).replace(/\n/g, '\r\n'));
  }
  const before = await contentsAndTimes(f.codexSkill);
  await advance(f);
  const id = backupId(install(f, ['--update', '--target', 'codex']));
  for (const { file, bytes } of before) assert.deepEqual(await fs.readFile(path.join(f.codexHome, 'c2c-install-backups', id, 'original', file)), bytes);
});

test('receipt-less migration uses the full trusted baseline, never the version label alone', async () => {
  const f = await fixture('receiptless-baseline');
  assert.equal(install(f).status, 0);
  // A fixture-specific trusted release replaces the checked-in immutable 0.11.3
  // manifest. The same full-content matcher performs offline release adoption.
  const baseline = JSON.parse(await fs.readFile(path.join(f.codexSkill, '.c2c-install.json'), 'utf8'));
  await fs.writeFile(path.join(f.source, 'scripts/install-baselines.json'), JSON.stringify([baseline]));
  for (const skill of [f.codexSkill, f.claudeSkill]) await fs.unlink(path.join(skill, '.c2c-install.json'));
  await advance(f);
  const original = await fs.readFile(path.join(f.claudeSkill, 'SKILL.md'));
  await fs.appendFile(path.join(f.claudeSkill, 'SKILL.md'), '\nNot a trusted release.\n');
  const failed = install(f, ['--update']);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /trusted release baseline/);
  await fs.writeFile(path.join(f.claudeSkill, 'SKILL.md'), original);
  const id = backupId(install(f, ['--update']));
  backupId(install(f, ['--rollback', id]));
  for (const skill of [f.codexSkill, f.claudeSkill]) await assert.rejects(fs.access(path.join(skill, '.c2c-install.json')));
});

test('unknown receipt-less releases cannot be adopted just by matching a version', async () => {
  const f = await fixture('unknown-unmanaged');
  assert.equal(install(f, ['--target', 'codex']).status, 0);
  await fs.unlink(path.join(f.codexSkill, '.c2c-install.json'));
  await fs.writeFile(path.join(f.source, 'scripts/install-baselines.json'), '[]');
  await advance(f);
  const result = install(f, ['--update', '--target', 'codex']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /trusted release baseline/);
});

test('rollback refuses modified current files or a damaged backup before changing either target', async () => {
  const f = await fixture('rollback-protection');
  assert.equal(install(f).status, 0);
  await advance(f);
  const id = backupId(install(f, ['--update']));
  const before = await contentsAndTimes(f.codexSkill);
  const changed = path.join(f.claudeSkill, 'SKILL.md');
  const original = await fs.readFile(changed);
  await fs.appendFile(changed, '\nPrivate changes.');
  const modified = install(f, ['--rollback', id]);
  assert.notEqual(modified.status, 0);
  assert.match(modified.stderr, /different installation exists/);
  assert.deepEqual(await contentsAndTimes(f.codexSkill), before);
  await fs.writeFile(changed, original);
  await fs.appendFile(path.join(f.claudeHome, 'c2c-install-backups', id, 'original', 'SKILL.md'), 'Corrupted backup.');
  const corrupt = install(f, ['--rollback', id]);
  assert.notEqual(corrupt.status, 0);
  assert.match(corrupt.stderr, /backup changed/);
  assert.deepEqual(await contentsAndTimes(f.codexSkill), before);
});

test('ordinary failure after the first host swap restores both installations', async () => {
  const f = await fixture('failed-second-swap');
  assert.equal(install(f).status, 0);
  const original = await snapshots(f);
  await advance(f);
  const injected = await injector(f, `
    const rename=fs.renameSync;let failed=false;
    fs.renameSync=function(from,to){
      if(!failed&&path.basename(from)==='replacement'&&to===path.join(process.env.CLAUDE_CONFIG_DIR,'skills','C2C')){
        failed=true;throw new Error('Injected second-host rename failure');
      }
      return rename.apply(this,arguments);
    };`);
  const failed = install(f, ['--update'], injected);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Original installations restored/);
  assert.deepEqual(await snapshots(f), original);
  backupId(install(f, ['--update']));
});

test('hard interruption preserves originals, blocks ordinary retries, and explicitly recovers both hosts', async () => {
  const f = await fixture('hard-interruption');
  assert.equal(install(f).status, 0);
  const original = await snapshots(f);
  await advance(f);
  const injected = await injector(f, `
    const rename=fs.renameSync;
    fs.renameSync=function(from,to){
      const result=rename.apply(this,arguments);
      if(path.basename(from)==='replacement'&&to===path.join(process.env.CODEX_HOME,'skills','C2C'))process.exit(73);
      return result;
    };`);
  assert.equal(install(f, ['--update'], injected).status, 73);
  const retry = install(f, ['--update']);
  assert.notEqual(retry.status, 0);
  const id = retry.stderr.match(/Interrupted installation (\d{17}-[a-f0-9]{12})/)?.[1];
  assert.ok(id, retry.stderr);
  // User changes made after the crash are protected during recovery too.
  const changed = path.join(f.claudeSkill, 'SKILL.md');
  const contents = await fs.readFile(changed);
  await fs.appendFile(changed, '\nChanged after interruption.');
  const refused = install(f, ['--recover', id]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /recovery refused/);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.codexSkill, 'package.json'), 'utf8')).version, '99.1.0');
  await fs.writeFile(changed, contents);
  const recovered = install(f, ['--recover', id]);
  assert.equal(recovered.status, 0, recovered.stderr);
  for (const [index, skill] of [f.codexSkill, f.claudeSkill].entries()) for (const { file, bytes } of original[index]) assert.deepEqual(await fs.readFile(path.join(skill, file)), bytes);
  backupId(install(f, ['--update']));
});

test('recovery resumes after a crash while publishing intent and after the first host was restored', async () => {
  const f = await fixture('interrupted-recovery');
  assert.equal(install(f).status, 0);
  const original = await snapshots(f);
  await advance(f);
  function crashOn(homeVariable, status, code) {
    return `const rename=fs.renameSync;fs.renameSync=function(from,to){
      const result=rename.apply(this,arguments);
      if(path.basename(to)==='transaction.json'&&to.startsWith(process.env.${homeVariable}+path.sep)){
        const record=JSON.parse(fs.readFileSync(to,'utf8'));
        if(record.operation==='update'&&record.status==='${status}')process.exit(${code});
      }
      return result;
    };`;
  }
  assert.equal(install(f, ['--update'], await injector(f, crashOn('CODEX_HOME', 'committed', 73))).status, 73);
  const stopped = install(f, ['--update']);
  const id = stopped.stderr.match(/Interrupted installation (\d{17}-[a-f0-9]{12})/)?.[1];
  assert.ok(id, stopped.stderr);
  const states = async () => Promise.all([f.codexHome, f.claudeHome].map(async home => JSON.parse(await fs.readFile(path.join(home, 'c2c-install-backups', id, 'transaction.json'), 'utf8')).status));
  assert.deepEqual(await states(), ['committed', 'prepared']);
  assert.equal(install(f, ['--recover', id], await injector(f, crashOn('CODEX_HOME', 'recovering', 74))).status, 74);
  assert.deepEqual(await states(), ['recovering', 'prepared']);
  assert.equal(install(f, ['--recover', id], await injector(f, crashOn('CLAUDE_CONFIG_DIR', 'recovered', 75))).status, 75);
  assert.deepEqual(await states(), ['recovering', 'recovered']);
  const retry = install(f, ['--recover', id]);
  assert.equal(retry.status, 0, retry.stderr);
  assert.deepEqual(await states(), ['recovered', 'recovered']);
  for (const [index, skill] of [f.codexSkill, f.claudeSkill].entries()) for (const { file, bytes } of original[index]) assert.deepEqual(await fs.readFile(path.join(skill, file)), bytes);
  assert.notEqual(install(f, ['--recover', id]).status, 0, 'fully recovered transaction is not a new recovery request');
  const complete = backupId(install(f, ['--update']));
  const noReplay = install(f, ['--recover', complete]);
  assert.notEqual(noReplay.status, 0);
  assert.match(noReplay.stderr, /No interrupted/);
});

test('linked installation and linked backup directories are refused without changing their targets', async () => {
  const f = await fixture('linked-installer-boundary');
  assert.equal(install(f, ['--target', 'codex']).status, 0);
  const actual = path.join(f.root, 'user-owned-installation');
  await fs.rename(f.codexSkill, actual);
  await fs.symlink(actual, f.codexSkill, process.platform === 'win32' ? 'junction' : 'dir');
  const before = await contentsAndTimes(actual);
  await advance(f);
  const linked = install(f, ['--update', '--target', 'codex']);
  assert.notEqual(linked.status, 0);
  assert.match(linked.stderr, /Linked or non-directory/);
  assert.deepEqual(await contentsAndTimes(actual), before);
  await fs.unlink(f.codexSkill);
  await fs.rename(actual, f.codexSkill);
  const backups = path.join(f.codexHome, 'c2c-install-backups');
  const relocated = path.join(f.root, 'user-owned-backups');
  await fs.rename(backups, relocated);
  await fs.symlink(relocated, backups, process.platform === 'win32' ? 'junction' : 'dir');
  const linkedBackup = install(f, ['--update', '--target', 'codex']);
  assert.notEqual(linkedBackup.status, 0);
  assert.match(linkedBackup.stderr, /must not be linked/);
  assert.deepEqual(await contentsAndTimes(f.codexSkill), before);
});

test('installer validates mode and backup IDs without creating destinations', async () => {
  const f = await fixture('invalid-installer-options');
  for (const args of [['--update', '--rollback', 'x'], ['--rollback', '../outside'], ['--recover'], ['--target', 'other'], ['--update', '--update'], ['--force']]) {
    const result = install(f, args);
    assert.notEqual(result.status, 0, JSON.stringify(args));
  }
  await assert.rejects(fs.access(f.codexSkill));
  await assert.rejects(fs.access(f.claudeSkill));
});

test('update requires selected installs and prints a usable rollback command when only one version changes', async () => {
  const f = await fixture('partial-host-update');
  assert.equal(install(f, ['--target', 'codex']).status, 0);
  const absent = install(f, ['--update']);
  assert.notEqual(absent.status, 0);
  assert.match(absent.stderr, /No installed skill to update/);
  await assert.rejects(fs.access(f.claudeSkill));
  assert.equal(install(f, ['--target', 'claude']).status, 0);
  await advance(f);
  backupId(install(f, ['--update', '--target', 'codex']));
  const unchanged = await contentsAndTimes(f.codexSkill);
  const second = install(f, ['--update']);
  const id = backupId(second);
  assert.match(second.stdout, /Undo: .* --target claude/);
  assert.deepEqual(await contentsAndTimes(f.codexSkill), unchanged);
  backupId(install(f, ['--rollback', id, '--target', 'claude']));
  assert.deepEqual(await contentsAndTimes(f.codexSkill), unchanged);
});

test('backup location may not be nested in the other provider discovery root', async () => {
  const f = await fixture('nested-config-root');
  const nested = path.join(f.claudeHome, 'skills', 'nested-codex-home');
  const result = install(f, ['--target', 'codex'], { CODEX_HOME: nested });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside every skill root/);
  await assert.rejects(fs.access(nested));
});

test('aliased physical skill roots share an installer lock across different configuration homes', async () => {
  const f = await fixture('concurrent-linked-roots');
  const shared = path.join(f.root, 'shared', 'skills');
  await fs.mkdir(shared, { recursive: true });
  for (const home of [f.codexHome, f.claudeHome]) {
    await fs.mkdir(home);
    await fs.symlink(shared, path.join(home, 'skills'), process.platform === 'win32' ? 'junction' : 'dir');
  }
  const marker = path.join(f.root, 'installer-paused');
  const release = path.join(f.root, 'release-installer');
  const injected = await injector(f, `
    const copy=fs.copyFileSync;let paused=false;
    fs.copyFileSync=function(from,to){
      if(!paused&&path.basename(from)==='SKILL.md'){
        paused=true;fs.writeFileSync(process.env.C2C_TEST_MARKER,'ready');
        const deadline=Date.now()+15000;
        while(!fs.existsSync(process.env.C2C_TEST_RELEASE)&&Date.now()<deadline)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);
        if(!fs.existsSync(process.env.C2C_TEST_RELEASE))throw new Error('Fixture release timeout');
      }
      return copy.apply(this,arguments);
    };`);
  const child = spawn(process.execPath, [path.join(f.source, 'scripts/install.mjs'), '--target', 'codex'], {
    cwd: f.root, env: { ...process.env, CODEX_HOME: f.codexHome, CLAUDE_CONFIG_DIR: f.claudeHome, ...injected, C2C_TEST_MARKER: marker, C2C_TEST_RELEASE: release },
    shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', failure;
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const completed = new Promise(resolve => { child.on('error', error => { failure = error; resolve(-1); }); child.on('close', resolve); });
  let exit;
  try {
    const deadline = Date.now() + 10000;
    let ready = false;
    while (Date.now() < deadline && child.exitCode === null && !failure) {
      try { await fs.access(marker); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 25)); }
    }
    assert.ok(ready, `First installer did not reach locked staging: ${failure?.message || output}`);
    const conflicting = install(f, ['--target', 'claude']);
    assert.notEqual(conflicting.status, 0);
    assert.match(conflicting.stderr, /Another process is using/);
    await assert.rejects(fs.access(path.join(shared, 'C2C')), 'first installer must remain paused before publication');
  } finally {
    await fs.writeFile(release, 'continue');
    exit = await completed;
  }
  assert.equal(exit, 0, output);
  assert.deepEqual(await fs.readFile(path.join(shared, 'C2C', 'SKILL.md')), await fs.readFile(path.join(f.source, 'SKILL.md')));
  assert.equal(install(f, ['--target', 'claude']).status, 0, 'second host recognizes the completed shared install');
  const original = await fs.readFile(path.join(shared, 'C2C', 'SKILL.md'));
  await advance(f);
  const crash = await injector(f, `const rename=fs.renameSync;fs.renameSync=function(from,to){const result=rename.apply(this,arguments);if(path.basename(from)==='replacement')process.exit(73);return result;};`);
  assert.equal(install(f, ['--update', '--target', 'codex'], crash).status, 73);
  const alternate = install(f, ['--update', '--target', 'claude']);
  assert.notEqual(alternate.status, 0);
  const id = alternate.stderr.match(/Interrupted installation (\d{17}-[a-f0-9]{12})/)?.[1];
  assert.ok(id, alternate.stderr);
  const recovered = install(f, ['--recover', id, '--target', 'claude']);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.deepEqual(await fs.readFile(path.join(shared, 'C2C', 'SKILL.md')), original);
});

test('distinct linked skills directories under one physical parent keep separate transaction stores', async () => {
  const f = await fixture('distinct-linked-roots');
  const sharedParent = path.join(f.root, 'shared');
  for (const [home, name] of [[f.codexHome, 'codex-skills'], [f.claudeHome, 'claude-skills']]) {
    const actual = path.join(sharedParent, name);
    await fs.mkdir(actual, { recursive: true });
    await fs.mkdir(home);
    await fs.symlink(actual, path.join(home, 'skills'), process.platform === 'win32' ? 'junction' : 'dir');
  }
  const first = install(f);
  assert.equal(first.status, 0, first.stderr);
  await advance(f);
  const id = backupId(install(f, ['--update']));
  const rollback = install(f, ['--rollback', id]);
  assert.equal(rollback.status, 0, rollback.stderr);
});

test('uninstall retains exact originals outside discovery, preserves other files and supports undo', async () => {
  const f = await fixture('uninstall-undo');
  assert.equal(install(f).status, 0);
  const original = await snapshots(f);
  const unrelated = [];
  for (const home of [f.codexHome, f.claudeHome]) {
    for (const relative of ['settings.json', 'projects/plan.md', 'skills/Other/SKILL.md']) {
      const file = path.join(home, relative);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, `User-owned ${relative}\n`);
      unrelated.push([file, await fs.readFile(file)]);
    }
  }
  const removed = install(f, ['--uninstall']);
  const id = backupId(removed);
  assert.match(removed.stdout, new RegExp(`Undo: node scripts/install\\.mjs --rollback ${id} --target both`));
  for (const [index, home, skill] of [[0, f.codexHome, f.codexSkill], [1, f.claudeHome, f.claudeSkill]]) {
    await assert.rejects(fs.access(skill));
    const backup = path.join(home, 'c2c-install-backups', id);
    assert.deepEqual(await contentsAndTimes(path.join(backup, 'original')), original[index]);
    const record = JSON.parse(await fs.readFile(path.join(backup, 'transaction.json'), 'utf8'));
    assert.equal(record.operation, 'uninstall');
    assert.equal(record.after, null);
    assert.equal(record.status, 'committed');
    assert.deepEqual(await fs.readdir(path.join(home, 'skills')), ['Other']);
  }
  const repeated = install(f, ['--uninstall']);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal((repeated.stdout.match(/Already uninstalled:/g) || []).length, 2);
  assert.doesNotMatch(repeated.stdout, /Backup ID:/);
  const undo = install(f, ['--rollback', id]);
  assert.equal(undo.status, 0, undo.stderr);
  assert.match(undo.stdout, /Rolled back:/);
  for (const [index, skill] of [f.codexSkill, f.claudeSkill].entries()) {
    for (const { file, bytes } of original[index]) assert.deepEqual(await fs.readFile(path.join(skill, file)), bytes);
  }
  for (const [file, bytes] of unrelated) assert.deepEqual(await fs.readFile(file), bytes);
});

test('uninstall handles one installed provider and isolates explicit provider selection', async () => {
  for (const provider of ['codex', 'claude']) {
    const f = await fixture(`uninstall-${provider}`);
    assert.equal(install(f, ['--target', provider]).status, 0);
    const result = install(f, ['--uninstall']);
    const id = backupId(result);
    assert.match(result.stdout, new RegExp(`Undo: .* --target ${provider}`));
    assert.equal(install(f, ['--rollback', id, '--target', provider]).status, 0);
    assert.equal(install(f).status, 0);
    const otherSkill = provider === 'codex' ? f.claudeSkill : f.codexSkill;
    const untouched = await contentsAndTimes(otherSkill);
    backupId(install(f, ['--uninstall', '--target', provider]));
    assert.deepEqual(await contentsAndTimes(otherSkill), untouched);
  }
});

test('uninstall refuses custom or unknown entries in all targets before removing either', async () => {
  for (const kind of ['edit', 'missing', 'extra', 'empty-directory', 'receipt']) {
    const f = await fixture(`uninstall-refuses-${kind}`);
    assert.equal(install(f).status, 0);
    const untouched = await contentsAndTimes(f.codexSkill);
    if (kind === 'edit') await fs.appendFile(path.join(f.claudeSkill, 'SKILL.md'), '\nPrivate customization.');
    if (kind === 'missing') await fs.unlink(path.join(f.claudeSkill, 'LICENSE'));
    if (kind === 'extra') await fs.writeFile(path.join(f.claudeSkill, 'notes.md'), 'Private notes.');
    if (kind === 'empty-directory') await fs.mkdir(path.join(f.claudeSkill, 'notes'));
    if (kind === 'receipt') await fs.writeFile(path.join(f.claudeSkill, '.c2c-install.json'), '{broken');
    const result = install(f, ['--uninstall']);
    assert.notEqual(result.status, 0, kind);
    assert.match(result.stderr, /different installation exists/);
    assert.deepEqual(await contentsAndTimes(f.codexSkill), untouched);
    await fs.access(f.claudeSkill);
    if (kind === 'edit') assert.match(await fs.readFile(path.join(f.claudeSkill, 'SKILL.md'), 'utf8'), /Private customization/);
    if (kind === 'extra') assert.equal(await fs.readFile(path.join(f.claudeSkill, 'notes.md'), 'utf8'), 'Private notes.');
    if (kind === 'empty-directory') assert.deepEqual(await fs.readdir(path.join(f.claudeSkill, 'notes')), []);
  }
});

test('uninstall undo protects reinstalls and checks all retained backups before restoring', async () => {
  const f = await fixture('uninstall-undo-protection');
  assert.equal(install(f).status, 0);
  const id = backupId(install(f, ['--uninstall']));
  assert.equal(install(f, ['--target', 'claude']).status, 0);
  const reinstalled = await contentsAndTimes(f.claudeSkill);
  const refused = install(f, ['--rollback', id]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /appeared after uninstall/);
  await assert.rejects(fs.access(f.codexSkill));
  assert.deepEqual(await contentsAndTimes(f.claudeSkill), reinstalled);
  backupId(install(f, ['--uninstall', '--target', 'claude']));
  await fs.appendFile(path.join(f.claudeHome, 'c2c-install-backups', id, 'original', 'SKILL.md'), 'Damaged backup.');
  const corrupt = install(f, ['--rollback', id]);
  assert.notEqual(corrupt.status, 0);
  assert.match(corrupt.stderr, /backup changed/);
  await assert.rejects(fs.access(f.codexSkill));
  await assert.rejects(fs.access(f.claudeSkill));
});

test('ordinary uninstall failure after the first removal restores both providers', async () => {
  const f = await fixture('uninstall-second-failure');
  assert.equal(install(f).status, 0);
  const original = await snapshots(f);
  const injected = await injector(f, `const rename=fs.renameSync;let failed=false;fs.renameSync=function(from,to){
    if(!failed&&from===path.join(process.env.CLAUDE_CONFIG_DIR,'skills','C2C')&&path.basename(to)==='original'){
      failed=true;throw new Error('Injected second uninstall failure');
    }return rename.apply(this,arguments);
  };`);
  const result = install(f, ['--uninstall'], injected);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Original installations restored/);
  assert.deepEqual(await snapshots(f), original);
  backupId(install(f, ['--uninstall']));
});

test('interrupted uninstall blocks retries, protects new files and recovers both providers', async () => {
  const f = await fixture('uninstall-interrupted');
  assert.equal(install(f).status, 0);
  const original = await snapshots(f);
  const injected = await injector(f, `const rename=fs.renameSync;fs.renameSync=function(from,to){
    const result=rename.apply(this,arguments);
    if(from===path.join(process.env.CODEX_HOME,'skills','C2C')&&path.basename(to)==='original')process.exit(73);
    return result;
  };`);
  assert.equal(install(f, ['--uninstall'], injected).status, 73);
  const retry = install(f, ['--uninstall']);
  assert.notEqual(retry.status, 0);
  const id = retry.stderr.match(/Interrupted installation (\d{17}-[a-f0-9]{12})/)?.[1];
  assert.ok(id, retry.stderr);
  await assert.rejects(fs.access(f.codexSkill));
  await fs.mkdir(f.codexSkill);
  const userFile = path.join(f.codexSkill, 'private.txt');
  await fs.writeFile(userFile, 'Created after interruption.');
  const refused = install(f, ['--recover', id]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /recovery refused/);
  assert.equal(await fs.readFile(userFile, 'utf8'), 'Created after interruption.');
  assert.deepEqual(await contentsAndTimes(f.claudeSkill), original[1]);
  await fs.rename(f.codexSkill, path.join(f.root, 'saved-user-files'));
  const recovered = install(f, ['--recover', id]);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.deepEqual(await snapshots(f), original);
  backupId(install(f, ['--uninstall']));
});

test('uninstall refuses linked installations and linked backup stores', async () => {
  const f = await fixture('uninstall-links');
  assert.equal(install(f, ['--target', 'codex']).status, 0);
  const actual = path.join(f.root, 'actual-installation');
  await fs.rename(f.codexSkill, actual);
  await fs.symlink(actual, f.codexSkill, process.platform === 'win32' ? 'junction' : 'dir');
  const original = await contentsAndTimes(actual);
  const linked = install(f, ['--uninstall', '--target', 'codex']);
  assert.notEqual(linked.status, 0);
  assert.match(linked.stderr, /Linked or non-directory/);
  assert.deepEqual(await contentsAndTimes(actual), original);
  await fs.unlink(f.codexSkill);
  await fs.rename(actual, f.codexSkill);
  const backups = path.join(f.codexHome, 'c2c-install-backups');
  const moved = path.join(f.root, 'actual-backups');
  await fs.rename(backups, moved);
  await fs.symlink(moved, backups, process.platform === 'win32' ? 'junction' : 'dir');
  const linkedBackup = install(f, ['--uninstall', '--target', 'codex']);
  assert.notEqual(linkedBackup.status, 0);
  assert.match(linkedBackup.stderr, /must not be linked/);
  assert.deepEqual(await contentsAndTimes(f.codexSkill), original);
});

test('interrupted undo of uninstall recovers to the absent state and keeps the original undo usable', async () => {
  const f = await fixture('uninstall-undo-interrupted');
  assert.equal(install(f).status, 0);
  const original = await snapshots(f);
  const removedId = backupId(install(f, ['--uninstall']));
  const injected = await injector(f, `const rename=fs.renameSync;fs.renameSync=function(from,to){
    const result=rename.apply(this,arguments);
    if(path.basename(from)==='replacement'&&to===path.join(process.env.CODEX_HOME,'skills','C2C'))process.exit(73);
    return result;
  };`);
  assert.equal(install(f, ['--rollback', removedId], injected).status, 73);
  const retry = install(f, ['--rollback', removedId]);
  const interruptedId = retry.stderr.match(/Interrupted installation (\d{17}-[a-f0-9]{12})/)?.[1];
  assert.ok(interruptedId, retry.stderr);
  assert.notEqual(interruptedId, removedId);
  const recovered = install(f, ['--recover', interruptedId]);
  assert.equal(recovered.status, 0, recovered.stderr);
  await assert.rejects(fs.access(f.codexSkill));
  await assert.rejects(fs.access(f.claudeSkill));
  const undo = install(f, ['--rollback', removedId]);
  assert.equal(undo.status, 0, undo.stderr);
  for (const [index, skill] of [f.codexSkill, f.claudeSkill].entries()) {
    for (const { file, bytes } of original[index]) assert.deepEqual(await fs.readFile(path.join(skill, file)), bytes);
  }
});

test('dry-run previews install, update and uninstall without filesystem changes', async () => {
  const f = await fixture('dry-run');
  const fresh = install(f, ['--dry-run']);
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.equal((fresh.stdout.match(/Would install:/g) || []).length, 2);
  await assert.rejects(fs.access(f.codexHome));
  await assert.rejects(fs.access(f.claudeHome));
  assert.equal(install(f).status, 0);
  const original = await snapshots(f);
  const backups = await Promise.all([f.codexHome, f.claudeHome].map(home => fs.readdir(path.join(home, 'c2c-install-backups'))));
  await advance(f);
  for (const mode of ['--update', '--uninstall']) {
    const result = install(f, [mode, '--dry-run']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal((result.stdout.match(new RegExp(`Would ${mode.slice(2)}:`, 'g')) || []).length, 2);
    assert.deepEqual(await snapshots(f), original);
    assert.deepEqual(await Promise.all([f.codexHome, f.claudeHome].map(home => fs.readdir(path.join(home, 'c2c-install-backups')))), backups);
  }
  await fs.appendFile(path.join(f.claudeSkill, 'SKILL.md'), '\nCustom file.');
  const changed = await snapshots(f);
  const blocked = install(f, ['--uninstall', '--dry-run']);
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /different installation exists/);
  assert.deepEqual(await snapshots(f), changed);
});

test('uninstall and dry-run options reject ambiguous modes and print wrapper undo commands', async () => {
  const f = await fixture('uninstall-options');
  const id = '20261008123456000-123456789abc';
  for (const args of [['--uninstall', '--update'], ['--uninstall', '--uninstall'], ['--dry-run', '--dry-run'], ['--rollback', id, '--dry-run'], ['--recover', id, '--dry-run']]) {
    const result = install(f, args);
    assert.notEqual(result.status, 0, JSON.stringify(args));
  }
  await assert.rejects(fs.access(f.codexHome));
  await assert.rejects(fs.access(f.claudeHome));
  assert.equal(install(f, ['--target', 'codex']).status, 0);
  const launcher = 'npx --yes https://example.invalid/c2c.tar.gz';
  const removed = install(f, ['--uninstall'], { C2C_SETUP_LAUNCHER: launcher });
  const removedId = backupId(removed);
  assert.ok(removed.stdout.includes(`Undo: ${launcher} rollback ${removedId} --target codex`));
});
