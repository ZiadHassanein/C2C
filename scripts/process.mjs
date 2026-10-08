import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const OUTPUT_LIMIT = 4 * 1024 * 1024;
const PIPE_DRAIN_MS = 250;
const TERMINATION_GRACE_MS = 2000;

// Only signal the process/group created by this invocation. A Windows taskkill
// failure falls back to the owned direct handle, which cannot guarantee that
// descendants died. Forced pipe closure is reported separately from termination.
function terminateOwned(child, details, onTreeSettled) {
  if (!child?.pid) return () => {};
  if (process.platform === 'win32' && (child.exitCode !== null || child.signalCode !== null)) {
    // The numeric PID can be recycled once the direct process exits. Without a
    // live owned parent, taskkill /PID /T is not a safe descendant lookup.
    details.method = 'unavailable-after-exit';
    details.treeError = 'Direct parent already exited; descendant cleanup cannot be safely requested by PID';
    return () => {};
  }
  const direct = () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try { details.directKillRequested = child.kill('SIGKILL') || details.directKillRequested; }
    catch (error) { details.directError = error.message; }
  };
  details.treeRequested = true;
  if (process.platform !== 'win32') {
    details.method = 'process-group';
    try { process.kill(-child.pid, 'SIGKILL'); details.treeRequestSucceeded = true; }
    catch (error) {
      details.treeRequestSucceeded = false;
      details.treeError = error.message;
      direct();
    }
    return () => {};
  }
  details.method = 'taskkill';
  let killer;
  let fallback;
  try {
    killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
      ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false });
    killer.on('error', error => {
      details.treeRequestSucceeded = false;
      details.treeError = error.message;
      direct();
      onTreeSettled();
    });
    killer.on('close', code => {
      details.treeExitCode = code;
      details.treeRequestSucceeded = code === 0;
      if (code !== 0) direct();
      onTreeSettled();
    });
    // Do not wait indefinitely for taskkill, and give it a chance to enumerate
    // descendants before terminating their parent through the direct handle.
    fallback = setTimeout(direct, 400);
  } catch (error) {
    details.treeRequestSucceeded = false;
    details.treeError = error.message;
    direct();
  }
  return () => {
    clearTimeout(fallback);
    if (killer && killer.exitCode === null && killer.signalCode === null) {
      try { killer.kill('SIGKILL'); } catch {}
      killer.unref();
    }
  };
}

const PEER_CONTROLS = Object.freeze({
  CODEX_CLAUDE_COUNCIL_PEER: '1', CLAUDE_CODE_DISABLE_FAST_MODE: '1',
  CLAUDE_CODE_DISABLE_TERMINAL_TITLE: '1', DISABLE_AUTOUPDATER: '1',
});

/** Child-only controls; Windows environment names are case-insensitive. */
export function processEnvironment(inheritedEnv, { peer = false, platform = process.platform } = {}) {
  const env = { ...inheritedEnv };
  if (!peer) return env;
  if (platform === 'win32') {
    // Node may receive a plain env object containing several spellings of one
    // Windows key. Remove all controlled spellings before adding canonical ones.
    for (const key of Object.keys(env)) {
      const canonical = key.toUpperCase();
      if (canonical === 'CLAUDECODE' || Object.hasOwn(PEER_CONTROLS, canonical)) delete env[key];
    }
  } else delete env.CLAUDECODE;
  // Preserve authentication, selected model and reasoning configuration. These
  // per-process controls are not a general provider spending cap.
  return Object.assign(env, PEER_CONTROLS);
}

/**
 * Run one owned process. Output is retained up to a combined 4 MiB and can also
 * be streamed to caller-selected files (opened with write/truncate semantics).
 * Nonzero process exits are returned to the caller. Transport failures reject
 * with stdout, stderr, code, signal, reason, outputFiles and termination details.
 * A timeout/abort can settle after forced pipe closure; this does not establish
 * that every descendant was killed. Detached descendants may escape the group.
 */
export function runProcess(executable, args, {
  prompt = '', cwd, timeoutMs = 30000, peer = false,
  stdoutPath, stderrPath, signal: abortSignal, env: inheritedEnv = process.env,
} = {}) {
  return new Promise((resolve, reject) => {
    const chunks = { stdout: [], stderr: [] };
    const outputFiles = {};
    const descriptors = {};
    const termination = {
      method: null, treeRequested: false, treeRequestSucceeded: null,
      directKillRequested: false, directExitObserved: false, pipeClosureForced: false,
    };
    let bytes = 0, child, failure, settled = false, closed = false, outputTruncated = false;
    let exitCode = null, exitSignal = null, deadline, drainTimer, settlementTimer;
    let stopTerminator = () => {};

    const failureFor = (message, reason, cause) => {
      const error = cause ? new Error(message, { cause }) : new Error(message);
      error.reason = reason;
      if (cause?.code !== undefined) error.systemCode = cause.code;
      return error;
    };
    const fileFailure = (name, error) => {
      outputFiles[name].error = error.message;
      outputFiles[name].systemCode = error.code || null;
      return failureFor(`Cannot write ${name} log ${outputFiles[name].path}: ${error.message}`, 'output_file_error', error);
    };
    const finish = (forcePipes = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline); clearTimeout(drainTimer); clearTimeout(settlementTimer);
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
      abortSignal?.removeEventListener('abort', abort);
      stopTerminator();
      if (forcePipes && child) {
        termination.pipeClosureForced = !closed;
        child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy();
        child.unref();
      }
      for (const [name, fd] of Object.entries(descriptors)) {
        try { fs.closeSync(fd); }
        catch (error) { const closingError = fileFailure(name, error); failure ||= closingError; }
      }
      const result = {
        stdout: Buffer.concat(chunks.stdout).toString('utf8'),
        stderr: Buffer.concat(chunks.stderr).toString('utf8'),
        code: exitCode, signal: exitSignal,
        outputFiles, termination: { ...termination },
      };
      if (failure) {
        Object.assign(failure, result);
        failure.outputTruncated = outputTruncated;
        reject(failure);
      } else resolve(result);
    };
    const stop = error => {
      if (settled || failure) return;
      failure = error;
      clearTimeout(deadline); clearTimeout(drainTimer);
      if (!child?.pid) { finish(true); return; }
      stopTerminator = terminateOwned(child, termination, () => { if (closed) finish(); });
      settlementTimer = setTimeout(() => finish(true), TERMINATION_GRACE_MS);
    };
    function interrupt() { stop(failureFor('Peer invocation interrupted', 'aborted')); }
    function abort() { stop(failureFor('Peer invocation aborted', 'aborted')); }

    const capture = (name, raw) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      const remaining = Math.max(0, OUTPUT_LIMIT - bytes);
      const accepted = buffer.subarray(0, remaining);
      if (accepted.length) {
        chunks[name].push(accepted);
        bytes += accepted.length;
        const file = outputFiles[name];
        if (file && !file.error) {
          try {
            let written = 0;
            while (written < accepted.length) {
              const n = fs.writeSync(descriptors[name], accepted, written, accepted.length - written);
              if (n === 0) throw new Error('The log write made no progress');
              written += n;
              file.bytesWritten += n;
            }
          } catch (error) { stop(fileFailure(name, error)); }
        }
      }
      if (buffer.length > remaining) {
        outputTruncated = true;
        stop(failureFor('Peer output exceeded 4 MiB', 'output_limit'));
      }
    };

    try {
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be a positive finite number');
      const normalizedPath = filename => process.platform === 'win32' ? path.resolve(filename).toLowerCase() : path.resolve(filename);
      if (stdoutPath && stderrPath && normalizedPath(stdoutPath) === normalizedPath(stderrPath)) {
        throw new Error('stdoutPath and stderrPath must name different files');
      }
      if (abortSignal?.aborted) { abort(); return; }
      for (const [name, filename] of Object.entries({ stdout: stdoutPath, stderr: stderrPath })) {
        if (filename === undefined) continue;
        outputFiles[name] = { path: filename, opened: false, bytesWritten: 0 };
        try {
          descriptors[name] = fs.openSync(filename, 'w', 0o600);
          outputFiles[name].opened = true;
        } catch (error) { stop(fileFailure(name, error)); return; }
      }
      if (descriptors.stdout !== undefined && descriptors.stderr !== undefined) {
        const out = fs.fstatSync(descriptors.stdout, { bigint: true });
        const err = fs.fstatSync(descriptors.stderr, { bigint: true });
        if (out.ino !== 0n && out.dev === err.dev && out.ino === err.ino) {
          stop(failureFor('stdoutPath and stderrPath resolve to the same file', 'output_file_error'));
          return;
        }
      }
      const env = processEnvironment(inheritedEnv, { peer });
      child = spawn(executable, args, {
        cwd, env, shell: false, windowsHide: true,
        detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
      });
      process.once('SIGINT', interrupt);
      process.once('SIGTERM', interrupt);
      abortSignal?.addEventListener('abort', abort, { once: true });
      deadline = setTimeout(() => stop(failureFor(
        `Peer deadline exceeded (${Math.ceil(timeoutMs / 1000)} seconds)`, 'timeout')), timeoutMs);
      child.stdout.on('data', data => capture('stdout', data));
      child.stderr.on('data', data => capture('stderr', data));
      child.stdout.on('error', error => stop(failureFor(`Peer stdout failed: ${error.message}`, 'stream_error', error)));
      child.stderr.on('error', error => stop(failureFor(`Peer stderr failed: ${error.message}`, 'stream_error', error)));
      child.stdin.on('error', error => {
        if (error.code !== 'EPIPE') stop(failureFor(`Peer stdin failed: ${error.message}`, 'stdin_error', error));
      });
      child.on('error', error => stop(failureFor(`Peer process failed: ${error.message}`, 'spawn_error', error)));
      child.on('exit', (code, signal) => {
        if (settled) return;
        exitCode = code; exitSignal = signal;
        termination.directExitObserved = true;
        if (!failure) drainTimer = setTimeout(() => stop(failureFor(
          'Peer exited but inherited output pipes remained open', 'retained_pipes')), PIPE_DRAIN_MS);
      });
      child.on('close', (code, signal) => {
        if (settled) return;
        closed = true;
        exitCode = code; exitSignal = signal;
        // Let the owned taskkill process finish traversing its tree. Its final
        // callback or the bounded settlement timer completes this invocation.
        if (failure && termination.method === 'taskkill' && termination.treeRequestSucceeded === null) return;
        finish();
      });
      // Register all handlers before writing; a synchronous stdin error must
      // still preserve diagnostics and enter bounded owned-process cleanup.
      child.stdin.end(prompt);
    } catch (error) {
      stop(failureFor(error.message, child ? 'stdin_error' : 'spawn_error', error));
    }
  });
}
