import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { renderPlanArtifact } from '../scripts/plan-artifact.mjs';

const digest = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const markdown = (sourceText, edits = []) => ({ sourceText, sourceKind: 'markdown', sourceSha256: digest(sourceText), edits });
const limit = 1024 * 1024;

test('binary zero bytes are rejected in source, decoded proposal and explicit edits', () => {
  assert.throws(() => renderPlanArtifact(markdown('# Plan\0')), /binary zero/);
  const sourceText = JSON.stringify({ proposal_markdown: '# Plan\0' });
  assert.throws(() => renderPlanArtifact({ sourceText, sourceKind: 'report', sourceSha256: digest(sourceText) }), /binary zero/);
  assert.throws(() => renderPlanArtifact(markdown('# Plan', [{ old: 'Plan', new: 'Plan\0' }])), /binary zero/);
});

test('a report yields the complete exact proposal without carrying other report fields', () => {
  const proposal = '# Plan\r\n\r\nKeep every step.\r\n\r\n## Checks\r\n  Preserve indentation and trailing spaces.  \r\n';
  const source = JSON.stringify({ summary: 'Unrelated report summary', proposal_markdown: proposal,
    findings: [{ id: 'C-D1', claim: 'Report-only finding' }] }, null, 2);
  const result = renderPlanArtifact({ sourceText: source, sourceKind: 'report', sourceSha256: digest(source) });
  assert.deepEqual(result, { text: proposal, source_sha256: digest(source), sha256: digest(proposal),
    bytes: Buffer.byteLength(proposal), edits_applied: 0 });
  assert.deepEqual(Buffer.from(result.text), Buffer.from(proposal));
  const withBom = '\uFEFF' + source;
  const bomResult = renderPlanArtifact({ sourceText: withBom, sourceKind: 'report', sourceSha256: digest(withBom) });
  assert.equal(bomResult.text, proposal);
  assert.equal(bomResult.source_sha256, digest(withBom));
});

test('empty edits copy Markdown bytes including Unicode, BOM, mixed newlines and literal escapes', () => {
  const source = '\uFEFF# خطة 🧭\r\nCafé\nLiteral \\n, $&, $1 and \\ paths.  \r\n';
  const result = renderPlanArtifact(markdown(source));
  assert.equal(result.text, source);
  assert.equal(result.sha256, result.source_sha256);
  assert.equal(result.bytes, Buffer.byteLength(source, 'utf8'));
  assert.notEqual(result.bytes, source.length);
});

test('a literal correction preserves unchanged content and does not interpret replacement syntax', () => {
  const source = '# Plan\r\n\r\nShip this first.\r\nGate: proposed only.\r\nNext: preserve this.\r\n';
  const replacement = 'Gate: retain $&, $1, \\n and 🧭 literally.';
  const result = renderPlanArtifact(markdown(source, [{ old: 'Gate: proposed only.', new: replacement }]));
  const expected = '# Plan\r\n\r\nShip this first.\r\n' + replacement + '\r\nNext: preserve this.\r\n';
  assert.deepEqual(Buffer.from(result.text), Buffer.from(expected));
  assert.equal(result.sha256, digest(expected));
  assert.equal(result.edits_applied, 1);
});

test('sequential edits explicitly address earlier replacement text or separate original anchors', () => {
  const result = renderPlanArtifact(markdown('First: old.\nSecond: untouched.\n', [
    { old: 'First: old.', new: 'First: provisional.' },
    { old: 'provisional', new: 'revised' },
    { old: 'Second: untouched.', new: 'Second: checked.' },
  ]));
  assert.equal(result.text, 'First: revised.\nSecond: checked.\n');
  assert.equal(result.edits_applied, 3);
});

test('stale, missing and noncanonical source digests fail before any plan assembly', () => {
  const input = markdown('# Current plan\n');
  for (const sourceSha256 of [undefined, '', 'A'.repeat(64), '0'.repeat(63), digest('# Older plan\n')]) {
    assert.throws(() => renderPlanArtifact({ ...input, sourceSha256 }), /SHA-256/);
  }
  const changedNewlines = { ...input, sourceText: '# Current plan\r\n' };
  assert.throws(() => renderPlanArtifact(changedNewlines), /mismatch/);
});

test('anchors must occur exactly once, including overlapping occurrences', () => {
  for (const [text, old, expected] of [
    ['duplicate duplicate', 'duplicate', /ambiguous/],
    ['aaa', 'aa', /ambiguous/],
    ['current plan', 'missing anchor', /not found/],
  ]) assert.throws(() => renderPlanArtifact(markdown(text, [{ old, new: 'replacement' }])), expected);
  assert.throws(() => renderPlanArtifact(markdown('first second', [
    { old: 'first', new: 'second' }, { old: 'second', new: 'final' },
  ])), /Edit 2.*ambiguous/);
});

test('failed later edits do not mutate the source or caller-owned edit objects', () => {
  const edits = Object.freeze([Object.freeze({ old: 'old', new: 'new' }), Object.freeze({ old: 'absent', new: 'replacement' })]);
  const input = Object.freeze(markdown('Original old plan.', edits));
  const before = structuredClone(input);
  assert.throws(() => renderPlanArtifact(input), /Edit 2.*not found/);
  assert.deepEqual(input, before);
  assert.equal(renderPlanArtifact(markdown(input.sourceText, [edits[0]])).text, 'Original new plan.');
});

test('malformed reports and empty plans are rejected without synthesizing content', () => {
  for (const sourceText of ['{broken', 'null', '[]', '{}', '{"proposal_markdown":1}', '{"proposal_markdown":"   "}']) {
    assert.throws(() => renderPlanArtifact({ sourceText, sourceKind: 'report', sourceSha256: digest(sourceText) }), /Report source/);
  }
  for (const sourceText of ['', ' \r\n\t']) assert.throws(() => renderPlanArtifact(markdown(sourceText)), /Final plan cannot be empty/);
  assert.throws(() => renderPlanArtifact(markdown('remove', [{ old: 'remove', new: '' }])), /Final plan cannot be empty/);
  assert.throws(() => renderPlanArtifact({ ...markdown('valid'), sourceKind: 'automatic' }), /sourceKind/);
});

test('edit shape, types, empty anchors and no-op edits fail explicitly', () => {
  for (const edit of [null, [], {}, { old: 'text' }, { old: 'text', new: 'new', regex: true },
    { old: 1, new: 'new' }, { old: 'text', new: null }, { old: '', new: 'new' }, { old: 'text', new: 'text' }]) {
    assert.throws(() => renderPlanArtifact(markdown('text', [edit])), /Edit 1/);
  }
  for (const edits of [null, {}, '']) assert.throws(() => renderPlanArtifact(markdown('text', edits)), /edits must be an array/);
  assert.throws(() => renderPlanArtifact(), /sourceText/);
});

test('UTF-8 limits apply to source, each edit and the final plan; 150 edits are supported', () => {
  const exact = 'é'.repeat(limit / 2);
  assert.equal(renderPlanArtifact(markdown(exact)).bytes, limit);
  assert.throws(() => renderPlanArtifact(markdown(exact + 'é')), /sourceText exceeds/);
  assert.throws(() => renderPlanArtifact(markdown('anchor', [{ old: 'anchor', new: exact + 'x' }])), /Edit 1 new exceeds/);
  assert.throws(() => renderPlanArtifact(markdown('anchor', [{ old: exact + 'x', new: '' }])), /Edit 1 old exceeds/);
  assert.throws(() => renderPlanArtifact(markdown('x' + exact, [])), /sourceText exceeds/);
  assert.throws(() => renderPlanArtifact(markdown('x' + 'a'.repeat(limit - 1), [{ old: 'x', new: 'xx' }])), /Final plan exceeds/);
  const edits = Array.from({ length: 150 }, (_, index) => ({ old: `[${index}]`, new: `[${index + 1}]` }));
  assert.equal(renderPlanArtifact(markdown('[0]', edits)).text, '[150]');
  assert.throws(() => renderPlanArtifact(markdown('[0]', [...edits, { old: '[150]', new: '[151]' }])), /at most 150/);
});
