// Durable run manifests and process-identity-aware local locks. No model calls.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const LIMIT = 2 * 1024 * 1024;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const required = (ok, message) => { if (!ok) throw new Error(message); };
const manifestName = 'run.json';
const checkpointName = 'run.checkpoint.json';
const renameRetryDelays = [20, 40, 80];
const pause = milliseconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
let ownWindowsIdentity = null;

function publishRename(from, to, { platform, wait }) {
  for (let retries = 0; ; retries++) {
    try { fs.renameSync(from, to); return; }
    catch (error) {
      if (platform !== 'win32' || !['EPERM', 'EBUSY'].includes(error.code) || retries >= renameRetryDelays.length) throw error;
      wait(renameRetryDelays[retries]);
    }
  }
}

function syncDirectory(dir) {
  // Windows does not permit opening a directory for fsync through Node. Files
  // are still flushed before publication; hardware/filesystem guarantees apply.
  if (process.platform === 'win32') return;
  const fd = fs.openSync(dir, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

/** Publish a complete, flushed file by atomic rename in its own directory. */
export function atomicWriteFile(file, value, { platform = process.platform, wait = pause } = {}) {
  const data = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, data, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    // Some Windows readers briefly deny replacement. Retry the same flushed
    // temporary file; never unlink the destination or fall back to copying.
    publishRename(temp, file, { platform, wait });
    syncDirectory(path.dirname(file));
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function readBounded(file) {
  const stats = fs.lstatSync(file);
  required(stats.isFile() && !stats.isSymbolicLink() && stats.size <= LIMIT, `Expected a regular state file no larger than ${LIMIT} bytes: ${path.basename(file)}`);
  const bytes = fs.readFileSync(file);
  required(!bytes.includes(0), `State file contains zero bytes: ${path.basename(file)}`);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
}

function validState(state) {
  required(state && typeof state === 'object' && !Array.isArray(state), 'Manifest must be an object');
  required(Number.isInteger(state.version) && typeof state.id === 'string' && state.id.length > 0, 'Manifest identity is missing');
  required(Array.isArray(state.attempts) && state.stages && typeof state.stages === 'object' && state.seals && typeof state.seals === 'object', 'Manifest evidence is missing');
  required(Number.isFinite(state.elapsed_ms) && state.elapsed_ms >= 0, 'Manifest runtime is invalid');
  return state;
}

function decodeState(file, allowLegacy) {
  try {
    const state = validState(JSON.parse(readBounded(file)));
    if (state._storage === undefined) {
      required(allowLegacy, 'Checkpoint requires storage metadata');
      return { state, revision: 0, digest: hash(JSON.stringify(state)), legacy: true };
    }
    const { _storage, ...body } = state;
    required(_storage?.version === 1 && Number.isSafeInteger(_storage.revision) && _storage.revision >= 1, 'Invalid storage revision');
    const digest = hash(JSON.stringify(body));
    required(_storage.sha256 === digest, 'Manifest checksum does not match its contents');
    return { state, revision: _storage.revision, digest, legacy: false };
  } catch (error) { return { error: error.message }; }
}

/**
 * Both copies hold the newest committed state, not a previous-state backup.
 * A reservation is checkpointed before run.json and before the caller launches
 * a model, so recovering the newest valid revision cannot replay an attempt.
 * This detects accidental damage; a checksum is not protection from a user who
 * deliberately rewrites the run and its checksums.
 */
export function readRunState(dir, { onRecovery = message => process.stderr.write(`Council: ${message}\n`) } = {}) {
  const manifest = decodeState(path.join(dir, manifestName), true);
  const checkpoint = decodeState(path.join(dir, checkpointName), false);
  if (manifest.legacy) {
    required(!fs.existsSync(path.join(dir, checkpointName)), 'Legacy manifest conflicts with a checkpoint; preserve both files and resolve the mismatch before continuing.');
    return manifest.state;
  }
  const valid = [manifest, checkpoint].filter(copy => !copy.error);
  required(valid.length, `Run state is damaged and no complete checkpoint is available. Preserve this run; do not reset its attempts or claim completion. run.json: ${manifest.error}; run.checkpoint.json: ${checkpoint.error}`);
  if (valid.length === 2) {
    required(manifest.state.id === checkpoint.state.id, 'Manifest and checkpoint belong to different runs; preserve both files and resolve the mismatch.');
    required(manifest.revision !== checkpoint.revision || manifest.digest === checkpoint.digest, 'Manifest and checkpoint disagree at the same revision; recovery is ambiguous. Preserve both files; do not retry a peer call.');
  }
  const newest = valid.sort((a, b) => b.revision - a.revision)[0];
  if (manifest.error || newest === checkpoint && checkpoint.revision > manifest.revision) {
    onRecovery(`Using complete checkpoint revision ${newest.revision}; attempt reservations and sealed evidence are preserved. The next successful state write repairs run.json.`);
  }
  return newest.state;
}

/** Call while holding the run lock (or while preparing a new run). */
export function writeRunState(dir, state) {
  validState(state);
  const previousRevision = state._storage?.revision ?? 0;
  required(Number.isSafeInteger(previousRevision) && previousRevision >= 0 && previousRevision < Number.MAX_SAFE_INTEGER, 'Invalid prior storage revision');
  const { _storage: ignored, ...body } = state;
  const storage = { version: 1, revision: previousRevision + 1, sha256: hash(JSON.stringify(body)) };
  const saved = { ...body, _storage: storage };
  // Do not acknowledge the reservation until BOTH complete files are flushed.
  atomicWriteFile(path.join(dir, checkpointName), saved);
  atomicWriteFile(path.join(dir, manifestName), saved);
  state._storage = storage;
}

/** Identify an OS process incarnation, not just a potentially reused PID. */
export function inspectProcess(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return { status: 'unknown', identity: null };
  try { process.kill(pid, 0); }
  catch (error) { if (error.code === 'ESRCH') return { status: 'dead', identity: null }; }
  // This JS process cannot acquire a different incarnation while it executes.
  // Foreign PIDs must always be inspected again; caching those hides PID reuse.
  if (process.platform === 'win32' && pid === process.pid && ownWindowsIdentity) return { status: 'alive', identity: ownWindowsIdentity };
  try {
    if (process.platform === 'linux') {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
      required(fields.length >= 20 && /^\d+$/.test(fields[19]), 'Invalid process start record');
      // Orphan zombies can await a slow container reaper after termination.
      // They cannot execute a model call or resume their former process state.
      if (['Z', 'X'].includes(fields[0])) return { status: 'dead', identity: null };
      const boot = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
      return { status: 'alive', identity: `linux:${boot}:${fields[19]}` };
    }
    if (process.platform === 'win32') {
      const systemRoot = process.env.SystemRoot || 'C:\\Windows';
      const executable = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      // PID is validated as an integer. No path, user input or file content is
      // interpolated into executable shell text.
      const script = `$ErrorActionPreference='Stop'; (Get-Process -Id ${pid}).StartTime.ToUniversalTime().Ticks`;
      const result = spawnSync(executable, ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 16384 });
      if (!result.error && result.status === 0 && /^\d+$/.test(result.stdout.trim())) {
        const identity = `windows:${result.stdout.trim()}`;
        if (pid === process.pid) ownWindowsIdentity = identity;
        return { status: 'alive', identity };
      }
    } else if (process.platform === 'darwin') {
      // ps formats lstart using the caller's locale and local timezone. Keep
      // that representation stable across shells before comparing ownership.
      const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], {
        encoding: 'utf8', timeout: 5000, maxBuffer: 16384,
        env: { ...process.env, TZ: 'UTC', LC_ALL: 'C', LANG: 'C' },
      });
      if (!result.error && result.status === 0 && result.stdout.trim()) return { status: 'alive', identity: `darwin-v2:${result.stdout.trim()}` };
    }
  } catch { /* Permission denied or process exit: recheck liveness below. */ }
  try { process.kill(pid, 0); return { status: 'alive', identity: null }; }
  catch (error) { return { status: error.code === 'ESRCH' ? 'dead' : 'unknown', identity: null }; }
}

/** Read-only guard for newly registered direct workers. Legacy attempts without
 * worker_process remain untracked. Never kill a recorded PID or infer that a
 * detached descendant stopped merely because the registered worker exited. */
export function assertWorkersStopped(state, { inspect = inspectProcess } = {}) {
  required(Array.isArray(state?.attempts), 'Run attempt history is unavailable');
  for (const attempt of state.attempts) {
    if (!Object.hasOwn(attempt, 'worker_process')) continue;
    const worker = attempt.worker_process;
    if (worker?.released === true) continue;
    const blocked = (reason, message) => { throw Object.assign(new Error(`${message} Preserve this run and its attempts; do not launch another worker or reset its state. ${Number.isSafeInteger(worker?.pid) && worker.pid > 0 ? "Inspect the recorded worker through the host's approved process tools." : 'No durable worker PID is available to inspect; normal recovery cannot continue this run. Deliver a provisional checkpoint.'} No process was terminated by this check.`), { reason }); };
    if (!worker || typeof worker !== 'object' || Array.isArray(worker) || worker.launch_pending === true ||
        !Number.isSafeInteger(worker.pid) || worker.pid <= 0 || typeof worker.identity !== 'string' || !worker.identity) {
      blocked('worker_cleanup_unconfirmed', 'Previous worker launch or ownership is unresolved.');
    }
    let current;
    try { current = inspect(worker.pid); } catch { /* Inaccessible inspection remains ambiguous. */ }
    if (current?.status === 'dead') continue;
    if (current?.status === 'alive' && typeof current.identity === 'string' && current.identity) {
      if (current.identity !== worker.identity) continue; // The PID now names a different process incarnation.
      blocked('worker_still_running', 'A previously registered worker process is still alive.');
    }
    blocked('worker_cleanup_unconfirmed', 'The previous worker process cannot be confirmed stopped.');
  }
}

function lockSnapshot(file) {
  const bytes = fs.readFileSync(file);
  let record;
  try { record = JSON.parse(bytes.toString('utf8')); } catch { /* Explicit recovery handles incomplete legacy files. */ }
  const valid = record && Number.isSafeInteger(record.pid) && record.pid > 0;
  return { digest: hash(bytes), record: valid ? record : null };
}

function recoveryHint(snapshot) {
  return `If the previous runner has stopped, use recover-lock --run DIR --expected-sha256 ${snapshot.digest} --confirm-owner-stopped yes. This does not reset attempts.`;
}

function ownerState(snapshot, inspect) {
  if (!snapshot.record) return 'ambiguous';
  const owner = inspect(snapshot.record.pid);
  if (owner.status === 'dead') return 'stale';
  // Earlier macOS locks stored a localized start time. A different canonical
  // string cannot prove PID reuse; retain the inspected-hash recovery path.
  if (owner.status === 'alive' && typeof snapshot.record.identity === 'string' && snapshot.record.identity.startsWith('darwin:') && typeof owner.identity === 'string' && owner.identity.startsWith('darwin-v2:')) return 'ambiguous';
  if (owner.status === 'alive' && snapshot.record.identity && owner.identity && snapshot.record.identity !== owner.identity) return 'stale';
  if (owner.status === 'alive' && (snapshot.record.version === 1 || snapshot.record.identity && owner.identity)) return 'active';
  return 'ambiguous';
}

function publishExclusive(file, record) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    atomicWriteFile(temp, record);
    // Atomic hard-link publication cannot expose an empty ownership record,
    // and unlike rename it never replaces an existing owner's lock.
    fs.linkSync(temp, file);
    syncDirectory(path.dirname(file));
  } finally {
    try { fs.unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function releaseOwned(file, token) {
  try {
    const snapshot = lockSnapshot(file);
    if (snapshot.record?.token === token) { fs.unlinkSync(file); syncDirectory(path.dirname(file)); }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function ownRecord(inspect) {
  return { version: 1, pid: process.pid, identity: inspect(process.pid).identity, token: crypto.randomUUID(), at: new Date().toISOString() };
}

function withReclaimGate(dir, inspect, work) {
  const gate = path.join(dir, '.lock.reclaim');
  const record = ownRecord(inspect);
  try { publishExclusive(gate, record); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error('Another lock recovery is in progress, or its recovery marker remains after a crash. Preserve .lock.reclaim; after confirming its recorded process has stopped, move only that marker aside and retry.');
  }
  try { return work(); } finally { releaseOwned(gate, record.token); }
}

function lockAccess(action, work, { afterWork = false } = {}) {
  try { return work(); }
  catch (error) {
    if (!['EACCES', 'EPERM', 'EROFS'].includes(error.code) || error.reason === 'run_lock_access_denied') throw error;
    const next = afterWork
      ? 'Run changes or a worker result may already be saved. Inspect run status and the recorded lock owner; do not repeat a completed worker stage. Request required filesystem access from the host, and use approved lock recovery only after confirming the owner has stopped.'
      : 'Ask the host to authorize the required filesystem operations, then retry the unchanged command through the approved execution path.';
    throw Object.assign(new Error(`Cannot ${action}: local filesystem access was denied (${error.code}). This is a host/filesystem restriction, not a provider or usage-limit failure. Preserve the run and its lock records; do not delete locks or reset attempts. ${next} Original error: ${error.message}`, { cause: error }), { code: error.code, reason: 'run_lock_access_denied' });
  }
}

/** Obtain an exclusive lock; age alone never authorizes reclaiming it. */
export function acquireRunLock(dir, { inspect = inspectProcess } = {}) {
  return lockAccess('acquire the C2C run lock', () => {
    const file = path.join(dir, '.lock');
    required(!fs.existsSync(path.join(dir, '.lock.reclaim')), 'Lock recovery is in progress; wait for it to finish. If it crashed, preserve and inspect .lock.reclaim before removing its marker.');
    const record = ownRecord(inspect);
    try { publishExclusive(file, record); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const previous = lockSnapshot(file);
      const owner = ownerState(previous, inspect);
      required(owner !== 'active', 'Another process is using this run. Wait for it to finish; lock age never overrides a live owner.');
      required(owner === 'stale', `Lock ownership is ambiguous. ${recoveryHint(previous)}`);
      withReclaimGate(dir, inspect, () => {
        const current = lockSnapshot(file);
        required(current.digest === previous.digest && ownerState(current, inspect) === 'stale', 'Lock ownership changed during recovery; retry after the current owner finishes.');
        fs.unlinkSync(file);
        publishExclusive(file, record);
      });
    }
    return () => lockAccess('release the C2C run lock', () => releaseOwned(file, record.token), { afterWork: true });
  });
}

/** Explicitly clear malformed legacy locks without silently stealing live work. */
export function recoverRunLock(dir, { expectedHash, confirmedStopped, inspect = inspectProcess } = {}) {
  required(confirmedStopped === true, 'Recovery requires --confirm-owner-stopped yes after checking that the previous runner has stopped.');
  required(typeof expectedHash === 'string' && /^[a-f0-9]{64}$/.test(expectedHash), 'Recovery requires the exact --expected-sha256 printed by the lock error.');
  const file = path.join(dir, '.lock');
  return lockAccess('recover the C2C run lock', () => withReclaimGate(dir, inspect, () => {
    const snapshot = lockSnapshot(file);
    required(snapshot.digest === expectedHash, 'The lock changed after inspection; preserve it and inspect the current owner before recovery.');
    const owner = ownerState(snapshot, inspect);
    // A legacy PID with no identity is ambiguous even when that PID is alive.
    // Explicit confirmation may clear that legacy ambiguity. A matching modern
    // process incarnation is provably active and is never removed here.
    const live = snapshot.record && inspect(snapshot.record.pid);
    required(!(live?.status === 'alive' && live.identity && snapshot.record.identity === live.identity), 'The recorded owner process is still alive; recovery will not remove its lock.');
    required(owner !== 'active', 'The lock belongs to a live owner; wait for it to finish.');
    const archived = `.lock.recovered-${crypto.randomUUID()}.json`;
    // Keep the exact prior bytes for diagnosis without leaving them active.
    fs.linkSync(file, path.join(dir, archived));
    fs.unlinkSync(file);
    syncDirectory(dir);
    return { recovered: true, archived, attempts_reset: false };
  }));
}
