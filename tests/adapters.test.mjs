import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveExecutable, probeProvider, parseCodexFeatures, buildCodexArgs, CODEX_DISABLED_FEATURES } from '../scripts/adapters.mjs';

const tempParent = await fs.realpath(os.tmpdir());
const root = await fs.mkdtemp(path.join(tempParent, 'council-adapters-test-'));
after(async () => {
  const resolved = await fs.realpath(root);
  assert.equal(path.dirname(resolved), tempParent);
  assert.ok(path.basename(resolved).startsWith('council-adapters-test-'));
  await fs.rm(resolved, { recursive: true, force: true });
});
const file = async (filename, content = 'test fixture; never executed') => {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, content);
  return fs.realpath(filename);
};
async function npmFixture(label, { layout = 'nested', arch = 'x64', subdir = 'bin' } = {}) {
  const prefix = await fs.mkdtemp(path.join(root, `${label}-`));
  const shim = await file(path.join(prefix, 'codex.cmd'), '@echo off\nexit /b 99\n');
  const packageRoot = path.join(prefix, 'node_modules', '@openai', 'codex');
  await file(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@openai/codex', bin: { codex: 'bin/codex.js' } }));
  const platformRoot = layout === 'nested' ? path.join(packageRoot, 'node_modules', '@openai', `codex-win32-${arch}`)
    : layout === 'hoisted' ? path.join(prefix, 'node_modules', '@openai', `codex-win32-${arch}`) : packageRoot;
  if (layout !== 'bundled') await file(path.join(platformRoot, 'package.json'), JSON.stringify({ name: '@openai/codex' }));
  const triple = arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  const executable = await file(path.join(platformRoot, 'vendor', triple, subdir, 'codex.exe'));
  return { prefix, shim, packageRoot, executable };
}
const windowsOptions = prefix => ({ platform: 'win32', arch: 'x64', env: { PATH: prefix }, home: root });

test('Windows npm Codex resolves nested, hoisted, and bundled platform binaries without running a shim', async () => {
  for (const layout of ['nested', 'hoisted', 'bundled']) {
    const fixture = await npmFixture(layout, { layout });
    assert.equal(resolveExecutable('codex', windowsOptions(fixture.prefix)), fixture.executable);
    assert.equal(resolveExecutable('codex', { ...windowsOptions(''), env: { COUNCIL_CODEX_BIN: fixture.shim } }), fixture.executable);
  }
});

test('Windows npm Codex supports arm64 and the earlier vendor/codex directory', async () => {
  const fixture = await npmFixture('arm', { layout: 'bundled', arch: 'arm64', subdir: 'codex' });
  assert.equal(resolveExecutable('codex', { ...windowsOptions(fixture.prefix), arch: 'arm64' }), fixture.executable);
  assert.throws(() => resolveExecutable('codex', windowsOptions(fixture.prefix)), /not found/);
});

test('Windows resolution respects PATH order and an executable before its adjacent shim', async () => {
  const fixture = await npmFixture('path-order');
  const otherDirectory = await fs.mkdtemp(path.join(root, 'native-'));
  const otherExecutable = await file(path.join(otherDirectory, 'codex.exe'));
  assert.equal(resolveExecutable('codex', windowsOptions(`${fixture.prefix};${otherDirectory}`)), fixture.executable);
  assert.equal(resolveExecutable('codex', windowsOptions(`${otherDirectory};${fixture.prefix}`)), otherExecutable);
  const adjacentExecutable = await file(path.join(fixture.prefix, 'codex.exe'));
  assert.equal(resolveExecutable('codex', windowsOptions(fixture.prefix)), adjacentExecutable);
});

test('invalid explicit override fails instead of silently changing Codex versions', async () => {
  const fixture = await npmFixture('override');
  for (const override of [path.join(root, 'missing.exe'), await file(path.join(root, 'arbitrary.cmd'))]) {
    assert.throws(() => resolveExecutable('codex', { ...windowsOptions(fixture.prefix), env: { PATH: fixture.prefix, COUNCIL_CODEX_BIN: override } }), /COUNCIL_CODEX_BIN does not resolve/);
  }
});

test('unrecognized and incomplete npm packages cannot convert arbitrary wrappers into executables', async () => {
  const fixture = await npmFixture('untrusted-package');
  await file(path.join(fixture.packageRoot, 'package.json'), JSON.stringify({ name: 'some-other-package', bin: { codex: 'bin/codex.js' } }));
  assert.throws(() => resolveExecutable('codex', windowsOptions(fixture.prefix)), /not found/);
  await file(path.join(fixture.packageRoot, 'package.json'), JSON.stringify({ name: '@openai/codex', bin: { codex: 'bin/codex.js' } }));
  await fs.unlink(fixture.executable);
  assert.throws(() => resolveExecutable('codex', windowsOptions(fixture.prefix)), /platform binary/);
});

test('quoted Windows PATH, Path spelling, native Claude fallback, and POSIX executables resolve', async () => {
  const fixture = await npmFixture('quoted path');
  assert.equal(resolveExecutable('codex', { ...windowsOptions(''), env: { Path: `"${fixture.prefix}"` } }), fixture.executable);
  const claude = await file(path.join(root, '.local', 'bin', 'claude.exe'));
  assert.equal(resolveExecutable('claude', windowsOptions('')), claude);
  const posixDirectory = await fs.mkdtemp(path.join(root, 'posix-'));
  const codex = await file(path.join(posixDirectory, 'codex'));
  // Keep the simulated POSIX PATH free of Windows drive letters. Otherwise
  // its ':' separator splits C:\\... and accidentally relies on the cwd drive.
  const previousCwd = process.cwd();
  try {
    process.chdir(root);
    const posixPath = `missing-bin:${path.basename(posixDirectory)}`;
    assert.equal(resolveExecutable('codex', { platform: 'linux', env: { PATH: posixPath }, home: root }), codex);
  } finally { process.chdir(previousCwd); }
});

const features = names => names.map(name => `${name}    stable    true`).join('\n');
const oldFeatures = CODEX_DISABLED_FEATURES.filter(name => name !== 'view_image');
const codexHelp = '--ignore-user-config --output-schema --sandbox --ephemeral --disable --skip-git-repo-check --json --color';
const claudeHelp = '--safe-mode --tools --permission-mode --strict-mcp-config --mcp-config --disable-slash-commands --json-schema --no-session-persistence --output-format --verbose';
function fakeProbe({ help = codexHelp, featureOutput = features(CODEX_DISABLED_FEATURES), featureCode = 0, helpCode = 0, authCode = 0, auth = 'Logged in using ChatGPT', provider = 'codex' } = {}) {
  const calls = [];
  return {
    calls, resolve: name => { assert.equal(name, provider); return '/fake/native-executable'; },
    run: async (executable, args, options) => {
      assert.equal(executable, '/fake/native-executable');
      assert.equal(options.timeoutMs, 15000);
      calls.push(args);
      let stdout, code = 0;
      if (args.join(' ') === '--version') stdout = 'codex-cli 0.160.1';
      else if (args.includes('--help')) { stdout = help; code = helpCode; }
      else if (args.join(' ') === 'features list') { stdout = featureOutput; code = featureCode; }
      else if (['login status', 'auth status'].includes(args.join(' '))) { stdout = auth; code = authCode; }
      else throw new Error(`Unexpected command (could start a model): ${args.join(' ')}`);
      return { code, stdout, stderr: '' };
    },
  };
}

test('compatible Codex preflight preserves required restrictions without model calls', async () => {
  const fixture = fakeProbe();
  const result = await probeProvider('codex', root, fixture);
  assert.equal(result.authenticated, true);
  assert.equal(result.version, 'codex-cli 0.160.1');
  assert.deepEqual(result.disabled_features, CODEX_DISABLED_FEATURES);
  const args = buildCodexArgs({ schemaPath: 'schema with spaces.json', codexFeatures: result.codex_features });
  assert.ok(args.includes('view_image'));
  assert.ok(args.includes('--ignore-user-config'));
  assert.ok(args.includes('approval_policy="never"'));
  assert.ok(args.includes('web_search="disabled"'));
  assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
  for (const name of ['shell_tool', 'unified_exec', 'hooks', 'apps', 'plugins']) assert.equal(args[args.indexOf(name) - 1], '--disable');
  assert.deepEqual(fixture.calls, [['--version'], ['exec', '--help'], ['features', 'list'], ['login', 'status']]);
});

test('Codex 0.146 feature list fails closed rather than exposing its unguarded image tool', async () => {
  const fixture = fakeProbe({ featureOutput: features(oldFeatures) });
  await assert.rejects(() => probeProvider('codex', root, fixture), /required view_image feature control.*update its CLI/);
  assert.deepEqual(fixture.calls, [['--version'], ['exec', '--help'], ['features', 'list']]);
  assert.throws(() => buildCodexArgs({ schemaPath: 'schema.json', codexFeatures: oldFeatures }), /required view_image feature control/);
});

test('feature parser accepts spaced lifecycle names, CRLF, and new features without passing arbitrary flags', () => {
  const names = parseCodexFeatures('shell_tool stable true\r\nunified_exec under development false\r\nview_image stable true\r\nfuture_tool stable true\r\n');
  assert.deepEqual(names, ['shell_tool', 'unified_exec', 'view_image', 'future_tool']);
  const args = buildCodexArgs({ schemaPath: 'schema.json', codexFeatures: names });
  assert.ok(args.includes('view_image'));
  assert.ok(!args.includes('future_tool'));
});

test('missing required flags and failed help exit reject during preflight', async () => {
  for (const options of [{ help: codexHelp.replace('--ignore-user-config', '') }, { helpCode: 1 }]) {
    const fixture = fakeProbe(options);
    await assert.rejects(() => probeProvider('codex', root, fixture), /required --ignore-user-config|help check failed/);
    assert.equal(fixture.calls.length, 2);
  }
});

test('failed, unrecognized, or unsafe feature discovery rejects before authentication and model launch', async () => {
  for (const options of [{ featureCode: 1 }, { featureOutput: 'unexpected output' }, { featureOutput: 'view_image stable true' }, { featureOutput: 'shell_tool stable true' }]) {
    const fixture = fakeProbe(options);
    await assert.rejects(() => probeProvider('codex', root, fixture), /feature discovery|recognized features|required .* feature control/);
    assert.equal(fixture.calls.length, 3);
  }
  assert.throws(() => buildCodexArgs({ schemaPath: 'schema.json', codexFeatures: [] }), /required shell_tool/);
});

test('Codex signed-out status never reports readiness', async () => {
  for (const options of [{ authCode: 1, auth: 'Not logged in' }, { auth: 'Not logged in' }, { authCode: 1, auth: 'Logged in using ChatGPT' }]) {
    assert.equal((await probeProvider('codex', root, fakeProbe(options))).authenticated, false);
  }
});

test('Claude preflight validates flags and successful authentication status without feature probing', async () => {
  const options = { provider: 'claude', help: claudeHelp, auth: '{"loggedIn":true}' };
  const fixture = fakeProbe(options);
  assert.equal((await probeProvider('claude', root, fixture)).authenticated, true);
  assert.deepEqual(fixture.calls, [['--version'], ['--help'], ['auth', 'status']]);
  assert.equal((await probeProvider('claude', root, fakeProbe({ ...options, authCode: 1 }))).authenticated, false);
  await assert.rejects(() => probeProvider('claude', root, fakeProbe({ ...options, help: claudeHelp.replace('--safe-mode', '') })), /required --safe-mode/);
});
