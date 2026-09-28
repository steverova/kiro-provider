// Cross-platform login helper: prints the bridge API key, then starts the
// OpenCode Kiro login flow. Paste the printed key when OpenCode prompts.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const keyPath = path.join(dir, 'api-key.txt');

if (!fs.existsSync(keyPath)) {
  console.error('No api-key.txt yet. Start the bridge once (npm start), then retry.');
  process.exit(1);
}

const keys = fs
  .readFileSync(keyPath, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

console.log('============================================================');
console.log(' Kiro API key (paste this when OpenCode prompts):');
console.log('');
for (const k of keys) console.log('  ' + k);
console.log('');
console.log('============================================================');

const result = spawnSync('opencode', ['auth', 'login', 'kiro', '--method', 'key'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
