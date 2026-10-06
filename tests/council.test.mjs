import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  prepare, ask, finish, status, validateReport, parsePeerResponse,
  buildPeerArgs, REPORT_SCHEMA, runProcess,
} from '../scripts/council.mjs';

const tempParent = await fs.realpath(os.tmpdir());
const testRoot = await fs.mkdtemp(path.join(tempParent, 'council-test-'));
after(async () => {
  const resolved = await fs.realpath(testRoot);
  assert.equal(path.dirname(resolved), tempParent, 'Refusing cleanup outside the test temporary directory');
  assert.ok(path.basename(resolved).startsWith('council-test-'));
  await fs.rm(resolved, { recursive: true, force: true });
});
const write = (p, value) => fs.writeFile(p, typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8');
const read = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
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
async function fixture(label, extra = {}) {
  const root = await fs.mkdtemp(path.join(testRoot, `${label}-`));
  const project = path.join(root, 'project');
  const out = path.join(root, 'run');
  await fs.mkdir(project);
  const brief = path.join(root, 'brief.txt');
  const context = path.join(project, 'context.txt');
  await write(brief, 'Build a reliable export feature. Success: escaped fields and reproducible ordering.');
  await write(context, 'INPUT_CONTEXT_TOKEN: existing exporter has no dependency on the database.');
  await prepare({project,brief,context:[context],coordinator:'codex',mode:'plan',out,...extra});
  return {root,project,out,brief,context};
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

test('legacy version 1 runs finish without a new security claim', async () => {
  const f=await readyForVerify('legacy-security',{mode:'review'});
  const manifest=await read(path.join(f.out,'run.json'));
  manifest.version=1;
  await write(path.join(f.out,'run.json'),manifest);
  await fs.unlink(path.join(f.out,'security-review.json'));
  await ask({run:f.out,stage:'verify'},invocation());
  const completed=await finish({run:f.out});
  assert.equal(completed.security_review.required,false);
  assert.equal(completed.security_review.verdict,'not_required_by_legacy_run');
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
const installFiles=['SKILL.md','agents/openai.yaml','references/protocol.md','scripts/council.mjs','scripts/process.mjs','LICENSE'];
async function installerFixture(label) {
  const root=await fs.mkdtemp(path.join(testRoot,`install-${label}-`));
  const codexHome=path.join(root,'codex-home');
  const claudeHome=path.join(root,'claude-home');
  return {root,codexHome,claudeHome,
    codexSkill:path.join(codexHome,'skills','codex-claude-council'),
    claudeSkill:path.join(claudeHome,'skills','codex-claude-council'),
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
  await assert.rejects(()=>fs.access(path.join(dest,'tests')));
  const launched=spawnSync(process.execPath,[path.join(dest,'scripts','council.mjs'),'help'],{encoding:'utf8',windowsHide:true,timeout:5000});
  assert.equal(launched.status,0,launched.stderr);
  assert.match(launched.stdout,/Codex-Claude Council/);
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
