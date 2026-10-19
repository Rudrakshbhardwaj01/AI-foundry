const ENTITY_MAP = Object.freeze({
  amp: '&', apos: "'", gt: '>', lt: '<', quot: '"', nbsp: '\u00a0', ndash: '–', mdash: '—', hellip: '…',
});

function decodeEntities(value = '') {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][\w]+);/gi, (match, entity) => {
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

function cleanText(value = '') {
  return decodeEntities(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tagValue(block, tagNames) {
  for (const tag of tagNames) {
    const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}\\s*>`, 'i'));
    if (match) return cleanText(match[1]);
  }
  return '';
}

function rawTagValue(block, tagNames) {
  for (const tag of tagNames) {
    const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}\\s*>`, 'i'));
    if (match) return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim();
  }
  return '';
}

function attributeValue(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match ? decodeEntities(match[2].trim()) : '';
}

function blockItems(xml, tagName) {
  return [...xml.matchAll(new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?</${tagName}\\s*>`, 'gi'))].map((match) => match[0]);
}

function parseRss(xml) {
  return blockItems(xml, 'item').map((block) => {
    const enclosure = block.match(/<enclosure\b[^>]*>/i)?.[0];
    return {
      guid: tagValue(block, ['guid', 'id']),
      title: tagValue(block, ['title']),
      link: tagValue(block, ['link']) || (enclosure ? attributeValue(enclosure, 'url') : ''),
      summary: tagValue(block, ['content:encoded', 'description', 'summary']),
      content: rawTagValue(block, ['content:encoded', 'content']),
      publishedAt: tagValue(block, ['pubDate', 'published', 'updated', 'dc:date']),
      category: tagValue(block, ['category']),
    };
  });
}

function parseAtom(xml) {
  return blockItems(xml, 'entry').map((block) => {
    const linkTag = block.match(/<link\b[^>]*>/i)?.[0] ?? '';
    return {
      guid: tagValue(block, ['id', 'guid']),
      title: tagValue(block, ['title']),
      link: attributeValue(linkTag, 'href') || tagValue(block, ['link']),
      summary: tagValue(block, ['content', 'summary', 'description']),
      content: rawTagValue(block, ['content', 'summary']),
      publishedAt: tagValue(block, ['published', 'updated', 'pubDate']),
      category: attributeValue(block.match(/<category\b[^>]*>/i)?.[0] ?? '', 'term') || tagValue(block, ['category']),
    };
  });
}

/** Parse RSS 2.0, RSS 1.x item blocks, and Atom entry blocks without a dependency. */
export function parseFeed(xml) {
  if (typeof xml !== 'string' || !xml.trim()) throw new Error('Feed body is empty');
  if (/<item\b/i.test(xml) && !/<\/item\s*>/i.test(xml)) throw new Error('Feed contains malformed RSS item markup');
  if (/<entry\b/i.test(xml) && !/<\/entry\s*>/i.test(xml)) throw new Error('Feed contains malformed Atom entry markup');
  const hasRssItems = /<item\b/i.test(xml);
  const hasAtomEntries = /<entry\b/i.test(xml);
  if (!hasRssItems && !hasAtomEntries) throw new Error('Feed contains no RSS items or Atom entries');
  return (hasRssItems ? parseRss(xml) : parseAtom(xml)).filter((item) => item.title || item.link);
}

export { cleanText, decodeEntities };
