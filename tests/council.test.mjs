import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import {
  prepare, ask, finish, status, extend, discussion, validateReport, parsePeerResponse,
  buildPeerArgs, REPORT_SCHEMA, runProcess,
} from '../scripts/council.mjs';
import { validateAssessment, ASSESSMENT_SCHEMA } from '../scripts/assessment.mjs';
import { writeRunState } from '../scripts/state.mjs';

const tempParent = await fs.realpath(os.tmpdir());
const testRoot = await fs.mkdtemp(path.join(tempParent, 'council-test-'));
after(async () => {
  const resolved = await fs.realpath(testRoot);
  assert.equal(path.dirname(resolved), tempParent, 'Refusing cleanup outside the test temporary directory');
  assert.ok(path.basename(resolved).startsWith('council-test-'));
  await fs.rm(resolved, { recursive: true, force: true });
});
const write = async (p, value) => path.basename(p) === 'run.json' && typeof value === 'object' ? writeRunState(path.dirname(p),value) : fs.writeFile(p, typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8');
const read = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
function assessment() {
  return {
    assessed_at: '2026-10-06T12:00:00.000Z',
    summary: 'ASSESSMENT_CONTEXT_TOKEN: isolated synthetic exporter fixture.',
    project_type: 'software',
    deployment: { status: 'non_production', evidence: ['E1'] },
    readiness: { status: 'not_assessed', scope: 'Only this temporary fixture is in scope.', gaps: [], evidence: [] },
    evidence: [{ id: 'E1', source: 'Test fixture setup', observation: 'The test created a temporary project with no deployed service.', kind: 'observed' }],
    direction: {
      route: 'extend_existing', clarity: 'ready', goal: 'Add reliable export to the fixture.',
      scope: ['Field escaping and deterministic ordering.'],
      success_criteria: ['Quoted fields round-trip and export ordering is reproducible.'],
      constraints: ['Use the explicitly provided fixture context.'],
      next_step: 'Inspect the exporter interface before selecting the smallest implementation change.',
    },
    unknowns: [],
  };
}
function report(ids = [], token = 'A useful report') {
  return {
    summary: token, verdict: ids.length ? 'needs_changes' : 'ready',
    proposal_markdown: `Plan from ${token}: implement the requirement, then verify its acceptance criteria.`,
    findings: ids.map(id => ({id,severity:'major',claim:`Claim ${id}`,evidence:'Explicitly hypothetical test fixture.',action:`Resolve ${id}`,verification:'Run the specified acceptance check.'})),
    assumptions: [], open_questions: [], limitations: [],
  };
}
function invocation(result = report()) {
  return async ({provider}) => ({
    code: 0, stderr: '',
    stdout: provider === 'claude'
      ? JSON.stringify({type:'result',subtype:'success',is_error:false,structured_output:result,result:JSON.stringify(result),session_id:'claude-test-session'})
      : [{type:'thread.started',thread_id:'codex-test-session'},{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}},{type:'turn.completed',usage:{input_tokens:10,output_tokens:20}}].map(x=>JSON.stringify(x)).join('\n'),
  });
}
async function inputFixture(label) {
  const root = await fs.mkdtemp(path.join(testRoot, `${label}-`));
  const project = path.join(root, 'project');
  const out = path.join(root, 'run');
  await fs.mkdir(project);
  const brief = path.join(root, 'brief.txt');
  const context = path.join(project, 'context.txt');
  const assessmentFile = path.join(root, 'assessment.json');
  await write(brief, 'Build a reliable export feature. Success: escaped fields and reproducible ordering.');
  await write(context, 'INPUT_CONTEXT_TOKEN: existing exporter has no dependency on the database.');
  await write(assessmentFile, assessment());
  return {root,project,out,brief,context,assessment:assessmentFile};
}
const prepareOptions = f => ({project:f.project,brief:f.brief,assessment:f.assessment,context:[f.context],coordinator:'codex',mode:'plan',out:f.out});
async function fixture(label, extra = {}) {
  const f = await inputFixture(label);
  await prepare({...prepareOptions(f),...extra});
  return f;
}
async function hostDraft(f, ids = [], token = 'HOST_DRAFT_SECRET_714') {
  await write(path.join(f.out,'coordinator-draft.json'),report(ids,token));
}
async function hostReview(f, ids = [], token = 'HOST_REVIEW_SECRET_952') {
  await write(path.join(f.out,'coordinator-review.json'),report(ids,token));
}
async function readyForVerify(label, options = {}) {
  const f = await fixture(label,options);
  await hostDraft(f,['C-D1']);
  if ((options.mode ?? 'plan') === 'plan') await ask({run:f.out,stage:'draft'},invocation(report(['peer-any-id'])));
  await hostReview(f,['C-R1']);
  await ask({run:f.out,stage:'review'},invocation(report(['peer-any-id'])));
  const ids = ['C-D1','C-R1','P-R1'];
  if ((options.mode ?? 'plan') === 'plan') ids.push('P-D1');
  await write(path.join(f.out,'security-review.json'),report([], 'SECURITY_REVIEW_PRIVATE_481: synthetic review of input handling; tests remain proposed'));
  await write(path.join(f.out,'final-plan.md'),'# Final plan\nImplement escaping and deterministic ordering.\n');
  await write(path.join(f.out,'decisions.json'),ids.map(finding_id=>({finding_id,disposition:'accepted',rationale:'Covered by final plan acceptance criteria.'})));
  return f;
}

test('report validator rejects incomplete and invalid reports', () => {
  assert.doesNotThrow(()=>validateReport(report(['C-D1']),'C-D'));
  assert.throws(()=>validateReport({summary:'incomplete'}));
  assert.throws(()=>validateReport({...report(),verdict:'approved'}));
  assert.throws(()=>validateReport(report(['C-D1','C-D1'])));
  assert.throws(()=>validateReport(report(['C-R1']),'C-D'));
  assert.equal(REPORT_SCHEMA.type,'object');
});

test('project assessment rejects empty direction and unsupported deployment or readiness claims', () => {
  assert.doesNotThrow(()=>validateAssessment(assessment()));
  const reported=assessment();
  reported.deployment.status='production';
  reported.evidence[0].kind='user_reported';
  assert.doesNotThrow(()=>validateAssessment(reported));
  const checked=assessment();
  checked.readiness={status:'checks_passed_for_scope',scope:'Fixture input validation checks only.',gaps:[],evidence:['E1']};
  checked.evidence[0].observation='Synthetic input-validation checks passed; no wider readiness claim is made.';
  assert.doesNotThrow(()=>validateAssessment(checked));
  const leap=assessment();
  leap.assessed_at='2024-02-29T23:59:59.999+03:00';
  assert.doesNotThrow(()=>validateAssessment(leap));
  assert.equal(ASSESSMENT_SCHEMA.type,'object');
  const invalid = [
    ['missing assessment field', a => { delete a.summary; }],
    ['blank summary', a => { a.summary=' '; }],
    ['invalid timestamp', a => { a.assessed_at='today'; }],
    ['February 30', a => { a.assessed_at='2026-02-30T12:00:00Z'; }],
    ['April 31', a => { a.assessed_at='2026-04-31T12:00:00Z'; }],
    ['non-leap February 29', a => { a.assessed_at='2025-02-29T12:00:00Z'; }],
    ['hour 24', a => { a.assessed_at='2026-10-06T24:00:00Z'; }],
    ['minute 60', a => { a.assessed_at='2026-10-06T12:60:00Z'; }],
    ['timezone minute 60', a => { a.assessed_at='2026-10-06T12:00:00+03:60'; }],
    ['empty scope', a => { a.direction.scope=[]; }],
    ['blank success criterion', a => { a.direction.success_criteria=['  ']; }],
    ['missing success criteria', a => { a.direction.success_criteria=[]; }],
    ['blank next step', a => { a.direction.next_step=' '; }],
    ['duplicate evidence ID', a => { a.evidence.push({...a.evidence[0]}); }],
    ['missing evidence reference', a => { a.deployment.evidence=['MISSING']; }],
    ['blank evidence observation', a => { a.evidence[0].observation=' '; }],
    ['production inferred from a clue', a => { a.deployment.status='production'; a.evidence[0].kind='inferred'; }],
    ['nonproduction without evidence', a => { a.deployment.evidence=[]; }],
    ['production status invented', a => { a.deployment.status='staging'; }],
    ['readiness from user assertion', a => { a.readiness.status='checks_passed_for_scope'; a.readiness.evidence=['E1']; a.evidence[0].kind='user_reported'; }],
    ['checks passed despite gaps', a => { a.readiness.status='checks_passed_for_scope'; a.readiness.evidence=['E1']; a.readiness.gaps=['Unverified access policy.']; }],
    ['gaps found without gaps', a => { a.readiness.status='gaps_found'; }],
    ['unknown deployment with no unknowns', a => { a.deployment.status='unknown'; a.deployment.evidence=[]; }],
    ['unclear direction with no unknowns', a => { a.direction.clarity='discovery_needed'; }],
    ['blank constraint', a => { a.direction.constraints=[' ']; }],
    ['unknown field', a => { a.production_ready=true; }],
  ];
  for (const [label, mutate] of invalid) {
    const value=assessment();
    mutate(value);
    assert.throws(()=>validateAssessment(value),undefined,label);
  }
});

test('prepare requires a valid assessment before creating a run', async () => {
  const f=await inputFixture('assessment-required');
  const options=prepareOptions(f);
  delete options.assessment;
  await assert.rejects(async()=>prepare(options),/assessment/i);
  await assert.rejects(()=>fs.access(f.out));
  for (const content of ['{invalid json', '{}', JSON.stringify({...assessment(),summary:' '})]) {
    await write(f.assessment,content);
    await assert.rejects(async()=>prepare(prepareOptions(f)));
    await assert.rejects(()=>fs.access(f.out));
  }
});

test('user-blocked direction cannot create a run or spend a peer attempt', async () => {
  const f=await inputFixture('assessment-needs-user');
  const value=assessment();
  value.direction.clarity='needs_user_input';
  value.unknowns=['The user must choose whether to replace or extend the live application.'];
  await write(f.assessment,value);
  await assert.rejects(async()=>prepare(prepareOptions(f)),/needs_user_input|user input|clarif/i);
  await assert.rejects(()=>fs.access(f.out));
  let called=false;
  await assert.rejects(()=>ask({run:f.out,stage:'draft'},async req=>{called=true;return invocation()(req);}));
  assert.equal(called,false);
});

test('new builds, unknown deployments and non-software discovery retain honest project context', async () => {
  const newBuild=assessment();
  newBuild.direction.route='new_build';
  newBuild.direction.goal='Build a new application from the supplied requirements.';
  const newInputs=await inputFixture('assessment-new-build');
  await write(newInputs.assessment,newBuild);
  await prepare(prepareOptions(newInputs));
  assert.equal((await status({run:newInputs.out})).project_assessment.direction.route,'new_build');

  const discovery=assessment();
  discovery.deployment={status:'unknown',evidence:[]};
  discovery.direction.route='discovery';
  discovery.direction.clarity='discovery_needed';
  discovery.direction.next_step='Inspect the selected deployment record and summarize which environment is actually serving users.';
  discovery.unknowns=['The current deployment environment has no confirmed evidence.'];
  const discoveryInputs=await inputFixture('assessment-discovery');
  await write(discoveryInputs.assessment,discovery);
  await prepare(prepareOptions(discoveryInputs));
  const discoveryContext=(await status({run:discoveryInputs.out})).project_assessment;
  assert.equal(discoveryContext.deployment.status,'unknown');
  assert.equal(discoveryContext.direction.clarity,'discovery_needed');
  assert.deepEqual(discoveryContext.unknowns,discovery.unknowns);

  const nonSoftware=assessment();
  nonSoftware.project_type='non_software';
  nonSoftware.deployment={status:'not_applicable',evidence:[]};
  nonSoftware.readiness={status:'not_applicable',scope:'A workshop agenda has no software deployment.',gaps:[],evidence:[]};
  nonSoftware.evidence=[];
  nonSoftware.direction={route:'non_software',clarity:'discovery_needed',goal:'Prepare a workshop.',scope:['Find audience needs before drafting the agenda.'],success_criteria:['A confirmed audience and an agreed workshop outcome.'],constraints:[],next_step:'Summarize the known audience evidence and identify the missing decision.'};
  nonSoftware.unknowns=['Audience needs are not yet confirmed.'];
  const nonSoftwareInputs=await inputFixture('assessment-non-software');
  await write(nonSoftwareInputs.assessment,nonSoftware);
  await prepare(prepareOptions(nonSoftwareInputs));
  const context=(await status({run:nonSoftwareInputs.out})).project_assessment;
  assert.equal(context.deployment.status,'not_applicable');
  assert.equal(context.readiness.status,'not_applicable');
  assert.equal(context.direction.clarity,'discovery_needed');
  assert.deepEqual(context.unknowns,nonSoftware.unknowns);
  assert.throws(()=>validateAssessment({...nonSoftware,direction:{...nonSoftware.direction,route:'extend_existing'}}));
  assert.throws(()=>validateAssessment({...nonSoftware,deployment:{status:'production',evidence:[]}}));
});

test('project assessment is frozen in every peer stage while source changes remain visible', async () => {
  const f=await fixture('assessment-frozen');
  const original=await read(f.assessment);
  const snapshot=await read(path.join(f.out,'snapshot.json'));
  assert.deepEqual(snapshot.project_assessment,original);
  assert.equal(snapshot.inputs.find(input=>input.kind==='assessment').path,f.assessment);
  assert.deepEqual(await read(path.join(f.out,'project-assessment.json')),original);
  assert.match(await fs.readFile(path.join(f.out,'PROJECT_CONTEXT.md'),'utf8'),/isolated synthetic exporter fixture/);
  await write(f.assessment,{...original,summary:'REVISED_ASSESSMENT_TOKEN: later evidence needs a new run.'});
  assert.deepEqual((await status({run:f.out})).changed_source_files,[f.assessment]);
  const captured=[];
  const fake=async req=>{
    captured.push(JSON.parse(req.prompt.split('COUNCIL_PACKET_JSON\n')[1]));
    assert.ok(!req.prompt.includes('REVISED_ASSESSMENT_TOKEN'));
    return invocation()(req);
  };
  await hostDraft(f);
  await ask({run:f.out,stage:'draft'},fake);
  await hostReview(f);
  await ask({run:f.out,stage:'review'},fake);
  await write(path.join(f.out,'security-review.json'),report());
  await write(path.join(f.out,'final-plan.md'),'# Plan\nUse the agreed exporter scope and run the acceptance checks.');
  await write(path.join(f.out,'decisions.json'),[]);
  await ask({run:f.out,stage:'verify'},fake);
  assert.equal(captured.length,3);
  for (const packet of captured) assert.deepEqual(packet.shared_context.project_assessment,original);
  const completed=await finish({run:f.out});
  assert.deepEqual(completed.project_assessment,{required:true,...original});
  assert.deepEqual(completed.source_changes,[f.assessment]);
});

test('sealed project assessment and human context cannot be silently rewritten', async () => {
  for (const file of ['project-assessment.json','PROJECT_CONTEXT.md']) {
    const f=await fixture(`assessment-tamper-${path.extname(file).slice(1)}`);
    await hostDraft(f);
    await write(path.join(f.out,file),file.endsWith('.json')?{...assessment(),summary:'Edited frozen context'}:'# Rewritten project status');
    let called=false;
    await assert.rejects(()=>ask({run:f.out,stage:'draft'},async req=>{called=true;return invocation()(req);}),/Sealed artifact changed/);
    assert.equal(called,false);
    assert.equal((await read(path.join(f.out,'run.json'))).attempts.length,0);
    assert.throws(()=>status({run:f.out}),/Sealed artifact changed/);
  }
});

test('peer approval cannot erase production gaps or unknowns from completion', async () => {
  const value=assessment();
  value.deployment.status='production';
  value.evidence[0]={id:'E1',source:'Synthetic deployment fixture',observation:'This fixture explicitly represents an existing live deployment.',kind:'user_reported'};
  value.readiness={status:'gaps_found',scope:'Backup recovery and the new export path.',gaps:['Restore rehearsal has no observed passing result.'],evidence:['E1']};
  value.direction.route='harden_existing';
  value.unknowns=['Recovery-time objective is unconfirmed.'];
  const f=await inputFixture('assessment-production');
  await write(f.assessment,value);
  await prepare({...prepareOptions(f),mode:'review'});
  await hostDraft(f);
  await hostReview(f);
  await ask({run:f.out,stage:'review'},invocation());
  await write(path.join(f.out,'security-review.json'),report());
  await write(path.join(f.out,'final-plan.md'),'# Plan\nRehearse restores and prove the scoped export behavior before rollout.');
  await write(path.join(f.out,'decisions.json'),[]);
  await ask({run:f.out,stage:'verify'},invocation());
  const completed=await finish({run:f.out});
  assert.equal(completed.peer_verdict,'ready');
  assert.deepEqual(completed.project_assessment,{required:true,...value});
  const result=await fs.readFile(path.join(f.out,'RESULT.md'),'utf8');
  assert.match(result,/production/);
  assert.match(result,/Restore rehearsal has no observed passing result/);
  assert.match(result,/Recovery-time objective is unconfirmed/);
});

test('assessment secrets and combined input size are rejected before a run is created', async () => {
  const secret=await inputFixture('assessment-secret');
  await write(secret.assessment,{...assessment(),summary:'Unsafe credential example sk-'+'x'.repeat(28)});
  await assert.rejects(async()=>prepare(prepareOptions(secret)),/Possible credential/);
  await assert.rejects(()=>fs.access(secret.out));
  const large=await inputFixture('assessment-size');
  await write(large.context,'x'.repeat(239500));
  await assert.rejects(async()=>prepare(prepareOptions(large)),/context exceeds|summarize/i);
  await assert.rejects(()=>fs.access(large.out));
});

test('prepare CLI accepts an explicit assessment and persists the preflight without launching a peer', async () => {
  const f=await inputFixture('assessment-cli');
  const result=spawnSync(process.execPath,[path.join(packageRoot,'scripts','council.mjs'),'prepare','--project',f.project,'--brief',f.brief,'--assessment',f.assessment,'--coordinator','codex','--out',f.out],{cwd:f.root,encoding:'utf8',windowsHide:true,timeout:5000});
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).run,f.out);
  const manifest=await read(path.join(f.out,'run.json'));
  assert.equal(manifest.version,4);
  assert.equal(manifest.status,'prepared');
  assert.deepEqual(manifest.attempts,[]);
  assert.deepEqual(await read(path.join(f.out,'project-assessment.json')),assessment());
});

test('preconditions prevent invented stages and incomplete completion', async () => {
  const f = await fixture('sequence');
  const fake = invocation();
  await assert.rejects(async()=>ask({run:f.out,stage:'review'},fake));
  await assert.rejects(async()=>ask({run:f.out,stage:'verify'},fake));
  await assert.rejects(async()=>finish({run:f.out}));
  await assert.rejects(async()=>ask({run:f.out,stage:'invented'},fake));
  await hostDraft(f);
  await ask({run:f.out,stage:'draft'},fake);
  await assert.rejects(async()=>ask({run:f.out,stage:'draft'},fake));
});

test('draft and mutual critique remain independent', async () => {
  const f = await fixture('independence');
  await hostDraft(f);
  await write(path.join(f.out,'security-review.json'), report([], 'SECURITY_PRIVATE_BEFORE_VERIFICATION'));
  let draftRequest;
  await ask({run:f.out,stage:'draft'},async req=>{ draftRequest=req; return invocation(report(['untrusted-id']))(req); });
  assert.ok(draftRequest.prompt.includes('INPUT_CONTEXT_TOKEN'));
  assert.ok(!draftRequest.prompt.includes('HOST_DRAFT_SECRET_714'),'peer independent draft saw the coordinator draft');
  assert.ok(!draftRequest.prompt.includes('SECURITY_PRIVATE_BEFORE_VERIFICATION'));
  assert.notEqual(path.resolve(draftRequest.cwd),path.resolve(f.project));
  assert.deepEqual((await read(path.join(f.out,'peer-draft.json'))).findings.map(x=>x.id),['P-D1']);
  await hostReview(f);
  let reviewRequest;
  await ask({run:f.out,stage:'review'},async req=>{ reviewRequest=req; return invocation()(req); });
  assert.ok(reviewRequest.prompt.includes('HOST_DRAFT_SECRET_714'),'peer review did not receive coordinator proposal');
  assert.ok(!reviewRequest.prompt.includes('HOST_REVIEW_SECRET_952'),'peer review saw the coordinator critique');
  assert.ok(!reviewRequest.prompt.includes('SECURITY_PRIVATE_BEFORE_VERIFICATION'));
});

test('sealed coordinator and peer reports cannot be silently rewritten', async () => {
  const f = await fixture('host-tamper');
  await hostDraft(f);
  await ask({run:f.out,stage:'draft'},invocation());
  await hostDraft(f,[],'A changed report');
  await hostReview(f);
  await assert.rejects(async()=>ask({run:f.out,stage:'review'},invocation()));
  const g = await fixture('peer-tamper');
  await hostDraft(g);
  await ask({run:g.out,stage:'draft'},invocation());
  await write(path.join(g.out,'peer-draft.json'),report([],'Fabricated peer report'));
  await hostReview(g);
  await assert.rejects(async()=>ask({run:g.out,stage:'review'},invocation()));
});

test('failed and malformed peer calls cannot create successful peer reports', async () => {
  const f = await fixture('failures', {'max-attempts':'5'});
  await hostDraft(f);
  await assert.rejects(async()=>ask({run:f.out,stage:'draft'},async()=>({code:3,stdout:JSON.stringify(report()),stderr:'Authentication failed'})));
  await assert.rejects(async()=>fs.access(path.join(f.out,'peer-draft.json')));
  await assert.rejects(async()=>ask({run:f.out,stage:'draft'},async()=>({code:0,stdout:'not a JSON report',stderr:''})));
  await assert.rejects(async()=>fs.access(path.join(f.out,'peer-draft.json')));
  await ask({run:f.out,stage:'draft'},invocation());
  assert.equal((await read(path.join(f.out,'peer-draft.json'))).summary,'A useful report');
  const state = await status({run:f.out});
  assert.ok(state);
});

test('expired peer authentication preserves a failed attempt and resumes only on an explicit retry', async () => {
  for (const peer of ['claude', 'codex']) {
    const f = await fixture(`expired-${peer}`, { coordinator: peer === 'claude' ? 'codex' : 'claude' });
    await hostDraft(f);
    const failure = peer === 'claude'
      ? { code: 1, stdout: JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['OAuth token has expired. private-provider-detail'] }), stderr: '' }
      : { code: 0, stdout: JSON.stringify({ type: 'turn.failed', error: { message: 'Your refresh token was already used. private-provider-detail' } }), stderr: '' };
    let calls = 0;
    await assert.rejects(() => ask({ run: f.out, stage: 'draft' }, async () => { calls++; return failure; }), error => {
      assert.equal(error.reason, 'authentication_error');
      assert.match(error.message, /No peer terminal or app needs to stay open/);
      assert.match(error.message, /attempt-1-stdout\.txt and attempt-1-stderr\.txt/);
      assert.doesNotMatch(error.message, /private-provider-detail/);
      return true;
    });
    assert.equal(calls, 1, 'An authentication rejection must not trigger an automatic paid retry');
    const failed = await read(path.join(f.out, 'run.json'));
    assert.equal(failed.status, 'peer_failed');
    assert.equal(failed.attempts.length, 1);
    assert.equal(failed.attempts[0].status, 'failed');
    assert.equal(failed.attempts[0].reason, 'authentication_error');
    assert.notEqual(failed.stages.draft?.status, 'succeeded');
    await assert.rejects(() => fs.access(path.join(f.out, 'peer-draft.json')));
    assert.equal(await fs.readFile(path.join(f.out, 'attempt-1-stdout.txt'), 'utf8'), failure.stdout);
    // This simulates a user repairing authentication and explicitly resuming.
    await ask({ run: f.out, stage: 'draft' }, invocation());
    const resumed = await read(path.join(f.out, 'run.json'));
    assert.equal(resumed.attempts.length, 2);
    assert.equal(resumed.attempts[0].status, 'failed');
    assert.equal(resumed.stages.draft.status, 'succeeded');
    assert.equal(resumed.stages.draft.attempt, 2);
  }
});

test('successful peer reports about expired authentication are not mistaken for transport failures', async () => {
  const f = await fixture('auth-report-prose');
  await hostDraft(f);
  const peerReport = report([], 'Test the OAuth token has expired and authentication failed scenarios.');
  const result = await ask({ run: f.out, stage: 'draft' }, async request => ({
    ...await invocation(peerReport)(request), stderr: 'A supplied test case mentions OAuth token has expired.',
  }));
  assert.equal(result.report.summary, peerReport.summary);
  assert.equal((await read(path.join(f.out, 'run.json'))).stages.draft.status, 'succeeded');
});

test('all findings require a disposition before verification', async () => {
  const f = await readyForVerify('decisions');
  const decisionsPath = path.join(f.out,'decisions.json');
  const decisions = await read(decisionsPath);
  await write(decisionsPath,decisions.filter(x=>x.finding_id!=='C-R1'));
  await assert.rejects(async()=>ask({run:f.out,stage:'verify'},invocation()));
  await write(decisionsPath,[...decisions,{finding_id:'UNKNOWN',disposition:'accepted',rationale:'An unknown finding must not be silently accepted.'}]);
  await assert.rejects(async()=>ask({run:f.out,stage:'verify'},invocation()));
  await write(decisionsPath,decisions);
  await ask({run:f.out,stage:'verify'},invocation(report(['untrusted-id'])));
  await assert.rejects(async()=>finish({run:f.out}));
  await write(decisionsPath,[...decisions,{finding_id:'P-V1',disposition:'unresolved',rationale:'Further validation is required before proceeding.'}]);
  const completion = await finish({run:f.out});
  assert.equal(completion.changedSinceVerification,true);
  assert.deepEqual(completion.changed_artifacts,['decisions.json']);
  assert.equal(completion.outcome,'complete_with_unresolved_findings');
  assert.equal(completion.unresolved[0].finding_id,'P-V1');
});

test('review mode skips independent peer draft while retaining verification', async () => {
  const f = await readyForVerify('review-mode',{mode:'review'});
  await assert.rejects(async()=>fs.access(path.join(f.out,'peer-draft.json')));
  await ask({run:f.out,stage:'verify'},invocation());
  await finish({run:f.out});
});

test('parsers reject error responses even when result text looks valid', () => {
  assert.throws(()=>parsePeerResponse('claude',JSON.stringify({type:'result',is_error:true,result:JSON.stringify(report())})));
  assert.throws(()=>parsePeerResponse('codex','an ordinary paragraph is not a structured review'));
});

test('Claude streaming results retain structured reports and reject incomplete or failed streams', () => {
  const events=[{type:'system',subtype:'init',session_id:'live-session'},{type:'assistant',message:{content:[]}},{type:'result',subtype:'success',is_error:false,structured_output:report(),session_id:'live-session',usage:{output_tokens:20}}];
  const stream=events.map(event=>JSON.stringify(event)).join('\n');
  const parsed=parsePeerResponse('claude',stream);
  assert.equal(parsed.report.summary,'A useful report');
  assert.equal(parsed.session_id,'live-session');
  assert.equal(parsed.usage.output_tokens,20);
  assert.throws(()=>parsePeerResponse('claude',events.slice(0,-1).map(event=>JSON.stringify(event)).join('\n')),/successful result/);
  assert.throws(()=>parsePeerResponse('claude',stream+'\n'+JSON.stringify({type:'result',is_error:true})),/failed stream/);
});

test('peer CLI arguments never enable unrestricted execution', async () => {
  const f = await fixture('cli-args');
  const schemaPath = path.join(f.out,'report.schema.json');
  for (const provider of ['codex','claude']) {
    const args = await buildPeerArgs(provider,{schemaPath,model:'model id with spaces'});
    assert.ok(Array.isArray(args));
    assert.ok(args.includes('model id with spaces'),'model identifier was split or dropped');
    assert.ok(!args.includes('--dangerously-skip-permissions'));
    assert.ok(!args.includes('--dangerously-bypass-approvals-and-sandbox'));
    assert.ok(!args.includes('danger-full-access'));
  }
});

test('reverse coordinator receives genuine Codex event results', async () => {
  const f = await readyForVerify('reverse-coordinator',{coordinator:'claude'});
  await ask({run:f.out,stage:'verify'},invocation());
  const completion = await finish({run:f.out});
  assert.equal(completion.changedSinceVerification,false);
  const state = await read(path.join(f.out,'run.json'));
  assert.equal(state.peer,'codex');
  assert.ok(state.attempts.every(a=>a.session_id==='codex-test-session'));
  assert.equal(state.attempts[0].usage.output_tokens,20);
});

test('verification provenance identifies the version actually sent, including concurrent edits', async () => {
  const f = await readyForVerify('verify-race');
  const planPath = path.join(f.out,'final-plan.md');
  let prompt;
  await ask({run:f.out,stage:'verify'},async req=>{
    prompt=req.prompt;
    await write(planPath,'# Revised plan\nA completely new plan, introduced while verification was running.\n');
    return invocation()(req);
  });
  assert.ok(!prompt.includes('A completely new plan'));
  const completed = await finish({run:f.out});
  assert.equal(completed.changedSinceVerification,true,'runner falsely says modified plan was peer-verified');
  assert.deepEqual(completed.changed_artifacts,['final-plan.md']);
  assert.notEqual(completed.final_hashes['final-plan.md'],completed.reviewed_hashes['final-plan.md']);
  const result = await fs.readFile(path.join(f.out,'RESULT.md'),'utf8');
  assert.ok(result.includes('has not had another peer review'));
});

test('post-verification plan edits cannot hide in a completed run', async () => {
  const f = await readyForVerify('verify-post-edit');
  await ask({run:f.out,stage:'verify'},invocation());
  await write(path.join(f.out,'final-plan.md'),'# Changed plan\nChanged after the peer returned.');
  const completed = await finish({run:f.out});
  assert.equal(completed.changedSinceVerification,true);
  await write(path.join(f.out,'final-plan.md'),'# Changed again\nChanged after completion.');
  await assert.rejects(async()=>status({run:f.out}));
});

test('source edits are surfaced but do not replace frozen shared inputs', async () => {
  const f = await fixture('source-edit');
  await hostDraft(f);
  await write(f.context,'REVISED_SOURCE_TOKEN: incompatible new source facts.');
  const state = await status({run:f.out});
  assert.deepEqual(state.changed_source_files,[f.context]);
  let prompt;
  await ask({run:f.out,stage:'draft'},async req=>{prompt=req.prompt;return invocation()(req);});
  assert.ok(prompt.includes('INPUT_CONTEXT_TOKEN'));
  assert.ok(!prompt.includes('REVISED_SOURCE_TOKEN'));
  const snapshot = await read(path.join(f.out,'snapshot.json'));
  snapshot.inputs[0].content='Tampered frozen source';
  await write(path.join(f.out,'snapshot.json'),snapshot);
  await assert.rejects(async()=>status({run:f.out}));
});

test('failures consume attempts and preserve evidence when budget ends', async () => {
  const f = await readyForVerify('attempt-budget',{'max-attempts':'3'});
  await assert.rejects(async()=>ask({run:f.out,stage:'verify'},async()=>{throw new Error('Simulated peer deadline exceeded');}));
  const state = await read(path.join(f.out,'run.json'));
  assert.equal(state.attempts.length,3);
  assert.equal(state.attempts[2].status,'failed');
  assert.ok(state.attempts[2].error.includes('deadline'));
  assert.equal((await status({run:f.out})).attempts_remaining,0);
  let invoked=false;
  await assert.rejects(async()=>ask({run:f.out,stage:'verify'},async req=>{invoked=true;return invocation()(req);}));
  assert.equal(invoked,false);
  await assert.rejects(async()=>finish({run:f.out}));
});

test('concurrent calls cannot share one run', async () => {
  const f = await fixture('concurrency');
  await hostDraft(f);
  let unblock;
  let entered;
  const reached = new Promise(r=>{entered=r;});
  const first = ask({run:f.out,stage:'draft'},async req=>{
    entered();
    await new Promise(r=>{unblock=r;});
    return invocation()(req);
  });
  await reached;
  try { await assert.rejects(async()=>ask({run:f.out,stage:'draft'},invocation())); }
  finally { unblock(); await first; }
  assert.equal((await read(path.join(f.out,'run.json'))).attempts.length,1);
});

test('Codex response requires successful completion and extracts the final report', async () => {
  const good = await invocation(report())({provider:'codex'});
  const parsed = parsePeerResponse('codex',good.stdout);
  assert.equal(parsed.report.summary,'A useful report');
  assert.equal(parsed.session_id,'codex-test-session');
  await assert.rejects(async()=>parsePeerResponse('codex',good.stdout.split('\n').slice(0,-1).join('\n')));
  await assert.rejects(async()=>parsePeerResponse('codex',good.stdout+'\n'+JSON.stringify({type:'turn.failed',error:{message:'Failure'}})));
});

test('real child deadlines terminate hung process without model calls', async () => {
  const began=Date.now();
  // The child exits after 4 s even if the runner's kill implementation fails.
  await assert.rejects(()=>runProcess(process.execPath,['-e','setInterval(()=>{},1000);setTimeout(()=>process.exit(0),4000)'],{cwd:testRoot,timeoutMs:100}),/deadline exceeded/);
  assert.ok(Date.now()-began<2000,'timeout did not stop child promptly');
});

test('an empty peer draft is a failed stage rather than invented planning evidence', async () => {
  const f=await fixture('empty-peer-plan');
  await hostDraft(f);
  const incomplete={...report(),proposal_markdown:'   '};
  await assert.rejects(()=>ask({run:f.out,stage:'draft'},invocation(incomplete)),/nonempty proposal_markdown/);
  assert.equal((await read(path.join(f.out,'run.json'))).attempts[0].status,'failed');
  await assert.rejects(()=>fs.access(path.join(f.out,'peer-draft.json')));
});

test('coordinator evidence changed during a peer call invalidates its result', async () => {
  const f=await fixture('during-call-tamper');
  await hostDraft(f);
  await assert.rejects(()=>ask({run:f.out,stage:'draft'},async req=>{
    await hostDraft(f,[],'Changed while the peer was running');
    return invocation()(req);
  }),/changed during peer call/);
  const state=await read(path.join(f.out,'run.json'));
  assert.equal(state.attempts[0].status,'failed');
  assert.equal(state.stages.draft,undefined);
  await assert.rejects(()=>fs.access(path.join(f.out,'peer-draft.json')));
});

test('interrupted recovery is persisted before attempt or runtime budget rejection', async () => {
  for (const limit of ['attempts','runtime']) {
    const f=await fixture(`interrupted-${limit}`,{
      'max-attempts':limit==='attempts'?'1':'4',
      'timeout-seconds':'10','budget-seconds':'10',
    });
    await hostDraft(f);
    const manifestPath=path.join(f.out,'run.json');
    const state=await read(manifestPath);
    state.status='running';
    state.attempts=[{number:1,stage:'draft',status:'running',timeout_ms:10000}];
    await write(manifestPath,state);
    let invoked=false;
    const fake=async req=>{invoked=true;return invocation()(req);};
    await assert.rejects(()=>ask({run:f.out,stage:'draft'},fake),/budget exhausted/);
    assert.equal(invoked,false);
    const recovered=await read(manifestPath);
    assert.equal(recovered.attempts[0].status,'interrupted');
    assert.equal(recovered.status,'peer_failed');
    assert.equal(recovered.elapsed_ms,10000);
    assert.match(recovered.attempts[0].error,/Previous runner exited/);
    await assert.rejects(()=>ask({run:f.out,stage:'draft'},fake),/budget exhausted/);
    assert.equal((await read(manifestPath)).elapsed_ms,10000,'recovered interruption was charged twice');
  }
});

test('failed login and timeout resume in the same run only after sufficient audited extension', async () => {
  const f = await fixture('extend-failed-draft');
  await hostDraft(f);
  await assert.rejects(() => ask({ run: f.out, stage: 'draft' }, async () => ({ code: 1, stdout: JSON.stringify({ type: 'result', is_error: true, errors: ['OAuth token has expired.'] }), stderr: '' })), /authentication|login/i);
  const partial = JSON.stringify({ type: 'system', subtype: 'thinking_tokens', text: 'PRIVATE_RAW_PROGRESS' });
  await assert.rejects(() => ask({ run: f.out, stage: 'draft' }, async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    throw Object.assign(new Error('Simulated peer deadline exceeded (300 seconds)'), { reason: 'timeout', stdout: partial, stderr: '' });
  }), error => {
    assert.equal(error.progress.phase, 'model_working');
    assert.equal(error.progress.report_validated, false);
    assert.match(error.message, /Last observed phase: model_working/);
    assert.doesNotMatch(JSON.stringify(error.progress) + error.message, /PRIVATE_RAW_PROGRESS/);
    return true;
  });
  const manifestPath = path.join(f.out, 'run.json');
  const before = await read(manifestPath);
  const failedLogs = await Promise.all([1, 2].map(number => fs.readFile(path.join(f.out, `attempt-${number}-stdout.txt`))));
  assert.equal(status({ run: f.out }).budget.assessment, 'insufficient_attempts');
  assert.equal(status({ run: f.out }).budget.successful_calls_remaining, 3);
  assert.equal(status({ run: f.out }).attempts_remaining, 2);
  assert.equal(status({ run: f.out }).peer_progress.phase, 'model_working');
  let launched = false;
  await assert.rejects(() => ask({ run: f.out, stage: 'draft' }, async request => { launched = true; return invocation()(request); }), /3 pending peer stages: 2 attempts remain/);
  assert.equal(launched, false);
  // With no invoker, the same guard must also run before real CLI preflight.
  const oldBinary = process.env.COUNCIL_CLAUDE_BIN;
  process.env.COUNCIL_CLAUDE_BIN = path.join(f.root, 'missing-peer.exe');
  try { await assert.rejects(() => ask({ run: f.out, stage: 'draft' }), /3 pending peer stages: 2 attempts remain/); }
  finally { if (oldBinary === undefined) delete process.env.COUNCIL_CLAUDE_BIN; else process.env.COUNCIL_CLAUDE_BIN = oldBinary; }
  assert.deepEqual(await read(manifestPath), before, 'A futile ask cannot reserve an attempt');
  const limits = { run: f.out, 'timeout-seconds': '600', 'budget-seconds': '2400', 'max-attempts': '5', reason: 'Login repaired; retain failed attempts and provide time for remaining stages.' };
  const amended = extend(limits);
  assert.equal(amended.changed, true);
  assert.equal(amended.attempts_reset, false);
  assert.equal(amended.budget.attempts_sufficient, true);
  const saved = await read(manifestPath);
  assert.deepEqual(saved.attempts, before.attempts);
  assert.deepEqual(saved.seals, before.seals);
  assert.equal(saved.elapsed_ms, before.elapsed_ms);
  assert.equal(saved.id, before.id);
  assert.equal(saved.limit_history[0].elapsed_ms, before.elapsed_ms);
  assert.equal(saved.limit_history[0].attempts_used, 2);
  await ask({ run: f.out, stage: 'draft' }, async request => { assert.equal(request.timeoutMs, 600000); return invocation()(request); });
  await hostReview(f);
  await ask({ run: f.out, stage: 'review' }, invocation());
  await write(path.join(f.out, 'security-review.json'), report());
  await write(path.join(f.out, 'final-plan.md'), '# Plan\nSynthetic scope, security checks and acceptance tests.');
  await write(path.join(f.out, 'decisions.json'), []);
  await ask({ run: f.out, stage: 'verify' }, invocation());
  const completed = finish({ run: f.out });
  assert.equal(completed.successful_peer_calls, 3);
  assert.equal(completed.attempts_used, 5);
  assert.equal(completed.budget.limit_changes, 1);
  assert.equal(completed.limit_history[0].reason, limits.reason);
  assert.ok((await read(manifestPath)).elapsed_ms >= before.elapsed_ms);
  for (const number of [1, 2]) assert.deepEqual(await fs.readFile(path.join(f.out, `attempt-${number}-stdout.txt`)), failedLogs[number - 1]);
  assert.match(await fs.readFile(path.join(f.out, 'RESULT.md'), 'utf8'), /Recorded limit changes: 1; earlier attempts and runtime remain charged/);
});

test('extension preserves successful stages and seals while identical totals are a no-op', async () => {
  const f = await fixture('extend-sealed-draft');
  await hostDraft(f);
  await ask({ run: f.out, stage: 'draft' }, invocation());
  const before = await read(path.join(f.out, 'run.json'));
  const options = { run: f.out, 'timeout-seconds': '600', 'budget-seconds': '2400', 'max-attempts': '5', reason: 'Allow more time for the remaining critique and verification.' };
  assert.equal(extend(options).changed, true);
  const after = await read(path.join(f.out, 'run.json'));
  assert.deepEqual(after.stages, before.stages);
  assert.deepEqual(after.attempts, before.attempts);
  assert.deepEqual(after.seals, before.seals);
  assert.equal(after.elapsed_ms, before.elapsed_ms);
  const bytes = await fs.readFile(path.join(f.out, 'run.json'));
  assert.equal(extend(options).changed, false);
  assert.deepEqual(await fs.readFile(path.join(f.out, 'run.json')), bytes);
  let called = false;
  await assert.rejects(() => ask({ run: f.out, stage: 'draft' }, async request => { called = true; return invocation()(request); }), /already succeeded/);
  assert.equal(called, false);
  for (const extra of [{ 'max-attempts': '4' }, { 'timeout-seconds': '901' }, { 'budget-seconds': '3601' }, { reason: '' }, { reason: 'two\nlines' }, { reason: 'x'.repeat(501) }]) {
    assert.throws(() => extend({ ...options, ...extra }));
    assert.deepEqual(await fs.readFile(path.join(f.out, 'run.json')), bytes);
  }
  assert.match(await fs.readFile(path.join(f.out, 'HANDOFF.md'), 'utf8'), /recorded limit changes: 1/);
});

test('extension and status cannot alter an active call or its current deadline', async () => {
  const f = await fixture('extend-concurrency');
  await hostDraft(f);
  let unblock, entered;
  const reached = new Promise(resolve => { entered = resolve; });
  const call = ask({ run: f.out, stage: 'draft' }, async request => {
    assert.equal(request.timeoutMs, 300000);
    entered();
    await new Promise(resolve => { unblock = resolve; });
    return invocation()(request);
  });
  await reached;
  try {
    const before = await fs.readFile(path.join(f.out, 'run.json'));
    const current = status({ run: f.out });
    assert.equal(current.budget.assessment, 'running_attempt_recorded');
    assert.equal(current.budget.attempts_sufficient, null);
    assert.equal(current.budget.peer_seconds_reserved, 300);
    assert.equal(current.peer_seconds_remaining, 600);
    assert.equal(current.peer_progress.timeout_ms, 300000);
    assert.equal(current.peer_progress.recorded_running, true);
    assert.throws(() => extend({ run: f.out, 'timeout-seconds': '600', reason: 'Cannot change a running worker deadline.' }), /lock|another|active/i);
    assert.deepEqual(await fs.readFile(path.join(f.out, 'run.json')), before);
  } finally { unblock(); await call; }
  assert.equal(status({ run: f.out }).peer_progress.report_validated, true);
});

test('extension recovers interrupted runtime once even if amendment validation fails', async () => {
  const f = await fixture('extend-interrupted');
  const manifestPath = path.join(f.out, 'run.json');
  const recorded = await read(manifestPath);
  recorded.elapsed_ms = 1000;
  recorded.status = 'running';
  recorded.attempts = [{ number: 1, stage: 'draft', status: 'running', timeout_ms: 300000 }];
  await write(manifestPath, recorded);
  assert.throws(() => extend({ run: f.out, 'max-attempts': '7', reason: 'Out-of-range request must not erase interrupted runtime.' }), /max-attempts/);
  let recovered = await read(manifestPath);
  assert.equal(recovered.elapsed_ms, 301000);
  assert.equal(recovered.attempts[0].status, 'interrupted');
  assert.equal(recovered.max_attempts, 4);
  assert.equal(recovered.limit_history.length, 0);
  const before = await fs.readFile(manifestPath);
  assert.throws(() => extend({ run: f.out, 'max-attempts': '7', reason: 'Still out of range.' }));
  assert.deepEqual(await fs.readFile(manifestPath), before);
  const options = { run: f.out, 'timeout-seconds': '600', 'budget-seconds': '2400', 'max-attempts': '5', reason: 'Resume the same saved scope within bounded additional allowance.' };
  extend(options);
  assert.equal(extend(options).changed, false);
  recovered = await read(manifestPath);
  assert.equal(recovered.elapsed_ms, 301000);
  assert.equal(recovered.limit_history.length, 1);
  assert.equal(recovered.limit_history[0].elapsed_ms, 301000);
});

test('completed runs reject budget changes and legacy runs retain their original contracts', async () => {
  const completed = await readyForVerify('extend-complete');
  await ask({ run: completed.out, stage: 'verify' }, invocation());
  finish({ run: completed.out });
  const before = await fs.readFile(path.join(completed.out, 'run.json'));
  assert.throws(() => extend({ run: completed.out, 'max-attempts': '5', reason: 'A finished run must remain unchanged.' }), /complete run/);
  assert.deepEqual(await fs.readFile(path.join(completed.out, 'run.json')), before);
  for (const version of [1, 2, 3]) {
    const f = await fixture(`extend-legacy-${version}`);
    const manifest = await read(path.join(f.out, 'run.json'));
    manifest.version = version;
    for (const key of ['pairing', 'coordinator_model', 'budget_profile', 'initial_limits', 'limit_history']) delete manifest[key];
    const snapshotPath = path.join(f.out, 'snapshot.json');
    const snapshot = await read(snapshotPath);
    delete snapshot.participants;
    await write(snapshotPath, snapshot);
    manifest.seals['snapshot.json'] = createHash('sha256').update(await fs.readFile(snapshotPath)).digest('hex');
    await write(path.join(f.out, 'run.json'), manifest);
    const result = extend({ run: f.out, 'max-attempts': '5', reason: 'Retain the legacy run and provide one bounded retry allowance.' });
    assert.equal(result.budget.profile, 'legacy');
    const amended = await read(path.join(f.out, 'run.json'));
    assert.equal(amended.version, version);
    assert.deepEqual(amended.seals, manifest.seals);
    assert.deepEqual(amended.initial_limits, { timeout_ms: 300000, budget_ms: 900000, max_attempts: 4 });
    await hostDraft(f);
    await ask({ run: f.out, stage: 'draft' }, invocation());
    assert.equal(status({ run: f.out }).successful_peer_calls, 1);
  }
});

test('project profile CLI and explicit overrides expose honest limits without requiring full-timeout headroom', async () => {
  const f = await inputFixture('budget-profile-cli');
  const runner = path.join(packageRoot, 'scripts', 'council.mjs');
  const result = spawnSync(process.execPath, [runner, 'prepare', '--project', f.project, '--brief', f.brief, '--assessment', f.assessment, '--coordinator', 'codex', '--out', f.out, '--budget-profile', 'project', '--timeout-seconds', '10', '--budget-seconds', '10'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  const prepared = JSON.parse(result.stdout);
  assert.equal(prepared.budget.profile, 'project');
  assert.equal(prepared.budget.timeout_seconds, 10);
  assert.equal(prepared.budget.budget_seconds, 10);
  assert.equal(prepared.budget.max_attempts, 5);
  assert.equal(prepared.budget.full_timeout_headroom, false);
  assert.equal(prepared.budget.attempts_sufficient, true);
  await hostDraft(f);
  await ask({ run: f.out, stage: 'draft' }, invocation());
  const extended = spawnSync(process.execPath, [runner, 'extend', '--run', f.out, '--timeout-seconds', '600', '--budget-seconds', '2400', '--reason', 'Provide room for the remaining project critique and verification.', '--compact'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  assert.equal(extended.status, 0, extended.stderr);
  const amendment = JSON.parse(extended.stdout);
  assert.equal(amendment.changed, true);
  assert.equal(amendment.budget.successful_calls_remaining, 2);
  assert.equal(amendment.budget.timeout_seconds, 600);
  assert.equal(amendment.budget.budget_seconds, 2400);
  assert.equal(amendment.limit_history[0].attempts_used, 1);
});

test('progress CLI polls only safe metadata without repeating private evidence or mutating state', async () => {
  const f = await fixture('progress-cli');
  await hostDraft(f);
  await ask({ run: f.out, stage: 'draft' }, invocation(report([], 'PRIVATE_PEER_REPORT_TEXT')));
  extend({ run: f.out, 'max-attempts': '5', reason: 'PRIVATE_LIMIT_REASON must stay out of routine progress polling.' });
  const files = ['run.json', 'run.checkpoint.json', 'HANDOFF.md', 'DISCUSSION.md', 'peer-draft.json'];
  const before = await Promise.all(files.map(file => fs.readFile(path.join(f.out, file))));
  const result = spawnSync(process.execPath, [path.join(packageRoot, 'scripts', 'council.mjs'), 'progress', '--run', f.out, '--compact'], {
    encoding: 'utf8', windowsHide: true, timeout: 5000,
    env: { ...process.env, COUNCIL_CLAUDE_BIN: path.join(f.root, 'missing-claude.exe'), COUNCIL_CODEX_BIN: path.join(f.root, 'missing-codex.exe') },
  });
  assert.equal(result.status, 0, result.stderr);
  const current = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(current), ['run', 'status', 'peer', 'peer_progress']);
  assert.equal(current.run, f.out);
  assert.equal(current.status, 'awaiting_coordinator');
  assert.equal(current.peer, 'claude');
  assert.equal(current.peer_progress.attempt, 1);
  assert.equal(current.peer_progress.phase, 'response_received');
  assert.equal(current.peer_progress.report_validated, true);
  assert.doesNotMatch(result.stdout, /PRIVATE_PEER_REPORT_TEXT|PRIVATE_LIMIT_REASON|ASSESSMENT_CONTEXT_TOKEN|INPUT_CONTEXT_TOKEN|HOST_DRAFT_SECRET_714|project_assessment|limit_history/);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  for (let index = 0; index < files.length; index++) assert.deepEqual(await fs.readFile(path.join(f.out, files[index])), before[index]);
});

test('new runs require substantive security review with C-S IDs before verification', async () => {
  const f = await readyForVerify('security-required');
  const securityPath = path.join(f.out,'security-review.json');
  await fs.unlink(securityPath);
  let invoked = false;
  const fake = async req => { invoked = true; return invocation()(req); };
  await assert.rejects(()=>ask({run:f.out,stage:'verify'},fake),/security-review/);
  await write(securityPath, {...report(),proposal_markdown:'   '});
  await assert.rejects(()=>ask({run:f.out,stage:'verify'},fake),/Security review must explain/);
  await write(securityPath, report(['C-R9']));
  await assert.rejects(()=>ask({run:f.out,stage:'verify'},fake),/Finding ID must start with C-S/);
  assert.equal(invoked,false);
  assert.equal((await status({run:f.out})).attempts_used,2);
});

test('security findings need decisions and the exact review reaches final verification', async () => {
  const f = await readyForVerify('security-decisions');
  const security = report(['C-S1'],'EXACT_SECURITY_REVIEW');
  await write(path.join(f.out,'security-review.json'),security);
  await assert.rejects(()=>ask({run:f.out,stage:'verify'},invocation()),/Missing decision for C-S1/);
  const dp = path.join(f.out,'decisions.json');
  await write(dp,[...await read(dp),{finding_id:'C-S1',disposition:'unresolved',rationale:'Missing authorization evidence must be gathered before implementation.'}]);
  let packet;
  await ask({run:f.out,stage:'verify'},async req=>{
    packet=JSON.parse(req.prompt.split('COUNCIL_PACKET_JSON\n')[1]);
    return invocation()(req);
  });
  assert.deepEqual(packet.security_review,security);
  assert.deepEqual(await read(path.join(f.out,'security-review-submitted.json')),security);
  const result=await finish({run:f.out});
  assert.equal(result.security_review.required,true);
  assert.equal(result.security_review.verdict,'needs_changes');
  assert.equal(result.changedSinceVerification,false);
  assert.ok(result.unresolved.some(f=>f.finding_id==='C-S1'));
});

test('security findings cannot be erased or rewritten after submission but new findings can be added', async () => {
  const f = await readyForVerify('security-history');
  const sp=path.join(f.out,'security-review.json'), dp=path.join(f.out,'decisions.json');
  const first=report(['C-S1'],'Original security scope');
  await write(sp,first);
  const base=[...await read(dp),{finding_id:'C-S1',disposition:'accepted',rationale:'The plan now includes a scoped authorization invariant and negative test.'}];
  await write(dp,base);
  await ask({run:f.out,stage:'verify'},invocation());
  await write(sp,report());
  await assert.rejects(async()=>finish({run:f.out}),/Preserve submitted security finding C-S1/);
  await write(sp,{...first,findings:[{...first.findings[0],claim:'Rewritten claim'}]});
  await assert.rejects(async()=>finish({run:f.out}),/Preserve submitted security finding C-S1/);
  const second={...first,proposal_markdown:'Coordinator recheck after new evidence; the original finding remains.',findings:[...first.findings,...report(['C-S2']).findings]};
  await write(sp,second);
  await assert.rejects(async()=>finish({run:f.out}),/Missing decision for C-S2/);
  await write(dp,[...base,{finding_id:'C-S2',disposition:'unresolved',rationale:'New evidence needs another investigation before implementation.'}]);
  const completed=await finish({run:f.out});
  assert.ok(completed.changed_artifacts.includes('security-review.json'));
  assert.equal(completed.security_review.changed_since_verification,true);
  await write(sp,first);
  await assert.rejects(async()=>status({run:f.out}),/Sealed artifact changed/);
});

test('security edits during verification are reported against the submitted hash', async () => {
  const f=await readyForVerify('security-concurrent');
  const sp=path.join(f.out,'security-review.json');
  await ask({run:f.out,stage:'verify'},async req=>{
    const current=await read(sp);
    await write(sp,{...current,proposal_markdown:'Coordinator updated the security scope while peer verification was running.'});
    return invocation()(req);
  });
  const completed=await finish({run:f.out});
  assert.deepEqual(completed.changed_artifacts,['security-review.json']);
  assert.notEqual(completed.final_hashes['security-review.json'],completed.reviewed_hashes['security-review.json']);
});

test('security findings added for a verification retry also remain immutable', async () => {
  const f=await readyForVerify('security-retry');
  await assert.rejects(()=>ask({run:f.out,stage:'verify'},async()=>{throw new Error('One simulated transport failure');}),/transport failure/);
  const sp=path.join(f.out,'security-review.json'),dp=path.join(f.out,'decisions.json');
  const next=report(['C-S1'],'New evidence before retry');
  await write(sp,next);
  await write(dp,[...await read(dp),{finding_id:'C-S1',disposition:'unresolved',rationale:'New authorization evidence remains unresolved before implementation.'}]);
  await ask({run:f.out,stage:'verify'},invocation());
  const manifest=await read(path.join(f.out,'run.json'));
  assert.equal(manifest.attempts[3].security_report_file,'attempt-4-security-review.json');
  await write(sp,report());
  await assert.rejects(async()=>finish({run:f.out}),/Preserve submitted security finding C-S1/);
});

test('uncommitted security snapshot from interrupted preparation can be replaced', async () => {
  const f=await readyForVerify('security-orphan-snapshot');
  await write(path.join(f.out,'security-review-submitted.json'),report(['C-S99'],'Orphan file never submitted or reserved'));
  await ask({run:f.out,stage:'verify'},invocation());
  assert.equal((await read(path.join(f.out,'security-review-submitted.json'))).findings.length,0);
  await finish({run:f.out});
});

test('insufficient security evidence stays visible even with no findings', async () => {
  const f=await readyForVerify('security-unknown');
  await write(path.join(f.out,'security-review.json'),{...report(),verdict:'insufficient_context',limitations:['Authorization design is absent; protection cannot be assessed.']});
  await ask({run:f.out,stage:'verify'},invocation({...report(),verdict:'insufficient_context'}));
  const completed=await finish({run:f.out});
  assert.equal(completed.security_review.verdict,'insufficient_context');
  assert.equal(completed.peer_verdict,'insufficient_context');
  assert.match(await fs.readFile(path.join(f.out,'RESULT.md'),'utf8'),/Authorization design is absent/);
});

test('legacy versions preserve their original security rules and never gain a project assessment claim', async () => {
  for (const version of [1,2]) {
    const f=await readyForVerify(`legacy-v${version}`,{mode:'review'});
    const manifest=await read(path.join(f.out,'run.json'));
    manifest.version=version;
    delete manifest.pairing;
    delete manifest.coordinator_model;
    const oldSnapshotPath=path.join(f.out,'snapshot.json');
    const oldSnapshot=await read(oldSnapshotPath);
    delete oldSnapshot.participants;
    await write(oldSnapshotPath,oldSnapshot);
    manifest.seals['snapshot.json']=createHash('sha256').update(await fs.readFile(oldSnapshotPath,'utf8')).digest('hex');
    await write(path.join(f.out,'run.json'),manifest);
    // Even if a v3 assessment artifact is present, legacy completion must not claim
    // that deployment evidence or direction clarity was a required preflight.
    assert.equal((await status({run:f.out})).project_assessment.required,false);
    // Actual old runs have neither the artifacts nor the snapshot field. Exercise
    // resume and completion with that layout as well as the orphan-artifact case.
    for (const file of ['project-assessment.json','project-assessment.schema.json','PROJECT_CONTEXT.md']) {
      delete manifest.seals[file];
      await fs.unlink(path.join(f.out,file));
    }
    const snapshotPath=path.join(f.out,'snapshot.json');
    const snapshot=await read(snapshotPath);
    delete snapshot.project_assessment;
    snapshot.inputs=snapshot.inputs.filter(input=>input.kind!=='assessment');
    await write(snapshotPath,snapshot);
    manifest.seals['snapshot.json']=createHash('sha256').update(await fs.readFile(snapshotPath,'utf8')).digest('hex');
    await write(path.join(f.out,'run.json'),manifest);
    await fs.unlink(f.assessment);
    if (version===1) await fs.unlink(path.join(f.out,'security-review.json'));
    await ask({run:f.out,stage:'verify'},invocation());
    const completed=await finish({run:f.out});
    assert.equal(completed.security_review.required,version>=2);
    if (version===1) assert.equal(completed.security_review.verdict,'not_required_by_legacy_run');
    assert.equal(completed.project_assessment.required,false);
    assert.equal(completed.project_assessment.deployment.status,'unknown');
    assert.notEqual(completed.project_assessment.readiness.status,'checks_passed_for_scope');
    assert.ok(completed.project_assessment.unknowns.length);
  }
});

test('obvious credentials in final plan are rejected before peer launch', async () => {
  const f=await readyForVerify('outbound-secret');
  await write(path.join(f.out,'final-plan.md'),'# Plan\nExample credential: sk-'+ 'x'.repeat(28));
  let invoked=false;
  await assert.rejects(()=>ask({run:f.out,stage:'verify'},async req=>{invoked=true;return invocation()(req);}),/Possible credential in outbound content/);
  assert.equal(invoked,false);
  assert.equal((await status({run:f.out})).attempts_used,2);
});

test('disposition capacity supports findings aggregated from multiple reports', async () => {
  const f=await fixture('many-findings',{mode:'review'});
  const draftIds=Array.from({length:100},(_,i)=>`C-D${i+1}`);
  const reviewIds=Array.from({length:100},(_,i)=>`C-R${i+1}`);
  await hostDraft(f,draftIds);
  await hostReview(f,reviewIds);
  await ask({run:f.out,stage:'review'},invocation());
  await write(path.join(f.out,'final-plan.md'),'# Plan\nAll fixture concerns are represented in the acceptance checks.');
  await write(path.join(f.out,'security-review.json'),report());
  await write(path.join(f.out,'decisions.json'),[...draftIds,...reviewIds].map(finding_id=>({finding_id,disposition:'accepted',rationale:'The final plan includes the corresponding acceptance condition.'})));
  await ask({run:f.out,stage:'verify'},invocation());
  await finish({run:f.out});
});

test('failed invocations persist attached partial diagnostics and stay failed', async () => {
  const f=await fixture('partial-diagnostics');
  await hostDraft(f);
  const failure=Object.assign(new Error('Peer deadline exceeded'),{stdout:'Partial model output',stderr:'Partial diagnostic',reason:'timeout',code:null,signal:'SIGKILL'});
  await assert.rejects(()=>ask({run:f.out,stage:'draft'},async()=>{throw failure;}),/deadline/);
  assert.equal(await fs.readFile(path.join(f.out,'attempt-1-stdout.txt'),'utf8'),'Partial model output');
  assert.equal(await fs.readFile(path.join(f.out,'attempt-1-stderr.txt'),'utf8'),'Partial diagnostic');
  const manifest=await read(path.join(f.out,'run.json'));
  assert.equal(manifest.attempts[0].reason,'timeout');
  assert.equal(manifest.attempts[0].status,'failed');
  await assert.rejects(()=>fs.access(path.join(f.out,'peer-draft.json')));
});

test('ordinary unsuccessful child exits retain signal and termination evidence', async () => {
  const f=await fixture('exit-metadata');
  await hostDraft(f);
  await assert.rejects(()=>ask({run:f.out,stage:'draft'},async()=>({code:null,signal:'SIGKILL',stdout:'Started',stderr:'Stopped',termination:{directExitObserved:true}})),/signal SIGKILL/);
  const attempt=(await read(path.join(f.out,'run.json'))).attempts[0];
  assert.equal(attempt.signal,'SIGKILL');
  assert.equal(attempt.code,null);
  assert.equal(attempt.termination.directExitObserved,true);
});

const packageRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const installFiles=['SKILL.md','agents/openai.yaml','references/protocol.md','references/project-assessment.md','references/plan-presentation.md','references/model-selection.md','scripts/council.mjs','scripts/process.mjs','scripts/assessment.mjs','scripts/adapters.mjs','scripts/state.mjs','scripts/discussion.mjs','scripts/participants.mjs','scripts/budget.mjs','scripts/progress.mjs','package.json','LICENSE'];
async function installerFixture(label) {
  const root=await fs.mkdtemp(path.join(testRoot,`install-${label}-`));
  const codexHome=path.join(root,'codex-home');
  const claudeHome=path.join(root,'claude-home');
  return {root,codexHome,claudeHome,
    codexSkill:path.join(codexHome,'skills','C2C'),
    claudeSkill:path.join(claudeHome,'skills','C2C'),
    codexLegacy:path.join(codexHome,'skills','codex-claude-council'),
    claudeLegacy:path.join(claudeHome,'skills','codex-claude-council'),
  };
}
function install(f,args=[]) {
  const result=spawnSync(process.execPath,[path.join(packageRoot,'scripts','install.mjs'),...args],{
    cwd:f.root,
    env:{...process.env,CODEX_HOME:f.codexHome,CLAUDE_CONFIG_DIR:f.claudeHome},
    shell:false,windowsHide:true,timeout:5000,encoding:'utf8',
  });
  if(result.error) throw result.error;
  return result;
}
async function assertInstalled(dest) {
  for (const file of installFiles) {
    assert.deepEqual(await fs.readFile(path.join(dest,file)),await fs.readFile(path.join(packageRoot,file)),`Installed ${file} differs from package`);
  }
  const skill=await fs.readFile(path.join(dest,'SKILL.md'),'utf8');
  assert.match(skill,/^---\r?\nname: C2C\r?\n/,'skill frontmatter must expose the C2C command');
  assert.equal(path.basename(dest),'C2C','skill directory must match the command');
  await assert.rejects(()=>fs.access(path.join(dest,'tests')));
  const launched=spawnSync(process.execPath,[path.join(dest,'scripts','council.mjs'),'help'],{encoding:'utf8',windowsHide:true,timeout:5000});
  assert.equal(launched.status,0,launched.stderr);
  assert.match(launched.stdout,/C2C/);
}

test('installer puts identical skill files in both isolated configuration directories', async () => {
  const f=await installerFixture('both');
  const result=install(f);
  assert.equal(result.status,0,result.stderr);
  await assertInstalled(f.codexSkill);
  await assertInstalled(f.claudeSkill);
  const timestamps=await Promise.all([f.codexSkill,f.claudeSkill].flatMap(dir=>installFiles.map(file=>fs.stat(path.join(dir,file)).then(stat=>stat.mtimeMs))));
  const repeated=install(f);
  assert.equal(repeated.status,0,repeated.stderr);
  assert.equal((repeated.stdout.match(/Already installed:/g)||[]).length,2);
  const repeatedTimestamps=await Promise.all([f.codexSkill,f.claudeSkill].flatMap(dir=>installFiles.map(file=>fs.stat(path.join(dir,file)).then(stat=>stat.mtimeMs))));
  assert.deepEqual(repeatedTimestamps,timestamps,'idempotent installation rewrote files');
});

test('installer refuses changed files and preserves both existing installations', async () => {
  const f=await installerFixture('modified');
  assert.equal(install(f).status,0);
  const custom='Custom user-owned skill contents must survive failed installation.\n';
  await write(path.join(f.codexSkill,'SKILL.md'),custom);
  const result=install(f);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/different installation exists/);
  assert.equal(await fs.readFile(path.join(f.codexSkill,'SKILL.md'),'utf8'),custom);
  await assertInstalled(f.claudeSkill);
});

test('installer validates every destination before copying to an empty destination', async () => {
  const f=await installerFixture('preflight');
  await fs.mkdir(f.claudeSkill,{recursive:true});
  const custom='Existing Claude skill contents.\n';
  await write(path.join(f.claudeSkill,'SKILL.md'),custom);
  const result=install(f);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/different installation exists/);
  await assert.rejects(()=>fs.access(f.codexSkill),'installer modified first destination before validating the second');
  assert.equal(await fs.readFile(path.join(f.claudeSkill,'SKILL.md'),'utf8'),custom);
});

test('installer target selection writes only the selected provider', async () => {
  const f=await installerFixture('targets');
  const codex=install(f,['--target','codex']);
  assert.equal(codex.status,0,codex.stderr);
  await assertInstalled(f.codexSkill);
  await assert.rejects(()=>fs.access(f.claudeSkill));
  const claude=install(f,['--target','claude']);
  assert.equal(claude.status,0,claude.stderr);
  await assertInstalled(f.claudeSkill);
});

test('installer refuses legacy skill folders before writing either destination', async () => {
  for (const provider of ['codex','claude']) {
    const f=await installerFixture(`legacy-${provider}`);
    const legacy=f[`${provider}Legacy`];
    const custom='User-owned legacy skill and local notes must remain intact.\n';
    await fs.mkdir(legacy,{recursive:true});
    await write(path.join(legacy,'SKILL.md'),custom);
    await write(path.join(legacy,'notes.md'),'Keep these private notes.\n');
    const result=install(f);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/legacy installation exists/);
    assert.match(result.stderr,/outside all Codex and Claude Code skill roots/);
    assert.match(result.stderr,/rerun this installer/);
    await assert.rejects(()=>fs.access(f.codexSkill));
    await assert.rejects(()=>fs.access(f.claudeSkill));
    assert.equal(await fs.readFile(path.join(legacy,'SKILL.md'),'utf8'),custom);
    assert.equal(await fs.readFile(path.join(legacy,'notes.md'),'utf8'),'Keep these private notes.\n');
  }
});

test('installer checks legacy folders only for selected providers', async () => {
  for (const provider of ['codex','claude']) {
    const other=provider==='codex'?'claude':'codex';
    const f=await installerFixture(`legacy-unselected-${provider}`);
    const legacy=f[`${other}Legacy`];
    await fs.mkdir(legacy,{recursive:true});
    await write(path.join(legacy,'SKILL.md'),'Unselected legacy installation.\n');
    const result=install(f,['--target',provider]);
    assert.equal(result.status,0,result.stderr);
    await assertInstalled(f[`${provider}Skill`]);
    await assert.rejects(()=>fs.access(f[`${other}Skill`]));
    assert.equal(await fs.readFile(path.join(legacy,'SKILL.md'),'utf8'),'Unselected legacy installation.\n');
    const blocked=install(f,['--target',other]);
    assert.notEqual(blocked.status,0);
    assert.match(blocked.stderr,/legacy installation exists/);
    await assert.rejects(()=>fs.access(f[`${other}Skill`]));
    await assertInstalled(f[`${provider}Skill`]);
  }
});

test('legacy preflight preserves an already installed C2C directory', async () => {
  const f=await installerFixture('legacy-with-c2c');
  assert.equal(install(f,['--target','codex']).status,0);
  const original=await fs.stat(path.join(f.codexSkill,'SKILL.md'));
  await fs.mkdir(f.claudeLegacy,{recursive:true});
  await write(path.join(f.claudeLegacy,'SKILL.md'),'Existing Claude legacy skill.\n');
  const result=install(f);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/legacy installation exists/);
  await assertInstalled(f.codexSkill);
  assert.equal((await fs.stat(path.join(f.codexSkill,'SKILL.md'))).mtimeMs,original.mtimeMs);
  await assert.rejects(()=>fs.access(f.claudeSkill));
  assert.equal(await fs.readFile(path.join(f.claudeLegacy,'SKILL.md'),'utf8'),'Existing Claude legacy skill.\n');
});

test('prepare requires an explicit coordinator and routes Claude to Codex', async () => {
  const f=await inputFixture('explicit-coordinator');
  const options=prepareOptions(f);
  delete options.coordinator;
  assert.throws(()=>prepare(options),/requires --coordinator/);
  await assert.rejects(()=>fs.access(f.out));
  const prepared=prepare({...options,coordinator:'claude'});
  assert.equal(prepared.peer,'codex');
  assert.equal(status({run:f.out}).coordinator,'claude');
});

test('linked skill entrypoint executes commands and reports invalid input', async () => {
  const root=await fs.mkdtemp(path.join(testRoot,'linked-cli-'));
  const linked=path.join(root,'linked-skill');
  await fs.symlink(packageRoot,linked,process.platform==='win32'?'junction':'dir');
  const runner=path.join(linked,'scripts','council.mjs');
  const help=spawnSync(process.execPath,[runner,'help'],{encoding:'utf8',windowsHide:true,timeout:5000});
  assert.equal(help.status,0,help.stderr);
  assert.match(help.stdout,/C2C/);
  const invalid=spawnSync(process.execPath,[runner,'not-a-command'],{encoding:'utf8',windowsHide:true,timeout:5000});
  assert.equal(invalid.status,1);
  assert.match(invalid.stderr,/Unknown command/);
  const version=spawnSync(process.execPath,[runner,'--version'],{encoding:'utf8',windowsHide:true,timeout:5000});
  assert.equal(version.status,0,version.stderr);
  assert.equal(JSON.parse(version.stdout).version,(await read(path.join(packageRoot,'package.json'))).version);
});

test('peer packet minimizes host paths and includes the assessment only once', async () => {
  const f=await fixture('minimal-packet');
  await hostDraft(f);
  await ask({run:f.out,stage:'draft'},async req=>{
    const packet=JSON.parse(req.prompt.split('COUNCIL_PACKET_JSON\n')[1]);
    assert.equal(packet.shared_context.project,'.');
    assert.equal(packet.shared_context.inputs.length,2);
    assert.ok(packet.shared_context.inputs.every(input=>!path.isAbsolute(input.path)));
    assert.equal(packet.shared_context.inputs.find(input=>input.kind==='context').path,'context.txt');
    assert.equal(req.prompt.split('ASSESSMENT_CONTEXT_TOKEN').length-1,1);
    assert.ok(!req.prompt.includes(JSON.stringify(f.project)));
    return invocation()(req);
  });
  assert.equal((await read(path.join(f.out,'snapshot.json'))).project,await fs.realpath(f.project));
});

test('lean packets preserve exact evidence, reports and verification data at every stage', async () => {
  const f=await inputFixture('lean-evidence');
  const evidence='  Literal evidence: "quoted", C:\\cars\\stock, café, 車, tabs\tand\r\nnewlines.\nNever normalize these source bytes.  ';
  await write(f.context,evidence);
  await prepare(prepareOptions(f));
  const original=await read(path.join(f.out,'snapshot.json'));
  const captured=[];
  const capture=async req=>{
    captured.push({prompt:req.prompt,packet:JSON.parse(req.prompt.split('COUNCIL_PACKET_JSON\n')[1])});
    return invocation(report(['peer-finding'],'A material finding with complete evidence'))(req);
  };
  await hostDraft(f,['C-D1'],'Full independent proposal with unique architecture constraints');
  await ask({run:f.out,stage:'draft'},capture);
  await hostReview(f,['C-R1'],'Additional critique with distinct evidence');
  await ask({run:f.out,stage:'review'},capture);
  const security=report(['C-S1'],'Security scope and retained unknowns');
  security.limitations=['Tenant authorization is unverified.'];
  await write(path.join(f.out,'security-review.json'),security);
  const plan='# Plan\nPreserve the migration and rollback gate; checks are proposed.';
  await write(path.join(f.out,'final-plan.md'),plan);
  const decisions=['C-D1','C-R1','P-D1','P-R1','C-S1'].map(finding_id=>({finding_id,disposition:'unresolved',rationale:'Retained pending the specified evidence and owner decision.'}));
  await write(path.join(f.out,'decisions.json'),decisions);
  await ask({run:f.out,stage:'verify'},capture);
  for(const {packet} of captured) {
    assert.deepEqual(packet.shared_context.project_assessment,original.project_assessment);
    assert.equal(packet.shared_context.inputs.find(input=>input.kind==='context').content,evidence);
    for(const input of packet.shared_context.inputs) {
      assert.deepEqual(Object.keys(input).sort(),['content','kind','path']);
      const source=original.inputs.find(item=>item.kind===input.kind);
      assert.equal(input.content,source.content);
      assert.equal(source.bytes,Buffer.byteLength(source.content));
      assert.equal(source.sha256,createHash('sha256').update(source.content).digest('hex'));
    }
  }
  const verified=captured[2].packet;
  for(const [key,file] of [['coordinator_proposal','coordinator-draft.json'],['peer_proposal','peer-draft.json'],['coordinator_review','coordinator-review.json'],['peer_review','peer-review.json'],['security_review','security-review.json']]) {
    assert.deepEqual(verified[key],await read(path.join(f.out,file)));
  }
  assert.equal(verified.final_plan,plan);
  assert.deepEqual(verified.decisions,decisions);
  const commonPrefix=captured.map(({prompt})=>prompt.slice(0,prompt.indexOf(',"stage":')));
  assert.equal(commonPrefix[0],commonPrefix[1]);
  assert.equal(commonPrefix[1],commonPrefix[2]);
  assert.deepEqual(await read(path.join(f.out,'snapshot.json')),original);
  const manifest=await read(path.join(f.out,'run.json'));
  for(const file of ['final-plan.md','decisions.json','security-review.json']) {
    assert.equal(manifest.stages.verify.reviewed_hashes[file],createHash('sha256').update(await fs.readFile(path.join(f.out,file))).digest('hex'));
  }
});

test('changes-only peer reviews can omit revision prose while retaining every finding', async () => {
  const f=await readyForVerify('delta-report',{mode:'review'});
  const delta={...report(['new-finding'],'One remaining authorization gap'),proposal_markdown:''};
  const result=await ask({run:f.out,stage:'verify'},invocation(delta));
  assert.equal(result.report.proposal_markdown,'');
  assert.deepEqual(result.report.findings,[{...delta.findings[0],id:'P-V1'}]);
  const decisions=await read(path.join(f.out,'decisions.json'));
  decisions.push({finding_id:'P-V1',disposition:'unresolved',rationale:'Requires the missing authorization policy before coding.'});
  await write(path.join(f.out,'decisions.json'),decisions);
  assert.equal(finish({run:f.out}).unresolved[0].finding_id,'P-V1');
});

test('compact CLI output preserves full parsed status and Unicode without changing state', async () => {
  const f=await inputFixture('compact-cli');
  const value={...assessment(),summary:'Quoted "status" with café, 車 and a newline\nthat must survive.'};
  await write(f.assessment,value);
  const runner=path.join(packageRoot,'scripts','council.mjs');
  const prepared=spawnSync(process.execPath,[runner,'prepare','--compact','--project',f.project,'--brief',f.brief,'--assessment',f.assessment,'--context',f.context,'--coordinator','codex','--out',f.out],{encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(prepared.status,0,prepared.stderr);
  assert.equal(JSON.parse(prepared.stdout).run,f.out);
  assert.equal(prepared.stdout.trim().split('\n').length,1);
  const before=await fs.readFile(path.join(f.out,'run.json'));
  const base=[runner,'status','--run',f.out];
  const normal=spawnSync(process.execPath,base,{encoding:'utf8',windowsHide:true,timeout:10000});
  const compact=spawnSync(process.execPath,[...base,'--compact'],{encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(normal.status,0,normal.stderr); assert.equal(compact.status,0,compact.stderr);
  assert.deepEqual(JSON.parse(compact.stdout),JSON.parse(normal.stdout));
  assert.equal(JSON.parse(compact.stdout).project_assessment.summary,value.summary);
  assert.ok(compact.stdout.length<normal.stdout.length);
  assert.equal(compact.stdout.trim().split('\n').length,1);
  assert.deepEqual(await fs.readFile(path.join(f.out,'run.json')),before);
});

test('compact flag does not consume option values or allow duplicate and unknown flags', () => {
  const runner=path.join(packageRoot,'scripts','council.mjs');
  for(const args of [['status','--run','--compact'],['status','--compact','yes'],['version','--compact','--compact'],['status','--compcat']]) {
    const result=spawnSync(process.execPath,[runner,...args],{encoding:'utf8',windowsHide:true,timeout:5000});
    assert.equal(result.status,1);
    assert.match(result.stderr,/Invalid option|Duplicate option/);
  }
});

test('source status distinguishes modified content from unavailable original inputs', async () => {
  const f=await fixture('unavailable-input');
  await fs.rename(f.brief,path.join(f.root,'moved-brief.txt'));
  await write(f.context,'Changed context bytes.');
  const result=status({run:f.out});
  assert.deepEqual(result.changed_source_files,[f.context]);
  assert.deepEqual(result.unavailable_source_files,[{path:f.brief,reason:'missing'}]);
  await hostDraft(f);
  await assert.doesNotReject(()=>ask({run:f.out,stage:'draft'},invocation()));
});

test('common provider tokens and password-bearing connection strings are rejected', async () => {
  const values=[
    'ghp_'+'a'.repeat(36), 'github_pat_'+'b'.repeat(60),
    'xoxb-'+'1'.repeat(12)+'-'+'z'.repeat(24), 'xapp-'+'a'.repeat(30),
    'AIza'+'A'.repeat(35), 'ya29.'+'B'.repeat(45),
    'postgres://fixture:synthetic-pass@db.invalid/app',
    'Server=db.invalid;User ID=fixture;Password=synthetic-pass;',
    'Pwd=synthetic-pass;Host=db.invalid;',
  ];
  for (const [index,value] of values.entries()) {
    const f=await inputFixture(`credential-${index}`);
    await write(f.context,value);
    assert.throws(()=>prepare(prepareOptions(f)),/Possible credential/);
    await assert.rejects(()=>fs.access(f.out));
  }
  const f=await fixture('credential-in-report',{mode:'review'});
  await hostDraft(f,[],values[0]);
  await hostReview(f);
  let called=false;
  await assert.rejects(()=>ask({run:f.out,stage:'review'},async req=>{called=true;return invocation()(req);}),/Possible credential/);
  assert.equal(called,false);
  assert.equal(status({run:f.out}).attempts_used,0);
});

test('new verification dispositions do not imply the plan changed', async () => {
  const f=await readyForVerify('decision-only-change',{mode:'review'});
  await ask({run:f.out,stage:'verify'},invocation(report(['some-id'])));
  const decisions=await read(path.join(f.out,'decisions.json'));
  decisions.push({finding_id:'P-V1',disposition:'rejected',rationale:'The cited fixture evidence already addresses this concern.'});
  await write(path.join(f.out,'decisions.json'),decisions);
  const completed=finish({run:f.out});
  assert.equal(completed.changedSinceVerification,true);
  assert.equal(completed.plan_changed_since_verification,false);
  assert.equal(completed.decisions_changed_since_verification,true);
  assert.equal(completed.successful_peer_calls,2);
  assert.match(await fs.readFile(path.join(f.out,'RESULT.md'),'utf8'),/delivered plan matches/);
});

test('result counts successful responses separately from failed attempts', async () => {
  const f=await fixture('attempt-count',{mode:'review'});
  await hostDraft(f);
  await hostReview(f);
  await assert.rejects(()=>ask({run:f.out,stage:'review'},async()=>({code:1,stdout:'',stderr:'Synthetic launch failure'})),/exited with code/);
  await ask({run:f.out,stage:'review'},invocation());
  await write(path.join(f.out,'final-plan.md'),'Plan: verify escaped output.');
  await write(path.join(f.out,'security-review.json'),report());
  await write(path.join(f.out,'decisions.json'),[]);
  await ask({run:f.out,stage:'verify'},invocation());
  const completed=finish({run:f.out});
  assert.equal(completed.attempts_used,3);
  assert.equal(completed.successful_peer_calls,2);
  assert.match(await fs.readFile(path.join(f.out,'RESULT.md'),'utf8'),/Successful peer calls: 2; attempts: 3/);
});

test('an incompatible peer executable fails preflight without consuming an attempt', async () => {
  const f=await fixture('preflight-attempt',{coordinator:'claude'});
  await hostDraft(f);
  const previous=process.env.COUNCIL_CODEX_BIN;
  try {
    process.env.COUNCIL_CODEX_BIN=process.execPath;
    await assert.rejects(()=>ask({run:f.out,stage:'draft'}),/flag|help|missing|required|check failed|features/i);
    assert.equal(status({run:f.out}).attempts_used,0);
  } finally {
    if(previous===undefined) delete process.env.COUNCIL_CODEX_BIN;
    else process.env.COUNCIL_CODEX_BIN=previous;
  }
});

test('corrupt manifest recovers completed stages without permitting a repeat call', async () => {
  const f=await fixture('recover-stage');
  await hostDraft(f);
  await ask({run:f.out,stage:'draft'},invocation());
  await fs.writeFile(path.join(f.out,'run.json'),Buffer.alloc(200));
  assert.equal(status({run:f.out}).attempts_used,1);
  let called=false;
  await assert.rejects(()=>ask({run:f.out,stage:'draft'},async req=>{called=true;return invocation()(req);}),/already succeeded/);
  assert.equal(called,false);
});

test('generated handoff reflects progress and leaves additional notes and legacy handoffs alone', async () => {
  const f=await fixture('generated-handoff');
  assert.match(await fs.readFile(path.join(f.out,'HANDOFF.md'),'utf8'),/Status: prepared/);
  await write(path.join(f.out,'NOTES.md'),'A coordinator decision that must be preserved.');
  await hostDraft(f);
  await ask({run:f.out,stage:'draft'},invocation());
  const handoff=await fs.readFile(path.join(f.out,'HANDOFF.md'),'utf8');
  assert.match(handoff,/draft: succeeded/);
  assert.match(handoff,/Attempts: 1\/4/);
  assert.match(handoff,/NOTES.md/);
  assert.equal(await fs.readFile(path.join(f.out,'NOTES.md'),'utf8'),'A coordinator decision that must be preserved.');
  const state=await read(path.join(f.out,'run.json'));
  delete state.generated_handoff;
  await write(path.join(f.out,'run.json'),state);
  await write(path.join(f.out,'HANDOFF.md'),'Legacy handwritten handoff.');
  await hostReview(f);
  await ask({run:f.out,stage:'review'},invocation());
  assert.equal(await fs.readFile(path.join(f.out,'HANDOFF.md'),'utf8'),'Legacy handwritten handoff.');
});

test('discussion refresh shows working proposals without mutating authoritative state', async () => {
  const f=await fixture('discussion-refresh');
  const file=path.join(f.out,'DISCUSSION.md');
  assert.match(await fs.readFile(file,'utf8'),/No validated reports are available yet/);
  assert.match(await fs.readFile(path.join(f.out,'HANDOFF.md'),'utf8'),/DISCUSSION.md/);
  await hostDraft(f,[],'A compact candidate proposal');
  const names=['run.json','run.checkpoint.json','snapshot.json','project-assessment.json'];
  const before=await Promise.all(names.map(name=>fs.readFile(path.join(f.out,name))));
  assert.equal(discussion({run:f.out}).discussion,file);
  assert.match(await fs.readFile(file,'utf8'),/Current working draft; not yet submitted/);
  assert.match(await fs.readFile(file,'utf8'),/A compact candidate proposal/);
  const after=await Promise.all(names.map(name=>fs.readFile(path.join(f.out,name))));
  assert.deepEqual(after,before);
  const cli=spawnSync(process.execPath,[path.join(packageRoot,'scripts','council.mjs'),'discussion','--run',f.out],{encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(cli.status,0,cli.stderr);
  assert.equal(JSON.parse(cli.stdout).discussion,file);
  assert.equal(status({run:f.out}).attempts_used,0);
});

test('discussion updates before and after a real stage transition without entering peer context', async () => {
  const f=await fixture('discussion-stage');
  await hostDraft(f,[],'COORDINATOR_DRAFT_NOT_IN_PEER_INPUT');
  const result=await ask({run:f.out,stage:'draft'},async request=>{
    const current=await fs.readFile(path.join(f.out,'DISCUSSION.md'),'utf8');
    assert.match(current,/running \(last recorded state\)/);
    assert.doesNotMatch(current,/Peer public summary/);
    assert.doesNotMatch(request.prompt,/C2C generated discussion|COORDINATOR_DRAFT_NOT_IN_PEER_INPUT/);
    return invocation(report(['peer-id'],'Peer public summary'))(request);
  });
  assert.equal(result.discussion,path.join(f.out,'DISCUSSION.md'));
  const current=await fs.readFile(result.discussion,'utf8');
  assert.match(current,/Independent proposal \| succeeded/);
  assert.match(current,/Peer public summary/);
  assert.match(current,/Awaiting a recorded decision/);
});

test('failed peer output never becomes discussion evidence', async () => {
  const f=await fixture('discussion-failure');
  await hostDraft(f);
  await assert.rejects(()=>ask({run:f.out,stage:'draft'},async()=>({code:1,stdout:'PRIVATE_PARTIAL_ARGUMENT',stderr:'PRIVATE_DIAGNOSTIC'})),/exited with code/);
  const current=await fs.readFile(path.join(f.out,'DISCUSSION.md'),'utf8');
  assert.match(current,/Independent proposal \| failed/);
  assert.match(current,/Successful peer calls: \*\*0\*\*; attempts: \*\*1\*\*/);
  assert.doesNotMatch(current,/PRIVATE_PARTIAL_ARGUMENT|PRIVATE_DIAGNOSTIC/);
});

test('invalid mutable discussion decisions are flagged rather than rendered as agreement', async () => {
  const f=await readyForVerify('discussion-decisions',{mode:'review'});
  const good=await read(path.join(f.out,'decisions.json'));
  for(const invalid of ['{partial',JSON.stringify([...good,good[0]]),JSON.stringify([{finding_id:'unknown',disposition:'accepted',rationale:'UNTRUSTED_RESPONSE_MUST_NOT_RENDER'}])]) {
    await write(path.join(f.out,'decisions.json'),invalid);
    const result=discussion({run:f.out});
    assert.ok(result.warnings.length);
    const current=await fs.readFile(result.discussion,'utf8');
    assert.match(current,/current decision record is invalid/);
    assert.match(current,/Awaiting a recorded decision/);
    assert.doesNotMatch(current,/UNTRUSTED_RESPONSE_MUST_NOT_RENDER/);
  }
  await write(path.join(f.out,'decisions.json'),good);
  assert.deepEqual(discussion({run:f.out}).warnings,[]);
});

test('discussion preserves unresolved responses and post-verification revisions at completion', async () => {
  const f=await readyForVerify('discussion-completion',{mode:'review',coordinator:'claude'});
  await ask({run:f.out,stage:'verify'},invocation(report(['new-finding'],'Final concern from Codex')));
  const decisions=await read(path.join(f.out,'decisions.json'));
  decisions.push({finding_id:'P-V1',disposition:'unresolved',rationale:'The owner must choose this policy before implementation.'});
  await write(path.join(f.out,'decisions.json'),decisions);
  await fs.appendFile(path.join(f.out,'final-plan.md'),'\nClarify the outstanding policy first.');
  discussion({run:f.out});
  let current=await fs.readFile(path.join(f.out,'DISCUSSION.md'),'utf8');
  assert.match(current,/Claude Code coordinates · Codex reviews/);
  assert.match(current,/plan changed after final peer verification/);
  assert.match(current,/response — unresolved/);
  const completed=finish({run:f.out});
  current=await fs.readFile(completed.discussion,'utf8');
  assert.match(current,/workflow is complete/);
  assert.match(current,/Final peer verdict: \*\*needs changes\*\*/);
  assert.match(current,/owner must choose this policy/);
  assert.equal(completed.unresolved.length,1);
});

test('a conflicting discussion file is preserved and cannot turn a successful peer call into failure', async () => {
  const f=await fixture('discussion-conflict');
  const file=path.join(f.out,'DISCUSSION.md');
  await write(file,'User-authored notes that are not a generated view.');
  assert.throws(()=>discussion({run:f.out}),/not a generated view/);
  await hostDraft(f);
  await ask({run:f.out,stage:'draft'},invocation());
  assert.equal(status({run:f.out}).stages.draft.status,'succeeded');
  assert.equal(await fs.readFile(file,'utf8'),'User-authored notes that are not a generated view.');
});

test('discussion retains submitted security concerns when the working copy is missing or invalid', async () => {
  const f=await readyForVerify('discussion-security-preservation',{mode:'review'});
  const file=path.join(f.out,'security-review.json');
  const submitted=report(['C-S1'],'Submitted security concern');
  submitted.findings[0].claim='Preserve this authorization concern';
  await write(file,submitted);
  const decisions=await read(path.join(f.out,'decisions.json'));
  await write(path.join(f.out,'decisions.json'),[...decisions,{finding_id:'C-S1',disposition:'unresolved',rationale:'Awaiting the owner authorization policy.'}]);
  await ask({run:f.out,stage:'verify'},invocation());
  await write(path.join(f.out,'decisions.json'),decisions);
  const stateBefore=await fs.readFile(path.join(f.out,'run.json'));
  for (const invalid of [null,'{partial',report([],'Removed the submitted concern'),{...submitted,findings:[{...submitted.findings[0],claim:'Rewritten concern'}]}]) {
    if (invalid === null) await fs.unlink(file);
    else await write(file,invalid);
    const result=discussion({run:f.out});
    assert.match(result.warnings.join(' '),/changes a submitted finding/);
    const current=await fs.readFile(result.discussion,'utf8');
    assert.match(current,/Preserve this authorization concern/);
    assert.match(current,/Sealed prior submission; current working copy is invalid/);
    assert.match(current,/\[Report\]\(attempt-2-security-review.json\)/);
    assert.match(current,/Awaiting a recorded decision/);
    assert.doesNotMatch(current,/Removed the submitted concern|Rewritten concern/);
    assert.deepEqual(await fs.readFile(path.join(f.out,'run.json')),stateBefore);
  }
});

test('legacy discussion generation remains a view and future stage updates can refresh it', async () => {
  const f=await fixture('discussion-legacy');
  const state=await read(path.join(f.out,'run.json'));
  delete state.generated_discussion;
  await write(path.join(f.out,'run.json'),state);
  await fs.unlink(path.join(f.out,'DISCUSSION.md'));
  const before=await fs.readFile(path.join(f.out,'run.json'));
  discussion({run:f.out});
  assert.deepEqual(await fs.readFile(path.join(f.out,'run.json')),before);
  await hostDraft(f);
  await ask({run:f.out,stage:'draft'},invocation(report([],'A legacy run public contribution')));
  assert.match(await fs.readFile(path.join(f.out,'DISCUSSION.md'),'utf8'),/A legacy run public contribution/);
});

test('legacy continuation without discussion opt-in never returns a nonexistent view link', async () => {
  const f=await readyForVerify('discussion-not-enabled',{mode:'review'});
  const state=await read(path.join(f.out,'run.json'));
  delete state.generated_discussion;
  await write(path.join(f.out,'run.json'),state);
  await fs.unlink(path.join(f.out,'DISCUSSION.md'));
  const verified=await ask({run:f.out,stage:'verify'},invocation());
  assert.equal(verified.discussion,null);
  await assert.rejects(()=>fs.access(path.join(f.out,'DISCUSSION.md')));
  const completed=finish({run:f.out});
  assert.equal(completed.discussion,null);
  assert.ok(await fs.readFile(completed.result,'utf8'));
});

const sameModels = provider => provider === 'codex'
  ? { 'coordinator-model':'gpt-5.4', 'peer-model':'gpt-5.4-mini' }
  : { 'coordinator-model':'claude-opus-4-6', 'peer-model':'claude-sonnet-4-6' };

const authorModels = (provider, pairing = 'same') => ({
  'author-model': provider === 'codex' ? 'gpt-5.4' : 'claude-opus-4-6',
  'peer-model': pairing === 'same' ? sameModels(provider)['peer-model'] : provider === 'codex' ? 'claude-opus-4-6' : 'gpt-5.4',
});

test('selected background planners and critics complete both provider routes with truthful provenance', async () => {
  for (const coordinator of ['codex', 'claude']) for (const pairing of ['same', 'cross']) {
    const mode = pairing === 'same' ? 'review' : 'plan';
    const models = authorModels(coordinator, pairing);
    const f = await fixture(`author-${coordinator}-${pairing}`, { coordinator, pairing, mode, ...models });
    const prepared = status({ run: f.out });
    assert.equal((await read(path.join(f.out, 'run.json'))).version, 5);
    assert.equal(prepared.participants.coordinator_model, null, 'The unknown host model must not be replaced by the selected planner');
    assert.equal(prepared.participants.author_model, models['author-model']);
    assert.equal(prepared.budget.successful_calls_remaining, mode === 'plan' ? 5 : 3);
    assert.equal(prepared.budget.max_attempts, mode === 'plan' ? 6 : 4);
    const packets = new Map(), requestRecords = [];
    const worker = async request => {
      const packet = JSON.parse(request.prompt.split('COUNCIL_PACKET_JSON\n')[1]);
      packets.set(packet.stage, packet);
      const author = packet.stage.startsWith('author-');
      assert.equal(request.provider, author ? coordinator : prepared.peer);
      const expectedModel = models[author ? 'author-model' : 'peer-model'];
      assert.equal(request.args[request.args.indexOf('--model') + 1], expectedModel);
      assert.notEqual(await fs.realpath(request.cwd), await fs.realpath(f.project));
      assert.match(request.prompt, /Do not execute tools, edit project files/);
      if (request.provider === 'claude') {
        assert.equal(request.args[request.args.indexOf('--tools') + 1], '');
        assert.ok(request.args.includes('--strict-mcp-config'));
      } else {
        assert.ok(request.args.includes('read-only'));
        assert.ok(request.args.includes('never'));
      }
      if (pairing === 'same' && !author) assert.match(packet.stage_instruction, /coding-focused implementation critic.*buildability.*testability/);
      if (pairing === 'cross') assert.doesNotMatch(packet.stage_instruction, /coding-focused implementation critic/);
      requestRecords.push({ stage: packet.stage, provider: request.provider });
      return invocationWithModels(report(packet.stage === 'verify' ? [] : ['transport-id'], `REPORT_${packet.stage}`), [expectedModel])(request);
    };
    const authorResult = await ask({ run: f.out, stage: 'author-draft' }, worker);
    assert.equal(authorResult.worker.role, 'author');
    assert.deepEqual(authorResult.reported_worker_models, [models['author-model']]);
    assert.equal(authorResult.worker_identity_status, 'cli_reported');
    assert.equal(Object.hasOwn(authorResult, 'reported_peer_models'), false, 'Author metadata must not be returned as peer identity');
    assert.equal(Object.hasOwn(authorResult, 'peer_identity_status'), false);
    assert.equal((await read(path.join(f.out, 'coordinator-draft.json'))).findings[0].id, 'C-D1');
    if (mode === 'plan') {
      await ask({ run: f.out, stage: 'draft' }, worker);
      await ask({ run: f.out, stage: 'author-review' }, worker);
    } else await hostReview(f, ['C-R1'], 'Actual host independent check');
    const peerResult = await ask({ run: f.out, stage: 'review' }, worker);
    assert.equal(peerResult.worker.role, 'peer');
    assert.deepEqual(peerResult.reported_peer_models, [models['peer-model']]);
    assert.equal(peerResult.peer_identity_status, 'cli_reported');
    assert.deepEqual(peerResult.reported_worker_models, peerResult.reported_peer_models);
    assert.equal(peerResult.worker_identity_status, peerResult.peer_identity_status);
    for (const name of mode === 'plan' ? ['author-draft', 'draft'] : ['author-draft']) {
      const packet = packets.get(name);
      assert.equal(packet.coordinator_proposal, undefined);
      assert.equal(packet.peer_proposal, undefined);
      assert.doesNotMatch(JSON.stringify(packet), /REPORT_author-draft|REPORT_draft/);
    }
    for (const name of mode === 'plan' ? ['author-review', 'review'] : ['review']) {
      const packet = packets.get(name);
      assert.equal(packet.coordinator_review, undefined);
      assert.equal(packet.peer_review, undefined);
      assert.equal(packet.coordinator_proposal.summary, 'REPORT_author-draft');
      assert.equal(packet.peer_proposal?.summary, mode === 'plan' ? 'REPORT_draft' : undefined);
      assert.doesNotMatch(JSON.stringify(packet), /REPORT_author-review|REPORT_review|Actual host independent check/);
    }
    const ids = ['C-D1', 'C-R1', 'P-R1', ...(mode === 'plan' ? ['P-D1'] : [])];
    await write(path.join(f.out, 'final-plan.md'), '# Coordinator synthesis\nPreserve requirements, implement safe escaping and verify acceptance gates.');
    await write(path.join(f.out, 'decisions.json'), ids.map(finding_id => ({ finding_id, disposition: 'accepted', rationale: 'Covered by the final acceptance gates and implementation steps.' })));
    await assert.rejects(() => ask({ run: f.out, stage: 'verify' }, worker), /security-review/);
    await write(path.join(f.out, 'security-review.json'), report([], 'Actual host security review; tests are proposed.'));
    await ask({ run: f.out, stage: 'verify' }, worker);
    const result = finish({ run: f.out });
    assert.equal(result.successful_worker_calls, mode === 'plan' ? 5 : 3);
    assert.equal(result.successful_peer_calls, mode === 'plan' ? 3 : 2);
    assert.equal(result.worker_model_reports.filter(item => item.role === 'author').length, mode === 'plan' ? 2 : 1);
    assert.ok(result.worker_model_reports.every(item => item.identity_status === 'cli_reported'));
    assert.ok(result.peer_model_reports.every(item => item.requested === models['peer-model']));
    assert.equal(result.plan_changed_since_verification, false);
    assert.equal(result.security_review.required, true);
    const current = status({ run: f.out });
    assert.deepEqual(current.reported_author_models, [models['author-model']]);
    assert.deepEqual(current.reported_peer_models, [models['peer-model']]);
    assert.equal(current.successful_worker_calls, requestRecords.length);
    const discussionText = await fs.readFile(path.join(f.out, 'DISCUSSION.md'), 'utf8');
    assert.match(discussionText, /current chat synthesizes the plan and owns security review/);
    assert.match(discussionText, /Successful worker calls \(author and peer\)/);
    assert.match(discussionText, /author&#41; · Proposal/);
    assert.match(discussionText, /coordinator&#41; · Security review/);
    if (mode === 'review') assert.match(discussionText, /coordinator&#41; · Review of the candidate plan/);
    else assert.match(discussionText, /author&#41; · Review of the/);
  }
});

test('background routing rejects ambiguous models and insufficient explicit capacity before creating a run', async () => {
  const f = await inputFixture('author-invalid');
  const valid = { ...prepareOptions(f), ...authorModels('codex'), pairing: 'same', mode: 'review' };
  for (const extra of [ { 'author-model': 'latest' }, { 'author-model': 'gpt-5.4-high' }, { 'peer-model': 'gpt-5.4' },
    { 'peer-model': 'gpt-5.4-2026-03-17' }, { 'peer-model': null }, { 'max-attempts': '2' }, { mode: 'plan', 'max-attempts': '4' } ]) {
    assert.throws(() => prepare({ ...valid, ...extra }), /model|attempts|calls/i);
    await assert.rejects(() => fs.access(f.out));
  }
  prepare({ ...valid, 'coordinator-model': 'gpt-5.4-mini', 'max-attempts': '3' });
  const current = status({ run: f.out });
  assert.equal(current.participants.coordinator_model, 'gpt-5.4-mini', 'Host may match the critic because the separate author is the planner');
  assert.equal(current.budget.max_attempts, 3, 'An explicit cap is never raised to add a retry');
});

test('background stages require their actual predecessors and never overwrite a handwritten draft', async () => {
  const f = await fixture('author-order', { ...authorModels('codex', 'cross') });
  let calls = 0;
  const invoker = async request => { calls++; return invocation()(request); };
  for (const stage of ['draft', 'author-review', 'review', 'verify']) await assert.rejects(() => ask({ run: f.out, stage }, invoker), /Complete/);
  await hostDraft(f, [], 'Preserve user-authored work');
  await assert.rejects(() => ask({ run: f.out, stage: 'author-draft' }, invoker), /will not overwrite/);
  assert.equal(calls, 0);
  assert.equal(status({ run: f.out }).attempts_used, 0);
  assert.equal((await read(path.join(f.out, 'coordinator-draft.json'))).summary, 'Preserve user-authored work');
  assert.doesNotMatch(await fs.readFile(path.join(f.out, 'DISCUSSION.md'), 'utf8'), /Preserve user-authored work/);
});

test('failed background author attempts stay charged through resume and successful stages cannot replay', async () => {
  const f = await fixture('author-recovery', { ...authorModels('claude'), coordinator: 'claude', pairing: 'same', mode: 'review' });
  const failure = new Error('Synthetic author timeout'); failure.reason = 'timeout'; failure.stdout = JSON.stringify({ type: 'system', subtype: 'thinking_tokens' });
  await assert.rejects(() => ask({ run: f.out, stage: 'author-draft' }, async () => { throw failure; }), /Synthetic author timeout/);
  const failed = await read(path.join(f.out, 'run.json'));
  assert.equal(failed.attempts[0].provider, 'claude');
  assert.equal(failed.attempts[0].role, 'author');
  assert.equal(failed.attempts[0].status, 'failed');
  assert.equal(failed.attempts[0].progress.phase, 'model_working');
  assert.equal(status({ run: f.out }).budget.successful_calls_remaining, 3);
  const savedLog = await fs.readFile(path.join(f.out, 'attempt-1-stdout.txt'), 'utf8');
  await ask({ run: f.out, stage: 'author-draft' }, invocation());
  const authored = await fs.readFile(path.join(f.out, 'coordinator-draft.json'), 'utf8');
  let replayed = false;
  await assert.rejects(() => ask({ run: f.out, stage: 'author-draft' }, async () => { replayed = true; }), /already succeeded/);
  assert.equal(replayed, false);
  await hostReview(f);
  await ask({ run: f.out, stage: 'review' }, invocation());
  await write(path.join(f.out, 'final-plan.md'), '# Complete the preserved work');
  await write(path.join(f.out, 'security-review.json'), report());
  await write(path.join(f.out, 'decisions.json'), []);
  await ask({ run: f.out, stage: 'verify' }, invocation());
  const result = finish({ run: f.out });
  assert.equal(result.successful_worker_calls, 3);
  assert.equal(result.attempts_used, 4);
  assert.equal((await read(path.join(f.out, 'run.json'))).attempts[0].reason, 'timeout');
  assert.equal(await fs.readFile(path.join(f.out, 'attempt-1-stdout.txt'), 'utf8'), savedLog);
  assert.equal(await fs.readFile(path.join(f.out, 'coordinator-draft.json'), 'utf8'), authored);
});

test('background author and cross-provider critic model substitutions fail without a successful report', async () => {
  for (const coordinator of ['codex', 'claude']) for (const stage of ['author-draft', 'review']) {
    const models = authorModels(coordinator, 'cross');
    const f = await fixture(`author-mismatch-${coordinator}-${stage}`, { coordinator, mode: 'review', ...models });
    if (stage === 'review') { await ask({ run: f.out, stage: 'author-draft' }, invocation()); await hostReview(f); }
    const provider = stage === 'author-draft' ? coordinator : coordinator === 'codex' ? 'claude' : 'codex';
    const unexpected = provider === 'codex' ? 'gpt-5.4-mini' : 'claude-sonnet-4-6';
    await assert.rejects(() => ask({ run: f.out, stage }, invocationWithModels(report(), [unexpected])), /reported unexpected model/);
    const state = await read(path.join(f.out, 'run.json'));
    assert.equal(state.stages[stage], undefined);
    assert.equal(state.attempts.at(-1).status, 'failed');
    assert.deepEqual(state.attempts.at(-1).reported_models, [unexpected]);
    await assert.rejects(() => fs.access(path.join(f.out, stage === 'author-draft' ? 'coordinator-draft.json' : 'peer-review.json')));
  }
});

test('background author route is sealed, rejects downgrades, and protects authored evidence', async () => {
  for (const mutate of [state => { state.author_model = 'gpt-5.3-codex'; }, state => { state.version = 4; }, state => { delete state.author_model; }, state => { state.coordinator_model = 'gpt-5.4-mini'; }]) {
    const f = await fixture('author-sealed-route', { ...authorModels('codex', 'cross') });
    const state = await read(path.join(f.out, 'run.json')); mutate(state); await write(path.join(f.out, 'run.json'), state);
    assert.throws(() => status({ run: f.out }), /route|author|identity|Participant/i);
  }
  const f = await fixture('author-sealed-report', { ...authorModels('codex', 'cross') });
  await ask({ run: f.out, stage: 'author-draft' }, invocation());
  await hostDraft(f, [], 'A rewritten planner proposal');
  let called = false;
  await assert.rejects(() => ask({ run: f.out, stage: 'draft' }, async () => { called = true; }), /Sealed artifact changed/);
  assert.equal(called, false);
});

test('CLI preparation accepts author-model without requiring or changing the current chat identity', async () => {
  const f = await inputFixture('author-cli');
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = spawnSync(process.execPath, [path.join(packageRoot, 'scripts', 'council.mjs'), 'prepare', '--project', f.project,
    '--brief', f.brief, '--assessment', f.assessment, '--coordinator', 'claude', '--mode', 'review', '--pairing', 'same',
    '--author-model', 'claude-opus-4-6', '--peer-model', 'claude-sonnet-4-6', '--out', f.out, '--compact'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.participants.coordinator_identity, 'unknown');
  assert.equal(output.participants.author_identity, 'requested');
  assert.equal(output.budget.successful_calls_remaining, 3);
  assert.match(output.next, /author-draft/);
});

function invocationWithModels(result, models) {
  return async request => {
    const response=await invocation(result)(request);
    const events=response.stdout.split('\n').map(line=>JSON.parse(line));
    if(request.provider==='claude') {
      events.unshift(...models.map(model=>({type:'system',subtype:'init',model})));
      events.at(-1).modelUsage=Object.fromEntries(models.map(model=>[model,{inputTokens:10,outputTokens:20}]));
    } else {
      events.unshift(...models.map(model=>({type:'turn.started',model})));
    }
    return {...response,stdout:events.map(event=>JSON.stringify(event)).join('\n')};
  };
}

test('same-provider preparation rejects ambiguous identities before creating any run', async () => {
  const f=await inputFixture('same-invalid');
  const cases=[
    {}, {'coordinator-model':'gpt-5.4'}, {'peer-model':'gpt-5.4-mini'},
    {'coordinator-model':'gpt-5.4','peer-model':'GPT-5.4'},
    {'coordinator-model':'gpt-5.4','peer-model':'gpt-5.4-high'},
    {'coordinator-model':'gpt-5.4','peer-model':'gpt-5.4-2026-03-05'},
    {'coordinator-model':'gpt-5.4-2026-03-05','peer-model':'gpt-5.4-2026-05-05'},
    {'coordinator-model':'gpt-5.4','peer-model':'gpt-latest'},
    ...['default','latest','auto','best','fable','sonnet','opus','haiku','opusplan','claude-sonnet-latest','claude-opus-4-6[1m]'].map(alias=>({coordinator:'claude','coordinator-model':'claude-opus-4-6','peer-model':alias})),
    {coordinator:'claude','coordinator-model':'claude-sonnet-4-6','peer-model':'claude-sonnet-4-6-20260305'},
  ];
  for(const invalid of cases) {
    assert.throws(()=>prepare({...prepareOptions(f),pairing:'same',...invalid}),/model|aliases|effort/i);
    await assert.rejects(()=>fs.access(f.out));
  }
  assert.throws(()=>prepare({...prepareOptions(f),pairing:'unknown'}),/Pairing/);
  // Even an unavailable project path must not obscure a missing model declaration.
  assert.throws(()=>prepare({...prepareOptions(f),project:path.join(f.root,'missing'),pairing:'same'}),/coordinator-model/);
});

test('cross-provider routes retain default-model behavior for both coordinators', async () => {
  for(const coordinator of ['codex','claude']) {
    const f=await fixture(`cross-${coordinator}`,{coordinator});
    const expected=coordinator==='codex'?'claude':'codex';
    await hostDraft(f);
    await ask({run:f.out,stage:'draft'},async request=>{
      assert.equal(request.provider,expected);
      assert.equal(request.args.includes('--model'),false);
      return invocation()(request);
    });
    const current=status({run:f.out});
    assert.equal(current.participants.pairing,'cross');
    assert.equal(current.participants.coordinator_identity,'unknown');
    assert.equal(current.participants.peer_identity,'provider_default');
    assert.equal(current.peer,expected);
  }
});

test('cross-provider exact peer IDs reject model substitution even when the host is the planner', async () => {
  for (const coordinator of ['codex', 'claude']) {
    const model = coordinator === 'codex' ? 'claude-opus-5-5' : 'gpt-6.1-sol';
    const other = coordinator === 'codex' ? 'claude-sonnet-5-5' : 'gpt-6-astra';
    for (const reported of [[model], [other], [model, other], []]) {
      const f = await fixture(`host-planner-cross-${coordinator}`, { coordinator, mode: 'review', 'peer-model': model });
      await hostDraft(f);
      await hostReview(f);
      const call = () => ask({ run: f.out, stage: 'review' }, invocationWithModels(report(), reported));
      if (reported.includes(other)) {
        await assert.rejects(call, /reported unexpected model/);
        const current = status({ run: f.out });
        assert.equal(current.successful_peer_calls, 0);
        assert.equal(current.stages.review, undefined);
        const state = await read(path.join(f.out, 'run.json'));
        assert.equal(state.attempts.at(-1).status, 'failed');
        assert.deepEqual(state.attempts.at(-1).reported_models, reported);
        await assert.rejects(() => fs.access(path.join(f.out, 'peer-review.json')));
      } else {
        const result = await call();
        assert.deepEqual(result.reported_peer_models, reported);
        assert.equal(result.peer_identity_status, reported.length ? 'cli_reported' : 'unreported');
        assert.equal(status({ run: f.out }).successful_peer_calls, 1);
      }
    }
    const pinned = `${model}${coordinator === 'codex' ? '-20261001' : '-2026-10-01'}`;
    const f = await fixture(`host-planner-pinned-${coordinator}`, { coordinator, mode: 'review', 'peer-model': pinned });
    await hostDraft(f); await hostReview(f);
    await assert.rejects(() => ask({ run: f.out, stage: 'review' }, invocationWithModels(report(), [model])), /reported unexpected model/);
  }
});

test('legacy cross-provider aliases and custom gateway labels remain compatible without attested identity', async () => {
  for (const coordinator of ['codex', 'claude']) for (const model of ['default', 'custom-gateway-model']) {
    const f = await fixture(`legacy-cross-alias-${coordinator}`, { coordinator, mode: 'review', 'peer-model': model });
    await hostDraft(f); await hostReview(f);
    const actual = coordinator === 'codex' ? 'claude-opus-5-5' : 'gpt-6.1-sol';
    const result = await ask({ run: f.out, stage: 'review' }, invocationWithModels(report(), [actual]));
    assert.deepEqual(result.reported_peer_models, [actual]);
    assert.equal(result.peer_identity_status, 'cli_reported');
    assert.equal(result.participants.peer_model, model);
    assert.match(result.participants.identity_note, /not independent attestation/);
    assert.equal(status({ run: f.out }).successful_peer_calls, 1);
  }
});

test('same-provider plan and review workflows use distinct requested models and preserve independence and security', async () => {
  for(const coordinator of ['codex','claude']) for(const mode of ['plan','review']) {
    const ids=sameModels(coordinator);
    const f=await fixture(`same-${coordinator}-${mode}`,{coordinator,mode,pairing:'same',...ids});
    const captured=[];
    const peer=async request=>{
      assert.equal(request.provider,coordinator);
      assert.equal(request.args[request.args.indexOf('--model')+1],ids['peer-model']);
      const packet=JSON.parse(request.prompt.split('COUNCIL_PACKET_JSON\n')[1]);
      captured.push(packet);
      assert.equal(packet.participants.coordinator_model,ids['coordinator-model']);
      assert.equal(packet.participants.peer_model,ids['peer-model']);
      assert.match(request.prompt,/strongest practical alternative|Challenge unsupported assumptions/);
      assert.match(request.prompt,/Never force criticism or agreement/);
      if (packet.stage === 'draft') assert.doesNotMatch(packet.stage_instruction, /coding-focused implementation critic/);
      else assert.match(packet.stage_instruction, /coding-focused implementation critic.*buildability.*testability/);
      return invocationWithModels(report(),[ids['peer-model']])(request);
    };
    await hostDraft(f,[],'PRIVATE_COORDINATOR_PROPOSAL');
    if(mode==='plan') {
      await ask({run:f.out,stage:'draft'},peer);
      assert.equal(captured[0].coordinator_proposal,undefined);
      assert.doesNotMatch(JSON.stringify(captured[0]),/PRIVATE_COORDINATOR_PROPOSAL/);
    }
    await hostReview(f,[],'PRIVATE_COORDINATOR_REVIEW');
    await ask({run:f.out,stage:'review'},peer);
    const reviewed=captured.at(-1);
    assert.equal(reviewed.coordinator_review,undefined);
    assert.doesNotMatch(JSON.stringify(reviewed),/PRIVATE_COORDINATOR_REVIEW/);
    assert.equal(Boolean(reviewed.peer_proposal),mode==='plan');
    await write(path.join(f.out,'final-plan.md'),'# Final plan\nImplement the bounded exporter and proposed negative checks.');
    await write(path.join(f.out,'decisions.json'),[]);
    await assert.rejects(()=>ask({run:f.out,stage:'verify'},peer),/security-review/);
    await write(path.join(f.out,'security-review.json'),report([],'Synthetic security scope and proposed abuse checks'));
    await ask({run:f.out,stage:'verify'},peer);
    assert.equal(captured.at(-1).security_review.summary,'Synthetic security scope and proposed abuse checks');
    const completed=finish({run:f.out});
    assert.equal(completed.successful_peer_calls,mode==='plan'?3:2);
    assert.equal(completed.attempts_used,mode==='plan'?3:2);
    assert.equal(completed.participants.pairing,'same');
    assert.equal(completed.participants.coordinator_identity,'declared');
    assert.equal(completed.participants.peer_identity,'requested');
    assert.equal(completed.security_review.required,true);
    assert.ok(completed.peer_model_reports.every(item=>item.identity_status==='cli_reported' && item.reported[0]===ids['peer-model']));
    for(const file of ['HANDOFF.md','RESULT.md']) {
      const text=await fs.readFile(path.join(f.out,file),'utf8');
      assert.ok(text.includes(ids['coordinator-model']));
      assert.ok(text.includes(ids['peer-model']));
      assert.match(text,/not independent attestation/);
    }
  }
});

test('same-provider positive metadata mismatches fail without creating successful stage evidence', async () => {
  for(const coordinator of ['codex','claude']) {
    const ids=sameModels(coordinator);
    const unexpected=coordinator==='codex'?'gpt-5.3-codex':'claude-haiku-4-5';
    for(const reported of [[ids['coordinator-model']],[unexpected],[ids['peer-model'],unexpected]]) {
      const f=await fixture(`model-mismatch-${coordinator}`,{coordinator,pairing:'same',...ids});
      await hostDraft(f);
      await assert.rejects(()=>ask({run:f.out,stage:'draft'},invocationWithModels(report(),reported)),/reported.*model/);
      const current=status({run:f.out});
      assert.equal(current.attempts_used,1);
      assert.equal(current.successful_peer_calls,0);
      assert.equal(current.stages.draft,undefined);
      await assert.rejects(()=>fs.access(path.join(f.out,'peer-draft.json')));
      const saved=await read(path.join(f.out,'run.json'));
      assert.equal(saved.attempts[0].status,'failed');
      assert.deepEqual(saved.attempts[0].reported_models,reported);
    }
  }
});

test('missing CLI identity metadata stays unreported rather than attested', async () => {
  for(const coordinator of ['codex','claude']) {
    const f=await fixture(`unreported-${coordinator}`,{coordinator,pairing:'same',...sameModels(coordinator)});
    await hostDraft(f);
    const result=await ask({run:f.out,stage:'draft'},invocation(report([],'The prose says some model; this is not metadata')));
    assert.deepEqual(result.reported_peer_models,[]);
    assert.equal(result.peer_identity_status,'unreported');
    assert.equal((await read(path.join(f.out,'run.json'))).attempts[0].model_identity_status,'unreported');
  }
});

test('participant identity and route changes are rejected before resume or model calls', async () => {
  const cases=[state=>{state.peer_model='gpt-5.3-codex';},state=>{state.coordinator_model='gpt-5.2';},state=>{state.pairing='cross';state.peer='claude';},state=>{state.version=3;},state=>{delete state.pairing;},state=>{state.peer='claude';}];
  for(const change of cases) {
    const f=await fixture('mutated-participants',{pairing:'same',...sameModels('codex')});
    await hostDraft(f);
    const manifest=await read(path.join(f.out,'run.json'));
    change(manifest);
    await write(path.join(f.out,'run.json'),manifest);
    let called=false;
    assert.throws(()=>status({run:f.out}),/Participant|participant|pairing|downgrade/i);
    await assert.rejects(()=>ask({run:f.out,stage:'draft'},async request=>{called=true;return invocation()(request);}),/Participant|participant|pairing|downgrade/i);
    assert.equal(called,false);
    assert.equal((await read(path.join(f.out,'run.json'))).attempts.length,0);
  }
});

test('a true version 3 cross-provider run remains resumable without identity declarations', async () => {
  const f=await fixture('legacy-v3');
  const manifest=await read(path.join(f.out,'run.json'));
  manifest.version=3;
  delete manifest.pairing;
  delete manifest.coordinator_model;
  const snapshotPath=path.join(f.out,'snapshot.json');
  const snapshot=await read(snapshotPath);
  delete snapshot.participants;
  await write(snapshotPath,snapshot);
  manifest.seals['snapshot.json']=createHash('sha256').update(await fs.readFile(snapshotPath)).digest('hex');
  await write(path.join(f.out,'run.json'),manifest);
  await hostDraft(f);
  await ask({run:f.out,stage:'draft'},invocation());
  assert.equal(status({run:f.out}).participants.coordinator_identity,'unknown');
  assert.equal(status({run:f.out}).successful_peer_calls,1);
});

test('prepare CLI accepts explicit same-provider flags and reports requested identity provenance', async () => {
  const f=await inputFixture('same-cli');
  const result=spawnSync(process.execPath,[path.join(packageRoot,'scripts','council.mjs'),'prepare','--project',f.project,'--brief',f.brief,'--assessment',f.assessment,'--coordinator','claude','--pairing','same','--coordinator-model','claude-opus-4-6','--peer-model','claude-sonnet-4-6','--out',f.out],{encoding:'utf8',windowsHide:true,timeout:5000});
  assert.equal(result.status,0,result.stderr);
  const prepared=JSON.parse(result.stdout);
  assert.equal(prepared.peer,'claude');
  assert.equal(prepared.participants.coordinator_identity,'declared');
  assert.equal(prepared.participants.peer_identity,'requested');
  assert.equal(status({run:f.out}).attempts_used,0);
});

test('same-provider responses may resolve the requested family to a canonical dated ID', async () => {
  for(const coordinator of ['codex','claude']) {
    const ids=sameModels(coordinator);
    const reported=ids['peer-model']+(coordinator==='codex'?'-2026-03-17':'-20250929');
    const f=await fixture(`dated-resolution-${coordinator}`,{coordinator,pairing:'same',...ids});
    await hostDraft(f);
    const result=await ask({run:f.out,stage:'draft'},invocationWithModels(report(),[reported]));
    assert.deepEqual(result.reported_peer_models,[reported]);
    const saved=await read(path.join(f.out,'run.json'));
    assert.equal(saved.attempts[0].requested_model,ids['peer-model']);
    assert.deepEqual(saved.attempts[0].reported_models,[reported]);
    assert.equal(saved.attempts[0].model_identity_status,'cli_reported');
    const collision=await fixture(`dated-collision-${coordinator}`,{coordinator,pairing:'same',...ids});
    await hostDraft(collision);
    const coordinatorSnapshot=ids['coordinator-model']+(coordinator==='codex'?'-2026-03-17':'-20250929');
    await assert.rejects(()=>ask({run:collision.out,stage:'draft'},invocationWithModels(report(),[coordinatorSnapshot])),/reported the coordinator model/);
    assert.equal(status({run:collision.out}).successful_peer_calls,0);
  }
});

test('untrusted CLI model metadata remains exact JSON evidence and inert Markdown after finish', async () => {
  const f=await readyForVerify('model-markup',{mode:'review','coordinator-model':'gpt-5.4'});
  const malicious=['<img src="https://example.invalid/pixel.png">','![click](https://example.invalid/pixel.png)','`model`\n# invented heading'];
  await ask({run:f.out,stage:'verify'},invocationWithModels(report(),malicious));
  const result=finish({run:f.out});
  assert.deepEqual(result.peer_model_reports.at(-1).reported,malicious);
  assert.deepEqual((await read(path.join(f.out,'completion.json'))).peer_model_reports.at(-1).reported,malicious);
  for(const name of ['RESULT.md','DISCUSSION.md']) {
    const markdown=await fs.readFile(path.join(f.out,name),'utf8');
    assert.doesNotMatch(markdown,/<img src=|!\[click\]\(https:|\n# invented heading/);
    if(name==='RESULT.md') assert.match(markdown,/&lt;img/);
  }
});

test('an explicitly dated peer model cannot resolve to a different snapshot or undated alias', async () => {
  for(const coordinator of ['codex','claude']) {
    const ids=sameModels(coordinator);
    const requested=ids['peer-model']+(coordinator==='codex'?'-2026-03-17':'-20250929');
    const otherSnapshot=ids['peer-model']+(coordinator==='codex'?'-2026-04-01':'-20251001');
    for(const reported of [requested.toUpperCase(),otherSnapshot,ids['peer-model']]) {
      const f=await fixture(`pinned-snapshot-${coordinator}`,{coordinator,pairing:'same',...ids,'peer-model':requested});
      await hostDraft(f);
      const invocationResult=()=>ask({run:f.out,stage:'draft'},invocationWithModels(report(),[reported]));
      if(reported.toLowerCase()===requested) {
        const result=await invocationResult();
        assert.deepEqual(result.reported_peer_models,[reported]);
        assert.equal(status({run:f.out}).successful_peer_calls,1);
      } else {
        await assert.rejects(invocationResult,/reported unexpected model/);
        assert.equal(status({run:f.out}).successful_peer_calls,0);
        const attempt=(await read(path.join(f.out,'run.json'))).attempts[0];
        assert.equal(attempt.status,'failed');
        assert.equal(attempt.requested_model,requested);
        assert.deepEqual(attempt.reported_models,[reported]);
        await assert.rejects(()=>fs.access(path.join(f.out,'peer-draft.json')));
      }
    }
  }
});
