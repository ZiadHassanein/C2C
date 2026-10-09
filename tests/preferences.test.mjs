import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readPreferences, writePreferences, resolveSpendingPolicy, preferencesPath } from '../scripts/preferences.mjs';

const temporaryParent = fs.realpathSync(os.tmpdir());
const root = fs.mkdtempSync(path.join(temporaryParent, 'c2c-preferences-'));
const subscription = { version: 1, spending: 'subscription' };
const includedOnly = { version: 1, spending: 'included-only' };
after(() => {
  const resolved = fs.realpathSync(root);
  assert.equal(path.dirname(resolved), temporaryParent);
  assert.ok(path.basename(resolved).startsWith('c2c-preferences-'));
  fs.rmSync(resolved, { recursive: true, force: true });
});
function context(name) {
  const homeDir = fs.mkdtempSync(path.join(root, `${name}-`));
  const configHome = path.join(homeDir, 'shared');
  return { homeDir, configHome, env: {} };
}
function raw(context, bytes) {
  fs.mkdirSync(context.configHome, { recursive: true, mode: 0o700 });
  const file = preferencesPath(context);
  fs.writeFileSync(file, bytes, { mode: 0o600 });
  return file;
}
function unchangedInvalid(context, bytes, pattern = /preferences/) {
  const file = raw(context, bytes);
  const original = fs.readFileSync(file);
  assert.throws(() => readPreferences(context), pattern);
  assert.throws(() => writePreferences({ spending: 'subscription' }, context), pattern);
  assert.deepEqual(fs.readFileSync(file), original);
  assert.deepEqual(fs.readdirSync(context.configHome), ['preferences.json']);
}
function linkDirectory(t, target, name) {
  try { fs.symlinkSync(target, name, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Directory links unavailable on this host.'); return false; }
    throw error;
  }
  return true;
}

test('missing shared preferences preserve subscription behavior without creating files', () => {
  const options = context('default');
  assert.deepEqual(readPreferences(options), subscription);
  assert.equal(fs.existsSync(options.configHome), false);
  const value = readPreferences(options);
  value.spending = 'included-only';
  assert.deepEqual(readPreferences(options), subscription);
});

test('Codex and Claude homes share the independent C2C preferences location across fresh reads', () => {
  const options = context('shared');
  const codex = { homeDir: options.homeDir, env: { CODEX_HOME: path.join(options.homeDir, 'codex') } };
  const claude = { homeDir: options.homeDir, env: { CLAUDE_CONFIG_DIR: path.join(options.homeDir, 'claude') } };
  assert.equal(preferencesPath(codex), path.join(options.homeDir, '.c2c', 'preferences.json'));
  assert.equal(preferencesPath(codex), preferencesPath(claude));
  assert.deepEqual(writePreferences({ spending: 'included-only' }, codex), includedOnly);
  assert.deepEqual(readPreferences(claude), includedOnly);
  assert.deepEqual(writePreferences({ spending: 'subscription' }, claude), subscription);
  assert.deepEqual(readPreferences(codex), subscription);
  assert.deepEqual(fs.readdirSync(options.homeDir), ['.c2c']);
});

test('explicit config home and C2C_CONFIG_HOME each select one shared bounded file', () => {
  const options = context('override');
  const environmentHome = path.join(options.homeDir, 'environment');
  const viaEnvironment = { homeDir: options.homeDir, env: { C2C_CONFIG_HOME: environmentHome } };
  writePreferences({ spending: 'included-only' }, viaEnvironment);
  assert.deepEqual(readPreferences({ ...options, env: viaEnvironment.env }), subscription);
  assert.deepEqual(readPreferences(viaEnvironment), includedOnly);
  assert.equal(fs.existsSync(options.configHome), false);
  assert.equal(fs.existsSync(path.join(options.homeDir, '.c2c')), false);
});

test('invalid location overrides fail instead of silently selecting a different home', () => {
  const options = context('invalid-location');
  for (const configHome of ['', '  ', 'relative/path', 7, `${options.configHome}\0suffix`]) {
    assert.throws(() => readPreferences({ ...options, configHome }), /absolute directory/);
    assert.throws(() => writePreferences({ spending: 'included-only' }, { ...options, configHome }), /absolute directory/);
  }
  assert.throws(() => readPreferences({ homeDir: options.homeDir, env: { C2C_CONFIG_HOME: '' } }), /absolute directory/);
  assert.deepEqual(fs.readdirSync(options.homeDir), []);
});

test('only supported nonsecret spending selections are stored', () => {
  const options = context('values');
  for (const value of [null, [], {}, { spending: 'paid' }, { spending: 'included-only', token: 'do-not-store' }, { version: 1, spending: 'subscription' }]) {
    assert.throws(() => writePreferences(value, options), /preferences/);
  }
  assert.equal(fs.existsSync(options.configHome), false);
  writePreferences({ spending: 'included-only' }, options);
  const file = preferencesPath(options);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), includedOnly);
  assert.deepEqual(fs.readdirSync(options.configHome), ['preferences.json']);
});

test('corrupt JSON, unsupported versions and unrelated fields cannot become permissive defaults or be overwritten', () => {
  const values = ['{', '', 'null', '[]', '{}', JSON.stringify({ spending: 'included-only' }),
    JSON.stringify({ version: 2, spending: 'included-only' }), JSON.stringify({ version: 1, spending: 'unknown' }),
    JSON.stringify({ version: 1, spending: 'included-only', token: 'PRIVATE-FIXTURE-CONTENT' })];
  for (const [index, bytes] of values.entries()) unchangedInvalid(context(`malformed-${index}`), bytes);
  const options = context('private-error');
  raw(options, '{"secret":"PRIVATE-FIXTURE-CONTENT", broken');
  assert.throws(() => readPreferences(options), error => !error.message.includes('PRIVATE-FIXTURE-CONTENT'));
});

test('duplicate fields cannot silently relax an included-only preference', () => {
  for (const [index, bytes] of [
    '{"version":1,"spending":"included-only","spending":"subscription"}',
    '{"version":2,"version":1,"spending":"subscription"}',
    '{"version":1,"spending":"included-only","spe\\u006eding":"subscription"}',
  ].entries()) unchangedInvalid(context(`duplicate-${index}`), bytes, /exactly once/);
});

test('JSON key ordering, spacing and escaped spelling remain supported', () => {
  const options = context('valid-json');
  raw(options, '{ "spe\\u006eding" : "included-only", "version" : 1 }\n');
  assert.deepEqual(readPreferences(options), includedOnly);
});

test('preference reads have a fixed byte limit and reject invalid UTF-8', () => {
  const options = context('maximum');
  const body = JSON.stringify(includedOnly);
  raw(options, body.padEnd(4096, ' '));
  assert.deepEqual(readPreferences(options), includedOnly);
  unchangedInvalid(context('oversize'), body.padEnd(4097, ' '), /4096 bytes/);
  unchangedInvalid(context('encoding'), Buffer.from([0xff, 0xfe, 0x7b]), /UTF-8 JSON/);
});

test('nonregular files and non-directory config ancestors fail closed', () => {
  const directory = context('directory-file');
  fs.mkdirSync(preferencesPath(directory), { recursive: true, mode: 0o700 });
  assert.throws(() => readPreferences(directory), /regular file/);
  assert.throws(() => writePreferences({ spending: 'included-only' }, directory), /regular file/);
  const ancestor = context('file-ancestor');
  fs.writeFileSync(ancestor.configHome, 'unrelated');
  assert.throws(() => readPreferences(ancestor), /non-directory ancestor/);
  assert.throws(() => writePreferences({ spending: 'included-only' }, ancestor), /non-directory ancestor/);
  assert.equal(fs.readFileSync(ancestor.configHome, 'utf8'), 'unrelated');
});

test('linked config roots are refused for both reads and writes', t => {
  const options = context('linked-root');
  const target = path.join(options.homeDir, 'target');
  fs.mkdirSync(target, { mode: 0o700 });
  if (!linkDirectory(t, target, options.configHome)) return;
  assert.throws(() => readPreferences(options), /linked/);
  assert.throws(() => writePreferences({ spending: 'included-only' }, options), /linked/);
  assert.deepEqual(fs.readdirSync(target), []);
});

test('linked ancestors and linked default homes cannot hide behind a missing config directory', t => {
  const options = context('linked-ancestor');
  const target = path.join(options.homeDir, 'target');
  const linkedHome = path.join(options.homeDir, 'linked-home');
  fs.mkdirSync(target, { mode: 0o700 });
  if (!linkDirectory(t, target, linkedHome)) return;
  for (const selection of [
    { configHome: path.join(linkedHome, 'nested', 'settings') },
    { homeDir: linkedHome, env: {} },
  ]) {
    assert.throws(() => readPreferences(selection), /linked/);
    assert.throws(() => writePreferences({ spending: 'included-only' }, selection), /linked/);
  }
  assert.deepEqual(fs.readdirSync(target), []);
});

test('linked preference files are refused without changing their target', t => {
  const options = context('linked-file');
  const target = path.join(options.homeDir, 'original.json');
  fs.mkdirSync(options.configHome, { mode: 0o700 });
  fs.writeFileSync(target, JSON.stringify(includedOnly), { mode: 0o600 });
  try { fs.symlinkSync(target, preferencesPath(options), 'file'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('File symlinks unavailable on this host.'); return; }
    throw error;
  }
  assert.throws(() => readPreferences(options), /regular file/);
  assert.throws(() => writePreferences({ spending: 'subscription' }, options), /regular file/);
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), includedOnly);
});

test('hard-linked preference files are refused without modifying either name', () => {
  const options = context('hard-link');
  const file = raw(options, JSON.stringify(includedOnly));
  const second = path.join(options.homeDir, 'same-inode.json');
  fs.linkSync(file, second);
  assert.throws(() => readPreferences(options), /regular file/);
  assert.throws(() => writePreferences({ spending: 'subscription' }, options), /regular file/);
  assert.deepEqual(fs.readFileSync(file), fs.readFileSync(second));
});

test('new POSIX config directories and replacement files retain restrictive permissions', { skip: process.platform === 'win32' }, () => {
  const options = context('permissions');
  options.configHome = path.join(options.configHome, 'nested');
  writePreferences({ spending: 'included-only' }, options);
  assert.equal(fs.statSync(options.configHome).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.dirname(options.configHome)).mode & 0o777, 0o700);
  const file = preferencesPath(options);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  fs.chmodSync(file, 0o644);
  writePreferences({ spending: 'subscription' }, options);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('POSIX policy locations writable by other users fail closed', { skip: process.platform === 'win32' }, () => {
  const options = context('unsafe-permissions');
  const file = raw(options, JSON.stringify(includedOnly));
  fs.chmodSync(file, 0o666);
  assert.throws(() => readPreferences(options), /not writable by others/);
  assert.throws(() => writePreferences({ spending: 'subscription' }, options), /not writable by others/);
  fs.chmodSync(file, 0o600);
  fs.chmodSync(options.configHome, 0o777);
  assert.throws(() => readPreferences(options), /not writable by others/);
  assert.throws(() => writePreferences({ spending: 'subscription' }, options), /not writable by others/);
  fs.chmodSync(options.configHome, 0o700);
});

test('failed atomic replacement preserves the prior policy and removes its temporary file', () => {
  const options = context('publish-failure');
  writePreferences({ spending: 'included-only' }, options);
  const rename = fs.renameSync;
  fs.renameSync = () => { throw Object.assign(new Error('fixture rename denied'), { code: 'EACCES' }); };
  try { assert.throws(() => writePreferences({ spending: 'subscription' }, options), /fixture rename denied/); }
  finally { fs.renameSync = rename; }
  assert.deepEqual(readPreferences(options), includedOnly);
  assert.deepEqual(fs.readdirSync(options.configHome), ['preferences.json']);
});

test('a concurrent malformed replacement is preserved instead of being overwritten', () => {
  const options = context('concurrent-change');
  writePreferences({ spending: 'included-only' }, options);
  const write = fs.writeFileSync;
  fs.writeFileSync = (...args) => {
    const result = write(...args);
    if (typeof args[0] === 'number') write(preferencesPath(options), 'unrelated malformed content');
    return result;
  };
  try { assert.throws(() => writePreferences({ spending: 'subscription' }, options), /UTF-8 JSON/); }
  finally { fs.writeFileSync = write; }
  assert.equal(fs.readFileSync(preferencesPath(options), 'utf8'), 'unrelated malformed content');
  assert.deepEqual(fs.readdirSync(options.configHome), ['preferences.json']);
});

test('exclusive first publication never replaces a file created just before publication', () => {
  const options = context('concurrent-create');
  const link = fs.linkSync;
  fs.linkSync = (from, to) => {
    fs.writeFileSync(to, 'unrelated concurrent creation', { flag: 'wx', mode: 0o600 });
    return link(from, to);
  };
  try { assert.throws(() => writePreferences({ spending: 'included-only' }, options), { code: 'EEXIST' }); }
  finally { fs.linkSync = link; }
  assert.equal(fs.readFileSync(preferencesPath(options), 'utf8'), 'unrelated concurrent creation');
  assert.deepEqual(fs.readdirSync(options.configHome), ['preferences.json']);
});

test('later tightening applies to existing runs while a saved strict run cannot silently relax', () => {
  for (const preferences of [subscription, includedOnly]) {
    for (const runPolicy of [undefined, subscription, includedOnly]) {
      const expected = preferences.spending === 'included-only' || runPolicy?.spending === 'included-only' ? includedOnly : subscription;
      assert.deepEqual(resolveSpendingPolicy({ preferences, runPolicy }), expected);
    }
  }
  assert.deepEqual(subscription, { version: 1, spending: 'subscription' });
  assert.deepEqual(includedOnly, { version: 1, spending: 'included-only' });
});

test('invalid current or sealed policy cannot be treated as a permissive legacy run', () => {
  for (const invalid of [null, {}, { version: 2, spending: 'subscription' }, { version: 1, spending: 'paid' }, { ...includedOnly, eligible: true }]) {
    assert.throws(() => resolveSpendingPolicy({ preferences: invalid, runPolicy: includedOnly }), /preferences/);
    assert.throws(() => resolveSpendingPolicy({ preferences: subscription, runPolicy: invalid }), /preferences/);
  }
  assert.deepEqual(Object.keys(resolveSpendingPolicy({ preferences: includedOnly })), ['version', 'spending']);
});
