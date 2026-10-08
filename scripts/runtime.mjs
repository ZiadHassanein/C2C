// Locally trusted, content-addressed planning runtimes. Never execute code from
// a run directory, and never fetch a missing runtime implicitly.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { atomicWriteFile, readRunState } from './state.mjs';

export const RUNTIME_FILES = Object.freeze([
  'SKILL.md', 'references/model-selection.md', 'references/plan-presentation.md',
  'references/project-assessment.md', 'references/protocol.md', 'package.json',
  'scripts/adapters.mjs', 'scripts/assessment.mjs', 'scripts/budget.mjs',
  'scripts/council.mjs', 'scripts/discussion.mjs', 'scripts/evidence.mjs',
  'scripts/participants.mjs', 'scripts/process.mjs', 'scripts/progress.mjs',
  'scripts/runtime.mjs', 'scripts/state.mjs',
].sort());
const MANIFEST = 'runtime.json';
const HASH = /^[a-f0-9]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };
const exists = file => { try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const contained = (parent, child) => { const relative = path.relative(parent, child); return !relative || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
function canonical(file) {
  return exists(file) ? fs.realpathSync(file) : path.join(canonical(path.dirname(file)), path.basename(file));
}
function regular(file, limit = 2 * 1024 * 1024, trusted = false) {
  const stat = fs.lstatSync(file);
  requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size <= limit, `Expected a bounded regular runtime file: ${file}`);
  if (trusted && typeof process.getuid === 'function') requireThat(stat.uid === process.getuid() && (stat.mode & 0o022) === 0, `Runtime file must be owned by this user and not writable by others: ${file}`);
  return fs.readFileSync(file);
}
function directory(file, trusted = true) {
  const stat = fs.lstatSync(file);
  requireThat(stat.isDirectory() && !stat.isSymbolicLink(), `Linked or non-directory runtime path: ${file}`);
  if (trusted && typeof process.getuid === 'function') requireThat(stat.uid === process.getuid() && (stat.mode & 0o022) === 0, `Runtime directory must be owned by this user and not writable by others: ${file}`);
}
function checkedFile(root, file, trusted = false) {
  let current = root;
  for (const part of file.split('/').slice(0, -1)) { current = path.join(current, part); directory(current, trusted); }
  return regular(path.join(root, ...file.split('/')), undefined, trusted);
}
function identity(version, files) { return { schema: 1, version, digest: hash(JSON.stringify({ schema: 1, version, files })) }; }
function validatePin(pin) {
  requireThat(pin && pin.schema === 1 && SEMVER.test(pin.version) && HASH.test(pin.digest) && Object.keys(pin).sort().join(',') === 'digest,schema,version', 'Invalid pinned C2C runtime identity');
}
function runtimeAccess(action, work) {
  try { return work(); }
  catch (error) {
    if (!['EACCES', 'EPERM', 'EROFS'].includes(error.code) || error.reason === 'runtime_access_denied') throw error;
    throw Object.assign(new Error(`Cannot ${action}: local filesystem access was denied (${error.code}). This is not a provider or usage-limit failure. Request the required filesystem access from the host. Before a new run, C2C_RUNTIME_HOME may select a private, persistent, user-owned directory outside the installation and project/run; use that same value for every later command. For an existing run, preserve its original trusted runtime and plan; do not reset attempts or substitute current code. Original error: ${error.message}`, { cause: error }), { code: error.code, reason: 'runtime_access_denied' });
  }
}
export function runtimeHome() {
  const selected = process.env.C2C_RUNTIME_HOME?.trim();
  return runtimeAccess('resolve the trusted C2C runtime store', () => canonical(path.resolve(selected || path.join(os.homedir(), '.c2c', 'runtimes'))));
}

/** Capture package identity in memory at module load; prepare checks it again. */
export function packageRuntimeIdentity(source) {
  const root = fs.realpathSync(source);
  const files = Object.fromEntries(RUNTIME_FILES.map(file => [file, hash(checkedFile(root, file))]));
  const version = JSON.parse(checkedFile(root, 'package.json')).version;
  requireThat(SEMVER.test(version), 'Invalid C2C package version');
  return identity(version, files);
}

function validateBundle(root, pin) {
  validatePin(pin); directory(root);
  const manifest = JSON.parse(regular(path.join(root, MANIFEST), 65536, true));
  requireThat(manifest?.schema === 1 && manifest.version === pin.version && manifest.digest === pin.digest && manifest.files && typeof manifest.files === 'object', 'Pinned C2C runtime manifest does not match the run');
  const names = Object.keys(manifest.files).sort();
  requireThat(names.length > 0 && names.length <= 100 && names.every(file => /^(?:SKILL\.md|package\.json|scripts\/[a-z][a-z0-9-]*\.mjs|references\/[a-z][a-z0-9-]*\.md)$/.test(file)) && names.includes('scripts/council.mjs') && names.includes('SKILL.md') && names.includes('package.json'), 'Unsupported pinned runtime files');
  const files = Object.fromEntries(names.map(file => {
    requireThat(HASH.test(manifest.files[file]) && hash(checkedFile(root, file, true)) === manifest.files[file], `Pinned C2C runtime changed: ${file}. Preserve the run; do not replace it with the current version.`);
    return [file, manifest.files[file]];
  }));
  requireThat(identity(manifest.version, files).digest === pin.digest && JSON.parse(checkedFile(root, 'package.json', true)).version === pin.version, 'Pinned C2C runtime identity does not match its files');
  const expected = new Set([...names, MANIFEST]);
  function inventory(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir)) {
      const relative = prefix ? `${prefix}/${entry}` : entry;
      const item = path.join(dir, entry), stat = fs.lstatSync(item);
      requireThat(!stat.isSymbolicLink(), `Linked pinned runtime entry: ${relative}`);
      if (stat.isDirectory()) { directory(item); requireThat(names.some(name => name.startsWith(`${relative}/`)), `Unexpected pinned runtime directory: ${relative}`); inventory(item, relative); }
      else requireThat(stat.isFile() && expected.has(relative), `Unexpected pinned runtime entry: ${relative}`);
    }
  }
  inventory(root);
  return { pinned: true, version: pin.version, digest: pin.digest, root,
    runner: path.join(root, 'scripts', 'council.mjs'), instructions: path.join(root, 'SKILL.md') };
}

/** Register only code from the installed package, never from private run inputs. */
export function pinRuntime(source, loadedIdentity) {
  const sourceRoot = fs.realpathSync(source), home = runtimeHome();
  requireThat(!contained(sourceRoot, home), 'C2C_RUNTIME_HOME must be outside the installation');
  const files = Object.fromEntries(RUNTIME_FILES.map(file => [file, checkedFile(sourceRoot, file)]));
  const version = JSON.parse(files['package.json']).version;
  const hashes = Object.fromEntries(RUNTIME_FILES.map(file => [file, hash(files[file])]));
  const pin = identity(version, hashes);
  requireThat(JSON.stringify(pin) === JSON.stringify(loadedIdentity), 'C2C changed after this process started. Retry preparation with the installed version; no plan was created.');
  return runtimeAccess('prepare the trusted C2C runtime', () => {
    fs.mkdirSync(home, { recursive: true, mode: 0o700 }); directory(home);
    const destination = path.join(home, pin.digest);
    if (exists(destination)) return { pin, ...validateBundle(destination, pin) };
    const stage = fs.mkdtempSync(path.join(home, '.prepare-')); directory(stage);
    try {
      for (const [file, bytes] of Object.entries(files)) {
        const target = path.join(stage, ...file.split('/'));
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
        fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
      }
      atomicWriteFile(path.join(stage, MANIFEST), { ...pin, files: hashes });
      validateBundle(stage, pin);
      try { fs.renameSync(stage, destination); }
      catch (error) { if (!exists(destination)) throw error; validateBundle(destination, pin); }
      return { pin, ...validateBundle(destination, pin) };
    } finally {
      // stage is an owned, newly created direct child; never clean a run or cache.
      if (exists(stage)) { requireThat(path.dirname(stage) === home && path.basename(stage).startsWith('.prepare-'), 'Unsafe runtime staging cleanup'); fs.rmSync(stage, { recursive: true, force: true }); }
    }
  });
}

/** Read-only guard shared by the runner and updater. A run cannot supply code. */
export function inspectRunRuntime(run, { allowLegacy = false } = {}) {
  requireThat(run, '--run is required');
  const dir = fs.realpathSync(path.resolve(run));
  const state = readRunState(dir);
  const snapshotBytes = regular(path.join(dir, 'snapshot.json'));
  const snapshot = JSON.parse(snapshotBytes);
  if (!state.runtime && !snapshot.runtime) {
    requireThat(allowLegacy, 'Legacy run has no pinned C2C runtime; finish it with its original installation before updating. Do not migrate or reset its attempts.');
    return { pinned: false, version: null, status: state.status };
  }
  validatePin(state.runtime);
  requireThat(state.seals?.['snapshot.json'] === hash(snapshotBytes.toString('utf8').replace(/^\uFEFF/, '')), 'Sealed artifact changed: snapshot.json');
  requireThat(JSON.stringify(state.runtime) === JSON.stringify(snapshot.runtime), 'Pinned C2C runtime identity changed after preparation');
  const home = runtimeHome();
  requireThat(!contained(dir, home), 'Trusted C2C runtime store cannot be inside a plan directory');
  return runtimeAccess('read the pinned C2C runtime', () => {
    directory(home);
    const root = path.join(home, state.runtime.digest);
    requireThat(exists(root), 'Pinned C2C runtime is missing from this user\'s trusted store. Preserve the plan and restore its original trusted runtime; no current-version fallback is allowed.');
    return { ...validateBundle(root, state.runtime), status: state.status };
  });
}

export function assertMatchingRuntime(run, loadedIdentity, { allowLegacy = false } = {}) {
  const runtime = inspectRunRuntime(run, { allowLegacy });
  requireThat(!runtime.pinned || runtime.digest === loadedIdentity.digest, 'This plan uses a different C2C runtime. Invoke its pinned runner or the installed CLI with --run; do not use another version\'s imported API.');
  return runtime;
}

export function validateRunOutput(out, source) {
  const selected = canonical(path.resolve(out)), installed = fs.realpathSync(source), home = runtimeHome();
  requireThat(!contained(installed, selected) && !contained(home, selected) && !contained(selected, home), 'Run output must be outside the C2C installation and trusted runtime store');
}

/** Preparation itself runs from a stable bundle, before any new run is written. */
export function routePrepareCommand(argv, source, loadedIdentity, out) {
  if (out) validateRunOutput(out, source);
  const runtime = pinRuntime(source, loadedIdentity);
  if (fs.realpathSync(source) === runtime.root) return false;
  const result = spawnSync(process.execPath, [runtime.runner, ...argv], { cwd: process.cwd(), env: process.env, stdio: 'inherit', windowsHide: true, shell: false });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  return true;
}

/** Forward through a validated, fixed store path before any run command acts. */
export function routeRunCommand(argv, entry) {
  const runIndices = argv.flatMap((value, index) => value === '--run' ? [index] : []);
  if (!runIndices.length) return false;
  requireThat(runIndices.length === 1, 'Duplicate option: --run');
  requireThat(argv[runIndices[0] + 1] && !argv[runIndices[0] + 1].startsWith('--'), 'Invalid option: --run requires a directory');
  const runtime = inspectRunRuntime(argv[runIndices[0] + 1], { allowLegacy: ['status', 'progress'].includes(argv[0]) });
  if (!runtime.pinned || fs.realpathSync(entry) === runtime.runner) return false;
  const result = spawnSync(process.execPath, [runtime.runner, ...argv], { cwd: process.cwd(), env: process.env, stdio: 'inherit', windowsHide: true, shell: false });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  return true;
}
