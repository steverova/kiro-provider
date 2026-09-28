import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const keyPath = path.join(dir, 'api-key.txt');
if (!fs.existsSync(keyPath)) {
  console.error('No api-key.txt yet. Start the bridge once (npm start), then retry.');
  process.exit(1);
}
process.stdout.write(
  fs
    .readFileSync(keyPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n') + '\n',
);
