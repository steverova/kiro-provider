// OpenCode V2 plugin for the Kiro provider.
//
// One install does everything:
//   1. registers the `kiro` provider (OpenAI-compatible, pointed at the local bridge)
//   2. starts the bridge process if it is not already running
//
// Works on Windows, Linux, and macOS. All paths derive from this file.
//
// The provider is registered with `activation: "enabled"` and the bridge API key
// inline, so the models show up as soon as the plugin loads — no manual
// `/connect` step and no chance of falling back to a built-in provider such as
// Amazon Bedrock.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.KIRO_BRIDGE_PORT || '4141';
const HOST = process.env.KIRO_BRIDGE_HOST || '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}/v1`;
const HEALTH_URL = `http://${HOST}:${PORT}/health`;
const LOG_FILE = path.join(DIR, 'bridge.log');
const KEY_FILE = path.join(DIR, 'api-key.txt');
const NODE = process.env.KIRO_NODE || 'node';
const PROVIDER_ID = 'kiro';

const spec = JSON.parse(fs.readFileSync(path.join(DIR, 'models.json'), 'utf8'));

// The bridge gates /v1/* behind a bearer key. Reuse an existing api-key.txt, or
// generate + persist one so the plugin and the bridge always agree. Passing the
// same value as KIRO_BRIDGE_TOKEN makes it independent of the file once running.
function ensureToken() {
  const fromEnv = (process.env.KIRO_BRIDGE_TOKEN || '').split(/[\s,]+/).filter(Boolean)[0];
  if (fromEnv) return fromEnv;
  try {
    const existing = fs
      .readFileSync(KEY_FILE, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (existing.length) return existing[0];
  } catch {}
  const token = 'kiro-' + crypto.randomBytes(24).toString('base64url');
  try {
    fs.writeFileSync(KEY_FILE, token + '\n', { mode: 0o600 });
  } catch (e) {
    console.log('[kiro] could not write api-key.txt: ' + e.message);
  }
  return token;
}

const TOKEN = ensureToken();

function buildModels() {
  return Object.entries(spec.models).map(([id, m]) => ({
    id,
    modelID: id,
    providerID: PROVIDER_ID,
    name: m.name,
    capabilities: m.capabilities,
    variants: m.variants || [],
    time: { released: 0 },
    cost: [],
    status: 'active',
    enabled: m.enabled !== false,
    limit: m.limit,
    ...(m.compatibility ? { compatibility: m.compatibility } : {}),
  }));
}

let attempted = false;

async function ensureBridge() {
  const healthy = () =>
    fetch(HEALTH_URL, { signal: AbortSignal.timeout(1500) })
      .then((r) => r.ok)
      .catch(() => false);

  if (await healthy()) {
    console.log('[kiro] bridge already running');
    return;
  }

  // Give a concurrent instance a moment to bind before spawning another.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  if (await healthy()) {
    console.log('[kiro] bridge came up');
    return;
  }

  const out = fs.openSync(LOG_FILE, 'a');
  const child = spawn(NODE, ['server.mjs'], {
    cwd: DIR,
    detached: true,
    // windowsHide is ignored on Linux/macOS.
    stdio: ['ignore', out, out],
    windowsHide: true,
    env: { ...process.env, KIRO_BRIDGE_TOKEN: TOKEN },
  });
  child.on('error', (e) =>
    console.log('[kiro] spawn failed (' + e.message + '). Set KIRO_NODE to the node binary path.'),
  );
  child.unref();
  console.log('[kiro] started bridge (pid ' + child.pid + ')');
}

export default {
  id: 'kiro.provider',
  async setup(ctx) {
    await ctx.provider.transform((editor) => {
      editor.add({
        info: {
          id: PROVIDER_ID,
          name: spec.provider.name,
          activation: 'enabled',
          package: spec.provider.package,
          settings: { baseURL: BASE_URL, apiKey: TOKEN },
        },
        models: buildModels(),
      });
    });

    if (attempted) return;
    attempted = true;
    await ensureBridge();
  },
};
