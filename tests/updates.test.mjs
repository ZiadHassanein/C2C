import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { checkUpdates, compareVersions, discoverLatest, stageRelease, updateCachePath, verifyArchive } from '../scripts/updates.mjs';

const parent = await fs.realpath(os.tmpdir());
const root = await fs.mkdtemp(path.join(parent, 'c2c-update-test-'));
after(async () => {
  const resolved = await fs.realpath(root);
  assert.equal(path.dirname(resolved), parent);
  assert.ok(path.basename(resolved).startsWith('c2c-update-test-'));
  await fs.rm(resolved, { recursive: true, force: true });
});
const commit = 'a'.repeat(40);
const release = { version: '9.2.0', commit };
const api = 'https://api.github.com/repos/ZiadHassanein/C2C';
const manifest = JSON.stringify({ name: 'c2c', version: release.version });
function mockFetch(routes, requests = []) {
  return async (url, options) => {
    requests.push({ url, options });
    assert.equal(options.redirect, 'error');
    assert.deepEqual(Object.keys(options.headers).sort(), ['Accept', 'User-Agent']);
    assert.equal(options.method, undefined);
    assert.ok(options.signal instanceof AbortSignal);
    const result = routes[url];
    assert.ok(result !== undefined, `Unexpected URL: ${url}`);
    if (result instanceof Error) throw result;
    return result instanceof Response ? result : new Response(typeof result === 'string' || Buffer.isBuffer(result) ? result : JSON.stringify(result));
  };
}
function discoveryRoutes(tags = [{ name: `v${release.version}`, commit: { sha: commit } }]) {
  return { [`${api}/tags?per_page=100`]: tags, [`https://raw.githubusercontent.com/ZiadHassanein/C2C/${commit}/package.json`]: manifest };
}
const files = {
  'package.json': manifest, 'SKILL.md': '# Skill', LICENSE: 'MIT',
  'scripts/install.mjs': '// installer fixture', 'scripts/setup.mjs': '// setup fixture',
  'references/protocol.md': '# Protocol', 'agents/openai.yaml': 'interface: {}',
};
function gitHash(content) {
  const bytes = Buffer.from(content);
  return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
function tarFile(name, content, type = '0') {
  const bytes = Buffer.from(content), header = Buffer.alloc(512);
  assert.ok(Buffer.byteLength(name) <= 100);
  header.write(name);
  header.write('0000644\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(`${bytes.length.toString(8).padStart(11, '0')}\0`, 124);
  header.write('00000000000\0', 136);
  header.fill(32, 148, 156);
  header.write(type, 156);
  header.write('ustar\0', 257);
  header.write('00', 263);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148);
  return Buffer.concat([header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512)]);
}
function fixture(extra = [], entries = files) {
  const tree = { truncated: false, tree: Object.entries(entries).map(([name, content]) => ({ path: name, type: 'blob', mode: '100644', sha: gitHash(content) })) };
  const archive = gzipSync(Buffer.concat([
    ...Object.entries(entries).map(([name, content]) => tarFile(`C2C-${commit}/${name}`, content)),
    ...extra, Buffer.alloc(1024),
  ]));
  return { tree, archive };
}

test('version ordering accepts stable numeric releases only', () => {
  assert.equal(compareVersions('1.10.0', '1.9.99'), 1);
  assert.equal(compareVersions('2.0.0', '9.0.0'), -1);
  assert.equal(compareVersions('1.3.0', '1.3.0'), 0);
  for (const version of ['1.4.0-beta', 'v1.4.0', '01.4.0', '../../evil', '999999999.0.0']) assert.throws(() => compareVersions(version, '1.0.0'));
});

test('update cache defaults to a provider-neutral home and preserves explicit configuration precedence', () => {
  assert.equal(updateCachePath({}), path.join(os.homedir(), '.c2c', 'c2c-update-check.json'));
  assert.equal(updateCachePath({ CODEX_HOME: '', CLAUDE_CONFIG_DIR: '' }), updateCachePath({}));
  const codexHome = path.join(root, 'chosen-codex'), claudeHome = path.join(root, 'chosen-claude');
  assert.equal(updateCachePath({ CODEX_HOME: codexHome }), path.join(codexHome, 'c2c-update-check.json'));
  assert.equal(updateCachePath({ CLAUDE_CONFIG_DIR: claudeHome }), path.join(claudeHome, 'c2c-update-check.json'));
  assert.equal(updateCachePath({ CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeHome }), path.join(codexHome, 'c2c-update-check.json'));
});

test('an implicit cache follows the supplied environment while explicit cache paths still win', async () => {
  const configuration = path.join(root, 'injected-configuration');
  const environment = { CLAUDE_CONFIG_DIR: configuration }, requests = [];
  const result = await checkUpdates({ version: '1.3.0', environment, fetchImpl: mockFetch(discoveryRoutes(), requests) });
  assert.equal(result.status, 'update_available');
  assert.equal(JSON.parse(await fs.readFile(updateCachePath(environment), 'utf8')).release.version, release.version);
  const explicitCache = path.join(root, 'explicit-cache', 'cache.json');
  await checkUpdates({ version: '1.3.0', environment: { CODEX_HOME: path.join(root, 'unused-configuration') }, cacheFile: explicitCache, fetchImpl: mockFetch(discoveryRoutes()) });
  assert.equal(JSON.parse(await fs.readFile(explicitCache, 'utf8')).release.version, release.version);
  await assert.rejects(fs.access(path.join(root, 'unused-configuration')));
});

test('discovery selects the highest stable tag, pins its commit and checks matching package metadata', async () => {
  const requests = [];
  const tags = [
    { name: 'v1.3.0', commit: { sha: 'b'.repeat(40) } },
    { name: 'v10.0.0-beta', commit: { sha: 'c'.repeat(40) } },
    { name: 'v9.9.0', commit: { sha: 'not-a-commit' } },
    { name: 'v9.2.0', commit: { sha: commit }, tarball_url: 'https://evil.example/download' },
  ];
  assert.deepEqual(await discoverLatest({ fetchImpl: mockFetch(discoveryRoutes(tags), requests) }), { ...release, url: 'https://github.com/ZiadHassanein/C2C/tree/v9.2.0' });
  assert.equal(requests.length, 2);
  const wrong = discoveryRoutes();
  wrong[`https://raw.githubusercontent.com/ZiadHassanein/C2C/${commit}/package.json`] = { name: 'other-package', version: '9.2.0' };
  await assert.rejects(discoverLatest({ fetchImpl: mockFetch(wrong) }), /do not match/);
  await assert.rejects(discoverLatest({ fetchImpl: mockFetch(discoveryRoutes([])) }), /No stable/);
});

test('automatic notices cache for one day, remain visible to new chats and never install', async () => {
  const cacheFile = path.join(root, 'notice', 'cache.json'), requests = [];
  const options = { version: '1.3.0', automatic: true, cacheFile, environment: {}, now: 100000, fetchImpl: mockFetch(discoveryRoutes(), requests) };
  const first = await checkUpdates(options);
  assert.equal(first.status, 'update_available');
  assert.equal(first.notify, true);
  assert.equal(first.cached, false);
  const again = await checkUpdates({ ...options, now: 100001 });
  assert.equal(again.notify, true);
  assert.equal(again.cached, true);
  assert.equal(requests.length, 2);
  const installed = await checkUpdates({ ...options, version: '9.2.0', now: 100002 });
  assert.equal(installed.status, 'current');
  assert.equal(installed.notify, false);
  await checkUpdates({ ...options, now: 100000 + 86400000 });
  assert.equal(requests.length, 4);
  await checkUpdates({ ...options, automatic: false, now: 100000 + 86400001 });
  assert.equal(requests.length, 6, 'manual checks bypass the cache');
  assert.deepEqual(await fs.readdir(path.dirname(cacheFile)), ['cache.json']);
});

test('discovery reads bounded additional tag pages and refuses an incomplete listing', async () => {
  const page = Array.from({ length: 100 }, (_, i) => ({ name: `v0.1.${i}`, commit: { sha: 'b'.repeat(40) } }));
  const routes = discoveryRoutes(page);
  routes[`${api}/tags?per_page=100&page=2`] = [{ name: 'v9.2.0', commit: { sha: commit } }];
  assert.equal((await discoverLatest({ fetchImpl: mockFetch(routes) })).version, '9.2.0');
  for (let i = 2; i <= 5; i++) routes[`${api}/tags?per_page=100&page=${i}`] = page;
  await assert.rejects(discoverLatest({ fetchImpl: mockFetch(routes) }), /bounded update check/);
});

test('automatic opt-out performs no network or cache writes; explicit checks still work', async () => {
  const cacheFile = path.join(root, 'disabled', 'cache.json');
  let count = 0;
  for (const value of ['off', 'false', '0', 'OFF']) {
    const result = await checkUpdates({ version: '1.3.0', automatic: true, cacheFile, environment: { C2C_UPDATE_CHECK: value }, fetchImpl: () => { count++; throw new Error('Do not request'); } });
    assert.equal(result.status, 'disabled');
  }
  assert.equal(count, 0);
  await assert.rejects(fs.access(path.dirname(cacheFile)));
  assert.equal((await checkUpdates({ version: '1.3.0', cacheFile, environment: { C2C_UPDATE_CHECK: 'off' }, fetchImpl: mockFetch(discoveryRoutes()) })).status, 'update_available');
});

test('failed automatic checks are quiet and cached; manual check can immediately recover', async () => {
  const cacheFile = path.join(root, 'offline', 'cache.json');
  let count = 0;
  const options = { version: '1.3.0', automatic: true, cacheFile, environment: {}, now: 2000, fetchImpl: async () => { count++; throw new TypeError('private host config'); } };
  const first = await checkUpdates(options);
  assert.equal(first.status, 'unavailable');
  assert.equal(first.notify, false);
  assert.doesNotMatch(first.message, /private host/);
  assert.equal((await checkUpdates({ ...options, now: 2001 })).cached, true);
  assert.equal(count, 1);
  assert.equal((await checkUpdates({ ...options, automatic: false, fetchImpl: mockFetch(discoveryRoutes()) })).status, 'update_available');
});

test('discovery bounds response sizes, failure status, redirects and elapsed time', async () => {
  await assert.rejects(discoverLatest({ fetchImpl: mockFetch({ [`${api}/tags?per_page=100`]: new Response('[]', { status: 429 }) }) }), /HTTP 429/);
  await assert.rejects(discoverLatest({ fetchImpl: mockFetch({ [`${api}/tags?per_page=100`]: new Response('[]', { headers: { 'content-length': '999999999' } }) }) }), /size limit/);
  await assert.rejects(discoverLatest({ fetchImpl: mockFetch({ [`${api}/tags?per_page=100`]: new Response(Buffer.alloc(1024 * 1024 + 1)) }) }), /size limit/);
  await assert.rejects(discoverLatest({ deadline: Date.now() - 1, fetchImpl: () => assert.fail('deadline must prevent fetch') }), /timed out/);
  await assert.rejects(discoverLatest({ deadline: Date.now() + 20, fetchImpl: (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Abort')), { once: true })) }), /timed out/);
  await assert.rejects(discoverLatest({ fetchImpl: mockFetch({ [`${api}/tags?per_page=100`]: new TypeError('redirect is not allowed') }) }), /Cannot reach/);
});

test('archive verification selects only packaged files and validates every Git blob', () => {
  const fixtureFiles = { ...files, 'README.md': '# Excluded readme' };
  const { archive, tree } = fixture([], fixtureFiles);
  const selected = verifyArchive(archive, tree, commit);
  assert.deepEqual([...selected.keys()].sort(), Object.keys(files).sort());
  tree.tree.find(entry => entry.path === 'SKILL.md').sha = '0'.repeat(40);
  assert.throws(() => verifyArchive(archive, tree, commit), /pinned Git commit/);
});

test('archives reject links, path traversal, duplicate files, wrong roots and missing files', () => {
  for (const extra of [
    tarFile(`C2C-${commit}/link`, '', '2'), tarFile(`C2C-${commit}/hardlink`, '', '1'),
    tarFile(`C2C-${commit}/../escape`, 'bad'), tarFile('/absolute', 'bad'),
    tarFile(`C2C-${commit}/scripts\\escape`, 'bad'), tarFile(`C2C-${commit}/SKILL.md`, files['SKILL.md']),
    tarFile('other-root/a', 'bad'),
  ]) {
    const { archive, tree } = fixture([extra]);
    assert.throws(() => verifyArchive(archive, tree, commit));
  }
  const { tree } = fixture();
  assert.throws(() => verifyArchive(gzipSync(Buffer.alloc(1024)), tree, commit), /missing packaged/);
  const badHeader = tarFile(`C2C-${commit}/SKILL.md`, files['SKILL.md']); badHeader[10] ^= 1;
  assert.throws(() => verifyArchive(gzipSync(badHeader), tree, commit), /checksum/);
  tree.tree.find(entry => entry.path === 'SKILL.md').mode = '120000';
  assert.throws(() => verifyArchive(fixture().archive, tree, commit), /Linked/);
});

test('verified release stages in a private temporary directory and cleans up without touching installations', async () => {
  const { archive, tree } = fixture();
  const requests = [];
  const staged = await stageRelease(release, { temporaryParent: root, fetchImpl: mockFetch({
    [`${api}/git/trees/${commit}?recursive=1`]: tree,
    [`https://codeload.github.com/ZiadHassanein/C2C/tar.gz/${commit}`]: archive,
  }, requests) });
  assert.equal(path.dirname(staged.directory), root);
  assert.equal(await fs.readFile(path.join(staged.directory, 'SKILL.md'), 'utf8'), '# Skill');
  assert.equal(requests.length, 2);
  await staged.cleanup();
  await assert.rejects(fs.access(staged.directory));
});
