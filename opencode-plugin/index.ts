// OpenCode V2 plugin: start the Kiro bridge when OpenCode starts.
//
// Runs on plugin setup. If the bridge is not already answering /health, it
// spawns server.mjs detached (surviving the OpenCode server) with its output
// appended to bridge.log. The health probe makes repeated setup calls safe.
//
// Cross-platform. Paths are derived from this file. On Windows `windowsHide`
// keeps the console hidden; it is ignored on Linux/macOS. Override the node
// binary with KIRO_NODE when `node` is not on the OpenCode server's PATH.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE_DIR = path.dirname(PLUGIN_DIR);
const PORT = process.env.KIRO_BRIDGE_PORT || '4141';
const BRIDGE_HEALTH = `http://127.0.0.1:${PORT}/health`;
const LOG_FILE = path.join(BRIDGE_DIR, 'bridge.log');
const NODE = process.env.KIRO_NODE || 'node';

// Setup can run multiple times per server process; only try once.
let attempted = false;

export default {
  id: 'kiro.bridge',
  async setup(ctx) {
    if (attempted) return;
    attempted = true;

    const healthy = () =>
      fetch(BRIDGE_HEALTH, { signal: AbortSignal.timeout(1500) })
        .then((r) => r.ok)
        .catch(() => false);

    if (await healthy()) {
      console.log('[kiro.bridge] bridge already running');
      return;
    }

    // Give a concurrent instance a moment to bind before spawning another.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (await healthy()) {
      console.log('[kiro.bridge] bridge came up');
      return;
    }

    const { spawn } = await import('node:child_process');
    const out = fs.openSync(LOG_FILE, 'a');
    const child = spawn(NODE, ['server.mjs'], {
      cwd: BRIDGE_DIR,
      detached: true,
      stdio: ['ignore', out, out],
      windowsHide: true,
    });
    child.on('error', (e) =>
      console.log('[kiro.bridge] spawn failed (' + e.message + '). Set KIRO_NODE to the node binary path.'),
    );
    child.unref();
    console.log('[kiro.bridge] started Kiro bridge (pid ' + child.pid + ')');
  },
};
