import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseFeed } from '../../ingest/parse.mjs';
import { dedupeStories, normalizeStory, normalizeUrl } from '../../ingest/normalize.mjs';
import { runIngestion } from '../../ingest/run.mjs';
import { publishSnapshot } from '../../ingest/snapshot.mjs';

const fixture = (name) => readFile(path.join('tests', 'ingestion', 'fixtures', name), 'utf8');
const source = { id: 'fixture', name: 'Fixture', status: 'enabled', accessMethod: 'rss', endpoint: 'https://example.test/feed.xml', defaultCategory: 'general' };

test('parses RSS and Atom entries and decodes content', async () => {
  const rss = parseFeed(await fixture('bbc-news.xml'));
  assert.equal(rss.length, 2);
  assert.equal(rss[0].title, 'Markets and technology update');
  assert.equal(rss[0].summary, 'A short summary.');
  const atom = parseFeed(await fixture('atom.xml'));
  assert.equal(atom[0].link, 'https://example.test/space/new-planet/');
  assert.equal(atom[0].category, 'science');
});

test('normalizes safe URLs and maps categories deterministically', () => {
  assert.equal(normalizeUrl('HTTPS://Example.TEST:443/a/?utm_source=x&b=2#fragment'), 'https://example.test/a?b=2');
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
  const story = normalizeStory({ title: 'A vaccine research update', link: '/health', summary: 'New medical research.' }, source);
  assert.equal(story.category, 'health');
  assert.match(story.id, /^story_[a-f0-9]{20}$/);
});

test('deduplicates by canonical URL, retaining the richer record', () => {
  const first = normalizeStory({ title: 'Same story', link: 'https://example.test/a#one', summary: 'short', publishedAt: '2024-01-01' }, source);
  const second = normalizeStory({ title: 'Same story', link: 'https://example.test/a?utm_medium=x', summary: 'a considerably longer summary', publishedAt: '2024-01-01' }, source);
  assert.equal(dedupeStories([first, second]).length, 1);
  assert.equal(dedupeStories([first, second])[0].summary, 'a considerably longer summary');
});

test('isolates source failures and retries boundedly', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'ingestion-isolation-'));
  let calls = 0;
  const registry = [source, { ...source, id: 'broken', name: 'Broken', endpoint: 'https://example.test/broken.xml' }];
  const result = await runIngestion({
    registry,
    outputDir,
    retries: 2,
    fetchImpl: async (url) => {
      calls += 1;
      if (url.endsWith('broken.xml')) throw new Error('fixture unavailable');
      return { ok: true, text: async () => fixture('bbc-news.xml') };
    },
  });
  assert.equal(result.sourceStatuses.find((entry) => entry.sourceId === 'fixture').status, 'success');
  const broken = result.sourceStatuses.find((entry) => entry.sourceId === 'broken');
  assert.equal(broken.status, 'failed');
  assert.equal(broken.attempts, 3);
  assert.equal(calls, 4);
  await rm(outputDir, { recursive: true, force: true });
});

test('publishes a new snapshot while retaining the previous snapshot', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'ingestion-snapshot-'));
  const first = { version: 1, generatedAt: '2024-01-01T00:00:00.000Z', stories: [{ id: 'one' }] };
  const second = { version: 1, generatedAt: '2024-01-02T00:00:00.000Z', stories: [{ id: 'two' }] };
  await publishSnapshot({ outputDir, snapshot: first, runStatus: { storyCount: 1 }, sourceStatuses: [] });
  await publishSnapshot({ outputDir, snapshot: second, runStatus: { storyCount: 1 }, sourceStatuses: [] });
  assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, 'published.json'))), second);
  assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, 'previous.json'))), first);
  await assert.rejects(() => publishSnapshot({ outputDir, snapshot: { bad: 1n }, runStatus: {}, sourceStatuses: [] }));
  assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, 'published.json'))), second);
  await rm(outputDir, { recursive: true, force: true });
});
