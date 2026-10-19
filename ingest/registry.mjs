/**
 * Curated, human-reviewed source registry.
 *
 * A source is only enabled when its public access method is known well enough
 * for the worker to fetch it without guessing URLs or crawling arbitrary
 * domains. The registry intentionally retains unavailable candidates so the
 * publication's coverage decisions remain inspectable.
 */
export const SOURCE_REGISTRY = Object.freeze([
  {
    id: 'openai-news', name: 'OpenAI News', canonicalUrl: 'https://openai.com/news/',
    feedUrl: 'https://openai.com/news/rss.xml', accessMethod: 'rss', sourceType: 'Official announcement',
    categories: ['Model Releases', 'Research', 'Tools', 'Safety', 'Policy'], priority: 'critical',
    pollIntervalMinutes: 30, timeoutMs: 12000, enabled: true, status: 'configured-awaiting-live-validation',
    notes: 'Official RSS endpoint is configured; live availability must be confirmed by the deployment runner.',
  },
  {
    id: 'google-deepmind', name: 'Google DeepMind', canonicalUrl: 'https://deepmind.google/blog/',
    feedUrl: 'https://deepmind.google/blog/rss.xml', accessMethod: 'rss', sourceType: 'Blog post',
    categories: ['Model Releases', 'Research', 'Safety'], priority: 'critical',
    pollIntervalMinutes: 30, timeoutMs: 12000, enabled: true, status: 'configured-awaiting-live-validation',
    notes: 'Official blog RSS endpoint is configured; availability varies by publisher changes.',
  },
  {
    id: 'anthropic', name: 'Anthropic', canonicalUrl: 'https://www.anthropic.com/news',
    feedUrl: null, accessMethod: 'unavailable', sourceType: 'Official announcement',
    categories: ['Model Releases', 'Research', 'Tools', 'Safety'], priority: 'critical',
    pollIntervalMinutes: 60, timeoutMs: 12000, enabled: false, status: 'unavailable',
    notes: 'No reliable public feed or documented public API was confirmed; no scraper is enabled.',
  },
  {
    id: 'reuters-technology', name: 'Reuters Technology', canonicalUrl: 'https://www.reuters.com/technology/',
    feedUrl: null, accessMethod: 'unavailable', sourceType: 'Independent reporting',
    categories: ['Industry', 'Policy', 'Infrastructure'], priority: 'critical',
    pollIntervalMinutes: 60, timeoutMs: 12000, enabled: false, status: 'unavailable',
    notes: 'No permitted, stable public feed/API for this section was confirmed.',
  },
  {
    id: 'arxiv', name: 'arXiv', canonicalUrl: 'https://arxiv.org/',
    feedUrls: ['https://rss.arxiv.org/rss/cs.AI', 'https://rss.arxiv.org/rss/cs.LG', 'https://rss.arxiv.org/rss/cs.CL', 'https://rss.arxiv.org/rss/cs.CV', 'https://rss.arxiv.org/rss/stat.ML'],
    accessMethod: 'rss', sourceType: 'Research paper', categories: ['Research', 'Safety'], priority: 'critical',
    pollIntervalMinutes: 30, timeoutMs: 12000, enabled: true, status: 'integrated-and-tested',
    notes: 'Official category feeds; preprints remain labelled as research papers.',
  },
  {
    id: 'hugging-face', name: 'Hugging Face', canonicalUrl: 'https://huggingface.co/blog',
    feedUrl: 'https://huggingface.co/blog/feed.xml', accessMethod: 'rss', sourceType: 'Blog post',
    categories: ['Open Source', 'Model Releases', 'Tools'], priority: 'critical',
    pollIntervalMinutes: 30, timeoutMs: 12000, enabled: true, status: 'configured-awaiting-live-validation',
    notes: 'Official blog feed; model catalogue uploads are intentionally not crawled.',
  },
  {
    id: 'mit-technology-review', name: 'MIT Technology Review', canonicalUrl: 'https://www.technologyreview.com/topic/artificial-intelligence/',
    feedUrl: 'https://www.technologyreview.com/feed/', accessMethod: 'rss', sourceType: 'Independent reporting',
    categories: ['Industry', 'Research', 'Policy', 'Safety'], priority: 'high', relevanceFilter: true,
    pollIntervalMinutes: 60, timeoutMs: 12000, enabled: false, status: 'configured-awaiting-live-validation',
    notes: 'Publisher feed is broad rather than AI-section specific and is disabled until live scope is validated.',
  },
  {
    id: 'simon-willison', name: 'Simon Willison', canonicalUrl: 'https://simonwillison.net/',
    feedUrl: 'https://simonwillison.net/atom/everything/', accessMethod: 'atom', sourceType: 'Technical commentary',
    categories: ['Tools', 'Open Source', 'Model Releases'], priority: 'high', relevanceFilter: true,
    pollIntervalMinutes: 60, timeoutMs: 12000, enabled: true, status: 'configured-awaiting-live-validation',
    notes: 'Official Atom feed; deterministic AI relevance rules filter the general site feed.',
  },
  {
    id: 'import-ai', name: 'Import AI', canonicalUrl: 'https://importai.substack.com/',
    feedUrl: 'https://importai.substack.com/feed', accessMethod: 'rss', sourceType: 'Newsletter',
    categories: ['Research', 'Industry', 'Policy'], priority: 'high',
    pollIntervalMinutes: 120, timeoutMs: 12000, enabled: true, status: 'configured-awaiting-live-validation',
    notes: 'Public Substack feed metadata only; full newsletter text is never republished.',
  },
  {
    id: 'artificial-analysis', name: 'Artificial Analysis', canonicalUrl: 'https://artificialanalysis.ai/',
    feedUrl: null, accessMethod: 'unavailable', sourceType: 'Evaluation data',
    categories: ['Model Releases', 'Infrastructure'], priority: 'high',
    pollIntervalMinutes: 120, timeoutMs: 12000, enabled: false, status: 'unavailable',
    notes: 'No stable public feed/API was confirmed; benchmark pages are not scraped.',
  },
  {
    id: 'stanford-hai', name: 'Stanford HAI', canonicalUrl: 'https://hai.stanford.edu/',
    feedUrl: null, accessMethod: 'unavailable', sourceType: 'Research institute',
    categories: ['Research', 'Policy', 'Industry'], priority: 'high',
    pollIntervalMinutes: 120, timeoutMs: 12000, enabled: false, status: 'configured-awaiting-live-validation',
    notes: 'Official publication feed needs live validation before enabling.',
  },
  {
    id: 'hacker-news', name: 'Hacker News', canonicalUrl: 'https://news.ycombinator.com/',
    apiUrl: 'https://hacker-news.firebaseio.com/v0/', accessMethod: 'hacker-news-api', sourceType: 'Community discovery signal',
    categories: ['Tools', 'Open Source', 'Infrastructure'], priority: 'medium-high',
    pollIntervalMinutes: 30, timeoutMs: 10000, enabled: true, status: 'integrated-and-tested', relevanceFilter: true,
    notes: 'API is used only as a discovery signal; stories must pass conservative AI relevance rules.',
  },
  {
    id: 'the-batch', name: 'The Batch', canonicalUrl: 'https://www.deeplearning.ai/the-batch/',
    feedUrl: null, accessMethod: 'unavailable', sourceType: 'Curated publication',
    categories: ['Research', 'Industry'], priority: 'high',
    pollIntervalMinutes: 120, timeoutMs: 12000, enabled: false, status: 'configured-awaiting-live-validation',
    notes: 'No current official feed was confirmed; newsletter content is not copied.',
  },
  {
    id: 'latent-space', name: 'Latent Space', canonicalUrl: 'https://www.latent.space/',
    feedUrl: null, accessMethod: 'unavailable', sourceType: 'Technical publication',
    categories: ['Tools', 'Infrastructure', 'Industry'], priority: 'high',
    pollIntervalMinutes: 120, timeoutMs: 12000, enabled: false, status: 'configured-awaiting-live-validation',
    notes: 'Publisher metadata endpoint needs live validation before enabling.',
  },
  {
    id: 'epoch-ai', name: 'Epoch AI', canonicalUrl: 'https://epoch.ai/',
    feedUrl: null, accessMethod: 'unavailable', sourceType: 'Research organization',
    categories: ['Research', 'Infrastructure'], priority: 'high',
    pollIntervalMinutes: 240, timeoutMs: 12000, enabled: false, status: 'unavailable',
    notes: 'No stable public feed/API was confirmed.',
  },
  {
    id: 'uk-aisi', name: 'UK AI Security Institute', canonicalUrl: 'https://www.aisi.gov.uk/',
    feedUrl: null, accessMethod: 'unavailable', sourceType: 'Government research',
    categories: ['Safety', 'Policy', 'Research'], priority: 'high',
    pollIntervalMinutes: 120, timeoutMs: 12000, enabled: false, status: 'configured-awaiting-live-validation',
    notes: 'Official blog is retained in the registry; a stable feed/API still needs validation.',
  },
  {
    id: 'github', name: 'GitHub', canonicalUrl: 'https://github.com/',
    apiUrl: 'https://api.github.com/repos/', accessMethod: 'github-releases', sourceType: 'Release notes',
    categories: ['Open Source', 'Tools', 'Infrastructure'], priority: 'high',
    pollIntervalMinutes: 60, timeoutMs: 10000, enabled: true, status: 'integrated-and-tested', relevanceFilter: true,
    repositories: ['vllm-project/vllm', 'ggml-org/llama.cpp'],
    notes: 'Curated release endpoints only; commits, stars, and arbitrary repositories are not ingested.',
  },
  {
    id: 'semianalysis', name: 'SemiAnalysis', canonicalUrl: 'https://semianalysis.com/',
    feedUrl: null, accessMethod: 'unavailable', sourceType: 'Independent analysis',
    categories: ['Infrastructure', 'Industry'], priority: 'high',
    pollIntervalMinutes: 240, timeoutMs: 12000, enabled: false, status: 'unavailable',
    notes: 'No stable permitted public feed/API was confirmed.',
  },
  {
    id: 'oecd-ai', name: 'OECD.AI', canonicalUrl: 'https://oecd.ai/',
    feedUrl: null, accessMethod: 'unavailable', sourceType: 'Policy research',
    categories: ['Policy', 'Safety'], priority: 'high',
    pollIntervalMinutes: 240, timeoutMs: 12000, enabled: false, status: 'configured-awaiting-live-validation',
    notes: 'Official policy metadata endpoint needs live validation.',
  },
  {
    id: 'indiaai', name: 'IndiaAI', canonicalUrl: 'https://indiaai.gov.in/',
    feedUrl: null, accessMethod: 'unavailable', sourceType: 'Government portal',
    categories: ['Policy', 'Infrastructure', 'Research'], priority: 'high',
    pollIntervalMinutes: 120, timeoutMs: 12000, enabled: false, status: 'configured-awaiting-live-validation',
    notes: 'Government portal is retained; no reliable feed/API was confirmed in this environment.',
  },
]);

export function getSourceById(id, registry = SOURCE_REGISTRY) {
  return registry.find((source) => source.id === id);
}
