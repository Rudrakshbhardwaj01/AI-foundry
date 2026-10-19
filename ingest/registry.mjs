/**
 * The source catalog is deliberately data-only.  A source without a reliably
 * maintained public feed is represented without a guessed URL so that a run
 * cannot silently publish fabricated or stale data.
 */
export const SOURCE_REGISTRY = Object.freeze([
  { id: 'bbc-news', name: 'BBC News', status: 'enabled', accessMethod: 'rss', endpoint: 'https://feeds.bbci.co.uk/news/rss.xml', defaultCategory: 'world' },
  { id: 'npr-news', name: 'NPR News', status: 'enabled', accessMethod: 'rss', endpoint: 'https://feeds.npr.org/1001/rss.xml', defaultCategory: 'world' },
  { id: 'guardian-world', name: 'The Guardian World', status: 'enabled', accessMethod: 'rss', endpoint: 'https://www.theguardian.com/world/rss', defaultCategory: 'world' },
  { id: 'al-jazeera', name: 'Al Jazeera', status: 'enabled', accessMethod: 'rss', endpoint: 'https://www.aljazeera.com/xml/rss/all.xml', defaultCategory: 'world' },
  { id: 'cnn-world', name: 'CNN World', status: 'enabled', accessMethod: 'rss', endpoint: 'http://rss.cnn.com/rss/edition_world.rss', defaultCategory: 'world' },
  { id: 'new-york-times', name: 'The New York Times', status: 'enabled', accessMethod: 'rss', endpoint: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', defaultCategory: 'world' },
  { id: 'techcrunch', name: 'TechCrunch', status: 'enabled', accessMethod: 'rss', endpoint: 'https://techcrunch.com/feed/', defaultCategory: 'technology' },
  { id: 'the-verge', name: 'The Verge', status: 'enabled', accessMethod: 'rss', endpoint: 'https://www.theverge.com/rss/index.xml', defaultCategory: 'technology' },
  { id: 'ars-technica', name: 'Ars Technica', status: 'enabled', accessMethod: 'rss', endpoint: 'https://feeds.arstechnica.com/arstechnica/index', defaultCategory: 'technology' },
  { id: 'wired', name: 'Wired', status: 'enabled', accessMethod: 'rss', endpoint: 'https://www.wired.com/feed/rss', defaultCategory: 'technology' },
  { id: 'nature', name: 'Nature', status: 'enabled', accessMethod: 'rss', endpoint: 'https://www.nature.com/nature.rss', defaultCategory: 'science' },
  { id: 'nasa', name: 'NASA News', status: 'unavailable', accessMethod: 'unavailable', defaultCategory: 'science', note: 'No endpoint is configured until a current official feed is verified.' },
  { id: 'associated-press', name: 'Associated Press', status: 'unavailable', accessMethod: 'unavailable', defaultCategory: 'world', note: 'No public endpoint is configured.' },
  { id: 'reuters', name: 'Reuters', status: 'unavailable', accessMethod: 'unavailable', defaultCategory: 'world', note: 'No public endpoint is configured.' },
  { id: 'washington-post', name: 'The Washington Post', status: 'unavailable', accessMethod: 'unavailable', defaultCategory: 'world', note: 'No public endpoint is configured.' },
  { id: 'cbs-news', name: 'CBS News', status: 'unavailable', accessMethod: 'unavailable', defaultCategory: 'world', note: 'No public endpoint is configured.' },
  { id: 'nbc-news', name: 'NBC News', status: 'unavailable', accessMethod: 'unavailable', defaultCategory: 'world', note: 'No public endpoint is configured.' },
  { id: 'abc-news', name: 'ABC News', status: 'unavailable', accessMethod: 'unavailable', defaultCategory: 'world', note: 'No public endpoint is configured.' },
  { id: 'financial-times', name: 'Financial Times', status: 'unavailable', accessMethod: 'unavailable', defaultCategory: 'business', note: 'No public endpoint is configured.' },
  { id: 'the-economist', name: 'The Economist', status: 'unavailable', accessMethod: 'unavailable', defaultCategory: 'business', note: 'No public endpoint is configured.' },
]);

export function getSourceById(id, registry = SOURCE_REGISTRY) {
  return registry.find((source) => source.id === id);
}
