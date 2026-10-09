import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPlanQuality, comparePlanImpact, PLAN_MAP_SCHEMA, PLAN_QUALITY_LIMITS as LIMITS } from '../scripts/plan-quality.mjs';

const hash = letter => letter.repeat(64);
const clone = value => structuredClone(value);
function fixture() {
  const planText = [
    'Keep queued messages compatible.',
    'Retain the old payload during transition.',
    'Deploy a compatible reader before switching writers.',
    'Boundary: queue consumer.', 'Output: compatible reader.',
    'Proposed: exercise mixed-version processing and rollback.',
  ].join('\n');
  return {
    planText,
    sources: [{ id: 'input-1', sha256: hash('a'), revision: 'frozen revision' }], findings: [],
    artifactHashes: { 'final-plan.md': hash('b'), 'decisions.json': hash('c') },
    planMap: { version: 1, nodes: [
      { id: 'R1', kind: 'requirement', quote: 'Keep queued messages compatible.', requires: [], sources: ['input-1'] },
      { id: 'D1', kind: 'decision', quote: 'Retain the old payload during transition.', requires: ['R1'] },
      { id: 'S1', kind: 'step', quote: 'Deploy a compatible reader before switching writers.', requires: ['D1'], boundary: 'Boundary: queue consumer.', output: 'Output: compatible reader.' },
      { id: 'T1', kind: 'check', quote: 'Proposed: exercise mixed-version processing and rollback.', requires: ['S1'], status: 'proposed' },
    ] },
  };
}
function addStep(value, id, requires = ['D1']) {
  const quote = `Perform ${id}.`, boundary = `Boundary of ${id}.`, output = `Output of ${id}.`, check = `Check ${id}.`;
  value.planText += `\n${quote}\n${boundary}\n${output}\n${check}`;
  value.planMap.nodes.push(
    { id, kind: 'step', quote, requires, boundary, output },
    { id: `T-${id}`, kind: 'check', quote: check, requires: [id], status: 'proposed' },
  );
  return value;
}
const node = (value, id) => value.planMap.nodes.find(item => item.id === id);
const codes = value => checkPlanQuality(value).issues.map(issue => issue.code);
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('optional small maps validate links without asserting semantic truth, coverage or readiness', () => {
  assert.equal(checkPlanQuality().status, 'not_recorded');
  assert.equal(checkPlanQuality({ planMap: undefined }).status, 'not_recorded');
  assert.equal(checkPlanQuality({ planMap: null }).status, 'invalid');
  const result = checkPlanQuality(fixture());
  assert.equal(result.status, 'recorded');
  assert.deepEqual(result.counts, { requirement: 1, decision: 1, step: 1, check: 1 });
  assert.deepEqual(result.issues, []);
  assert.equal(result.full_context_required, true);
  assert.match(result.limitation, /not factual truth, sufficient coverage/);
  assert.equal(PLAN_MAP_SCHEMA.properties.version.const, 1);
  assert.equal(PLAN_MAP_SCHEMA.properties.nodes.items.oneOf.length, 5);
});

test('exact plan quotes, boundary, output and blocked reasons bind the graph to the current full plan', () => {
  for (const field of ['quote', 'boundary', 'output']) {
    const value = fixture(); node(value, 'S1')[field] += ' changed';
    assert.ok(codes(value).includes('plan_anchor_missing'), field);
  }
  const value = fixture(); value.planText = value.planText.replace('queued messages', 'queued  messages');
  assert.ok(codes(value).includes('plan_anchor_missing'));
  assert.equal(checkPlanQuality({ ...fixture(), planText: '' }).status, 'invalid');
});

test('requirements need supplied evidence or an explicit assumption, and the chain needs every link', () => {
  const value = fixture(); delete node(value, 'R1').sources;
  assert.ok(codes(value).includes('requirement_support_missing'));
  value.planText += '\nAssume the retention policy is unchanged.';
  value.planMap.nodes.push({ id: 'A1', kind: 'assumption', quote: 'Assume the retention policy is unchanged.', requires: [], state: 'assumed' });
  node(value, 'R1').requires = ['A1'];
  assert.equal(checkPlanQuality(value).status, 'recorded');
  for (const [id, expected] of [['D1', 'decision_requirement_missing'], ['S1', 'step_decision_missing'], ['T1', 'check_step_missing']]) {
    const broken = clone(value); node(broken, id).requires = [];
    assert.ok(codes(broken).includes(expected));
  }
  const orphan = clone(value); orphan.planMap.nodes.splice(orphan.planMap.nodes.findIndex(item => item.id === 'T1'), 1);
  assert.ok(codes(orphan).includes('acceptance_check_missing'));
  const onlyAssumption = clone(value); onlyAssumption.planMap.nodes = [node(onlyAssumption, 'A1')];
  assert.ok(codes(onlyAssumption).includes('node_kind_missing'));
});

test('unmapped requirements and decisions cannot hide behind otherwise valid paths', () => {
  const value = fixture();
  value.planMap.nodes.push({ ...node(value, 'R1'), id: 'R2' }, { ...node(value, 'D1'), id: 'D2', requires: ['R2'] });
  const issues = checkPlanQuality(value).issues;
  assert.ok(issues.some(issue => issue.code === 'linked_step_missing' && issue.node === 'R2'));
  assert.ok(issues.some(issue => issue.code === 'linked_step_missing' && issue.node === 'D2'));
});

test('dangling prerequisites, invalid dependency types, self-cycles and multi-node cycles are rejected', () => {
  const missing = fixture(); node(missing, 'S1').requires.push('Absent');
  assert.ok(codes(missing).includes('prerequisite_missing'));
  const invalid = fixture(); node(invalid, 'R1').requires = ['T1'];
  assert.ok(codes(invalid).includes('prerequisite_kind_invalid'));
  assert.ok(codes(invalid).includes('dependency_cycle'));
  const self = fixture(); node(self, 'S1').requires.push('S1');
  assert.ok(codes(self).includes('dependency_cycle'));
  const cycle = addStep(fixture(), 'S2', ['D1', 'S1']); node(cycle, 'S1').requires.push('S2');
  assert.ok(codes(cycle).includes('dependency_cycle'));
});

test('unknown factual gaps or user choices gate only dependent steps, including transitive prerequisites', () => {
  const value = addStep(addStep(fixture(), 'S2', ['D1', 'S1']), 'Discovery');
  value.planText += '\nQueue retention is unknown.';
  value.planMap.nodes.push({ id: 'A1', kind: 'assumption', quote: 'Queue retention is unknown.', requires: [], state: 'unknown', unknown_type: 'factual_gap' });
  node(value, 'S1').requires.push('A1');
  const result = checkPlanQuality(value);
  assert.equal(result.status, 'recorded');
  assert.deepEqual(result.gated_steps, [{ id: 'S1', unknowns: ['A1'] }, { id: 'S2', unknowns: ['A1'] }]);
  node(value, 'A1').unknown_type = 'user_choice';
  assert.deepEqual(checkPlanQuality(value).gated_steps, result.gated_steps);
  for (const state of ['assumed', 'deferred']) {
    node(value, 'A1').state = state;
    assert.deepEqual(checkPlanQuality(value).gated_steps, []);
  }
  node(value, 'A1').state = 'resolved';
  assert.ok(codes(value).includes('resolved_assumption_evidence_missing'));
  node(value, 'A1').sources = ['input-1'];
  assert.equal(checkPlanQuality(value).status, 'recorded');
});

test('proposed, executed and blocked checks are distinct and execution claims require supplied evidence', () => {
  const value = fixture(); node(value, 'T1').status = 'executed';
  assert.ok(codes(value).includes('executed_check_evidence_missing'));
  node(value, 'T1').sources = ['unavailable-request'];
  assert.ok(codes(value).includes('source_missing'));
  value.sources.push({ id: 'P-R-E1', sha256: hash('d'), revision: 'observed check result' });
  node(value, 'T1').sources = ['P-R-E1'];
  assert.equal(checkPlanQuality(value).status, 'recorded');
  node(value, 'T1').status = 'blocked';
  assert.ok(codes(value).includes('blocked_check_reason_missing'));
  node(value, 'T1').reason = 'Blocked pending an authorized queue fixture.';
  assert.ok(codes(value).includes('plan_anchor_missing'));
  value.planText += `\n${node(value, 'T1').reason}`;
  assert.equal(checkPlanQuality(value).status, 'recorded');
  node(value, 'T1').status = 'passed';
  assert.equal(checkPlanQuality(value).status, 'invalid');
});

test('all finding dispositions retain valid links and substantive reasons, including rejected and unresolved', () => {
  const value = fixture();
  value.findings = ['accepted', 'rejected', 'unresolved'].map((disposition, index) => ({ id: `P-R${index + 1}`, disposition, rationale: `Recorded rationale for ${disposition}.` }));
  node(value, 'D1').findings = value.findings.map(finding => finding.id);
  const result = checkPlanQuality(value);
  assert.equal(result.status, 'recorded');
  assert.deepEqual(result.finding_links.map(item => item.disposition), ['accepted', 'rejected', 'unresolved']);
  node(value, 'D1').findings.pop();
  assert.ok(codes(value).includes('finding_link_missing'));
  node(value, 'D1').findings.push('P-R99');
  assert.ok(codes(value).includes('finding_missing'));
  value.findings[1].rationale = 'No';
  assert.equal(checkPlanQuality(value).status, 'invalid');
});

test('source and finding ID collisions are rejected rather than merged', () => {
  for (const type of ['sources', 'findings']) {
    const value = fixture();
    if (type === 'findings') value.findings = [{ id: 'C-R1', disposition: 'rejected', rationale: 'The supplied contract supports retention.' }];
    value[type].push(clone(value[type][0]));
    assert.equal(checkPlanQuality(value).status, 'invalid');
    assert.match(checkPlanQuality(value).detail, /duplicate/);
  }
  const value = fixture(); value.sources[0].sha256 = 'unverified';
  assert.equal(checkPlanQuality(value).status, 'invalid');
});

test('duplicate node/reference IDs, unsupported fields and unsupported versions fail safe', () => {
  const duplicate = fixture(); duplicate.planMap.nodes.push(clone(node(duplicate, 'R1')));
  assert.match(checkPlanQuality(duplicate).detail, /duplicate/);
  for (const field of ['requires', 'sources', 'findings']) {
    const value = fixture(); node(value, field === 'findings' ? 'D1' : 'R1')[field] = ['R1', 'R1'];
    assert.match(checkPlanQuality(value).detail, /duplicate/);
  }
  const unknown = fixture(); node(unknown, 'S1').extra = 'unsupported';
  assert.equal(checkPlanQuality(unknown).status, 'invalid');
  unknown.planMap.version = 2;
  assert.equal(checkPlanQuality(unknown).status, 'invalid');
});

test('bounded JSON parsing rejects duplicate escaped keys, trailing content and hostile nesting', () => {
  const value = fixture();
  assert.equal(checkPlanQuality({ ...value, planMap: JSON.stringify(value.planMap) }).status, 'recorded');
  for (const planMap of [
    '{"version":1,"version":1,"nodes":[]}', '{"version":1,"\\u0076ersion":1,"nodes":[]}',
    `${JSON.stringify(value.planMap)} true`, '{"version":1,}', '[1,]', '1e999',
    `${'['.repeat(LIMITS.depth + 1)}0${']'.repeat(LIMITS.depth + 1)}`,
  ]) assert.equal(checkPlanQuality({ ...value, planMap }).status, 'invalid');
  const duplicate = checkPlanQuality({ ...value, planMap: '{"version":1,"version":1}' });
  assert.match(duplicate.detail, /duplicate object keys/);
});

test('plain object input rejects cycles, getters, sparse arrays and custom prototypes without executing getters', () => {
  const value = fixture();
  const cyclic = clone(value.planMap); cyclic.nodes[0].cycle = cyclic;
  const getter = clone(value.planMap); let called = false;
  Object.defineProperty(getter, 'danger', { enumerable: true, get() { called = true; throw new Error('secret'); } });
  const sparse = clone(value.planMap); sparse.nodes.length++;
  const custom = Object.create({ version: 1 }); custom.nodes = value.planMap.nodes;
  for (const planMap of [cyclic, getter, sparse, custom]) assert.equal(checkPlanQuality({ ...value, planMap }).status, 'invalid');
  assert.equal(called, false);
  assert.equal(checkPlanQuality(null).status, 'invalid');
  assert.equal(comparePlanImpact(null).status, 'full_context_fallback');
});

test('oversized nodes, references, text, maps and plans are bounded with bounded diagnostic output', () => {
  const value = fixture();
  const cases = [
    { ...value, planMap: { version: 1, nodes: Array.from({ length: LIMITS.nodes + 1 }, () => value.planMap.nodes[0]) } },
    { ...value, planText: 'x'.repeat(LIMITS.plan_bytes + 1) },
    { ...value, planMap: ' '.repeat(LIMITS.map_bytes + 1) },
  ];
  const refs = clone(value); node(refs, 'S1').requires = Array.from({ length: LIMITS.references + 1 }, (_, i) => `N${i}`); cases.push(refs);
  const long = clone(value); node(long, 'S1').quote = 'x'.repeat(LIMITS.text + 1); cases.push(long);
  for (const item of cases) assert.equal(checkPlanQuality(item).status, 'invalid');
  const many = clone(value);
  for (let i = 0; i < 130; i++) many.planMap.nodes.push({ id: `Bad${i}`, kind: 'step', quote: 'missing', requires: ['D1'], boundary: 'missing', output: 'missing' });
  const result = checkPlanQuality(many);
  assert.equal(result.status, 'invalid');
  assert.equal(result.issues.length, LIMITS.issues);
  assert.equal(result.issues_truncated, true);
});

test('untrusted plan prose is never copied into structural JSON diagnostics', () => {
  const value = fixture(), attack = '<img src=x onerror=alert(1)> [secret](file:///private)';
  node(value, 'S1').quote = attack;
  const output = JSON.stringify(checkPlanQuality(value));
  assert.equal(output.includes(attack), false);
  node(value, 'S1').id = attack;
  assert.equal(JSON.stringify(checkPlanQuality(value)).includes(attack), false);
});

test('quality and impact functions are read-only and order-independent for graph collections', () => {
  const before = freeze(addStep(fixture(), 'S2', ['D1', 'S1']));
  const encoded = JSON.stringify(before);
  assert.equal(checkPlanQuality(before).status, 'recorded');
  const after = clone(before); after.planMap.nodes.reverse(); node(after, 'S2').requires.reverse();
  assert.deepEqual(comparePlanImpact({ before, after }).changed_nodes, []);
  assert.equal(JSON.stringify(before), encoded);
  assert.equal(comparePlanImpact({ before, after }).status, 'mapped');
});

test('revision impact carries changed decisions through unchanged transitive prerequisite steps', () => {
  const before = addStep(addStep(fixture(), 'S2', ['D1', 'S1']), 'S3', ['D1', 'S2']);
  const after = clone(before);
  node(after, 'D1').quote = 'Keep the compatible payload until retention expires.';
  after.planText = after.planText.replace(node(before, 'D1').quote, node(after, 'D1').quote);
  after.artifactHashes['final-plan.md'] = hash('d'); after.artifactHashes['decisions.json'] = hash('e');
  const result = comparePlanImpact({ before, after });
  assert.equal(result.status, 'mapped');
  assert.deepEqual(result.changed_nodes, ['D1']);
  assert.deepEqual(result.affected_steps, ['S1', 'S2', 'S3']);
  assert.deepEqual(result.changed_artifacts, ['decisions.json', 'final-plan.md']);
  assert.equal(result.full_context_required, true);
});

test('source hash or declared revision changes and changed rejected rationales propagate to affected steps', () => {
  const before = addStep(fixture(), 'S2', ['D1', 'S1']);
  before.findings = [{ id: 'P-R1', disposition: 'rejected', rationale: 'The old contract supports this decision.' }]; node(before, 'D1').findings = ['P-R1'];
  for (const field of ['sha256', 'revision']) {
    const after = clone(before); after.sources[0][field] = field === 'sha256' ? hash('d') : 'new declared source revision';
    const result = comparePlanImpact({ before, after });
    assert.equal(result.status, 'mapped');
    assert.deepEqual(result.changed_sources, ['input-1']);
    assert.deepEqual(result.affected_steps, ['S1', 'S2']);
  }
  const after = clone(before); after.findings[0].rationale = 'New supplied evidence changes the rejection rationale.';
  const result = comparePlanImpact({ before, after });
  assert.deepEqual(result.changed_findings, ['P-R1']);
  assert.deepEqual(result.affected_steps, ['S1', 'S2']);
});

test('changed acceptance and removed dependency links include affected work in both graph revisions', () => {
  const before = addStep(addStep(fixture(), 'S2', ['D1', 'S1']), 'S3', ['D1', 'S2']);
  const after = clone(before); node(after, 'T1').status = 'executed'; node(after, 'T1').sources = ['input-1'];
  assert.deepEqual(comparePlanImpact({ before, after }).affected_steps, ['S1', 'S2', 'S3']);
  const removed = clone(before); node(removed, 'S2').requires = ['D1'];
  assert.deepEqual(comparePlanImpact({ before, after: removed }).affected_steps, ['S2', 'S3']);
  const removedNode = clone(before); removedNode.planMap.nodes = removedNode.planMap.nodes.filter(item => !['S3', 'T-S3'].includes(item.id));
  assert.deepEqual(comparePlanImpact({ before, after: removedNode }).affected_steps, ['S3']);
});

test('missing or invalid mapping falls back to full context while retaining changed artifact/source identities', () => {
  const before = fixture(), after = clone(before); delete before.planMap;
  after.sources[0].revision = 'changed'; after.artifactHashes['final-plan.md'] = hash('f');
  const result = comparePlanImpact({ before, after });
  assert.equal(result.status, 'full_context_fallback');
  assert.deepEqual(result.reasons, ['missing_or_invalid_map']);
  assert.deepEqual(result.changed_sources, ['input-1']);
  assert.deepEqual(result.changed_artifacts, ['final-plan.md']);
  assert.deepEqual(result.affected_steps, ['S1']);
  assert.equal(result.full_context_required, true);
  assert.equal(comparePlanImpact({ before: fixture(), after: { ...fixture(), planMap: null } }).status, 'full_context_fallback');
});

test('unmapped plan changes, sources and other changed artifacts cause conservative full-context fallback', () => {
  const before = addStep(fixture(), 'S2');
  const alterations = [
    after => { after.planText += '\nAdditional unmodeled constraint.'; },
    after => { after.sources.push({ id: 'new-source', sha256: hash('d') }); },
    after => { after.artifactHashes['security-review.json'] = hash('d'); },
  ];
  for (const alter of alterations) {
    const after = clone(before); alter(after);
    const result = comparePlanImpact({ before, after });
    assert.equal(result.status, 'full_context_fallback');
    assert.equal(result.reasons.length, 1);
    assert.deepEqual(result.affected_steps, ['S1', 'S2']);
    assert.equal(result.full_context_required, true);
  }
  const invalidHash = clone(before); invalidHash.artifactHashes['final-plan.md'] = 'not a digest';
  assert.deepEqual(comparePlanImpact({ before, after: invalidHash }).reasons, ['invalid_comparison_input']);
});
