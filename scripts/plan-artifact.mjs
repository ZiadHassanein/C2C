// Exact local plan assembly. This does not synthesize or adjudicate plan changes.
import crypto from 'node:crypto';

const LIMIT = 1024 * 1024;
const MAX_EDITS = 150;
const digest = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const requireThat = (condition, message) => {
  if (!condition) throw new Error(`Plan artifact: ${message}`);
};
const boundedText = (value, label) => {
  requireThat(typeof value === 'string', `${label} must be a string`);
  requireThat(!value.includes('\0'), `${label} cannot contain a binary zero byte`);
  requireThat(Buffer.byteLength(value, 'utf8') <= LIMIT, `${label} exceeds 1 MiB`);
};

/** Apply explicit literal edits to an exact Markdown source or report proposal. */
export function renderPlanArtifact({ sourceText, sourceKind, sourceSha256, edits = [] } = {}) {
  boundedText(sourceText, 'sourceText');
  requireThat(['report', 'markdown'].includes(sourceKind), 'sourceKind must be report or markdown');
  requireThat(typeof sourceSha256 === 'string' && /^[a-f0-9]{64}$/.test(sourceSha256),
    'sourceSha256 must be a lowercase SHA-256 digest');
  const sourceHash = digest(sourceText);
  requireThat(sourceHash === sourceSha256, 'Source SHA-256 mismatch; inspect the current source before editing');
  requireThat(Array.isArray(edits) && edits.length <= MAX_EDITS, `edits must be an array of at most ${MAX_EDITS} items`);
  for (const [index, edit] of edits.entries()) {
    requireThat(edit && typeof edit === 'object' && !Array.isArray(edit)
      && Object.keys(edit).sort().join(',') === 'new,old'
      && Object.getOwnPropertySymbols(edit).length === 0,
    `Edit ${index + 1} must contain exactly old and new`);
    boundedText(edit.old, `Edit ${index + 1} old`);
    boundedText(edit.new, `Edit ${index + 1} new`);
    requireThat(edit.old.length > 0, `Edit ${index + 1} old cannot be empty`);
    requireThat(edit.old !== edit.new, `Edit ${index + 1} is a no-op`);
  }

  let text = sourceText;
  if (sourceKind === 'report') {
    let report;
    try { report = JSON.parse(sourceText.replace(/^\uFEFF/, '')); }
    catch { throw new Error('Plan artifact: Report source must be valid JSON'); }
    requireThat(report && typeof report === 'object' && !Array.isArray(report)
      && typeof report.proposal_markdown === 'string' && report.proposal_markdown.trim(),
    'Report source must contain a nonempty proposal_markdown string');
    text = report.proposal_markdown;
  }

  // Each edit names the current intermediate text. A later edit may explicitly
  // target earlier replacement text, but an ambiguous anchor is never guessed.
  for (const [index, edit] of edits.entries()) {
    const position = text.indexOf(edit.old);
    requireThat(position >= 0, `Edit ${index + 1} old text was not found`);
    requireThat(text.indexOf(edit.old, position + 1) < 0,
      `Edit ${index + 1} old text is ambiguous; it occurs more than once`);
    text = text.slice(0, position) + edit.new + text.slice(position + edit.old.length);
  }
  requireThat(text.trim(), 'Final plan cannot be empty');
  boundedText(text, 'Final plan');
  return { text, source_sha256: sourceHash, sha256: digest(text),
    bytes: Buffer.byteLength(text, 'utf8'), edits_applied: edits.length };
}
