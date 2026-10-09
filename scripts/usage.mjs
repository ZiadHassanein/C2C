// Pure, best-effort usage accounting. No provider calls, filesystem access,
// prices, allowance estimates, or report-success decisions belong here.
// Semantics checked 2026-10-09 against:
// https://learn.chatgpt.com/docs/non-interactive-mode
// https://developers.openai.com/api/docs/guides/agents-api/observability
// https://code.claude.com/docs/en/agent-sdk/cost-tracking
// https://platform.claude.com/docs/en/build-with-claude/prompt-caching
// https://platform.claude.com/docs/en/api/typescript/messages
// This schema versions our interpretation, not a claim about installed CLI
// versions. Unsupported/missing fields stay unknown; original logs stay local.

const VERSION = 1;
const CHECKED = '2026-10-09';
const COUNTERS = ['input_tokens_total', 'input_tokens_uncached', 'input_tokens_cache_read',
  'input_tokens_cache_write', 'output_tokens_total', 'output_tokens_reasoning', 'total_tokens'];
const RAW_FIELDS = {
  codex: ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens'],
  claude: ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens'],
};
const STATUSES = ['observed', 'partial', 'missing', 'invalid', 'ambiguous'];
const DIAGNOSTICS = ['unsupported_provider', 'invalid_stdout', 'malformed_json_record',
  'duplicate_usage_key', 'multiple_terminal_records', 'multiple_turns', 'missing_terminal',
  'missing_usage', 'invalid_usage_object', 'invalid_counter', 'inconsistent_cache_subset',
  'inconsistent_reasoning_subset', 'inconsistent_total', 'counter_overflow',
  'unsupported_observation', 'inconsistent_observation', 'nonterminal_usage_ignored'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const emptyCounters = () => Object.fromEntries(COUNTERS.map(key => [key, null]));
const unique = values => [...new Set(values)];
const own = (value, key) => object(value) && Object.hasOwn(value, key);

function scope(provider) {
  return provider === 'codex'
    ? { source: 'codex.exec.terminal.usage', counter_scope: 'terminal_turn',
      input_semantics: 'total_includes_cache_read', worker_scope: 'reported_turn_only' }
    : provider === 'claude'
      ? { source: 'claude.code.result.usage', counter_scope: 'terminal_turn_main_loop',
        input_semantics: 'uncached_plus_cache_read_plus_cache_write', worker_scope: 'main_loop_only' }
      : { source: null, counter_scope: 'unknown', input_semantics: 'unknown', worker_scope: 'unknown' };
}

function observation(provider, values = {}) {
  return { version: VERSION, semantics_checked: CHECKED, provider: RAW_FIELDS[provider] ? provider : null,
    ...scope(provider), status: 'missing', counters: emptyCounters(), terminal_records: 0,
    diagnostics: [], raw_usage: [], ...values };
}

// JSON.parse silently accepts repeated object keys. Scan the already validated
// JSON syntax for duplicates affecting terminal selection or usage. Duplicates
// in an invalid report's unrelated content do not hide its measured usage.
function duplicateUsageKeys(text) {
  let position = 0, duplicate = false;
  const whitespace = () => { while (/\s/.test(text[position] ?? '') && position < text.length) position++; };
  function string() {
    const start = position++;
    while (position < text.length) {
      if (text[position++] === '\\') position++;
      else if (text[position - 1] === '"') break;
    }
    return JSON.parse(text.slice(start, position));
  }
  function value(path = [], depth = 0) {
    // A deeply nested provider payload is irrelevant to token counters. Avoid
    // stack exhaustion rather than letting telemetry break a valid report.
    if (depth > 128) { duplicate = true; position = text.length; return; }
    whitespace();
    if (text[position] === '{') {
      position++; whitespace(); const keys = new Set();
      while (position < text.length && text[position] !== '}') {
        const key = string(); whitespace(); position++;
        if (keys.has(key) && ((path.length === 0 && ['type', 'usage'].includes(key)) || path[0] === 'usage')) duplicate = true;
        keys.add(key); value([...path, key], depth + 1); whitespace();
        if (text[position] !== ',') break;
        position++; whitespace();
      }
      position++;
    } else if (text[position] === '[') {
      position++; whitespace();
      while (position < text.length && text[position] !== ']') {
        value([...path, '*'], depth + 1); whitespace();
        if (text[position] !== ',') break;
        position++; whitespace();
      }
      position++;
    } else if (text[position] === '"') string();
    else { while (position < text.length && !/[\s,}\]]/.test(text[position])) position++; }
  }
  value();
  return duplicate;
}

function records(stdout) {
  const events = [], diagnostics = [];
  if (typeof stdout !== 'string') return { events, diagnostics: ['invalid_stdout'] };
  const text = stdout.trim();
  if (!text) return { events, diagnostics };
  const parse = line => {
    try {
      const event = JSON.parse(line);
      if (object(event)) events.push({ event, duplicate: duplicateUsageKeys(line) });
      else diagnostics.push('malformed_json_record');
      return true;
    } catch { return false; }
  };
  if (parse(text)) return { events, diagnostics };
  for (const line of text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
    if (!parse(line) && /^[{[]/.test(line)) diagnostics.push('malformed_json_record');
  }
  return { events, diagnostics };
}

function rawUsage(provider, usage) {
  if (!object(usage)) return null;
  const result = {};
  // Only known numeric/null scalars are copied. Unexpected strings or objects
  // may contain sensitive prose; the preserved stdout, not this ledger, is the
  // full raw evidence. No model names, identifiers, tool data, or text is copied.
  for (const key of RAW_FIELDS[provider]) if (own(usage, key) && (typeof usage[key] === 'number' || usage[key] === null)) result[key] = usage[key];
  if (provider === 'claude' && object(usage.output_tokens_details)) {
    const value = usage.output_tokens_details.thinking_tokens;
    if (typeof value === 'number' || value === null) result.output_tokens_details = { thinking_tokens: value };
  }
  return result;
}

function normalize(provider, usage) {
  const counters = emptyCounters(), diagnostics = [];
  if (usage === undefined || usage === null) return { counters, diagnostics: ['missing_usage'] };
  if (!object(usage)) return { counters, diagnostics: ['invalid_usage_object'] };
  const read = (value, key) => {
    if (!own(value, key) || value[key] === null) return null;
    const number = count(value[key]);
    if (number === null) diagnostics.push('invalid_counter');
    return number;
  };
  const sum = values => {
    if (values.some(value => value === null)) return null;
    const result = count(values.reduce((a, b) => a + b, 0));
    if (result === null) diagnostics.push('counter_overflow');
    return result;
  };
  counters.output_tokens_total = read(usage, 'output_tokens');
  if (provider === 'codex') {
    counters.input_tokens_total = read(usage, 'input_tokens');
    counters.input_tokens_cache_read = read(usage, 'cached_input_tokens');
    counters.output_tokens_reasoning = read(usage, 'reasoning_output_tokens');
    if (counters.input_tokens_cache_read !== null && counters.input_tokens_total !== null) {
      if (counters.input_tokens_cache_read > counters.input_tokens_total) {
        diagnostics.push('inconsistent_cache_subset'); counters.input_tokens_cache_read = null;
      } else counters.input_tokens_uncached = counters.input_tokens_total - counters.input_tokens_cache_read;
    }
    // Codex does not report a separate cache-write count in this schema. An
    // absent write counter is unknown, including when cache reads are zero.
  } else {
    counters.input_tokens_uncached = read(usage, 'input_tokens');
    counters.input_tokens_cache_read = read(usage, 'cache_read_input_tokens');
    counters.input_tokens_cache_write = read(usage, 'cache_creation_input_tokens');
    counters.input_tokens_total = sum([counters.input_tokens_uncached, counters.input_tokens_cache_read, counters.input_tokens_cache_write]);
    if (usage.output_tokens_details !== undefined && usage.output_tokens_details !== null && !object(usage.output_tokens_details)) diagnostics.push('invalid_counter');
    counters.output_tokens_reasoning = read(usage.output_tokens_details, 'thinking_tokens');
  }
  if (counters.output_tokens_reasoning !== null && counters.output_tokens_total !== null && counters.output_tokens_reasoning > counters.output_tokens_total) {
    diagnostics.push('inconsistent_reasoning_subset'); counters.output_tokens_reasoning = null;
  }
  counters.total_tokens = sum([counters.input_tokens_total, counters.output_tokens_total]);
  if (provider === 'codex' && own(usage, 'total_tokens') && usage.total_tokens !== null) {
    const reported = read(usage, 'total_tokens');
    if (reported === null || (counters.total_tokens !== null && reported !== counters.total_tokens)) {
      diagnostics.push('inconsistent_total'); counters.total_tokens = null;
    }
  }
  return { counters, diagnostics: unique(diagnostics) };
}

function measuredStatus(counters, diagnostics) {
  if (!Object.values(counters).some(value => value !== null)) return diagnostics.some(value => value.startsWith('invalid') || value === 'counter_overflow') ? 'invalid' : 'missing';
  return counters.input_tokens_total !== null && counters.output_tokens_total !== null && !diagnostics.length ? 'observed' : 'partial';
}

/** Read only terminal CLI usage; report validity and exit code are independent.
 * More than one terminal is ambiguous, even if the snapshots are identical.
 * Never sum intermediate messages, cumulative modelUsage, or duplicate results.
 */
export function extractUsage(provider, stdout) {
  if (!Object.hasOwn(RAW_FIELDS, provider)) return observation(null, { diagnostics: ['unsupported_provider'] });
  const parsed = records(stdout);
  // A duplicate type may overwrite a terminal with a nonterminal type. Check
  // every parsed event before filtering, so the hidden terminal cannot escape
  // ambiguity detection through JSON.parse's last-key-wins behavior.
  if (parsed.events.some(record => record.duplicate)) parsed.diagnostics.push('duplicate_usage_key');
  const terminals = parsed.events.filter(({ event }) => provider === 'codex'
    ? ['turn.completed', 'turn.failed'].includes(event.type) : event.type === 'result');
  const raw = terminals.map(({ event }) => rawUsage(provider, event.usage));
  const result = observation(provider, { terminal_records: terminals.length, raw_usage: raw });
  if (terminals.length > 1) return { ...result, status: 'ambiguous', diagnostics: unique([...parsed.diagnostics, 'multiple_terminal_records']) };
  if (!terminals.length) return { ...result, status: parsed.diagnostics.includes('duplicate_usage_key') ? 'ambiguous' : 'missing', diagnostics: unique([...parsed.diagnostics, 'missing_terminal',
    ...(parsed.events.some(({ event }) => own(event, 'usage') || own(event.message, 'usage')) ? ['nonterminal_usage_ignored'] : [])]) };
  const normalized = normalize(provider, terminals[0].event.usage);
  const diagnostics = unique([...parsed.diagnostics, ...normalized.diagnostics]);
  if (provider === 'codex' && parsed.events.filter(({ event }) => event.type === 'turn.started').length > 1) diagnostics.push('multiple_turns');
  // A broken JSON event can conceal another terminal. Keep raw known counters
  // privately, but do not publish an arbitrarily chosen attempt total.
  const ambiguous = diagnostics.some(value => ['malformed_json_record', 'duplicate_usage_key', 'multiple_turns'].includes(value));
  return { ...result, counters: ambiguous ? emptyCounters() : normalized.counters,
    status: ambiguous ? 'ambiguous' : measuredStatus(normalized.counters, normalized.diagnostics), diagnostics };
}

/** Display-safe view. Revalidate persisted counters and do not copy arbitrary
 * raw data, diagnostics, identifiers, model names, or provider prose to stdout.
 */
export function usageView(value) {
  const supported = object(value) && value.version === VERSION && Object.hasOwn(RAW_FIELDS, value.provider)
    && value.source === scope(value.provider).source && value.counter_scope === scope(value.provider).counter_scope
    && STATUSES.includes(value.status);
  const base = observation(supported ? value.provider : null);
  const { raw_usage: _raw, ...view } = base;
  view.diagnostics = supported ? unique((Array.isArray(value.diagnostics) ? value.diagnostics : []).filter(item => DIAGNOSTICS.includes(item))) : ['unsupported_observation'];
  if (supported) {
    view.terminal_records = count(value.terminal_records) ?? 0;
    view.status = value.status;
    if (['observed', 'partial'].includes(value.status)) {
      view.counters = Object.fromEntries(COUNTERS.map(key => [key, count(value.counters?.[key])]));
      const c = view.counters;
      const invalid = COUNTERS.some(key => value.counters?.[key] !== null && value.counters?.[key] !== undefined && c[key] === null)
        || (c.output_tokens_reasoning !== null && c.output_tokens_total !== null && c.output_tokens_reasoning > c.output_tokens_total)
        || (c.input_tokens_cache_read !== null && c.input_tokens_total !== null && c.input_tokens_cache_read > c.input_tokens_total)
        || (c.total_tokens !== null && c.input_tokens_total !== null && c.output_tokens_total !== null && c.total_tokens !== c.input_tokens_total + c.output_tokens_total)
        || (value.provider === 'codex' && c.input_tokens_total !== null && c.input_tokens_cache_read !== null && c.input_tokens_uncached !== null && c.input_tokens_total !== c.input_tokens_cache_read + c.input_tokens_uncached)
        || (value.provider === 'claude' && [c.input_tokens_total, c.input_tokens_uncached, c.input_tokens_cache_read, c.input_tokens_cache_write].every(n => n !== null) && c.input_tokens_total !== c.input_tokens_uncached + c.input_tokens_cache_read + c.input_tokens_cache_write);
      if (invalid || view.terminal_records !== 1) {
        view.counters = emptyCounters(); view.status = 'invalid'; view.diagnostics.push('inconsistent_observation');
      } else view.status = measuredStatus(view.counters, view.diagnostics);
    }
  }
  view.unknown_counters = COUNTERS.filter(key => view.counters[key] === null);
  return view;
}

function coveredSum(values) {
  const known = values.map(count).filter(value => value !== null);
  const summed = known.length ? count(known.reduce((a, b) => a + b, 0)) : null;
  return { observed_sum: summed, observed_attempts: known.length, unknown_attempts: values.length - known.length,
    complete: values.length > 0 && known.length === values.length && summed !== null,
    overflow: known.length > 0 && summed === null };
}

/** Aggregate distinct recorded worker attempts, including failures/retries.
 * Legacy raw attempt.usage has no declared scope and is deliberately ignored.
 * Call counts are runner attempts, not unobservable internal provider requests.
 * A duplicated attempt number makes its token/duration records ambiguous.
 */
export function aggregateUsage(attempts) {
  const rows = Array.isArray(attempts) ? attempts : [];
  const numbers = new Map();
  for (const row of rows) if (count(row?.number) !== null) numbers.set(row.number, (numbers.get(row.number) ?? 0) + 1);
  const duplicate = row => count(row?.number) !== null && numbers.get(row.number) > 1;
  const views = rows.map(row => usageView(duplicate(row) ? null : row?.usage_observation));
  const stages = new Map(); let retries = 0, retryUnknown = 0;
  for (const row of rows) {
    if (typeof row?.stage !== 'string' || !row.stage || duplicate(row)) { retryUnknown++; continue; }
    if (stages.has(row.stage)) retries++;
    stages.set(row.stage, true);
  }
  return { version: VERSION, scope: 'recorded_worker_attempts_only', counter_scope: 'observed_terminal_turns',
    coordinator: { status: 'unobserved', includes_research_and_synthesis: false },
    provider_internal_calls: null, subscription_cost: null, savings: null,
    attempts: { recorded: rows.length, succeeded: rows.filter(row => row?.status === 'succeeded').length,
      failed: rows.filter(row => row?.status === 'failed').length, running: rows.filter(row => row?.status === 'running').length,
      interrupted: rows.filter(row => row?.status === 'interrupted').length,
      unknown_outcome: rows.filter(row => !['succeeded', 'failed', 'running', 'interrupted'].includes(row?.status)).length,
      retries, retry_unknown: retryUnknown, duplicate_numbers: [...numbers.values()].filter(n => n > 1).length },
    usage_coverage: Object.fromEntries(STATUSES.map(status => [status, views.filter(view => view.status === status).length])),
    counters: Object.fromEntries(COUNTERS.map(key => [key, coveredSum(views.map(view => view.counters[key]))])),
    elapsed_ms: coveredSum(rows.map(row => duplicate(row) ? null : row?.elapsed_ms)),
  };
}
