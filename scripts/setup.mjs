#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkUpdates, compareVersions, discoverLatest, stageRelease } from './updates.mjs';
import { readPreferences, writePreferences, preferencesPath } from './preferences.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(fs.readFileSync(path.join(directory, '../package.json'), 'utf8'));
const launcherFor = selectedVersion => `npx --yes https://github.com/ZiadHassanein/C2C/archive/refs/tags/v${selectedVersion}.tar.gz`;
const launcher = launcherFor(version);
const [action = 'help', ...args] = process.argv.slice(2);

function help() {
  console.log(`C2C ${version}

Install:    ${launcher} install
Uninstall: ${launcher} uninstall

From a downloaded or installed C2C folder: node scripts/setup.mjs <command>

Commands:
  install       Add this C2C package to Codex and Claude Code for this user
  check-update  Check for a newer stable version (JSON; --auto checks daily)
  update        Download and safely apply the latest stable published version
  uninstall     Remove C2C from discovery; retain a recoverable backup
  rollback ID   Restore the backup printed after an update or uninstall
  recover ID    Restore the original state after an interrupted change
  doctor        Check local worker setup without a model request
  version       Show this package version
  help          Show these instructions

Options for install, update and uninstall:
  --target codex|claude|both   Choose an app (default: both)
  --dry-run                   Preview without changing installed files
Update also accepts:
  --run RUN                  Verify an active plan can retain its pinned version
  --source                   Use this package offline instead of downloading
Rollback and recover also accept --target.

Preferences: ${launcher} preferences [--spending subscription|included-only]

Pinned plans keep their original version during an update. Finish legacy runs first.
Set C2C_UPDATE_CHECK=off to disable automatic notices; no update installs itself.
Customized or unknown files are protected. No provider is installed or signed in.
New chats use the updated skill: $C2C in Codex, /C2C in Claude Code.`);
}

function updateOptions(values) {
  let source = false, run = null;
  const forwarded = [];
  for (let index = 0; index < values.length; index++) {
    const option = values[index];
    if (option === '--source' && !source) source = true;
    else if (option === '--run' && run === null) {
      if (!values[index + 1] || values[index + 1].startsWith('--')) throw new Error('--run requires a run directory.');
      run = path.resolve(values[++index]);
    } else if (option === '--target' && !forwarded.includes('--target')) {
      const target = values[++index];
      if (!['codex', 'claude', 'both'].includes(target)) throw new Error('--target must be codex, claude or both.');
      forwarded.push('--target', target);
    } else if (option === '--dry-run' && !forwarded.includes(option)) forwarded.push(option);
    else throw new Error(`Unsupported or duplicate update option: ${option}`);
  }
  return { source, run, forwarded };
}
function runScript(script, forwarded, selectedVersion = version) {
  const environment = { ...process.env, C2C_SETUP_LAUNCHER: launcherFor(selectedVersion) };
  for (const key of ['CODEX_HOME', 'CLAUDE_CONFIG_DIR']) {
    if (environment[key]) environment[key] = path.resolve(environment[key]);
  }
  const workingDirectory = os.tmpdir();
  process.chdir(workingDirectory);
  const result = spawnSync(process.execPath, [script, ...forwarded], {
    // Avoid holding the installed skill as the working directory during removal.
    cwd: workingDirectory, shell: false, windowsHide: true, stdio: 'inherit', env: environment,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

function preventInstalledDowngrade(releaseVersion, forwarded) {
  const targetIndex = forwarded.indexOf('--target');
  const target = targetIndex < 0 ? 'both' : forwarded[targetIndex + 1];
  const roots = {
    codex: process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
    claude: process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  };
  for (const app of target === 'both' ? ['codex', 'claude'] : [target]) {
    const manifest = path.resolve(roots[app], 'skills/C2C/package.json');
    let stat;
    try { stat = fs.lstatSync(manifest); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw new Error(`Cannot inspect ${app}'s installed C2C version safely.`);
    const installed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (compareVersions(installed.version, releaseVersion) > 0) throw new Error(`${app} already has C2C ${installed.version}; the published version would downgrade it. Use rollback for a deliberate version change.`);
  }
}

try {
  if (['help', '--help', '-h'].includes(action)) help();
  else if (action === 'preferences') {
    if (args.length === 0) console.log(JSON.stringify({ path: preferencesPath(), ...readPreferences() }, null, 2));
    else {
      if (args.length !== 2 || args[0] !== '--spending' || !['subscription', 'included-only'].includes(args[1])) throw new Error('Use preferences [--spending subscription|included-only]');
      console.log(JSON.stringify({ path: preferencesPath(), ...writePreferences({ spending: args[1] }), note: 'Preference saved for both apps. This changes no billing setting and is not allowance evidence. Existing sealed runs cannot be weakened.' }, null, 2));
    }
  }
  else if (['version', '--version', '-v'].includes(action)) {
    if (args.length) throw new Error('version takes no options.');
    console.log(`C2C ${version}`);
  } else if (action === 'check-update') {
    if (args.length > 1 || (args.length === 1 && args[0] !== '--auto')) throw new Error('check-update accepts only --auto.');
    console.log(JSON.stringify(await checkUpdates({ version, automatic: args.includes('--auto') }), null, 2));
  } else if (action === 'update') {
    const options = updateOptions(args);
    if (options.run) {
      const { inspectRunRuntime } = await import('./runtime.mjs');
      const runtime = await inspectRunRuntime(options.run, { allowLegacy: true });
      if (!runtime.pinned && runtime.status !== 'complete') throw new Error('Legacy run has no pinned C2C runtime; finish it with its original installation before updating.');
      if (runtime.pinned) console.log(`Active plan remains on C2C ${runtime.version}. New chats use the updated skill.`);
    }
    if (options.source) runScript(path.join(directory, 'install.mjs'), ['--update', ...options.forwarded]);
    else {
      const release = await discoverLatest();
      if (compareVersions(release.version, version) < 0) throw new Error('The published version is older than this package. Use update --source for an explicit offline source update.');
      preventInstalledDowngrade(release.version, options.forwarded);
      console.log(`Verified published C2C ${release.version} (${release.commit.slice(0, 12)}).`);
      const staged = await stageRelease(release);
      try { runScript(path.join(staged.directory, 'scripts/install.mjs'), ['--update', '--no-downgrade', ...options.forwarded], release.version); }
      finally { await staged.cleanup(); }
    }
  } else {
    let script, forwarded;
    if (['install', 'uninstall', 'rollback', 'recover'].includes(action)) {
      script = 'install.mjs';
      // Actions are explicit and limited; arguments remain separate argv entries.
      if (action === 'install' && args.some(arg => ['--update', '--uninstall', '--rollback', '--recover'].includes(arg))) {
        throw new Error('Choose one command: install, update, uninstall, rollback or recover.');
      }
      forwarded = action === 'install' ? args : [`--${action}`, ...args];
    } else if (action === 'doctor') {
      if (args.length) throw new Error('doctor takes no options.');
      script = 'council.mjs';
      forwarded = ['doctor'];
    } else throw new Error(`Unknown command: ${action}. Run help for available commands.`);
    runScript(path.join(directory, script), forwarded);
  }
} catch (error) {
  console.error(`C2C setup: ${error.message}`);
  process.exitCode = 1;
}
