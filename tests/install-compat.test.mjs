import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageFiles = ['SKILL.md', 'agents/openai.yaml', 'references/protocol.md', 'references/project-assessment.md', 'references/plan-presentation.md', 'scripts/council.mjs', 'scripts/process.mjs', 'scripts/assessment.mjs', 'scripts/adapters.mjs', 'scripts/state.mjs', 'scripts/discussion.mjs', 'scripts/participants.mjs', 'scripts/budget.mjs', 'scripts/progress.mjs', 'package.json', 'LICENSE'];
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
  for (const file of [...packageFiles, 'scripts/install.mjs']) {
    const output = path.join(source, file);
    await fs.mkdir(path.dirname(output), { recursive: true });
    const contents = await fs.readFile(path.join(packageRoot, file), 'utf8');
    await fs.writeFile(output, contents.replace(/\r\n/g, '\n'));
  }
  const codexHome = path.join(root, 'codex');
  const claudeHome = path.join(root, 'claude');
  return { root, source, codexHome, claudeHome, codexSkill: path.join(codexHome, 'skills', 'C2C'), claudeSkill: path.join(claudeHome, 'skills', 'C2C') };
}
function install(f, args = []) {
  const result = spawnSync(process.execPath, [path.join(f.source, 'scripts/install.mjs'), ...args], {
    cwd: f.root, env: { ...process.env, CODEX_HOME: f.codexHome, CLAUDE_CONFIG_DIR: f.claudeHome },
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

test('fresh installation includes package version and every runtime helper', async () => {
  const f = await fixture('package');
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
