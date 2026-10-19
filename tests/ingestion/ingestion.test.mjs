import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseFeed } from '../../ingest/parse.mjs';
import { dedupeStories, normalizeStory, normalizeUrl } from '../../ingest/normalize.mjs';
import { runIngestion } from '../../ingest/run.mjs';
import { publishSnapshot, validateSnapshot } from '../../ingest/snapshot.mjs';
import { collectSource } from '../../ingest/adapters.mjs';

const fixture = (name) => readFile(path.join('tests', 'ingestion', 'fixtures', name), 'utf8');
const source = { id: 'fixture', name: 'Fixture', status: 'enabled', accessMethod: 'rss', sourceType: 'Blog post', endpoint: 'https://example.test/feed.xml', defaultCategory: 'general' };

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
  assert.equal(story.category, 'Research');
  assert.match(story.id, /^article_[a-f0-9]{20}$/);
});

test('deduplicates by canonical URL, retaining the richer record', () => {
  const first = normalizeStory({ title: 'Same story', link: 'https://example.test/a#one', summary: 'The first version reports a useful engineering update for developers. It explains the change, its compatibility, the rollout, and the testing process used by maintainers.', publishedAt: '2024-01-01' }, source);
  const second = normalizeStory({ title: 'Same story', link: 'https://example.test/a?utm_medium=x', summary: 'The richer version reports a useful engineering update for developers. It explains the change, its compatibility, the rollout, the testing process used by maintainers, and the measured latency improvement across supported workloads.', publishedAt: '2024-01-01' }, source);
  assert.equal(dedupeStories([first, second]).length, 1);
  assert.match(dedupeStories([first, second])[0].description, /measured latency improvement/);
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
  assert.equal(result.sourceStatuses.fixture.status, 'success');
  const broken = result.sourceStatuses.broken;
  assert.equal(broken.status, 'failed');
  assert.equal(broken.attempts, 3);
  assert.equal(calls, 4);
  await rm(outputDir, { recursive: true, force: true });
});

test('publishes a new snapshot while retaining the previous snapshot', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'ingestion-snapshot-'));
  const first = { schemaVersion: 1, snapshotId: 'one', publishedAt: '2024-01-01T00:00:00.000Z', lastSuccessfulRefreshAt: '2024-01-01T00:00:00.000Z', articleCount: 1, articles: [{ id: 'one', title: 'One', url: 'https://example.test/one' }] };
  const second = { schemaVersion: 1, snapshotId: 'two', publishedAt: '2024-01-02T00:00:00.000Z', lastSuccessfulRefreshAt: '2024-01-02T00:00:00.000Z', articleCount: 1, articles: [{ id: 'two', title: 'Two', url: 'https://example.test/two' }] };
  assert.equal(validateSnapshot(first), true);
  await publishSnapshot({ outputDir, snapshot: first, runStatus: { storyCount: 1 }, sourceStatuses: [] });
  await publishSnapshot({ outputDir, snapshot: second, runStatus: { storyCount: 1 }, sourceStatuses: [] });
  assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, 'published.json'))), second);
  assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, 'previous.json'))), first);
  await assert.rejects(() => publishSnapshot({ outputDir, snapshot: { bad: 1n }, runStatus: {}, sourceStatuses: [] }));
  assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, 'published.json'))), second);
  await rm(outputDir, { recursive: true, force: true });
});

test('keeps the last known-good snapshot when every source fails', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'ingestion-all-failed-'));
  const existing = { schemaVersion: 1, snapshotId: 'existing', publishedAt: '2024-01-02T00:00:00.000Z', lastSuccessfulRefreshAt: '2024-01-02T00:00:00.000Z', articleCount: 1, articles: [{ id: 'one', title: 'Existing', url: 'https://example.test/one' }] };
  await publishSnapshot({ outputDir, snapshot: existing, runStatus: {}, sourceStatuses: {} });
  const result = await runIngestion({ registry: [{ ...source, id: 'down' }], outputDir, fetchImpl: async () => { throw new Error('offline'); }, retries: 1 });
  assert.equal(result.runStatus.status, 'failed');
  assert.equal(result.runStatus.published, false);
  assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, 'published.json'))), existing);
  await rm(outputDir, { recursive: true, force: true });
});

test('rejects malformed feeds and unsafe article URLs', () => {
  assert.throws(() => parseFeed('<rss><channel><item>broken'), /malformed/i);
  assert.equal(normalizeStory({ title: 'Unsafe', link: 'javascript:alert(1)' }, source), null);
});

test('enriches a weak feed item from an approved article page without fetching arbitrary hosts', async () => {
  const feed = '<rss><channel><item><guid>page-1</guid><title>Runtime update</title><link>https://publisher.test/article</link><description>Short excerpt.</description><pubDate>2024-01-01T00:00:00Z</pubDate></item></channel></rss>';
  const calls = [];
  const result = await collectSource({
    id: 'publisher', name: 'Publisher', canonicalUrl: 'https://publisher.test/', feedUrl: 'https://publisher.test/feed.xml',
    accessMethod: 'rss', sourceType: 'Blog post', pageEnrichmentLimit: 1,
  }, {
    enrichPages: true,
    fetchImpl: async (url) => {
      calls.push(url);
      const text = url.endsWith('/feed.xml') ? feed : '<article><p>The page explains the runtime change for developers.</p><p>It documents compatibility, measured latency, and the rollout steps used by maintainers.</p></article>';
      return { ok: true, status: 200, url, headers: { get: () => 'text/html' }, text: async () => text };
    },
  });
  assert.equal(result.items[0].contentCandidates[0].provenance, 'html:article');
  assert.deepEqual(calls, ['https://publisher.test/feed.xml', 'https://publisher.test/article']);
});

test('migrates legacy published descriptions through the summarizer without changing article identity', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'ingestion-migration-'));
  const legacy = { schemaVersion: 1, snapshotId: 'legacy', publishedAt: '2024-01-01T00:00:00.000Z', lastSuccessfulRefreshAt: '2024-01-01T00:00:00.000Z', articleCount: 1, articles: [{ id: 'legacy-id', sourceId: 'fixture', sourceName: 'Fixture', sourceType: 'Blog post', title: 'Runtime update', description: 'The release improves runtime compatibility for developers. It also documents migration steps and reports measured latency on supported workloads.', url: 'https://example.test/runtime', publishedAt: '2024-01-01T00:00:00.000Z', category: 'Tools' }] };
  await publishSnapshot({ outputDir, snapshot: legacy, runStatus: {}, sourceStatuses: {} });
  const result = await runIngestion({ registry: [{ ...source, enabled: false }], outputDir });
  assert.equal(result.runStatus.reprocessedExisting, 1);
  assert.equal(result.snapshot.articles[0].id, 'legacy-id');
  assert.ok(result.snapshot.articles[0].summaryMethod);
  await rm(outputDir, { recursive: true, force: true });
});

test('repeated ingestion of unchanged content produces identical summaries', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'ingestion-repeat-'));
  const fixedNow = () => new Date('2024-01-03T00:00:00.000Z');
  const fetchImpl = async () => ({ ok: true, status: 200, url: source.endpoint, headers: { get: () => 'application/rss+xml' }, text: async () => fixture('bbc-news.xml') });
  const first = await runIngestion({ registry: [source], outputDir, fetchImpl, now: fixedNow });
  const second = await runIngestion({ registry: [source], outputDir, fetchImpl, now: fixedNow });
  assert.deepEqual(second.snapshot.articles, first.snapshot.articles);
  await rm(outputDir, { recursive: true, force: true });
});
