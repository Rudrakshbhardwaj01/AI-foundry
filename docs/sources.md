# Source registry

The ingestion registry is the authoritative catalog in `ingest/registry.mjs`.
It contains 20 sources. `enabled` means the source has a configured RSS/Atom
endpoint and can be fetched by `ingest/run.mjs`; `unavailable` means the source
is intentionally cataloged without a guessed endpoint. An unavailable source
is reported in `source-status.json` and contributes no stories.

| Source | Status | Access | Endpoint / reason |
| --- | --- | --- | --- |
| BBC News | enabled | RSS | `https://feeds.bbci.co.uk/news/rss.xml` |
| NPR News | enabled | RSS | `https://feeds.npr.org/1001/rss.xml` |
| The Guardian World | enabled | RSS | `https://www.theguardian.com/world/rss` |
| Al Jazeera | enabled | RSS | `https://www.aljazeera.com/xml/rss/all.xml` |
| CNN World | enabled | RSS | `http://rss.cnn.com/rss/edition_world.rss` |
| The New York Times | enabled | RSS | `https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml` |
| TechCrunch | enabled | RSS | `https://techcrunch.com/feed/` |
| The Verge | enabled | RSS | `https://www.theverge.com/rss/index.xml` |
| Ars Technica | enabled | RSS | `https://feeds.arstechnica.com/arstechnica/index` |
| Wired | enabled | RSS | `https://www.wired.com/feed/rss` |
| Nature | enabled | RSS | `https://www.nature.com/nature.rss` |
| NASA News | unavailable | unavailable | No current official endpoint configured |
| Associated Press | unavailable | unavailable | No public endpoint configured |
| Reuters | unavailable | unavailable | No public endpoint configured |
| The Washington Post | unavailable | unavailable | No public endpoint configured |
| CBS News | unavailable | unavailable | No public endpoint configured |
| NBC News | unavailable | unavailable | No public endpoint configured |
| ABC News | unavailable | unavailable | No public endpoint configured |
| Financial Times | unavailable | unavailable | No public endpoint configured |
| The Economist | unavailable | unavailable | No public endpoint configured |

Run against local fixtures (offline):

```sh
node ingest/run.mjs --fixture-dir tests/ingestion/fixtures --output data/seed --source bbc-news
```

The CLI expects a fixture named `<source-id>.xml`. A real run omits
`--fixture-dir`; requests use bounded retries and timeouts. Published stories
are sourced only from successfully parsed responses; no seed stories are
included in the repository.
