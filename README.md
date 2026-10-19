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
  curated GitHub release APIs.
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
categories, deduplication, retry isolation, all-source failure preservation,
snapshot schema validation, atomic replacement, and recovery.

## Docker

```sh
docker build -t ai-foundry .
docker run --rm -p 8080:8080 ai-foundry
```

The image runs only the static publication server. Ingestion should run in the
scheduled workflow, not in a visitor request or an ephemeral web container.

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

The supplied `The Squeak Demo.ttf` is loaded locally for the AI Foundry
wordmark. The archive's included notice says it is demo/personal-use only and
requires a commercial license. The file is included to satisfy the supplied
reference during evaluation; obtain the appropriate license before commercial
deployment. Body copy uses a local/system monospaced typewriter stack.
