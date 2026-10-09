import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

const OUTPUT_LIMIT = 4 * 1024 * 1024;
const PIPE_DRAIN_MS = 250;
const TERMINATION_GRACE_MS = 2000;
const ACTIVITY_LINE_LIMIT = 1024 * 1024;

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
 * idleTimeoutMs uses a caller-owned classifier of bounded complete stdout JSONL
 * objects. Only true resets its clock; stderr and incomplete lines never do.
 * timeoutMs remains a separate hard cap. Omitting it in idle mode removes only
 * that cap; calls without idle mode retain the legacy 30-second default.
 * onSpawn(pid), when supplied, must synchronously persist worker ownership
 * before returning. No prompt bytes or stdin EOF are sent before it completes.
 * Returning false withholds stdin when the caller has observed an early exit;
 * exit code/stderr still follow the normal process-exit path.
 * A timeout/abort can settle after forced pipe closure; this does not establish
 * that every descendant was killed. Detached descendants may escape the group.
 */
export function runProcess(executable, args, {
  prompt = '', cwd, timeoutMs, idleTimeoutMs, isActivity, peer = false,
  stdoutPath, stderrPath, signal: abortSignal, env: inheritedEnv = process.env, onSpawn,
} = {}) {
  return new Promise((resolve, reject) => {
    const chunks = { stdout: [], stderr: [] };
    const outputFiles = {};
    const descriptors = {};
    const termination = {
      method: null, treeRequested: false, treeRequestSucceeded: null,
      directKillRequested: false, directExitObserved: false, pipeClosureForced: false, spawnObserved: false,
    };
    let bytes = 0, child, failure, settled = false, closed = false, outputTruncated = false;
    let exitCode = null, exitSignal = null, deadline, idleDeadline, drainTimer, settlementTimer, hardDeadlineAt, idleDeadlineAt;
    let stopTerminator = () => {};
    // Existing metadata calls retain their fixed default. Worker idle mode has
    // no total deadline unless the caller explicitly supplies one.
    const hardTimeoutMs = timeoutMs === undefined ? (idleTimeoutMs === undefined ? 30000 : null) : timeoutMs;
    const activity = idleTimeoutMs === undefined ? null : { idle_timeout_ms: idleTimeoutMs, observed_events: 0, last_activity_at: null };
    const decoder = new StringDecoder('utf8');
    let activityLine = '', oversizedActivityLine = false;

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
      clearTimeout(deadline); clearTimeout(idleDeadline); clearTimeout(drainTimer); clearTimeout(settlementTimer);
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
        outputFiles, termination: { ...termination }, ...(activity ? { activity: { ...activity } } : {}),
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
      clearTimeout(deadline); clearTimeout(idleDeadline); clearTimeout(drainTimer);
      if (!child?.pid) { finish(true); return; }
      stopTerminator = terminateOwned(child, termination, () => { if (closed) finish(); });
      settlementTimer = setTimeout(() => finish(true), TERMINATION_GRACE_MS);
    };
    function interrupt() { stop(failureFor('Peer invocation interrupted', 'aborted')); }
    function abort() { stop(failureFor('Peer invocation aborted', 'aborted')); }

    const resetIdleDeadline = () => {
      clearTimeout(idleDeadline);
      if (child && (child.exitCode !== null || child.signalCode !== null)) return;
      idleDeadlineAt = Date.now() + idleTimeoutMs;
      idleDeadline = setTimeout(() => stop(failureFor(
        `Peer produced no recognized model activity for ${Math.ceil(idleTimeoutMs / 1000)} seconds`, 'idle_timeout')), idleTimeoutMs);
    };
    const observeActivityLine = line => {
      let event;
      try { event = JSON.parse(line); } catch { return; }
      if (!event || typeof event !== 'object' || Array.isArray(event)) return;
      let substantive;
      try { substantive = isActivity(event) === true; }
      catch { activity.observer_error ??= 'activity_observer_error'; return; }
      if (!substantive) return;
      activity.observed_events++;
      activity.last_activity_at = new Date().toISOString();
      resetIdleDeadline();
    };
    const observeActivity = buffer => {
      const text = decoder.write(buffer);
      let start = 0, newline;
      while (!failure && (newline = text.indexOf('\n', start)) !== -1) {
        const part = text.slice(start, newline);
        if (!oversizedActivityLine && activityLine.length + part.length <= ACTIVITY_LINE_LIMIT) observeActivityLine(activityLine + part);
        activityLine = ''; oversizedActivityLine = false; start = newline + 1;
      }
      if (failure) { activityLine = ''; return; }
      const tail = text.slice(start);
      if (!oversizedActivityLine && activityLine.length + tail.length <= ACTIVITY_LINE_LIMIT) activityLine += tail;
      else { activityLine = ''; oversizedActivityLine = true; }
    };

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
        if (activity && name === 'stdout' && !failure) observeActivity(accepted);
      }
      if (buffer.length > remaining) {
        outputTruncated = true;
        stop(failureFor('Peer output exceeded 4 MiB', 'output_limit'));
      }
    };

    try {
      if (timeoutMs === null || hardTimeoutMs !== null && (!Number.isFinite(hardTimeoutMs) || hardTimeoutMs <= 0)) throw new Error('timeoutMs must be a positive finite number');
      if (idleTimeoutMs !== undefined && (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0)) throw new Error('idleTimeoutMs must be a positive finite number');
      if (idleTimeoutMs !== undefined && typeof isActivity !== 'function') throw new Error('idleTimeoutMs requires an isActivity callback');
      if (onSpawn !== undefined && typeof onSpawn !== 'function') throw new Error('onSpawn must be a synchronous function');
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
      termination.spawnObserved = Number.isSafeInteger(child.pid) && child.pid > 0;
      process.once('SIGINT', interrupt);
      process.once('SIGTERM', interrupt);
      abortSignal?.addEventListener('abort', abort, { once: true });
      if (hardTimeoutMs !== null) {
        hardDeadlineAt = Date.now() + hardTimeoutMs;
        deadline = setTimeout(() => stop(failureFor(
          `Peer deadline exceeded (${Math.ceil(hardTimeoutMs / 1000)} seconds)`, 'timeout')), hardTimeoutMs);
      }
      if (activity) resetIdleDeadline();
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
        clearTimeout(idleDeadline);
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
      child.once('spawn', () => {
        if (settled || failure) return;
        try {
          if (!termination.spawnObserved) throw new Error('Spawned worker PID is unavailable');
          const registration = onSpawn?.(child.pid);
          if (registration === false) {
            termination.promptWithheld = true;
            child.stdin.destroy();
            return;
          }
          if (registration && typeof registration.then === 'function') {
            // Reject the unsupported contract without leaking a rejected
            // callback promise into an unhandled-rejection process crash.
            Promise.resolve(registration).catch(() => {});
            throw new Error('onSpawn must complete synchronously before prompt delivery');
          }
        } catch (error) { stop(failureFor('Worker registration failed before prompt delivery', 'worker_registration_error', error)); return; }
        if (abortSignal?.aborted) { abort(); return; }
        if (hardDeadlineAt !== undefined && Date.now() >= hardDeadlineAt) {
          stop(failureFor(`Peer deadline exceeded (${Math.ceil(hardTimeoutMs / 1000)} seconds)`, 'timeout')); return;
        }
        if (idleDeadlineAt !== undefined && Date.now() >= idleDeadlineAt) {
          stop(failureFor(`Peer produced no recognized model activity for ${Math.ceil(idleTimeoutMs / 1000)} seconds`, 'idle_timeout')); return;
        }
        if (settled || failure) return;
        // Handlers and durable caller registration precede all prompt delivery.
        try { child.stdin.end(prompt); }
        catch (error) { stop(failureFor(error.message, 'stdin_error', error)); }
      });
    } catch (error) {
      stop(failureFor(error.message, child ? 'stdin_error' : 'spawn_error', error));
    }
  });
}
