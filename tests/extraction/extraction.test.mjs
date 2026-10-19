import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_MAX_HTML_BYTES,
  cleanArticleText,
  extractArticleCandidates,
  extractSourcePage,
} from '../../ingest/extract.mjs';

const fixture = (name) => readFile(path.join('tests', 'extraction', 'fixtures', name), 'utf8');
const url = 'https://example.test/articles/foundry-extraction';

test('extracts Article and NewsArticle JSON-LD, Open Graph, and meta descriptions', async () => {
  const result = extractSourcePage({ url, html: await fixture('metadata.html') });

  assert.equal(result.url, url);
  assert.deepEqual(result.candidates.map(({ provenance, contentType, text }) => ({ provenance, contentType, text })), [
    { provenance: 'json-ld:abstract', contentType: 'abstract', text: 'An abstract from JSON-LD.' },
    { provenance: 'json-ld:description', contentType: 'abstract', text: 'A longer JSON-LD description.' },
    { provenance: 'json-ld:description', contentType: 'abstract', text: 'A graph article description.' },
    { provenance: 'open-graph:description', contentType: 'abstract', text: 'Open Graph summary & context.' },
    { provenance: 'meta:description', contentType: 'abstract', text: 'The ordinary meta description.' },
  ]);
});

test('cleans article text without retaining navigation, scripts, styles, cookies, or footer boilerplate', async () => {
  const candidates = extractArticleCandidates(url, await fixture('cleanup.html'));

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].provenance, 'html:article');
  assert.equal(candidates[0].contentType, 'article');
  assert.equal(candidates[0].text, 'Useful article title\nThe first paragraph has important text.\nThe second paragraph\ncontinues on a new line.');
  assert.doesNotMatch(candidates[0].text, /navigation|subscribe|cookie|shouldNotAppear|hidden|share|privacy|fallback/i);
});

test('returns no candidates when metadata and article containers are absent', async () => {
  assert.deepEqual(extractSourcePage({ url, html: await fixture('missing.html') }), { url, candidates: [] });
});

test('cleans entities and tags for a directly supplied fragment', () => {
  assert.equal(cleanArticleText('<p>One &amp; <em>two</em>.</p><!-- no --><p>Three&nbsp;words.</p>'), 'One & two.\nThree words.');
});

test('rejects oversized fetched HTML before extraction', () => {
  const html = 'x'.repeat(DEFAULT_MAX_HTML_BYTES + 1);
  assert.throws(() => extractSourcePage(url, html), /exceeds.*byte limit/i);
  assert.throws(() => extractSourcePage({ url, html: 'small', maxBytes: 4 }), /exceeds.*4 byte limit/i);
});

test('does not fetch or accept non-HTTP article URLs', () => {
  assert.throws(() => extractSourcePage('file:///tmp/article.html', '<article>text</article>'), /HTTP\(S\)/i);
});
