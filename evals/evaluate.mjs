#!/usr/bin/env node
// Offline collection/scoring only: never starts a model or reads credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const checkout = path.dirname(here);
export const ARMS = ['solo', 'independent-review', 'c2c', 'external'];
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
  assert(['feature', 'production'].includes(task), 'Task must be feature or production.');
  const base = path.join(here, 'tasks', task);
  const files = { 'task.md': await fs.readFile(path.join(base, 'task.md'), 'utf8') };
  for (const name of (await fs.readdir(path.join(base, 'repo'))).sort()) {
    files[`repo/${name}`] = await fs.readFile(path.join(base, 'repo', name), 'utf8');
  }
  return { files, rubric: await readJSON(path.join(base, 'rubric.json')) };
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
  return {
    arms: ARMS.filter(arm => arms.includes(arm)),
    available_models: config.available_models.map(({ provider, model }) => ({ provider, model })).sort((a, b) => modelKey(a).localeCompare(modelKey(b))),
    limits: config.limits,
    protocol: 'c2c-outcomes-v1',
  };
}

export async function packet(task, config, directory) {
  const protocol = validateConfig(config);
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
  };
}

export async function report(directory) {
  const mapping = await readJSON(path.join(directory, 'mapping.private.json'));
  assert(Array.isArray(mapping) && mapping.length > 0, 'No imported outcomes to compare.');
  const rows = [], limitations = [];
  for (const entry of mapping) {
    const { record, plan, rubric } = await readOutcome(entry.directory);
    assert(hash(canonical(record)) === entry.outcome_hash, 'Imported metadata changed after blinding.');
    const reviewerPlan = await fs.readFile(path.join(directory, 'review', entry.id, 'plan.md'), 'utf8');
    const reviewerRubric = await readJSON(path.join(directory, 'review', entry.id, 'rubric.json'));
    assert(hash(reviewerPlan) === record.plan_hash && hash(canonical(reviewerRubric)) === record.rubric_hash, 'Reviewer evidence changed after blinding.');
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
      if (cap !== null && (meta.usage[key] === null || meta.usage[key] > cap)) limitations.push(`Token allowance exceeded or unknown: ${record.task}/${meta.arm}/${key}.`);
    }
    rows.push({ task: record.task, arm: meta.arm, task_hash: record.task_hash, rubric_hash: record.rubric_hash, protocol_hash: record.protocol_hash, protocol: record.protocol, metrics, metadata: meta, evaluator: score?.evaluator ?? null });
  }
  for (const task of ['feature', 'production']) {
    const taskRows = rows.filter(row => row.task === task);
    for (const arm of rows[0]?.protocol.arms ?? []) if (!taskRows.some(row => row.arm === arm)) limitations.push(`Missing task/arm: ${task}/${arm}.`);
    for (const key of ['task_hash', 'rubric_hash', 'protocol_hash']) if (new Set(taskRows.map(row => row[key])).size > 1) limitations.push(`Unmatched ${key}: ${task}.`);
  }
  if (new Set(rows.map(row => row.protocol_hash)).size > 1) limitations.push('Selected arms, available model pool or whole-task allowances differ across the batch.');
  const evaluators = rows.filter(row => row.evaluator).map(row => canonical({ id: row.evaluator.id, kind: row.evaluator.kind, model: row.evaluator.model }));
  if (new Set(evaluators).size > 1) limitations.push('Evaluator configuration differs; independent replications need separate batches.');
  const usageComplete = rows.length > 0 && rows.every(row => row.metadata.usage.input_tokens !== null && row.metadata.usage.output_tokens !== null);
  return {
    status: limitations.length ? 'insufficient-matched-evidence' : 'descriptive-matched-observations',
    superiority_claim_supported: false,
    efficiency_comparison_available: limitations.length === 0 && usageComplete,
    limitations: [...new Set(limitations)],
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
  else throw new Error('Usage: packet --task feature|production --config FILE --out DIR; import --packet DIR --plan FILE --meta FILE --out DIR; blind --runs JSON_FILE --out DIR; report --batch DIR');
  process.stdout.write(json(result));
}

// Resolve both sides so junction/symlink invocation does not silently skip main.
if (process.argv[1] && pathToFileURL(await fs.realpath(process.argv[1])).href === pathToFileURL(await fs.realpath(fileURLToPath(import.meta.url))).href) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
