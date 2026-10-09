// A bounded textual review aid, never a patch, semantic approval or context filter.
// Hash the exact supplied strings. Do not normalize sealed source/artifact text.
import crypto from 'node:crypto';

export const REVIEW_DIFF_LIMITS = Object.freeze({ input_bytes: 1024 * 1024, indexed_lines: 50000, output_bytes: 8192, minimum_output_bytes: 2048, hunks: 32, displayed_lines: 120, excerpt_characters: 256 });
const L = REVIEW_DIFF_LIMITS;
const required = (ok, message) => { if (!ok) throw new Error(`Review diff: ${message}`); };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const byteLength = value => Buffer.byteLength(JSON.stringify(value));
const high = code => code >= 0xd800 && code <= 0xdbff;
const low = code => code >= 0xdc00 && code <= 0xdfff;
const notice = 'Textual excerpts only, not an applyable patch or proof of semantic coverage. Exact line endings are labeled. Retain the full current plan, source evidence, security conditions and all findings/dispositions; inspect omitted text and effects on unchanged steps.';

function validateOptions(options) {
  required(options && typeof options === 'object' && !Array.isArray(options) && [Object.prototype, null].includes(Object.getPrototypeOf(options)), 'options must be a plain object');
  const allowed = ['name', 'before', 'after', 'beforeSha256', 'afterSha256', 'maxBytes'];
  for (const key of Reflect.ownKeys(options)) {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    required(typeof key === 'string' && allowed.includes(key) && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'unsupported field or non-data property');
  }
  required(typeof options.name === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(options.name), 'name must be a bounded artifact label');
  const maxBytes = options.maxBytes ?? L.output_bytes;
  required(Number.isSafeInteger(maxBytes) && maxBytes >= L.minimum_output_bytes && maxBytes <= L.output_bytes, 'maxBytes is outside the supported bound');
  for (const field of ['before', 'after']) {
    const value = options[field];
    required(typeof value === 'string' && value.length <= L.input_bytes && !value.includes('\0') && Buffer.byteLength(value) <= L.input_bytes, `${field} must be bounded text without NUL`);
    // Buffer replaces lone surrogates, which could give distinct strings the same
    // UTF-8 digest. Real decoded source text is well formed; reject other input.
    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index);
      if (high(code)) required(low(value.charCodeAt(++index)), `${field} contains an unpaired surrogate`);
      else required(!low(code), `${field} contains an unpaired surrogate`);
    }
    if (options[`${field}Sha256`] !== undefined) required(typeof options[`${field}Sha256`] === 'string' && /^[a-f0-9]{64}$/.test(options[`${field}Sha256`]) && hash(value) === options[`${field}Sha256`], `${field} does not match its expected SHA-256`);
  }
  return maxBytes;
}

// A line token retains its terminator, so CRLF/LF, bare CR, missing final newline
// and trailing spaces remain observable changes. Index memory is capped even
// for a one-megabyte document containing only single-character newline tokens.
function lines(value) {
  let tokens = [], start = 0, count = 0;
  const endings = { lf: 0, crlf: 0, cr: 0, none: 0 };
  const add = (end, ending) => {
    count++; endings[ending]++;
    if (count > L.indexed_lines) tokens = null;
    if (tokens) tokens.push(value.slice(start, end));
    start = end;
  };
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '\r') {
      if (value[index + 1] === '\n') { add(index + 2, 'crlf'); index++; }
      else add(index + 1, 'cr');
    } else if (value[index] === '\n') add(index + 1, 'lf');
  }
  if (start < value.length) add(value.length, 'none');
  return { tokens, count, endings };
}
function splitEnding(value) {
  if (value.endsWith('\r\n')) return { text: value.slice(0, -2), ending: 'crlf' };
  if (value.endsWith('\n')) return { text: value.slice(0, -1), ending: 'lf' };
  if (value.endsWith('\r')) return { text: value.slice(0, -1), ending: 'cr' };
  return { text: value, ending: 'none' };
}
function commonPrefix(a, b) {
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) index++;
  // Do not cut the shared half of two different supplementary characters.
  if (index && high(a.charCodeAt(index - 1))) index--;
  return index;
}
function excerpt(value, focus = 0) {
  let start = Math.max(0, Math.min(value.length - L.excerpt_characters, focus - 64));
  let end = Math.min(value.length, start + L.excerpt_characters);
  if (start && low(value.charCodeAt(start))) start--;
  if (end < value.length && high(value.charCodeAt(end - 1))) end++;
  return { text: value.slice(start, end), ...(start || end < value.length ? { prefix_omitted: start, suffix_omitted: value.length - end } : {}) };
}
function uniquePositions(values) {
  const positions = new Map();
  for (let index = 0; index < values.length; index++) positions.set(values[index], positions.has(values[index]) ? -1 : index);
  return positions;
}

// Unique matching lines plus a longest increasing subsequence form ordered
// anchors in O(n log n) time. Gaps are exact replacement windows, not a promise
// of a minimal edit script. Repeated lines cannot trigger quadratic LCS work.
function changeBlocks(before, after) {
  const oldPositions = uniquePositions(before), newPositions = uniquePositions(after);
  const pairs = [];
  for (const [value, oldIndex] of oldPositions) {
    const newIndex = newPositions.get(value);
    if (oldIndex >= 0 && newIndex !== undefined && newIndex >= 0) pairs.push([oldIndex, newIndex]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  const tails = [], previous = new Int32Array(pairs.length).fill(-1);
  for (let index = 0; index < pairs.length; index++) {
    let left = 0, right = tails.length;
    while (left < right) {
      const middle = (left + right) >>> 1;
      if (pairs[tails[middle]][1] < pairs[index][1]) left = middle + 1;
      else right = middle;
    }
    if (left) previous[index] = tails[left - 1];
    tails[left] = index;
  }
  const anchors = [];
  for (let index = tails.length ? tails[tails.length - 1] : -1; index >= 0; index = previous[index]) anchors.push(pairs[index]);
  anchors.reverse(); anchors.push([before.length, after.length]);
  const blocks = [];
  let oldStart = 0, newStart = 0;
  for (const [oldAnchor, newAnchor] of anchors) {
    let oldEnd = oldAnchor, newEnd = newAnchor;
    while (oldStart < oldEnd && newStart < newEnd && before[oldStart] === after[newStart]) { oldStart++; newStart++; }
    while (oldEnd > oldStart && newEnd > newStart && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
    if (oldStart < oldEnd || newStart < newEnd) blocks.push({ oldStart, oldEnd, newStart, newEnd });
    oldStart = oldAnchor + 1; newStart = newAnchor + 1;
  }
  return blocks;
}

/**
 * Return at most maxBytes (default 8 KiB) of deterministic JSON data for one
 * artifact. SHA-256 hashes cover the exact UTF-8 strings, not parsed/canonical
 * JSON or whitespace-normalized text. Expected hashes, when supplied, must match.
 * `complete` means all textual changes are represented, never semantic closure;
 * `truncated` and omission counts expose excerpts. This cannot be applied as a
 * patch and must accompany the full current plan and authoritative evidence.
 */
export function buildReviewDiff(options) {
  const maxBytes = validateOptions(options), { name, before, after } = options;
  const oldLines = lines(before), newLines = lines(after);
  const metadata = (text, parsed) => ({ sha256: hash(text), bytes: Buffer.byteLength(text), lines: parsed.count, line_endings: parsed.endings });
  const result = {
    version: 1, name, format: 'line_change_excerpts', changed: before !== after,
    before: metadata(before, oldLines), after: metadata(after, newLines),
    algorithm: 'unique_line_anchors', minimal: false, complete: true, truncated: false,
    truncation_reasons: [], omitted: { hunks: 0, removed_lines: 0, added_lines: 0, clipped_lines: 0 },
    hunks: [], max_bytes: maxBytes, is_patch: false, full_context_required: true, notice,
  };
  if (before === after) return result;
  const mark = reason => {
    result.complete = false; result.truncated = true;
    if (!result.truncation_reasons.includes(reason)) result.truncation_reasons.push(reason);
  };
  if (!oldLines.tokens || !newLines.tokens) {
    // Avoid allocating an unbounded line index. Show the exact changed character
    // window, not arbitrary first-page excerpts that could miss a late change.
    let start = commonPrefix(before, after), suffix = 0;
    while (before.length - suffix > start && after.length - suffix > start && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
    if (suffix && low(before.charCodeAt(before.length - suffix))) suffix--;
    const removed = before.slice(start, before.length - suffix), added = after.slice(start, after.length - suffix);
    result.algorithm = 'bounded_character_window';
    result.format = 'character_change_excerpts';
    result.character_window = { offset_unit: 'UTF-16 code units', start, removed_characters: removed.length, added_characters: added.length, removed: excerpt(removed), added: excerpt(added) };
    result.omitted.removed_lines = null; result.omitted.added_lines = null;
    mark('line_index_limit');
    // Escaped control characters can expand a 256-character excerpt sixfold.
    // Shrink only the excerpt, never the source, hash or changed-window bounds.
    while (byteLength(result) > maxBytes) {
      const values = [result.character_window.removed, result.character_window.added].sort((a, b) => b.text.length - a.text.length);
      const selected = values[0];
      required(selected.text.length > 0, 'output metadata exceeds its bound');
      let end = Math.floor(selected.text.length / 2);
      if (end && high(selected.text.charCodeAt(end - 1))) end--;
      selected.suffix_omitted = (selected.suffix_omitted ?? 0) + selected.text.length - end;
      selected.text = selected.text.slice(0, end);
      mark('output_limit');
    }
    return result;
  }
  const blocks = changeBlocks(oldLines.tokens, newLines.tokens);
  result.omitted.hunks = blocks.length;
  result.omitted.removed_lines = blocks.reduce((sum, block) => sum + block.oldEnd - block.oldStart, 0);
  result.omitted.added_lines = blocks.reduce((sum, block) => sum + block.newEnd - block.newStart, 0);
  let displayed = 0, stop = false;
  // Reserve space for later omission counters and reason labels. Final bounded
  // serialization below is authoritative, including escaping expansion.
  const fits = () => byteLength(result) <= maxBytes - 192;
  for (const block of blocks) {
    if (result.hunks.length >= L.hunks || displayed >= L.displayed_lines || stop) { mark('output_limit'); break; }
    const hunk = { before_start: block.oldStart + 1, before_lines: block.oldEnd - block.oldStart, after_start: block.newStart + 1, after_lines: block.newEnd - block.newStart, removed: [], added: [] };
    result.hunks.push(hunk);
    if (!fits()) { result.hunks.pop(); mark('output_limit'); break; }
    result.omitted.hunks--;
    for (let index = 0; index < Math.max(hunk.before_lines, hunk.after_lines) && !stop; index++) {
      const oldValue = index < hunk.before_lines ? splitEnding(oldLines.tokens[block.oldStart + index]) : null;
      const newValue = index < hunk.after_lines ? splitEnding(newLines.tokens[block.newStart + index]) : null;
      const focus = oldValue && newValue ? commonPrefix(oldValue.text, newValue.text) : 0;
      for (const [side, value, start] of [['removed', oldValue, block.oldStart], ['added', newValue, block.newStart]]) {
        if (!value) continue;
        if (displayed >= L.displayed_lines) { mark('output_limit'); stop = true; break; }
        const item = { line: start + index + 1, ...excerpt(value.text, focus), ending: value.ending };
        hunk[side].push(item);
        if (!fits()) { hunk[side].pop(); mark('output_limit'); stop = true; break; }
        displayed++; result.omitted[`${side}_lines`]--;
        if (item.prefix_omitted || item.suffix_omitted) { result.omitted.clipped_lines++; mark('line_excerpt_limit'); }
      }
    }
  }
  if (result.omitted.hunks || result.omitted.removed_lines || result.omitted.added_lines) mark('output_limit');
  required(byteLength(result) <= maxBytes, 'output exceeds its bound');
  return result;
}
