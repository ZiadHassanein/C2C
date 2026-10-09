import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ASSURANCE_SCHEMA, ASSURANCE_LIMITS as L, checkAssurance as checkAssuranceAt, parseBoundedJSON } from '../scripts/assurance.mjs';

const observationClock = Date.parse('2026-10-10T12:00:00Z');
const checkAssurance = (value, options = { now: observationClock }) => checkAssuranceAt(value, options);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const codes = value => checkAssurance(value).issues.map(item => item.code);
function fixture({ status = 'passed', kind = 'acceptance' } = {}) {
  const selected = 'Choose A: retain the compatible payload.';
  const adopted = 'Reject messages belonging to another tenant.';
  const quote = 'A cross-tenant message is denied before storage.';
  const finalPlan = `${selected}\n${adopted}\n${quote}\n`;
  const content = 'Fixture observation: the cross-tenant case was denied before storage.';
  const evidence = [{ source_id: 'input-2', sha256: sha(content) }];
  return {
    finalPlan,
    decisions: [{ finding_id: 'P-R1', disposition: 'accepted', rationale: 'The boundary check is necessary for tenant isolation.' }],
    findings: [{ id: 'P-R1', severity: 'major', claim: 'Tenant validation is missing.' }],
    knownSources: [{ id: 'input-2', sha256: sha(content), content, revision: 'fixture-commit-1' }],
    assurance: {
      version: 1, plan_sha256: sha(finalPlan), selected_option: { id: 'A', quote: selected },
      accepted_decisions: [{ finding_id: 'P-R1', quote: adopted }],
      checks: [{ id: 'T1', kind, quote, status, reason: 'Recorded fixture result for this exact case.', evidence: ['passed', 'failed'].includes(status) ? copy(evidence) : [], finding_ids: ['P-R1'],
        ...(['passed', 'failed'].includes(status) ? { observation: { method: 'Ran the focused isolation fixture.', environment: 'Synthetic local fixture.', revision: 'fixture-commit-1', observed_at: '2026-10-10T10:00:00Z', result: status, evidence: copy(evidence) } } : {}),
      }],
    },
  };
}
const check = value => value.assurance.checks[0];
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('absent assurance is not recorded or implicitly passed; the contract is optional', () => {
  for (const input of [{}, { assurance: undefined }, { finalPlan: 'Legacy plan.', decisions: [] }]) {
    const result = checkAssurance(input);
    assert.equal(result.status, 'not_recorded');
    assert.equal(result.readiness, 'incomplete');
    assert.deepEqual(result.evidence_receipts, []);
  }
  assert.equal(checkAssurance({ assurance: null }).status, 'invalid');
  assert.equal(checkAssurance(null).status, 'invalid');
  assert.equal(ASSURANCE_SCHEMA.properties.version.const, 1);
  assert.equal(ASSURANCE_SCHEMA.additionalProperties, false);
  assert.equal(ASSURANCE_SCHEMA.properties.checks.items.properties.observation.properties.result.enum.includes('passed'), true);
});

test('a fully linked recorded contract is ready for peer review with explicit limits', () => {
  const value = fixture(), result = checkAssurance(value);
  assert.equal(result.status, 'recorded');
  assert.equal(result.readiness, 'ready_for_review');
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.evidence_receipts, check(value).evidence);
  assert.equal(result.counts.passed, 1);
  assert.equal(result.full_context_required, true);
  assert.match(result.limitation, /coordinator-recorded assertions, not independently attested execution/);
  assert.match(result.limitation, /not implementation, publication or production certification/);
});

test('every exact plan revision invalidates an unchanged contract even when anchors survive', () => {
  for (const change of [plan => `${plan}An extra constraint.\n`, plan => plan.replaceAll('\n', '\r\n'), plan => plan.replace('before storage.', 'before  storage.')]) {
    const value = fixture(); value.finalPlan = change(value.finalPlan);
    assert.ok(codes(value).includes('plan_hash_mismatch'));
    assert.equal(checkAssurance(value).readiness, 'needs_changes');
  }
});

test('missing and ambiguous anchors are rejected for choices, accepted decisions and checks', () => {
  for (const target of ['selected_option', 'accepted_decision', 'check']) {
    for (const repeated of [false, true]) {
      const value = fixture();
      const entry = target === 'selected_option' ? value.assurance.selected_option : target === 'accepted_decision' ? value.assurance.accepted_decisions[0] : check(value);
      if (repeated) { value.finalPlan += `\n${entry.quote}`; value.assurance.plan_sha256 = sha(value.finalPlan); }
      else entry.quote += ' Edited without changing the plan.';
      const expected = repeated ? 'plan_anchor_ambiguous' : 'plan_anchor_missing';
      assert.ok(checkAssurance(value).issues.some(item => item.code === expected && item.reference === target));
    }
  }
});

test('selected option ID must occur in its exact quote as a distinct token', () => {
  const value = fixture(); value.assurance.selected_option.id = 'B';
  assert.ok(codes(value).includes('selected_option_id_mismatch'));
  value.assurance.selected_option.id = 'API';
  assert.ok(codes(value).includes('selected_option_id_mismatch'));
  value.assurance.selected_option.id = 'A';
  value.finalPlan = value.finalPlan.replace(value.assurance.selected_option.quote, 'Choose API: retain the compatible payload.');
  value.assurance.selected_option.quote = 'Choose API: retain the compatible payload.';
  value.assurance.plan_sha256 = sha(value.finalPlan);
  assert.ok(codes(value).includes('selected_option_id_mismatch'));
  value.assurance.selected_option.id = 'API';
  assert.equal(checkAssurance(value).status, 'recorded');
});

test('accepted decisions cannot lose their anchors or retain anchors after disposition changes', () => {
  const absent = fixture(); absent.assurance.accepted_decisions = [];
  assert.ok(codes(absent).includes('accepted_decision_anchor_missing'));
  for (const disposition of ['rejected', 'unresolved']) {
    const changed = fixture(); changed.decisions[0].disposition = disposition;
    assert.ok(codes(changed).includes('accepted_decision_disposition_mismatch'));
    changed.assurance.accepted_decisions = [];
    assert.equal(checkAssurance(changed).status, 'recorded');
  }
  const orphan = fixture(); orphan.decisions = [];
  assert.ok(codes(orphan).includes('accepted_decision_disposition_mismatch'));
});

test('unknown source, wrong current digest and changed supplied content invalidate evidence', () => {
  const missing = fixture(); missing.knownSources = [];
  assert.ok(codes(missing).includes('evidence_source_missing'));
  const wrong = fixture(); wrong.knownSources[0].sha256 = sha('New current evidence.'); delete wrong.knownSources[0].content;
  assert.ok(codes(wrong).includes('evidence_hash_mismatch'));
  const tampered = fixture(); tampered.knownSources[0].content += 'changed';
  assert.ok(codes(tampered).includes('source_content_hash_mismatch'));
  assert.deepEqual(checkAssurance(tampered).evidence_receipts, []);
  const preserved = fixture(); delete preserved.knownSources[0].content;
  assert.equal(checkAssurance(preserved).status, 'recorded');
});

test('a test command label and existing source hash cannot masquerade as an observed pass', () => {
  const value = fixture(); delete check(value).observation;
  check(value).reason = 'npm test passed';
  assert.ok(codes(value).includes('check_observation_missing'));
  assert.equal(checkAssurance(value).readiness, 'needs_changes');
  check(value).evidence = [];
  assert.ok(codes(value).includes('check_evidence_missing'));
  const claim = fixture({ kind: 'claim' }); delete check(claim).observation;
  assert.ok(codes(claim).includes('check_observation_missing'));
});

test('observations require current evidence, a matching result and a link to the check', () => {
  const noEvidence = fixture(); check(noEvidence).observation.evidence = [];
  assert.ok(codes(noEvidence).includes('observation_evidence_missing'));
  const wrongResult = fixture(); check(wrongResult).observation.result = 'failed';
  assert.ok(codes(wrongResult).includes('observation_result_mismatch'));
  const orphan = fixture(); const content = 'Another observation.';
  orphan.knownSources.push({ id: 'input-3', sha256: sha(content), content });
  check(orphan).observation.evidence = [{ source_id: 'input-3', sha256: sha(content) }];
  assert.ok(codes(orphan).includes('observation_evidence_unlinked'));
  const stale = fixture(); check(stale).observation.evidence[0].sha256 = sha('stale');
  assert.ok(codes(stale).includes('evidence_hash_mismatch'));
});

test('proposed, blocked, failed and not applicable retain distinct non-passing readiness', () => {
  for (const status of ['proposed', 'blocked', 'not_applicable']) {
    const value = fixture({ status }), result = checkAssurance(value);
    assert.equal(result.status, 'recorded');
    assert.equal(result.readiness, 'incomplete');
    assert.equal(result.counts[status], 1);
    check(value).observation = copy(check(fixture()).observation);
    assert.ok(codes(value).includes('unobserved_status_has_observation'));
  }
  const failed = checkAssurance(fixture({ status: 'failed' }));
  assert.equal(failed.status, 'recorded');
  assert.equal(failed.readiness, 'needs_changes');
  const mixed = fixture();
  mixed.assurance.checks.push({ ...copy(check(fixture({ status: 'blocked' }))), id: 'T2' });
  assert.equal(checkAssurance(mixed).readiness, 'incomplete');
});

test('each status requires a reason and observations require concrete metadata', () => {
  for (const status of ['proposed', 'passed', 'failed', 'blocked', 'not_applicable']) {
    const value = fixture({ status }); check(value).reason = ' ';
    assert.equal(checkAssurance(value).status, 'invalid');
  }
  for (const field of ['method', 'environment', 'revision', 'observed_at', 'result']) {
    const value = fixture(); delete check(value).observation[field];
    assert.equal(checkAssurance(value).status, 'invalid', field);
  }
  for (const date of ['yesterday', '2026-02-30T10:00:00Z', '2026-10-10T25:00:00Z']) {
    const value = fixture(); check(value).observation.observed_at = date;
    assert.equal(checkAssurance(value).status, 'invalid', date);
  }
});

test('content acceptance uses recorded editorial inspection without code or deployment fields', () => {
  const value = fixture();
  value.finalPlan = 'Choose B: publish a plain-language explainer.\nAttribute every factual statement.\nEvery quotation links to the supplied source.\n';
  value.assurance.plan_sha256 = sha(value.finalPlan);
  value.assurance.selected_option = { id: 'B', quote: 'Choose B: publish a plain-language explainer.' };
  value.assurance.accepted_decisions[0].quote = 'Attribute every factual statement.';
  check(value).quote = 'Every quotation links to the supplied source.';
  check(value).observation.method = 'Compared quotations against supplied source excerpts.';
  check(value).observation.environment = 'Editorial proof, revision 3.';
  check(value).observation.revision = 'copy-v3';
  assert.equal(checkAssurance(value).readiness, 'ready_for_review');
  check(value).kind = 'claim';
  assert.equal(checkAssurance(value).readiness, 'ready_for_review');
});

test('orphan finding references and catalog collisions are rejected rather than silently merged', () => {
  const missing = fixture(); missing.findings = [];
  assert.ok(codes(missing).includes('decision_finding_missing'));
  assert.ok(codes(missing).includes('check_finding_missing'));
  for (const field of ['findings', 'decisions', 'knownSources']) {
    const value = fixture(); value[field].push(copy(value[field][0]));
    assert.equal(checkAssurance(value).status, 'invalid', field);
  }
  for (const field of ['checks', 'accepted_decisions']) {
    const value = fixture(); value.assurance[field].push(copy(value.assurance[field][0]));
    assert.equal(checkAssurance(value).status, 'invalid', field);
  }
  const duplicate = fixture(); check(duplicate).evidence.push(copy(check(duplicate).evidence[0]));
  assert.equal(checkAssurance(duplicate).status, 'invalid');
});

test('unsupported structure, versions and pass synonyms fail safe', () => {
  for (const mutate of [value => { value.assurance.version = 2; }, value => { value.assurance.checks = []; }, value => { check(value).status = 'executed'; }, value => { check(value).observation.exit_code = 0; }, value => { value.assurance.production_certified = true; }]) {
    const value = fixture(); mutate(value);
    assert.equal(checkAssurance(value).status, 'invalid');
  }
});

test('JSON text rejects duplicate escaped keys, excessive nesting and malformed values', () => {
  const value = fixture();
  assert.equal(checkAssurance({ ...value, assurance: JSON.stringify(value.assurance) }).status, 'recorded');
  for (const assurance of ['{"version":1,"version":1}', '{"version":1,"\\u0076ersion":1}', `${JSON.stringify(value.assurance)} true`, '{"version":1,}', '[1,]', '1e999', `${'['.repeat(L.depth + 1)}0${']'.repeat(L.depth + 1)}`]) {
    assert.equal(checkAssurance({ ...value, assurance }).status, 'invalid');
  }
});

test('future observations cannot be recorded as passing evidence at the supplied clock', () => {
  for (const status of ['passed', 'failed']) {
    const value = fixture({ status });
    check(value).observation.observed_at = '2099-01-01T00:00:00Z';
    const result = checkAssurance(value);
    assert.equal(result.status, 'invalid');
    assert.equal(result.readiness, 'needs_changes');
    assert.ok(result.issues.some(item => item.code === 'observation_future_dated' && item.node === 'T1'));
  }
  const value = fixture();
  check(value).observation.observed_at = new Date(observationClock).toISOString();
  assert.equal(checkAssurance(value).status, 'recorded', 'Observation at the supplied clock is permitted');
  check(value).observation.observed_at = new Date(observationClock + 1).toISOString();
  assert.equal(checkAssurance(value).status, 'invalid', 'No implicit future clock skew is granted');
  for (const now of [NaN, Infinity, undefined, null, '2026-10-10']) {
    if (now === undefined) continue; // The omitted clock deliberately uses Date.now().
    assert.equal(checkAssurance(fixture(), { now }).status, 'invalid');
  }
});

test('the shared strict parser preserves legacy decisions and rejects duplicate nested assurance fields', () => {
  const value = fixture();
  const legacy = [{ finding_id: 'P-R1', disposition: 'accepted', rationale: 'Retain the tenant boundary check.' }];
  assert.deepEqual(JSON.parse(JSON.stringify(parseBoundedJSON(JSON.stringify(legacy)))), legacy);
  const document = { decisions: legacy, assurance: value.assurance };
  const text = JSON.stringify(document);
  const parsed = parseBoundedJSON(text, { maxBytes: L.plan_bytes });
  assert.equal(checkAssurance({ ...value, assurance: parsed.assurance }).status, 'recorded');
  for (const duplicate of [
    text.replace('"status":"passed"', '"status":"failed","status":"passed"'),
    text.replace('"result":"passed"', '"result":"failed","result":"passed"'),
    text.replace('"result":"passed"', '"result":"failed","res\\u0075lt":"passed"'),
    text.replace('"decisions":', '"decisions":[],"decisions":'),
  ]) assert.throws(() => parseBoundedJSON(duplicate, { maxBytes: L.plan_bytes }), /duplicate object keys/);
});

test('the shared parser raises only the caller-selected byte cap and retains structural limits', () => {
  const text = JSON.stringify({ decisions: [], padding: 'x'.repeat(L.contract_bytes) });
  assert.throws(() => parseBoundedJSON(text), /byte limit/);
  assert.equal(parseBoundedJSON(text, { maxBytes: L.plan_bytes }).decisions.length, 0);
  for (const maxBytes of [0, -1, Infinity, L.plan_bytes + 1, '1048576']) assert.throws(() => parseBoundedJSON('{}', { maxBytes }), /byte limit/);
  assert.throws(() => parseBoundedJSON(' '.repeat(L.plan_bytes + 1), { maxBytes: L.plan_bytes }), /byte limit/);
  for (const text of [`${'['.repeat(L.depth + 1)}0${']'.repeat(L.depth + 1)}`, '1e999', '[1,]', '{"a":1,}', 'true false']) {
    assert.throws(() => parseBoundedJSON(text, { maxBytes: L.plan_bytes }));
  }
});

test('plain-data validation rejects getters, cycles, sparse arrays and custom prototypes without executing authored code', () => {
  const cyclic = fixture(); cyclic.assurance.loop = cyclic.assurance;
  const getter = fixture(); let invoked = false;
  Object.defineProperty(getter.assurance, 'surprise', { enumerable: true, get() { invoked = true; throw new Error('private'); } });
  const inputGetter = fixture(); Object.defineProperty(inputGetter, 'finalPlan', { enumerable: true, get() { invoked = true; throw new Error('private'); } });
  const sparse = fixture(); sparse.assurance.checks.length++;
  const custom = fixture(); custom.assurance = Object.assign(Object.create({ inherited: true }), custom.assurance);
  for (const value of [cyclic, getter, inputGetter, sparse, custom]) assert.equal(checkAssurance(value).status, 'invalid');
  assert.equal(invoked, false);
});

test('input and diagnostic size limits bound large hostile inputs', () => {
  for (const mutate of [
    value => { value.finalPlan = 'x'.repeat(L.plan_bytes + 1); },
    value => { value.assurance = ' '.repeat(L.contract_bytes + 1); },
    value => { value.assurance.checks = Array.from({ length: L.checks + 1 }, () => check(value)); },
    value => { check(value).quote = 'x'.repeat(L.text + 1); },
    value => { check(value).evidence = Array.from({ length: L.references + 1 }, (_, i) => ({ source_id: `source-${i}`, sha256: sha('x') })); },
  ]) { const value = fixture(); mutate(value); assert.equal(checkAssurance(value).status, 'invalid'); }
  const many = fixture({ status: 'proposed' });
  many.assurance.checks = Array.from({ length: 130 }, (_, i) => ({ ...copy(check(many)), id: `T${i}`, quote: 'Missing anchor.' }));
  const result = checkAssurance(many);
  assert.equal(result.issues.length, L.issues);
  assert.equal(result.issues_truncated, true);
});

test('diagnostics do not echo authored content and checking does not mutate frozen inputs', () => {
  const safe = freeze(fixture()), before = JSON.stringify(safe);
  assert.equal(checkAssurance(safe).status, 'recorded');
  assert.equal(JSON.stringify(safe), before);
  const attack = '<img src=x onerror=alert(1)> [private](file:///secret)';
  for (const field of ['quote', 'id']) {
    const value = fixture(); check(value)[field] = attack;
    assert.equal(JSON.stringify(checkAssurance(value)).includes(attack), false);
  }
});
