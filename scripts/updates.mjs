import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export const REPOSITORY = 'ZiadHassanein/C2C';
const API = `https://api.github.com/repos/${REPOSITORY}`;
const DAY = 24 * 60 * 60 * 1000;
const MAX_ARCHIVE = 8 * 1024 * 1024;
const MAX_TAR = 32 * 1024 * 1024;
const stable = value => typeof value === 'string' && /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(value);
const commitId = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
export function compareVersions(a, b) {
  requireThat(stable(a) && stable(b), 'Expected stable semantic versions.');
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
  return 0;
}

// Only public fixed-repository requests are made. No auth, task text, local paths,
// environment values, or project metadata are attached to these requests.
async function request(url, { fetchImpl = globalThis.fetch, limit = 1024 * 1024, deadline = Date.now() + 8000 } = {}) {
  const parsed = new URL(url);
  requireThat(parsed.protocol === 'https:' && !parsed.username && !parsed.password && (
    (parsed.hostname === 'api.github.com' && parsed.pathname.startsWith(`/repos/${REPOSITORY}/`)) ||
    (parsed.hostname === 'raw.githubusercontent.com' && parsed.pathname.startsWith(`/${REPOSITORY}/`)) ||
    (parsed.hostname === 'codeload.github.com' && parsed.pathname.startsWith(`/${REPOSITORY}/`))
  ), 'Unexpected update download origin.');
  const remaining = deadline - Date.now();
  requireThat(remaining > 0, 'Update check timed out.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
    const response = await fetchImpl(url, { redirect: 'error', signal: controller.signal, headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'C2C-update-check' } });
    requireThat(response.ok, `Update server returned HTTP ${response.status}.`);
    const declared = response.headers.get('content-length');
    requireThat(declared === null || (/^\d+$/.test(declared) && Number(declared) <= limit), 'Update response exceeds its size limit.');
    requireThat(response.body, 'Empty update response.');
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        requireThat(size <= limit, 'Update response exceeds its size limit.');
        chunks.push(Buffer.from(value));
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    return Buffer.concat(chunks);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Update check timed out.');
    // Network errors can include local configuration; keep CLI notices generic.
    if (error instanceof TypeError) throw new Error('Cannot reach the public update service.');
    throw error;
  } finally { clearTimeout(timer); }
}

export async function discoverLatest(options = {}) {
  const requestOptions = { ...options, deadline: options.deadline ?? Date.now() + 8000 };
  const tags = [];
  for (let page = 1; page <= 5; page++) {
    const batch = JSON.parse((await request(`${API}/tags?per_page=100${page > 1 ? `&page=${page}` : ''}`, requestOptions)).toString('utf8'));
    requireThat(Array.isArray(batch) && batch.length <= 100, 'Invalid release listing.');
    tags.push(...batch);
    if (batch.length < 100) break;
    requireThat(page < 5, 'Release listing exceeds the bounded update check; no latest version was assumed.');
  }
  const releases = tags.filter(tag => /^v/.test(tag?.name) && stable(tag.name.slice(1)) && commitId(tag.commit?.sha))
    .map(tag => ({ version: tag.name.slice(1), commit: tag.commit.sha }));
  requireThat(releases.length > 0, 'No stable published C2C version was found.');
  releases.sort((a, b) => compareVersions(b.version, a.version));
  const release = releases[0];
  const manifest = JSON.parse((await request(`https://raw.githubusercontent.com/${REPOSITORY}/${release.commit}/package.json`, { ...requestOptions, limit: 64 * 1024 })).toString('utf8'));
  requireThat(manifest.name === 'c2c' && manifest.version === release.version, 'Published tag and package version do not match.');
  return { ...release, url: `https://github.com/${REPOSITORY}/tree/v${release.version}` };
}

export function updateCachePath(environment = process.env) {
  const configuration = environment.CODEX_HOME || environment.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.codex');
  return path.resolve(configuration, 'c2c-update-check.json');
}
async function readCache(file) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) return null;
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (value.schema !== 1 || !Number.isFinite(value.checked_at)) return null;
    if (value.failure === true && value.release === null) return value;
    if (!stable(value.release?.version) || !commitId(value.release?.commit)) return null;
    return value;
  } catch { return null; }
}
async function writeCache(file, value) {
  let temporary;
  try {
    try { const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink()) return; } catch (error) { if (error.code !== 'ENOENT') return; }
    await fs.mkdir(path.dirname(file), { recursive: true });
    temporary = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, file);
  } catch { /* Update notices never block a plan when local cache is read-only. */ }
  finally { if (temporary) await fs.unlink(temporary).catch(() => {}); }
}

export async function checkUpdates({ version, automatic = false, cacheFile = updateCachePath(), environment = process.env, now = Date.now(), ...options }) {
  requireThat(stable(version), 'Invalid installed C2C version.');
  if (automatic && /^(0|off|false)$/i.test(environment.C2C_UPDATE_CHECK || '')) return { status: 'disabled', current_version: version, notify: false };
  const previous = await readCache(cacheFile);
  let cached = automatic && previous && now >= previous.checked_at && now - previous.checked_at < DAY;
  if (cached && previous.failure) return { status: 'unavailable', current_version: version, notify: false, cached: true, message: 'The previous update check was unavailable. Manual check-update can retry.' };
  let release;
  try { release = cached ? previous.release : await discoverLatest(options); }
  catch (error) {
    await writeCache(cacheFile, { schema: 1, checked_at: now, release: null, failure: true });
    return { status: 'unavailable', current_version: version, notify: false, message: error.message };
  }
  const available = compareVersions(release.version, version) > 0;
  // The calling chat handles once-per-chat deduplication; a shared cache must not
  // hide an available update from every subsequent chat on the same computer.
  const notify = available;
  await writeCache(cacheFile, { schema: 1, checked_at: cached ? previous.checked_at : now, release });
  return {
    status: available ? 'update_available' : 'current', current_version: version, latest_version: release.version,
    commit: release.commit, url: `https://github.com/${REPOSITORY}/tree/v${release.version}`,
    notify: Boolean(notify), cached: Boolean(cached),
    ...(available ? { message: `C2C ${release.version} is available. Ask to update C2C; active pinned plans keep their original version.` } : {}),
  };
}

function safeArchiveName(name) {
  requireThat(typeof name === 'string' && name.length < 512 && !name.includes('\\') && !name.includes('\0') && !name.startsWith('/') && !/^[a-z]:/i.test(name), 'Unsafe update archive path.');
  const parts = name.replace(/\/$/, '').split('/');
  requireThat(parts.length > 0 && parts.every(part => part && part !== '.' && part !== '..' && !part.includes(':')), 'Unsafe update archive path.');
  return parts;
}
function tarString(buffer) { return buffer.toString('utf8').replace(/\0.*$/s, ''); }
function tarNumber(buffer) {
  const value = tarString(buffer).trim();
  requireThat(/^[0-7]*$/.test(value), 'Unsupported update archive number.');
  return value ? parseInt(value, 8) : 0;
}
function paxValues(data) {
  const values = {};
  for (let offset = 0; offset < data.length;) {
    const space = data.indexOf(32, offset);
    requireThat(space > offset && space - offset < 12, 'Invalid update archive metadata.');
    const digits = data.subarray(offset, space).toString('ascii');
    requireThat(/^[1-9]\d*$/.test(digits), 'Invalid update archive metadata.');
    const length = Number(digits);
    requireThat(length > space - offset + 1 && offset + length <= data.length && data[offset + length - 1] === 10, 'Invalid update archive metadata.');
    const entry = data.subarray(space + 1, offset + length - 1).toString('utf8'), equal = entry.indexOf('=');
    requireThat(equal > 0, 'Invalid update archive metadata.');
    values[entry.slice(0, equal)] = entry.slice(equal + 1);
    offset += length;
  }
  return values;
}
const packageFile = name => /^(SKILL\.md|LICENSE|package\.json|agents\/[a-zA-Z0-9_.-]+\.ya?ml|references\/[a-zA-Z0-9_.-]+\.md|scripts\/[a-zA-Z0-9_.-]+\.(mjs|json))$/.test(name);
export function verifyArchive(archive, tree, commit) {
  requireThat(commitId(commit), 'Invalid release commit.');
  requireThat(archive.length <= MAX_ARCHIVE && tree && Array.isArray(tree.tree) && !tree.truncated && tree.tree.length <= 2000, 'Invalid or oversized release tree.');
  const expected = new Map();
  for (const entry of tree.tree) if (packageFile(entry.path)) {
    requireThat(entry.type === 'blob' && ['100644', '100755'].includes(entry.mode) && commitId(entry.sha), 'Linked or invalid packaged release file.');
    requireThat(!expected.has(entry.path), 'Duplicate packaged release file.');
    expected.set(entry.path, entry.sha);
  }
  for (const name of ['SKILL.md', 'LICENSE', 'package.json', 'scripts/install.mjs', 'scripts/setup.mjs']) requireThat(expected.has(name), `Release is missing ${name}.`);
  const tar = gunzipSync(archive, { maxOutputLength: MAX_TAR }), selected = new Map();
  let prefix, nextPax = {}, count = 0;
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    requireThat(++count <= 2000, 'Too many update archive entries.');
    const sum = header.reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);
    requireThat(sum === tarNumber(header.subarray(148, 156)), 'Invalid update archive checksum.');
    const size = tarNumber(header.subarray(124, 136));
    requireThat(size <= MAX_TAR && offset + 512 + size <= tar.length, 'Truncated or oversized update archive entry.');
    const type = String.fromCharCode(header[156] || 48), content = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    let name = tarString(header.subarray(0, 100)), directory = tarString(header.subarray(345, 500));
    if (directory) name = `${directory}/${name}`;
    safeArchiveName(name);
    if (type === 'g' || type === 'x') {
      const fields = paxValues(content);
      requireThat(!Object.keys(fields).some(key => /link|sparse/i.test(key)), 'Unsupported update archive metadata.');
      if (type === 'x') nextPax = fields;
      else requireThat(!('path' in fields) && !('size' in fields), 'Unsupported global update archive metadata.');
      continue;
    }
    requireThat(['0', '5'].includes(type), 'Linked or unsupported update archive entry.');
    requireThat(!('size' in nextPax), 'Unsupported update archive size override.');
    name = nextPax.path || name; nextPax = {};
    const parts = safeArchiveName(name);
    prefix ??= parts[0];
    requireThat(parts[0] === prefix && prefix === `C2C-${commit}`, 'Unexpected update archive root.');
    if (type === '5') { requireThat(size === 0, 'Invalid update archive directory.'); continue; }
    const relative = parts.slice(1).join('/');
    if (!expected.has(relative)) continue;
    requireThat(!selected.has(relative), 'Duplicate update archive file.');
    const hash = crypto.createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
    requireThat(hash === expected.get(relative), 'Release file does not match its pinned Git commit.');
    selected.set(relative, Buffer.from(content));
  }
  requireThat(selected.size === expected.size, 'Update archive is missing packaged release files.');
  return selected;
}

export async function stageRelease(release, { temporaryParent = os.tmpdir(), ...options } = {}) {
  requireThat(stable(release?.version) && commitId(release?.commit), 'Invalid published release.');
  const requestOptions = { ...options, deadline: options.deadline ?? Date.now() + 30000 };
  const tree = JSON.parse((await request(`${API}/git/trees/${release.commit}?recursive=1`, { ...requestOptions, limit: 2 * 1024 * 1024 })).toString('utf8'));
  const archive = await request(`https://codeload.github.com/${REPOSITORY}/tar.gz/${release.commit}`, { ...requestOptions, limit: MAX_ARCHIVE });
  const files = verifyArchive(archive, tree, release.commit);
  const manifest = JSON.parse(files.get('package.json').toString('utf8'));
  requireThat(manifest.name === 'c2c' && manifest.version === release.version, 'Downloaded package version does not match its release.');
  const parent = await fs.realpath(temporaryParent), directory = await fs.mkdtemp(path.join(parent, 'c2c-update-'));
  const cleanup = async () => {
    const resolved = await fs.realpath(directory);
    requireThat(path.dirname(resolved) === parent && path.basename(resolved).startsWith('c2c-update-'), 'Unsafe update cleanup path.');
    await fs.rm(resolved, { recursive: true, force: true });
  };
  try {
    for (const [relative, content] of files) {
      const destination = path.join(directory, ...relative.split('/'));
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, content, { flag: 'wx' });
    }
    return { directory, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
