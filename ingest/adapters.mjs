import { fetchWithRetry } from './fetch.mjs';
import { parseFeed } from './parse.mjs';
import { extractArticleCandidates } from './extract.mjs';
import { summarize } from './summarize.mjs';

const HN_RELEVANCE = /\b(ai|llm|machine learning|deep learning|model|inference|gpu|neural|open source|transformer|robotics)\b/i;

async function fetchJson(url, { fetchImpl, timeoutMs = 10000, retries = 2 } = {}) {
  const response = await fetchWithRetry(url, { fetchImpl, timeoutMs, retries, maxBytes: 1_000_000 });
  return { value: JSON.parse(response.text), attempts: response.attempts };
}

async function collectFeed(source, { fetchImpl, retries, timeoutMs, enrichPages } = {}) {
  const endpoints = source.feedUrls ?? [source.feedUrl ?? source.endpoint];
  const items = [];
  let attempts = 0;
  for (const endpoint of endpoints.filter(Boolean)) {
    const response = await fetchWithRetry(endpoint, { fetchImpl, retries, timeoutMs });
    attempts += response.attempts;
    items.push(...parseFeed(response.text));
  }
  if ((enrichPages ?? !fetchImpl) && source.pageEnrichment !== false) {
    const pageLimit = source.pageEnrichmentLimit ?? 12;
    for (const item of items.filter((candidate) => needsPageEnrichment(candidate)).slice(0, pageLimit)) {
      if (!isApprovedPageUrl(item.link, source)) continue;
      try {
        const page = await fetchWithRetry(item.link, { fetchImpl, retries: 1, timeoutMs, maxBytes: 2_000_000 });
        attempts += page.attempts;
        const contentType = page.headers?.get?.('content-type') ?? '';
        if (contentType && !/html|xhtml/i.test(contentType)) continue;
        const pageUrl = page.finalUrl ?? item.link;
        if (!isApprovedPageUrl(pageUrl, source)) continue;
        const candidates = extractArticleCandidates({ url: pageUrl, html: page.text });
        if (candidates.length) item.contentCandidates = candidates;
      } catch {
        // Page enrichment is optional. The feed item remains publishable.
      }
    }
  }
  return { items, attempts };
}

function needsPageEnrichment(item) {
  const candidate = item.content ?? item.summary ?? '';
  return summarize({ title: item.title, content: candidate }).summaryQuality !== 'high';
}

function isApprovedPageUrl(value, source) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const approvedHosts = [source.canonicalUrl, ...(source.feedUrls ?? []), source.feedUrl]
      .filter(Boolean)
      .map((entry) => new URL(entry).hostname.toLowerCase());
    return approvedHosts.some((host) => url.hostname.toLowerCase() === host || url.hostname.toLowerCase().endsWith(`.${host}`));
  } catch {
    return false;
  }
}

async function collectHackerNews(source, { fetchImpl, retries, timeoutMs } = {}) {
  const base = source.apiUrl;
  const ids = (await fetchJson(`${base}topstories.json`, { fetchImpl, retries, timeoutMs })).value;
  const selected = [];
  let attempts = 1;
  for (const id of (Array.isArray(ids) ? ids : []).slice(0, 30)) {
    const result = await fetchJson(`${base}item/${id}.json`, { fetchImpl, retries: 1, timeoutMs });
    attempts += result.attempts;
    const item = result.value;
    if (item?.type === 'story' && item.url && HN_RELEVANCE.test(`${item.title ?? ''} ${item.text ?? ''}`)) {
      selected.push({ guid: String(item.id), title: item.title, link: item.url, summary: item.text ?? '', publishedAt: item.time ? new Date(item.time * 1000).toISOString() : null });
    }
  }
  return { items: selected, attempts };
}

async function collectGithub(source, { fetchImpl, retries, timeoutMs } = {}) {
  const items = [];
  let attempts = 0;
  for (const repository of source.repositories ?? []) {
    const response = await fetchJson(`${source.apiUrl}${repository}/releases?per_page=5`, { fetchImpl, retries, timeoutMs });
    attempts += response.attempts;
    for (const release of Array.isArray(response.value) ? response.value : []) {
      if (!release?.html_url || !release.name) continue;
      items.push({ guid: String(release.id ?? release.html_url), title: `${repository.split('/')[1]}: ${release.name}`, link: release.html_url, summary: release.body ?? '', publishedAt: release.published_at ?? release.created_at });
    }
  }
  return { items, attempts };
}

export async function collectSource(source, options = {}) {
  if (source.accessMethod === 'rss' || source.accessMethod === 'atom') return collectFeed(source, options);
  if (source.accessMethod === 'hacker-news-api') return collectHackerNews(source, options);
  if (source.accessMethod === 'github-releases') return collectGithub(source, options);
  throw new Error('No enabled adapter for source');
}
