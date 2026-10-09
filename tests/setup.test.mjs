import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';

const source = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporaryParent = await fs.realpath(os.tmpdir());
const root = await fs.mkdtemp(path.join(temporaryParent, 'c2c-setup-'));
let npmCli = process.env.npm_execpath;
if (!npmCli) {
  // Direct node:test/CI execution lacks npm_execpath. Native POSIX Node
  // distributions put npm in ../lib; Windows distributions put it beside node.
  for (const relative of ['node_modules/npm/bin/npm-cli.js', '../lib/node_modules/npm/bin/npm-cli.js']) {
    const candidate = path.resolve(path.dirname(process.execPath), relative);
    try { if ((await fs.stat(candidate)).isFile()) { npmCli = candidate; break; } } catch {}
  }
}
assert.ok(npmCli, 'Cannot locate npm for the offline packaging test; run through npm test.');
after(async () => {
  const resolved = await fs.realpath(root);
  assert.equal(path.dirname(resolved), temporaryParent);
  assert.ok(path.basename(resolved).startsWith('c2c-setup-'));
  await fs.rm(resolved, { recursive: true, force: true });
});

async function environment(name) {
  const directory = await fs.mkdtemp(path.join(root, `${name}-`));
  const config = path.join(directory, 'empty.npmrc');
  await fs.writeFile(config, '');
  const env = {
    ...process.env, CODEX_HOME: path.join(directory, 'codex home'),
    CLAUDE_CONFIG_DIR: path.join(directory, 'claude home'),
    npm_config_cache: path.join(directory, 'npm-cache'), npm_config_userconfig: config,
    npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false',
  };
  return { directory, env };
}

function run(args, context, cwd = source) {
  const result = spawnSync(process.execPath, args, { cwd, env: context.env, shell: false, windowsHide: true, encoding: 'utf8', timeout: 45000 });
  if (result.error) throw result.error;
  return result;
}

test('setup help, version and invalid actions never create skill destinations', async () => {
  const context = await environment('cli');
  const setup = path.join(source, 'scripts/setup.mjs');
  for (const args of [[], ['help'], ['version'], ['--help']]) {
    const result = run([setup, ...args], context);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /C2C/);
  }
  for (const args of [['remove-everything'], ['version', '--target', 'both'], ['install', '--uninstall'], ['doctor', '--target', 'codex'], ['check-update', '--target', 'codex'], ['update', '--target', 'invalid'], ['update', '--run'], ['update', '--source', '--source']]) {
    assert.notEqual(run([setup, ...args], context).status, 0, args.join(' '));
  }
  await assert.rejects(fs.access(context.env.CODEX_HOME));
  await assert.rejects(fs.access(context.env.CLAUDE_CONFIG_DIR));
});

test('automatic update checks can be disabled without creating destinations or fetching', async () => {
  const context = await environment('check-disabled');
  context.env.C2C_UPDATE_CHECK = 'off';
  const result = run([path.join(source, 'scripts/setup.mjs'), 'check-update', '--auto'], context);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'disabled');
  await assert.rejects(fs.access(context.env.CODEX_HOME));
  await assert.rejects(fs.access(context.env.CLAUDE_CONFIG_DIR));
});

test('updater refuses a downgrade of either selected installation before downloading code', async () => {
  const context = await environment('downgrade');
  const preload = path.join(context.directory, 'public-release-fixture.mjs');
  await fs.writeFile(preload, `globalThis.fetch = async url => {
    if (url.endsWith('/tags?per_page=100')) return new Response(JSON.stringify([{name:'v9.2.0',commit:{sha:'${'a'.repeat(40)}'}}]));
    if (url.endsWith('/package.json')) return new Response(JSON.stringify({name:'c2c',version:'9.2.0'}));
    throw new Error('Archive must not be requested');
  };`);
  for (const home of [context.env.CODEX_HOME, context.env.CLAUDE_CONFIG_DIR]) await fs.mkdir(path.join(home, 'skills/C2C'), { recursive: true });
  const codexManifest = path.join(context.env.CODEX_HOME, 'skills/C2C/package.json');
  const claudeManifest = path.join(context.env.CLAUDE_CONFIG_DIR, 'skills/C2C/package.json');
  await fs.writeFile(codexManifest, JSON.stringify({ version: '1.3.0' }));
  await fs.writeFile(claudeManifest, JSON.stringify({ version: '10.0.0' }));
  const result = run(['--import', pathToFileURL(preload).href, path.join(source, 'scripts/setup.mjs'), 'update'], context);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /claude already has C2C 10\.0\.0/);
  assert.doesNotMatch(result.stderr, /Archive must not/);
  assert.equal(JSON.parse(await fs.readFile(claudeManifest, 'utf8')).version, '10.0.0');
});

test('active legacy run refuses an in-chat update before discovery or installation', async () => {
  const context = await environment('legacy-run');
  const legacy = path.join(context.directory, 'old plan');
  await fs.mkdir(legacy);
  await fs.writeFile(path.join(legacy, 'run.json'), JSON.stringify({ version: 6, id: 'legacy', status: 'prepared', attempts: [], stages: {}, seals: {}, elapsed_ms: 0 }));
  await fs.writeFile(path.join(legacy, 'snapshot.json'), '{}');
  const preload = path.join(context.directory, 'no-network.mjs');
  await fs.writeFile(preload, "globalThis.fetch = async () => { throw new Error('Unexpected network request'); };\n");
  const result = run(['--import', pathToFileURL(preload).href, path.join(source, 'scripts/setup.mjs'), 'update', '--run', legacy], context);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Legacy run has no pinned/);
  assert.doesNotMatch(result.stderr, /Unexpected network/);
  await assert.rejects(fs.access(context.env.CODEX_HOME));
  await assert.rejects(fs.access(context.env.CLAUDE_CONFIG_DIR));
});

test('latest update verifies a fresh release, upgrades through the managed installer and rolls back', async () => {
  const context = await environment('latest-fixture');
  const setup = path.join(source, 'scripts/setup.mjs');
  assert.equal(run([setup, 'install'], context).status, 0);
  const codexSkill = path.join(context.env.CODEX_HOME, 'skills/C2C');
  const receipt = JSON.parse(await fs.readFile(path.join(codexSkill, '.c2c-install.json'), 'utf8'));
  const originalVersion = JSON.parse(await fs.readFile(path.join(codexSkill, 'package.json'), 'utf8')).version;
  const commit = 'a'.repeat(40), tree = { truncated: false, tree: [] }, entries = [];
  for (const name of Object.keys(receipt.files)) {
    let bytes = await fs.readFile(path.join(source, name));
    if (name === 'package.json') bytes = Buffer.from(JSON.stringify({ ...JSON.parse(bytes.toString('utf8')), version: '9.2.0' }));
    tree.tree.push({ path: name, type: 'blob', mode: '100644', sha: crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') });
    const header = Buffer.alloc(512);
    const archiveName = `C2C-${commit}/${name}`;
    assert.ok(Buffer.byteLength(archiveName) < 100);
    header.write(archiveName); header.write('0000644\0', 100); header.write(`${bytes.length.toString(8).padStart(11, '0')}\0`, 124);
    header.fill(32, 148, 156); header.write('0', 156); header.write('ustar\0', 257);
    header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148);
    entries.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  const archiveFile = path.join(context.directory, 'release.tar.gz'), treeFile = path.join(context.directory, 'tree.json');
  await fs.writeFile(archiveFile, gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)])));
  await fs.writeFile(treeFile, JSON.stringify(tree));
  const preload = path.join(context.directory, 'release-fetch.mjs');
  await fs.writeFile(preload, `import fs from 'node:fs'; import { spawnSync } from 'node:child_process';
    globalThis.fetch = async (url, options) => {
      if (options.redirect !== 'error') throw new Error('Redirect policy changed');
      if (url === 'https://api.github.com/repos/ZiadHassanein/C2C/tags?per_page=100') return new Response(JSON.stringify([{name:'v9.2.0',commit:{sha:'${commit}'}}]));
      if (url === 'https://raw.githubusercontent.com/ZiadHassanein/C2C/${commit}/package.json') return new Response(JSON.stringify({name:'c2c',version:'9.2.0'}));
      if (url === 'https://api.github.com/repos/ZiadHassanein/C2C/git/trees/${commit}?recursive=1') return new Response(fs.readFileSync(${JSON.stringify(treeFile)}));
      if (url === 'https://codeload.github.com/ZiadHassanein/C2C/tar.gz/${commit}') {
        if (process.env.C2C_TEST_INSTALL_NEWER) {
          const changed = spawnSync(process.execPath, [process.env.C2C_TEST_INSTALL_NEWER, '--update', '--target', 'codex'], { env: process.env, encoding: 'utf8', shell: false, windowsHide: true, timeout: 15000 });
          if (changed.status !== 0) throw new Error('Concurrent installation fixture failed: ' + changed.stderr);
        }
        return new Response(fs.readFileSync(${JSON.stringify(archiveFile)}));
      }
      throw new Error('Unexpected network request: ' + url);
    };`);
  // The notification cache is deliberately stale/untrusted; it cannot select
  // executable code. Latest update must discover and verify the fresh fixture.
  await fs.writeFile(path.join(context.env.CODEX_HOME, 'c2c-update-check.json'), JSON.stringify({ schema: 1, checked_at: Date.now(), release: { version: '99.0.0', commit: 'b'.repeat(40) } }));
  const updated = run(['--import', pathToFileURL(preload).href, setup, 'update', '--target', 'codex'], context);
  assert.equal(updated.status, 0, updated.stderr);
  assert.equal(JSON.parse(await fs.readFile(path.join(codexSkill, 'package.json'), 'utf8')).version, '9.2.0');
  assert.equal(JSON.parse(await fs.readFile(path.join(context.env.CLAUDE_CONFIG_DIR, 'skills/C2C/package.json'), 'utf8')).version, originalVersion);
  const backup = updated.stdout.match(/Backup ID: (\d{17}-[a-f0-9]{12})/)?.[1];
  assert.ok(backup, updated.stdout);
  const restored = run([path.join(codexSkill, 'scripts/setup.mjs'), 'rollback', backup, '--target', 'codex'], context);
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(JSON.parse(await fs.readFile(path.join(codexSkill, 'package.json'), 'utf8')).version, originalVersion);
  const newerSource = path.join(context.directory, 'newer-source');
  for (const name of Object.keys(receipt.files)) {
    const destination = path.join(newerSource, name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(source, name), destination);
  }
  const newerManifest = path.join(newerSource, 'package.json');
  await fs.writeFile(newerManifest, JSON.stringify({ ...JSON.parse(await fs.readFile(newerManifest, 'utf8')), version: '99.2.0' }));
  context.env.C2C_TEST_INSTALL_NEWER = path.join(newerSource, 'scripts/install.mjs');
  const racing = run(['--import', pathToFileURL(preload).href, setup, 'update', '--target', 'codex'], context);
  assert.equal(racing.status, 1);
  assert.match(racing.stderr, /Installed C2C 99\.2\.0 is newer than downloaded C2C 9\.2\.0/);
  assert.equal(JSON.parse(await fs.readFile(path.join(codexSkill, 'package.json'), 'utf8')).version, '99.2.0', 'download-time concurrent install must survive');
});

test('setup preserves relative configured homes when releasing its working directory', async () => {
  const context = await environment('relative-homes');
  context.env.CODEX_HOME = 'custom codex';
  context.env.CLAUDE_CONFIG_DIR = 'custom claude';
  const direct = run([path.join(source, 'scripts/install.mjs'), '--dry-run'], context, context.directory);
  const wrapped = run([path.join(source, 'scripts/setup.mjs'), 'install', '--dry-run'], context, context.directory);
  assert.equal(direct.status, 0, direct.stderr);
  assert.equal(wrapped.status, 0, wrapped.stderr);
  assert.equal(wrapped.stdout, direct.stdout);
  await assert.rejects(fs.access(path.join(context.directory, context.env.CODEX_HOME)));
  await assert.rejects(fs.access(path.join(context.directory, context.env.CLAUDE_CONFIG_DIR)));
});

test('packaged executable works through npm exec offline without a clone, then uninstalls and restores', async () => {
  const context = await environment('tarball');
  const packed = run([npmCli, 'pack', '--ignore-scripts', '--offline', '--json', '--pack-destination', context.directory], context);
  assert.equal(packed.status, 0, packed.stderr);
  const [manifest] = JSON.parse(packed.stdout);
  const files = manifest.files.map(file => file.path);
  for (const required of ['scripts/setup.mjs', 'scripts/install.mjs', 'scripts/install-baselines.json', 'scripts/state.mjs', 'scripts/updates.mjs', 'SKILL.md']) {
    assert.ok(files.includes(required), `${required} must be in the downloaded package`);
  }
  assert.ok(!files.some(file => /^(tests|work|runs|outputs)\//.test(file)), 'package excludes development and private run files');
  const tarball = path.join(context.directory, manifest.filename);
  // A local archive can be mistaken for an executable on Windows. Select the
  // package explicitly; the public HTTPS command resolves its bin from metadata.
  const exec = (...args) => run([npmCli, 'exec', '--yes', '--offline', `--package=${tarball}`, '--', 'c2c', ...args], context, context.directory);
  const preview = exec('install', '--dry-run');
  assert.equal(preview.status, 0, preview.stderr);
  await assert.rejects(fs.access(context.env.CODEX_HOME));
  await assert.rejects(fs.access(context.env.CLAUDE_CONFIG_DIR));
  const installed = exec('install');
  assert.equal(installed.status, 0, installed.stderr);
  assert.match(installed.stdout, /Installed:/, JSON.stringify(installed));
  const codexSkill = path.join(context.env.CODEX_HOME, 'skills/C2C');
  const claudeSkill = path.join(context.env.CLAUDE_CONFIG_DIR, 'skills/C2C');
  const original = await fs.readFile(path.join(codexSkill, 'SKILL.md'));
  assert.deepEqual(await fs.readFile(path.join(claudeSkill, 'SKILL.md')), original);
  const updated = exec('update', '--source', '--target', 'codex');
  assert.equal(updated.status, 0, updated.stderr);
  assert.deepEqual(await fs.readFile(path.join(codexSkill, 'SKILL.md')), original);
  const removed = exec('uninstall', '--target', 'codex');
  assert.equal(removed.status, 0, removed.stderr);
  await assert.rejects(fs.access(codexSkill));
  assert.deepEqual(await fs.readFile(path.join(claudeSkill, 'SKILL.md')), original);
  const id = removed.stdout.match(/Backup ID: (\d{17}-[a-f0-9]{12})/)?.[1];
  assert.ok(id, removed.stdout);
  assert.match(removed.stdout, /npx --yes https:\/\/github\.com\/ZiadHassanein\/C2C\/.* rollback .* --target codex/);
  const restored = exec('rollback', id, '--target', 'codex');
  assert.equal(restored.status, 0, restored.stderr);
  assert.deepEqual(await fs.readFile(path.join(codexSkill, 'SKILL.md')), original);
  // The installed helper also works without the download or npm being present.
  const local = run([path.join(codexSkill, 'scripts/setup.mjs'), 'uninstall', '--target', 'codex'], context, codexSkill);
  assert.equal(local.status, 0, local.stderr);
  await assert.rejects(fs.access(codexSkill));
});
