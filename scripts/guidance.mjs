// Read only applicable sections of the locally trusted (possibly pinned) skill.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const files = Object.freeze({ protocol: 'references/protocol.md', assessment: 'references/project-assessment.md', models: 'references/model-selection.md', presentation: 'references/plan-presentation.md' });
const topics = Object.freeze({
  start: ['assessment#gather-evidence-without-expanding-scope', 'assessment#choose-an-actionable-direction'],
  assess: ['assessment#distinguish-deployment-from-readiness', 'assessment#json-contract', 'assessment#persist-and-revisit'],
  prepare: ['protocol#choose-an-available-route', 'protocol#pairing-and-model-identity', 'protocol#no-paid-limit-recovery', 'protocol#commands', 'protocol#launch-preview-and-local-permissions'],
  models: ['models#research-once-per-task', 'models#filter-before-choosing', 'models#assign-real-roles', 'models#recommend-models-for-execution'],
  exchange: ['protocol#exchange-sequence', 'protocol#file-contract', 'protocol#report-schema', 'protocol#decision-record', 'protocol#security-and-testing', 'protocol#bounded-evidence-requests'],
  verify: ['protocol#final-revision-check', 'protocol#decision-record', 'presentation#check-before-delivery'],
  same: ['protocol#single-provider-planning-perspectives', 'protocol#pairing-and-model-identity'],
  recover: ['protocol#resume-checklist', 'protocol#budgets-and-bounded-recovery', 'protocol#compatibility-and-recovery', 'protocol#authentication-permissions-and-limits'],
  fallback: ['protocol#planning-with-unavailable-tools', 'protocol#change-route-after-a-worker-block', 'protocol#no-paid-limit-recovery', 'protocol#planning-when-usage-limits-block-the-exchange'],
  present: ['presentation#put-the-decision-brief-first', 'presentation#show-scope-and-sequence', 'presentation#keep-safety-and-verification-actionable', 'presentation#show-what-review-changed', 'presentation#make-the-execution-entry-point-explicit', 'presentation#check-before-delivery', 'presentation#put-technical-depth-after-the-decisions'],
  update: ['protocol#updates-during-a-chat'],
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

export function readGuidance(root, { topic, section, domain = 'software' } = {}) {
  requireThat(['software', 'content', 'mixed', 'non_software'].includes(domain), 'Unknown guidance domain');
  requireThat(Boolean(topic) !== Boolean(section), 'Choose exactly one guidance topic or section');
  requireThat(!topic || Object.hasOwn(topics, topic), `Unknown guidance topic: ${topic}`);
  const selected = topic ? [...topics[topic]] : [section];
  if (topic && ['start', 'assess'].includes(topic) && ['content', 'mixed'].includes(domain)) selected.push('assessment#content-and-mixed-work');
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
  return { topic: topic || null, domain, sources,
    markdown: `# C2C guidance: ${topic || section}\n\nUse with the entry skill's universal constraints. Read linked sections only when needed.\n\n${sources.map(source => `<!-- ${source.file}#${source.anchor} -->\n${source.content}`).join('\n\n')}\n` };
}

export const GUIDANCE_TOPICS = Object.freeze(Object.keys(topics));
