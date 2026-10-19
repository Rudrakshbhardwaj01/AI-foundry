#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SOURCE_REGISTRY } from './registry.mjs';
import { collectSource } from './adapters.mjs';
import { normalizeStory, dedupeStories } from './normalize.mjs';
import { atomicWrite, publishSnapshot, readSnapshot, readSourceStatus } from './snapshot.mjs';

function parseArgs(argv) {
  const args = { output: 'data', fixtureDir: null, source: null, retries: 2 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output' || arg === '--fixture-dir' || arg === '--source' || arg === '--retries') {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      args[key] = arg === '--retries' ? Number(argv[++index]) : argv[++index];
    } else if (arg === '--help') args.help = true;
  }
  return args;
}

async function fixtureItems(source, fixtureDir) {
  const file = path.join(fixtureDir, `${source.id}.xml`);
  return { items: [{ __feed: await readFile(file, 'utf8') }], attempts: 1 };
}

async function writeRunStatus(outputDir, runStatus, sourceStatuses) {
  await atomicWrite(path.join(outputDir, 'run-status.json'), `${JSON.stringify(runStatus, null, 2)}\n`);
  await atomicWrite(path.join(outputDir, 'source-status.json'), `${JSON.stringify(sourceStatuses, null, 2)}\n`);
}

export async function runIngestion({
  registry = SOURCE_REGISTRY,
  outputDir = 'data',
  fixtureDir,
  sourceId,
  fetchImpl,
  retries = 2,
  timeoutMs,
  now = () => new Date(),
} = {}) {
  const startedAt = now().toISOString();
  const previousSnapshot = await readSnapshot(outputDir);
  const previousStatuses = await readSourceStatus(outputDir);
  const stories = previousSnapshot?.articles ?? [];
  const sourceStatuses = {};
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  let fetchedCount = 0;
  let acceptedCount = 0;
  let duplicateCount = 0;

  for (const source of registry) {
    if (sourceId && source.id !== sourceId) continue;
    const prior = previousStatuses[source.id] ?? {};
    if (source.enabled === false || (!source.feedUrl && !source.feedUrls && !source.apiUrl && !source.endpoint)) {
      sourceStatuses[source.id] = { ...prior, sourceId: source.id, name: source.name, status: 'unavailable', lastAttemptAt: prior.lastAttemptAt ?? null, lastSuccessfulFetchAt: prior.lastSuccessfulFetchAt ?? null, error: source.notes ?? 'No enabled public access method.' };
      continue;
    }
    attempted += 1;
    const lastAttemptAt = now().toISOString();
    try {
      const response = fixtureDir
        ? await fixtureItems(source, fixtureDir)
        : await collectSource(source, { fetchImpl, retries, timeoutMs: timeoutMs ?? source.timeoutMs });
      let items = response.items;
      if (fixtureDir && items[0]?.__feed) {
        const { parseFeed } = await import('./parse.mjs');
        items = parseFeed(items[0].__feed);
      }
      fetchedCount += items.length;
      const normalized = items.map((item) => normalizeStory(item, source)).filter(Boolean);
      acceptedCount += normalized.length;
      duplicateCount += Math.max(0, normalized.length - new Set(normalized.map((story) => story.url)).size);
      stories.push(...normalized);
      succeeded += 1;
      sourceStatuses[source.id] = { ...prior, sourceId: source.id, name: source.name, status: 'success', accessMethod: source.accessMethod, itemCount: normalized.length, attempts: response.attempts, lastAttemptAt, lastSuccessfulFetchAt: lastAttemptAt, error: null };
    } catch (error) {
      failed += 1;
      sourceStatuses[source.id] = { ...prior, sourceId: source.id, name: source.name, status: 'failed', accessMethod: source.accessMethod, itemCount: 0, attempts: error.attempts ?? retries + 1, lastAttemptAt, lastSuccessfulFetchAt: prior.lastSuccessfulFetchAt ?? null, error: error.message };
    }
  }

  const finishedAt = now().toISOString();
  const enabledSources = registry.filter((source) => source.enabled !== false && (!sourceId || source.id === sourceId));
  const allFailed = enabledSources.length > 0 && succeeded === 0 && failed === attempted;
  const runStatus = {
    schemaVersion: 1, runId: `run_${createHash('sha256').update(`${startedAt}:${finishedAt}`).digest('hex').slice(0, 16)}`,
    startedAt, finishedAt, status: allFailed ? 'failed' : 'success', attemptedSources: attempted,
    successfulSources: succeeded, failedSources: failed, fetchedArticles: fetchedCount,
    acceptedArticles: acceptedCount, duplicatesSkipped: duplicateCount, published: !allFailed,
  };

  if (allFailed) {
    await writeRunStatus(outputDir, runStatus, sourceStatuses);
    return { snapshot: previousSnapshot, runStatus, sourceStatuses };
  }

  const articles = dedupeStories(stories);
  const snapshotId = `snapshot_${createHash('sha256').update(JSON.stringify(articles)).digest('hex').slice(0, 20)}`;
  const snapshot = {
    schemaVersion: 1, snapshotId, publishedAt: finishedAt, lastSuccessfulRefreshAt: finishedAt,
    articleCount: articles.length, articles,
  };
  await publishSnapshot({ outputDir, snapshot, runStatus, sourceStatuses });
  return { snapshot, runStatus, sourceStatuses };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) console.log('Usage: node ingest/run.mjs [--output DIR] [--fixture-dir DIR] [--source SOURCE_ID] [--retries N]');
  else runIngestion({ outputDir: args.output, fixtureDir: args.fixtureDir, sourceId: args.source, retries: args.retries })
    .then(({ runStatus }) => console.log(JSON.stringify(runStatus, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
