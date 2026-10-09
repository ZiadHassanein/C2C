// Optional plan traceability, not semantic coverage, execution authority or readiness.
// Pure, bounded and read-only: callers retain the full plan, sources and dissent.
export const PLAN_QUALITY_LIMITS = Object.freeze({ nodes: 400, references: 100, sources: 500, findings: 1050, artifacts: 100, text: 8000, map_bytes: 524288, plan_bytes: 1048576, depth: 12, values: 25000, issues: 100 });
const L = PLAN_QUALITY_LIMITS;
const idPattern = '^[A-Za-z][A-Za-z0-9_.:-]{0,127}$';
const id = { type: 'string', pattern: idPattern, maxLength: 128 };
const text = { type: 'string', minLength: 1, maxLength: L.text };
const refs = { type: 'array', maxItems: L.references, uniqueItems: true, items: id };
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const kinds = {
  requirement: {},
  assumption: { state: { enum: ['assumed', 'unknown', 'resolved', 'deferred'] }, unknown_type: { enum: ['factual_gap', 'user_choice'] } },
  decision: { findings: refs },
  step: { boundary: text, output: text },
  check: { status: { enum: ['proposed', 'executed', 'blocked'] }, reason: text },
};
const requiredExtra = { requirement: [], assumption: ['state'], decision: [], step: ['boundary', 'output'], check: ['status'] };
export const PLAN_MAP_SCHEMA = object({
  version: { const: 1 },
  nodes: { type: 'array', minItems: 1, maxItems: L.nodes, items: { oneOf: Object.entries(kinds).map(([kind, extra]) => object(
    { id, kind: { const: kind }, quote: text, requires: refs, sources: refs, ...extra }, ['id', 'kind', 'quote', 'requires', ...requiredExtra[kind]],
  )) } },
});
const limitation = 'Recorded links and exact plan excerpts establish structure only, not factual truth, sufficient coverage, feasibility, authorization, executed validation or readiness. Retain the complete current plan, source excerpts and every finding/disposition, including rejected and unresolved concerns.';
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const safeId = value => typeof value === 'string' && new RegExp(idPattern).test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0 && value.length <= L.text && !value.includes('\0');
const sorted = values => [...new Set(values)].sort();
const own = (value, key) => Object.hasOwn(value, key);

// JSON strings are optional; this parser rejects duplicate keys before JSON.parse
// can erase them. It also bounds nesting/work and never assigns __proto__.
function parseBounded(value) {
  requireThat(Buffer.byteLength(value) <= L.map_bytes, 'plan_map exceeds its byte limit');
  let offset = 0, count = 0;
  const token = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null|[\[\]{}:,]/y;
  const next = () => {
    while (offset < value.length && /[\x20\t\r\n]/.test(value[offset])) offset++;
    token.lastIndex = offset;
    const found = token.exec(value);
    requireThat(found, 'plan_map contains invalid JSON');
    offset = token.lastIndex;
    return found[0];
  };
  const parse = (first, depth) => {
    requireThat(depth <= L.depth && ++count <= L.values, 'plan_map exceeds its nesting or value limit');
    if (first === '{') {
      const result = Object.create(null), keys = new Set();
      let key = next();
      if (key === '}') return result;
      while (true) {
        requireThat(key.startsWith('"'), 'plan_map contains an invalid JSON object');
        const name = JSON.parse(key);
        requireThat(!keys.has(name), 'plan_map contains duplicate object keys');
        keys.add(name);
        requireThat(keys.size <= L.values && next() === ':', 'plan_map contains an invalid JSON object');
        result[name] = parse(next(), depth + 1);
        const separator = next();
        if (separator === '}') return result;
        requireThat(separator === ',', 'plan_map contains an invalid JSON object');
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
        requireThat(separator === ',', 'plan_map contains an invalid JSON array');
        item = next();
      }
    }
    requireThat(!['}', ']', ':', ','].includes(first), 'plan_map contains an invalid JSON value');
    const result = JSON.parse(first);
    requireThat(typeof result !== 'number' || Number.isFinite(result), 'plan_map contains a nonfinite number');
    return result;
  };
  const result = parse(next(), 0);
  requireThat(/^[\x20\t\r\n]*$/.test(value.slice(offset)), 'plan_map contains trailing JSON content');
  return result;
}

// Accept only JSON data. Bound before serialization, rejecting cycles, getters,
// sparse arrays and custom prototypes rather than invoking authored behavior.
function boundedData(value, label, maxBytes = L.map_bytes) {
  const active = new Set();
  let count = 0, bytes = 0;
  const visit = (item, depth) => {
    requireThat(depth <= L.depth && ++count <= L.values, `${label} exceeds its nesting or value limit`);
    if (item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) return;
    if (typeof item === 'string') {
      bytes += Buffer.byteLength(item);
      requireThat(bytes <= maxBytes, `${label} exceeds its byte limit`);
      return;
    }
    requireThat(Array.isArray(item) || plain(item), `${label} must contain plain JSON data`);
    requireThat(!active.has(item), `${label} contains a cycle`);
    active.add(item);
    const keys = Reflect.ownKeys(item);
    requireThat(keys.length <= L.values, `${label} exceeds its value limit`);
    if (Array.isArray(item)) requireThat(Object.getPrototypeOf(item) === Array.prototype && item.length <= L.values && keys.length === item.length + 1, `${label} contains an invalid array`);
    for (const key of keys) {
      if (Array.isArray(item) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      requireThat(typeof key === 'string' && descriptor.enumerable && own(descriptor, 'value'), `${label} must contain plain JSON data`);
      if (Array.isArray(item)) requireThat(/^(?:0|[1-9][0-9]*)$/.test(key) && Number(key) < item.length, `${label} contains an invalid array`);
      bytes += Buffer.byteLength(key);
      requireThat(bytes <= maxBytes, `${label} exceeds its byte limit`);
      visit(descriptor.value, depth + 1);
    }
    active.delete(item);
  };
  visit(value, 0);
  requireThat(Buffer.byteLength(JSON.stringify(value)) <= maxBytes, `${label} exceeds its byte limit`);
  return value;
}
function list(value, max, label) {
  requireThat(Array.isArray(value) && value.length <= max, `${label} must be a bounded array`);
  return value;
}
function fields(value, allowed, required, label) {
  requireThat(plain(value) && Object.keys(value).every(key => allowed.includes(key)) && required.every(key => own(value, key)), `${label} has missing or unsupported fields`);
}
function registry(values, type) {
  const isSource = type === 'source';
  boundedData(values, `${type} catalog`, isSource ? L.map_bytes : 2 * L.map_bytes);
  list(values, isSource ? L.sources : L.findings, `${type} catalog`);
  const result = new Map();
  for (const item of values) {
    fields(item, isSource ? ['id', 'sha256', 'revision'] : ['id', 'disposition', 'rationale'], isSource ? ['id'] : ['id', 'disposition', 'rationale'], `${type} entry`);
    requireThat(safeId(item.id) && !result.has(item.id), `Invalid or duplicate ${type} ID`);
    if (isSource) {
      requireThat(!own(item, 'sha256') || digest(item.sha256), 'Source sha256 must be a lowercase SHA-256 digest');
      requireThat(!own(item, 'revision') || nonempty(item.revision), 'Source revision must be nonempty bounded text');
    } else {
      requireThat(['accepted', 'rejected', 'unresolved'].includes(item.disposition) && nonempty(item.rationale) && item.rationale.trim().length >= 12, 'Finding disposition needs a substantive bounded rationale');
    }
    result.set(item.id, item);
  }
  return result;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
  return plain(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function descendants(seeds, dependents) {
  const seen = new Set(seeds), queue = [...seeds];
  for (let index = 0; index < queue.length; index++) {
    for (const next of dependents.get(queue[index]) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return seen;
}
function analyze(options) {
  const { planMap, planText, sources = [], findings = [] } = options;
  const result = { status: 'not_recorded', issues: [], issues_truncated: false, counts: {}, gated_steps: [], finding_links: [], full_context_required: true, limitation };
  if (planMap === undefined) return { result };
  result.status = 'invalid';
  const issue = (code, node = undefined, reference = undefined) => {
    if (result.issues.length < L.issues) result.issues.push({ code, ...(node ? { node } : {}), ...(reference ? { reference } : {}) });
    else result.issues_truncated = true;
  };
  let map, nodes, sourceById, findingById, dependents;
  try {
    map = typeof planMap === 'string' ? parseBounded(planMap) : boundedData(planMap, 'plan_map');
    fields(map, ['version', 'nodes'], ['version', 'nodes'], 'plan_map');
    requireThat(map.version === 1, 'plan_map version must be 1');
    list(map.nodes, L.nodes, 'plan_map nodes');
    requireThat(map.nodes.length > 0, 'plan_map must record nodes');
    requireThat(typeof planText === 'string' && planText.trim() && !planText.includes('\0') && Buffer.byteLength(planText) <= L.plan_bytes, 'Full current plan text must be nonempty bounded text');
    sourceById = registry(sources, 'source');
    findingById = registry(findings, 'finding');
    nodes = new Map();
    const refList = (values, label) => {
      list(values, L.references, label);
      requireThat(values.every(safeId) && new Set(values).size === values.length, `${label} has invalid or duplicate IDs`);
    };
    for (const node of map.nodes) {
      requireThat(plain(node) && safeId(node.id) && !nodes.has(node.id), 'Invalid or duplicate plan node ID');
      requireThat(own(kinds, node.kind), 'Unknown plan node kind');
      fields(node, ['id', 'kind', 'quote', 'requires', 'sources', ...Object.keys(kinds[node.kind])], ['id', 'kind', 'quote', 'requires', ...requiredExtra[node.kind]], `Node ${node.id}`);
      requireThat(nonempty(node.quote), `Node ${node.id} needs a bounded plan quote`);
      refList(node.requires, `Node ${node.id} prerequisites`);
      if (own(node, 'sources')) refList(node.sources, `Node ${node.id} sources`);
      if (own(node, 'findings')) refList(node.findings, `Node ${node.id} findings`);
      for (const field of ['boundary', 'output', 'reason']) if (own(node, field)) requireThat(nonempty(node[field]), `Node ${node.id} needs bounded ${field}`);
      if (node.kind === 'assumption') {
        requireThat(['assumed', 'unknown', 'resolved', 'deferred'].includes(node.state), `Node ${node.id} has an invalid assumption state`);
        requireThat(!own(node, 'unknown_type') || ['factual_gap', 'user_choice'].includes(node.unknown_type), `Node ${node.id} has an invalid unknown type`);
      }
      if (node.kind === 'check') requireThat(['proposed', 'executed', 'blocked'].includes(node.status), `Node ${node.id} has an invalid check status`);
      nodes.set(node.id, node);
      result.counts[node.kind] = (result.counts[node.kind] ?? 0) + 1;
    }
    for (const kind of ['requirement', 'decision', 'step', 'check']) if (!result.counts[kind]) issue('node_kind_missing', undefined, kind);
    dependents = new Map([...nodes.keys()].map(key => [key, []]));
    const allowed = { requirement: ['assumption'], assumption: [], decision: ['requirement', 'assumption', 'decision'], step: ['decision', 'step', 'assumption'], check: ['step'] };
    const linkedFindings = new Set();
    for (const node of nodes.values()) {
      for (const field of ['quote', 'boundary', 'output', 'reason']) if (own(node, field) && !planText.includes(node[field])) issue('plan_anchor_missing', node.id, field);
      for (const ref of node.requires) {
        if (!nodes.has(ref)) issue('prerequisite_missing', node.id, ref);
        else {
          dependents.get(ref).push(node.id);
          if (!allowed[node.kind].includes(nodes.get(ref).kind)) issue('prerequisite_kind_invalid', node.id, ref);
        }
      }
      for (const ref of node.sources ?? []) if (!sourceById.has(ref)) issue('source_missing', node.id, ref);
      for (const ref of node.findings ?? []) {
        if (!findingById.has(ref)) issue('finding_missing', node.id, ref);
        else linkedFindings.add(ref);
      }
      if (node.kind === 'requirement' && !(node.sources?.length || node.requires.some(ref => nodes.get(ref)?.kind === 'assumption'))) issue('requirement_support_missing', node.id);
      if (node.kind === 'assumption' && node.state === 'resolved' && !node.sources?.length) issue('resolved_assumption_evidence_missing', node.id);
      if (node.kind === 'decision' && !node.requires.some(ref => nodes.get(ref)?.kind === 'requirement')) issue('decision_requirement_missing', node.id);
      if (node.kind === 'step' && !node.requires.some(ref => nodes.get(ref)?.kind === 'decision')) issue('step_decision_missing', node.id);
      if (node.kind === 'check' && !node.requires.length) issue('check_step_missing', node.id);
      if (node.kind === 'check' && node.status === 'executed' && !node.sources?.length) issue('executed_check_evidence_missing', node.id);
      if (node.kind === 'check' && node.status === 'blocked' && !node.reason) issue('blocked_check_reason_missing', node.id);
    }
    // Kahn's algorithm is iterative even for hostile long dependency chains.
    const indegree = new Map([...nodes].map(([key, node]) => [key, node.requires.filter(ref => nodes.has(ref)).length]));
    const queue = [...indegree].filter(([, n]) => n === 0).map(([key]) => key);
    for (let index = 0; index < queue.length; index++) for (const next of dependents.get(queue[index])) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
    if (queue.length !== nodes.size) issue('dependency_cycle');
    for (const node of nodes.values()) {
      if (['requirement', 'decision'].includes(node.kind) && ![...descendants([node.id], dependents)].some(ref => nodes.get(ref).kind === 'step')) issue('linked_step_missing', node.id);
      if (node.kind === 'step' && !dependents.get(node.id).some(ref => nodes.get(ref).kind === 'check')) issue('acceptance_check_missing', node.id);
    }
    for (const [ref, finding] of findingById) {
      if (!linkedFindings.has(ref)) issue('finding_link_missing', undefined, ref);
      result.finding_links.push({ id: ref, disposition: finding.disposition, nodes: sorted([...nodes.values()].filter(node => node.findings?.includes(ref)).map(node => node.id)) });
    }
    const gates = new Map();
    for (const node of nodes.values()) if (node.kind === 'assumption' && node.state === 'unknown') {
      for (const ref of descendants([node.id], dependents)) if (nodes.get(ref)?.kind === 'step') {
        if (!gates.has(ref)) gates.set(ref, []);
        gates.get(ref).push(node.id);
      }
    }
    result.gated_steps = sorted(gates.keys()).map(key => ({ id: key, unknowns: sorted(gates.get(key)) }));
    result.finding_links.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (!result.issues.length) result.status = 'recorded';
  } catch (error) {
    issue('invalid_structure');
    // Validation messages contain controlled field labels / validated IDs only.
    result.detail = error instanceof Error ? error.message.slice(0, 300) : 'Invalid plan map';
  }
  return { result, map, nodes, sourceById, findingById, dependents };
}

/** Missing maps are not recorded, never implicitly complete. No input is changed. */
export function checkPlanQuality(options = {}) {
  try { return analyze(options).result; }
  catch { return { status: 'invalid', issues: [{ code: 'invalid_input' }], issues_truncated: false, counts: {}, gated_steps: [], finding_links: [], full_context_required: true, limitation }; }
}
function artifactRegistry(values = {}) {
  boundedData(values, 'artifact hashes');
  requireThat(plain(values) && Object.keys(values).length <= L.artifacts, 'Artifact hashes must be a bounded object');
  for (const [name, value] of Object.entries(values)) requireThat(safeId(name) && digest(value), 'Artifact hashes need safe labels and SHA-256 digests');
  return new Map(Object.entries(values));
}
const changes = (before, after) => sorted([...before.keys(), ...after.keys()]).filter(key => !same(before.get(key), after.get(key)));

/**
 * Compare complete review snapshots; the caller supplies already verified source
 * hashes/revisions and artifact hashes. This is a focus aid, never context pruning.
 * Both old and new graphs participate, so removing a link cannot hide its impact.
 */
export function comparePlanImpact(options = {}) {
  const result = { status: 'full_context_fallback', changed_nodes: [], changed_sources: [], changed_findings: [], changed_artifacts: [], affected_steps: [], reasons: [], full_context_required: true, limitation };
  let previous, current;
  try {
    const { before = {}, after = {} } = options;
    previous = analyze(before); current = analyze(after);
    result.before_status = previous.result.status; result.after_status = current.result.status;
    // Expose only bounded validated identifiers, even on a failed map.
    const allSteps = () => sorted([previous, current].flatMap(snapshot => [...(snapshot.nodes?.values() ?? [])].filter(node => node.kind === 'step').map(node => node.id)));
    result.affected_steps = allSteps();
    const oldSources = registry(before.sources ?? [], 'source'), newSources = registry(after.sources ?? [], 'source');
    const oldFindings = registry(before.findings ?? [], 'finding'), newFindings = registry(after.findings ?? [], 'finding');
    result.changed_sources = changes(oldSources, newSources);
    result.changed_findings = changes(oldFindings, newFindings);
    result.changed_artifacts = changes(artifactRegistry(before.artifactHashes), artifactRegistry(after.artifactHashes));
    if (previous.result.status !== 'recorded' || current.result.status !== 'recorded') {
      result.reasons.push('missing_or_invalid_map');
      return result;
    }
    result.changed_nodes = changes(previous.nodes, current.nodes);
    const seeds = new Set(result.changed_nodes), sourceRefs = new Set(), findingRefs = new Set();
    for (const snapshot of [previous, current]) for (const node of snapshot.nodes.values()) {
      for (const ref of node.sources ?? []) {
        sourceRefs.add(ref);
        if (result.changed_sources.includes(ref)) seeds.add(node.id);
      }
      for (const ref of node.findings ?? []) {
        findingRefs.add(ref);
        if (result.changed_findings.includes(ref)) seeds.add(node.id);
      }
    }
    const impacted = new Set(), combinedDependents = new Map(), stepIds = new Set();
    for (const snapshot of [previous, current]) {
      // A revised acceptance condition also changes the work it accepts.
      for (const ref of [...seeds]) if (snapshot.nodes.get(ref)?.kind === 'check') for (const step of snapshot.nodes.get(ref).requires) seeds.add(step);
      for (const [key, node] of snapshot.nodes) if (node.kind === 'step') stepIds.add(key);
      for (const [key, refs] of snapshot.dependents) combinedDependents.set(key, sorted([...(combinedDependents.get(key) ?? []), ...refs]));
    }
    for (const ref of descendants(seeds, combinedDependents)) if (stepIds.has(ref)) impacted.add(ref);
    if (result.changed_sources.some(ref => !sourceRefs.has(ref))) result.reasons.push('unmapped_source_change');
    if (result.changed_findings.some(ref => !findingRefs.has(ref))) result.reasons.push('unmapped_finding_change');
    if (before.planText !== after.planText && result.changed_nodes.length === 0) result.reasons.push('unmapped_plan_change');
    if (result.changed_artifacts.some(name => !['final-plan.md', 'decisions.json'].includes(name))) result.reasons.push('other_artifact_change');
    if (!result.reasons.length) { result.status = 'mapped'; result.affected_steps = sorted(impacted); }
    return result;
  } catch {
    result.reasons.push('invalid_comparison_input');
    return result;
  }
}
