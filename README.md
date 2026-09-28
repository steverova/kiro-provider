# OpenCode Kiro Provider

OpenCode **V2** plugin that gives you the **AWS Kiro (CodeWhisperer)** models
(Claude Sonnet/Opus/Haiku, DeepSeek, GLM, MiniMax, Qwen) as `kiro/<model>`.

One install does everything: the plugin **registers the `kiro` provider** and
**starts a local bridge** that talks to Kiro. Works on **Windows, Linux, and
macOS**.

## Why this exists

The popular plugin `@zhafron/opencode-kiro-auth` is written for the **V1** plugin
API and **does not load in OpenCode V2** (`Plugin must export a default
definition with an id and an effect or setup function`).

Instead of porting it, this project **reuses its internals** (auth, account
rotation, token refresh, request/stream translation) behind a small local
OpenAI-compatible bridge, and wires it into OpenCode with a native V2 plugin.

```
OpenCode V2 ──(OpenAI /v1/chat/completions)──▶ bridge (127.0.0.1:4141)
   ▲                                              │
   └── plugin registers provider + starts bridge  └─▶ AWS Kiro (CodeWhisperer)
```

## Install from GitHub (recommended)

```bash
opencode plugin add github:steverova/kiro-provider
```

That command **only adds** this plugin to the `plugins` array in your global
`~/.config/opencode/opencode.json`; it never replaces the rest of your config.

OpenCode downloads the package (with dependencies) into its cache and loads it.
Reload so the plugin activates:

```bash
opencode reload
```

The plugin registers the `kiro` provider with its own bridge API key, so there
is no manual `/connect` step. Pick a model with `/models` — you'll see `kiro/...`.

No manual `opencode.json` edits and nothing extra to keep running: the bridge is
spawned automatically when OpenCode starts.

### Where does it install?

`opencode plugin add` caches the package under
`~/.cache/opencode/npm/<name>@<version>/.../node_modules/<name>`.
The generated API key lives there in `api-key.txt`; the bridge log is
`bridge.log`. `opencode plugin list` shows the installed source.

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

## Requirements

- **Node.js 20.11+** (the plugin spawns the bridge with `node`; override with
  `KIRO_NODE`).
- **OpenCode V2**.
- A **Kiro account already synced**:
  - Windows: `%APPDATA%\opencode\kiro.db`
  - Linux/macOS: `~/.config/opencode/kiro.db`

  Created by logging into the V1 plugin once, or by `kiro-cli login`.

## Files

| File | Role |
| --- | --- |
| `index.mjs` | The OpenCode V2 plugin: registers the provider, starts the bridge. |
| `server.mjs` | Local OpenAI-compatible bridge backed by the Kiro plugin internals. |
| `models.json` | Model metadata (generated), so the plugin never imports SQLite. |
| `gen-models.mjs` | Regenerates `models.json` from the Kiro registry. |
| `key.mjs` / `login.mjs` | Print the API key / run the OpenCode login. |
| `spike.mjs` | Quick check that the plugin internals work standalone. |

## How it works

- On setup, the plugin calls `ctx.provider.transform` to add the `kiro` provider
  (package `@opencode/ai/providers/openai-compatible`, `baseURL`
  `http://127.0.0.1:4141/v1`) with all models from `models.json`.
- It then probes `/health` and, if the bridge is down, spawns `server.mjs`
  detached (surviving OpenCode closing), appending output to `bridge.log`.
- The bridge authenticates to Kiro using the accounts in `kiro.db` and speaks
  the OpenAI Chat Completions API, including `reasoning_content` for thinking
  models.

### API key

The bridge requires a bearer key on every `/v1/*` request (except `/health`).
The plugin generates one on first run and stores it in `api-key.txt` next to the
installed package, then uses it for both the provider and the bridge, so no
manual step is needed. To use your own key instead, put it in `api-key.txt` (one
per line, for example your `ksk_...` Kiro key).

The bridge authenticates to Kiro with the accounts in `kiro.db`; the API key
only gates access to the local bridge.

## Configuration

Environment variables (optional):

| Variable | Default | Purpose |
| --- | --- | --- |
| `KIRO_BRIDGE_PORT` | `4141` | Bridge port; must match the provider `baseURL`. |
| `KIRO_BRIDGE_HOST` | `127.0.0.1` | Bind address. |
| `KIRO_BRIDGE_TOKEN` | – | Extra accepted key(s), comma/space separated. |
| `KIRO_PROJECT_DIR` | package dir | Directory used for project-level `kiro.json`. |
| `KIRO_NODE` | `node` | Node binary used to spawn the bridge. |
| `XDG_CONFIG_HOME` | `~/.config` | Config location OpenCode reads (`$XDG_CONFIG_HOME/opencode`). |

## Models

`-thinking` models stream reasoning in `reasoning_content`, rendered via
`compatibility.reasoningField`.

Disabled because Kiro rejects the effort field on them
(`additionalModelRequestFields is not supported for this model`):

- `claude-sonnet-4-5-thinking`
- `claude-opus-4-5-thinking`

Edit `DISABLED_MODELS` in `gen-models.mjs`, run `npm run gen-models`, and commit
`models.json`.

## Cross-platform notes

- All paths derive from the plugin file and the user's home directory.
- The global config lives at `$XDG_CONFIG_HOME/opencode/opencode.json` when set,
  otherwise `~/.config/opencode/opencode.json` (OpenCode's location on all three
  platforms). `opencode plugin add` only appends to its `plugins` array.
- `windowsHide` is ignored on Linux/macOS.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `401 Unauthorized` | The key the provider sends is not in `api-key.txt`. Add it there or run `npm run key`. |
| Provider missing / 0 models | `opencode reload`, and check the plugin loaded (`opencode plugin list`). |
| `Kiro Error: 400/403` | Account problem in `kiro.db`. Re-login the V1 plugin or `kiro-cli login` (may need a `profileArn`). |
| Bridge unreachable | `curl http://127.0.0.1:4141/health`; check `bridge.log`. |
| Autostart does nothing | Ensure `node` is on PATH or set `KIRO_NODE`; check `bridge.log`. |
| `database is locked` | Two bridges ran at once. The bridge binds the port first, so duplicates exit early; kill stray `node server.mjs` processes if needed. |

## Publishing notes

- `node_modules/`, `api-key.txt` and `bridge.log` are git-ignored. **Never commit
  `api-key.txt`** — it holds your key.
- To publish to npm: `npm publish` (the `files` list ships only what's needed).
- Installing with `opencode plugin add` appends a single entry to your global
  `plugins` array; it never rewrites the rest of the configuration.
