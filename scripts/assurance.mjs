// Optional, coordinator-recorded QA evidence. Pure and bounded: no I/O or calls.
// These checks establish traceability, never execution or production readiness.
import crypto from 'node:crypto';

export const ASSURANCE_LIMITS = Object.freeze({ checks: 400, decisions: 1050, references: 100, sources: 500, findings: 1050, text: 8000, contract_bytes: 524288, catalog_bytes: 4194304, plan_bytes: 1048576, depth: 12, values: 30000, issues: 100 });
const L = ASSURANCE_LIMITS;
const idPattern = '^[A-Za-z][A-Za-z0-9_.:-]{0,127}$';
const id = { type: 'string', pattern: idPattern, maxLength: 128 };
const text = { type: 'string', minLength: 1, maxLength: L.text };
const digestSchema = { type: 'string', pattern: '^[a-f0-9]{64}$', minLength: 64, maxLength: 64 };
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const evidenceReference = object({ source_id: id, sha256: digestSchema });
const evidenceList = { type: 'array', maxItems: L.references, uniqueItems: true, items: evidenceReference };
const observation = object({
  method: text, environment: text, revision: text,
  observed_at: { type: 'string', format: 'date-time', maxLength: 24 },
  result: { enum: ['passed', 'failed'] }, evidence: { ...evidenceList, minItems: 1 },
});
const statuses = ['proposed', 'passed', 'failed', 'blocked', 'not_applicable'];
export const ASSURANCE_SCHEMA = object({
  version: { const: 1 }, plan_sha256: digestSchema,
  selected_option: object({ id, quote: text }),
  accepted_decisions: { type: 'array', maxItems: L.decisions, items: object({ finding_id: id, quote: text }) },
  checks: { type: 'array', minItems: 1, maxItems: L.checks, items: object({
    id, kind: { enum: ['claim', 'acceptance'] }, quote: text, status: { enum: statuses }, reason: text,
    evidence: evidenceList, observation,
    finding_ids: { type: 'array', maxItems: L.references, uniqueItems: true, items: id },
  }, ['id', 'kind', 'quote', 'status', 'reason', 'evidence']) },
});
const limitation = 'Exact anchors, plan hashes and current supplied evidence references establish recorded structure only. Observations are coordinator-recorded assertions, not independently attested execution or semantic proof. ready_for_review means the recorded contract is ready for peer inspection, not implementation, publication or production certification. The peer must inspect evidence, operative meaning, selected alternatives, coverage and correctness.';
const required = (ok, message) => { if (!ok) throw new Error(message); };
const own = (value, key) => Object.hasOwn(value, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const safeId = value => typeof value === 'string' && new RegExp(idPattern).test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0 && value.length <= L.text && !value.includes('\0');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const sorted = values => [...new Set(values)].sort();

// Reject duplicate JSON keys before parsing can erase conflicting declarations.
// The runner also uses this for the containing decisions document. Its existing
// 1 MiB file limit is the maximum supported cap; contract validation stays 512 KiB.
export function parseBoundedJSON(value, { maxBytes = L.contract_bytes } = {}) {
  required(typeof value === 'string', 'JSON document must be text');
  required(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= L.plan_bytes, 'JSON byte limit must be positive and no larger than 1 MiB');
  required(Buffer.byteLength(value) <= maxBytes, 'JSON document exceeds its byte limit');
  let offset = 0, count = 0;
  const token = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null|[\[\]{}:,]/y;
  const next = () => {
    while (offset < value.length && /[\x20\t\r\n]/.test(value[offset])) offset++;
    token.lastIndex = offset;
    const found = token.exec(value);
    required(found, 'assurance contains invalid JSON');
    offset = token.lastIndex;
    return found[0];
  };
  const parse = (first, depth) => {
    required(depth <= L.depth && ++count <= L.values, 'assurance exceeds its nesting or value limit');
    if (first === '{') {
      const result = Object.create(null), keys = new Set();
      let key = next();
      if (key === '}') return result;
      while (true) {
        required(key.startsWith('"'), 'assurance contains an invalid JSON object');
        const name = JSON.parse(key);
        required(!keys.has(name), 'assurance contains duplicate object keys');
        keys.add(name);
        required(keys.size <= L.values && next() === ':', 'assurance contains an invalid JSON object');
        result[name] = parse(next(), depth + 1);
        const separator = next();
        if (separator === '}') return result;
        required(separator === ',', 'assurance contains an invalid JSON object');
        key = next();
      }
    }
    if (first === '[') {
      const result = [];
      let item = next();
      if (item === ']') return result;
      while (true) {
        result.push(parse(item, depth + 1));
        const separator = next();
        if (separator === ']') return result;
        required(separator === ',', 'assurance contains an invalid JSON array');
        item = next();
      }
    }
    required(!['}', ']', ':', ','].includes(first), 'assurance contains an invalid JSON value');
    const result = JSON.parse(first);
    required(typeof result !== 'number' || Number.isFinite(result), 'assurance contains a nonfinite number');
    return result;
  };
  const result = parse(next(), 0);
  required(/^[\x20\t\r\n]*$/.test(value.slice(offset)), 'assurance contains trailing JSON content');
  return result;
}

// Reject authored behavior, cycles and sparse arrays before serializing data.
function boundedData(value, label, maxBytes = L.contract_bytes) {
  const active = new Set();
  let count = 0, bytes = 0;
  const visit = (item, depth) => {
    required(depth <= L.depth && ++count <= L.values, `${label} exceeds its nesting or value limit`);
    if (item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) return;
    if (typeof item === 'string') {
      bytes += Buffer.byteLength(item);
      required(bytes <= maxBytes, `${label} exceeds its byte limit`);
      return;
    }
    required(Array.isArray(item) || plain(item), `${label} must contain plain JSON data`);
    required(!active.has(item), `${label} contains a cycle`);
    active.add(item);
    const keys = Reflect.ownKeys(item);
    required(keys.length <= L.values, `${label} exceeds its value limit`);
    if (Array.isArray(item)) required(Object.getPrototypeOf(item) === Array.prototype && item.length <= L.values && keys.length === item.length + 1, `${label} contains an invalid array`);
    for (const key of keys) {
      if (Array.isArray(item) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      required(typeof key === 'string' && descriptor.enumerable && own(descriptor, 'value'), `${label} must contain plain JSON data`);
      if (Array.isArray(item)) required(/^(?:0|[1-9][0-9]*)$/.test(key) && Number(key) < item.length, `${label} contains an invalid array`);
      bytes += Buffer.byteLength(key);
      required(bytes <= maxBytes, `${label} exceeds its byte limit`);
      visit(descriptor.value, depth + 1);
    }
    active.delete(item);
  };
  visit(value, 0);
  required(Buffer.byteLength(JSON.stringify(value)) <= maxBytes, `${label} exceeds its byte limit`);
  return value;
}
function fields(value, allowed, mandatory, label) {
  required(plain(value) && Object.keys(value).every(key => allowed.includes(key)) && mandatory.every(key => own(value, key)), `${label} has missing or unsupported fields`);
}
function list(value, max, label) {
  required(Array.isArray(value) && value.length <= max, `${label} must be a bounded array`);
  return value;
}
function refs(value) {
  list(value, L.references, 'Evidence references');
  const seen = new Set();
  for (const ref of value) {
    fields(ref, ['source_id', 'sha256'], ['source_id', 'sha256'], 'Evidence reference');
    required(safeId(ref.source_id) && digest(ref.sha256) && !seen.has(ref.source_id), 'Evidence references need unique source IDs and lowercase SHA-256 digests');
    seen.add(ref.source_id);
  }
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === (value.length === 20 ? value.replace('Z', '.000Z') : value);
}
function optionMentionsId(quote, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`).test(quote);
}
function initialResult() {
  return { status: 'not_recorded', readiness: 'incomplete', issues: [], issues_truncated: false,
    counts: { checks: 0, claim: 0, acceptance: 0, proposed: 0, passed: 0, failed: 0, blocked: 0, not_applicable: 0, accepted_decisions: 0 },
    evidence_receipts: [], full_context_required: true, limitation };
}

/**
 * knownSources contains only supplied sources whose hashes the caller verified.
 * Optional source content is checked here too; a path/label never proves a test ran.
 * findings contains known report finding objects. No input is changed.
 */
export function checkAssurance(options = {}, { now = Date.now() } = {}) {
  const result = initialResult();
  const issue = (code, node, reference) => {
    if (result.issues.length < L.issues) result.issues.push({ code, ...(node ? { node } : {}), ...(reference ? { reference } : {}) });
    else result.issues_truncated = true;
  };
  try {
    fields(options, ['assurance', 'finalPlan', 'decisions', 'knownSources', 'findings'], [], 'Assurance input');
    for (const key of Reflect.ownKeys(options)) required(typeof key === 'string' && own(Object.getOwnPropertyDescriptor(options, key), 'value'), 'Assurance input must contain plain data fields');
    if (options.assurance === undefined) return result;
    result.status = 'invalid';
    required(typeof now === 'number' && Number.isFinite(now), 'Assurance observation clock must be a finite timestamp');
    const contract = typeof options.assurance === 'string' ? parseBoundedJSON(options.assurance) : boundedData(options.assurance, 'assurance');
    fields(contract, ['version', 'plan_sha256', 'selected_option', 'accepted_decisions', 'checks'], ['version', 'plan_sha256', 'selected_option', 'accepted_decisions', 'checks'], 'assurance');
    required(contract.version === 1 && digest(contract.plan_sha256), 'assurance needs version 1 and a lowercase plan SHA-256 digest');
    const plan = options.finalPlan;
    required(typeof plan === 'string' && plan.trim() && !plan.includes('\0') && Buffer.byteLength(plan) <= L.plan_bytes, 'Full current plan must be nonempty bounded text');
    const sources = list(boundedData(options.knownSources ?? [], 'Source catalog', L.catalog_bytes), L.sources, 'Source catalog');
    const sourceById = new Map();
    for (const source of sources) {
      fields(source, ['id', 'sha256', 'revision', 'content'], ['id', 'sha256'], 'Source');
      required(safeId(source.id) && digest(source.sha256) && !sourceById.has(source.id), 'Source catalog needs unique IDs and lowercase SHA-256 digests');
      required(!own(source, 'revision') || nonempty(source.revision), 'Source revision must be nonempty bounded text');
      if (own(source, 'content')) {
        required(typeof source.content === 'string' && !source.content.includes('\0'), 'Source content must be text');
        if (sha(source.content) !== source.sha256) issue('source_content_hash_mismatch', undefined, source.id);
      }
      sourceById.set(source.id, source);
    }
    const findings = list(boundedData(options.findings ?? [], 'Finding catalog', L.catalog_bytes), L.findings, 'Finding catalog');
    const findingIds = new Set();
    for (const finding of findings) {
      required(plain(finding) && safeId(finding.id) && !findingIds.has(finding.id), 'Finding catalog needs unique IDs');
      findingIds.add(finding.id);
    }
    const decisions = list(boundedData(options.decisions ?? [], 'Decision catalog', L.catalog_bytes), L.decisions, 'Decision catalog');
    const decisionById = new Map();
    for (const decision of decisions) {
      fields(decision, ['finding_id', 'disposition', 'rationale'], ['finding_id', 'disposition', 'rationale'], 'Decision');
      required(safeId(decision.finding_id) && !decisionById.has(decision.finding_id), 'Decision catalog needs unique finding IDs');
      required(['accepted', 'rejected', 'unresolved'].includes(decision.disposition) && nonempty(decision.rationale) && decision.rationale.trim().length >= 12, 'Decision needs a valid disposition and substantive bounded rationale');
      decisionById.set(decision.finding_id, decision);
      if (!findingIds.has(decision.finding_id)) issue('decision_finding_missing', undefined, decision.finding_id);
    }
    if (sha(plan) !== contract.plan_sha256) issue('plan_hash_mismatch');
    const anchor = (quote, node, field) => {
      required(nonempty(quote), 'Plan anchor must be nonempty bounded text');
      const first = plan.indexOf(quote);
      if (first < 0) issue('plan_anchor_missing', node, field);
      else if (plan.indexOf(quote, first + 1) >= 0) issue('plan_anchor_ambiguous', node, field);
    };
    fields(contract.selected_option, ['id', 'quote'], ['id', 'quote'], 'Selected option');
    required(safeId(contract.selected_option.id), 'Selected option needs a valid ID');
    anchor(contract.selected_option.quote, undefined, 'selected_option');
    if (!optionMentionsId(contract.selected_option.quote, contract.selected_option.id)) issue('selected_option_id_mismatch', undefined, contract.selected_option.id);
    list(contract.accepted_decisions, L.decisions, 'Accepted decision anchors');
    const acceptedIds = new Set();
    for (const accepted of contract.accepted_decisions) {
      fields(accepted, ['finding_id', 'quote'], ['finding_id', 'quote'], 'Accepted decision anchor');
      required(safeId(accepted.finding_id) && !acceptedIds.has(accepted.finding_id), 'Accepted decision anchors need unique finding IDs');
      acceptedIds.add(accepted.finding_id);
      anchor(accepted.quote, accepted.finding_id, 'accepted_decision');
      if (decisionById.get(accepted.finding_id)?.disposition !== 'accepted') issue('accepted_decision_disposition_mismatch', accepted.finding_id);
    }
    for (const decision of decisions) if (decision.disposition === 'accepted' && !acceptedIds.has(decision.finding_id)) issue('accepted_decision_anchor_missing', decision.finding_id);
    result.counts.accepted_decisions = acceptedIds.size;
    list(contract.checks, L.checks, 'Assurance checks');
    required(contract.checks.length > 0, 'assurance must record at least one check');
    const checkIds = new Set(), receiptById = new Map();
    const evidence = (references, checkId) => {
      refs(references);
      for (const ref of references) {
        const source = sourceById.get(ref.source_id);
        if (!source) issue('evidence_source_missing', checkId, ref.source_id);
        else if (source.sha256 !== ref.sha256) issue('evidence_hash_mismatch', checkId, ref.source_id);
        else if (!own(source, 'content') || sha(source.content) === source.sha256) receiptById.set(ref.source_id, { source_id: ref.source_id, sha256: ref.sha256 });
      }
    };
    for (const check of contract.checks) {
      fields(check, ['id', 'kind', 'quote', 'status', 'reason', 'evidence', 'observation', 'finding_ids'], ['id', 'kind', 'quote', 'status', 'reason', 'evidence'], 'Assurance check');
      required(safeId(check.id) && !checkIds.has(check.id), 'Assurance checks need unique IDs');
      checkIds.add(check.id);
      required(['claim', 'acceptance'].includes(check.kind) && statuses.includes(check.status), 'Assurance check kind or status is invalid');
      required(nonempty(check.reason), 'Each assurance check needs a bounded reason');
      anchor(check.quote, check.id, 'check');
      evidence(check.evidence, check.id);
      if (own(check, 'finding_ids')) {
        list(check.finding_ids, L.references, 'Check finding references');
        required(check.finding_ids.every(safeId) && new Set(check.finding_ids).size === check.finding_ids.length, 'Check finding references need unique valid IDs');
        for (const ref of check.finding_ids) if (!findingIds.has(ref)) issue('check_finding_missing', check.id, ref);
      }
      const terminal = ['passed', 'failed'].includes(check.status);
      if (terminal && !check.evidence.length) issue('check_evidence_missing', check.id);
      if (terminal && !own(check, 'observation')) issue('check_observation_missing', check.id);
      if (!terminal && own(check, 'observation')) issue('unobserved_status_has_observation', check.id);
      if (own(check, 'observation')) {
        const observed = check.observation;
        fields(observed, ['method', 'environment', 'revision', 'observed_at', 'result', 'evidence'], ['method', 'environment', 'revision', 'observed_at', 'result', 'evidence'], 'Check observation');
        required(['method', 'environment', 'revision'].every(field => nonempty(observed[field])) && timestamp(observed.observed_at) && ['passed', 'failed'].includes(observed.result), 'Check observation needs bounded method, environment, revision, a real UTC timestamp and result');
        if (Date.parse(observed.observed_at) > now) issue('observation_future_dated', check.id);
        evidence(observed.evidence, check.id);
        if (!observed.evidence.length) issue('observation_evidence_missing', check.id);
        if (observed.result !== check.status) issue('observation_result_mismatch', check.id);
        for (const ref of observed.evidence) if (!check.evidence.some(item => item.source_id === ref.source_id && item.sha256 === ref.sha256)) issue('observation_evidence_unlinked', check.id, ref.source_id);
      }
      result.counts.checks++;
      result.counts[check.kind]++;
      result.counts[check.status]++;
    }
    result.evidence_receipts = sorted(receiptById.keys()).map(key => receiptById.get(key));
    if (!result.issues.length) result.status = 'recorded';
    result.readiness = result.issues.length || result.counts.failed ? 'needs_changes'
      : result.counts.proposed || result.counts.blocked || result.counts.passed === 0 ? 'incomplete' : 'ready_for_review';
  } catch (error) {
    result.status = 'invalid';
    result.readiness = 'needs_changes';
    issue('invalid_structure');
    // Only fixed labels enter error messages, never authored quotes or reasons.
    result.detail = error instanceof Error ? error.message.slice(0, 300) : 'Invalid assurance contract';
  }
  return result;
}
