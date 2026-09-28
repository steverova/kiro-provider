# Vendored: Kiro auth/streaming internals

The JavaScript under `dist/` is vendored from **`@zhafron/opencode-kiro-auth`**
v2.0.0 by tickernelz (MIT licensed), <https://github.com/tickernelz/opencode-kiro-auth>.

It is included here so this project no longer depends on that package at
runtime. Only the runtime `.js` files that this project actually loads are
vendored; the V1 plugin entry (`dist/plugin.js`, `dist/index.js`, which import
`@opencode-ai/plugin`) is intentionally removed.

External runtime dependencies required by this code are declared in the root
`package.json`: `@aws/codewhisperer-streaming-client`, `libsql`,
`proper-lockfile`, and `zod`.

Keep it in sync with upstream when CodeWhisperer's request/stream format
changes.
