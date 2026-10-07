// Offline, fixed-output comparison. Does not modify either source tree.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const options={};
for(let i=2;i<process.argv.length;i+=2){
  assert.ok(['--baseline','--candidate','--output','--case'].includes(process.argv[i]),'Unknown argument');
  assert.ok(process.argv[i+1],`Missing value for ${process.argv[i]}`);
  options[process.argv[i].slice(2)]=process.argv[i+1];
}
for(const key of ['baseline','candidate','output'])assert.ok(options[key],`--${key} is required`);
const destination=path.resolve(options.output);
await fs.mkdir(destination); // Require a fresh output directory. Never overwrite prior evidence.
const write=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,typeof value==='string'?value:JSON.stringify(value,null,2));};
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const fixtureSource=await fs.readFile(path.join(here,'fixtures.mjs'),'utf8');
const {scenarioSmall,scenarioLarge,report}=await import('./fixtures.mjs');
const allCases=['unique','duplicate-paths','distinct-same-content'];
assert.ok(options.case===undefined||options.case==='all'||allCases.includes(options.case),'--case must be unique, duplicate-paths, distinct-same-content, or all');
const cases=options.case&&options.case!=='all'?[options.case]:allCases;
const variants=[];
for(const name of ['baseline','candidate']){
  const source=await fs.realpath(path.resolve(options[name]));
  const council=path.join(source,'scripts/council.mjs');
  const sources={};
  for(const file of (await fs.readdir(path.join(source,'scripts'))).filter(file=>file.endsWith('.mjs')).sort())sources[file]=sha(await fs.readFile(path.join(source,'scripts',file)));
  variants.push({name,runner:await import(pathToFileURL(council)),sources,version:(await read(path.join(source,'package.json'))).version});
}
const captures=[],completed=[];
const dataOnly=packet=>{
  const value=structuredClone(packet);
  delete value.run_id;
  for(const key of ['coordinator_identity','peer_identity','author_identity','identity_note'])delete value.participants[key];
  // Only exact duplicate outbound context labels AND content can be normalized.
  const seen=new Set();
  value.shared_context.inputs=value.shared_context.inputs.filter(input=>{
    if(input.kind!=='context')return true;
    const key=JSON.stringify([input.path,input.content]);
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
  return value;
};
for(const scenario of [scenarioSmall,scenarioLarge])for(const route of ['host-cross','worker-author'])for(const caseName of cases){
  const author=route==='worker-author';
  // Fictional canonical IDs exercise routing; these are not model recommendations.
  const prepareExtra=author?{'author-model':scenario.coordinator==='codex'?'gpt-99.1-planner':'claude-opus-99-1','peer-model':scenario.coordinator==='codex'?'gpt-99.0-codex':'gpt-99.1-planner',pairing:scenario.mode==='review'?'same':'cross'}:{};
  const caseRoot=path.join(destination,scenario.name,route,caseName);
  const project=path.join(caseRoot,'inputs/project');
  const inputs=path.dirname(project);
  await write(path.join(inputs,'brief.txt'),scenario.brief);
  await write(path.join(inputs,'assessment.json'),scenario.assessment);
  const context=[];
  for(const [name,content]of Object.entries(scenario.contexts)){
    const file=path.join(project,name);await write(file,content);context.push(file);
  }
  if(caseName==='duplicate-paths'){
    await fs.mkdir(path.join(project,'alias'));
    context.push(context[0],`${project}${path.sep}alias${path.sep}..${path.sep}${path.basename(context[0])}`);
  }else if(caseName==='distinct-same-content'){
    const copy=path.join(project,'independent-source-copy.md');
    await write(copy,await fs.readFile(context[0],'utf8'));context.push(copy);
  }
  for(const variant of variants){
    const run=path.join(caseRoot,variant.name);
    await variant.runner.prepare({...prepareExtra,project,brief:path.join(inputs,'brief.txt'),assessment:path.join(inputs,'assessment.json'),context,coordinator:scenario.coordinator,mode:scenario.mode,out:run});
    const invoke=(stage,fixed)=>async request=>{
      const prompt=request.prompt.replace(/"run_id":"[^"]+"/g,'"run_id":"BENCHMARK_RUN"');
      const packet=JSON.parse(prompt.split('COUNCIL_PACKET_JSON\n')[1]);
      if(stage.endsWith('draft'))for(const field of ['coordinator_proposal','peer_proposal','coordinator_review','peer_review','security_review'])assert.equal(Object.hasOwn(packet,field),false);
      if(stage.endsWith('review'))for(const field of ['coordinator_review','peer_review','security_review'])assert.equal(Object.hasOwn(packet,field),false);
      if(author){
        assert.equal(packet.participants.author_model,prepareExtra['author-model']);
        assert.equal(packet.participants.peer_model,prepareExtra['peer-model']);
        assert.equal(packet.participants.coordinator,scenario.coordinator);
        assert.equal(packet.participants.author_provider,scenario.coordinator);
        assert.equal(packet.participants.pairing,prepareExtra.pairing);
        const expectedProvider=stage.startsWith('author-')?scenario.coordinator:prepareExtra.pairing==='same'?scenario.coordinator:scenario.coordinator==='codex'?'claude':'codex';
        assert.equal(request.provider,expectedProvider);
        assert.equal(request.args[request.args.indexOf('--model')+1],stage.startsWith('author-')?prepareExtra['author-model']:prepareExtra['peer-model']);
      }
      if(stage==='verify')assert.deepEqual(packet.security_review,scenario.security);
      assert.deepEqual(packet.shared_context.project_assessment,scenario.assessment);
      if(caseName==='distinct-same-content')assert.ok(packet.shared_context.inputs.some(input=>input.path==='independent-source-copy.md'));
      const file=path.join(caseRoot,`${variant.name}-${stage}.txt`);
      await write(file,prompt);
      captures.push({scenario:scenario.name,route,case:caseName,variant:variant.name,stage,file:path.relative(destination,file).split(path.sep).join('/'),packet,bytes:Buffer.byteLength(prompt),sha256:sha(prompt)});
      return {code:0,stderr:'',stdout:request.provider==='claude'
        ?JSON.stringify({type:'result',subtype:'success',is_error:false,structured_output:fixed,result:JSON.stringify(fixed),session_id:'offline-fixture'})
        :[{type:'thread.started',thread_id:'offline-fixture'},{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(fixed)}},{type:'turn.completed'}].map(item=>JSON.stringify(item)).join('\n')};
    };
    if(author)await variant.runner.ask({run,stage:'author-draft'},invoke('author-draft',scenario.draft));
    else await write(path.join(run,'coordinator-draft.json'),scenario.draft);
    if(scenario.mode==='plan')await variant.runner.ask({run,stage:'draft'},invoke('draft',scenario.peerDraft));
    if(author&&scenario.mode==='plan')await variant.runner.ask({run,stage:'author-review'},invoke('author-review',scenario.review));
    else await write(path.join(run,'coordinator-review.json'),scenario.review);
    await variant.runner.ask({run,stage:'review'},invoke('review',scenario.peerReview));
    await write(path.join(run,'security-review.json'),scenario.security);
    await write(path.join(run,'final-plan.md'),scenario.final);
    const reports=[scenario.draft,scenario.review,scenario.peerReview,scenario.security,...(scenario.mode==='plan'?[scenario.peerDraft]:[])];
    await write(path.join(run,'decisions.json'),reports.flatMap(item=>item.findings.map(finding=>({finding_id:finding.id,disposition:finding.id==='C-S2'?'unresolved':'accepted',rationale:finding.id==='C-S2'?'The roadmap blocks persistent leads until the owner approves retention and a named policy owner; the user decision remains open.':`Final plan includes the correction and proposed acceptance gate: ${finding.action}`}))));
    const verification=report('The fixture preserves requirements, material corrections and policy gates.','',[],{verdict:scenario.mode==='plan'?'insufficient_context':'ready',open_questions:scenario.mode==='plan'?['Lead retention approval remains a required user decision.']:[]});
    await variant.runner.ask({run,stage:'verify'},invoke('verify',verification));
    await variant.runner.finish({run});
    const completion=await read(path.join(run,'completion.json'));
    const calls=completion.successful_worker_calls??completion.successful_peer_calls;
    assert.equal(calls,author?scenario.mode==='plan'?5:3:scenario.mode==='plan'?3:2);
    assert.equal(completion.successful_peer_calls,scenario.mode==='plan'?3:2);
    assert.equal(completion.attempts_used,calls);
    assert.equal(completion.security_review.required,true);
    assert.equal(completion.unresolved.length,scenario.mode==='plan'?1:0);
    assert.equal(completion.changedSinceVerification,false);
    completed.push({scenario:scenario.name,route,case:caseName,variant:variant.name,calls,unresolved:completion.unresolved.map(item=>item.finding_id),final_plan_sha256:sha(await fs.readFile(path.join(run,'final-plan.md'))),decisions_sha256:sha(await fs.readFile(path.join(run,'decisions.json')))});
  }
}
for(const original of captures.filter(item=>item.variant==='baseline')){
  const next=captures.find(item=>item.variant==='candidate'&&item.scenario===original.scenario&&item.route===original.route&&item.case===original.case&&item.stage===original.stage);
  assert.deepEqual(dataOnly(next.packet),dataOnly(original.packet),`Exact task-data preservation: ${original.scenario}/${original.route}/${original.case}/${original.stage}`);
}
for(const original of completed.filter(item=>item.variant==='baseline')){
  const next=completed.find(item=>item.variant==='candidate'&&item.scenario===original.scenario&&item.route===original.route&&item.case===original.case);
  for(const key of ['calls','unresolved','final_plan_sha256','decisions_sha256'])assert.deepEqual(next[key],original[key]);
}
const metrics={provider_calls:0,fixture_source_sha256:sha(fixtureSource),harness_sha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),variants:variants.map(({runner,...metadata})=>metadata),method:'Matching complete injected workflows. Only random run_id normalized in measured prompts. Equivalence whitelists transport run/derived-identity metadata and repeated context with identical source label/content; all task evidence and applicable reports remain exact. Host and worker-author routes are measured separately; their different call totals must not be compared as token savings. No model quality, cache-hit, billed-token, output-token or real latency claim.',captures:captures.map(({packet,...item})=>item),completed};
await write(path.join(destination,'metrics.json'),metrics);
console.log(JSON.stringify({output:destination,workflows:completed.length,captured_prompts:captures.length,provider_calls:0}));
