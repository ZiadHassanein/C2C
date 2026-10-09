import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGuidance, GUIDANCE_TOPICS } from '../scripts/guidance.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('every guidance topic resolves maintained sections and preserves complete source bodies', () => {
  for (const topic of GUIDANCE_TOPICS) for (const domain of ['software', 'content', 'mixed', 'non_software']) {
    const result = readGuidance(root, { topic, domain });
    assert.ok(result.sources.length);
    assert.equal(new Set(result.sources.map(item => `${item.file}#${item.anchor}`)).size, result.sources.length);
    for (const item of result.sources) {
      assert.ok(fs.readFileSync(path.join(root, item.file), 'utf8').replace(/\r\n/g, '\n').includes(item.content));
      assert.match(item.sha256, /^[a-f0-9]{64}$/);
      assert.ok(result.markdown.includes(item.content));
    }
  }
});

test('guidance routing includes billing before calls, recovery boundaries, content and honest fallback', () => {
  const anchors = (topic, domain) => readGuidance(root, { topic, domain }).sources.map(item => item.anchor);
  assert.ok(anchors('prepare').includes('no-paid-limit-recovery'));
  assert.ok(anchors('prepare').includes('launch-preview-and-local-permissions'));
  assert.ok(anchors('recover').includes('budgets-and-bounded-recovery'));
  assert.ok(anchors('fallback').includes('planning-when-usage-limits-block-the-exchange'));
  assert.ok(anchors('same').includes('pairing-and-model-identity'));
  assert.ok(anchors('verify').includes('final-revision-check'));
  for (const domain of ['content', 'mixed']) assert.ok(anchors('start', domain).includes('content-and-mixed-work'));
  assert.ok(!anchors('start', 'software').includes('content-and-mixed-work'));
  assert.ok(!anchors('start').includes('json-contract'));
});

test('guidance restricts files and sections and never follows user supplied paths', () => {
  for (const options of [{}, { topic: 'start', section: 'protocol#commands' }, { topic: '../SKILL.md' }, { section: '../SKILL.md#commands' }, { section: 'protocol#absent' }, { section: 'protocol#commands#extra' }, { topic: 'start', domain: 'unknown' }]) assert.throws(() => readGuidance(root, options));
});

test('guidance preserves fenced headings, refuses duplicate real headings and uses the supplied bundle', () => {
  const parent = fs.realpathSync(os.tmpdir()), dir = fs.mkdtempSync(path.join(parent, 'c2c-guide-'));
  try {
    fs.mkdirSync(path.join(dir, 'references'));
    const file = path.join(dir, 'references/protocol.md');
    fs.writeFileSync(file, '# Pinned example\n\n## Commands\nOriginal runtime guidance.\n```md\n## Not a section\n```\n\n## Other\nExcluded text.\n');
    const result = readGuidance(dir, { section: 'protocol#commands' });
    assert.ok(result.markdown.includes('Original runtime guidance.'));
    assert.ok(result.markdown.includes('## Not a section'));
    assert.ok(!result.markdown.includes('Excluded text.'));
    fs.appendFileSync(file, '\n## Commands\nDuplicate.\n');
    assert.throws(() => readGuidance(dir, { section: 'protocol#commands' }), /Duplicate guidance/);
  } finally {
    assert.equal(path.dirname(fs.realpathSync(dir)), parent);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
