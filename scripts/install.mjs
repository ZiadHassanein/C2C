#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { atomicWriteFile, acquireRunLock } from './state.mjs';
import { compareVersions } from './updates.mjs';

const source = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const receiptName = '.c2c-install.json';
const files = ['SKILL.md', 'agents/openai.yaml', 'references/protocol.md', 'references/project-assessment.md', 'references/plan-presentation.md', 'references/model-selection.md', 'scripts/council.mjs', 'scripts/process.mjs', 'scripts/assessment.mjs', 'scripts/adapters.mjs', 'scripts/state.mjs', 'scripts/discussion.mjs', 'scripts/participants.mjs', 'scripts/budget.mjs', 'scripts/progress.mjs', 'scripts/evidence.mjs', 'scripts/usage.mjs', 'scripts/plan-quality.mjs', 'scripts/guidance.mjs', 'scripts/projection.mjs', 'scripts/review-diff.mjs', 'scripts/install.mjs', 'scripts/install-baselines.json', 'scripts/setup.mjs', 'scripts/runtime.mjs', 'scripts/updates.mjs', 'package.json', 'LICENSE'];
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const exists = file => { try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const hash = bytes => crypto.createHash('sha256').update(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1').digest('hex');
const transactionId = id => typeof id === 'string' && /^\d{17}-[a-f0-9]{12}$/.test(id);
const contained = (parent, child) => { const relative = path.relative(parent, child); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); };
const maintenanceCommand = (mode, id, target) => `${process.env.C2C_SETUP_LAUNCHER ? `${process.env.C2C_SETUP_LAUNCHER} ${mode}` : `node scripts/install.mjs --${mode}`} ${id} --target ${target}`;

// Resolve linked configuration roots, but never follow links inside a managed
// installation or backup. Unknown user-owned files must not disappear in a swap.
function canonical(file) {
  if (exists(file)) return fs.realpathSync(file);
  return path.join(canonical(path.dirname(file)), path.basename(file));
}
function regular(file) {
  const stats = fs.lstatSync(file);
  requireThat(stats.isFile() && !stats.isSymbolicLink(), `Expected a regular file: ${file}`);
  return stats;
}
function json(file) {
  requireThat(regular(file).size <= 256 * 1024, `Oversized installer metadata: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function inventory(directory) {
  const result = {};
  function visit(dir, prefix = '') {
    const stats = fs.lstatSync(dir);
    requireThat(stats.isDirectory() && !stats.isSymbolicLink(), `Linked or non-directory installation path: ${dir}`);
    const entries = fs.readdirSync(dir).sort();
    if (prefix && !entries.length) result[`${prefix}/`] = 'directory';
    for (const entry of entries) {
      const file = path.join(dir, entry), relative = prefix ? `${prefix}/${entry}` : entry;
      const info = fs.lstatSync(file);
      requireThat(!info.isSymbolicLink(), `Linked installation entry: ${file}`);
      if (info.isDirectory()) visit(file, relative);
      else { regular(file); result[relative] = hash(fs.readFileSync(file)); }
    }
  }
  visit(directory);
  return result;
}
function equal(a, b) {
  const keys = Object.keys(a).sort();
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}
function sameState(actual, expected) {
  return actual === null || expected === null ? actual === expected : equal(actual, expected);
}
function validManifest(value) {
  requireThat(value?.schema === 1 && typeof value.version === 'string' && value.version.length < 80 && value.files && typeof value.files === 'object' && !Array.isArray(value.files), 'Invalid managed installation receipt');
  const names = Object.keys(value.files);
  requireThat(names.length > 0 && names.length <= 200 && names.includes('SKILL.md') && names.includes('package.json'), 'Invalid managed file list');
  for (const name of names) requireThat(/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(name) && !name.split('/').some(part => part === '.' || part === '..') && name !== receiptName && /^[a-f0-9]{64}$/.test(value.files[name]), 'Invalid managed file path or hash');
  return value;
}
function packaged() {
  const entries = Object.fromEntries(files.map(file => { regular(path.join(source, file)); return [file, hash(fs.readFileSync(path.join(source, file)))]; }));
  return validManifest({ schema: 1, version: json(path.join(source, 'package.json')).version, files: entries });
}
function installed(dest, release) {
  try {
    const snapshot = inventory(dest);
    const content = { ...snapshot }; delete content[receiptName];
    let manifest;
    if (exists(path.join(dest, receiptName))) manifest = validManifest(json(path.join(dest, receiptName)));
    else {
      const baselines = json(path.join(source, 'scripts/install-baselines.json')).map(validManifest);
      manifest = [release, ...baselines].find(candidate => equal(candidate.files, content));
      requireThat(manifest, 'receipt-less files do not match this package or a trusted release baseline');
    }
    requireThat(equal(manifest.files, content), 'managed files were modified, added or removed');
    requireThat(json(path.join(dest, 'package.json')).version === manifest.version, 'receipt version differs from package version');
    return { manifest, snapshot };
  } catch (error) {
    throw new Error(`A different installation exists at ${dest}: ${error.message}. Preserve local changes outside all skill roots before replacing it; no force overwrite is available.`);
  }
}
function assertSnapshot(directory, expected) {
  requireThat(exists(directory) && equal(inventory(directory), expected), `Installation or backup changed: ${directory}`);
}
function copySnapshot(from, to, snapshot) {
  fs.mkdirSync(to);
  for (const file of Object.keys(snapshot)) {
    requireThat(!file.endsWith('/'), 'Cannot copy untracked directories');
    const output = path.join(to, file);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.copyFileSync(path.join(from, file), output, fs.constants.COPYFILE_EXCL);
  }
  assertSnapshot(to, snapshot);
}
function recordAt(target, id) {
  requireThat(transactionId(id), 'Invalid backup ID; use the exact ID printed by the installer');
  const directory = path.join(target.backups, id);
  const recordFile = path.join(directory, 'transaction.json');
  requireThat(canonical(directory) === directory, `Linked backup directory refused: ${directory}`);
  const record = json(recordFile);
  requireThat(record.schema === 1 && record.id === id && record.dest === target.dest && ['prepared', 'committed', 'recovering', 'recovered'].includes(record.status), `Backup metadata does not match selected installation: ${recordFile}`);
  for (const snapshot of [record.before, record.after].filter(Boolean)) {
    requireThat(typeof snapshot === 'object' && !Array.isArray(snapshot) && Object.keys(snapshot).length <= 201, 'Invalid backup snapshot');
    for (const [file, digest] of Object.entries(snapshot)) requireThat(/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(file) && !file.split('/').some(part => part === '.' || part === '..') && /^[a-f0-9]{64}$/.test(digest), 'Invalid backup snapshot entry');
  }
  requireThat(record.after && Object.keys(record.after).length > 0 || record.operation === 'uninstall' && record.after === null && record.before && Object.keys(record.before).length > 0, 'Missing installed snapshot');
  return { ...target, directory, recordFile, record };
}
function recoveryState(part) {
  const { record, dest, directory } = part;
  const original = path.join(directory, 'original');
  const current = exists(dest) ? inventory(dest) : null;
  if (exists(original)) {
    requireThat(record.before, 'Unexpected original backup');
    assertSnapshot(original, record.before);
    requireThat(current === null || sameState(current, record.after), `Current installation changed; recovery refused: ${dest}`);
    return 'restore';
  }
  if (record.before) {
    requireThat(current && equal(current, record.before), `Missing original backup; recovery refused: ${dest}`);
    return 'untouched';
  }
  requireThat(current === null || sameState(current, record.after), `Current installation changed; recovery refused: ${dest}`);
  return current ? 'remove-new' : 'untouched';
}
function restore(part) {
  const state = recoveryState(part);
  if (state !== 'untouched') {
    if (exists(part.dest)) fs.renameSync(part.dest, path.join(part.directory, `interrupted-${crypto.randomUUID()}`));
    if (state === 'restore') fs.renameSync(path.join(part.directory, 'original'), part.dest);
  }
  part.record.status = 'recovered';
  atomicWriteFile(part.recordFile, part.record);
}
function beginRecovery(parts) {
  for (const part of parts) recoveryState(part);
  // Publish intent for the whole selected group before restoring one host.
  // Otherwise a crash after recovering the last prepared host could leave only
  // committed/recovered records, making the unfinished rollback unrecognizable.
  for (const part of parts) {
    if (part.record.status === 'recovered') continue;
    part.record.status = 'recovering';
    atomicWriteFile(part.recordFile, part.record);
  }
}
function parse(argv) {
  const options = { target: 'both', mode: 'install' };
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    requireThat(!seen.has(flag), `Repeated option: ${flag}`); seen.add(flag);
    if (flag === '--target') options.target = argv[++index];
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--no-downgrade') options.noDowngrade = true;
    else if (flag === '--update' || flag === '--uninstall' || flag === '--rollback' || flag === '--recover') {
      requireThat(options.mode === 'install', 'Choose only one of --update, --uninstall, --rollback ID or --recover ID');
      options.mode = flag.slice(2);
      if (flag === '--rollback' || flag === '--recover') { options.id = argv[++index]; requireThat(transactionId(options.id), `${flag} requires the exact backup ID printed by the installer`); }
    } else throw new Error(`Unknown option: ${flag}. Run --help.`);
  }
  requireThat(['both', 'codex', 'claude'].includes(options.target), 'Use --target both|codex|claude');
  requireThat(!options.dryRun || !['rollback', 'recover'].includes(options.mode), '--dry-run supports install, --update and --uninstall only');
  requireThat(!options.noDowngrade || options.mode === 'update', '--no-downgrade requires --update');
  return options;
}

const releases = [];
try {
  if (process.argv.slice(2).includes('--help')) {
    console.log('node scripts/install.mjs [--target both|codex|claude] [--update | --uninstall | --rollback ID | --recover ID] [--dry-run]\nInstall C2C, safely update or uninstall a clean managed installation, restore a retained original backup, or recover an interrupted transaction. Preview install/update/uninstall with --dry-run without writing files. Uninstall moves the skill to a retained backup; missing installs are already uninstalled. Backups are kept in c2c-install-backups beside skills. Modified/unknown files are never overwritten or removed. Receipt-less v0.11.3 installs are recognized by release hashes. Move legacy codex-claude-council folders outside skill roots first. Finish unpinned active plans before updates; use setup.mjs update --run RUN to retain a pinned plan. Stop active workers before uninstall. Start a new chat for the changed skill.');
  } else {
    const options = parse(process.argv.slice(2));
    const release = packaged();
    const allHomes = [process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')];
    const allSkillRoots = allHomes.map(home => canonical(path.join(path.resolve(home), 'skills')));
    const homes = options.target === 'both' ? allHomes : [allHomes[options.target === 'codex' ? 0 : 1]];
    const targets = [...new Map(homes.map(home => {
      const root = canonical(path.resolve(home));
      const skills = canonical(path.join(root, 'skills'));
      const dest = path.join(skills, 'C2C');
      const prefix = path.basename(skills) === 'skills' ? '' : `${path.basename(skills)}-`;
      return [dest, { dest, skills, backups: path.join(path.dirname(skills), `${prefix}c2c-install-backups`), lockRoot: path.join(path.dirname(skills), `.${prefix}c2c-installer-lock`) }];
    })).values()];
    for (const target of targets) {
      requireThat(canonical(target.backups) === target.backups && !allSkillRoots.some(skills => contained(skills, target.backups) || contained(target.backups, skills)), 'Installer backups must be outside every skill root and must not be linked');
      requireThat(canonical(target.lockRoot) === target.lockRoot && !allSkillRoots.some(skills => contained(skills, target.lockRoot) || contained(target.lockRoot, skills)), 'Installer locks must be outside every skill root and must not be linked');
      const legacy = path.join(target.skills, 'codex-claude-council');
      requireThat(!exists(legacy), `A legacy installation exists at ${legacy}. Back it up and move that directory outside all Codex and Claude Code skill roots, then rerun this installer. No selected installation has been changed.`);
    }
    // Locks serialize installers only; close active C2C runs before replacement.
    // Key locks to physical destinations, including when different configured
    // homes have linked skills roots pointing to one shared installation.
    if (!options.dryRun) {
      for (const lockRoot of [...new Set(targets.map(target => target.lockRoot))].sort()) {
        fs.mkdirSync(lockRoot, { recursive: true });
        releases.push(acquireRunLock(lockRoot));
      }
      for (const target of targets) fs.mkdirSync(target.backups, { recursive: true });
    }
    if (options.mode === 'recover') {
      const parts = targets.filter(target => exists(path.join(target.backups, options.id, 'transaction.json'))).map(target => recordAt(target, options.id));
      requireThat(parts.some(part => ['prepared', 'recovering'].includes(part.record.status)), 'No interrupted selected transaction found for this ID');
      beginRecovery(parts);
      for (const part of parts.reverse()) restore(part);
      console.log(`Recovered original installations: ${options.id}`);
    } else {
      for (const target of targets) for (const id of (exists(target.backups) ? fs.readdirSync(target.backups) : []).filter(transactionId)) {
        if (!exists(path.join(target.backups, id, 'transaction.json'))) continue;
        const part = recordAt(target, id);
        requireThat(!['prepared', 'recovering'].includes(part.record.status), `Interrupted installation ${id}. Run ${maintenanceCommand('recover', id, options.target)} before retrying.`);
      }
      const operations = [];
      for (const target of targets) {
        const current = exists(target.dest) ? installed(target.dest, release) : null;
        requireThat(options.mode !== 'update' || current, `No installed skill to update: ${target.dest}. Install first, or select only an installed provider with --target codex|claude.`);
        // Latest-version downloads may finish after another installer has placed
        // a newer release. Recheck all selected targets while holding their locks.
        if (options.noDowngrade && current) requireThat(compareVersions(current.manifest.version, release.version) <= 0, `Installed C2C ${current.manifest.version} is newer than downloaded C2C ${release.version}; refusing to downgrade ${target.dest}.`);
        if (options.mode === 'rollback') {
          const backup = recordAt(target, options.id);
          requireThat(backup.record.status === 'committed' && backup.record.before, `No retained original installation in backup ${options.id}`);
          if (backup.record.after === null) requireThat(!current, `An installation appeared after uninstall: ${target.dest}. Preserve or uninstall it before restoring this backup.`);
          else requireThat(current, `No installed skill to roll back: ${target.dest}`);
          const original = path.join(backup.directory, 'original');
          assertSnapshot(original, backup.record.before);
          operations.push({ ...target, before: current?.snapshot ?? null, after: backup.record.before, copyFrom: original, version: backup.record.previousVersion });
        } else if (options.mode === 'uninstall') {
          if (current) operations.push({ ...target, before: current.snapshot, after: null, version: null, previousVersion: current.manifest.version });
          else console.log(`Already uninstalled: ${target.dest}`);
        } else if (current && equal(current.manifest.files, release.files)) console.log(`Already installed: ${target.dest}`);
        else {
          requireThat(!current || options.mode === 'update', `A different installation exists at ${target.dest}. Run node scripts/install.mjs --update to upgrade a clean managed installation.`);
          const receipt = JSON.stringify(release, null, 2) + '\n';
          operations.push({ ...target, before: current?.snapshot ?? null, after: { ...release.files, [receiptName]: hash(Buffer.from(receipt)) }, receipt, version: release.version, previousVersion: current?.manifest.version ?? null });
        }
      }
      if (options.dryRun) {
        for (const operation of operations) {
          console.log(`Would ${options.mode === 'uninstall' ? 'uninstall' : operation.before ? 'update' : 'install'}: ${operation.dest}`);
          if (operation.before) console.log(`Would retain original backup outside skill discovery: ${operation.backups}`);
        }
        console.log('Preview complete. No files changed; run without --dry-run to apply.');
      }
      if (operations.length && !options.dryRun) {
        const id = new Date().toISOString().replace(/\D/g, '') + '-' + crypto.randomBytes(6).toString('hex');
        const parts = [];
        try {
          for (const operation of operations) {
            const directory = path.join(operation.backups, id);
            fs.mkdirSync(directory);
            const replacement = path.join(directory, 'replacement');
            if (operation.copyFrom) copySnapshot(operation.copyFrom, replacement, operation.after);
            else if (operation.after) {
              copySnapshot(source, replacement, release.files);
              fs.writeFileSync(path.join(replacement, receiptName), operation.receipt, { flag: 'wx' });
            }
            if (operation.after) assertSnapshot(replacement, operation.after);
            const record = { schema: 1, id, dest: operation.dest, status: 'prepared', operation: options.mode, previousVersion: operation.previousVersion ?? (operation.before ? json(path.join(operation.dest, 'package.json')).version : null), version: operation.version, before: operation.before, after: operation.after };
            const part = { ...operation, directory, recordFile: path.join(directory, 'transaction.json'), record };
            atomicWriteFile(part.recordFile, record);
            parts.push(part);
          }
          for (const part of parts) {
            if (part.before) assertSnapshot(part.dest, part.before);
            else requireThat(!exists(part.dest), `Installation appeared during staging: ${part.dest}`);
          }
          for (const part of parts) {
            fs.mkdirSync(path.dirname(part.dest), { recursive: true });
            if (part.before) {
              assertSnapshot(part.dest, part.before);
              fs.renameSync(part.dest, path.join(part.directory, 'original'));
              assertSnapshot(path.join(part.directory, 'original'), part.before);
            } else requireThat(!exists(part.dest), `Installation appeared during staging: ${part.dest}`);
            if (part.after) {
              fs.renameSync(path.join(part.directory, 'replacement'), part.dest);
              assertSnapshot(part.dest, part.after);
            } else requireThat(!exists(part.dest), `Installation appeared during uninstall: ${part.dest}`);
          }
          for (const part of parts) { part.record.status = 'committed'; atomicWriteFile(part.recordFile, part.record); }
        } catch (error) {
          try { beginRecovery(parts); for (const part of [...parts].reverse()) restore(part); }
          catch (recoveryError) { throw new Error(`${error.message}. Recovery requires inspection: ${recoveryError.message}. Preserve backups and run ${maintenanceCommand('recover', id, options.target)}.`); }
          throw new Error(`${error.message}. Original installations restored; staged files retained under backup ID ${id}.`);
        }
        for (const part of parts) {
          console.log(`${options.mode === 'uninstall' ? 'Uninstalled' : options.mode === 'rollback' ? 'Rolled back' : part.before ? 'Updated' : 'Installed'}: ${part.dest}${part.version ? ` (${part.version})` : ''}`);
          if (part.before) console.log(`Backup: ${part.directory}`);
        }
        if (parts.some(part => part.before)) {
          const undoTarget = parts.length === targets.length ? options.target : parts[0].dest === path.join(allSkillRoots[0], 'C2C') ? 'codex' : 'claude';
          console.log(`Backup ID: ${id}\nUndo: ${maintenanceCommand('rollback', id, undoTarget)}`);
        }
      }
      if (!options.dryRun) console.log(options.mode === 'uninstall' ? 'Start a new Codex or Claude Code chat to stop discovering the removed skill. Projects, other settings and retained backups are unchanged.' : 'Start a new Codex or Claude Code chat to discover the skill. Run the council runner doctor command to check peer CLI readiness.');
    }
  }
} catch (error) {
  console.error(`Install: ${error.message}`); process.exitCode = 1;
} finally {
  for (const release of releases.reverse()) {
    try { release(); } catch (error) { console.error(`Install: lock cleanup failed: ${error.message}`); process.exitCode = 1; }
  }
}
