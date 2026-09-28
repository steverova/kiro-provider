# OpenCode Kiro Provider

An **OpenCode V2 plugin** that adds the **AWS Kiro (CodeWhisperer)** models
(Claude Sonnet/Opus/Haiku, DeepSeek, GLM, MiniMax, Qwen) to OpenCode as
`kiro/<model>`.

One install does everything: the plugin **registers the `kiro` provider** and
**starts a local bridge** that talks to Kiro. Works on **Windows, Linux, and
macOS**.

```
OpenCode V2 ──(OpenAI /v1/chat/completions)──▶ bridge (127.0.0.1:4141)
   ▲                                              │
   └── plugin registers provider + starts bridge  └─▶ AWS Kiro (CodeWhisperer)
```

## Quick start

```bash
# 1. Install the plugin (only appends one entry to your config)
opencode plugin add github:steverova/kiro-provider

# 2. Sign in to Kiro (see "Authentication" below)
kiro-cli login

# 3. Reload OpenCode and pick a kiro/... model
opencode reload
```

## Requirements

- **Node.js 20.11+** (the plugin spawns the bridge with `node`; override with
  `KIRO_NODE`).
- **OpenCode V2**.
- A **Kiro account** you can sign in with (see below).

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
manual `/connect` step. Pick a model with `/models` — you'll see `kiro/...`.

## Authentication

There are **two** credentials. Only the first one needs your attention.

### 1. Your Kiro account (required)

The bridge talks to Kiro using the accounts stored in **`kiro.db`**:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\opencode\kiro.db` |
| Linux / macOS | `~/.config/opencode/kiro.db` |

The easiest way to fill it: **sign in with the Kiro CLI**, and let the plugin
import it automatically.

1. Install the Kiro CLI, then run:
   ```bash
   kiro-cli login
   ```
   Complete the browser sign-in (AWS Builder ID / IAM Identity Center).

2. That's it. On start, the bridge runs a Kiro CLI sync (enabled by default via
   `auto_sync_kiro_cli`) and copies the tokens from the Kiro CLI database
   (`%APPDATA%\kiro-cli\data.sqlite3` on Windows,
   `~/.local/share/kiro-cli/data.sqlite3` on Linux,
   `~/Library/Application Support/kiro-cli/data.sqlite3` on macOS) into
   `kiro.db`.

Accounts already present in `kiro.db` (for example, from using the V1 plugin
once) are used directly and need no extra step.

**Check it worked:** start OpenCode, then:

```bash
curl http://127.0.0.1:4141/health
# {"status":"ok","ready":true,"accounts":1,"region":"us-east-1"}
```

`accounts` > 0 means Kiro is authenticated. If it is `0`, the CLI sign-in did
not reach the expected database — see Troubleshooting.

### 2. The local bridge key (automatic)

The bridge requires a bearer key on every `/v1/*` request (except `/health`).
The plugin **generates this key on first run**, stores it in `api-key.txt` next
to the installed package, and passes it to both the provider and the bridge. No
action needed. To use your own key instead, put it in `api-key.txt` (one per
line, for example your `ksk_...` Kiro key).

> The API key only gates access to the local bridge. It is **not** your Kiro
> login — that is the account in `kiro.db`.

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
| `KIRO_BRIDGE_PORT` | `4141` | Bridge port; must match the provider `baseURL`. |
| `KIRO_BRIDGE_HOST` | `127.0.0.1` | Bind address. |
| `KIRO_BRIDGE_TOKEN` | – | Extra accepted key(s), comma/space separated. |
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

Run `opencode reload`. `npm start` runs the bridge manually if you don't want
the plugin to spawn it.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Provider missing / 0 models | `opencode reload`, then check `opencode plugin list`. |
| `/health` shows `accounts: 0` | Sign in with `kiro-cli login`, or ensure `kiro.db` has accounts. Check `bridge.log`. |
| `Kiro Error: 400/403` | Account problem in `kiro.db`. Sign in again (`kiro-cli login`); a Pro account may need a `profileArn`. |
| `401 Unauthorized` | The key the provider sends is not in `api-key.txt`. Add it there or run `npm run key`. |
| Bridge unreachable | `curl http://127.0.0.1:4141/health`; check `bridge.log`. |
| Autostart does nothing | Ensure `node` is on PATH or set `KIRO_NODE`; check `bridge.log`. |
| `database is locked` | Two bridges ran at once. The bridge binds the port first, so duplicates exit early; kill stray `node server.mjs` processes if needed. |

## Files

| File | Role |
| --- | --- |
| `index.mjs` | The OpenCode V2 plugin: registers the provider, starts the bridge. |
| `server.mjs` | Local OpenAI-compatible bridge backed by the Kiro plugin internals. |
| `models.json` | Model metadata (generated), so the plugin never imports SQLite. |
| `gen-models.mjs` | Regenerates `models.json` from the Kiro registry. |
| `key.mjs` / `login.mjs` | Print the bridge API key / run the OpenCode login helper. |
| `spike.mjs` | Quick check that the plugin internals work standalone. |

## Why this exists

The popular plugin `@zhafron/opencode-kiro-auth` is written for the **V1** plugin
API and **does not load in OpenCode V2**
(`Plugin must export a default definition with an id and an effect or setup function`).

Instead of porting it, this project **reuses its internals** (auth, account
rotation, token refresh, request/stream translation) behind a small local
OpenAI-compatible bridge, and wires it into OpenCode with a native V2 plugin.

- On setup, the plugin calls `ctx.provider.transform` to add the `kiro` provider
  (package `@opencode/ai/providers/openai-compatible`, `baseURL`
  `http://127.0.0.1:4141/v1`) with all models from `models.json`.
- It then probes `/health` and, if the bridge is down, spawns `server.mjs`
  detached (surviving OpenCode closing), appending output to `bridge.log`.
- The bridge authenticates to Kiro with the accounts in `kiro.db` and speaks
  the OpenAI Chat Completions API, including `reasoning_content` for thinking
  models.

## Notes

- `node_modules/`, `api-key.txt` and `bridge.log` are git-ignored. **Never
  commit `api-key.txt`** — it holds your key.
- Installing with `opencode plugin add` appends a single entry to your global
  `plugins` array; it never rewrites the rest of the configuration.
