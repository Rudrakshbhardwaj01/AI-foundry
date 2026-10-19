import { createHash } from 'node:crypto';

export const CATEGORIES = Object.freeze(['world', 'national', 'politics', 'business', 'technology', 'science', 'health', 'climate', 'culture', 'sports', 'general']);

const TRACKING_PARAMETERS = /^(utm_[^=]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src)$/i;
const CATEGORY_RULES = [
  ['sports', /\b(sport|sports|football|soccer|basketball|baseball|tennis|olympic|cricket)\b/i],
  ['health', /\b(health|medical|medicine|hospital|disease|pandemic|vaccine|virus)\b/i],
  ['climate', /\b(climate|global warming|carbon|emissions|wildfire|drought|flood)\b/i],
  ['science', /\b(science|scientist|research|space|nasa|physics|biology|astronomy)\b/i],
  ['technology', /\b(technology|tech|software|ai|artificial intelligence|cyber|startup|chip|internet)\b/i],
  ['business', /\b(business|economy|economic|market|markets|stock|finance|trade|company)\b/i],
  ['politics', /\b(politic|election|government|parliament|congress|minister|president|senate)\b/i],
  ['culture', /\b(culture|arts?|film|movie|music|book|theater|television|fashion)\b/i],
];

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

export function mapCategory({ title = '', summary = '', category = '', defaultCategory = 'general' } = {}) {
  const hinted = String(category).toLowerCase().trim();
  if (CATEGORIES.includes(hinted)) return hinted;
  const text = `${title} ${summary}`;
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? (CATEGORIES.includes(defaultCategory) ? defaultCategory : 'general');
}

export function normalizeStory(item, source, { baseUrl = source.endpoint } = {}) {
  const url = normalizeUrl(item.link, baseUrl);
  const title = String(item.title ?? '').replace(/\s+/g, ' ').trim();
  if (!url || !title) return null;
  const summary = String(item.summary ?? '').replace(/\s+/g, ' ').trim();
  const publishedAt = isoDate(item.publishedAt);
  const fingerprint = `${url}\n${title.toLocaleLowerCase()}\n${publishedAt ?? ''}`;
  const id = `story_${createHash('sha256').update(fingerprint).digest('hex').slice(0, 20)}`;
  return {
    id,
    sourceId: source.id,
    sourceName: source.name,
    title,
    summary,
    url,
    publishedAt,
    category: mapCategory({ title, summary, category: item.category, defaultCategory: source.defaultCategory }),
  };
}

export function dedupeStories(stories) {
  const byKey = new Map();
  for (const story of stories) {
    const key = story.url || `${story.title.toLocaleLowerCase()}|${story.publishedAt ?? ''}`;
    const current = byKey.get(key);
    if (!current || (story.summary.length > current.summary.length)) byKey.set(key, story);
  }
  return [...byKey.values()].sort((a, b) => {
    const dateCompare = (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
    return dateCompare || a.sourceId.localeCompare(b.sourceId) || a.id.localeCompare(b.id);
  });
}
