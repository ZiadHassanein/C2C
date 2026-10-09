import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { discoverExecutables, resolveExecutable, probeProvider, parseCodexFeatures, buildCodexArgs, CODEX_DISABLED_FEATURES, EFFORT_LEVELS, validateEffort, workerEnvironment, peerAuthenticationFailure, peerUsageLimitFailure, peerNetworkFailure, checkWorkerIdentity } from '../scripts/adapters.mjs';

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

test('owned child identity preflight rejects unavailable inspection without sending input', async () => {
  for (const inspect of [() => ({ status: 'alive', identity: null }), () => { throw new Error('Denied'); }]) {
    await assert.rejects(() => checkWorkerIdentity(root, { inspect }), error => error.reason === 'worker_registration_error' && error.termination.spawnObserved === true);
  }
  await checkWorkerIdentity(root);
});

test('Windows identity preflight rechecks one transient unavailable identity before releasing the inert child', async () => {
  const pids = [];
  await checkWorkerIdentity(root, { platform: 'win32', inspect(pid) {
    pids.push(pid);
    return pids.length === 1 ? { status: 'alive', identity: null } : { status: 'alive', identity: 'fixture-identity' };
  } });
  assert.equal(pids.length, 2);
  assert.ok(Number.isSafeInteger(pids[0]) && pids[0] > 0);
  assert.equal(pids[0], pids[1], 'Recheck the same owned child, never launch a replacement');
});

test('identity preflight never retries dead or unknown processes and persistent missing identity still blocks', async () => {
  for (const [platform, status, expectedCalls] of [['win32', 'alive', 2], ['win32', 'dead', 1], ['win32', 'unknown', 1], ['linux', 'alive', 1]]) {
    let calls = 0;
    await assert.rejects(() => checkWorkerIdentity(root, { platform, inspect() {
      calls++;
      return { status, identity: null };
    } }), error => error.reason === 'worker_registration_error' && error.termination.spawnObserved === true);
    assert.equal(calls, expectedCalls, `${platform}/${status}`);
  }
});

test('connection envelopes and api_error_status have distinct diagnoses without reading successful prose', () => {
  const failed = { code: 1, stdout: JSON.stringify({ type: 'result', is_error: true, result: 'API Error: Connection refused (ECONNREFUSED)' }) };
  assert.equal(peerNetworkFailure('claude', failed).reason, 'network_error');
  assert.match(peerNetworkFailure('claude', failed).message, /approved execution path/);
  assert.equal(peerAuthenticationFailure('claude', failed), null);
  assert.equal(peerUsageLimitFailure('claude', failed), null);
  const apiError = { code: 1, stdout: JSON.stringify({ type: 'assistant', error: 'api_error', api_error_status: 401 }) };
  assert.equal(peerAuthenticationFailure('claude', apiError).reason, 'authentication_error');
  assert.equal(peerNetworkFailure('claude', { code: 0, stdout: JSON.stringify({ type:'result', subtype:'success', result:'Test ECONNREFUSED and connection error cases.' }) }), null);
  assert.equal(peerNetworkFailure('codex', { code: 0, stdout: JSON.stringify({ type:'item.completed', item:{type:'agent_message',text:'ECONNRESET'}}) }), null);
  assert.equal(peerNetworkFailure('codex', { code: 1, stdout: JSON.stringify({ type:'turn.failed', error:{message:'getaddrinfo ENOTFOUND'}}) }).reason, 'network_error');
});

test('Windows native Codex fallbacks follow PATH and never select a prerelease implicitly', async () => {
  const home = await fs.mkdtemp(path.join(root, 'app-fallback-'));
  const local = path.join(home, 'local');
  const primary = await file(path.join(home, 'path', 'codex.exe'));
  const stable = await file(path.join(home, '.codex', '.sandbox-bin', 'codex.exe'));
  const alpha = await file(path.join(local, 'OpenAI', 'Codex', 'bin', '1234abcd', 'codex.exe'));
  const env = { PATH:path.dirname(primary), LOCALAPPDATA:local };
  const candidates = discoverExecutables('codex', { home, platform:'win32', env });
  assert.deepEqual([...candidates], [primary, stable, alpha]);
  const calls = [];
  const run = async (exe,args) => {
    calls.push([exe,args]);
    if(args[0]==='--version')return {code:0,stdout:exe===alpha?'codex-cli 0.162.0-alpha.2':'codex-cli 0.160.1'};
    throw new Error('A prerelease should be rejected before other checks');
  };
  const onlyAlpha = [alpha]; Object.defineProperty(onlyAlpha,'automaticFallbacks',{value:[alpha]});
  await assert.rejects(()=>probeProvider('codex',home,{platform:'win32',env:{},discover:()=>onlyAlpha,run}), /prerelease.*COUNCIL_CODEX_BIN/s);
  assert.equal(calls.length,1);
  assert.deepEqual(discoverExecutables('codex',{home,platform:'win32',env:{...env,COUNCIL_CODEX_BIN:alpha}}),[alpha]);
});

test('automatic fallback continues after an unsupported prerelease without switching after authentication', async () => {
  const candidates = ['alpha.exe', 'stable.exe'];
  Object.defineProperty(candidates, 'automaticFallbacks', { value: candidates });
  const result = await probeProvider('codex', root, { env: {}, platform: 'win32', discover: () => candidates, identityCheck: async () => {},
    run: async (exe, args) => {
      if (args[0] === '--version') return { code: 0, stdout: exe === 'alpha.exe' ? 'codex-cli 0.162.0-alpha.2' : 'codex-cli 0.160.1' };
      assert.equal(exe, 'stable.exe');
      if (args.includes('--help')) return { code: 0, stdout: '--ignore-user-config --output-schema --sandbox --ephemeral --disable --skip-git-repo-check --json --color' };
      if (args[0] === 'features') return { code: 0, stdout: CODEX_DISABLED_FEATURES.map(name => `${name} stable true`).join('\n') };
      assert.deepEqual(args, ['login', 'status']);
      return { code: 0, stdout: 'Logged in using ChatGPT', stderr: '' };
    },
  });
  assert.equal(result.executable, 'stable.exe');
  assert.equal(result.candidate_checks[0].reason, 'cli_incompatible');
});

test('advertised auxiliary tool and fast-mode controls are disabled, without inventing unsupported flags', () => {
  const features = ['shell_tool','unified_exec','view_image','browser_use_external','fast_mode','in_app_local_automation'];
  const args=buildCodexArgs({schemaPath:'schema.json',codexFeatures:features});
  for(const feature of features)assert.ok(args.some((arg,index)=>arg==='--disable'&&args[index+1]===feature));
  assert.ok(!args.includes('remote_plugin'));
});

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

test('Windows discovery lists native and npm candidates in PATH order without duplicates', async () => {
  const fixture = await npmFixture('candidate-order');
  const adjacent = await file(path.join(fixture.prefix, 'codex.exe'));
  const laterDirectory = await fs.mkdtemp(path.join(root, 'candidate-later-'));
  const later = await file(path.join(laterDirectory, 'codex.exe'));
  const options = windowsOptions(`${fixture.prefix};${laterDirectory};${fixture.prefix};${path.dirname(fixture.executable)}`);
  assert.deepEqual(discoverExecutables('codex', options), [adjacent, fixture.executable, later]);
  assert.equal(resolveExecutable('codex', options), adjacent);
  assert.deepEqual(discoverExecutables('codex', {
    ...options, env: { ...options.env, COUNCIL_CODEX_BIN: fixture.shim },
  }), [fixture.executable]);
});

test('Windows discovery deduplicates case variants and a repeated Claude home fallback', {
  skip: process.platform !== 'win32' ? 'Requires Windows case-insensitive filesystem lookup' : false,
}, async () => {
  const home = await fs.mkdtemp(path.join(root, 'candidate-case-'));
  for (const provider of ['codex', 'claude']) {
    const bin = path.join(home, '.local', 'bin');
    const executable = await file(path.join(bin, `${provider}.exe`));
    const candidates = discoverExecutables(provider, {
      platform: 'win32', home, env: { PATH: `${bin};${bin.toUpperCase()};${bin.toLowerCase()}` },
    });
    assert.deepEqual(candidates, [executable]);
  }
});

test('invalid explicit override fails instead of silently changing Codex versions', async () => {
  const fixture = await npmFixture('override');
  for (const override of [path.join(root, 'missing.exe'), await file(path.join(root, 'arbitrary.cmd'))]) {
    assert.throws(() => resolveExecutable('codex', { ...windowsOptions(fixture.prefix), env: { PATH: fixture.prefix, COUNCIL_CODEX_BIN: override } }), /COUNCIL_CODEX_BIN does not resolve/);
  }
});

test('missing provider discovery is optional, precise and never launches a command', async () => {
  const home = await fs.mkdtemp(path.join(root, 'missing-providers-'));
  for (const provider of ['codex', 'claude']) {
    let commands = 0;
    await assert.rejects(() => probeProvider(provider, home, {
      resolve: name => resolveExecutable(name, { platform: 'win32', env: { PATH: '' }, home }),
      run: async () => { commands++; throw new Error('No command should run'); },
    }), error => {
      assert.equal(error.reason, 'cli_not_found');
      assert.match(error.message, /not found in supported discovery locations/);
      assert.match(error.message, /does not prove the CLI is not installed/);
      assert.match(error.message, /Continue provisionally in the current chat within authorized limits/);
      assert.match(error.message, /eligible planner and distinct critic in the initiating provider may run within existing limits/);
      assert.match(error.message, /honor explicit required-participant or wait instructions/);
      assert.match(error.message, /Setup is optional and only when requested/);
      assert.doesNotMatch(error.message, /before using this skill|Install its CLI|reinstall/);
      return true;
    });
    assert.equal(commands, 0);
  }
});

test('an unusable explicit override cannot fall back to a discoverable provider', async () => {
  const home = await fs.mkdtemp(path.join(root, 'provider-overrides-'));
  for (const provider of ['codex', 'claude']) {
    await file(path.join(home, `${provider}.exe`));
    const variable = `COUNCIL_${provider.toUpperCase()}_BIN`;
    for (const override of [path.join(home, 'absent.exe'), await file(path.join(home, `${provider}.ps1`))]) {
      let commands = 0;
      await assert.rejects(() => probeProvider(provider, home, {
        resolve: name => resolveExecutable(name, { platform: 'win32', env: { PATH: home, [variable]: override }, home }),
        run: async () => { commands++; throw new Error('No command should run'); },
      }), error => error.reason === 'cli_override_unusable' && /remains authoritative/.test(error.message));
      assert.equal(commands, 0);
    }
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
  await fs.chmod(codex, 0o755);
  // Keep the simulated POSIX PATH free of Windows drive letters. Otherwise
  // its ':' separator splits C:\\... and accidentally relies on the cwd drive.
  const previousCwd = process.cwd();
  try {
    process.chdir(root);
    const posixPath = `missing-bin:${path.basename(posixDirectory)}`;
    assert.equal(resolveExecutable('codex', { platform: 'linux', env: { PATH: posixPath }, home: root }), codex);
  } finally { process.chdir(previousCwd); }
});

const posixOnly = { skip: process.platform === 'win32' ? 'Requires POSIX execute permissions and shebang support' : false };
const fixtureScript = '#!/usr/bin/env node\nconsole.log(JSON.stringify({ fixture: true, args: process.argv.slice(2) }));\n';
async function posixExecutable(filename) {
  const executable = await file(filename, fixtureScript);
  await fs.chmod(executable, 0o755);
  return executable;
}
function launchFixture(executable, args) {
  const result = spawnSync(executable, args, {
    shell: false, encoding: 'utf8', timeout: 10000,
    // Make the fixture's env-node shebang independent of where Node was installed.
    env: { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ''}` },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('POSIX discovery skips non-executable and invalid PATH candidates and preserves explicit overrides', posixOnly, async () => {
  const prefix = await fs.mkdtemp(path.join(root, 'posix permissions with spaces-'));
  const directories = ['no execute', 'directory', 'broken link', 'valid'].map(name => path.join(prefix, name));
  for (const directory of directories) await fs.mkdir(directory, { recursive: true });
  for (const name of ['codex', 'claude']) {
    const blocked = await file(path.join(directories[0], name), fixtureScript);
    await fs.chmod(blocked, 0o644);
    await fs.mkdir(path.join(directories[1], name));
    await fs.symlink('missing-target', path.join(directories[2], name));
    const executable = await posixExecutable(path.join(directories[3], name));
    const env = { PATH: directories.join(path.delimiter) };
    assert.equal(resolveExecutable(name, { env, home: prefix }), executable);
    const variable = `COUNCIL_${name.toUpperCase()}_BIN`;
    assert.throws(() => resolveExecutable(name, { env: { ...env, [variable]: blocked }, home: prefix }), new RegExp(`${variable} does not resolve`));
    const override = await posixExecutable(path.join(prefix, 'chosen version', name));
    assert.equal(resolveExecutable(name, { env: { ...env, [variable]: override }, home: prefix }), override);
    assert.deepEqual(launchFixture(executable, ['argument with spaces', 'literal;$()']), { fixture: true, args: ['argument with spaces', 'literal;$()'] });
  }
});

test('POSIX npm-style relative symlinks launch executable Node shebangs', posixOnly, async () => {
  const prefix = await fs.mkdtemp(path.join(root, 'posix npm with spaces-'));
  const packageRoot = path.join(prefix, 'lib', 'node_modules', '@openai', 'codex');
  await file(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@openai/codex', type: 'module', bin: { codex: 'bin/codex.js' } }));
  const executable = await posixExecutable(path.join(packageRoot, 'bin', 'codex.js'));
  const bin = path.join(prefix, 'bin');
  await fs.mkdir(bin);
  const link = path.join(bin, 'codex');
  await fs.symlink(path.relative(bin, executable), link);
  const resolved = resolveExecutable('codex', { env: { PATH: bin }, home: prefix });
  assert.equal(resolved, executable);
  assert.equal(resolveExecutable('codex', { env: { COUNCIL_CODEX_BIN: link }, home: prefix }), executable);
  assert.deepEqual(launchFixture(resolved, ['--fixture', 'value with spaces']), { fixture: true, args: ['--fixture', 'value with spaces'] });
});

test('POSIX Homebrew-style links and native Claude home fallback launch a native executable', posixOnly, async () => {
  const prefix = await fs.mkdtemp(path.join(root, 'posix native with spaces-'));
  const native = await fs.realpath(process.execPath);
  const cellar = path.join(prefix, 'Cellar', 'claude', 'fixture', 'bin');
  const bin = path.join(prefix, 'bin');
  await fs.mkdir(cellar, { recursive: true });
  await fs.mkdir(bin);
  await fs.symlink(native, path.join(cellar, 'claude'));
  await fs.symlink(path.relative(bin, path.join(cellar, 'claude')), path.join(bin, 'claude'));
  assert.equal(resolveExecutable('claude', { env: { PATH: bin }, home: prefix }), native);
  const localBin = path.join(prefix, '.local', 'bin');
  await fs.mkdir(localBin, { recursive: true });
  await fs.symlink(native, path.join(localBin, 'claude'));
  const resolved = resolveExecutable('claude', { env: { PATH: '' }, home: prefix });
  assert.equal(resolved, native);
  assert.deepEqual(launchFixture(resolved, ['-e', 'console.log(JSON.stringify({fixture: true}))']), { fixture: true });
});

test('POSIX discovery deduplicates relative symlink targets while preserving candidate order', posixOnly, async () => {
  const home = await fs.mkdtemp(path.join(root, 'posix-candidate-links-'));
  const bins = ['first', 'alias', 'later', path.join('.local', 'bin')].map(name => path.join(home, name));
  for (const bin of bins) await fs.mkdir(bin, { recursive: true });
  for (const provider of ['codex', 'claude']) {
    const first = await posixExecutable(path.join(home, 'versions', `first-${provider}`));
    const later = await posixExecutable(path.join(bins[2], provider));
    for (const bin of [bins[0], bins[1], bins[3]]) {
      await fs.symlink(path.relative(bin, first), path.join(bin, provider));
    }
    const options = { home, env: { PATH: [...bins, bins[0]].join(path.delimiter) } };
    assert.deepEqual(discoverExecutables(provider, options), [first, later]);
    assert.equal(resolveExecutable(provider, options), first);
    assert.deepEqual(discoverExecutables(provider, {
      ...options, env: { ...options.env, [`COUNCIL_${provider.toUpperCase()}_BIN`]: path.join(bins[1], provider) },
    }), [first]);
  }
});

const features = names => names.map(name => `${name}    stable    true`).join('\n');
const oldFeatures = CODEX_DISABLED_FEATURES.filter(name => name !== 'view_image');
const codexHelp = '--ignore-user-config --output-schema --sandbox --ephemeral --disable --skip-git-repo-check --json --color';
const claudeHelp = '--safe-mode --tools --permission-mode --strict-mcp-config --mcp-config --disable-slash-commands --json-schema --no-session-persistence --output-format --verbose';
function fakeProbe({ help = codexHelp, featureOutput = features(CODEX_DISABLED_FEATURES), featureCode = 0, helpCode = 0, authCode = 0, auth = 'Logged in using ChatGPT', provider = 'codex', env = {} } = {}) {
  const calls = [];
  return {
    calls, env, resolve: name => { assert.equal(name, provider); return '/fake/native-executable'; },
    run: async (executable, args, options) => {
      assert.equal(executable, '/fake/native-executable');
      assert.equal(options.timeoutMs, 15000);
      assert.equal(options.peer, true, 'Preflight must use the same peer environment as a model invocation');
      assert.equal(options.env, env, 'Diagnostics and metadata commands must receive the same environment');
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

const metadataCommands = provider => provider === 'codex'
  ? ['--version', 'exec --help', 'features list'] : ['--version', '--help'];
const authCommand = provider => provider === 'codex' ? 'login status' : 'auth status';
const candidateCalls = (executable, commands) => commands.map(command => ({ executable, command }));
const candidateSummary = checks => checks.map(({ executable, version, setup_status, reason }) => ({
  executable, version, setup_status, reason,
}));
function candidateProbe(provider, candidates) {
  const calls = [];
  const env = {};
  return {
    calls, env,
    discover: name => { assert.equal(name, provider); return candidates.map(candidate => candidate.executable); },
    run: async (executable, args, options) => {
      const command = args.join(' ');
      calls.push({ executable, command });
      assert.deepEqual(options, { cwd: root, timeoutMs: 15000, peer: true, env });
      const candidate = candidates.find(value => value.executable === executable);
      assert.ok(candidate, `Unknown candidate: ${executable}`);
      assert.ok([...metadataCommands(provider), authCommand(provider)].includes(command), `Unexpected model command: ${command}`);
      if (candidate.failCommand === command) {
        if (candidate.failMode === 'exit') return { code: 1, stdout: 'private-command-output', stderr: 'private-error-output' };
        throw new Error('private-credential; usage_limit_reached; please /login');
      }
      let stdout;
      if (command === '--version') stdout = candidate.version;
      else if (command.endsWith('--help')) stdout = candidate.help ?? (provider === 'codex' ? codexHelp : claudeHelp);
      else if (command === 'features list') stdout = candidate.featureOutput ?? features(CODEX_DISABLED_FEATURES);
      else stdout = candidate.auth ?? (provider === 'codex' ? 'Logged in using ChatGPT' : '{"loggedIn":true,"authMethod":"claude.ai"}');
      return { code: command === authCommand(provider) ? (candidate.authCode ?? 0) : 0, stdout, stderr: '' };
    },
  };
}

test('Codex preflight skips an older Windows npm binary and selects a compatible native PATH installation', async () => {
  const npm = await npmFixture('old-npm-preflight');
  const native = await file(path.join(root, 'new-native-preflight', 'codex.exe'));
  const options = windowsOptions(`${npm.prefix};${path.dirname(native)}`);
  const fixture = candidateProbe('codex', [
    { executable: npm.executable, version: 'codex-cli 0.146.0', featureOutput: features(oldFeatures) },
    { executable: native, version: 'codex-cli 0.160.1' },
  ]);
  fixture.discover = provider => discoverExecutables(provider, options);
  assert.equal(resolveExecutable('codex', options), npm.executable, 'Legacy path resolution still returns the first installed binary');
  const result = await probeProvider('codex', root, fixture);
  assert.equal(result.executable, native);
  assert.equal(result.version, 'codex-cli 0.160.1');
  assert.equal(result.setup_status, 'ready');
  assert.deepEqual(candidateSummary(result.candidate_checks), [
    { executable: npm.executable, version: 'codex-cli 0.146.0', setup_status: 'incompatible', reason: 'cli_incompatible' },
    { executable: native, version: 'codex-cli 0.160.1', setup_status: 'ready', reason: undefined },
  ]);
  assert.deepEqual(fixture.calls, [
    ...candidateCalls(npm.executable, metadataCommands('codex')),
    ...candidateCalls(native, [...metadataCommands('codex'), authCommand('codex')]),
  ]);
  assert.deepEqual(result.disabled_features, CODEX_DISABLED_FEATURES);
});

test('both providers stop at the first compatible candidate without probing later installs', async () => {
  for (const provider of ['codex', 'claude']) {
    const help = provider === 'codex' ? codexHelp.replace('--ignore-user-config', '') : claudeHelp.replace('--safe-mode', '');
    const candidates = [
      { executable: `/fixture/${provider}/old`, version: 'old-version', help },
      { executable: `/fixture/${provider}/ready`, version: 'ready-version' },
      { executable: `/fixture/${provider}/later`, version: 'later-version' },
    ];
    const fixture = candidateProbe(provider, candidates);
    const result = await probeProvider(provider, root, fixture);
    assert.equal(result.executable, candidates[1].executable);
    assert.equal(result.setup_status, 'ready');
    assert.deepEqual(candidateSummary(result.candidate_checks), [
      { executable: candidates[0].executable, version: 'old-version', setup_status: 'incompatible', reason: 'cli_incompatible' },
      { executable: candidates[1].executable, version: 'ready-version', setup_status: 'ready', reason: undefined },
    ]);
    assert.deepEqual(fixture.calls, [
      ...candidateCalls(candidates[0].executable, metadataCommands(provider).slice(0, 2)),
      ...candidateCalls(candidates[1].executable, [...metadataCommands(provider), authCommand(provider)]),
    ]);
  }
});

test('an incompatible explicit override remains authoritative for both providers', async () => {
  const npm = await npmFixture('incompatible-override');
  for (const provider of ['codex', 'claude']) {
    const selected = provider === 'codex' ? npm.executable : await file(path.join(root, 'override-selected', 'claude.exe'));
    const other = await file(path.join(root, 'override-alternative', `${provider}.exe`));
    const override = provider === 'codex' ? npm.shim : selected;
    const options = { ...windowsOptions(path.dirname(other)), env: { PATH: path.dirname(other), [`COUNCIL_${provider.toUpperCase()}_BIN`]: override } };
    const fixture = candidateProbe(provider, [
      { executable: selected, version: 'explicit-old-version', help: '' },
      { executable: other, version: 'compatible-alternative' },
    ]);
    fixture.discover = name => discoverExecutables(name, options);
    assert.deepEqual(fixture.discover(provider), [selected]);
    await assert.rejects(() => probeProvider(provider, root, fixture), error => {
      assert.equal(error.reason, 'cli_incompatible');
      assert.equal(error.executable, selected);
      assert.equal(error.version, 'explicit-old-version');
      assert.deepEqual(candidateSummary(error.candidate_checks), [
        { executable: selected, version: 'explicit-old-version', setup_status: 'incompatible', reason: 'cli_incompatible' },
      ]);
      return true;
    });
    assert.deepEqual(fixture.calls, candidateCalls(selected, metadataCommands(provider).slice(0, 2)));
  }
});

test('legacy injected resolve remains authoritative even when discovery is also supplied', async () => {
  for (const provider of ['codex', 'claude']) {
    const fixture = fakeProbe(provider === 'codex' ? {} : { provider, help: claudeHelp, auth: '{"loggedIn":true}' });
    let discoveries = 0;
    fixture.discover = () => { discoveries++; throw new Error('Injected resolve must take precedence'); };
    const result = await probeProvider(provider, root, fixture);
    assert.equal(discoveries, 0);
    assert.equal(result.executable, '/fake/native-executable');
    assert.equal(result.candidate_checks.length, 1);
    assert.equal(result.candidate_checks[0].setup_status, 'ready');
  }
});

test('metadata execution failures stop candidate selection and preserve known diagnostics', async () => {
  for (const provider of ['codex', 'claude']) {
    for (const command of metadataCommands(provider)) {
      for (const failMode of ['throw', 'exit']) {
        const first = { executable: `/fixture/${provider}/failed-check`, version: 'known-version', failCommand: command, failMode };
        const fixture = candidateProbe(provider, [first, { executable: `/fixture/${provider}/other-account`, version: 'later-version' }]);
        await assert.rejects(() => probeProvider(provider, root, fixture), error => {
          assert.equal(error.reason, 'cli_check_failed');
          assert.equal(error.executable, first.executable);
          assert.equal(error.version, command === '--version' ? undefined : first.version);
          assert.deepEqual(candidateSummary(error.candidate_checks), [{
            executable: first.executable, version: error.version, setup_status: 'unavailable', reason: 'cli_check_failed',
          }]);
          assert.doesNotMatch(`${error.message}\n${JSON.stringify(error)}`, /private-|usage_limit_reached/);
          return true;
        });
        assert.deepEqual(fixture.calls, candidateCalls(first.executable, metadataCommands(provider).slice(0, metadataCommands(provider).indexOf(command) + 1)));
      }
    }
  }
});

test('unavailable authentication never probes another installed candidate or exposes account details', async () => {
  for (const provider of ['codex', 'claude']) {
    const signedOut = provider === 'codex' ? 'Not logged in; private-account@example.invalid' : '{"loggedIn":false,"email":"private-account@example.invalid","accessToken":"private-credential"}';
    for (const authFailure of [
      { auth: signedOut },
      { authCode: 1, auth: signedOut },
      { failCommand: authCommand(provider) },
    ]) {
      const first = { executable: `/fixture/${provider}/signed-out`, version: 'first-version', ...authFailure };
      const fixture = candidateProbe(provider, [first, { executable: `/fixture/${provider}/other-account`, version: 'later-version' }]);
      const result = await probeProvider(provider, root, fixture);
      assert.equal(result.executable, first.executable);
      assert.equal(result.setup_status, 'unavailable');
      assert.equal(result.authenticated, false);
      assert.equal(result.reason, 'login_unavailable');
      assert.deepEqual(candidateSummary(result.candidate_checks), [{
        executable: first.executable, version: first.version, setup_status: 'unavailable', reason: 'login_unavailable',
      }]);
      assert.doesNotMatch(JSON.stringify(result), /private-|usage_limit_reached/);
      assert.deepEqual(fixture.calls, candidateCalls(first.executable, [...metadataCommands(provider), authCommand(provider)]));
    }
  }
});

test('all incompatible candidates fail with ordered versioned diagnostics and no authentication or model calls', async () => {
  for (const provider of ['codex', 'claude']) {
    const first = { executable: `/fixture/${provider}/old-a`, version: 'old-version-a', help: 'private-help-output' };
    const second = { executable: `/fixture/${provider}/old-b`, version: 'old-version-b',
      ...(provider === 'codex' ? { featureOutput: `${features(oldFeatures)}\nprivate-feature-output` } : { help: `${claudeHelp.replace('--safe-mode', '')}\nprivate-help-output` }),
    };
    const fixture = candidateProbe(provider, [first, second]);
    await assert.rejects(() => probeProvider(provider, root, fixture), error => {
      assert.equal(error.reason, 'cli_incompatible');
      assert.equal(error.executable, second.executable);
      assert.equal(error.version, second.version);
      assert.deepEqual(candidateSummary(error.candidate_checks), [first, second].map(({ executable, version }) => ({
        executable, version, setup_status: 'incompatible', reason: 'cli_incompatible',
      })));
      assert.match(error.message, /safety controls cannot be relaxed/);
      assert.doesNotMatch(`${error.message}\n${JSON.stringify(error)}`, /private-/);
      return true;
    });
    assert.deepEqual(fixture.calls, [
      ...candidateCalls(first.executable, metadataCommands(provider).slice(0, 2)),
      ...candidateCalls(second.executable, metadataCommands(provider)),
    ]);
  }
});

test('compatible Codex preflight preserves required restrictions without model calls', async () => {
  const fixture = fakeProbe();
  const result = await probeProvider('codex', root, fixture);
  assert.equal(result.authenticated, true);
  assert.equal(result.setup_status, 'ready');
  assert.equal(result.reason, undefined);
  assert.equal(result.version, 'codex-cli 0.160.1');
  assert.equal(result.billing_check, 'not_checked');
  assert.equal(result.included_allowance_verified, false);
  assert.match(result.billing_note, /does not attest included allowance.*billing or overage/);
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
  await assert.rejects(() => probeProvider('codex', root, fixture), error => {
    assert.equal(error.reason, 'cli_incompatible');
    assert.match(error.message, /required view_image feature control.*safety controls cannot be relaxed/);
    assert.match(error.message, /Setup is optional/);
    return true;
  });
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
    const result = await probeProvider('codex', root, fakeProbe(options));
    assert.equal(result.authenticated, false);
    assert.equal(result.setup_status, 'unavailable');
    assert.equal(result.reason, 'login_unavailable');
    assert.match(result.guidance, /Setup is optional/);
  }
});

test('unavailable metadata and login checks keep static setup reasons without exposing errors', async () => {
  for (const provider of ['codex', 'claude']) {
    const options = provider === 'codex' ? {} : { provider, help: claudeHelp, auth: '{"loggedIn":true}' };
    for (const blocked of ['--version', provider === 'codex' ? 'exec --help' : '--help', provider === 'codex' ? 'login status' : 'auth status']) {
      const fixture = fakeProbe(options);
      const run = fixture.run;
      fixture.run = async (executable, args, options) => {
        if (args.join(' ') === blocked) throw new Error('private-secret; usage_limit_reached; please /login');
        return run(executable, args, options);
      };
      if (blocked.endsWith('status')) {
        const result = await probeProvider(provider, root, fixture);
        assert.equal(result.authenticated, false);
        assert.equal(result.reason, 'login_unavailable');
        assert.doesNotMatch(JSON.stringify(result), /private-secret|usage_limit_reached/);
      } else {
        await assert.rejects(() => probeProvider(provider, root, fixture), error => {
          assert.equal(error.reason, 'cli_check_failed');
          assert.match(error.message, /could not complete.*Setup is optional/);
          assert.doesNotMatch(error.message, /private-secret|usage_limit_reached|authentication_error/);
          return true;
        });
      }
    }
  }
});

test('explicit effort labels are validated without substituting levels or enabling workflows', () => {
  for (const provider of ['codex', 'claude']) {
    for (const value of EFFORT_LEVELS[provider]) assert.equal(validateEffort(provider, value), value);
    for (const value of ['', 'HIGH', ' high ', 'auto', 'ultracode', 1, {}, ['high'], 'high"\nfoo=true']) {
      assert.throws(() => validateEffort(provider, value), /Unsupported .* effort/);
    }
    assert.equal(validateEffort(provider), null);
    assert.equal(validateEffort(provider, null), null);
  }
  for (const value of ['none', 'minimal', 'ultra']) assert.throws(() => validateEffort('claude', value), /Unsupported claude effort/);
});

test('explicit Codex effort is a config override and preserves worker restrictions', () => {
  for (const effort of EFFORT_LEVELS.codex) {
    const args = buildCodexArgs({ schemaPath: 'schema.json', model: 'gpt-6-astra', effort });
    assert.ok(args.includes('--ignore-user-config'));
    assert.ok(args.includes('approval_policy="never"'));
    assert.ok(args.includes('web_search="disabled"'));
    assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
    assert.ok(args.includes(`model_reasoning_effort="${effort}"`));
    assert.equal(args.at(-1), '-');
  }
  assert.equal(buildCodexArgs({ schemaPath: 'schema.json' }).some(arg => arg.startsWith('model_reasoning_effort=')), false);
});

test('explicit Claude effort changes only its child effort environment with Windows case handling', () => {
  const inherited = { CLAUDE_CODE_EFFORT_LEVEL: 'low', claude_code_effort_level: 'medium', ANTHROPIC_AUTH_TOKEN: 'fake-private-token', ANTHROPIC_MODEL: 'selected-model', UNRELATED: 'keep' };
  const original = { ...inherited };
  const windows = workerEnvironment('claude', 'xhigh', inherited, 'win32');
  assert.deepEqual(windows, { CLAUDE_CODE_EFFORT_LEVEL: 'xhigh', ANTHROPIC_AUTH_TOKEN: 'fake-private-token', ANTHROPIC_MODEL: 'selected-model', UNRELATED: 'keep' });
  const posix = workerEnvironment('claude', 'max', inherited, 'linux');
  assert.equal(posix.CLAUDE_CODE_EFFORT_LEVEL, 'max');
  assert.equal(posix.claude_code_effort_level, 'medium');
  assert.deepEqual(workerEnvironment('claude', null, inherited, 'win32'), inherited);
  assert.deepEqual(workerEnvironment('codex', 'high', inherited, 'win32'), inherited);
  assert.deepEqual(inherited, original);
});

test('explicit Claude effort rejects unsupported flags or advertised choices before identity and auth checks', async () => {
  for (const extra of ['', '\n --effort-unsupported <level>', '\n --no-effort <level>', '\n --effort <level> (choices: "low", "medium", "high")']) {
    const fixture = fakeProbe({ provider: 'claude', help: claudeHelp + extra, auth: '{"loggedIn":true}' });
    await assert.rejects(() => probeProvider('claude', root, { ...fixture, effort: 'xhigh', identityCheck: async () => assert.fail('Effort rejection must precede identity check') }), error => {
      assert.equal(error.reason, 'cli_incompatible');
      assert.match(error.message, /requested --effort xhigh/);
      return true;
    });
    assert.deepEqual(fixture.calls, [['--version'], ['--help']]);
  }
});

test('explicit Claude effort capability uses only local help and omission stays compatible', async () => {
  for (const extra of ['\n --effort <level> Choose the session effort', '\n --effort <level> (choices: "low", "medium", "high", "xhigh", "max")']) {
    const fixture = fakeProbe({ provider: 'claude', help: claudeHelp + extra, auth: '{"loggedIn":true}' });
    const result = await probeProvider('claude', root, { ...fixture, effort: 'xhigh', identityCheck: async () => {} });
    assert.equal(result.claude_effort, true);
    assert.deepEqual(result.claude_effort_levels, extra.includes('choices:') ? EFFORT_LEVELS.claude : null);
    assert.deepEqual(fixture.calls, [['--version'], ['--help'], ['auth', 'status']]);
  }
  const legacy = fakeProbe({ provider: 'claude', help: claudeHelp, auth: '{"loggedIn":true}' });
  assert.equal((await probeProvider('claude', root, { ...legacy, identityCheck: async () => {} })).claude_effort, false);
});

test('explicit effort capability belongs to the selected compatible Claude candidate', async () => {
  const fixture = candidateProbe('claude', [
    { executable: '/fixture/old', version: 'old', help: claudeHelp },
    { executable: '/fixture/current', version: 'current', help: `${claudeHelp}\n --effort <level> (choices: "low", "medium", "high", "xhigh", "max")` },
  ]);
  const info = await probeProvider('claude', root, { ...fixture, effort: 'max', identityCheck: async () => {} });
  assert.equal(info.executable, '/fixture/current');
  assert.equal(info.claude_effort, true);
  assert.deepEqual(fixture.calls.map(call => call.command), ['--version', '--help', '--version', '--help', 'auth status']);
});

test('Claude preflight validates flags and successful authentication status without feature probing', async () => {
  const options = { provider: 'claude', help: claudeHelp, auth: '{"loggedIn":true}' };
  const fixture = fakeProbe(options);
  assert.equal((await probeProvider('claude', root, fixture)).authenticated, true);
  assert.deepEqual(fixture.calls, [['--version'], ['--help'], ['auth', 'status']]);
  assert.equal((await probeProvider('claude', root, fakeProbe({ ...options, authCode: 1 }))).authenticated, false);
  await assert.rejects(() => probeProvider('claude', root, fakeProbe({ ...options, help: claudeHelp.replace('--safe-mode', '') })), /required --safe-mode/);
});

test('optional Claude partial streaming is detected from exact help flags without extra commands', async () => {
  for (const [extra, expected] of [
    ['', false], ['\n  --include-partial-messages  Include partial streaming events', true],
    [' --include-partial-messages,', true], [' --include-partial-messages-unsupported', false],
    [' --no-include-partial-messages', false],
  ]) {
    const fixture = fakeProbe({ provider: 'claude', help: claudeHelp + extra, auth: '{"loggedIn":true}' });
    const result = await probeProvider('claude', root, fixture);
    assert.equal(result.claude_partial_messages, expected, extra);
    assert.equal(result.setup_status, 'ready');
    assert.deepEqual(fixture.calls, [['--version'], ['--help'], ['auth', 'status']]);
  }
  const codex = await probeProvider('codex', root, fakeProbe({ help: `${codexHelp} --include-partial-messages` }));
  assert.equal(Object.hasOwn(codex, 'claude_partial_messages'), false);
});

test('partial streaming capability comes only from the selected compatible Claude candidate', async () => {
  const candidates = [
    { executable: '/fixture/claude/old', version: 'old', help: `${claudeHelp.replace('--safe-mode', '')} --include-partial-messages` },
    { executable: '/fixture/claude/selected', version: 'selected', help: claudeHelp },
    { executable: '/fixture/claude/later', version: 'later', help: `${claudeHelp} --include-partial-messages` },
  ];
  const fixture = candidateProbe('claude', candidates);
  const result = await probeProvider('claude', root, fixture);
  assert.equal(result.executable, candidates[1].executable);
  assert.equal(result.claude_partial_messages, false, 'Missing optional support does not select a different binary');
  assert.deepEqual(fixture.calls, [
    ...candidateCalls(candidates[0].executable, metadataCommands('claude')),
    ...candidateCalls(candidates[1].executable, [...metadataCommands('claude'), authCommand('claude')]),
  ]);
});

test('authentication metadata distinguishes local credential status from request validation and excludes private fields', async () => {
  for (const method of ['claude.ai', 'oauth_token', 'api_key', 'api_key_helper', 'third_party', 'unsupported-private-value']) {
    const fixture = fakeProbe({ provider: 'claude', help: claudeHelp, auth: JSON.stringify({
      loggedIn: true, authMethod: method, email: 'private-account@example.invalid', orgId: 'private-org-id',
      accessToken: 'private-auth-value', configDirectory: '/private-config-directory',
    }) });
    const result = await probeProvider('claude', root, fixture);
    assert.equal(result.authenticated, true);
    assert.equal(result.authentication_check, 'local_status_only');
    assert.equal(result.request_auth_verified, false);
    assert.equal(result.billing_check, 'not_checked');
    assert.equal(result.included_allowance_verified, false);
    assert.match(result.billing_note, /does not attest included allowance.*billing or overage/);
    assert.equal(result.auth_method, method === 'unsupported-private-value' ? 'unknown' : method);
    assert.match(result.authentication_note, /does not validate token freshness/);
    assert.doesNotMatch(JSON.stringify(result), /private-/);
  }
  for (const auth of ['not-json', 'null', '{}', '{"loggedIn":"true"}', '{"loggedIn":false}']) {
    const result = await probeProvider('claude', root, fakeProbe({ provider: 'claude', help: claudeHelp, auth }));
    assert.equal(result.authenticated, false);
    assert.equal(result.reason, 'login_unavailable');
    assert.equal(result.request_auth_verified, false);
  }
});

test('Codex authentication route is sanitized metadata and never quota or overage proof', async () => {
  for (const [auth, expectedMethod, expectedRoute] of [
    ['Logged in using ChatGPT', 'chatgpt', 'subscription'],
    ['Logged in with ChatGPT', 'chatgpt', 'subscription'],
    ['Logged in using an API key - private-key-value', 'api_key', 'metered'],
    ['Logged in with API key: private-key-value', 'api_key', 'metered'],
    ['Logged in using unrecognized-private-method', 'unknown', 'unknown'],
  ]) {
    const fixture = fakeProbe({ auth });
    const result = await probeProvider('codex', root, fixture);
    assert.equal(result.authenticated, true);
    assert.equal(result.setup_status, 'ready');
    assert.equal(result.auth_method, expectedMethod);
    assert.equal(result.auth_route, expectedRoute);
    assert.equal(result.quota_status, 'unknown');
    assert.equal(result.overage_status, 'unknown');
    assert.equal(result.billing_check, 'not_checked');
    assert.equal(result.included_allowance_verified, false);
    assert.match(result.billing_note, /Not checked means unknown, not a provider failure/);
    assert.deepEqual(result.route_environment_overrides, []);
    assert.doesNotMatch(JSON.stringify(result), /private-/);
    assert.deepEqual(fixture.calls, [['--version'], ['exec', '--help'], ['features', 'list'], ['login', 'status']]);
  }
});

test('Claude subscription metadata is allowlisted and routing stays separate from entitlement', async () => {
  for (const subscriptionType of ['free', 'pro', 'max', 'team', 'enterprise', 'private-plan-value']) {
    const result = await probeProvider('claude', root, fakeProbe({ provider: 'claude', help: claudeHelp,
      auth: JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType,
        email: 'private-account', accessToken: 'private-token', orgId: 'private-org' }),
    }));
    assert.equal(result.auth_route, 'subscription');
    assert.equal(result.subscription_type, subscriptionType.startsWith('private-') ? 'unknown' : subscriptionType);
    assert.equal(result.quota_status, 'unknown');
    assert.equal(result.overage_status, 'unknown');
    assert.equal(result.included_allowance_verified, false);
    assert.doesNotMatch(JSON.stringify(result), /private-/);
  }
  for (const [authMethod, apiProvider, expectedRoute] of [
    ['api_key', 'firstParty', 'metered'], ['api_key_helper', 'firstParty', 'metered'],
    ['oauth_token', 'firstParty', 'unknown'], ['third_party', 'private-provider', 'unknown'],
    ['claude.ai', 'private-provider', 'unknown'],
  ]) {
    const result = await probeProvider('claude', root, fakeProbe({ provider: 'claude', help: claudeHelp,
      auth: JSON.stringify({ loggedIn: true, authMethod, apiProvider }),
    }));
    assert.equal(result.auth_route, expectedRoute);
    assert.equal(result.setup_status, 'ready');
    assert.doesNotMatch(JSON.stringify(result), /private-provider/);
  }
});

test('inherited credential and provider overrides prevent an unsupported subscription-route claim without exposing values', async () => {
  const names = {
    codex: ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'CODEX_BASE_URL', 'CODEX_API_BASE_URL'],
    claude: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_BASE_URL',
      'ANTHROPIC_PROFILE', 'ANTHROPIC_FEDERATION_RULE_ID', 'ANTHROPIC_ORGANIZATION_ID',
      'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
      'CLAUDE_CODE_USE_ANTHROPIC_AWS', 'CLAUDE_CODE_USE_MANTLE'],
  };
  for (const provider of ['codex', 'claude']) {
    for (const name of names[provider]) {
      const fixture = fakeProbe({ provider, env: { [name]: 'private-override-value', PRIVATE_UNRELATED: 'private-other-value' },
        ...(provider === 'claude' ? { help: claudeHelp, auth: '{"loggedIn":true,"authMethod":"claude.ai"}' } : {}),
      });
      const result = await probeProvider(provider, root, fixture);
      assert.equal(result.authenticated, true);
      assert.equal(result.setup_status, 'ready');
      assert.equal(result.auth_route, 'unknown');
      assert.deepEqual(result.route_environment_overrides, [name]);
      assert.equal(result.billing_check, 'not_checked');
      assert.doesNotMatch(JSON.stringify(result), /private-|PRIVATE_UNRELATED/);
    }
  }
});

test('route diagnostics respect Windows environment casing and ignore disabled or irrelevant selectors', async () => {
  const fixture = fakeProbe({ provider: 'claude', help: claudeHelp, auth: '{"loggedIn":true,"authMethod":"claude.ai"}',
    env: { anthropic_api_key: 'private-value', CLAUDE_CODE_USE_VERTEX: 'false', CLAUDE_CODE_USE_FOUNDRY: '0',
      ANTHROPIC_AUTH_TOKEN: '', CLAUDECODE: '1', DISABLE_EXTRA_USAGE_COMMAND: '1' },
  });
  const windows = await probeProvider('claude', root, { ...fixture, platform: 'win32' });
  assert.deepEqual(windows.route_environment_overrides, ['ANTHROPIC_API_KEY']);
  assert.equal(windows.auth_route, 'unknown');
  assert.doesNotMatch(JSON.stringify(windows), /private-value/);
  const posix = await probeProvider('claude', root, { ...fixture, platform: 'linux' });
  assert.deepEqual(posix.route_environment_overrides, []);
  assert.equal(posix.auth_route, 'subscription');
  assert.equal(posix.overage_status, 'unknown', 'Hiding a billing command does not disable paid overflow');
});

test('failed authentication cannot retain stale subscription or route eligibility', async () => {
  for (const provider of ['codex', 'claude']) {
    const fixture = fakeProbe({ provider, authCode: 1,
      ...(provider === 'claude'
        ? { help: claudeHelp, auth: '{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"max"}' }
        : { auth: 'Logged in using ChatGPT' }),
    });
    const result = await probeProvider(provider, root, fixture);
    assert.equal(result.authenticated, false);
    assert.equal(result.setup_status, 'unavailable');
    assert.equal(result.reason, 'login_unavailable');
    assert.equal(result.auth_route, 'unknown');
    assert.equal(result.quota_status, 'unknown');
    assert.equal(result.overage_status, 'unknown');
    if (provider === 'claude') assert.equal(result.subscription_type, 'unknown');
  }
});

test('authentication failures use static guidance for failed envelopes and nonzero stderr only', () => {
  const cases = [
    ['claude', { code: 1, stdout: JSON.stringify({ type: 'result', is_error: true, result: 'OAuth token has expired. private-secret' }) }],
    ['claude', { code: 0, stdout: [ { type: 'system', subtype: 'init' }, { type: 'result', subtype: 'error_during_execution', errors: ['Login expired · Please run /login'] } ].map(JSON.stringify).join('\n') }],
    ['claude', { code: 1, stdout: JSON.stringify({ type: 'assistant', error: 'authentication_failed', message: { content: [{ type: 'text', text: 'private-secret' }] } }) }],
    ['codex', { code: 0, stdout: JSON.stringify({ type: 'turn.failed', error: { message: 'Your refresh token was already used. private-secret' } }) }],
    ['codex', { code: 1, stdout: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'private-secret' } }) }],
    ['codex', { code: 1, stdout: JSON.stringify({ type: 'error', status: 401, message: 'private-secret' }) }],
    ['codex', { code: 1, stderr: 'API Error: 401 Unauthorized; private-secret' }],
    ['claude', { code: 2, stderr: 'Invalid API key private-secret' }],
  ];
  for (const [provider, failure] of cases) {
    const diagnostic = peerAuthenticationFailure(provider, failure);
    assert.equal(diagnostic?.reason, 'authentication_error');
    assert.match(diagnostic.message, /No peer terminal or app needs to stay open/);
    assert.match(diagnostic.message, /No automatic retry/);
    assert.match(diagnostic.message, /Credential renewal is optional and only when requested/);
    assert.match(diagnostic.message, /Continue provisionally in the current chat within authorized limits/);
    assert.match(diagnostic.message, provider === 'claude' ? /claude auth login/ : /codex login/);
    assert.doesNotMatch(JSON.stringify(diagnostic), /private-secret/);
  }
});

test('authentication classifier ignores successful report prose and unrelated process errors', () => {
  const phrase = 'OAuth token has expired; test the authentication failed case.';
  for (const response of [
    { code: 0, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: phrase }), stderr: phrase },
    { code: 1, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: phrase }), stderr: 'Process ran out of memory' },
    { code: 0, stdout: JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: phrase } }) },
    { code: 1, stdout: phrase, stderr: '' },
    { code: 1, stdout: JSON.stringify({ type: 'turn.failed', error: { message: 'Too many requests', status: 429 } }) },
    { code: 1, stdout: JSON.stringify({ type: 'error', error: { message: 'Permission denied', status: 403 } }) },
    { code: null, stderr: phrase },
  ]) assert.equal(peerAuthenticationFailure('claude', response), null);
});

test('explicit provider quota and payment failures return static no-paid-fallback guidance', () => {
  const cases = [
    ['claude', { code: 0, stdout: JSON.stringify({ type: 'result', is_error: true, result: 'Weekly limit reached. private-account@example.invalid' }) }],
    ['claude', { code: 0, stdout: [
      { type: 'system', subtype: 'init' },
      { type: 'assistant', error: 'rate_limit', message: { content: [{ type: 'text', text: "You've hit your limit · resets later. private-secret" }] } },
      { type: 'result', subtype: 'error_during_execution', is_error: true, errors: [] },
    ].map(JSON.stringify).join('\n') }],
    ['codex', { code: 1, stdout: JSON.stringify({ type: 'turn.failed', error: { message: 'You have reached your usage limit. private-secret' } }) }],
    ['codex', { code: 0, stdout: JSON.stringify({ type: 'error', error: { type: 'insufficient_quota', message: 'private-secret' } }) }],
    ['codex', { code: 1, stdout: JSON.stringify({ type: 'error', code: 'usage_limit_reached' }) }],
    ['claude', { code: 1, stderr: 'Your credit balance is too low. private-secret' }],
    ['codex', { code: 1, stderr: 'Payment required. private-secret' }],
    ['codex', { code: 1, stderr: 'You exceeded your current quota. private-secret' }],
    ['claude', { code: 1, stderr: 'You are out of credits. private-secret' }],
    ...[{ status: 402 }, { status_code: 402 }, { error: { status: 402 } }, { error: { status_code: 402 } }]
      .map(metadata => ['codex', { code: 0, stdout: JSON.stringify({ type: 'turn.failed', ...metadata }) }]),
  ];
  for (const [provider, response] of cases) {
    const diagnostic = peerUsageLimitFailure(provider, response);
    assert.equal(diagnostic?.reason, 'usage_limit', JSON.stringify(response));
    assert.match(diagnostic.message, /Stop calls to the blocked worker/);
    assert.match(diagnostic.message, /Do not buy or use paid credits, enable overage, switch to paid API access, change accounts or billing/);
    assert.match(diagnostic.message, /eligible distinct-model pair in the unblocked initiating provider within remaining included allowance and task caps/);
    assert.match(diagnostic.message, /never replace sealed participants or reset budgets/);
    assert.match(diagnostic.message, /solo self-critique only within the current chat's available included allowance, or checkpoint/);
    assert.match(diagnostic.message, /extend.*cannot restore provider quota/);
    assert.match(diagnostic.message, /No automatic retry/);
    assert.doesNotMatch(JSON.stringify(diagnostic), /private-/);
    assert.equal(peerAuthenticationFailure(provider, response), null);
  }
});

test('usage-limit classifier does not mistake report prose, generic rate limits, auth or timeouts for exhausted allowance', () => {
  const phrase = 'Weekly limit reached; test insufficient_quota and payment required.';
  for (const response of [
    { code: 0, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: phrase }), stderr: phrase },
    { code: 1, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: phrase }), stderr: 'Process failed' },
    { code: 0, stdout: JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: phrase } }) },
    { code: 0, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, status: 402, result: phrase }) },
    { code: 1, stdout: phrase },
    { code: 1, stdout: JSON.stringify({ type: 'turn.failed', error: { message: 'Too many requests', status: 429 } }) },
    { code: 1, stdout: JSON.stringify({ type: 'assistant', error: 'rate_limit', message: { content: [{ type: 'text', text: 'Rate limit reached; retry later.' }] } }) },
    { code: 1, stderr: 'API Error: 401 Unauthorized' },
    { code: 1, stderr: 'OAuth token has expired' },
    { code: 1, stderr: 'Request timed out' },
    { code: 1, stderr: 'Reached limit of maximum context length' },
    { code: 1, stdout: JSON.stringify({ type: 'result', subtype: 'error_max_turns', errors: ['Reached the limit of 1 turn'] }) },
    { code: null, stderr: phrase },
  ]) assert.equal(peerUsageLimitFailure('claude', response), null, JSON.stringify(response));
});
