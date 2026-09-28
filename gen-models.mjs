// Regenerates models.json from the vendored Kiro registry (vendor/kiro-auth).
//
// models.json is committed so the OpenCode plugin (index.mjs) can register the
// provider without importing the Kiro package at runtime — importing it opens
// the shared SQLite database, which must stay owned by the bridge process.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModelRegistry } from './vendor/kiro-auth/dist/plugin/model-registry.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const registry = buildModelRegistry();

// Kiro rejects the thinking effort field on the 4.5 generation
// ("additionalModelRequestFields is not supported for this model").
const DISABLED_MODELS = new Set(['claude-sonnet-4-5-thinking', 'claude-opus-4-5-thinking']);

const models = {};
for (const [id, entry] of Object.entries(registry)) {
  models[id] = {
    name: entry.name,
    limit: entry.limit,
    capabilities: {
      tools: true,
      input: entry.modalities?.input ?? ['text'],
      output: entry.modalities?.output ?? ['text'],
    },
    ...(entry.reasoning ? { compatibility: { reasoningField: entry.interleaved?.field ?? 'reasoning_content' } } : {}),
    ...(entry.variants
      ? { variants: Object.entries(entry.variants).map(([variantID, body]) => ({ id: variantID, body })) }
      : {}),
    enabled: !DISABLED_MODELS.has(id),
  };
}

const out = {
  provider: {
    id: 'kiro',
    name: 'AWS Kiro',
    package: '@opencode/ai/providers/openai-compatible',
  },
  models,
};

fs.writeFileSync(path.join(DIR, 'models.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`wrote models.json (${Object.keys(models).length} models)`);
