import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepare, preview, ask, finish, quality, status, syncDecisions } from '../scripts/council.mjs';
import { writePreferences, readPreferences } from '../scripts/preferences.mjs';
import { writeRunState } from '../scripts/state.mjs';

const tempParent = await fs.realpath(os.tmpdir());
const root = await fs.mkdtemp(path.join(tempParent, 'c2c-qa-integration-'));
const originalEnvironment = Object.fromEntries(['C2C_RUNTIME_HOME', 'C2C_CONFIG_HOME'].map(key => [key, process.env[key]]));
process.env.C2C_RUNTIME_HOME = path.join(root, 'runtimes');
process.env.C2C_CONFIG_HOME = path.join(root, 'config');
after(async () => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const resolved = await fs.realpath(root);
  assert.equal(path.dirname(resolved), tempParent);
  assert.ok(path.basename(resolved).startsWith('c2c-qa-integration-'));
  await fs.rm(resolved, { recursive: true, force: true });
});
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const write = (file, value) => fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const plan = '# Revised plan\nChoose A: reject cross-tenant messages before storage.\nRetain the existing compatible payload.\nA cross-tenant message is denied before storage.\n';
const report = (ids = []) => ({
  summary: 'Offline QA integration fixture; no real provider or implementation test.',
  verdict: ids.length ? 'needs_changes' : 'ready', proposal_markdown: 'Inspect the scoped evidence and validate the chosen boundary.',
  findings: ids.map(id => ({ id, severity: 'major', claim: 'A tenant boundary needs explicit coverage.', evidence: 'Hypothetical regression fixture.', action: 'Preserve the operative tenant check.', verification: 'Confirm denial occurs before storage.' })),
  assumptions: [], open_questions: [], limitations: [],
});
const fakeProbe = async provider => ({ authenticated: true, executable: 'injected-never-executed', version: 'offline-fixture',
  auth_route: 'subscription', auth_method: provider === 'codex' ? 'chatgpt' : 'claude.ai', route_environment_overrides: [] });
const invocation = (value = report(), inspect = () => {}) => async request => {
  inspect(request);
  return { code: 0, stderr: '', stdout: request.provider === 'claude'
    ? JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: value, result: JSON.stringify(value), session_id: 'fixture-only' })
    : [{ type: 'thread.started', thread_id: 'fixture-only' }, { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(value) } }, { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }].map(JSON.stringify).join('\n') };
};
const call = (f, stage, value = report(), inspect) => ask({ run: f.out, stage }, invocation(value, inspect), { probe: fakeProbe });

async function fixture({ spending = 'subscription', runSpending, purpose = 'qa', coordinator = 'codex', content = false, prepareRun = true } = {}) {
  writePreferences({ spending });
  const preferencesFile = path.join(process.env.C2C_CONFIG_HOME, 'preferences.json');
  const preferencesBefore = await fs.readFile(preferencesFile, 'utf8');
  const directory = await fs.mkdtemp(path.join(root, 'case-'));
  const project = path.join(directory, 'project'); await fs.mkdir(project);
  const brief = path.join(directory, 'brief.txt'), context = path.join(project, 'observations.txt'), assessment = path.join(directory, 'assessment.json');
  await write(brief, content ? 'Review the source-linked editorial plan.' : 'Review the scoped tenant-isolation plan.');
  await write(context, content ? 'Synthetic supplied editorial evidence: every quotation has a source excerpt and attribution label.' : 'Synthetic supplied observation only: a cross-tenant message was denied before storage.');
  await write(assessment, {
    assessed_at: '2026-10-10T10:00:00Z', summary: 'Isolated offline integration fixture.', project_type: content ? 'content' : 'software',
    deployment: content ? { status: 'not_applicable', evidence: [] } : { status: 'non_production', evidence: ['E1'] },
    readiness: { status: 'not_assessed', scope: 'Only supplied fixture evidence.', gaps: [], evidence: [] },
    evidence: [{ id: 'E1', source: 'Fixture creation', observation: 'A temporary project with no live service or published content.', kind: 'observed' }],
    direction: { route: content ? 'non_software' : 'extend_existing', clarity: 'ready', goal: 'Review the bounded supplied plan.', scope: ['One consequential acceptance case.'], success_criteria: ['Operative decisions match observed or proposed checks.'], constraints: ['No provider calls, publication or implementation.'], next_step: 'Inspect the supplied plan and source.' }, unknowns: [],
  });
  const options = { project, brief, context: [context], assessment, coordinator, purpose, mode: 'review', out: path.join(directory, 'run'), ...(runSpending !== undefined ? { spending: runSpending } : {}) };
  if (prepareRun) {
    prepare(options);
    await write(path.join(options.out, 'coordinator-draft.json'), report());
    await write(path.join(options.out, 'coordinator-review.json'), report());
  }
  return { ...options, directory, contextFile: context, preferencesFile, preferencesBefore };
}
async function allowance(f, extra = {}) {
  const provider = f.coordinator === 'codex' ? 'claude' : 'codex';
  const now = Date.now();
  const value = { version: 1, provider, auth_method: provider === 'codex' ? 'chatgpt' : 'claude.ai', allowance: 'included-only', source: 'user-confirmed',
    reference: 'LOCAL_ALLOWANCE_DECLARATION_DO_NOT_SEND_783421', observed_at: new Date(now - 60000).toISOString(), valid_until: new Date(now + 3600000).toISOString(), ...extra };
  const file = path.join(f.directory, 'allowance.json'); await write(file, value);
  return { file, value };
}
async function documentFor(f, { checkStatus = 'proposed', decisions = [], finalPlan = plan } = {}) {
  const snapshot = await read(path.join(f.out, 'snapshot.json'));
  const index = snapshot.inputs.findIndex(item => item.kind === 'context');
  assert.ok(index >= 0);
  const evidence = [{ source_id: `input-${index + 1}`, sha256: snapshot.inputs[index].sha256 }];
  return { decisions, assurance: {
    version: 1, plan_sha256: sha(finalPlan), selected_option: { id: 'A', quote: 'Choose A: reject cross-tenant messages before storage.' },
    accepted_decisions: decisions.filter(item => item.disposition === 'accepted').map(item => ({ finding_id: item.finding_id, quote: 'Retain the existing compatible payload.' })),
    checks: [{ id: 'T1', kind: 'acceptance', quote: 'A cross-tenant message is denied before storage.', status: checkStatus,
      reason: ['passed', 'failed'].includes(checkStatus) ? 'Coordinator-recorded fixture observation.' : 'Acceptance work is proposed and has not run.', evidence: ['passed', 'failed'].includes(checkStatus) ? evidence : [],
      ...(['passed', 'failed'].includes(checkStatus) ? { observation: { method: 'Inspected the supplied synthetic observation.', environment: 'Offline fixture, no application execution.', revision: 'fixture-r1', observed_at: new Date(Date.now() - 60000).toISOString(), result: checkStatus, evidence: copy(evidence) } } : {}),
    }],
  } };
}
async function readyForVerify({ withAssurance = true, reviewIds = [], checkStatus = 'proposed', ...options } = {}) {
  const f = await fixture(options);
  await call(f, 'review', report(reviewIds));
  await write(path.join(f.out, 'security-review.json'), report());
  await write(path.join(f.out, 'final-plan.md'), plan);
  const decisions = reviewIds.map(finding_id => ({ finding_id, disposition: 'accepted', rationale: 'This concern is covered by the current operative boundary.' }));
  const document = await documentFor(f, { decisions, checkStatus });
  await write(path.join(f.out, 'decisions.json'), withAssurance ? document : decisions);
  return { ...f, document };
}

test('shared preferences seal both provider routes and the stricter current or sealed policy wins', async () => {
  for (const coordinator of ['codex', 'claude']) {
    for (const [spending, current] of [['subscription', 'included-only'], ['included-only', 'subscription']]) {
      const f = await fixture({ spending, coordinator });
      const before = await read(path.join(f.out, 'run.json'));
      const snapshot = await read(path.join(f.out, 'snapshot.json'));
      assert.deepEqual(before.spending_policy, { version: 1, spending });
      assert.deepEqual(snapshot.spending_policy, before.spending_policy);
      writePreferences({ spending: current });
      assert.equal(readPreferences().spending, current);
      let probes = 0;
      await assert.rejects(ask({ run: f.out, stage: 'review' }, () => assert.fail('No worker call'), { probe: async () => { probes++; return fakeProbe('claude'); } }), /no current allowance evidence/i);
      assert.equal(probes, 0);
      const after = await read(path.join(f.out, 'run.json'));
      assert.equal(after.attempts.length, 0);
      assert.deepEqual(after.spending_policy, before.spending_policy);
    }
  }
});

test('spending and QA purpose seals cannot be silently weakened in mutable state', async () => {
  for (const field of ['spending_policy', 'purpose']) {
    const f = await fixture({ spending: 'included-only' });
    const state = await read(path.join(f.out, 'run.json'));
    state[field] = field === 'purpose' ? 'planning' : { version: 1, spending: 'subscription' };
    writeRunState(f.out, state);
    assert.throws(() => preview({ run: f.out, stage: 'review' }), /changed after preparation/);
    await assert.rejects(ask({ run: f.out, stage: 'review' }, () => assert.fail('No worker call'), { probe: fakeProbe }), /changed after preparation/);
    assert.equal((await read(path.join(f.out, 'run.json'))).attempts.length, 0);
  }
});

test('a per-run included-only restriction is sealed without changing shared subscription preferences', async () => {
  for (const coordinator of ['codex', 'claude']) {
    const f = await fixture({ spending: 'subscription', runSpending: 'included-only', coordinator });
    const state = await read(path.join(f.out, 'run.json'));
    const snapshot = await read(path.join(f.out, 'snapshot.json'));
    assert.deepEqual(state.spending_policy, { version: 1, spending: 'included-only' });
    assert.deepEqual(snapshot.spending_policy, state.spending_policy);
    assert.equal(readPreferences().spending, 'subscription');
    assert.equal(await fs.readFile(f.preferencesFile, 'utf8'), f.preferencesBefore);
    let probes = 0;
    await assert.rejects(ask({ run: f.out, stage: 'review' }, () => assert.fail('No worker call'), { probe: async provider => { probes++; return fakeProbe(provider); } }), /current allowance evidence/i);
    assert.equal(probes, 0);
    assert.equal((await read(path.join(f.out, 'run.json'))).attempts.length, 0);
    assert.equal(await fs.readFile(f.preferencesFile, 'utf8'), f.preferencesBefore);
  }
});

test('a per-run subscription selection cannot weaken shared included-only preferences', async () => {
  const f = await fixture({ spending: 'included-only', runSpending: 'subscription' });
  assert.deepEqual((await read(path.join(f.out, 'run.json'))).spending_policy, { version: 1, spending: 'included-only' });
  assert.deepEqual((await read(path.join(f.out, 'snapshot.json'))).spending_policy, { version: 1, spending: 'included-only' });
  await assert.rejects(call(f, 'review'), /current allowance evidence/i);
  assert.equal((await read(path.join(f.out, 'run.json'))).attempts.length, 0);
  assert.equal(readPreferences().spending, 'included-only');
  assert.equal(await fs.readFile(f.preferencesFile, 'utf8'), f.preferencesBefore);
});

test('invalid per-run spending policies fail before run creation and preserve saved preferences', async () => {
  for (const spending of ['credits', '', null]) {
    const f = await fixture({ prepareRun: false });
    const { project, brief, context, assessment, coordinator, purpose, mode, out } = f;
    assert.throws(() => prepare({ project, brief, context, assessment, coordinator, purpose, mode, out, spending }), /spending|preferences/i);
    await assert.rejects(fs.stat(out), { code: 'ENOENT' });
    assert.equal(await fs.readFile(f.preferencesFile, 'utf8'), f.preferencesBefore);
  }
});

test('the prepare CLI accepts per-run spending and does not expose it as an ask-time override', async () => {
  const f = await fixture({ prepareRun: false });
  const runner = fileURLToPath(new URL('../scripts/council.mjs', import.meta.url));
  const invoke = args => spawnSync(process.execPath, [runner, ...args], { encoding: 'utf8', env: process.env, timeout: 30000 });
  const prepared = invoke(['prepare', '--project', f.project, '--brief', f.brief, '--assessment', f.assessment, '--coordinator', f.coordinator,
    '--mode', f.mode, '--purpose', f.purpose, '--out', f.out, '--spending', 'included-only']);
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal((await read(path.join(f.out, 'run.json'))).spending_policy.spending, 'included-only');
  assert.equal(await fs.readFile(f.preferencesFile, 'utf8'), f.preferencesBefore);
  const changed = invoke(['ask', '--run', f.out, '--stage', 'review', '--spending', 'subscription']);
  assert.notEqual(changed.status, 0);
  assert.match(changed.stderr, /Invalid option: --spending/);
  assert.equal((await read(path.join(f.out, 'run.json'))).attempts.length, 0);
});

test('a spending preference tightened during preflight is honored before reserving an attempt', async () => {
  const f = await fixture({ spending: 'subscription' });
  let probes = 0;
  await assert.rejects(ask({ run: f.out, stage: 'review' }, () => assert.fail('A new included-only restriction must prevent launch'), { probe: async provider => {
    probes++;
    writePreferences({ spending: 'included-only' });
    return fakeProbe(provider);
  } }), /current allowance evidence/i);
  assert.equal(probes, 1);
  assert.equal((await read(path.join(f.out, 'run.json'))).attempts.length, 0);
});

test('expired, wrong-provider, wrong-auth and override-route allowance declarations reserve no attempts', async () => {
  const f = await fixture({ spending: 'included-only' });
  const now = Date.now();
  const cases = [
    { evidence: { observed_at: new Date(now - 7200000).toISOString(), valid_until: new Date(now - 3600000).toISOString() }, pattern: /expired/ },
    { evidence: { provider: 'codex', auth_method: 'chatgpt' }, pattern: /different provider/ },
    { evidence: { auth_method: 'chatgpt' }, pattern: /authentication method/ },
    { info: { auth_route: 'api' }, pattern: /subscription route/ },
    { info: { route_environment_overrides: ['ANTHROPIC_API_KEY'] }, pattern: /credential overrides/ },
  ];
  for (const item of cases) {
    const declared = await allowance(f, item.evidence);
    let probes = 0;
    await assert.rejects(ask({ run: f.out, stage: 'review', 'allowance-evidence': declared.file }, () => assert.fail('No worker call'), { probe: async provider => { probes++; return { ...await fakeProbe(provider), ...item.info }; } }), item.pattern);
    assert.equal(probes, 1);
    assert.equal((await read(path.join(f.out, 'run.json'))).attempts.length, 0);
    assert.equal((await fs.readdir(f.out)).some(file => /^attempt-/.test(file)), false);
  }
});

test('valid allowance declaration is retained as local metadata and never sent in worker context', async () => {
  for (const coordinator of ['codex', 'claude']) {
    const f = await fixture({ spending: 'included-only', coordinator });
    const declared = await allowance(f);
    let seen = false;
    await ask({ run: f.out, stage: 'review', 'allowance-evidence': declared.file }, invocation(report(), ({ prompt, args }) => {
      seen = true;
      assert.equal(prompt.includes(declared.value.reference), false);
      assert.equal(prompt.includes(declared.file), false);
      assert.equal(args.includes(declared.file), false);
      const packet = JSON.parse(prompt.split('\nCOUNCIL_PACKET_JSON\n')[1]);
      assert.equal(packet.allowance_evidence, undefined);
      assert.equal(packet.shared_context.allowance_evidence, undefined);
    }), { probe: fakeProbe });
    assert.equal(seen, true);
    const state = await read(path.join(f.out, 'run.json'));
    assert.equal(state.attempts[0].spending_policy.spending, 'included-only');
    assert.equal(state.attempts[0].allowance_evidence.reference, declared.value.reference);
    assert.equal(state.attempts[0].allowance_evidence.sha256, sha(await fs.readFile(declared.file, 'utf8')));
    assert.match(state.attempts[0].allowance_evidence.assurance, /not independent billing attestation/);
    assert.equal((await fs.readFile(path.join(f.out, 'attempt-1-review-input.txt'), 'utf8')).includes(declared.value.reference), false);
  }
});

test('duplicate allowance declarations cannot erase a conflicting provider, scope or expiry', async () => {
  const f = await fixture({ spending: 'included-only' });
  const declared = await allowance(f), clean = JSON.stringify(declared.value);
  for (const raw of [
    clean.replace('"provider":"claude"', '"\\u0070rovider":"codex","provider":"claude"'),
    clean.replace('"allowance":"included-only"', '"allowance":"paid-credits","allowance":"included-only"'),
    clean.replace(`"valid_until":"${declared.value.valid_until}"`, `"valid_until":"2020-01-01T00:00:00Z","valid_until":"${declared.value.valid_until}"`),
  ]) {
    await write(declared.file, raw);
    await assert.rejects(ask({ run: f.out, stage: 'review', 'allowance-evidence': declared.file }, () => assert.fail('No worker call'), { probe: fakeProbe }), /duplicate object keys/);
    assert.equal((await read(path.join(f.out, 'run.json'))).attempts.length, 0);
  }
});

test('prepare accepts only explicit planning or QA purposes before creating output', async () => {
  const f = await fixture({ prepareRun: false });
  const { project, brief, context, assessment, coordinator, mode, out } = f;
  assert.throws(() => prepare({ project, brief, context, assessment, coordinator, mode, out, purpose: 'certified' }), /Purpose must be planning or qa/);
  await assert.rejects(fs.stat(out), { code: 'ENOENT' });
});

test('QA verification and completion require assurance; proposed checks remain explicitly incomplete', async () => {
  const f = await readyForVerify({ withAssurance: false });
  assert.equal(quality({ run: f.out }).assurance.status, 'not_recorded');
  assert.throws(() => preview({ run: f.out, stage: 'verify' }), /QA verification requires/);
  await assert.rejects(call(f, 'verify'), /QA verification requires/);
  assert.equal((await read(path.join(f.out, 'run.json'))).attempts.length, 1);
  await write(path.join(f.out, 'decisions.json'), f.document);
  await call(f, 'verify', report(), ({ prompt }) => {
    const packet = JSON.parse(prompt.split('\nCOUNCIL_PACKET_JSON\n')[1]);
    assert.equal(packet.purpose, 'qa');
    assert.deepEqual(packet.assurance, f.document.assurance);
    assert.equal(packet.assurance_check.status, 'recorded');
    assert.equal(packet.assurance_check.readiness, 'incomplete');
    assert.equal(packet.final_plan, plan);
  });
  await write(path.join(f.out, 'decisions.json'), []);
  assert.throws(() => finish({ run: f.out }), /QA completion requires/);
  await write(path.join(f.out, 'decisions.json'), f.document);
  const complete = finish({ run: f.out });
  assert.equal(complete.assurance.readiness, 'incomplete');
  assert.equal(complete.purpose, 'qa');
});

test('legacy planning decisions arrays still complete with assurance not recorded', async () => {
  const f = await readyForVerify({ withAssurance: false, purpose: 'planning' });
  await call(f, 'verify');
  const complete = finish({ run: f.out });
  assert.equal(complete.assurance.status, 'not_recorded');
  assert.equal(complete.assurance.readiness, 'incomplete');
  assert.equal(complete.outcome, 'complete_with_recorded_decisions');
});

test('accepted decisions need operative plan anchors before a verification attempt', async () => {
  const f = await readyForVerify({ reviewIds: ['P-R1'] });
  f.document.assurance.accepted_decisions = [];
  await write(path.join(f.out, 'decisions.json'), f.document);
  assert.ok(quality({ run: f.out }).assurance.issues.some(item => item.code === 'accepted_decision_anchor_missing'));
  await assert.rejects(call(f, 'verify'), /Invalid assurance contract/);
  assert.equal((await read(path.join(f.out, 'run.json'))).attempts.length, 1);
});

test('stale plan and evidence hashes invalidate QA before verification and before completion', async () => {
  const f = await readyForVerify({ checkStatus: 'passed' });
  const original = copy(f.document);
  for (const phase of ['before', 'after']) {
    if (phase === 'after') await call(f, 'verify');
    for (const change of ['plan', 'evidence']) {
      const document = copy(original);
      if (change === 'plan') await write(path.join(f.out, 'final-plan.md'), `${plan}An added consequential constraint.\n`);
      else {
        document.assurance.checks[0].evidence[0].sha256 = sha('A stale unrelated receipt.');
        document.assurance.checks[0].observation.evidence[0].sha256 = sha('A stale unrelated receipt.');
        await write(path.join(f.out, 'decisions.json'), document);
      }
      const view = quality({ run: f.out });
      assert.equal(view.assurance.status, 'invalid');
      assert.ok(view.assurance.issues.some(item => item.code === (change === 'plan' ? 'plan_hash_mismatch' : 'evidence_hash_mismatch')));
      if (phase === 'before') await assert.rejects(call(f, 'verify'), /Invalid assurance contract/);
      else assert.throws(() => finish({ run: f.out }), /Invalid assurance contract/);
      await write(path.join(f.out, 'final-plan.md'), plan);
      await write(path.join(f.out, 'decisions.json'), original);
    }
  }
  assert.equal((await read(path.join(f.out, 'run.json'))).attempts.length, 2);
  assert.equal(finish({ run: f.out }).assurance.readiness, 'ready_for_review');
});

test('decision synchronization preserves assurance and new verifier links alone need no extra review', async () => {
  const f = await readyForVerify();
  await call(f, 'verify', report(['P-V1', 'P-V2']));
  const synchronized = syncDecisions({ run: f.out });
  assert.deepEqual(synchronized.added, ['P-V1', 'P-V2']);
  const document = await read(path.join(f.out, 'decisions.json'));
  assert.deepEqual(document.assurance, f.document.assurance);
  document.decisions[0] = { finding_id: 'P-V1', disposition: 'rejected', rationale: 'The current operative check already covers this hypothetical failure.' };
  document.decisions[1] = { finding_id: 'P-V2', disposition: 'accepted', rationale: 'The remedy is already present in the current operative boundary.' };
  document.assurance.checks[0].finding_ids = ['P-V1', 'P-V2'];
  document.assurance.accepted_decisions.push({ finding_id: 'P-V2', quote: 'Retain the existing compatible payload.' });
  await write(path.join(f.out, 'decisions.json'), document);
  assert.equal(quality({ run: f.out }).assurance.status, 'recorded');
  await assert.rejects(call(f, 'verify-final'), /No revised plan/);
  assert.equal((await read(path.join(f.out, 'run.json'))).attempts.length, 2);
  const complete = finish({ run: f.out });
  assert.equal(complete.outcome, 'complete_with_recorded_decisions');
  assert.equal(complete.assurance_changed_since_verification, false);
});

test('duplicate JSON keys cannot erase conflicting assurance statuses or evidence digests at integration boundaries', async () => {
  const f = await readyForVerify({ checkStatus: 'passed' });
  const clean = JSON.stringify(f.document);
  const edits = [
    raw => raw.replace('"version":1', '"version":2,"version":1'),
    raw => raw.replace('"status":"passed"', '"status":"failed","status":"passed"'),
    raw => raw.replace('"result":"passed"', '"result":"failed","result":"passed"'),
    raw => raw.replace(`"sha256":"${f.document.assurance.checks[0].evidence[0].sha256}"`, `"sha256":"${sha('Conflicting stale evidence.')}" ,"sha256":"${f.document.assurance.checks[0].evidence[0].sha256}"`),
  ];
  for (const edit of edits) {
    await write(path.join(f.out, 'decisions.json'), edit(clean));
    assert.throws(() => quality({ run: f.out }), /duplicate object keys/);
    await assert.rejects(call(f, 'verify'), /duplicate object keys/);
    assert.equal((await read(path.join(f.out, 'run.json'))).attempts.length, 1);
  }
  await write(path.join(f.out, 'decisions.json'), clean);
  await call(f, 'verify');
  await write(path.join(f.out, 'decisions.json'), edits[1](clean));
  assert.throws(() => finish({ run: f.out }), /duplicate object keys/);
  await write(path.join(f.out, 'decisions.json'), clean);
  assert.equal(finish({ run: f.out }).assurance.readiness, 'ready_for_review');
});

test('an operative assurance revision requires the single bounded revision review', async () => {
  const f = await readyForVerify();
  await call(f, 'verify');
  f.document.assurance.checks[0].status = 'blocked';
  f.document.assurance.checks[0].reason = 'The scoped fixture needs an authorized execution environment.';
  await write(path.join(f.out, 'decisions.json'), f.document);
  assert.throws(() => finish({ run: f.out }), /bounded verify-final check/);
  await call(f, 'verify-final', report(), ({ prompt }) => {
    const packet = JSON.parse(prompt.split('\nCOUNCIL_PACKET_JSON\n')[1]);
    assert.equal(packet.assurance.checks[0].status, 'blocked');
    assert.equal(packet.previous_verification.summary, report().summary);
    assert.equal(packet.final_plan, plan);
  });
  const complete = finish({ run: f.out });
  assert.equal(complete.verification_stage, 'verify-final');
  assert.equal(complete.assurance.readiness, 'incomplete');
  assert.equal(complete.assurance_changed_since_verification, false);
});

test('provisional completion discloses unreviewed assurance changes in the compact result', async () => {
  const f = await readyForVerify();
  await call(f, 'verify');
  f.document.assurance.checks[0].reason = 'The scope now includes an explicit environment hold for this check.';
  await write(path.join(f.out, 'decisions.json'), f.document);
  const complete = finish({ run: f.out, 'unverified-reason': 'The user chose to stop within the existing review allowance.' });
  assert.equal(complete.outcome, 'complete_with_unreviewed_revision');
  assert.equal(complete.assurance_changed_since_verification, true);
  assert.match(await fs.readFile(complete.result, 'utf8'), /assurance record changed after peer verification/i);
});

test('content QA completion returns all three readable deliverables and keeps the full plan separate', async () => {
  const f = await readyForVerify({ content: true });
  const unique = 'OPERATIVE_CONTENT_SECTION_28476';
  const editorialPlan = '# Revised editorial plan\nChoose B: prepare a source-linked accessible explainer.\nRetain verified quotations and attribute each factual claim.\nEvery quotation links to its supplied source.\n';
  const finalPlan = `${editorialPlan}\n## ${unique}\n${'A bounded editorial instruction preserves attribution and accessible language.\n'.repeat(120)}`;
  f.document.assurance.plan_sha256 = sha(finalPlan);
  f.document.assurance.selected_option = { id: 'B', quote: 'Choose B: prepare a source-linked accessible explainer.' };
  f.document.assurance.checks[0].quote = 'Every quotation links to its supplied source.';
  f.document.assurance.checks[0].reason = 'Source comparison and editorial proof review are proposed and have not run.';
  await write(path.join(f.out, 'final-plan.md'), finalPlan);
  await write(path.join(f.out, 'decisions.json'), f.document);
  await call(f, 'verify', report(), ({ prompt }) => {
    const packet = JSON.parse(prompt.split('\nCOUNCIL_PACKET_JSON\n')[1]);
    assert.equal(packet.work_profile, 'content');
    assert.equal(packet.final_plan, finalPlan);
  });
  const complete = finish({ run: f.out });
  assert.equal(complete.plan, path.join(f.out, 'final-plan.md'));
  assert.equal(complete.discussion, path.join(f.out, 'DISCUSSION.md'));
  assert.equal(complete.result, path.join(f.out, 'RESULT.md'));
  for (const file of [complete.plan, complete.discussion, complete.result]) assert.ok((await fs.stat(file)).isFile());
  assert.equal(await fs.readFile(complete.plan, 'utf8'), finalPlan);
  const result = await fs.readFile(complete.result, 'utf8');
  assert.match(result, /\[Open the revised plan\]\(final-plan\.md\)/);
  assert.match(result, /\[Discussion and decisions\]\(DISCUSSION\.md\)/);
  assert.equal(result.includes(unique), false);
  assert.match(result, /not a correctness guarantee/);
  assert.match(result, /does not certify the implementation or prove proposed tests passed/);
  assert.equal(status({ run: f.out }).status, 'complete');
});
