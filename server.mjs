// Kiro OpenAI-compatible bridge for OpenCode V2.
//
// Reuses @zhafron/opencode-kiro-auth's internals (auth, account rotation,
// token refresh, request/stream translation) and exposes a local
// OpenAI-compatible API that OpenCode's @opencode/ai/providers/openai-compatible
// runtime can talk to.
//
// The HTTP port is bound first so a duplicate instance exits before it touches
// the shared SQLite database. Provider internals initialize lazily on the first
// /v1 request (or a /health probe).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

// The plugin internals open the shared SQLite database at module import time,
// so they are imported lazily inside init(), after this process owns the port.
const PKG = '@zhafron/opencode-kiro-auth/dist';
const DIR = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.KIRO_BRIDGE_PORT || 4141);
const HOST = process.env.KIRO_BRIDGE_HOST || '127.0.0.1';
const START_DIR = process.env.KIRO_PROJECT_DIR || DIR;
const KEY_PATH = path.join(DIR, 'api-key.txt');

const log = (...a) => console.log(new Date().toISOString(), ...a);
const toast = (message, variant) => {
  if (variant === 'error') log(`[toast:${variant}] ${message}`);
  else console.log(new Date().toISOString(), `[toast:${variant}] ${message}`);
};

// Accepted bearer tokens. api-key.txt may contain one or more keys (one per
// line): the generated local token and/or whatever key you chose at
// `opencode auth login kiro --method key`.
function loadKeys() {
  const keys = new Set();
  if (process.env.KIRO_BRIDGE_TOKEN) {
    for (const k of process.env.KIRO_BRIDGE_TOKEN.split(/[\s,]+/)) if (k.trim()) keys.add(k.trim());
  }
  if (fs.existsSync(KEY_PATH)) {
    for (const line of fs.readFileSync(KEY_PATH, 'utf8').split(/\r?\n/)) if (line.trim()) keys.add(line.trim());
  }
  if (keys.size === 0) {
    const token = 'kiro-' + crypto.randomBytes(24).toString('base64url');
    fs.writeFileSync(KEY_PATH, token + '\n', { mode: 0o600 });
    keys.add(token);
  }
  return keys;
}
const KEYS = loadKeys();

// --- Lazy provider state (built after the port is bound) --------------------

let state = null;
let readyPromise = null;

async function init() {
  const [{ loadConfig }, { AccountCache }, { AccountRepository }, { AccountManager }, { AuthHandler }, { RequestHandler }, { buildModelRegistry }] =
    await Promise.all([
      import(`${PKG}/plugin/config/index.js`),
      import(`${PKG}/infrastructure/database/account-cache.js`),
      import(`${PKG}/infrastructure/database/account-repository.js`),
      import(`${PKG}/plugin/accounts.js`),
      import(`${PKG}/core/auth/auth-handler.js`),
      import(`${PKG}/core/request/request-handler.js`),
      import(`${PKG}/plugin/model-registry.js`),
    ]);

  const config = loadConfig(START_DIR);
  const region = config.default_region || 'us-east-1';
  const repository = new AccountRepository(new AccountCache(60000));
  const accountManager = await AccountManager.loadFromDisk(config.account_selection_strategy);
  const authHandler = new AuthHandler(config, repository);
  authHandler.setAccountManager(accountManager);

  log(`provider ready: region=${region} strategy=${config.account_selection_strategy} accounts=${accountManager.getAccountCount()}`);
  try {
    await authHandler.initialize(toast);
    log('auth handler initialized');
  } catch (e) {
    log('auth handler init failed (continuing):', e?.message || e);
  }

  const requestHandler = new RequestHandler(accountManager, config, repository, undefined);
  state = { config, region, accountManager, requestHandler, registry: buildModelRegistry() };
  log(`provider initialized (${Object.keys(state.registry).length} models)`);
  return state;
}

function ensureReady() {
  if (state) return Promise.resolve(state);
  if (!readyPromise) readyPromise = init();
  return readyPromise;
}

// --- HTTP helpers -----------------------------------------------------------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function authorized(req) {
  if (KEYS.size === 0) return true;
  const auth = (req.headers['authorization'] || '').toString();
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  const apiKey = (req.headers['x-api-key'] || req.headers['api-key'] || '').toString().trim();
  return KEYS.has(bearer) || KEYS.has(apiKey);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function modelList(registry) {
  return {
    object: 'list',
    data: Object.entries(registry).map(([id, m]) => ({
      id,
      object: 'model',
      created: 0,
      owned_by: 'kiro',
      name: m?.name || id,
    })),
  };
}

async function handleChat(req, res) {
  const body = await readBody(req);
  try {
    JSON.parse(body);
  } catch {
    return sendJson(res, 400, { error: { message: 'invalid JSON body', type: 'invalid_request_error' } });
  }

  const s = await ensureReady();
  const kiroUrl = `https://q.${s.region}.amazonaws.com/v1/chat/completions`;
  const upstream = await s.requestHandler.handle(kiroUrl, { method: 'POST', headers: req.headers, body }, toast);

  const headers = {};
  upstream.headers.forEach((v, k) => {
    if (k.toLowerCase() === 'content-length') return;
    headers[k] = v;
  });
  res.writeHead(upstream.status, headers);

  if (!upstream.body) {
    res.end(await upstream.text());
    return;
  }
  Readable.fromWeb(upstream.body).pipe(res);
}

// --- Server -----------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      // Respond immediately; warm the provider in the background.
      if (!state) void ensureReady().catch((e) => log('init failed:', e?.message || e));
      return sendJson(res, 200, {
        status: 'ok',
        ready: !!state,
        accounts: state ? state.accountManager.getAccountCount() : null,
        region: state ? state.region : null,
      });
    }
    if (!authorized(req)) {
      return sendJson(res, 401, { error: { message: 'unauthorized', type: 'invalid_request_error' } });
    }
    if (req.method === 'GET' && (url.pathname === '/v1/models' || url.pathname === '/models')) {
      const s = await ensureReady();
      return sendJson(res, 200, modelList(s.registry));
    }
    if (req.method === 'POST' && (url.pathname === '/v1/chat/completions' || url.pathname === '/chat/completions')) {
      return await handleChat(req, res);
    }
    return sendJson(res, 404, { error: { message: `not found: ${req.method} ${url.pathname}`, type: 'invalid_request_error' } });
  } catch (e) {
    log('request error:', e?.stack || e?.message || e);
    const message = e?.message || String(e);
    if (res.headersSent) {
      try {
        res.end();
      } catch {}
      return;
    }
    return sendJson(res, 500, { error: { message, type: 'api_error' } });
  }
});

server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    log(`port ${PORT} already in use; another bridge instance is running — exiting`);
    process.exit(0);
  }
  log('server error:', e?.message || e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  log(`kiro bridge listening on http://${HOST}:${PORT}/v1`);
  log(`auth: required — run "npm run key" to print the API key to paste in OpenCode`);
});
