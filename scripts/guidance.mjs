// Read only applicable sections of the locally trusted (possibly pinned) skill.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const files = Object.freeze({ protocol: 'references/protocol.md', assessment: 'references/project-assessment.md', models: 'references/model-selection.md', presentation: 'references/plan-presentation.md', qa: 'references/developer-qa.md' });
const topics = Object.freeze({
  start: ['assessment#gather-evidence-without-expanding-scope', 'assessment#choose-an-actionable-direction'],
  assess: ['assessment#distinguish-deployment-from-readiness', 'assessment#json-contract', 'assessment#persist-and-revisit'],
  prepare: ['protocol#planning-depth-and-deliverables', 'protocol#choose-an-available-route', 'protocol#pairing-and-model-identity', 'models#worker-effort', 'protocol#no-paid-limit-recovery', 'protocol#preparation-command', 'protocol#launch-preview-and-local-permissions'],
  models: ['models#research-once-per-task', 'models#filter-before-choosing', 'models#assign-real-roles', 'models#worker-effort', 'models#recommend-models-for-execution'],
  exchange: ['protocol#exchange-sequence', 'protocol#file-contract', 'protocol#report-schema', 'protocol#decision-record', 'protocol#security-and-testing', 'protocol#bounded-evidence-requests'],
  verify: ['protocol#final-revision-check', 'protocol#decision-record', 'presentation#check-before-delivery'],
  same: ['protocol#single-provider-planning-perspectives', 'protocol#pairing-and-model-identity'],
  recover: ['protocol#resume-checklist', 'protocol#budgets-and-bounded-recovery', 'protocol#compatibility-and-recovery', 'protocol#authentication-permissions-and-limits'],
  fallback: ['protocol#planning-with-unavailable-tools', 'protocol#change-route-after-a-worker-block', 'protocol#no-paid-limit-recovery', 'protocol#planning-when-usage-limits-block-the-exchange'],
  present: ['protocol#planning-depth-and-deliverables', 'presentation#put-the-decision-brief-first', 'presentation#show-scope-and-sequence', 'presentation#keep-safety-and-verification-actionable', 'presentation#show-what-review-changed', 'presentation#make-the-execution-entry-point-explicit', 'presentation#check-before-delivery', 'presentation#put-technical-depth-after-the-decisions'],
  update: ['protocol#updates-during-a-chat'],
  qa: ['qa#scope-and-authority', 'qa#baseline-and-test-selection', 'qa#execution-and-evidence', 'qa#assurance-contract', 'qa#retest-and-readiness'],
});
const slug = text => text.toLowerCase().replace(/[`*_]/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };

function sections(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const found = new Map();
  let start = null, heading = null, fence = null;
  const save = end => {
    if (start === null) return;
    const id = slug(heading);
    requireThat(!found.has(id), `Duplicate guidance heading: ${id}`);
    found.set(id, { heading, content: lines.slice(start, end).join('\n').trimEnd() });
  };
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const match = lines[i].match(/^## ([^\r\n]+)$/);
    if (match) { save(i); start = i; heading = match[1]; }
  }
  requireThat(!fence, 'Unclosed fence in guidance source');
  save(lines.length);
  return found;
}

export function readGuidance(root, { topic, topics: requestedTopics, section, domain = 'software', offset, limit, index = false } = {}) {
  requireThat(['software', 'content', 'mixed', 'non_software'].includes(domain), 'Unknown guidance domain');
  requireThat(typeof index === 'boolean', 'Guidance index must be a boolean');
  requireThat(Number(Boolean(topic)) + Number(requestedTopics !== undefined) + Number(Boolean(section)) === 1, 'Choose exactly one guidance topic, topics list or section');
  requireThat(!topic || Object.hasOwn(topics, topic), `Unknown guidance topic: ${topic}`);
  if (requestedTopics !== undefined) {
    requireThat(Array.isArray(requestedTopics) && requestedTopics.length > 0 && requestedTopics.length <= Object.keys(topics).length, 'Expected a bounded nonempty guidance topics list');
    requireThat(requestedTopics.every(item => typeof item === 'string' && Object.hasOwn(topics, item)), 'Unknown guidance topic in topics list');
    requireThat(new Set(requestedTopics).size === requestedTopics.length, 'Duplicate guidance topic in topics list');
  }
  const selectedTopics = requestedTopics ?? (topic ? [topic] : []);
  const selected = selectedTopics.length ? selectedTopics.flatMap(item => [
    ...topics[item],
    ...(['start', 'assess'].includes(item) && ['content', 'mixed'].includes(domain) ? ['assessment#content-and-mixed-work'] : []),
  ]) : [section];
  const paginated = offset !== undefined || limit !== undefined;
  const start = offset === undefined ? 0 : offset, pageSize = limit === undefined ? 64 : limit;
  if (paginated) {
    requireThat(Number.isSafeInteger(start) && start >= 0, 'Guidance offset must be a nonnegative integer');
    requireThat(Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= 64, 'Guidance limit must be an integer from 1 to 64');
  }
  const cache = new Map(), sources = [];
  for (const reference of [...new Set(selected)]) {
    requireThat(typeof reference === 'string' && reference.length <= 160, 'Invalid guidance section');
    const [key, anchor, extra] = reference.split('#');
    requireThat(Object.hasOwn(files, key) && anchor && !extra, 'Use a known reference#section identifier');
    const file = files[key];
    if (!cache.has(file)) {
      const target = path.join(root, file);
      const stat = fs.lstatSync(target);
      requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 512 * 1024, 'Expected bounded regular guidance source');
      const bytes = fs.readFileSync(target);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      cache.set(file, { sha256: crypto.createHash('sha256').update(bytes).digest('hex'), sections: sections(text) });
    }
    const source = cache.get(file), item = source.sections.get(anchor);
    requireThat(item, `Missing guidance section: ${reference}`);
    sources.push({ file, anchor, sha256: source.sha256, ...item });
  }
  requireThat(!paginated || start < sources.length, 'Guidance offset is outside the selected sections');
  const page = paginated ? sources.slice(start, start + pageSize) : sources;
  const pagination = paginated ? { offset: start, limit: pageSize, total: sources.length, returned: page.length, next_offset: start + page.length < sources.length ? start + page.length : null } : null;
  const metadata = { topic: topic || null, ...(requestedTopics !== undefined ? { topics: [...requestedTopics] } : {}), domain };
  if (index) return { ...metadata, index: true,
    sources: page.map(({ file, anchor, sha256, heading, content }) => ({ reference: `${Object.keys(files).find(key => files[key] === file)}#${anchor}`, file, anchor, sha256, heading, bytes: Buffer.byteLength(content) })),
    ...(pagination ? { pagination } : {}),
    note: 'Index only: no guidance bodies were returned. Read the required complete sections; an index is not evidence that their instructions were read.' };
  const continuation = pagination ? `Guidance sections ${start + 1}–${start + page.length} of ${sources.length}. ${pagination.next_offset === null ? 'No further sections follow this page.' : `Continue with offset ${pagination.next_offset} and the same selection/domain; unread sections still apply.`}\n\n` : '';
  return { ...metadata, sources: page,
    ...(pagination ? { pagination } : {}),
    markdown: `# C2C guidance: ${topic || requestedTopics?.join(', ') || section}\n\nUse with the entry skill's universal constraints. Read linked sections only when needed.\n\n${continuation}${page.map(source => `<!-- ${source.file}#${source.anchor} -->\n${source.content}`).join('\n\n')}\n` };
}

export const GUIDANCE_TOPICS = Object.freeze(Object.keys(topics));
