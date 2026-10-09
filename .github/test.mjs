// Run the same test files as npm test, publishing skips without calling them passes.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
const files = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts.test.split(' ').slice(2);
if (!files.length || files.some(file => !/^tests\/[a-z-]+\.test\.mjs$/.test(file))) throw new Error('Unexpected test command');
// Avoid concurrent cold PowerShell identity helpers across Windows suites.
// Intentional lock/worker concurrency remains inside the individual tests.
const concurrency = process.platform === 'win32' ? 1 : 2;
const child = spawn(process.execPath, ['--test', `--test-concurrency=${concurrency}`, '--test-reporter=tap', ...files], { shell: false, windowsHide: true });
let output = '';
child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
child.stderr.pipe(process.stderr);
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('close', code => {
  const results = output.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^(ok|not ok) \d+ - (.*?)(?: # (SKIP|TODO).*)?$/);
    return match ? [{ name: match[2], passed: match[1] === 'ok' && !match[3], skipped: match[3] === 'SKIP' }] : [];
  });
  const required = [
    'spawn registration completes before any prompt bytes or EOF reach the worker',
    'failed or asynchronous spawn registration withholds prompt delivery and cleans up',
    'a surviving registered worker blocks duplication after coordinator hardkill until confirmed dead',
    'worker recovery guard permits dead or reused PIDs but also checks failed unreleased attempts',
    'worker recovery guard refuses pending, invalid, alive and ambiguous registrations without changing history',
    'owned child identity preflight rejects unavailable inspection without sending input',
  ];
  const missing = required.filter(name => !results.some(result => result.name === name && result.passed));
  const skipped = results.filter(result => result.skipped).map(result => result.name);
  const summary = `## Native test coverage: ${process.platform}/${process.arch}, Node ${process.version}\n\nRequired recovery/registration checks: ${missing.length ? 'FAILED: ' + missing.join('; ') : 'all executed and passed'}.\n\nSkipped (${skipped.length}; not passes):\n${skipped.map(name => '- ' + name).join('\n') || '- None'}\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  process.exitCode = code === 0 && !missing.length ? 0 : 1;
});
