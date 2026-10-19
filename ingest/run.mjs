#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SOURCE_REGISTRY } from './registry.mjs';
import { fetchWithRetry } from './fetch.mjs';
import { parseFeed } from './parse.mjs';
import { dedupeStories, normalizeStory } from './normalize.mjs';
import { publishSnapshot } from './snapshot.mjs';

function parseArgs(argv) {
  const args = { output: 'data/seed', fixtureDir: null, source: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output' || arg === '--fixture-dir' || arg === '--source') args[arg.slice(2).replace('-', '')] = argv[++index];
    else if (arg === '--help') args.help = true;
  }
  return args;
}

export async function runIngestion({
  registry = SOURCE_REGISTRY,
  outputDir = 'data/seed',
  fixtureDir,
  sourceId,
  fetchImpl,
  retries = 2,
  timeoutMs = 10_000,
  now = () => new Date(),
} = {}) {
  const startedAt = now().toISOString();
  const stories = [];
  const sourceStatuses = [];
  for (const source of registry) {
    if (sourceId && source.id !== sourceId) continue;
    if (source.status !== 'enabled' || !source.endpoint) {
      sourceStatuses.push({ sourceId: source.id, status: 'unavailable', accessMethod: source.accessMethod, itemCount: 0, attempts: 0 });
      continue;
    }
    try {
      const response = fixtureDir
        ? { text: await readFile(path.join(fixtureDir, `${source.id}.xml`), 'utf8'), attempts: 1 }
        : await fetchWithRetry(source.endpoint, { fetchImpl, retries, timeoutMs });
      const parsed = parseFeed(response.text);
      const normalized = parsed.map((item) => normalizeStory(item, source)).filter(Boolean);
      stories.push(...normalized);
      sourceStatuses.push({ sourceId: source.id, status: 'success', accessMethod: fixtureDir ? 'fixture' : source.accessMethod, itemCount: normalized.length, attempts: response.attempts });
    } catch (error) {
      sourceStatuses.push({ sourceId: source.id, status: 'failed', accessMethod: fixtureDir ? 'fixture' : source.accessMethod, itemCount: 0, attempts: error.attempts ?? (fixtureDir ? 1 : retries + 1), error: error.message });
    }
  }
  const uniqueStories = dedupeStories(stories);
  const finishedAt = now().toISOString();
  const snapshot = { version: 1, generatedAt: finishedAt, stories: uniqueStories };
  const runStatus = { version: 1, startedAt, finishedAt, sourceCount: sourceStatuses.length, successfulSources: sourceStatuses.filter((entry) => entry.status === 'success').length, failedSources: sourceStatuses.filter((entry) => entry.status === 'failed').length, storyCount: uniqueStories.length };
  await publishSnapshot({ outputDir, snapshot, runStatus, sourceStatuses });
  return { snapshot, runStatus, sourceStatuses };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node ingest/run.mjs [--output DIR] [--fixture-dir DIR] [--source SOURCE_ID]');
  } else {
    runIngestion({ outputDir: args.output, fixtureDir: args.fixturedir, sourceId: args.source })
      .then(({ runStatus }) => console.log(JSON.stringify(runStatus, null, 2)))
      .catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}
