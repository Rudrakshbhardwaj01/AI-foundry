import { createHash } from 'node:crypto';

export const CATEGORIES = Object.freeze([
  'Model Releases', 'Research', 'Industry', 'Open Source', 'Policy', 'Tools', 'Infrastructure', 'Safety',
]);

const TRACKING_PARAMETERS = /^(utm_[^=]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|source)$/i;
const AI_TERMS = /\b(ai|artificial intelligence|machine learning|deep learning|llm|language model|vision model|multimodal|inference|training|neural|transformer|generative|open[- ]weight|robotics|alignment|safety evaluation|gpu|accelerator)\b/i;
const CATEGORY_RULES = [
  ['Safety', /\b(safety|alignment|interpretability|red[- ]team|risk|dangerous capability|security evaluation)\b/i],
  ['Policy', /\b(policy|regulation|regulatory|governance|law|legislation|government|act|standards?)\b/i],
  ['Infrastructure', /\b(gpu|accelerator|chip|semiconductor|datacenter|data center|inference|compute|cloud|latency|hardware)\b/i],
  ['Open Source', /\b(open[- ]source|open[- ]weight|repository|github|llama|vllm|llama\.cpp|dataset|release notes)\b/i],
  ['Tools', /\b(api|sdk|developer|tooling|framework|library|agent|workflow|documentation|platform)\b/i],
  ['Model Releases', /\b(model|release|launch|announc|claude|gpt|gemini|mistral|qwen|llama|weights?)\b/i],
  ['Research', /\b(research|paper|study|benchmark|evaluation|preprint|arxiv|method|training)\b/i],
  ['Industry', /\b(company|funding|acquisition|business|market|partnership|investment|startup|enterprise)\b/i],
];

function cleanText(value, maxLength = 640) {
  const text = String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength).replace(/\s+\S*$/, '').trim();
  return `${cut || text.slice(0, maxLength).trim()}…`;
}

export function normalizeUrl(value, baseUrl) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let url;
  try { url = new URL(value.trim(), baseUrl); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) url.port = '';
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMETERS.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  url.hash = '';
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

function isoDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function mapCategory({ title = '', summary = '', category = '', sourceCategories = [] } = {}) {
  const hinted = String(category).trim().toLowerCase();
  const direct = CATEGORIES.find((entry) => entry.toLowerCase() === hinted);
  if (direct) return direct;
  const text = `${title} ${summary}`;
  const matched = CATEGORY_RULES.find(([, pattern]) => pattern.test(text))?.[0];
  if (matched) return matched;
  return CATEGORIES.find((entry) => entry.toLowerCase() === String(sourceCategories[0] ?? '').toLowerCase()) ?? 'Research';
}

export function isRelevant({ title = '', summary = '', dedicatedSource = false } = {}) {
  return dedicatedSource || AI_TERMS.test(`${title} ${summary}`);
}

export function normalizeStory(item, source, { baseUrl = source.feedUrl ?? source.feedUrls?.[0] ?? source.endpoint ?? source.canonicalUrl } = {}) {
  const url = normalizeUrl(item.link, baseUrl);
  const title = cleanText(item.title, 260);
  if (!url || !title) return null;
  const summary = cleanText(item.summary, 640);
  const dedicatedSource = ['arxiv', 'hugging-face', 'import-ai', 'stanford-hai', 'uk-aisi', 'oecd-ai', 'indiaai'].includes(source.id);
  if (source.relevanceFilter && !isRelevant({ title, summary, dedicatedSource })) return null;
  const publishedAt = isoDate(item.publishedAt);
  const sourceItemId = cleanText(item.guid, 180);
  const fingerprint = `${source.id}\n${sourceItemId || url}\n${title.toLowerCase()}\n${publishedAt ?? ''}`;
  const id = `article_${createHash('sha256').update(fingerprint).digest('hex').slice(0, 20)}`;
  return {
    id,
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.sourceType,
    title,
    description: summary,
    url,
    publishedAt,
    category: mapCategory({ title, summary, category: item.category, sourceCategories: source.categories }),
  };
}

export function dedupeStories(stories, { limit = 300 } = {}) {
  const byKey = new Map();
  for (const story of stories) {
    if (!story?.url || !story?.title) continue;
    const key = story.url || `${story.title.toLowerCase()}|${story.publishedAt ?? ''}`;
    const current = byKey.get(key);
    if (!current || (story.description?.length ?? 0) > (current.description?.length ?? 0)) byKey.set(key, story);
  }
  return [...byKey.values()].sort((a, b) => {
    const left = b.publishedAt ?? '';
    const right = a.publishedAt ?? '';
    if (left !== right) return left < right ? -1 : 1;
    if (a.sourceId !== b.sourceId) return a.sourceId < b.sourceId ? -1 : 1;
    return a.id.localeCompare(b.id);
  }).slice(0, limit);
}
