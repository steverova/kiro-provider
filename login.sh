#!/usr/bin/env sh
# Prints the bridge API key, then starts the OpenCode Kiro login flow.
# Paste the printed key when OpenCode asks for the API key.
cd "$(dirname "$0")" || exit 1
node login.mjs
