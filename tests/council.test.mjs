import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import {
  prepare, ask, finish, status, discussion, validateReport, parsePeerResponse,
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
  assert.equal(manifest.version,3);
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
  const f = await fixture('failures');
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
  const f = await fixture('attempt-budget',{'max-attempts':'1'});
  await hostDraft(f);
  await assert.rejects(async()=>ask({run:f.out,stage:'draft'},async()=>{throw new Error('Simulated peer deadline exceeded');}));
  const state = await read(path.join(f.out,'run.json'));
  assert.equal(state.attempts.length,1);
  assert.equal(state.attempts[0].status,'failed');
  assert.ok(state.attempts[0].error.includes('deadline'));
  assert.equal((await status({run:f.out})).attempts_remaining,0);
  let invoked=false;
  await assert.rejects(async()=>ask({run:f.out,stage:'draft'},async req=>{invoked=true;return invocation()(req);}));
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
const installFiles=['SKILL.md','agents/openai.yaml','references/protocol.md','references/project-assessment.md','scripts/council.mjs','scripts/process.mjs','scripts/assessment.mjs','scripts/adapters.mjs','scripts/state.mjs','scripts/discussion.mjs','package.json','LICENSE'];
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
