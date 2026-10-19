const DEFAULT_MAX_HTML_BYTES = 2_000_000;

const ENTITY_MAP = Object.freeze({
  amp: '&', apos: "'", gt: '>', lt: '<', quot: '"', nbsp: '\u00a0',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
});

const BLOCK_TAGS = new Set([
  'address', 'article', 'blockquote', 'div', 'dl', 'dt', 'dd', 'fieldset', 'figcaption',
  'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'li', 'main', 'ol', 'p', 'pre',
  'section', 'table', 'td', 'th', 'tr', 'ul',
]);

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const ALWAYS_REMOVE_TAGS = new Set(['aside', 'canvas', 'embed', 'footer', 'form', 'iframe', 'nav', 'noscript', 'object', 'script', 'style', 'template']);
const BOILERPLATE_WORDS = /\b(?:advert(?:isement)?s?|banner|breadcrumb|comment(?:s|ary)?|consent|cookie(?:s)?|login|modal|newsletter|overlay|paywall|privacy|recommendations?|related|share(?:-tools)?|sign[\s_-]?in|social|subscribe(?:d|r|tion)?|toolbar)\b/i;

function decodeHtmlEntities(value = '') {
  return String(value).replace(/&(#x[\da-f]+|#\d+|[a-z][\w]+);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) {
      const codePoint = Number.parseInt(lower.slice(2), 16);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    }
    if (lower.startsWith('#')) {
      const codePoint = Number.parseInt(lower.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    }
    return ENTITY_MAP[lower] ?? match;
  });
}

function attributes(tag) {
  const result = new Map();
  const body = tag.replace(/^<\/?[^\s>]+/i, '').replace(/\/?>\s*$/s, '');
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of body.matchAll(pattern)) {
    result.set(match[1].toLowerCase(), decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return result;
}

function attribute(tag, name) {
  return attributes(tag).get(name.toLowerCase()) ?? '';
}

function cleanInlineText(value) {
  return decodeHtmlEntities(String(value ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldRemoveTag(tagName, tag) {
  if (ALWAYS_REMOVE_TAGS.has(tagName)) return true;
  if (tagName === 'header' && /\b(?:banner|navigation)\b/i.test(attribute(tag, 'role'))) return true;
  const identifyingText = [
    attribute(tag, 'id'),
    attribute(tag, 'class'),
    attribute(tag, 'role'),
    attribute(tag, 'aria-label'),
    attribute(tag, 'data-testid'),
    attribute(tag, 'data-component'),
  ].join(' ');
  return Boolean(identifyingText && BOILERPLATE_WORDS.test(identifyingText));
}

/** Remove executable, navigational, and common consent/boilerplate subtrees from HTML. */
export function cleanArticleText(fragment) {
  if (typeof fragment !== 'string') return '';
  const output = [];
  const stack = [];
  let cursor = 0;
  const tokenPattern = /<!--[\s\S]*?-->|<[^>]*>/g;

  const appendText = (value) => {
    if (!stack.some((entry) => entry.removed)) output.push(value);
  };

  for (const match of fragment.matchAll(tokenPattern)) {
    appendText(fragment.slice(cursor, match.index));
    const token = match[0];
    cursor = match.index + token.length;
    if (token.startsWith('<!--')) continue;

    const closing = /^<\s*\/\s*([a-z][\w:-]*)/i.exec(token);
    if (closing) {
      const index = [...stack].reverse().findIndex((entry) => entry.name === closing[1].toLowerCase());
      if (index >= 0) stack.splice(stack.length - 1 - index);
      continue;
    }

    const opening = /^<\s*([a-z][\w:-]*)/i.exec(token);
    if (!opening) continue;
    const tagName = opening[1].toLowerCase();
    const removed = stack.some((entry) => entry.removed) || shouldRemoveTag(tagName, token);
    if (!removed && (BLOCK_TAGS.has(tagName) || tagName === 'br')) output.push('\n');
    if (!VOID_TAGS.has(tagName) && !token.endsWith('/>')) stack.push({ name: tagName, removed });
  }
  appendText(fragment.slice(cursor));

  return decodeHtmlEntities(output.join(''))
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n+ */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function elementBlocks(html, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}\\s*>`, 'gi');
  return [...html.matchAll(pattern)].map((match) => match[0]);
}

function jsonLdNodes(value) {
  if (Array.isArray(value)) return value.flatMap(jsonLdNodes);
  if (!value || typeof value !== 'object') return [];
  const graph = Array.isArray(value['@graph']) ? value['@graph'].flatMap(jsonLdNodes) : [];
  return graph.length ? graph : [value];
}

function isArticleSchema(value) {
  const types = Array.isArray(value?.['@type']) ? value['@type'] : [value?.['@type']];
  return types.some((type) => {
    const name = String(type ?? '').toLowerCase().split(/[\/#]/).pop();
    return name === 'article' || name === 'newsarticle';
  });
}

function jsonValueText(value) {
  if (typeof value === 'string') return cleanInlineText(value);
  if (Array.isArray(value)) return value.map(jsonValueText).filter(Boolean).join(' ');
  if (value && typeof value === 'object' && '@value' in value) return jsonValueText(value['@value']);
  return '';
}

function addCandidate(candidates, seen, text, provenance, contentType) {
  const cleaned = contentType === 'article'
    ? String(text ?? '').replace(/\u00a0/g, ' ').split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')
    : cleanInlineText(text);
  if (!cleaned) return;
  const key = cleaned.toLocaleLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push({ text: cleaned, provenance, contentType });
}

function parseJsonLd(html, candidates, seen) {
  const scripts = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
  for (const match of html.matchAll(scripts)) {
    const tag = match[0].match(/^<script\b[^>]*>/i)?.[0] ?? '';
    if (!/application\/ld\+json/i.test(attribute(tag, 'type'))) continue;
    const body = match[0].replace(/^<script\b[^>]*>/i, '').replace(/<\/script\s*>$/i, '');
    let parsed;
    try { parsed = JSON.parse(body.trim()); } catch {
      try { parsed = JSON.parse(decodeHtmlEntities(body.trim())); } catch { continue; }
    }
    for (const node of jsonLdNodes(parsed)) {
      if (!isArticleSchema(node)) continue;
      for (const field of ['abstract', 'description']) {
        const value = jsonValueText(node[field]);
        if (value) addCandidate(candidates, seen, value, `json-ld:${field}`, 'abstract');
      }
    }
  }
}

function parseMetaDescriptions(html, candidates, seen) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const property = attribute(tag, 'property').toLowerCase();
    const name = attribute(tag, 'name').toLowerCase();
    if (property === 'og:description') addCandidate(candidates, seen, attribute(tag, 'content'), 'open-graph:description', 'abstract');
    if (name === 'description') addCandidate(candidates, seen, attribute(tag, 'content'), 'meta:description', 'abstract');
  }
}

function parseArticleText(html, candidates, seen) {
  const articleText = elementBlocks(html, 'article').map(cleanArticleText).sort((a, b) => b.length - a.length)[0] ?? '';
  const mainText = elementBlocks(html, 'main').map(cleanArticleText).sort((a, b) => b.length - a.length)[0] ?? '';
  if (articleText) addCandidate(candidates, seen, articleText, 'html:article', 'article');
  else if (mainText) addCandidate(candidates, seen, mainText, 'html:main', 'article');
}

function checkedInput(input, html, options) {
  let url = input;
  let body = html;
  let settings = options ?? {};
  if (input && typeof input === 'object') {
    url = input.url;
    body = input.html;
    settings = { ...input, ...settings };
  }
  if (typeof url !== 'string' || !url.trim()) throw new TypeError('An approved article URL is required');
  let parsedUrl;
  try { parsedUrl = new URL(url); } catch { throw new TypeError('Article URL is invalid'); }
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) throw new TypeError('Article URL must use HTTP(S)');
  if (typeof body !== 'string') throw new TypeError('Fetched HTML must be a string');
  const maxBytes = settings.maxBytes ?? settings.maxHtmlBytes ?? DEFAULT_MAX_HTML_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new TypeError('HTML byte limit must be a positive safe integer');
  const byteLength = Buffer.byteLength(body, 'utf8');
  if (byteLength > maxBytes) throw new RangeError(`Fetched HTML exceeds the ${maxBytes} byte limit`);
  return { url: parsedUrl.toString(), html: body };
}

/**
 * Extract bounded, provenance-labelled content from already-fetched HTML.
 * This helper deliberately performs no network access; the caller owns fetching
 * and access approval for the supplied article URL.
 */
export function extractSourcePage(input, html, options = {}) {
  const { url, html: body } = checkedInput(input, html, options);
  const candidates = [];
  const seen = new Set();
  parseJsonLd(body, candidates, seen);
  parseMetaDescriptions(body, candidates, seen);
  parseArticleText(body, candidates, seen);
  return { url, candidates };
}

/** Return only the ordered candidates for callers that do not need the URL echo. */
export function extractArticleCandidates(input, html, options = {}) {
  return extractSourcePage(input, html, options).candidates;
}

export { DEFAULT_MAX_HTML_BYTES, decodeHtmlEntities };
