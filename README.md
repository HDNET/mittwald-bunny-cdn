# mittwald BunnyCDN Extension

[![CI](https://github.com/HDNET/mittwald-bunny-cdn/actions/workflows/ci.yml/badge.svg)](https://github.com/HDNET/mittwald-bunny-cdn/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](.nvmrc)

> Developed by [HDNET GmbH & Co. KG](https://www.hdnet.de)

## Table of Contents

1. [About](#about)
1. [Software Requirements](#software-requirements)
1. [Setup](#setup)
1. [Testing](#testing)
1. [Architecture](#architecture)
1. [License](#license)

## About

mittwald mStudio extension that integrates BunnyCDN as a CDN provider for TYPO3 projects. Built on the [mittwald Reference Extension](https://github.com/mittwald/reference-extension) architecture.

Features: Setup wizard with DNS/TypoScript configuration hints, encrypted API key storage, pull zone management, TYPO3 edge rules, settings for caching (edge / browser TTL, smart cache, image optimizer, CSS/JS minify), access (EU-only routing, hotlink protection), and live health checks (SSL, DNS, origin response time).

### Why BunnyCDN

- **EU-based operator** — bunny.net is headquartered in Slovenia (EU), not under US Cloud Act jurisdiction. Combined with the "EU-only PoPs" toggle, traffic stays on European infrastructure end-to-end.
- **DSGVO / GDPR friendly** by default when EU-only routing is enabled.
- **Origin relief** — caching at edge PoPs reduces requests/bandwidth against the mittwald origin, which lowers origin load and, for static-asset-heavy traffic, reduces end-to-end energy spend. A CDN is not automatically "green": the benefit depends on cache-hit rate, user geography, and cache TTLs. For highly dynamic, low-cache sites the effect is small.
- **No monthly base fee** — traffic-based billing, starting around 1 €/month for small sites.

### Data residency at a glance

| Where | What |
|---|---|
| bunny.net API | SI (Slovenia), EU |
| Edge-PoPs | configurable — "EU-only" toggle restricts to EU geo-zones |
| mittwald origin | DE (Germany) |
| Extension backend | wherever you deploy it (SQLite + Nitro) |

### mittwald Extension Resources

- [Extension Concept](https://developer.mittwald.de/docs/v2/contribution/overview/extensions/)
- [Getting Started with Extension Development](https://developer.mittwald.de/docs/v2/contribution/getting-started/configure-extension/)
- [Reference Extension (GitHub)](https://github.com/mittwald/reference-extension)
- [How to develop a Frontend Fragment](https://developer.mittwald.de/docs/v2/contribution/how-to/develop-frontend-fragment/)
- [Developing Frontend Fragments](https://developer.mittwald.de/docs/v2/contribution/getting-started/next-steps/customize-frontend-fragment/)
- [Expose Extension (Local Dev with zrok)](https://developer.mittwald.de/docs/v2/contribution/getting-started/expose-extension/)
- [Testing in mStudio](https://developer.mittwald.de/docs/v2/contribution/getting-started/test-in-mstudio/)
- [Deploy Extension](https://developer.mittwald.de/docs/v2/contribution/getting-started/deploy/)
- [Flow Design System](https://mittwald.github.io/flow/)
- [Flow Installation & Components](https://mittwald.github.io/flow/01-get-started/installation)

## Software Requirements

- Node.js >= 24
- npm
- Docker (optional, for container deployment)
- [zrok](https://zrok.io/) (for local development with mStudio)
- A [BunnyCDN](https://bunny.net) account
- A mittwald contributor account with registered extension

## Setup

### Set Environment Variables

```bash
cp .env.example .env
node scripts/generate-encryption-secrets.js  # generates ENCRYPTION_MASTER_PASSWORD + SALT
```

Fill in `EXTENSION_ID` and `EXTENSION_SECRET` from your mittwald extension registration.

| Variable | Required | Description |
|:---|:---|:---|
| `EXTENSION_ID` | yes | mittwald Extension ID |
| `EXTENSION_SECRET` | yes | mittwald Extension Secret |
| `ENCRYPTION_MASTER_PASSWORD` | yes | Master password for AES-256-GCM key derivation |
| `ENCRYPTION_SALT` | yes | Salt for key derivation |
| `DATABASE_URL` | no | SQLite path (default: `./data/sqlite.db`) |
| `ZROK_RESERVED_TOKEN` | no | zrok token for local tunnel |

### Install Pre-commit Hooks

```bash
npm install  # hooks installed automatically via prepare script
```

### Two Dev Workflows

The repo has two separate dev workflows. Pick one based on what you're iterating on:

**Pure UI work (HMR, fastest)** — open `http://localhost:3000` in a normal browser tab:

```bash
npm run dev
```

The mStudio Bridge isn't available here, so anything that calls server-functions, the wizard, or auth will fail. Use this for layout, styling, and i18n iteration.

**mStudio iframe testing (no HMR, full Bridge)** — production build behind a zrok tunnel:

```bash
npm run dev:iframe   # build + start (Node 24 --env-file loads .env)
npm run dev:expose   # in a second terminal: starts the zrok tunnel
```

Configure your development extension in mStudio to point to the zrok URL. Code changes require a fresh `npm run dev:iframe` to be visible — there is no HMR in this mode by design. `vite dev` over zrok inside the iframe is not viable (Bridge handshake budget vs. zrok per-request timeout); see `vite.config.ts` for the recorded scar tissue.

### Docker

```bash
# Development
docker compose -f docker-compose.dev.yml up

# Production
docker build -t mittwald-bunnycdn .
docker run -p 3000:3000 --env-file .env mittwald-bunnycdn
```

### GitHub Deployment Setup

The `Build and Deploy` workflow needs a few GitHub Environment secrets
and variables before the first push to `main` can deploy. The full
checklist (which secret goes where, how to rotate, troubleshooting)
lives in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Testing

```bash
npm test            # run all tests
npm run test:watch  # watch mode
```

More than 210 tests across 25 test files including property-based tests (fast-check), unit tests covering crypto, webhooks, BunnyCDN API, auth, validation, scope, membership, security headers, health checks, i18n, and E2E smoke tests.

## Architecture

- **Framework**: TanStack React Start + Nitro v2 + Vite
- **UI**: @mittwald/flow-remote-react-components
- **Auth**: @mittwald/ext-bridge (JWT session tokens)
- **Server Functions**: @mittwald/react-ghostmaker (type-safe RPC)
- **Database**: SQLite via Drizzle ORM
- **Webhooks**: @weissaufschwarz/mitthooks
- **Encryption**: AES-256-GCM with scrypt key derivation

### Data Flow

```
User → mStudio → Extension Frontend (Flow Remote Components)
                      ↓ Server Functions (ext-bridge JWT)
                Extension Backend (Nitro)
                  ├── → BunnyCDN API (Pull Zones, Edge Rules, SSL)
                  ├── → mittwald API (Domains, DNS, Ingresses)
                  └── → SQLite (Instance data, encrypted API keys)
```

### What's Stored Where

| Data | Location | Encryption | Sensitivity |
|------|----------|------------|-------------|
| BunnyCDN API Key | SQLite | AES-256-GCM (scrypt) | 🔴 High |
| Consented Scopes | SQLite | Plaintext (JSON) | 🟢 Low |
| Pull Zone metadata | SQLite | Plaintext | 🟢 Low |
| Webhook request IDs | SQLite | Plaintext (opaque UUIDs, 14d retention) | 🟢 Low |
| Session tokens | Memory only | JWT (verified, not stored) | 🔴 High |
| ENCRYPTION_MASTER_PASSWORD | Environment | N/A | 🔴 High |

> **Note:** The per-instance secret delivered by mittwald webhooks is intentionally **not persisted**. Webhook signature verification uses the marketplace Ed25519 public-key path (`@weissaufschwarz/mitthooks`).

### File Structure

```
src/
├── env.ts                    # Environment validation (envalid)
├── start.ts                  # TanStack Start entry
├── router.tsx                # TanStack Router setup
├── ghosts.ts                 # Ghostmaker RPC clients
├── middleware/
│   ├── auth.ts               # ext-bridge session verification
│   └── error-handling.ts     # Global error middleware
├── routes/
│   ├── __root.tsx            # RemoteRoot + ErrorBoundary
│   └── index.tsx             # Wizard ↔ Dashboard routing
├── components/
│   ├── wizard/               # Setup wizard (Step0–Step4)
│   ├── dashboard/            # Dashboard shell, tabs, KPIs
│   └── shared/               # Reusable UI helpers
├── serverFunctions/
│   ├── api-key.ts            # save/delete/getApiKeyStatus
│   ├── domains.ts            # getDomainsFn
│   ├── permissions.ts        # checkPermissionsFn
│   ├── pull-zone.ts          # create/delete/getStatus, custom hostname, purge
│   ├── settings.ts           # updateSettingsFn
│   ├── stats.ts              # getStatsFn + Bunny statistics
│   └── index.ts              # Barrel re-exports
├── domain/
│   └── pull-zone.ts          # Pull zone business logic
├── server/
│   ├── bunnycdn.ts           # BunnyCDN API client
│   ├── crypto.ts             # AES-256-GCM encryption
│   ├── scope.ts              # Tenant isolation + scope/enabled checks
│   ├── membership.ts         # mittwald project role checks
│   ├── health-helpers.ts     # Health endpoint helpers
│   ├── stats-cache.ts        # Statistics response cache
│   ├── logger.ts             # Structured logger with redaction
│   ├── middleware/
│   │   └── security-headers.ts  # CSP, HSTS, Permissions-Policy
│   ├── db/
│   │   ├── index.ts          # DB singleton + WAL + auto-migration
│   │   └── schema.ts         # Drizzle ORM schema
│   ├── routes/api/
│   │   ├── health.get.ts     # Liveness probe
│   │   └── webhooks/
│   │       └── mittwald.post.ts  # Webhook handler (sig → parse → dedup → dispatch)
│   └── webhooks/
│       ├── handler.ts        # Webhook event handlers
│       ├── signature.ts      # Ed25519 signature validation
│       ├── dedup.ts          # request.id deduplication + sweeper
│       └── types.ts          # Webhook payload schemas (zod)
├── lib/
│   ├── bunny-cdn-api.ts      # Client-side BunnyCDN helpers
│   └── localize-error.ts     # Error → i18n message resolver
├── i18n/
│   ├── index.ts              # i18next + remoteLanguageDetectorModule
│   └── locales/
│       ├── de.json           # German translations
│       └── en.json           # English translations
└── shared/
    ├── errors.ts             # Error types + factory
    ├── types.ts              # Shared types + config hints
    └── validation.ts         # Input validation helpers
```

## License

MIT — see [package.json](package.json).

bunny.net and the bunny.net logo are property of BunnyWay d.o.o.; this extension is not officially affiliated with bunny.net.
