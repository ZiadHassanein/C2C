import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readGuidance, GUIDANCE_TOPICS } from '../scripts/guidance.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('CLI routes topic bundles, indexes and whole-section pages without changing legacy JSON', () => {
  const cli = args => spawnSync(process.execPath, [path.join(root, 'scripts/council.mjs'), 'guide', ...args], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  const options = { topics: ['exchange', 'verify', 'present'], offset: 1, limit: 2, maxBytes: 16000 };
  const page = cli(['--topics', options.topics.join(','), '--offset', '1', '--limit', '2']);
  assert.equal(page.status, 0, page.stderr);
  assert.equal(page.stdout, readGuidance(root, options).markdown);
  const index = cli(['--topics', 'start,assess', '--index']);
  assert.equal(index.status, 0, index.stderr);
  assert.deepEqual(JSON.parse(index.stdout), readGuidance(root, { topics: ['start', 'assess'], index: true }));
  const legacy = cli(['--topic', 'start', '--compact']);
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.deepEqual(JSON.parse(legacy.stdout), readGuidance(root, { topic: 'start' }));
  for (const args of [['--topic', 'start', '--topics', 'assess'], ['--topic', 'start', '--index', '--index'], ['--topics', 'start,absent'], ['--topic', 'start', '--offset', 'no'], ['--topic', 'start', '--limit', '0']]) {
    const result = cli(args);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '', 'invalid guidance options must not emit a partial body');
  }
});

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

test('preparation and presentation retrieve the same complete depth and outcome contract for every domain', () => {
  const contract = readGuidance(root, { section: 'protocol#planning-depth-and-deliverables' }).sources[0];
  for (const topic of ['prepare', 'present']) for (const domain of ['software', 'content', 'mixed', 'non_software']) {
    const result = readGuidance(root, { topic, domain });
    const depths = result.sources.filter(item => item.anchor === 'planning-depth-and-deliverables');
    assert.equal(depths.length, 1, `${topic}/${domain} must expose the outcome/depth contract once`);
    assert.deepEqual(depths[0], contract);
  }
  // Early evidence discovery and narrow identity lookups do not load a roadmap.
  for (const topic of ['start', 'same']) assert.equal(readGuidance(root, { topic }).sources.some(item => item.anchor === contract.anchor), false);
});

test('role selection retrieves maintained effort policy before launch without replacing billing or identity guidance', () => {
  const policy = readGuidance(root, { section: 'models#worker-effort' }).sources[0];
  for (const topic of ['models', 'prepare']) {
    const result = readGuidance(root, { topic });
    assert.deepEqual(result.sources.filter(item => item.anchor === 'worker-effort'), [policy]);
  }
  const prepare = readGuidance(root, { topic: 'prepare' });
  for (const anchor of ['pairing-and-model-identity', 'no-paid-limit-recovery', 'launch-preview-and-local-permissions']) assert.ok(prepare.sources.some(item => item.anchor === anchor));
  const exchange = readGuidance(root, { topic: 'exchange' });
  assert.equal(exchange.sources.some(item => item.anchor === 'worker-effort'), false, 'reuse role research during later calls');
});

test('guidance restricts files and sections and never follows user supplied paths', () => {
  for (const options of [{}, { topic: 'start', section: 'protocol#commands' }, { topic: '../SKILL.md' }, { section: '../SKILL.md#commands' }, { section: 'protocol#absent' }, { section: 'protocol#commands#extra' }, { topic: 'start', domain: 'unknown' }]) assert.throws(() => readGuidance(root, options));
});

test('multiple topics preserve the exact ordered union of complete sections in every domain', () => {
  const requested = ['start', 'assess', 'models', 'prepare', 'exchange', 'verify', 'present'];
  for (const domain of ['software', 'content', 'mixed', 'non_software']) {
    const expected = new Map();
    for (const topic of requested) for (const source of readGuidance(root, { topic, domain }).sources) {
      const key = `${source.file}#${source.anchor}`;
      if (!expected.has(key)) expected.set(key, source);
    }
    const result = readGuidance(root, { topics: requested, domain });
    assert.deepEqual(result.topics, requested);
    assert.equal(result.topic, null);
    assert.deepEqual(result.sources, [...expected.values()]);
    for (const source of result.sources) assert.ok(result.markdown.includes(source.content));
    assert.equal(result.sources.filter(source => source.anchor === 'content-and-mixed-work').length, ['content', 'mixed'].includes(domain) ? 1 : 0);
  }
  const single = readGuidance(root, { topic: 'start' });
  assert.deepEqual(Object.keys(single), ['topic', 'domain', 'sources', 'markdown'], 'existing single-topic shape stays unchanged');
});

test('topics lists reject empty, unknown, duplicate, oversized and ambiguous selections', () => {
  for (const options of [
    { topics: [] }, { topics: null }, { topics: 'start' }, { topics: ['absent'] }, { topics: [1] },
    { topics: ['start', 'start'] }, { topics: Array(GUIDANCE_TOPICS.length + 1).fill('start') },
    { topics: ['start'], topic: 'start' }, { topics: ['start'], section: 'protocol#commands' },
  ]) assert.throws(() => readGuidance(root, options));
});

test('pagination emits whole sections, explicit continuation and the full original ordered union', () => {
  const options = { topics: ['models', 'prepare', 'exchange'], domain: 'mixed' };
  const full = readGuidance(root, options);
  const assembled = [];
  let offset = 0;
  do {
    const page = readGuidance(root, { ...options, offset, limit: 3 });
    assert.equal(page.pagination.offset, offset);
    assert.equal(page.pagination.limit, 3);
    assert.equal(page.pagination.total, full.sources.length);
    assert.equal(page.pagination.returned, page.sources.length);
    assert.deepEqual(page.sources, full.sources.slice(offset, offset + 3));
    for (const source of page.sources) assert.ok(page.markdown.includes(source.content));
    if (page.pagination.next_offset !== null) assert.match(page.markdown, /unread sections still apply/);
    else assert.match(page.markdown, /No further sections follow this page/);
    assembled.push(...page.sources);
    offset = page.pagination.next_offset;
  } while (offset !== null);
  assert.deepEqual(assembled, full.sources);
  assert.deepEqual(readGuidance(root, { ...options, offset: 1 }).sources, full.sources.slice(1));
  assert.deepEqual(readGuidance(root, { ...options, limit: 1 }).sources, full.sources.slice(0, 1));
  for (const bounds of [{ offset: null }, { offset: -1 }, { offset: 0.5 }, { offset: '1' }, { offset: full.sources.length }, { offset: Number.MAX_SAFE_INTEGER + 1 }, { limit: null }, { limit: 0 }, { limit: 65 }, { limit: '2' }, { limit: 1.5 }, { limit: Infinity }]) {
    assert.throws(() => readGuidance(root, { ...options, ...bounds }));
  }
});

test('index lists source fingerprints and body sizes without returning guidance text', () => {
  const options = { topics: ['start', 'assess'], domain: 'content', offset: 1, limit: 3 };
  const full = readGuidance(root, options);
  const index = readGuidance(root, { ...options, index: true });
  assert.equal(index.index, true);
  assert.equal(Object.hasOwn(index, 'markdown'), false);
  assert.deepEqual(index.topics, options.topics);
  assert.deepEqual(index.pagination, full.pagination);
  assert.deepEqual(index.sources, full.sources.map(({ file, anchor, sha256, heading, content }) => ({ reference: `assessment#${anchor}`, file, anchor, sha256, heading, bytes: Buffer.byteLength(content) })));
  for (const source of index.sources) assert.equal(Object.hasOwn(source, 'content'), false);
  assert.match(index.note, /not evidence.*instructions were read/);
  assert.deepEqual(readGuidance(root, { topic: 'start', index: false }), readGuidance(root, { topic: 'start' }));
  assert.throws(() => readGuidance(root, { topic: 'start', index: 'true' }));
});

test('every indexed reference directly retrieves its exact complete section through the public API', () => {
  const options = { topics: [...GUIDANCE_TOPICS], domain: 'mixed' };
  const complete = readGuidance(root, options);
  const index = readGuidance(root, { ...options, index: true });
  assert.equal(new Set(index.sources.map(source => source.file)).size, 6);
  for (let i = 0; i < index.sources.length; i++) {
    const item = index.sources[i];
    assert.match(item.reference, /^(protocol|assessment|models|presentation|qa|focused)#[^#]+$/);
    const retrieved = readGuidance(root, { section: item.reference, domain: options.domain });
    assert.deepEqual(retrieved.sources, [complete.sources[i]]);
    assert.equal(retrieved.sources[0].file, item.file);
    assert.equal(retrieved.sources[0].sha256, item.sha256);
    assert.equal(Buffer.byteLength(retrieved.sources[0].content), item.bytes);
  }
});

test('byte-bounded pages reconstruct the exact section union without exceeding either bound', () => {
  const options = { topics: [...GUIDANCE_TOPICS], domain: 'mixed' };
  const complete = readGuidance(root, options);
  for (const maxBytes of [1024, 4096, 16000, 128000]) {
    const assembled = [];
    let offset = 0;
    do {
      const page = readGuidance(root, { ...options, offset, limit: 4, maxBytes });
      const bytes = page.sources.reduce((sum, source) => sum + Buffer.byteLength(source.content), 0);
      assert.equal(page.pagination.max_bytes, maxBytes);
      assert.equal(page.pagination.body_bytes, bytes);
      assert.ok(page.sources.length >= 1 && page.sources.length <= 4);
      assert.deepEqual(page.sources, complete.sources.slice(offset, offset + page.sources.length));
      if (bytes > maxBytes) {
        assert.equal(page.sources.length, 1);
        assert.equal(page.pagination.oversized_section, true);
        assert.match(page.warning, /section is kept whole/);
        assert.ok(page.markdown.includes(page.warning));
      } else {
        assert.equal(page.pagination.oversized_section, false);
        assert.equal(Object.hasOwn(page, 'warning'), false);
      }
      for (const source of page.sources) assert.ok(page.markdown.includes(source.content));
      assembled.push(...page.sources);
      assert.equal(page.pagination.next_offset, assembled.length === complete.sources.length ? null : assembled.length);
      offset = page.pagination.next_offset;
    } while (offset !== null);
    assert.deepEqual(assembled, complete.sources);
  }
  for (const maxBytes of [null, 0, -1, 1023, 128001, 16000.5, '16000', Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => readGuidance(root, { ...options, maxBytes }), /maxBytes/);
  }
});

test('a single oversized Unicode section remains byte-for-byte intact and explicitly warned', () => {
  const parent = fs.realpathSync(os.tmpdir()), dir = fs.mkdtempSync(path.join(parent, 'c2c-guide-bytes-'));
  try {
    fs.mkdirSync(path.join(dir, 'references'));
    const content = `## Commands\n${'界'.repeat(1000)}\nComplete final sentence.`;
    fs.writeFileSync(path.join(dir, 'references/protocol.md'), `${content}\n\n## Other\nExcluded.\n`);
    const complete = readGuidance(dir, { section: 'protocol#commands' });
    const bounded = readGuidance(dir, { section: 'protocol#commands', maxBytes: 1024 });
    assert.deepEqual(bounded.sources, complete.sources);
    assert.equal(bounded.sources[0].content, content);
    assert.ok(bounded.markdown.includes(content));
    assert.equal(bounded.pagination.body_bytes, Buffer.byteLength(content));
    assert.equal(bounded.pagination.oversized_section, true);
    assert.equal(bounded.pagination.next_offset, null);
    assert.match(bounded.warning, /1024-byte.*kept whole/);
    const index = readGuidance(dir, { section: 'protocol#commands', maxBytes: 1024, index: true });
    assert.deepEqual(index.pagination, bounded.pagination);
    assert.equal(index.warning, bounded.warning);
    assert.equal(index.sources[0].bytes, Buffer.byteLength(content));
    assert.equal(Object.hasOwn(index, 'markdown'), false);
  } finally {
    assert.equal(path.dirname(fs.realpathSync(dir)), parent);
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
