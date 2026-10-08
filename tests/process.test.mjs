import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { processEnvironment, runProcess } from '../scripts/process.mjs';

const tempParent = await fs.realpath(os.tmpdir());
const root = await fs.mkdtemp(path.join(tempParent, 'council-process-tests-'));
after(async () => {
  const resolved = await fs.realpath(root);
  assert.equal(path.dirname(resolved), tempParent);
  assert.ok(path.basename(resolved).startsWith('council-process-tests-'));
  await fs.rm(resolved, { recursive: true, force: true });
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const node = (source, options = {}) => runProcess(process.execPath, ['-e', source], { cwd: root, ...options });
async function rejection(promise) {
  try { await promise; } catch (error) { return error; }
  assert.fail('Expected the process invocation to reject');
}
function posixProcessRunning(pid) {
  const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'stat='], {
    encoding: 'utf8', timeout: 1000,
  });
  assert.ifError(result.error);
  assert.ok(result.status === 0 || result.status === 1, `Could not inspect fixture PID ${pid}: ${result.stderr}`);
  const state = result.stdout.trim();
  // An orphan may remain a zombie until the host's reaper collects it. kill(0)
  // alone would incorrectly report that this already-terminated process runs.
  return state !== '' && !state.startsWith('Z');
}
async function assertPosixProcessStopped(pid) {
  assert.ok(Number.isInteger(pid) && pid > 0, 'The fixture must report its owned descendant PID');
  const deadline = Date.now() + 2000;
  while (posixProcessRunning(pid)) {
    assert.ok(Date.now() < deadline, `Owned descendant ${pid} is still running after process-group cleanup`);
    await pause(25);
  }
}

test('peer workers need no terminal and retain configured login context without inheriting a Claude session', async () => {
  const fixture = {
    CLAUDECODE: 'parent-session', CODEX_CLAUDE_COUNCIL_PEER: 'parent-value',
    HOME: path.join(root, 'test-home'), USERPROFILE: path.join(root, 'test-profile'),
    CODEX_HOME: path.join(root, 'test-codex'), CLAUDE_CONFIG_DIR: path.join(root, 'test-claude'),
    CLAUDE_CODE_OAUTH_TOKEN: 'synthetic-not-a-token', OPENAI_API_KEY: 'synthetic-not-a-key',
    ANTHROPIC_AUTH_TOKEN: 'synthetic-auth-token', HTTPS_PROXY: 'http://127.0.0.1:9',
  };
  const previous = Object.fromEntries(Object.keys(fixture).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, fixture);
    const source = `const expected=${JSON.stringify(fixture)};const keep=Object.keys(expected).filter(k=>!['CLAUDECODE','CODEX_CLAUDE_COUNCIL_PEER'].includes(k));console.log(JSON.stringify({stdinTTY:Boolean(process.stdin.isTTY),stdoutTTY:Boolean(process.stdout.isTTY),claudeSessionPresent:Object.hasOwn(process.env,'CLAUDECODE'),peer:process.env.CODEX_CLAUDE_COUNCIL_PEER,contextPreserved:keep.every(k=>process.env[k]===expected[k])}));`;
    const result = await node(source, { peer: true });
    assert.equal(result.code, 0);
    assert.deepEqual(JSON.parse(result.stdout), { stdinTTY: false, stdoutTTY: false, claudeSessionPresent: false, peer: '1', contextPreserved: true });
    assert.equal(process.env.CLAUDECODE, fixture.CLAUDECODE, 'launch must not mutate the coordinator environment');
    assert.equal(process.env.CODEX_CLAUDE_COUNCIL_PEER, fixture.CODEX_CLAUDE_COUNCIL_PEER);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('peer controls disable credit-only fast mode and unrelated background work without changing the parent', async () => {
  const keys = ['CLAUDE_CODE_DISABLE_FAST_MODE', 'CLAUDE_CODE_DISABLE_TERMINAL_TITLE', 'DISABLE_AUTOUPDATER'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const source = `console.log(JSON.stringify(${JSON.stringify(keys)}.map(key=>process.env[key])));`;
  try {
    for (const value of [undefined, '0']) {
      for (const key of keys) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      const result = await node(source, { peer: true });
      assert.equal(result.code, 0);
      assert.deepEqual(JSON.parse(result.stdout), ['1', '1', '1']);
      for (const key of keys) assert.equal(process.env[key], value);
    }
    const ordinary = await node(source);
    assert.deepEqual(JSON.parse(ordinary.stdout), ['0', '0', '0'], 'ordinary subprocesses keep their environment');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

function mixedCaseEnvironment() {
  return {
    CLAUDECODE: 'parent-session', claudecode: 'lower-session', ClaudeCode: 'mixed-session',
    CODEX_CLAUDE_COUNCIL_PEER: '0', codex_claude_council_peer: 'lower-peer',
    CLAUDE_CODE_DISABLE_FAST_MODE: '0', claude_code_disable_fast_mode: '0', Claude_Code_Disable_Fast_Mode: '0',
    CLAUDE_CODE_DISABLE_TERMINAL_TITLE: '0', claude_code_disable_terminal_title: '0',
    DISABLE_AUTOUPDATER: '0', disable_autoupdater: '0', Disable_Autoupdater: '0',
    ANTHROPIC_API_KEY: 'synthetic-key', OPENAI_API_KEY: 'synthetic-key', CLAUDE_CODE_OAUTH_TOKEN: 'synthetic-token',
    CLAUDE_MODEL: 'selected-model', CLAUDE_CODE_EFFORT_LEVEL: 'high',
    CODEX_HOME: 'selected-codex-home', CLAUDE_CONFIG_DIR: 'selected-claude-home', HTTPS_PROXY: 'selected-proxy',
  };
}
const controlledNames = ['CODEX_CLAUDE_COUNCIL_PEER', 'CLAUDE_CODE_DISABLE_FAST_MODE', 'CLAUDE_CODE_DISABLE_TERMINAL_TITLE', 'DISABLE_AUTOUPDATER'];

test('Windows peer environment removes every session spelling and canonicalizes only safety controls', () => {
  const inherited = mixedCaseEnvironment(), before = { ...inherited };
  const result = processEnvironment(inherited, { peer: true, platform: 'win32' });
  assert.equal(Object.keys(result).some(key => key.toUpperCase() === 'CLAUDECODE'), false);
  for (const key of controlledNames) {
    assert.deepEqual(Object.keys(result).filter(name => name.toUpperCase() === key), [key]);
    assert.equal(result[key], '1');
  }
  for (const [key, value] of Object.entries(inherited)) {
    if (key.toUpperCase() !== 'CLAUDECODE' && !controlledNames.includes(key.toUpperCase())) assert.equal(result[key], value);
  }
  assert.deepEqual(inherited, before);
  assert.deepEqual(processEnvironment(inherited, { platform: 'win32' }), before, 'ordinary subprocesses do not normalize or change inherited keys');
});

test('POSIX peer environment keeps differently cased names distinct', () => {
  const inherited = mixedCaseEnvironment(), before = { ...inherited };
  for (const platform of ['linux', 'darwin']) {
    const result = processEnvironment(inherited, { peer: true, platform });
    assert.equal(Object.hasOwn(result, 'CLAUDECODE'), false);
    for (const [key, value] of Object.entries(inherited)) {
      if (key !== 'CLAUDECODE' && !controlledNames.includes(key)) assert.equal(result[key], value);
    }
    for (const key of controlledNames) assert.equal(result[key], '1');
  }
  assert.deepEqual(inherited, before);
});

test('native Windows child receives no nested-session key or duplicate control spelling', { skip: process.platform !== 'win32' }, async () => {
  const inherited = { ...process.env, ...mixedCaseEnvironment() }, before = { ...inherited };
  const source = `const names=${JSON.stringify(['CLAUDECODE', ...controlledNames])};console.log(JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([key])=>names.includes(key.toUpperCase())))));`;
  const result = await node(source, { peer: true, env: inherited });
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), Object.fromEntries(controlledNames.map(key => [key, '1'])));
  assert.deepEqual(inherited, before);
});

test('successful calls return stdout, stderr and exit status while streaming files', async () => {
  const stdoutPath = path.join(root, 'success-stdout.txt');
  const stderrPath = path.join(root, 'success-stderr.txt');
  const result = await node("process.stdin.setEncoding('utf8');let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{process.stdout.write(s);process.stderr.write('diagnostic');});", {
    prompt: 'a prompt with Unicode: café', stdoutPath, stderrPath, peer: true,
  });
  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, 'a prompt with Unicode: café');
  assert.equal(result.stderr, 'diagnostic');
  assert.equal(await fs.readFile(stdoutPath, 'utf8'), result.stdout);
  assert.equal(await fs.readFile(stderrPath, 'utf8'), result.stderr);
  assert.equal(result.outputFiles.stdout.bytesWritten, Buffer.byteLength(result.stdout));
  assert.equal(result.termination.treeRequested, false);
  const failed = await node("process.stdout.write('before-exit');process.exitCode=7;");
  assert.equal(failed.code, 7, 'nonzero exits remain caller-owned validation');
  assert.equal(failed.stdout, 'before-exit');
});

const contentActivity = event => event.type === 'delta' && typeof event.text === 'string' && event.text.length > 0;

test('substantive streamed activity keeps an idle-guarded worker alive beyond its idle interval', async () => {
  const started = Date.now();
  const result = await node(`let n=0;const emit=()=>console.log(JSON.stringify({type:'delta',text:'part '+(++n)}));emit();const timer=setInterval(()=>{emit();if(n===5)clearInterval(timer);},500);`, {
    idleTimeoutMs: 1400, isActivity: contentActivity,
  });
  assert.equal(result.code, 0);
  assert.ok(Date.now() - started > 1800, 'Worker must continue beyond one idle interval');
  assert.equal(result.activity.idle_timeout_ms, 1400);
  assert.equal(result.activity.observed_events, 5);
  assert.ok(Number.isFinite(Date.parse(result.activity.last_activity_at)));
  assert.equal(result.termination.treeRequested, false);
});

test('idle guard stops a silent worker and retains bounded cleanup diagnostics', async () => {
  const error = await rejection(node('setTimeout(()=>{},10000);', { idleTimeoutMs: 500, isActivity: contentActivity }));
  assert.equal(error.reason, 'idle_timeout');
  assert.equal(error.activity.observed_events, 0);
  assert.equal(error.activity.last_activity_at, null);
  assert.equal(error.termination.treeRequested, true);
  assert.equal(error.termination.directExitObserved, true);
});

test('stderr, malformed JSON, primitive values and no-op events cannot extend the idle guard', async () => {
  let callbacks = 0;
  const started = Date.now();
  const error = await rejection(node(`setInterval(()=>{process.stdout.write('broken json\\n42\\n[]\\n{"type":"heartbeat"}\\n{"type":"delta","text":""}\\n');process.stderr.write('{"type":"delta","text":"diagnostic only"}\\n');},60);`, {
    idleTimeoutMs: 700, isActivity: event => { callbacks++; return contentActivity(event); },
  }));
  assert.equal(error.reason, 'idle_timeout');
  assert.equal(error.activity.observed_events, 0);
  assert.ok(callbacks > 0, 'Complete stdout objects reach the classifier');
  assert.ok(Date.now() - started < 5000, 'Diagnostic chatter must not keep the worker alive');
  assert.match(error.stderr, /diagnostic only/);
});

test('activity framing handles split UTF-8 JSONL and ignores partial or oversized lines', async () => {
  const observed = [];
  const result = await node(`const line=Buffer.from(JSON.stringify({type:'delta',text:'café'})+'\\n');const at=line.indexOf(Buffer.from('é'));process.stdout.write(line.subarray(0,at+1));setTimeout(()=>{process.stdout.write(line.subarray(at+1));process.stdout.write('x'.repeat(1024*1024+1)+'\\n');process.stdout.write(JSON.stringify({type:'delta',text:'after large line'})+'\\n');process.stdout.write(JSON.stringify({type:'delta',text:'unfinished'}));},80);`, {
    idleTimeoutMs: 1400, isActivity: event => { observed.push(event); return contentActivity(event); },
  });
  assert.equal(result.code, 0);
  assert.deepEqual(observed.map(event => event.text), ['café', 'after large line']);
  assert.equal(result.activity.observed_events, 2);
});

test('explicit hard deadline still stops a continuously active worker', async () => {
  const error = await rejection(node(`setInterval(()=>console.log(JSON.stringify({type:'delta',text:'more'})),70);`, {
    timeoutMs: 900, idleTimeoutMs: 1400, isActivity: contentActivity,
  }));
  assert.equal(error.reason, 'timeout');
  assert.ok(error.activity.observed_events > 1);
  assert.equal(error.termination.treeRequested, true);
});

test('activity observer failures stop safely and output limits still apply in idle mode', async () => {
  const failure = new Error('Synthetic classifier failure');
  const rejected = await rejection(node(`console.log('{"type":"delta","text":"content"}');setTimeout(()=>{},10000);`, {
    idleTimeoutMs: 1400, isActivity: () => { throw failure; },
  }));
  assert.equal(rejected.reason, 'activity_observer_error');
  assert.equal(rejected.cause, failure);
  assert.equal(rejected.termination.treeRequested, true);
  const oversized = await rejection(node(`process.stdout.write('x'.repeat(5*1024*1024));setTimeout(()=>{},10000);`, {
    idleTimeoutMs: 1400, isActivity: contentActivity,
  }));
  assert.equal(oversized.reason, 'output_limit');
  assert.equal(Buffer.byteLength(oversized.stdout), 4 * 1024 * 1024);
  assert.equal(oversized.activity.observed_events, 0);
});

test('idle mode requires a valid guard and classifier and cannot silently remove every timeout', async () => {
  for (const options of [{ idleTimeoutMs: 0, isActivity: contentActivity }, { idleTimeoutMs: 100 }, { timeoutMs: null }]) {
    const error = await rejection(node('process.exit(0);', options));
    assert.equal(error.reason, 'spawn_error');
    assert.equal(error.termination.treeRequested, false);
  }
});

test('timeout retains emitted diagnostics and logs are visible before settlement', async () => {
  const stdoutPath = path.join(root, 'timeout-stdout.txt');
  const stderrPath = path.join(root, 'timeout-stderr.txt');
  const timeoutMs = 3000;
  const began = Date.now();
  const pending = node("console.log('started');console.error('waiting');setTimeout(()=>{},8000);", {
    timeoutMs, stdoutPath, stderrPath,
  });
  let settled = false;
  const caught = pending.then(
    () => { settled = true; return null; },
    error => { settled = true; return error; },
  );
  try {
    let streamed = '';
    const streamingDeadline = began + timeoutMs;
    while (!settled && Date.now() < streamingDeadline) {
      streamed = await fs.readFile(stdoutPath, 'utf8');
      if (streamed.includes('started')) break;
      await pause(10);
    }
    assert.match(streamed, /started/, 'Child did not emit startup output before the streaming deadline');
    assert.equal(settled, false, 'Startup output must be observed before process settlement');
    const error = await caught;
    assert.ok(error, 'Expected the process invocation to reject');
    assert.equal(error.reason, 'timeout');
    assert.match(error.stdout, /started/);
    assert.match(error.stderr, /waiting/);
    assert.equal(await fs.readFile(stdoutPath, 'utf8'), error.stdout);
    assert.equal(await fs.readFile(stderrPath, 'utf8'), error.stderr);
    // Include the runtime's 2000 ms cleanup grace plus scheduling headroom.
    assert.ok(Date.now() - began < timeoutMs + 2500, 'timeout settlement exceeded its bounded grace');
    assert.ok(Object.hasOwn(error, 'code'));
    assert.ok(Object.hasOwn(error, 'signal'));
    assert.equal(error.termination.treeRequested, true);
  } finally {
    await caught;
  }
});

test('a timed out parent with an inheriting descendant settles with honest termination diagnostics', async () => {
  const descendant = "process.stdout.write('descendant-live\\n',()=>process.send('ready'));setTimeout(()=>{},8000);";
  const source = `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore',1,2,'ipc'],windowsHide:true});console.log(JSON.stringify({descendantPid:c.pid}));setTimeout(()=>process.exit(2),8000);`;
  const timeoutMs = 3000;
  const began = Date.now();
  let descendantPid;
  try {
    const error = await rejection(node(source, { timeoutMs }));
    const pidLine = error.stdout.split(/\r?\n/).find(line => line.startsWith('{'));
    assert.ok(pidLine, 'Parent fixture did not emit descendant PID metadata before timeout');
    descendantPid = JSON.parse(pidLine).descendantPid;
    assert.equal(error.reason, 'timeout');
    assert.match(error.stdout, /descendant-live/);
    assert.ok(Date.now() - began < timeoutMs + 2500, 'parent/descendant timeout did not settle promptly');
    assert.equal(error.termination.directExitObserved, true);
    assert.equal(error.termination.treeRequested, true);
    // A request/fallback is diagnostic evidence, not a claim that the descendant
    // died. Windows may reject taskkill in a sandbox; forced closure is allowed.
    assert.equal(typeof error.termination.pipeClosureForced, 'boolean');
  } finally {
    // Only this test's known child is targeted. The child also has a self-expiry.
    if (Number.isInteger(descendantPid)) {
      try { process.kill(descendantPid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
});

test('POSIX timeout kills the owned process group including a ready grandchild', { skip: process.platform === 'win32' }, async () => {
  const pidPath = path.join(root, 'posix-grandchild.pid');
  const descendant = "process.send('ready');setTimeout(()=>process.exit(0),10000);";
  const source = `
    const {spawn}=require('node:child_process');
    const c=spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore','ignore','ignore','ipc']});
    require('node:fs').writeFileSync(${JSON.stringify(pidPath)},String(c.pid));
    c.on('message',()=>console.log('grandchild-ready'));
    setTimeout(()=>process.exit(2),10000);
  `;
  let descendantPid;
  try {
    const error = await rejection(node(source, { timeoutMs: 3000 }));
    descendantPid = Number(await fs.readFile(pidPath, 'utf8'));
    assert.match(error.stdout, /grandchild-ready/, 'The grandchild must start before timeout cleanup');
    assert.equal(error.reason, 'timeout');
    assert.equal(error.termination.method, 'process-group');
    assert.equal(error.termination.treeRequested, true);
    assert.equal(error.termination.treeRequestSucceeded, true);
    assert.equal(error.termination.directExitObserved, true);
    await assertPosixProcessStopped(descendantPid);
  } finally {
    // Recover the owned PID even if a startup/assertion failure occurred. Both
    // fixture processes also expire independently if cleanup itself fails.
    if (!Number.isInteger(descendantPid)) {
      try { descendantPid = Number(await fs.readFile(pidPath, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (Number.isInteger(descendantPid) && descendantPid > 0 && posixProcessRunning(descendantPid)) {
      try { process.kill(descendantPid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
});

test('an exited parent cannot leave the invocation waiting indefinitely for inherited pipes', async () => {
  const descendant = "process.stdout.write('orphan-live\\n',()=>process.send('ready'));setTimeout(()=>{},8000);";
  const source = `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore',1,2,'ipc'],windowsHide:true});console.log(JSON.stringify({descendantPid:c.pid}));c.on('message',()=>process.exit(0));setTimeout(()=>process.exit(2),3000);`;
  const began = Date.now();
  let result, descendantPid;
  try {
    try { result = await node(source, { timeoutMs: 6000 }); } catch (error) { result = error; }
    descendantPid = JSON.parse(result.stdout.split(/\r?\n/).find(line => line.startsWith('{'))).descendantPid;
    assert.equal(result.code, 0);
    assert.match(result.stdout, /orphan-live/);
    assert.ok(Date.now() - began < 4000);
    if (result instanceof Error) {
      assert.equal(result.reason, 'retained_pipes');
      assert.equal(result.termination.treeRequested, process.platform !== 'win32');
      if (process.platform !== 'win32') {
        assert.equal(result.termination.method, 'process-group');
        assert.equal(result.termination.treeRequestSucceeded, true);
        await assertPosixProcessStopped(descendantPid);
      }
    } else {
      // On Windows, Node may close this inherited pipe at parent exit. That is
      // successful completion, not proof that the remaining child was killed.
      assert.equal(process.platform, 'win32');
      assert.equal(result.termination.treeRequested, false);
    }
  } finally {
    if (Number.isInteger(descendantPid)) {
      try { process.kill(descendantPid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
});

test('output limit retains at most 4 MiB across buffers and streamed files', async () => {
  const stdoutPath = path.join(root, 'limit-stdout.txt');
  const stderrPath = path.join(root, 'limit-stderr.txt');
  const error = await rejection(node("process.stderr.write('diagnostic-before-limit\\n');process.stdout.write(Buffer.alloc(5*1024*1024,120));setTimeout(()=>{},8000);", {
    stdoutPath, stderrPath, timeoutMs: 3000,
  }));
  assert.equal(error.reason, 'output_limit');
  assert.equal(error.outputTruncated, true);
  assert.equal(Buffer.byteLength(error.stdout) + Buffer.byteLength(error.stderr), 4 * 1024 * 1024);
  const stdout = await fs.readFile(stdoutPath);
  const stderr = await fs.readFile(stderrPath);
  assert.equal(stdout.length + stderr.length, 4 * 1024 * 1024);
  assert.equal(stdout.toString(), error.stdout);
  assert.equal(stderr.toString(), error.stderr);
});

test('spawn errors preserve cause and enriched empty diagnostics', async () => {
  const error = await rejection(runProcess(path.join(root, 'executable-does-not-exist'), [], { cwd: root, timeoutMs: 500 }));
  assert.equal(error.reason, 'spawn_error');
  assert.equal(error.systemCode, 'ENOENT');
  assert.equal(error.stdout, '');
  assert.equal(error.stderr, '');
  assert.equal(error.code, null);
  assert.equal(error.signal, null);
  assert.equal(error.termination.treeRequested, false);
});

test('missing output destination fails before the child is launched', async () => {
  const marker = path.join(root, 'must-not-be-created.txt');
  const error = await rejection(node(`require('node:fs').writeFileSync(${JSON.stringify(marker)},'launched')`, {
    stdoutPath: path.join(root, 'missing-parent', 'stdout.txt'), timeoutMs: 500,
  }));
  assert.equal(error.reason, 'output_file_error');
  assert.equal(error.outputFiles.stdout.opened, false);
  assert.equal(error.outputFiles.stdout.systemCode, 'ENOENT');
  assert.equal(error.code, null);
  await assert.rejects(fs.access(marker));
});

test('abort preserves already emitted output and removes listeners', async () => {
  const controller = new AbortController();
  const before = { int: process.listenerCount('SIGINT'), term: process.listenerCount('SIGTERM') };
  const stdoutPath = path.join(root, 'abort-stdout.txt');
  const pending = node("console.log('before-abort');setTimeout(()=>{},8000)", {
    timeoutMs: 6000, stdoutPath, signal: controller.signal,
  });
  const caught = rejection(pending);
  for (let i = 0; i < 50; i++) {
    if ((await fs.readFile(stdoutPath, 'utf8')).includes('before-abort')) break;
    await pause(10);
  }
  controller.abort();
  const error = await caught;
  assert.equal(error.reason, 'aborted');
  assert.match(error.stdout, /before-abort/);
  assert.equal(process.listenerCount('SIGINT'), before.int);
  assert.equal(process.listenerCount('SIGTERM'), before.term);
});

test('a streaming write failure retains in-memory output and stops the child', async () => {
  const originalWrite = syncFs.writeSync;
  const stdoutPath = path.join(root, 'failed-stream.txt');
  let error;
  try {
    // Inject a disk write error while still exercising a real child process.
    syncFs.writeSync = () => { const e = new Error('Synthetic disk failure'); e.code = 'EIO'; throw e; };
    error = await rejection(node("console.log('diagnostic-survives-disk-error');setTimeout(()=>{},8000)", { stdoutPath, timeoutMs: 2000 }));
  } finally { syncFs.writeSync = originalWrite; }
  assert.equal(error.reason, 'output_file_error');
  assert.equal(error.systemCode, 'EIO');
  assert.match(error.stdout, /diagnostic-survives-disk-error/);
  assert.equal(error.outputFiles.stdout.opened, true);
  assert.equal(error.outputFiles.stdout.bytesWritten, 0);
  assert.equal(error.outputFiles.stdout.systemCode, 'EIO');
  assert.equal(error.termination.treeRequested, true);
});

test('peer environment prevents recursive councils and removes the interactive Claude marker', async () => {
  const previous = process.env.CLAUDECODE;
  let result;
  try {
    process.env.CLAUDECODE = 'synthetic-interactive-parent';
    result = await node("console.log(JSON.stringify({peer:process.env.CODEX_CLAUDE_COUNCIL_PEER,interactive:process.env.CLAUDECODE??null}));", { peer: true });
  } finally {
    if (previous === undefined) delete process.env.CLAUDECODE;
    else process.env.CLAUDECODE = previous;
  }
  assert.deepEqual(JSON.parse(result.stdout), { peer: '1', interactive: null });
});
