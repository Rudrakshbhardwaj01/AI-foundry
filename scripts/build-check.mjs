import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_REGISTRY } from '../ingest/registry.mjs';
import { validateSnapshot } from '../ingest/snapshot.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const required = ['index.html', 'styles.css', 'app.js', 'data/published.json', 'public/fonts/ChineseKaraoke.ttf'];
for (const file of required) await access(path.join(root, '..', file));
const snapshot = JSON.parse(await readFile(path.join(root, '..', 'data/published.json'), 'utf8'));
if (!validateSnapshot(snapshot)) throw new Error('data/published.json does not satisfy the published snapshot schema');
if (SOURCE_REGISTRY.length !== 20) throw new Error(`Expected 20 required sources, found ${SOURCE_REGISTRY.length}`);
console.log(`Build check passed: ${required.length} assets present, ${SOURCE_REGISTRY.length} sources registered.`);
