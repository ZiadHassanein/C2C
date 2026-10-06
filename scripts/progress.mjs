import fs from 'node:fs';
import path from 'node:path';

const LOG_LIMIT = 4 * 1024 * 1024;
const DATE_LIMIT = 8.64e15;
const DURATION_LIMIT = 24 * 60 * 60 * 1000;
const number = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
const clock = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= DATE_LIMIT ? value : null;
const iso = value => value === null ? null : new Date(value).toISOString();
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  return clock(Date.parse(value));
}

// These files are diagnostics, not trusted evidence. Do not follow a replaced
// log into another file or copy provider content into the public status view.
function readLog(filename, includeText) {
  let fd;
  try {
    const before = fs.lstatSync(filename);
    if (!before.isFile() || before.isSymbolicLink()) return { state: 'unsafe', bytes: null, modified: null, text: '' };
    fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stats = fs.fstatSync(fd);
    if (!stats.isFile() || before.dev !== stats.dev || before.ino !== stats.ino) return { state: 'unsafe', bytes: null, modified: null, text: '' };
    const bytes = number(stats.size, Number.MAX_SAFE_INTEGER);
    const modified = clock(stats.mtimeMs);
    if (bytes === null || bytes > LOG_LIMIT) return { state: 'oversized', bytes, modified, text: '' };
    if (!includeText || !bytes) return { state: 'readable', bytes, modified, text: '' };
    // Read only the snapshotted length: an actively growing log cannot cause an
    // unbounded allocation. A partial trailing JSON line is ignored below.
    const buffer = Buffer.alloc(bytes);
    let offset = 0;
    while (offset < bytes) {
      const received = fs.readSync(fd, buffer, offset, bytes - offset, offset);
      if (!received) break;
      offset += received;
    }
    return { state: 'readable', bytes, modified, text: buffer.subarray(0, offset).toString('utf8') };
  } catch (error) {
    return { state: error.code === 'ENOENT' ? 'missing' : 'unavailable', bytes: null, modified: null, text: '' };
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
  }
}

function events(text) {
  if (!text.trim()) return [];
  // Old Claude calls wrote one (occasionally pretty-printed) result envelope.
  try { return [JSON.parse(text)]; } catch {}
  return text.split(/\r?\n/).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function eventProgress(text, provider) {
  let phase = null, responseReceived = false, retry = null;
  for (const event of events(text)) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) continue;
    if (provider === 'claude') {
      if (event.type === 'system' && event.subtype === 'init') phase ??= 'initializing';
      if (event.type === 'system' && event.subtype === 'thinking_tokens') phase = 'model_working';
      if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
        if (event.message.content.some(block => block?.type === 'thinking' || block?.type === 'text')) phase = 'model_working';
        if (event.message.content.some(block => block?.type === 'tool_use' && block.name === 'StructuredOutput')) phase = 'structured_output';
      }
      if (event.type === 'system' && event.subtype === 'api_retry') {
        phase = 'provider_retry';
        retry = { attempt: number(event.attempt, 100000), max_retries: number(event.max_retries, 100000),
          delay_ms: number(event.retry_delay_ms, DURATION_LIMIT), http_status: number(event.error_status, 599) };
        if (retry.http_status !== null && retry.http_status < 100) retry.http_status = null;
      }
      if (event.type === 'result') { responseReceived = true; phase = 'response_received'; }
      if (event.type === 'error') phase = 'provider_error';
    } else if (provider === 'codex') {
      if (event.type === 'thread.started') phase ??= 'initializing';
      if (event.type === 'turn.started' || ['item.started', 'item.updated', 'item.completed'].includes(event.type)) phase = 'model_working';
      if (event.type === 'turn.completed') { responseReceived = true; phase = 'response_received'; }
      if (event.type === 'error' || event.type === 'turn.failed') phase = 'provider_error';
    }
  }
  return { phase, responseReceived, retry };
}

/** A read-only diagnostic snapshot. Activity does not establish liveness,
 * authentication, a valid report, or completion; authoritative state does. */
export function readPeerProgress(dir, state, nowMs = Date.now()) {
  const attempt = Array.isArray(state?.attempts) ? state.attempts.at(-1) : null;
  if (!attempt || number(attempt.number, 1000000) === null || attempt.number < 1) return null;
  const stdout = readLog(path.join(dir, `attempt-${attempt.number}-stdout.txt`), true);
  const stderr = readLog(path.join(dir, `attempt-${attempt.number}-stderr.txt`), false);
  const observed = clock(nowMs);
  const started = timestamp(attempt.started_at);
  const ended = timestamp(attempt.ended_at);
  const running = attempt.status === 'running';
  const timeout = number(attempt.timeout_ms, DURATION_LIMIT);
  const duration = running ? (observed !== null && started !== null && observed >= started ? Math.floor(observed - started) : null)
    : number(attempt.elapsed_ms, DURATION_LIMIT) ?? (started !== null && ended !== null && ended >= started ? ended - started : null);
  const deadline = started !== null && timeout !== null ? clock(started + timeout) : null;
  const activityTimes = [stdout, stderr].filter(log => log.bytes > 0 && log.modified !== null && observed !== null && log.modified <= observed)
    .map(log => log.modified);
  const lastActivity = activityTimes.length ? Math.max(...activityTimes) : null;
  const metadata = eventProgress(stdout.text, state.peer);
  const stage = ['draft', 'review', 'verify'].includes(attempt.stage) ? attempt.stage : 'unknown';
  const validated = attempt.status === 'succeeded' && state.stages?.[stage]?.status === 'succeeded' && state.stages[stage].attempt === attempt.number;
  return {
    attempt: attempt.number, stage, attempt_status: ['running', 'succeeded', 'failed', 'interrupted'].includes(attempt.status) ? attempt.status : 'unknown',
    recorded_running: running, observed_at: iso(observed), elapsed_ms: duration, timeout_ms: timeout,
    deadline_at: iso(deadline), remaining_ms: running && timeout !== null && duration !== null ? Math.max(0, timeout - duration) : null,
    stdout_bytes: stdout.bytes, stderr_bytes: stderr.bytes, stdout_log_state: stdout.state, stderr_log_state: stderr.state,
    last_activity_at: iso(lastActivity), last_activity_age_ms: lastActivity !== null ? Math.floor(observed - lastActivity) : null,
    phase: metadata.phase ?? (stdout.bytes > 0 ? 'output_received' : stderr.bytes > 0 ? 'diagnostic_output' : 'waiting_for_output'),
    response_received: metadata.responseReceived, report_validated: validated, provider_retry: metadata.retry,
  };
}
