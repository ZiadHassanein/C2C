#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(fs.readFileSync(path.join(directory, '../package.json'), 'utf8'));
const launcher = `npx --yes https://github.com/ZiadHassanein/C2C/archive/refs/tags/v${version}.tar.gz`;
const [action = 'help', ...args] = process.argv.slice(2);

function help() {
  console.log(`C2C ${version}

Install:    ${launcher} install
Uninstall: ${launcher} uninstall

From a downloaded C2C folder: node scripts/setup.mjs <command>

Commands:
  install       Add C2C to Codex and Claude Code for this user
  update        Safely update selected existing installations
  uninstall     Remove C2C from discovery; retain a recoverable backup
  rollback ID   Restore the backup printed after an update or uninstall
  recover ID    Restore the original state after an interrupted change
  doctor        Check local worker setup without a model request
  version       Show this package version
  help          Show these instructions

Options for install, update and uninstall:
  --target codex|claude|both   Choose an app (default: both)
  --dry-run                   Preview without changing files
Rollback and recover also accept --target.

Finish active C2C runs before updating or uninstalling.
Customized or unknown files are protected. No provider is installed or signed in.
Start a new chat after a change: $C2C in Codex, /C2C in Claude Code.`);
}

try {
  if (['help', '--help', '-h'].includes(action)) help();
  else if (['version', '--version', '-v'].includes(action)) {
    if (args.length) throw new Error('version takes no options.');
    console.log(`C2C ${version}`);
  } else {
    let script, forwarded;
    if (['install', 'update', 'uninstall', 'rollback', 'recover'].includes(action)) {
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
    const environment = { ...process.env, C2C_SETUP_LAUNCHER: launcher };
    for (const key of ['CODEX_HOME', 'CLAUDE_CONFIG_DIR']) {
      if (environment[key]) environment[key] = path.resolve(environment[key]);
    }
    const workingDirectory = os.tmpdir();
    process.chdir(workingDirectory);
    const result = spawnSync(process.execPath, [path.join(directory, script), ...forwarded], {
      // Avoid holding the installed skill as the working directory during removal.
      cwd: workingDirectory, shell: false, windowsHide: true, stdio: 'inherit',
      env: environment,
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(`C2C setup: ${error.message}`);
  process.exitCode = 1;
}
