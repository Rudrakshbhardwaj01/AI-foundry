# Source registry and validation

`ingest/registry.mjs` is the authoritative source registry. The worker never
crawls URLs discovered in article text. `integrated-and-tested` means the
adapter is covered by local fixtures; `configured-awaiting-live-validation`
means a legitimate publisher endpoint is recorded but could not be verified
from this build environment; `unavailable` means the source remains catalogued
but no reliable public feed/API was confirmed.

| Required source | Access method | Endpoint or API | Runtime status |
| --- | --- | --- | --- |
| OpenAI News | RSS | `https://openai.com/news/rss.xml` | Configured, awaiting live validation |
| Google DeepMind | RSS | `https://deepmind.google/blog/rss.xml` | Configured, awaiting live validation |
| Anthropic | None confirmed | Official news/research pages retained | Unavailable |
| Reuters Technology | None confirmed | Official technology section retained | Unavailable |
| arXiv | RSS | `rss.arxiv.org/rss/{cs.AI,cs.LG,cs.CL,cs.CV,stat.ML}` | Integrated and tested |
| Hugging Face | RSS | `https://huggingface.co/blog/feed.xml` | Configured, awaiting live validation |
| MIT Technology Review | RSS candidate | Publisher feed is broad, not AI-specific | Configured, awaiting live validation |
| Simon Willison | Atom | `https://simonwillison.net/atom/everything/` | Configured, awaiting live validation |
| Import AI | RSS | `https://importai.substack.com/feed` | Configured, awaiting live validation |
| Artificial Analysis | None confirmed | Official site retained | Unavailable |
| Stanford HAI | None confirmed | Official site retained | Configured, awaiting live validation |
| Hacker News | Public API | `https://hacker-news.firebaseio.com/v0/` | Integrated and tested |
| The Batch | None confirmed | Official publication retained | Configured, awaiting live validation |
| Latent Space | None confirmed | Official publication retained | Configured, awaiting live validation |
| Epoch AI | None confirmed | Official site retained | Unavailable |
| UK AI Security Institute | None confirmed | Official blog retained | Configured, awaiting live validation |
| GitHub | REST release API | `api.github.com/repos/` for curated vLLM and llama.cpp | Integrated and tested |
| SemiAnalysis | None confirmed | Official site retained | Unavailable |
| OECD.AI | None confirmed | Official site retained | Configured, awaiting live validation |
| IndiaAI | None confirmed | Official portal retained | Configured, awaiting live validation |

## Additional-source review

The proposed additional candidates (Google Research, Meta AI, Microsoft
Research, NVIDIA Research/Developer, Mistral, DeepSeek, Qwen, Ars Technica,
TechCrunch AI, The Decoder, IEEE Spectrum, Semantic Scholar, OpenAlex,
OpenReview, MLCommons, METR, HELM, AWS ML, Cloudflare, Vercel, NIST AI,
European Commission AI Office, and Stanford Center for AI Safety) were reviewed
against credibility, originality, overlap, public access, attribution, and
terms. None is enabled until a source-specific public feed/API and relevance
filter are confirmed. They remain candidate-only rather than being presented
as operational coverage.

## Offline verification

```sh
npm test
```

The tests inject local fixture sources so they never depend on publisher
availability. A production run is `npm run ingest`; it writes a complete
validated snapshot to `data/published.json` only when at least one enabled
source succeeds.
