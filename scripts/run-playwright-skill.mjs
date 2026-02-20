import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const scriptArg = process.argv[2];
const scriptPath = scriptArg ? path.resolve(process.cwd(), scriptArg) : '';
if (!scriptPath) {
  console.error('Usage: node scripts/run-playwright-skill.mjs <script-path>');
  process.exit(1);
}

const skillDir =
  process.env.PLAYWRIGHT_SKILL_DIR || '/Users/devagr/.agents/skills/playwright-skill';
const runJs = path.join(skillDir, 'run.js');

try {
  await access(runJs, constants.R_OK);
} catch {
  console.error(`Playwright skill runner not found: ${runJs}`);
  console.error('Set PLAYWRIGHT_SKILL_DIR to your playwright-skill path.');
  process.exit(1);
}

const child = spawn('node', [runJs, scriptPath], {
  stdio: 'inherit',
  cwd: skillDir,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 1));
