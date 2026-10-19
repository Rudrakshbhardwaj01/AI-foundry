# AI Foundry

AI Foundry is a single-page, text-first publication of source-linked AI
developments. It uses no AI service, database, browser-time feed fetching, or
fictional seed stories. The browser reads one validated JSON snapshot and
filters it locally.

## Architecture

- `index.html`, `styles.css`, and `app.js` are the public page.
- `data/published.json` is the versioned published snapshot. It is written by
  the ingestion worker, not by visitor requests.
- `ingest/registry.mjs` is the curated 20-source registry.
- `ingest/adapters.mjs` supports RSS/Atom, the documented Hacker News API, and
  curated GitHub release APIs. Weak same-host feed items receive bounded,
  ingestion-time page enrichment; arbitrary linked domains are never crawled.
- `ingest/extract.mjs` separates bounded source-page extraction from network
  access and labels JSON-LD, Open Graph, metadata, and article-body content.
- `ingest/summarize.mjs` cleans source content and performs deterministic,
  extractive sentence ranking with summary provenance, quality flags, and an
  honest fallback when the publisher does not expose enough text.
- `ingest/run.mjs` fetches sources independently, applies bounded retries and
  conservative deterministic relevance/category rules, merges retained content,
  deduplicates, validates, and atomically publishes.
- `data/previous.json`, `data/source-status.json`, and `data/run-status.json`
  provide recovery and observability without a database.
- `.github/workflows/refresh.yml` runs every 30 minutes, commits a successful
  generated snapshot, and deploys the complete static page to GitHub Pages.
- `server.mjs` is a dependency-free local static server.

If every enabled source fails, the worker updates failure status files but does
not replace `data/published.json`; the last known-good edition remains public.

## Requirements

- Node.js `20.11.1` (see `.nvmrc`)
- npm 10+

No runtime package dependencies are required. `package-lock.json` is retained
for reproducible `npm ci` and Docker builds.

## Local setup and run

```sh
npm ci
npm run build
npm run dev
```

The development server prints its URL when it starts. Open
<http://localhost:8080> by default. `npm run dev` invokes the existing
dependency-free `server.mjs` directly and works from the project root in
Linux, macOS, and Windows PowerShell.

To use another port, set `PORT` before starting the server:

```sh
# Linux/macOS
PORT=3000 npm run dev
```

```powershell
# Windows PowerShell
$env:PORT = "3000"
npm run dev
```

`npm start` remains available as the equivalent server start command.

The header includes a `Dark theme` / `Light theme` control. It follows the
operating system preference on first visit, persists an explicit choice in
`localStorage`, and changes only the theme—not the current category, articles,
or scroll position.

To run a real refresh locally:

```sh
npm run ingest
```

The command may produce no new stories when publishers are unavailable. It
never invents content.

## Checks

The single offline test command is:

```sh
make test
```

It runs fixture-backed Node tests and does not require news websites. The full
local check is:

```sh
make lint
make build
make test
```

The tests cover RSS/Atom parsing, entity cleanup, URL safety, deterministic
categories, deduplication, retry isolation, approved page enrichment,
HTML/JSON-LD/Open Graph extraction, deterministic sentence ranking, release
note cleanup, URL-heavy descriptions, fallback quality checks, all-source
failure preservation, snapshot schema validation, atomic replacement, and
recovery.

## Docker

```sh
docker build -t ai-foundry .
docker run --rm -p 8080:8080 ai-foundry
```

The image runs only the static publication server. Ingestion should run in the
scheduled workflow, not in a visitor request or an ephemeral web container.

## Vercel deployment

`vercel.json` explicitly selects Vercel's **Other** framework preset, disables
the build command, and serves the repository root as static output. This keeps
`index.html`, `app.js`, `styles.css`, `data/published.json`, and
`public/fonts/ChineseKaraoke.ttf` out of the Functions runtime. `server.mjs`
remains a local/Docker server and is not a Vercel entry point.

When the repository is connected to Vercel, pushes to the configured branch
trigger static redeployments. The scheduled GitHub Actions workflow remains
responsible for refreshing and committing publication JSON; Vercel only serves
the committed snapshot. Set the Vercel project Framework Preset to **Other**
if project-level settings override the repository configuration, then trigger
a new deployment.

## Deployment and scheduled updates

The included workflow is designed for a GitHub repository with GitHub Pages
configured to use GitHub Actions:

1. Push the repository to GitHub and set Pages → Build and deployment → GitHub Actions.
2. Keep the default branch as `main`, or update the workflow branch filter.
3. The workflow runs on a 30-minute schedule and also supports **Run workflow**.
4. It runs `npm ci`, `npm run ingest`, validates the snapshot, commits changed
   JSON artifacts with minimal `contents: write` permission, and deploys the
   complete static site with Pages.

GitHub's scheduler can delay scheduled jobs. The repository commit and Pages
deployment are the verifiable publication receipts; this local workspace has
not authenticated to or verified a remote GitHub deployment.

## Source coverage

See [`docs/sources.md`](docs/sources.md) for all 20 required sources, actual
configured endpoints, adapters, validation states, and additional candidate
review. Sources marked unavailable remain in the registry and are never
silently replaced with guessed URLs.

## Font and licensing note

The supplied `ChineseKaraoke.ttf` is loaded locally for the AI Foundry
wordmark. The `chinese_karaoke.zip` archive contains regular and bold TTF
files but no license or usage documentation. The font metadata identifies
copyright by Vladimir Nikolic and says “All rights reserved”; embedding
permission for a public or commercial website is therefore unconfirmed.
Obtain written permission or a suitable license before public commercial
deployment. Body copy uses a local/system monospaced typewriter stack.
