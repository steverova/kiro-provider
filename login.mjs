// Helper: start the Kiro sign-in flow and store your Kiro API key.
//
// Paste your Kiro API key (prefixed "ksk_") when OpenCode prompts. Generate one
// at https://app.kiro.dev -> API Keys (Pro/Pro+/Pro Max/Power subscriptions).
//
// Equivalent to running: opencode auth login kiro --method key
import { spawnSync } from 'node:child_process';

console.log('============================================================');
console.log(' Kiro sign-in');
console.log('');
console.log(' Have your Kiro API key ready (ksk_...).');
console.log(' Generate one at https://app.kiro.dev -> API Keys.');
console.log('============================================================');
console.log('');

const result = spawnSync('opencode', ['auth', 'login', 'kiro', '--method', 'key'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
