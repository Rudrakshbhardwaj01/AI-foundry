import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanHtmlContent,
  decodeEntities,
  extractMetadata,
  extractSentences,
  rankSentences,
  selectFallback,
  summarize,
  validateSummaryQuality,
} from '../../ingest/summarize.mjs';

const words = (value) => (value.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? []).length;

test('cleans RSS/Atom HTML, entities, links, and boilerplate without a DOM', () => {
  const html = '<p>Researchers found &amp; measured &#x31;&#56;% gains.</p><p>Read more at <a href="https://example.test/story">the source</a>.</p><script>tracking()</script><p>Follow-up work is planned.</p>';
  assert.equal(cleanHtmlContent(html), 'Researchers found & measured 18% gains.\nthe source.\nFollow-up work is planned.');
  assert.equal(decodeEntities('&ldquo;AI&rsquo;s&nbsp;future&rdquo;'), '“AI’s future”');
});

test('extracts JSON-LD and Open Graph-like metadata from page HTML', () => {
  const html = `<html><head>
    <meta property="og:title" content="Model release">
    <meta property="og:description" content="A concise release description for readers.">
    <script type="application/ld+json">{"@type":"NewsArticle","headline":"Structured headline","articleBody":"The structured article body explains the release and its measured results for developers. It describes compatibility changes, performance evidence, rollout guidance, and the testing process used by maintainers and downstream teams."}</script>
  </head><body><nav>Menu</nav><article>Visible fallback text.</article></body></html>`;
  const metadata = extractMetadata({ html });
  assert.equal(metadata.title, 'Model release');
  assert.equal(metadata.description, 'A concise release description for readers.');
  assert.equal(metadata.articleBody, 'The structured article body explains the release and its measured results for developers. It describes compatibility changes, performance evidence, rollout guidance, and the testing process used by maintainers and downstream teams.');
  assert.equal(metadata.source, 'json-ld');
  const result = summarize({ html });
  assert.equal(result.summaryContentSource, 'json-ld');
  assert.match(result.description, /structured article body/i);
});

test('extracts and deduplicates research abstract sentences', () => {
  const abstract = 'Researchers introduce a compact evaluation method for multimodal models. The study compares six systems across three public benchmarks and reports fewer false positives. Researchers introduce a compact evaluation method for multimodal models. Results are released with reproducible analysis scripts for future work, including annotations and baseline configurations for independent replication.';
  const candidates = extractSentences(abstract);
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].text, 'Researchers introduce a compact evaluation method for multimodal models.');
  const result = summarize({ title: 'Multimodal evaluation', abstract });
  assert.ok(words(result.description) >= 35 && words(result.description) <= 65);
  assert.equal(result.summaryQuality, 'high');
  assert.ok(result.summaryFlags.includes('deduplicated-or-filtered'));
});

test('ranks useful release-note prose above commands and tags', () => {
  const release = `# v2.4 release
  $ npm install @foundry/model
  #opensource #release
  The new inference runtime reduces cold-start latency by 42 percent for small language models.
  Teams can now stream partial results, configure regional routing, and inspect request traces from the dashboard.
  Existing API clients remain compatible, while the migration guide documents the one optional configuration change.
  `;
  const candidates = extractSentences(release);
  const ranked = rankSentences(candidates);
  assert.ok(ranked[0].text.includes('cold-start latency'));
  const result = summarize({ title: 'Runtime v2.4', content: release });
  assert.ok(words(result.description) >= 35 && words(result.description) <= 65);
  assert.doesNotMatch(result.description, /<[^>]+>|https?:\/\//);
  assert.doesNotMatch(result.description, /npm install/);
});

test('removes URL-heavy material while retaining the substantive sentence', () => {
  const content = 'https://one.example/a https://two.example/b https://three.example/c. The company published a safety evaluation describing stronger refusal behavior and clearer failure reports for deployed assistants. https://four.example/d';
  const result = summarize({ title: 'Safety evaluation', content });
  assert.match(result.description, /safety evaluation/);
  assert.doesNotMatch(result.description, /https?:\/\//);
  assert.ok(result.summaryFlags.includes('url-cleaned'));
});

test('uses an honest headline fallback when there is no usable body', () => {
  const result = summarize({ title: 'Open weights arrive for a compact reasoning model' });
  assert.match(result.description, /publisher has not provided enough accessible text/i);
  assert.equal(result.summaryMethod, 'fallback');
  assert.equal(result.summaryContentSource, 'fallback');
  assert.equal(result.summaryQuality, 'insufficient');
  assert.ok(result.summaryFlags.includes('headline-only'));
  assert.ok(result.summaryFlags.includes('fallback'));
});

test('filters generic opening boilerplate and preserves useful content', () => {
  const content = 'Welcome to our weekly update about artificial intelligence and product news. In this article, the team reports a new benchmark result. The released system improves retrieval accuracy by 12 percent on multilingual tests. The authors also publish evaluation data so independent teams can reproduce the comparison.';
  const result = summarize({ title: 'Benchmark update', content });
  assert.doesNotMatch(result.description, /Welcome to our|In this article/i);
  assert.match(result.description, /benchmark result|retrieval accuracy/i);
  assert.ok(words(result.description) >= 35 && words(result.description) <= 65);
});

test('quality validation reports target and fallback boundaries', () => {
  assert.deepEqual(validateSummaryQuality('A short headline.', { usedFallback: true }).flags, ['below-target', 'fallback']);
  assert.equal(validateSummaryQuality('One useful sentence with enough words to be readable but not enough to reach the target range.', { sourceWordCount: 20 }).quality, 'limited');
  assert.equal(validateSummaryQuality('A '.repeat(70), {}).quality, 'limited');
  assert.equal(selectFallback({ title: 'Headline only' }).source, 'fallback');
});

test('multi-sentence selection is deterministic and preserves source order', () => {
  const input = {
    title: 'Research update',
    content: 'The team publishes a new dataset for evaluating factual consistency in language models. The dataset covers news, science, and public policy questions collected from volunteer annotators. An accompanying baseline shows that larger models still fail on temporal and causal questions. The release includes annotation guidelines, licensing details, and scripts for reproducing every reported metric.',
  };
  const first = summarize(input);
  for (let attempt = 0; attempt < 20; attempt += 1) assert.deepEqual(summarize(input), first);
  assert.ok(words(first.description) >= 35 && words(first.description) <= 65);
  const positions = ['dataset', 'accompanying baseline', 'release includes']
    .map((phrase) => first.description.indexOf(phrase))
    .filter((position) => position >= 0);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test('preserves technical identifiers and never cuts a source sentence mid-thought', () => {
  const result = summarize({
    title: 'Runtime 2.4 improves vLLM compatibility',
    content: 'Runtime 2.4 adds vLLM 0.6 compatibility and keeps CUDA 12.4 support for existing deployments. The maintainers report a 42% reduction in cold-start latency on the reference benchmark. The release includes migration notes and reproducible configuration examples for operators.',
  });
  assert.match(result.description, /vLLM 0\.6/);
  assert.match(result.description, /CUDA 12\.4/);
  assert.match(result.description, /42%/);
  assert.doesNotMatch(result.description, /…$/);
});
