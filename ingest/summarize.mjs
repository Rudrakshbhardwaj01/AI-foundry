/**
 * Deterministic, dependency-free article summarization.
 *
 * The pipeline is deliberately kept in four visible stages:
 *   1. cleanHtmlContent / extractMetadata - turn feeds and pages into text;
 *   2. extractSentences / rankSentences - find useful, stable candidates;
 *   3. validateSummaryQuality - measure whether a summary is supportable;
 *   4. selectFallback - choose the most honest short result when it is not.
 */

const MIN_WORDS = 35;
const MAX_WORDS = 65;
const MAX_SENTENCE_WORDS = 42;

const ENTITY_NAMES = Object.freeze({
  amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
  hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', minus: '−', middot: '·',
});

const BOILERPLATE = /^(?:read more|continue reading|advertisement|advertisements?|sponsored content|subscribe(?: now)?|sign up|log in|share|listen|watch|related|table of contents|in this article|in this post|this article|this post|welcome to)?$/i;
const BOILERPLATE_PHRASES = /\b(?:in this article|in this post|welcome to (?:our|the)|as an ai(?: language)? model|click here to|read more at|subscribe to our)\b/i;
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/gi;
const TAG_PATTERN = /#(?:[\p{L}\p{N}_-]{2,})/gu;

function asText(value) {
  return value == null ? '' : String(value);
}

/** Decode HTML entities without relying on a DOM or a package. */
export function decodeEntities(value) {
  let text = asText(value);
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = text.replace(/&(#x[\da-f]+|#\d+|[a-z][\w-]+);?/gi, (whole, entity) => {
      const lower = entity.toLowerCase();
      if (lower.startsWith('#x')) {
        const codePoint = Number.parseInt(lower.slice(2), 16);
        return Number.isFinite(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : whole;
      }
      if (lower.startsWith('#')) {
        const codePoint = Number.parseInt(lower.slice(1), 10);
        return Number.isFinite(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : whole;
      }
      return ENTITY_NAMES[lower] ?? whole;
    });
    if (decoded === text) break;
    text = decoded;
  }
  return text;
}

function tagAttribute(tag, attribute) {
  const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(["'])(.*?)\\1`, 'is'))
    ?? tag.match(new RegExp(`\\b${attribute}\\s*=\\s*([^\\s>]+)`, 'i'));
  return decodeEntities(match?.[2] ?? match?.[1] ?? '').trim();
}

function compactWhitespace(value) {
  return decodeEntities(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/[ \t\r\f]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Convert feed HTML or article HTML into readable text. Block tags become
 * boundaries so adjacent RSS paragraphs do not become one run-on sentence.
 */
export function cleanHtmlContent(value) {
  let html = asText(value);
  if (!html) return '';
  html = html.replace(/<!--[\s\S]*?-->/g, ' ');
  html = html.replace(/<\/?(?:script|style|noscript|template|svg|canvas|iframe|nav|footer|form|button|aside)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|template|svg|canvas|iframe|nav|footer|form|button|aside)>/gi, ' ');
  html = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|article|section|header|h[1-6]|li|blockquote|pre|tr|td|th)>/gi, '\n');
  html = html.replace(/<img\b[^>]*>/gi, (tag) => tagAttribute(tag, 'alt') ? ` ${tagAttribute(tag, 'alt')} ` : ' ');
  html = html.replace(/<a\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return compactWhitespace(html)
    .replace(URL_PATTERN, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function parseJsonLd(value) {
  try {
    const parsed = JSON.parse(decodeEntities(value));
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function flattenJsonLd(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, output);
  } else {
    output.push(value);
    if (value['@graph']) flattenJsonLd(value['@graph'], output);
    if (value.mainEntity) flattenJsonLd(value.mainEntity, output);
    if (value.item) flattenJsonLd(value.item, output);
  }
  return output;
}

/** Extract title, abstract and article body from JSON-LD and OG-like tags. */
export function extractMetadata(input = {}) {
  const source = typeof input === 'string' ? { html: input } : (input ?? {});
  const html = asText(source.html ?? source.contentHtml ?? source.bodyHtml ?? source.rawHtml);
  const metadata = {
    title: asText(source.title ?? source.headline).trim(),
    description: asText(source.description ?? source.summary).trim(),
    abstract: asText(source.abstract).trim(),
    articleBody: asText(source.articleBody ?? source.body).trim(),
    source: '',
  };
  const metaValues = new Map();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (tagAttribute(tag, 'property') || tagAttribute(tag, 'name')).toLowerCase();
    const content = tagAttribute(tag, 'content');
    if (key && content && !metaValues.has(key)) metaValues.set(key, content);
  }
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const metaTitle = metaValues.get('og:title') || metaValues.get('twitter:title');
  const metaDescription = metaValues.get('og:description') || metaValues.get('twitter:description') || metaValues.get('description');
  if (!metadata.title) metadata.title = metaTitle || cleanHtmlContent(titleTag || '');
  if (!metadata.description) metadata.description = metaDescription || '';

  const jsonItems = [];
  for (const script of html.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? []) {
    const body = script.replace(/^<[\s\S]*?>|<\/script>$/gi, '');
    jsonItems.push(...flattenJsonLd(parseJsonLd(body)));
  }
  for (const item of jsonItems) {
    const body = asText(item.articleBody ?? item.text ?? item.abstract).trim();
    const description = asText(item.description).trim();
    if (!metadata.title) metadata.title = asText(item.headline ?? item.name).trim();
    if (!metadata.articleBody && body) metadata.articleBody = body;
    if (!metadata.abstract && asText(item.abstract).trim()) metadata.abstract = asText(item.abstract).trim();
    if (!metadata.description && description) metadata.description = description;
  }
  if (metadata.articleBody) metadata.source = 'json-ld';
  else if (metadata.abstract) metadata.source = 'abstract';
  else if (metaDescription) metadata.source = 'open-graph';
  else if (metadata.description) metadata.source = 'description';
  else if (metadata.title) metadata.source = 'headline';
  return metadata;
}

function normalizedKey(value) {
  return asText(value).toLocaleLowerCase().replace(URL_PATTERN, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function wordCount(value) {
  return (asText(value).match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? []).length;
}

function trimSentence(value, maxWords = MAX_SENTENCE_WORDS) {
  const words = asText(value).trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ').replace(/[,:;—-]+$/, '')}…`;
}

function splitSentences(text) {
  const normalized = compactWhitespace(text).replace(/\s*([.!?])\s*/g, '$1 ');
  const pieces = normalized
    .split(/(?<=[.!?])\s+|\n+|(?<=;\s)/)
    .map((part) => part.replace(/^[\s•●▪*-]+/, '').trim())
    .filter(Boolean);
  return pieces.length ? pieces : (normalized ? [normalized] : []);
}

/** Extract useful prose sentences and collapse exact/near-exact duplicates. */
export function extractSentences(value) {
  const text = cleanHtmlContent(value);
  const seen = new Set();
  const output = [];
  for (const raw of splitSentences(text)) {
    const withoutUrls = raw.replace(URL_PATTERN, ' ').replace(/\s+/g, ' ').trim();
    const normalized = withoutUrls.replace(TAG_PATTERN, '').replace(/^[\s|/•*-]+|[\s|/•*-]+$/g, '').trim();
    const key = normalizedKey(normalized);
    const words = wordCount(normalized);
    const urlMatches = raw.match(URL_PATTERN) ?? [];
    const urlChars = urlMatches.reduce((sum, item) => sum + item.length, 0);
    if (!normalized || !key || seen.has(key) || words < 5) continue;
    if (urlChars > raw.length * 0.32) continue;
    if (BOILERPLATE.test(normalized) || /^(?:https?:\/\/|www\.)/i.test(normalized)) continue;
    seen.add(key);
    output.push({ text: trimSentence(normalized), index: output.length, wordCount: Math.min(words, MAX_SENTENCE_WORDS), originalWordCount: words });
  }
  return output;
}

function scoreSentence(sentence, title = '') {
  const text = sentence.text;
  let score = 1;
  if (BOILERPLATE_PHRASES.test(text)) score -= 5;
  if (/\b(?:announc|launch|release|introduc|find|show|report|study|research|measure|build|add|improv|enable|allow|support|publish|update|available)\w*/i.test(text)) score += 2;
  if (/\b(?:because|after|before|while|which|that|with|for)\b/i.test(text)) score += 0.6;
  if (/\b\d+(?:\.\d+)?%?\b/.test(text)) score += 0.7;
  if (/\b[A-Z][\w-]+(?:\s+[A-Z][\w-]+){0,2}\b/.test(text)) score += 0.5;
  if (TAG_PATTERN.test(text)) score -= 0.6;
  TAG_PATTERN.lastIndex = 0;
  if (URL_PATTERN.test(text)) score -= 2;
  URL_PATTERN.lastIndex = 0;
  if (normalizedKey(text) === normalizedKey(title)) score -= 1.5;
  if (sentence.originalWordCount > MAX_SENTENCE_WORDS) score -= 0.4;
  return score;
}

/** Rank without randomness; ties always resolve to source order. */
export function rankSentences(sentences, { title = '' } = {}) {
  return [...sentences]
    .map((sentence, position) => ({ ...sentence, score: scoreSentence(sentence, title), position }))
    .sort((a, b) => b.score - a.score || a.index - b.index || a.position - b.position);
}

function joinSentences(sentences) {
  return sentences.sort((a, b) => a.index - b.index).map((item) => item.text).join(' ').trim();
}

function bestCombination(ranked) {
  const candidates = ranked.slice(0, 10);
  let best = null;
  const visit = (start, chosen) => {
    if (chosen.length) {
      const words = chosen.reduce((sum, item) => sum + item.wordCount, 0);
      if (words <= MAX_WORDS) {
        const inRange = words >= MIN_WORDS;
        const score = chosen.reduce((sum, item) => sum + item.score, 0) + (inRange ? 12 : 0) - Math.abs(48 - words) / 20;
        if (!best || score > best.score || (score === best.score && words > best.words)) best = { chosen: [...chosen], score, words };
      }
    }
    if (chosen.length >= 4) return;
    for (let index = start; index < candidates.length; index += 1) visit(index + 1, [...chosen, candidates[index]]);
  };
  visit(0, []);
  return best;
}

/** Validate supportability and the requested target range without padding. */
export function validateSummaryQuality(summary, { sourceWordCount = 0, usedFallback = false } = {}) {
  const text = asText(summary).trim();
  const words = wordCount(text);
  const repeated = text && new Set(splitSentences(text).map(normalizedKey)).size !== splitSentences(text).length;
  const flags = [];
  if (words < MIN_WORDS) flags.push('below-target');
  if (words > MAX_WORDS) flags.push('above-target');
  if (sourceWordCount && words > sourceWordCount + 8) flags.push('unsupported-length');
  if (repeated) flags.push('duplicate-text');
  if (usedFallback) flags.push('fallback');
  let quality = 'high';
  if (!text || words < 12) quality = 'insufficient';
  else if (flags.length || words < MIN_WORDS) quality = 'limited';
  return { quality, words, flags };
}

/** Select a truthful fallback; this function never invents filler prose. */
export function selectFallback({ title = '', abstract = '', description = '', headline = '' } = {}) {
  const options = [
    ['abstract', abstract],
    ['description', description],
    ['headline', headline || title],
  ];
  for (const [source, value] of options) {
    const text = cleanHtmlContent(value);
    if (wordCount(text) >= 5 && !BOILERPLATE.test(text)) return { text: trimSentence(text, MAX_WORDS), source };
  }
  const last = cleanHtmlContent(headline || title || abstract || description);
  return { text: trimSentence(last, MAX_WORDS), source: last ? 'headline' : 'none' };
}

function sourceText(source, metadata, input) {
  const explicit = [input.content, input.text, input.bodyText, input.abstract, input.articleBody]
    .map(asText).find((value) => wordCount(value) >= 5);
  if (explicit) return { text: explicit, source: input.abstract ? 'abstract' : 'content' };
  if (metadata.articleBody) return { text: metadata.articleBody, source: 'json-ld' };
  if (metadata.abstract) return { text: metadata.abstract, source: 'abstract' };
  if (input.html || input.contentHtml || input.bodyHtml || input.rawHtml) {
    const visible = cleanHtmlContent(input.html ?? input.contentHtml ?? input.bodyHtml ?? input.rawHtml);
    if (wordCount(visible) >= 5) return { text: visible, source: 'html' };
  }
  if (metadata.description) return { text: metadata.description, source: metadata.source || 'description' };
  return { text: '', source: 'none' };
}

/** Main deterministic summarizer. Accepts a string or RSS/Atom-like record. */
export function summarize(input = {}) {
  const record = typeof input === 'string' ? { content: input } : (input ?? {});
  const metadata = extractMetadata(record);
  const title = cleanHtmlContent(record.title ?? record.headline ?? metadata.title);
  const { text, source } = sourceText(record, metadata, record);
  const candidates = extractSentences(text);
  const ranked = rankSentences(candidates, { title });
  const combination = bestCombination(ranked);
  const selected = combination?.chosen ?? [];
  let description = selected.length ? joinSentences(selected) : '';
  let summaryMethod = selected.length ? 'ranked-sentences' : 'fallback';
  let summaryContentSource = selected.length ? source : 'fallback';
  let fallback = false;
  if (!description || wordCount(description) < MIN_WORDS) {
    const choice = selectFallback({ title, headline: title, abstract: metadata.abstract, description: metadata.description || text });
    description = choice.text;
    summaryMethod = 'honest-fallback';
    summaryContentSource = choice.source;
    fallback = true;
  }
  const quality = validateSummaryQuality(description, {
    sourceWordCount: wordCount(text),
    usedFallback: fallback,
  });
  const summaryFlags = [...quality.flags];
  if (candidates.length !== splitSentences(cleanHtmlContent(text)).length) summaryFlags.push('deduplicated-or-filtered');
  if (source === 'json-ld' || source === 'open-graph' || source === 'abstract') summaryFlags.push('metadata-source');
  if (text && (text.match(URL_PATTERN) ?? []).length) summaryFlags.push('url-cleaned');
  if (!text && title) summaryFlags.push('headline-only');
  return {
    description,
    summaryMethod,
    summaryContentSource,
    summaryQuality: quality.quality,
    summaryFlags: [...new Set(summaryFlags)],
  };
}

export const summarizeStory = summarize;
export const summarizeContent = summarize;
export default summarize;
