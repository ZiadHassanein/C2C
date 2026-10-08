import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const LOG_LIMIT = 4 * 1024 * 1024;
const DATE_LIMIT = 8.64e15;
const DURATION_LIMIT = 24 * 60 * 60 * 1000;
const number = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
const clock = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= DATE_LIMIT ? value : null;
const iso = value => value === null ? null : new Date(value).toISOString();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const fingerprint = value => createHash('sha256').update(JSON.stringify(value, (_key, entry) => object(entry)
  ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry)).digest('hex');

/** Per-process activity classifier. Only advancing model output extends idle
 * waiting. Keep hashes/counters, never provider text, and fail closed when the
 * bounded replay register is full. No timestamps or model content are emitted. */
export function createActivityObserver(provider) {
  const seen = new Set(), counters = new Map(), blocks = new Map();
  const limit = 65536;
  let messageId = '';
  const identity = value => typeof value === 'string' ? value : '';
  const scope = event => identity(event.message?.id) || identity(event.message_id) || identity(event.request_id) || messageId || identity(event.session_id);
  function advance(key, value) {
    if (number(value, Number.MAX_SAFE_INTEGER) === null || value <= 0) return false;
    const hashed = fingerprint(key), previous = counters.get(hashed) ?? 0;
    if (value <= previous || (!counters.has(hashed) && counters.size >= limit)) return false;
    counters.set(hashed, value);
    return true;
  }
  function novel(key, value, event, delta = false) {
    if (delta && number(event.sequence_number, Number.MAX_SAFE_INTEGER) !== null) {
      // Sequence zero is valid; an incremented value distinguishes it from
      // the initial counter without accepting a numeric overflow.
      if (event.sequence_number >= Number.MAX_SAFE_INTEGER) return false;
      return advance(['sequence', key], event.sequence_number + 1);
    }
    const id = delta ? identity(event.uuid) || identity(event.event_id) : '';
    const hashed = fingerprint(id ? ['event', id] : [key, value]);
    if (seen.has(hashed) || seen.size >= limit) return false;
    seen.add(hashed);
    return true;
  }
  function content(block) {
    if (!object(block)) return null;
    if (block.type === 'text' && nonempty(block.text)) return ['text', block.text];
    if (block.type === 'thinking' && nonempty(block.thinking)) return ['thinking', block.thinking];
    if (block.type === 'tool_use' && block.name === 'StructuredOutput' && object(block.input) && Object.keys(block.input).length) return ['structured', block.input];
    return null;
  }
  return event => {
    if (!object(event) || event.is_error === true || event.error != null) return false;
    if (provider === 'claude') {
      if (event.type === 'system' && event.subtype === 'thinking_tokens') {
        return advance(['thinking', scope(event)], event.estimated_tokens);
      }
      if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
        const parts = event.message.content.map(content).filter(Boolean);
        return parts.length > 0 && novel(['assistant', scope(event)], parts, event);
      }
      if (event.type !== 'stream_event' || !object(event.event)) return false;
      const update = event.event;
      if (update.type === 'message_start') {
        messageId = identity(update.message?.id);
        return false;
      }
      const key = ['claude-stream', scope(event), number(update.index, Number.MAX_SAFE_INTEGER)];
      const blockKey = fingerprint(key);
      if (update.type === 'content_block_start' && object(update.content_block)) {
        const block = update.content_block;
        if (blocks.size < limit && number(update.index, Number.MAX_SAFE_INTEGER) !== null) {
          blocks.set(blockKey, block.type === 'tool_use' && block.name === 'StructuredOutput' ? 'structured' : block.type);
        }
        const part = content(block);
        return part !== null && novel(key, part, event);
      }
      if (update.type === 'message_delta') return advance(['output_tokens', scope(event)], update.usage?.output_tokens);
      if (update.type !== 'content_block_delta' || !object(update.delta)) return false;
      const delta = update.delta;
      const value = delta.type === 'text_delta' ? delta.text : delta.type === 'thinking_delta' ? delta.thinking
        : delta.type === 'input_json_delta' && blocks.get(blockKey) === 'structured' ? delta.partial_json : null;
      return nonempty(value) && novel(key, [delta.type, value], { ...update, ...event }, true);
    }
    if (provider === 'codex') {
      if (['item.started', 'item.updated', 'item.completed'].includes(event.type) && object(event.item)) {
        const item = event.item;
        if (!['reasoning', 'agent_message', 'structured_output'].includes(item.type)) return false;
        const payload = nonempty(item.text) ? item.text : object(item.structured_output) && Object.keys(item.structured_output).length ? item.structured_output : null;
        return payload !== null && novel(['codex-item', identity(item.id), item.type], payload, event);
      }
      if (['response.output_text.delta', 'response.reasoning_text.delta', 'response.reasoning_summary_text.delta'].includes(event.type)) {
        return nonempty(event.delta) && novel(['codex-delta', identity(event.item_id), event.type], event.delta, event, true);
      }
    }
    return false;
  };
}

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
  const observe = createActivityObserver(provider);
  for (const event of events(text)) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) continue;
    if (observe(event)) {
      const structured = event.item?.type === 'structured_output' || event.message?.content?.some?.(block => block?.type === 'tool_use' && block.name === 'StructuredOutput');
      phase = structured ? 'structured_output' : 'model_working';
    }
    if (provider === 'claude') {
      if (event.type === 'system' && event.subtype === 'init') phase ??= 'initializing';
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
  const idleTimeout = number(attempt.idle_timeout_ms, DURATION_LIMIT);
  const elapsed = end => end !== null && started !== null && end >= started ? number(Math.floor(end - started), Number.MAX_SAFE_INTEGER) : null;
  const duration = running ? elapsed(observed) : number(attempt.elapsed_ms, Number.MAX_SAFE_INTEGER) ?? elapsed(ended);
  const deadline = started !== null && timeout !== null ? clock(started + timeout) : null;
  const activityTimes = [stdout, stderr].filter(log => log.bytes > 0 && log.modified !== null && observed !== null && log.modified <= observed)
    .map(log => log.modified);
  const lastActivity = activityTimes.length ? Math.max(...activityTimes) : null;
  const provider = ['codex', 'claude'].includes(attempt.provider) ? attempt.provider : state.peer;
  const metadata = eventProgress(stdout.text, provider);
  const stage = ['author-draft', 'author-review', 'draft', 'review', 'verify', 'verify-final'].includes(attempt.stage) ? attempt.stage : 'unknown';
  const validated = attempt.status === 'succeeded' && state.stages?.[stage]?.status === 'succeeded' && state.stages[stage].attempt === attempt.number;
  return {
    attempt: attempt.number, stage, ...(state.author_model ? { provider, role: attempt.role === 'author' ? 'author' : 'peer' } : {}), attempt_status: ['running', 'succeeded', 'failed', 'interrupted'].includes(attempt.status) ? attempt.status : 'unknown',
    recorded_running: running, observed_at: iso(observed), elapsed_ms: duration, timeout_ms: timeout, idle_timeout_ms: idleTimeout > 0 ? idleTimeout : null,
    deadline_at: iso(deadline), remaining_ms: running && timeout !== null && duration !== null ? Math.max(0, timeout - duration) : null,
    stdout_bytes: stdout.bytes, stderr_bytes: stderr.bytes, stdout_log_state: stdout.state, stderr_log_state: stderr.state,
    // Legacy activity fields describe log writes, not the process watchdog.
    // File mtime cannot reconstruct a semantic-activity idle deadline.
    last_activity_source: 'log_mtime', last_activity_at: iso(lastActivity), last_activity_age_ms: lastActivity !== null ? Math.floor(observed - lastActivity) : null,
    last_output_at: iso(lastActivity), last_output_age_ms: lastActivity !== null ? Math.floor(observed - lastActivity) : null,
    phase: metadata.phase ?? (stdout.bytes > 0 ? 'output_received' : stderr.bytes > 0 ? 'diagnostic_output' : 'waiting_for_output'),
    response_received: metadata.responseReceived, report_validated: validated, provider_retry: metadata.retry,
  };
}
