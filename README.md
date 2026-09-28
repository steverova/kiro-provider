# OpenCode Kiro Provider

An **OpenCode V2 plugin** that adds the **AWS Kiro (CodeWhisperer)** models
(Claude Sonnet/Opus/Haiku, DeepSeek, GLM, MiniMax, Qwen) to OpenCode as
`kiro/<model>`.

One install does everything: the plugin **registers the `kiro` provider**, adds
the **`kiro` auth integration**, and **starts a local bridge** that talks to
Kiro. Works on **Windows, Linux, and macOS**.

```
OpenCode V2 ──(OpenAI /v1/chat/completions)──▶ bridge (127.0.0.1:4141)
   ▲                                              │
   └── plugin registers provider + starts bridge  └─▶ AWS Kiro (CodeWhisperer)
```

## Quick start

```bash
# 1. Install the plugin (only appends one entry to your config)
opencode plugin add github:steverova/kiro-provider

# 2. Connect your Kiro API key (ksk_...)
opencode auth login kiro --method key

# 3. Reload and pick a kiro/... model
opencode reload
```

## Requirements

- **Node.js 20.11+** (the plugin spawns the bridge with `node`; override with
  `KIRO_NODE`).
- **OpenCode V2**.
- A **Kiro API key** (`ksk_...`) **or** a Kiro account in `kiro.db` (see
  Authentication). API keys are available to Kiro Pro, Pro+, Pro Max, and Power
  subscribers; generate one at <https://app.kiro.dev> → **API Keys**.

## Install

```bash
opencode plugin add github:steverova/kiro-provider
opencode reload
```

This command **only adds** the plugin to the `plugins` array in your global
`~/.config/opencode/opencode.json`; it never replaces the rest of your config.
Verify with:

```bash
opencode plugin list      # shows: kiro.provider  <commit>  https://github.com/steverova/kiro-provider.git
```

Once loaded, the plugin registers the `kiro` provider by itself, so there is no
manual provider setup. Pick a model with `/models` — you'll see `kiro/...`.

## Authentication

The bridge can authenticate to Kiro in two ways. **Option A (API key)** is
recommended.

### Option A — Kiro API key (recommended)

1. Generate a key at <https://app.kiro.dev> → **API Keys** (Pro/Pro+/Pro
   Max/Power).
2. Connect it:

   ```bash
   opencode auth login kiro --method key
   ```

   Paste your `ksk_...` key when prompted. In the TUI you can use `/connect` →
   **AWS Kiro** → *Manually enter API Key* instead.

3. Reload so the plugin picks it up:

   ```bash
   opencode reload
   ```

The plugin passes the key to the bridge **in memory** (over loopback only); it is
never written to disk, and no `kiro.db` is needed. Verify:

```bash
curl http://127.0.0.1:4141/health
# {"status":"ok","ready":true,"auth":"api_key","accounts":null,"region":"api-key"}
```

`"auth":"api_key"` means the key is in use. You can also set the key with the
`KIRO_API_KEY` environment variable instead of logging in (the plugin passes the
environment through to the bridge).

### Option B — OAuth accounts (fallback)

Without an API key, the bridge can use the accounts in **`kiro.db`**:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\opencode\kiro.db` |
| Linux / macOS | `~/.config/opencode/kiro.db` |

Fill it by signing in with the **Kiro CLI** (`kiro-cli login`); on start the
bridge syncs the tokens from the Kiro CLI database into `kiro.db` (enabled by
default via `auto_sync_kiro_cli`). Accounts already in `kiro.db` are used
directly.

```bash
curl http://127.0.0.1:4141/health
# {"status":"ok","ready":true,"auth":"accounts","accounts":1,"region":"us-east-1"}
```

> The bridge also requires a bearer key on every `/v1/*` request (except
> `/health`). The plugin **generates this key on first run**, stores it in
> `api-key.txt`, and injects it into the provider — no action needed. It is a
> local gate, unrelated to your Kiro API key.

## Configuration

Optional settings live in `kiro.json`, auto-created with defaults on first run:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\opencode\kiro.json` |
| Linux / macOS | `~/.config/opencode/kiro.json` |

Useful keys: `default_region` (`us-east-1`), `account_selection_strategy`
(`lowest-usage`, `sticky`, or `round-robin`), and `auto_sync_kiro_cli`
(`true`).

Environment variables (optional):

| Variable | Default | Purpose |
| --- | --- | --- |
| `KIRO_API_KEY` | – | Kiro API key (`ksk_...`); alternative to `auth login`. |
| `KIRO_BRIDGE_RATE_LIMIT` | `120` | Max requests per minute per token (`0` disables). |
| `KIRO_BRIDGE_PORT` | `4141` | Bridge port; must match the provider `baseURL`. |
| `KIRO_BRIDGE_HOST` | `127.0.0.1` | Bind address. |
| `KIRO_BRIDGE_TOKEN` | – | Extra accepted bridge key(s), comma/space separated. |
| `KIRO_NODE` | `node` | Node binary used to spawn the bridge. |
| `KIROCLI_DB_PATH` | – | Override the Kiro CLI database path used for sync. |

## Models

`-thinking` models stream reasoning in `reasoning_content`.

Disabled because Kiro rejects the effort field on them
(`additionalModelRequestFields is not supported for this model`):

- `claude-sonnet-4-5-thinking`
- `claude-opus-4-5-thinking`

To change the list, edit `DISABLED_MODELS` in `gen-models.mjs`, run
`npm run gen-models`, and commit `models.json`.

## Install from a local clone (alternative)

```powershell
git clone https://github.com/steverova/kiro-provider.git kiro-provider
cd kiro-provider
npm install
```

Then add the folder to `plugins` in your global `opencode.json` (this preserves
every other setting — it only appends one entry):

```json
{
  "plugins": [
    "C:/Users/you/Documents/kiro-provider"
  ]
}
```

Run `opencode reload`, then connect your API key as in Authentication.
`npm start` runs the bridge manually if you don't want the plugin to spawn it.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Provider missing / 0 models | `opencode reload`, then check `opencode plugin list`. |
| `No accounts` / request errors | Connect a key: `opencode auth login kiro --method key`, then `opencode reload`. Check `/health` reports `"auth":"api_key"`. |
| `/health` shows `accounts: 0` (OAuth) | Sign in with `kiro-cli login`, or set `KIROCLI_DB_PATH` if your Kiro CLI database is elsewhere. Check `bridge.log`. |
| `Kiro Error: 400/403` (API key) | The key must match its region and be entitled. Check `default_region` and regenerate the key. |
| `Kiro Error: 400/403` (OAuth) | Account problem in `kiro.db`. Sign in again (`kiro-cli login`); a Pro account may need a `profileArn`. |
| `Integration not found: kiro` | The plugin is not loaded. `opencode plugin list`, then `opencode reload`. |
| Bridge unreachable | `curl http://127.0.0.1:4141/health`; check `bridge.log`. |
| Autostart does nothing | Ensure `node` is on PATH or set `KIRO_NODE`; check `bridge.log`. |
| `database is locked` | Two bridges ran at once. The bridge binds the port first, so duplicates exit early; kill stray `node server.mjs` processes if needed. |

## Files

| File | Role |
| --- | --- |
| `index.mjs` | The OpenCode V2 plugin: registers the provider + integration, starts the bridge. |
| `server.mjs` | Local OpenAI-compatible bridge; supports API-key and OAuth auth. |
| `models.json` | Model metadata (generated), so the plugin never imports SQLite. |
| `gen-models.mjs` | Regenerates `models.json` from the Kiro registry. |
| `login.mjs` | Runs `opencode auth login kiro --method key`. |
| `spike.mjs` | Quick check that the plugin internals work standalone. |

## How it works

- On setup, the plugin calls `ctx.provider.transform` to add the `kiro` provider
  (package `@opencode/ai/providers/openai-compatible`, `baseURL`
  `http://127.0.0.1:4141/v1`) with all models from `models.json`.
- It registers the `kiro` auth integration with a `key` method, so
  `opencode auth login kiro --method key` (or `/connect`) can store a Kiro API
  key.
- It resolves the stored key and hands it to the bridge in memory, then probes
  `/health`; if the bridge is down it spawns `server.mjs` detached (surviving
  OpenCode closing), appending output to `bridge.log`.
- The bridge calls Kiro's CodeWhisperer endpoint and speaks the OpenAI Chat
  Completions API, including `reasoning_content` for thinking models.
  - **API key:** sends `Authorization: Bearer <ksk_...>` with the
    `tokentype: API_KEY` header. The key lives in the bridge's memory only.
  - **OAuth:** rotates and refreshes the accounts in `kiro.db`.

## Why this exists

The popular plugin `@zhafron/opencode-kiro-auth` is written for the **V1** plugin
API and **does not load in OpenCode V2**
(`Plugin must export a default definition with an id and an effect or setup function`).

Instead of porting it, this project **reuses its internals** (auth, account
rotation, token refresh, request/stream translation) behind a small local
OpenAI-compatible bridge, and wires it into OpenCode with a native V2 plugin.

## Security

- The Kiro API key is held **in memory only** in the bridge. The plugin sends it
  over loopback (`127.0.0.1`) and it is never written to disk or logs.
- Every `/v1/*` request requires a bearer token; `/internal/api-key` (used to
  update the key) additionally requires the plugin's own bridge key.
- Secrets are redacted from `bridge.log`.
- The bridge binds to `127.0.0.1` by default. If you override
  `KIRO_BRIDGE_HOST`, it logs a warning — never expose it to untrusted networks.
- A per-token rate limit (`KIRO_BRIDGE_RATE_LIMIT`, default 120/min) protects
  your Kiro quota from a runaway client.
- If a Kiro API key may have leaked, rotate it at <https://app.kiro.dev>, then
  `opencode auth logout` and `opencode auth login kiro --method key` again.

## Notes

- `node_modules/`, `api-key.txt` and `bridge.log` are git-ignored. **Never commit
  them** — `api-key.txt` is a local bridge secret.
- Installing with `opencode plugin add` appends a single entry to your global
  `plugins` array; it never rewrites the rest of the configuration.
