#!/usr/bin/env node
// Offline collection/scoring only: never starts a model or reads credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const checkout = path.dirname(here);
export const ARMS = ['solo', 'independent-review', 'independent-synthesis', 'c2c', 'external'];
export const TASKS = ['feature', 'production', 'bilingual', 'mixed-upload', 'shared-premise', 'sound-plan', 'revision-dependency'];
const LEGACY_TASKS = ['feature', 'production'];
const GROUPS = ['requirements', 'risks', 'implementability'];
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const readJSON = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const writeJSON = (file, value) => fs.writeFile(file, json(value), { flag: 'wx' });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const canonical = value => JSON.stringify(value, (_, item) => item && !Array.isArray(item) && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const modelKey = value => `${value.provider}:${value.model}`;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const inside = (parent, child) => { const rel = path.relative(parent, child); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
const frozenBaseline = await readJSON(path.join(here, 'baselines', 'c2c-2.2.0.capture.json'));

export async function validateCaptureManifest(capture) {
  assert(capture?.format_version === 1 && capture.status === 'capture-required' && capture.suite_version === 'c2c-outcomes-v2', 'Malformed baseline capture format/status.');
  assert(nonempty(capture.capture_id) && nonempty(capture.tool_version) && /^[a-f0-9]{40}$/.test(capture.source_revision), 'Malformed baseline capture identity.');
  assert(canonical(capture.tasks) === canonical(TASKS) && Array.isArray(capture.outcomes) && capture.outcomes.length === 0, 'Baseline template must list the frozen suite and contain no claimed outcomes.');
  const instructions = ['SKILL.md', 'references/protocol.md', 'references/model-selection.md', 'references/project-assessment.md', 'references/plan-presentation.md'];
  assert(canonical(Object.keys(capture.instruction_sha256 ?? {}).sort()) === canonical(instructions.sort()) && Object.values(capture.instruction_sha256).every(value => /^[a-f0-9]{64}$/.test(value)), 'Malformed baseline instruction hashes.');
  const expected = [];
  for (const task of TASKS) {
    const base = path.join(here, 'tasks', task);
    expected.push(`evals/tasks/${task}/task.md`, `evals/tasks/${task}/rubric.json`);
    for (const name of await fs.readdir(path.join(base, 'repo'))) expected.push(`evals/tasks/${task}/repo/${name}`);
  }
  assert(canonical(Object.keys(capture.suite_sha256 ?? {}).sort()) === canonical(expected.sort()), 'Baseline suite file inventory changed.');
  for (const name of expected) assert(hash(await fs.readFile(path.join(checkout, name))) === capture.suite_sha256[name], `Baseline suite evidence changed: ${name}. Create a new version; never overwrite the frozen capture.`);
  return capture;
}

async function newPrivateDirectory(directory) {
  const resolved = path.resolve(directory);
  assert(!inside(checkout, resolved), 'Keep raw outcomes outside the source checkout.');
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  const parent = await fs.realpath(path.dirname(resolved));
  assert(!inside(await fs.realpath(checkout), parent), 'Output parent resolves inside the source checkout.');
  await fs.mkdir(resolved); // Never overwrite previous evidence.
  return resolved;
}

async function sourceTask(task) {
  assert(TASKS.includes(task), `Task must be one of ${TASKS.join(', ')}.`);
  const base = path.join(here, 'tasks', task);
  const files = { 'task.md': await fs.readFile(path.join(base, 'task.md'), 'utf8') };
  for (const name of (await fs.readdir(path.join(base, 'repo'))).sort()) {
    files[`repo/${name}`] = await fs.readFile(path.join(base, 'repo', name), 'utf8');
  }
  const rubric = await readJSON(path.join(base, 'rubric.json'));
  if (!LEGACY_TASKS.includes(task)) for (const group of GROUPS) for (const item of rubric[group]) {
    assert(Array.isArray(item.evidence) && item.evidence.length > 0, 'Expanded rubric criteria need raw evidence.');
    for (const ref of item.evidence) assert(nonempty(ref.quote) && files[ref.path]?.includes(ref.quote), `Rubric evidence does not match ${task}/${item.id}.`);
  }
  return { files, rubric };
}

export function validateBaseline(baseline, arms) {
  assert(baseline && typeof baseline === 'object' && !Array.isArray(baseline), 'Baseline must be an object.');
  assert(arms.includes(baseline.arm) && arms.includes(baseline.candidate_arm) && baseline.arm !== baseline.candidate_arm, 'Baseline and candidate must be different preregistered arms.');
  assert(nonempty(baseline.capture_id) && nonempty(baseline.tool_version) && /^[a-f0-9]{40}$/.test(baseline.source_revision), 'Baseline requires capture_id, exact tool_version and full source_revision.');
  assert(Object.keys(baseline).sort().join(',') === 'arm,candidate_arm,capture_id,source_revision,tool_version', 'Unknown baseline fields.');
  assert(baseline.capture_id === frozenBaseline.capture_id && baseline.tool_version === frozenBaseline.tool_version && baseline.source_revision === frozenBaseline.source_revision, 'Baseline does not match the frozen capture manifest.');
  return baseline;
}

function validateConfig(config) {
  const arms = config.arms ?? ['solo', 'independent-review', 'c2c'];
  assert(Array.isArray(arms) && arms.length >= 2 && new Set(arms).size === arms.length && arms.every(arm => ARMS.includes(arm)), 'Select at least two distinct supported arms. The external arm is opt-in.');
  assert(Array.isArray(config.available_models) && config.available_models.length > 0, 'Declare the same available model pool for every arm.');
  for (const model of config.available_models) assert(nonempty(model.provider) && nonempty(model.model), 'Exact provider/model IDs are required.');
  const keys = config.available_models.map(modelKey);
  assert(new Set(keys).size === keys.length, 'Duplicate available model.');
  assert(config.limits && count(config.limits.max_calls) && config.limits.max_calls > 0 && count(config.limits.max_seconds) && config.limits.max_seconds > 0, 'Declare positive whole-task call/time limits.');
  for (const key of ['max_input_tokens', 'max_output_tokens']) assert(config.limits[key] === null || count(config.limits[key]), `${key} must be an integer or null (no declared token cap).`);
  const legacy = config.protocol === 'c2c-outcomes-v1';
  assert(config.protocol === undefined || legacy || config.protocol === 'c2c-outcomes-v2', 'Unknown outcome protocol.');
  const tasks = config.tasks ?? (legacy ? LEGACY_TASKS : TASKS);
  assert(Array.isArray(tasks) && tasks.length > 0 && new Set(tasks).size === tasks.length && tasks.every(task => TASKS.includes(task)), 'Select distinct supported tasks.');
  if (legacy) assert(config.baseline === undefined && !config.controls && !arms.includes('independent-synthesis') && canonical(tasks) === canonical(LEGACY_TASKS), 'Legacy protocol cannot include new controls, arms or tasks.');
  if (config.baseline !== undefined) validateBaseline(config.baseline, arms);
  if (config.controls) for (const key of ['tools', 'research_inputs', 'settings', 'role_policy']) assert(nonempty(config.controls[key]), `Preregister control: ${key}.`);
  return {
    arms: ARMS.filter(arm => arms.includes(arm)),
    available_models: config.available_models.map(({ provider, model }) => ({ provider, model })).sort((a, b) => modelKey(a).localeCompare(modelKey(b))),
    limits: config.limits,
    protocol: legacy ? 'c2c-outcomes-v1' : 'c2c-outcomes-v2',
    ...(!legacy ? { tasks: TASKS.filter(task => tasks.includes(task)), ...(config.baseline ? { baseline: config.baseline } : {}), ...(config.controls ? { controls: config.controls } : {}) } : {}),
  };
}

export async function packet(task, config, directory) {
  const protocol = validateConfig(config);
  if (protocol.baseline) await validateCaptureManifest(frozenBaseline);
  assert((protocol.tasks ?? LEGACY_TASKS).includes(task), 'Task was not preregistered for this comparison.');
  const { files, rubric } = await sourceTask(task);
  const manifest = { version: 1, task, task_hash: hash(canonical(files)), rubric_hash: hash(canonical(rubric)), protocol, protocol_hash: hash(canonical(protocol)) };
  const out = await newPrivateDirectory(directory);
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(out, name)), { recursive: true });
    await fs.writeFile(path.join(out, name), content, { flag: 'wx' });
  }
  await writeJSON(path.join(out, 'manifest.json'), manifest);
  return manifest;
}

function validateMetadata(meta, protocol) {
  assert(ARMS.includes(meta.arm), `arm must be one of ${ARMS.join(', ')}.`);
  assert(protocol.arms.includes(meta.arm), 'Outcome arm was not preregistered for this comparison.');
  assert(['live', 'native-evaluation', 'synthetic'].includes(meta.provenance), 'Declare provenance: live, native-evaluation, or synthetic.');
  assert(nonempty(meta.tool_version) && nonempty(meta.execution_notes) && nonempty(meta.completed_at) && Number.isFinite(Date.parse(meta.completed_at)), 'tool_version, execution_notes and an ISO completed_at are required.');
  if (protocol.baseline && [protocol.baseline.arm, protocol.baseline.candidate_arm].includes(meta.arm)) assert(/^[a-f0-9]{40}$/.test(meta.source_revision), 'Baseline comparisons require each implementation source_revision.');
  if (protocol.baseline && meta.arm === protocol.baseline.arm) assert(meta.tool_version === protocol.baseline.tool_version && meta.source_revision === protocol.baseline.source_revision && meta.capture_id === protocol.baseline.capture_id, 'Baseline metadata must match the frozen capture ID, tool version and source revision.');
  assert(Array.isArray(meta.models) && meta.models.length > 0, 'Record every actual model and role, including the host.');
  for (const model of meta.models) {
    assert(nonempty(model.provider) && nonempty(model.model) && nonempty(model.role), 'Actual provider, exact model ID and role are required.');
    assert(protocol.available_models.some(allowed => modelKey(allowed) === modelKey(model)), 'Actual model is outside the preregistered available pool.');
  }
  assert(meta.elapsed_seconds === null || (Number.isFinite(meta.elapsed_seconds) && meta.elapsed_seconds >= 0), 'elapsed_seconds must be a nonnegative number or null.');
  assert(meta.calls === null || count(meta.calls), 'calls must include all host/worker/research/retry calls, or be null.');
  assert(meta.usage && ['input_tokens', 'output_tokens'].every(key => meta.usage[key] === null || count(meta.usage[key])), 'Token counts must be integers or null, never estimates disguised as actuals.');
  if (meta.elapsed_seconds === null || meta.calls === null || meta.usage.input_tokens === null || meta.usage.output_tokens === null) assert(nonempty(meta.unavailable_reason), 'Explain unavailable measurements.');
  assert(meta.usage.scope === 'whole-task', 'Usage scope must include host, workers, research and retries for the whole task. Use null if unavailable.');
}

export async function importOutcome(packetDirectory, plan, metadata, directory) {
  assert(nonempty(plan), 'Plan must contain actual output.');
  const manifest = await readJSON(path.join(packetDirectory, 'manifest.json'));
  const { files, rubric } = await sourceTask(manifest.task);
  assert((manifest.protocol.tasks ?? LEGACY_TASKS).includes(manifest.task), 'Task was not preregistered for this comparison.');
  assert(manifest.version === 1 && hash(canonical(rubric)) === manifest.rubric_hash, 'Task rubric changed; use the frozen task revision.');
  const observed = {};
  for (const name of Object.keys(files)) observed[name] = await fs.readFile(path.join(packetDirectory, name), 'utf8');
  assert(hash(canonical(observed)) === manifest.task_hash && hash(canonical(files)) === manifest.task_hash, 'Task evidence changed after preregistration.');
  assert(hash(canonical(validateConfig(manifest.protocol))) === manifest.protocol_hash, 'Protocol changed after preregistration.');
  validateMetadata(metadata, manifest.protocol);
  const out = await newPrivateDirectory(directory);
  await fs.writeFile(path.join(out, 'plan.md'), plan, { flag: 'wx' });
  await writeJSON(path.join(out, 'rubric.json'), rubric);
  await writeJSON(path.join(out, 'task-files.json'), files);
  const record = { ...manifest, metadata, plan_hash: hash(plan) };
  await writeJSON(path.join(out, 'outcome.json'), record);
  return record;
}

async function readOutcome(directory) {
  const record = await readJSON(path.join(directory, 'outcome.json'));
  const plan = await fs.readFile(path.join(directory, 'plan.md'), 'utf8');
  const rubric = await readJSON(path.join(directory, 'rubric.json'));
  const files = await readJSON(path.join(directory, 'task-files.json'));
  assert(hash(plan) === record.plan_hash && hash(canonical(files)) === record.task_hash && hash(canonical(rubric)) === record.rubric_hash, 'Outcome evidence was modified.');
  assert(hash(canonical(validateConfig(record.protocol))) === record.protocol_hash, 'Outcome protocol was modified.');
  assert((record.protocol.tasks ?? LEGACY_TASKS).includes(record.task), 'Outcome task was not preregistered.');
  validateMetadata(record.metadata, record.protocol);
  return { record, plan, rubric, files };
}

export async function blind(directories, directory) {
  assert(directories.length > 0, 'Provide at least one imported outcome directory.');
  const items = await Promise.all(directories.map(async dir => ({ directory: path.resolve(dir), ...(await readOutcome(dir)) })));
  const cells = items.map(item => `${item.record.task}:${item.record.metadata.arm}`);
  assert(new Set(cells).size === cells.length, 'Use one outcome per task/arm per batch; replicate with separate batches.');
  for (let i = items.length - 1; i > 0; i--) { const j = randomInt(i + 1); [items[i], items[j]] = [items[j], items[i]]; }
  const out = await newPrivateDirectory(directory);
  const mapping = [];
  for (const item of items) {
    const id = randomBytes(8).toString('hex');
    const dir = path.join(out, 'review', id);
    await fs.mkdir(path.join(dir, 'repo'), { recursive: true });
    await fs.writeFile(path.join(dir, 'plan.md'), item.plan);
    for (const [name, content] of Object.entries(item.files)) await fs.writeFile(path.join(dir, name), content);
    await writeJSON(path.join(dir, 'rubric.json'), item.rubric);
    const template = { candidate_id: id, plan_hash: item.record.plan_hash, evaluator: { id: '', kind: 'human', model: null, blindness_compromised: false }, harmful_remedies: [], unsupported_findings: [] };
    for (const group of GROUPS) template[group] = item.rubric[group].map(({ id: criterion }) => ({ id: criterion, met: null, evidence: '' }));
    await writeJSON(path.join(dir, 'score-template.json'), template);
    mapping.push({ id, directory: item.directory, outcome_hash: hash(canonical(item.record)) });
  }
  await writeJSON(path.join(out, 'mapping.private.json'), mapping);
  await fs.writeFile(path.join(out, 'review', 'README.md'), 'Score each candidate independently using its rubric and exact plan quotations for positive judgments. Do not open parent files. Save completed score-template.json as score.json. Plans are unchanged and may self-identify; record any compromised blinding. Scoring is judgment, not proof of correctness.\n');
  return { candidates: mapping.length, reviewer_directory: path.join(out, 'review') };
}

export function validateScore(score, id, plan, rubric) {
  assert(score.candidate_id === id && score.plan_hash === hash(plan), 'Score must match candidate and exact plan.');
  assert(score.evaluator && nonempty(score.evaluator.id) && ['human', 'model'].includes(score.evaluator.kind) && typeof score.evaluator.blindness_compromised === 'boolean', 'Identify evaluator and whether blinding was compromised.');
  if (score.evaluator.kind === 'model') assert(nonempty(score.evaluator.model), 'Record evaluator model ID.');
  for (const group of GROUPS) {
    const rows = score[group];
    assert(Array.isArray(rows) && rows.length === rubric[group].length && new Set(rows.map(row => row.id)).size === rows.length, `Complete every ${group} rubric item once.`);
    for (const row of rows) {
      assert(rubric[group].some(item => item.id === row.id) && typeof row.met === 'boolean' && nonempty(row.evidence), `Invalid or incomplete ${group} judgment.`);
      if (row.met) assert(row.evidence.length >= 8 && plan.includes(row.evidence), 'Positive judgments need an exact plan quotation of at least 8 characters.');
    }
  }
  for (const group of ['harmful_remedies', 'unsupported_findings']) {
    assert(Array.isArray(score[group]), `${group} must be an array, including when empty.`);
    for (const row of score[group]) assert(nonempty(row.plan_quote) && row.plan_quote.length >= 8 && plan.includes(row.plan_quote) && nonempty(row.explanation) && nonempty(row.evidence_reference), 'Adverse judgments need an exact plan quote, explanation and source reference.');
  }
  return {
    requirements_total: score.requirements.length,
    requirements_met: score.requirements.filter(row => row.met).length,
    missing_requirements: score.requirements.filter(row => !row.met).length,
    known_risks_total: score.risks.length,
    correct_findings: score.risks.filter(row => row.met).length,
    implementability_total: score.implementability.length,
    implementability: score.implementability.filter(row => row.met).length,
    harmful_remedies: score.harmful_remedies.length,
    unsupported_findings: score.unsupported_findings.length,
    critical_failures: GROUPS.reduce((total, group) => total + score[group].filter(row => !row.met && rubric[group].find(item => item.id === row.id)?.critical === true).length, 0),
  };
}

export async function report(directory) {
  const mapping = await readJSON(path.join(directory, 'mapping.private.json'));
  assert(Array.isArray(mapping) && mapping.length > 0, 'No imported outcomes to compare.');
  const rows = [], limitations = [], efficiencyLimitations = [];
  for (const entry of mapping) {
    const { record, plan, rubric, files } = await readOutcome(entry.directory);
    assert(hash(canonical(record)) === entry.outcome_hash, 'Imported metadata changed after blinding.');
    const reviewerPlan = await fs.readFile(path.join(directory, 'review', entry.id, 'plan.md'), 'utf8');
    const reviewerRubric = await readJSON(path.join(directory, 'review', entry.id, 'rubric.json'));
    assert(hash(reviewerPlan) === record.plan_hash && hash(canonical(reviewerRubric)) === record.rubric_hash, 'Reviewer evidence changed after blinding.');
    for (const [name, content] of Object.entries(files)) assert(await fs.readFile(path.join(directory, 'review', entry.id, name), 'utf8') === content, 'Reviewer task evidence changed after blinding.');
    let score;
    try { score = await readJSON(path.join(directory, 'review', entry.id, 'score.json')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const metrics = score ? validateScore(score, entry.id, plan, rubric) : null;
    const meta = record.metadata;
    if (!score) limitations.push(`Missing score: ${record.task}/${meta.arm}.`);
    if (meta.provenance === 'synthetic') limitations.push(`Synthetic output: ${record.task}/${meta.arm}; not outcome evidence.`);
    if (score?.evaluator.blindness_compromised) limitations.push(`Blinding compromised: ${record.task}/${meta.arm}.`);
    if (meta.elapsed_seconds === null || meta.calls === null) limitations.push(`Cannot establish call/time allowance: ${record.task}/${meta.arm}.`);
    if (meta.elapsed_seconds > record.protocol.limits.max_seconds || meta.calls > record.protocol.limits.max_calls) limitations.push(`Call/time allowance exceeded: ${record.task}/${meta.arm}.`);
    for (const key of ['input_tokens', 'output_tokens']) {
      const cap = record.protocol.limits[`max_${key}`];
      if (meta.usage[key] === null) efficiencyLimitations.push(`Unknown whole-task ${key}${cap === null ? '' : '; token allowance cannot be verified'}: ${record.task}/${meta.arm}.`);
      else if (cap !== null && meta.usage[key] > cap) limitations.push(`Token allowance exceeded: ${record.task}/${meta.arm}/${key}.`);
    }
    const judgments = score ? Object.fromEntries(GROUPS.map(group => [group, score[group].map(({ id, met }) => ({ id, met }))])) : null;
    rows.push({ task: record.task, arm: meta.arm, task_hash: record.task_hash, rubric_hash: record.rubric_hash, protocol_hash: record.protocol_hash, protocol: record.protocol, metrics, judgments, metadata: meta, evaluator: score?.evaluator ?? null });
  }
  assert(new Set(rows.map(row => `${row.task}:${row.arm}`)).size === rows.length, 'Duplicate task/arm in report mapping.');
  for (const task of rows[0].protocol.tasks ?? LEGACY_TASKS) {
    const taskRows = rows.filter(row => row.task === task);
    for (const arm of rows[0]?.protocol.arms ?? []) if (!taskRows.some(row => row.arm === arm)) limitations.push(`Missing task/arm: ${task}/${arm}.`);
    for (const key of ['task_hash', 'rubric_hash', 'protocol_hash']) if (new Set(taskRows.map(row => row[key])).size > 1) limitations.push(`Unmatched ${key}: ${task}.`);
  }
  if (new Set(rows.map(row => row.protocol_hash)).size > 1) limitations.push('Selected arms, available model pool or whole-task allowances differ across the batch.');
  const evaluators = rows.filter(row => row.evaluator).map(row => canonical({ id: row.evaluator.id, kind: row.evaluator.kind, model: row.evaluator.model }));
  if (new Set(evaluators).size > 1) limitations.push('Evaluator configuration differs; independent replications need separate batches.');
  const usageComplete = rows.length > 0 && rows.every(row => row.metadata.usage.input_tokens !== null && row.metadata.usage.output_tokens !== null);
  const qualityEligible = limitations.length === 0;
  const efficiencyEligible = qualityEligible && usageComplete;
  const baseline = rows[0].protocol.baseline;
  const promotionBlockers = [];
  if (!baseline) promotionBlockers.push('No baseline and candidate pair was preregistered.');
  if (baseline && canonical(rows[0].protocol.tasks) !== canonical(frozenBaseline.tasks)) promotionBlockers.push('Promotion requires the complete frozen baseline suite; selected subsets remain descriptive.');
  if (!rows[0].protocol.controls) promotionBlockers.push('Tools, research inputs, settings and role policy were not preregistered.');
  if (!qualityEligible) promotionBlockers.push('Matched quality evidence is incomplete or invalid.');
  if (baseline && qualityEligible) for (const task of rows[0].protocol.tasks ?? LEGACY_TASKS) {
    const previous = rows.find(row => row.task === task && row.arm === baseline.arm);
    const candidate = rows.find(row => row.task === task && row.arm === baseline.candidate_arm);
    if (candidate.metrics.critical_failures > 0) promotionBlockers.push(`Critical failure in candidate: ${task}.`);
    for (const group of GROUPS) for (const criterion of previous.judgments[group]) {
      if (criterion.met && !candidate.judgments[group].find(item => item.id === criterion.id)?.met) promotionBlockers.push(`Quality regression: ${task}/${criterion.id}.`);
    }
    for (const key of ['harmful_remedies', 'unsupported_findings']) if (candidate.metrics[key] > previous.metrics[key]) promotionBlockers.push(`Increased ${key}: ${task}.`);
  }
  return {
    status: qualityEligible ? 'descriptive-matched-observations' : 'insufficient-matched-evidence',
    superiority_claim_supported: false,
    quality_comparison_available: qualityEligible,
    efficiency_comparison_available: efficiencyEligible,
    quality_limitations: [...new Set(limitations)],
    efficiency_limitations: [...new Set([...limitations, ...efficiencyLimitations])],
    limitations: [...new Set([...limitations, ...efficiencyLimitations])],
    promotion: {
      baseline: baseline ?? null,
      quality_gate_passed: promotionBlockers.length === 0,
      resource_gate_passed: efficiencyEligible,
      eligible_for_followup: promotionBlockers.length === 0 && efficiencyEligible,
      release_or_gain_claim_supported: false,
      blockers: [...new Set([...promotionBlockers, ...(!efficiencyEligible ? ['Resource evidence is incomplete or invalid; no efficiency or budget promotion.'] : [])])],
      interpretation: 'A passed gate supports only a follow-up evaluation of this preregistered suite. It is not release approval, equivalence, an efficiency benefit, or statistical evidence of superiority.',
    },
    interpretation: 'No general superiority, equal-quality, or token-saving claim follows from this small convenience sample. Metrics are evaluator judgments; metadata is supplied, not provider-attested. Compare paired task results only. Role/model use may differ within the same preregistered available pool. Unknown usage is not zero. Repeat with independent evaluators, more tasks and implementation outcomes before generalizing.',
    rows,
  };
}

async function main(argv) {
  const [command, ...rest] = argv;
  const options = {};
  assert(rest.length % 2 === 0, 'Arguments must be --name value pairs.');
  for (let i = 0; i < rest.length; i += 2) { assert(rest[i].startsWith('--') && !(rest[i].slice(2) in options), 'Invalid or duplicate argument.'); options[rest[i].slice(2)] = rest[i + 1]; }
  const required = { packet: ['task', 'config', 'out'], import: ['packet', 'plan', 'meta', 'out'], blind: ['runs', 'out'], report: ['batch'] }[command];
  if (required) assert(required.every(key => nonempty(options[key])) && Object.keys(options).every(key => required.includes(key)), `Expected arguments: ${required.map(key => `--${key}`).join(', ')}.`);
  let result;
  if (command === 'packet') result = await packet(options.task, await readJSON(options.config), options.out);
  else if (command === 'import') result = await importOutcome(options.packet, await fs.readFile(options.plan, 'utf8'), await readJSON(options.meta), options.out);
  else if (command === 'blind') result = await blind(await readJSON(options.runs), options.out);
  else if (command === 'report') result = await report(options.batch);
  else throw new Error(`Usage: packet --task ${TASKS.join('|')} --config FILE --out DIR; import --packet DIR --plan FILE --meta FILE --out DIR; blind --runs JSON_FILE --out DIR; report --batch DIR`);
  process.stdout.write(json(result));
}

// Resolve both sides so junction/symlink invocation does not silently skip main.
if (process.argv[1] && pathToFileURL(await fs.realpath(process.argv[1])).href === pathToFileURL(await fs.realpath(fileURLToPath(import.meta.url))).href) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
