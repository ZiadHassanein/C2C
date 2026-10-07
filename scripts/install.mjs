#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const source = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node scripts/install.mjs [--target both|codex|claude]\nInstalls C2C for the current user. Existing different files are never overwritten. Move a legacy codex-claude-council installation outside the skill roots before installing.');
  process.exit(0);
}
if (args.length && (args.length !== 2 || args[0] !== '--target' || !['both', 'codex', 'claude'].includes(args[1]))) {
  console.error('Use --target both|codex|claude, or no arguments for both.'); process.exit(1);
}
const target = args[1] || 'both';
const skillRoots = [
  ...(target !== 'claude' ? [path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills')] : []),
  ...(target !== 'codex' ? [path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'skills')] : []),
];
const targets = skillRoots.map(root => path.join(root, 'C2C'));
const files = ['SKILL.md', 'agents/openai.yaml', 'references/protocol.md', 'references/project-assessment.md', 'references/plan-presentation.md', 'references/model-selection.md', 'scripts/council.mjs', 'scripts/process.mjs', 'scripts/assessment.mjs', 'scripts/adapters.mjs', 'scripts/state.mjs', 'scripts/discussion.mjs', 'scripts/participants.mjs', 'scripts/budget.mjs', 'scripts/progress.mjs', 'package.json', 'LICENSE'];
function sameInstalledText(existing, packaged) {
  // Latin-1 preserves every byte, including BOMs and invalid UTF-8. Only
  // Windows line endings are equivalent; other edits still require a backup.
  return existing.equals(packaged) || existing.toString('latin1').replace(/\r\n/g, '\n') === packaged.toString('latin1').replace(/\r\n/g, '\n');
}
try {
  for (const file of files) if (!fs.statSync(path.join(source, file)).isFile()) throw new Error(`Missing package file: ${file}`);
  for (const root of skillRoots) {
    const legacy = path.join(root, 'codex-claude-council');
    if (fs.existsSync(legacy)) {
      throw new Error(`A legacy installation exists at ${legacy}. Back it up and move that directory outside all Codex and Claude Code skill roots, then rerun this installer. No selected installation has been changed.`);
    }
  }
  for (const dest of targets) {
    if (fs.existsSync(dest)) {
      for (const file of files) {
        const existing = path.join(dest, file);
        if (!fs.existsSync(existing) || !sameInstalledText(fs.readFileSync(existing), fs.readFileSync(path.join(source, file)))) {
          throw new Error(`A different installation exists at ${dest}. Back it up and move that named skill directory outside all Codex and Claude Code skill roots before installing this version.`);
        }
      }
    }
  }
  for (const dest of targets) {
    if (fs.existsSync(dest)) { console.log(`Already installed: ${dest}`); continue; }
    fs.mkdirSync(dest, { recursive: true });
    for (const file of files) {
      const output = path.join(dest, file);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.copyFileSync(path.join(source, file), output, fs.constants.COPYFILE_EXCL);
    }
    console.log(`Installed: ${dest}`);
  }
  console.log('Start a new Codex or Claude Code chat to discover the skill. Run the council runner doctor command to check peer CLI readiness.');
} catch (error) {
  console.error(`Install: ${error.message}`); process.exitCode = 1;
}
