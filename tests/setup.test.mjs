import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const source = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporaryParent = await fs.realpath(os.tmpdir());
const root = await fs.mkdtemp(path.join(temporaryParent, 'c2c-setup-'));
const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
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
  for (const args of [['remove-everything'], ['version', '--target', 'both'], ['install', '--uninstall'], ['doctor', '--target', 'codex']]) {
    assert.notEqual(run([setup, ...args], context).status, 0, args.join(' '));
  }
  await assert.rejects(fs.access(context.env.CODEX_HOME));
  await assert.rejects(fs.access(context.env.CLAUDE_CONFIG_DIR));
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
  for (const required of ['scripts/setup.mjs', 'scripts/install.mjs', 'scripts/install-baselines.json', 'scripts/state.mjs', 'SKILL.md']) {
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
