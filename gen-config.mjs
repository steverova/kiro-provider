// Migration/local helper: registers this plugin in the OpenCode config.
//
// Not required when you install with `opencode plugin add <github|npm spec>`.
// Use it for a local clone, or to migrate from the old config-based provider
// (it removes `providers.kiro`, now owned by the plugin).
//
// Cross-platform: paths derive from this file and the user's home directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ENTRY = pathToFileURL(DIR).href;

const configRoot = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const outPath = path.join(configRoot, 'opencode', 'opencode.json');

let existing = {};
if (fs.existsSync(outPath)) {
  try {
    existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  } catch (e) {
    console.error(`Refusing to overwrite unparsable config at ${outPath}: ${e.message}`);
    process.exit(1);
  }
}

// Drop stale Kiro plugin entries, then add this project's.
const existingPlugins = (Array.isArray(existing.plugins) ? existing.plugins : []).filter(
  (p) => !(typeof p === 'string' && /kiro/i.test(p) && p.replace(/\\/g, '/').includes('opencode')),
);

// The plugin now registers `kiro`, so remove the old config-based provider.
const providers = { ...(existing.providers || {}) };
delete providers.kiro;

const merged = {
  ...existing,
  $schema: existing.$schema || 'https://opencode.ai/config.json',
  plugins: [...existingPlugins, PLUGIN_ENTRY],
  ...(Object.keys(providers).length ? { providers } : {}),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n');
console.log(`wrote ${outPath}`);
console.log(`  plugin: ${PLUGIN_ENTRY}`);
console.log('  removed providers.kiro (the plugin registers it now)');
