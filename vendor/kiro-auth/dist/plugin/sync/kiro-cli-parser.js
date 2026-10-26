import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
// Locations where the Kiro CLI may store its credential database, in probe
// order. Newer CLI builds (>= 2.x) on Windows use `%LOCALAPPDATA%\Kiro-Cli`,
// while older ones used `%APPDATA%\kiro-cli` — checking only one of them left
// `kiro.db` empty (and the bridge answering 401 "no accounts") whenever the CLI
// and the bridge disagreed about the path. The final entry per platform is the
// historical default, returned when no candidate exists so behaviour is
// unchanged on a machine without the CLI.
function cliDbCandidates() {
    const p = platform();
    if (p === 'win32') {
        const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
        const roaming = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
        return [
            join(local, 'Kiro-Cli', 'data.sqlite3'),
            join(local, 'kiro-cli', 'data.sqlite3'),
            join(roaming, 'Kiro-Cli', 'data.sqlite3'),
            join(roaming, 'kiro-cli', 'data.sqlite3'),
        ];
    }
    if (p === 'darwin') {
        const support = join(homedir(), 'Library', 'Application Support');
        return [join(support, 'Kiro-Cli', 'data.sqlite3'), join(support, 'kiro-cli', 'data.sqlite3')];
    }
    const share = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
    return [join(share, 'kiro-cli', 'data.sqlite3'), join(share, 'Kiro-Cli', 'data.sqlite3')];
}
export function getCliDbPath() {
    const override = process.env.KIROCLI_DB_PATH;
    if (override)
        return override;
    const candidates = cliDbCandidates();
    for (const candidate of candidates) {
        if (existsSync(candidate))
            return candidate;
    }
    return candidates[candidates.length - 1];
}
export function safeJsonParse(value) {
    if (typeof value !== 'string')
        return null;
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
export function normalizeExpiresAt(input) {
    if (typeof input === 'number') {
        return input < 10_000_000_000 ? input * 1000 : input;
    }
    if (typeof input === 'string' && input.trim()) {
        const t = new Date(input).getTime();
        if (!Number.isNaN(t) && t > 0)
            return t;
        const n = Number(input);
        if (Number.isFinite(n) && n > 0)
            return normalizeExpiresAt(n);
    }
    return 0;
}
export function findClientCredsRecursive(input) {
    const root = input;
    if (!root || typeof root !== 'object')
        return {};
    const stack = [root];
    const visited = new Set();
    while (stack.length) {
        const cur = stack.pop();
        if (!cur || typeof cur !== 'object')
            continue;
        if (visited.has(cur))
            continue;
        visited.add(cur);
        const clientId = cur.client_id || cur.clientId;
        const clientSecret = cur.client_secret || cur.clientSecret;
        if (typeof clientId === 'string' && typeof clientSecret === 'string') {
            if (clientId && clientSecret)
                return { clientId, clientSecret };
        }
        if (Array.isArray(cur)) {
            for (const v of cur)
                stack.push(v);
            continue;
        }
        for (const v of Object.values(cur))
            stack.push(v);
    }
    return {};
}
export function makePlaceholderEmail(authMethod, region, clientId, profileArn) {
    const seed = `${authMethod}:${region}:${clientId || ''}:${profileArn || ''}`;
    const h = createHash('sha256').update(seed).digest('hex').slice(0, 16);
    return `${authMethod}-placeholder+${h}@awsapps.local`;
}
