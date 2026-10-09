// Shared, nonsecret C2C preferences. A spending preference is never billing evidence.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const LIMIT = 4096;
const choices = ['subscription', 'included-only'];
const defaults = () => ({ version: 1, spending: 'subscription' });
function requireThat(ok, message) {
  if (!ok) throw Object.assign(new Error(`C2C spending preferences: ${message}`), { reason: 'preferences_invalid' });
}
function validate(value) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Object.keys(value).sort().join(',') === 'spending,version'
    && value.version === 1 && choices.includes(value.spending),
  'expected only version: 1 and spending: subscription or included-only. Preserve invalid existing content and resolve it explicitly.');
  return { version: 1, spending: value.spending };
}

/** Both installations use the same home; provider-specific homes have no effect. */
export function preferencesPath({ configHome, env = process.env, homeDir = os.homedir() } = {}) {
  const selected = configHome ?? env.C2C_CONFIG_HOME ?? path.join(homeDir, '.c2c');
  requireThat(typeof selected === 'string' && selected.trim().length > 0 && !selected.includes('\0') && path.isAbsolute(selected),
    'C2C_CONFIG_HOME must name an absolute directory.');
  return path.join(path.resolve(selected), 'preferences.json');
}

function inspect(file) {
  try { return fs.lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
const sameFile = (left, right) => left && right && left.dev === right.dev && left.ino === right.ino;
const sameContents = (left, right) => sameFile(left, right) && left.size === right.size
  && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
function trusted(stat, label) {
  if (typeof process.getuid === 'function') requireThat(stat.uid === process.getuid() && (stat.mode & 0o022) === 0,
    `${label} must be owned by this user and not writable by others.`);
}

// Check the lexical path, including the root and every existing ancestor: realpath
// alone would silently accept a linked home or a linked configuration directory.
function directories(directory, create = false) {
  const root = path.parse(directory).root;
  const parts = path.relative(root, directory).split(path.sep).filter(Boolean);
  let current = root;
  const checked = [];
  for (const part of [null, ...parts]) {
    if (part !== null) current = path.join(current, part);
    let stat = inspect(current);
    if (!stat && create) {
      try { fs.mkdirSync(current, { mode: 0o700 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      stat = inspect(current);
    }
    if (!stat) return null;
    requireThat(stat.isDirectory() && !stat.isSymbolicLink(), 'linked or non-directory ancestor of preferences.json.');
    checked.push({ file: current, stat });
  }
  trusted(checked.at(-1).stat, 'The configuration directory');
  return checked;
}
function unchangedDirectories(checked) {
  for (const { file, stat } of checked) {
    const current = inspect(file);
    requireThat(current?.isDirectory() && !current.isSymbolicLink() && sameFile(stat, current),
      'the configuration path changed during access. Preserve existing files and retry after inspecting the path.');
  }
  trusted(inspect(checked.at(-1).file), 'The configuration directory');
}
function regular(stat) {
  requireThat(stat?.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= LIMIT,
    `preferences.json must be an unlinked regular file no larger than ${LIMIT} bytes.`);
  trusted(stat, 'preferences.json');
}
function readExisting(file, checked) {
  const before = inspect(file);
  if (!before) return null;
  regular(before);
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const opened = fs.fstatSync(fd);
    regular(opened);
    requireThat(sameContents(before, opened), 'preferences.json changed while being opened.');
    const bytes = Buffer.alloc(LIMIT + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = fs.readSync(fd, bytes, length, bytes.length - length, null);
      if (!count) break;
      length += count;
    }
    requireThat(length <= LIMIT && sameContents(opened, fs.fstatSync(fd)) && sameContents(opened, inspect(file)),
      'preferences.json changed during the bounded read.');
    unchangedDirectories(checked);
    let text, parsed;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
      parsed = JSON.parse(text);
    } catch {
      requireThat(false, 'preferences.json is not valid UTF-8 JSON. Preserve it; no permissive default was applied.');
    }
    const value = validate(parsed);
    // A valid version-1 object has exactly three JSON string tokens (two keys
    // and the spending value). Extra tokens expose duplicate keys even when
    // JSON.parse would silently retain only the last, possibly weaker, value.
    requireThat((text.match(/"(?:[^"\\]|\\.)*"/g) || []).length === 3,
      'preferences.json must contain each recognized field exactly once.');
    return { value, stat: opened, bytes: bytes.subarray(0, length) };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

/** Missing preferences preserve ordinary subscription behavior without writing. */
export function readPreferences(options = {}) {
  const file = preferencesPath(options);
  const checked = directories(path.dirname(file));
  return checked ? readExisting(file, checked)?.value ?? defaults() : defaults();
}

/** Persist only this bounded preference; never touch provider/account settings. */
export function writePreferences(value, options = {}) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).join(',') === 'spending', 'setting preferences accepts only spending.');
  const saved = validate({ version: 1, spending: value.spending });
  const file = preferencesPath(options), directory = path.dirname(file);
  const checked = directories(directory, true);
  const before = readExisting(file, checked);
  const temporary = path.join(directory, `.preferences-${crypto.randomUUID()}.tmp`);
  let fd, published = false;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(saved, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    unchangedDirectories(checked);
    const current = readExisting(file, checked);
    requireThat(before ? current && sameContents(before.stat, current.stat) && before.bytes.equals(current.bytes) : !current,
      'preferences.json changed before saving. No concurrent change was replaced.');
    if (before) fs.renameSync(temporary, file);
    else {
      // Exclusive publication cannot replace an unrelated file created since
      // the last check. The temporary name is removed immediately afterwards.
      fs.linkSync(temporary, file);
      fs.unlinkSync(temporary);
    }
    published = true;
    if (process.platform !== 'win32') {
      const directoryFd = fs.openSync(directory, 'r');
      try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
    }
    return saved;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (!published) {
      unchangedDirectories(checked);
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
}

/** A later preference can tighten an existing run but cannot relax its seal. */
export function resolveSpendingPolicy({ preferences = readPreferences(), runPolicy } = {}) {
  const current = validate(preferences);
  const sealed = runPolicy === undefined ? defaults() : validate(runPolicy);
  return { version: 1, spending: current.spending === 'included-only' || sealed.spending === 'included-only'
    ? 'included-only' : 'subscription' };
}
