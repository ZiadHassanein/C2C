import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { runProcess } from './process.mjs';

const required = (ok, message) => { if (!ok) throw new Error(message); };
const isFile = filename => { try { return fs.statSync(filename).isFile(); } catch { return false; } };
const SHELL_WRAPPER = /\.(cmd|bat|ps1)$/i;

// Resolve known npm package layouts; never interpret or execute the shell shim.
// Optional platform packages may be nested, hoisted, or linked by the installer.
function npmCodexBinary(shim, arch) {
  if (path.basename(shim).toLowerCase() !== 'codex.cmd' || !isFile(shim)) return null;
  const triple = { x64: 'x86_64-pc-windows-msvc', arm64: 'aarch64-pc-windows-msvc' }[arch];
  if (!triple) return null;
  const packageFile = path.join(path.dirname(shim), 'node_modules', '@openai', 'codex', 'package.json');
  let metadata;
  try { metadata = JSON.parse(fs.readFileSync(packageFile, 'utf8')); } catch { return null; }
  if (metadata.name !== '@openai/codex' || metadata.bin?.codex !== 'bin/codex.js') return null;
  const packageRoot = path.dirname(fs.realpathSync(packageFile));
  const vendorRoots = [];
  try {
    const nativePackageFile = createRequire(path.join(packageRoot, 'package.json'))
      .resolve(`@openai/codex-win32-${arch}/package.json`);
    vendorRoots.push(path.join(path.dirname(nativePackageFile), 'vendor'));
  } catch { /* Earlier npm releases bundle vendor directly. */ }
  vendorRoots.push(path.join(packageRoot, 'vendor'));
  for (const vendor of vendorRoots) {
    for (const subdir of ['bin', 'codex']) {
      const executable = path.join(vendor, triple, subdir, 'codex.exe');
      if (isFile(executable)) return fs.realpathSync(executable);
    }
  }
  return null;
}

export function resolveExecutable(name, {
  env = process.env, platform = process.platform, arch = process.arch, home = os.homedir(),
} = {}) {
  required(['codex', 'claude'].includes(name), 'Unknown peer provider');
  const variable = `COUNCIL_${name.toUpperCase()}_BIN`;
  const resolveCandidate = candidate => {
    if (platform === 'win32' && name === 'codex' && /\.cmd$/i.test(candidate)) return npmCodexBinary(candidate, arch);
    if (SHELL_WRAPPER.test(candidate) || !isFile(candidate)) return null;
    return fs.realpathSync(candidate);
  };
  // An explicit override is authoritative: do not silently use another version.
  if (env[variable]) {
    const found = resolveCandidate(path.resolve(env[variable]));
    required(found, `${variable} does not resolve to an executable. Use a native binary or the codex.cmd shim beside an intact @openai/codex npm installation; arbitrary shell wrappers are unsupported.`);
    return found;
  }
  const pathValue = env.PATH ?? (platform === 'win32' ? env.Path : undefined) ?? '';
  for (const entry of pathValue.split(platform === 'win32' ? ';' : ':').filter(Boolean)) {
    const directory = entry.replace(/^"|"$/g, '');
    for (const suffix of platform === 'win32' ? ['.exe', ...(name === 'codex' ? ['.cmd'] : [])] : ['']) {
      const found = resolveCandidate(path.join(directory, `${name}${suffix}`));
      if (found) return found;
    }
  }
  if (name === 'claude') {
    const found = resolveCandidate(path.join(home, '.local', 'bin', platform === 'win32' ? 'claude.exe' : 'claude'));
    if (found) return found;
  }
  throw new Error(`${name} executable not found. Install its CLI or set ${variable} to its native executable. Windows npm Codex requires its platform binary; reinstall @openai/codex if it is missing.`);
}

export const CODEX_DISABLED_FEATURES = Object.freeze([
  'shell_tool', 'unified_exec', 'multi_agent', 'hooks', 'apps', 'plugins',
  'browser_use', 'computer_use', 'image_generation', 'in_app_browser',
  'code_mode', 'code_mode_host', 'view_image', 'memories',
]);
// Older Codex versions exposed view_image without a feature switch. Skipping
// an unknown flag would keep local-image access enabled, so fail closed here.
const REQUIRED_CODEX_FEATURES = ['shell_tool', 'unified_exec', 'view_image'];

export function parseCodexFeatures(stdout) {
  const names = new Set();
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-z][a-z0-9_.-]*)\s+.+?\s+(true|false)$/);
    if (match) names.add(match[1]);
  }
  required(names.size, 'Codex feature discovery returned no recognized features; update its CLI before using this skill');
  for (const name of REQUIRED_CODEX_FEATURES) {
    required(names.has(name), `Codex is missing required ${name} feature control; update its CLI or set COUNCIL_CODEX_BIN to a compatible native executable before using this skill`);
  }
  return [...names];
}

export function buildCodexArgs({ schemaPath, model, codexFeatures = CODEX_DISABLED_FEATURES }) {
  const supported = new Set(codexFeatures);
  for (const name of REQUIRED_CODEX_FEATURES) required(supported.has(name), `Codex is missing required ${name} feature control`);
  const args = ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--json', '--color', 'never', '--output-schema', schemaPath,
    '-c', 'approval_policy="never"', '-c', 'web_search="disabled"'];
  for (const feature of CODEX_DISABLED_FEATURES) if (supported.has(feature)) args.push('--disable', feature);
  if (model) args.push('--model', model);
  args.push('-');
  return args;
}

// Only metadata and authentication-status commands run here, never a model turn.
// doctor and ask share this preflight; ask must call it before reserving an attempt.
export async function probeProvider(provider, cwd, { run = runProcess, resolve = resolveExecutable } = {}) {
  required(['codex', 'claude'].includes(provider), 'Unknown peer provider');
  const executable = resolve(provider);
  const check = async (args, label) => {
    const result = await run(executable, args, { cwd, timeoutMs: 15000 });
    required(result.code === 0, `${provider} ${label} failed; update or repair its CLI before using this skill`);
    return result;
  };
  const version = await check(['--version'], 'version check');
  const help = await check(provider === 'codex' ? ['exec', '--help'] : ['--help'], 'help check');
  const flags = provider === 'codex'
    ? ['--ignore-user-config', '--output-schema', '--sandbox', '--ephemeral', '--disable', '--skip-git-repo-check', '--json', '--color']
    : ['--safe-mode', '--tools', '--permission-mode', '--strict-mcp-config', '--mcp-config', '--disable-slash-commands', '--json-schema', '--no-session-persistence', '--output-format', '--verbose'];
  for (const flag of flags) required(help.stdout.includes(flag), `${provider} is missing required ${flag}; update its CLI before using this skill`);
  let codexFeatures;
  if (provider === 'codex') codexFeatures = parseCodexFeatures((await check(['features', 'list'], 'feature discovery')).stdout);
  const auth = await run(executable, provider === 'codex' ? ['login', 'status'] : ['auth', 'status'], { cwd, timeoutMs: 15000 });
  let authenticated = false;
  if (provider === 'claude') {
    try { authenticated = auth.code === 0 && JSON.parse(auth.stdout).loggedIn === true; } catch { /* Signed out or unsupported response. */ }
  } else authenticated = auth.code === 0 && /logged in/i.test(auth.stdout + auth.stderr) && !/not logged in/i.test(auth.stdout + auth.stderr);
  return {
    provider, executable, version: version.stdout.trim(), authenticated,
    login_command: provider === 'codex' ? 'codex login' : 'claude auth login',
    ...(codexFeatures ? { codex_features: codexFeatures, disabled_features: CODEX_DISABLED_FEATURES.filter(name => codexFeatures.includes(name)) } : {}),
  };
}
