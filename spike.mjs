// Spike: validate we can reuse the plugin's RequestHandler standalone.
import { loadConfig } from './vendor/kiro-auth/dist/plugin/config/index.js';
import { AccountCache } from './vendor/kiro-auth/dist/infrastructure/database/account-cache.js';
import { AccountRepository } from './vendor/kiro-auth/dist/infrastructure/database/account-repository.js';
import { AccountManager } from './vendor/kiro-auth/dist/plugin/accounts.js';
import { AuthHandler } from './vendor/kiro-auth/dist/core/auth/auth-handler.js';
import { RequestHandler } from './vendor/kiro-auth/dist/core/request/request-handler.js';
import { buildModelRegistry } from './vendor/kiro-auth/dist/plugin/model-registry.js';

const toast = (m, v) => console.log(`[toast:${v}] ${m}`);

const config = loadConfig(process.cwd());
console.log('config:', {
  region: config.default_region,
  strategy: config.account_selection_strategy,
  auto_sync_kiro_cli: config.auto_sync_kiro_cli,
});

const repo = new AccountRepository(new AccountCache(60000));
const am = await AccountManager.loadFromDisk(config.account_selection_strategy);
console.log('accounts:', am.getAccountCount());
for (const a of am.getAccounts()) {
  console.log('  -', a.email, '| healthy:', a.isHealthy, '| method:', a.authMethod, '| region:', a.region, '| expires:', new Date(a.expiresAt).toISOString());
}

const authHandler = new AuthHandler(config, repo);
authHandler.setAccountManager(am);
try {
  await authHandler.initialize(toast);
  console.log('authHandler.initialize OK');
} catch (e) {
  console.log('authHandler.initialize error:', e?.message || e);
}

const rh = new RequestHandler(am, config, repo, undefined);
const models = buildModelRegistry();
console.log('registry models:', Object.keys(models).length);

const region = config.default_region || 'us-east-1';
const url = `https://q.${region}.amazonaws.com/v1/chat/completions`;
const payload = {
  model: 'claude-haiku-4-5',
  stream: true,
  messages: [{ role: 'user', content: 'Say hi in exactly 3 words.' }],
};
console.log('calling Kiro for model claude-haiku-4-5 ...');
const res = await rh.handle(url, { method: 'POST', body: JSON.stringify(payload) }, toast);
console.log('status:', res.status, '| content-type:', res.headers.get('content-type'));
const text = await res.text();
console.log('--- response (first 2000 chars) ---');
console.log(text.slice(0, 2000));
