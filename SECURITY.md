# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

- **Email:** hosting@hdnet.de
- **Do not** open a public GitHub issue for security vulnerabilities

We will acknowledge your report within 48 hours and provide a fix timeline.

## Security Measures

- API keys are encrypted at rest using AES-256-GCM with scrypt key derivation
- Webhook signatures are validated using Ed25519 (via @weissaufschwarz/mitthooks)
- Session tokens are verified via @mittwald/ext-bridge (JWT)
- API keys are never logged — `[REDACTED]` is used in all log output
- Input validation on all user-facing endpoints (URL, CDN mode, API key)
- SSRF protection: private/internal IPs are blocked in origin URL validation
- Security headers: CSP, HSTS, Referrer-Policy, Permissions-Policy, X-Content-Type-Options

## Data Storage

| Data | Storage | At-rest protection |
|------|---------|-------------------|
| bunny.net API key | SQLite (`extension_instances.encrypted_api_key`) | AES-256-GCM (scrypt-derived key) |
| Pull-zone metadata | SQLite (`pull_zones`) | Plaintext (non-sensitive: hostnames, mode, custom hostname) |
| Webhook request IDs | SQLite (`processed_webhook_requests`) | Plaintext (opaque UUIDs, 30-day retention) |
| Session tokens | In-memory only, per request | Verified as JWT via `@mittwald/ext-bridge`, never persisted |

The per-instance secret that mittwald delivers in `ExtensionAddedToContext` and `SecretRotated` webhooks is intentionally **not persisted**: webhook signature verification uses the marketplace Ed25519 public-key path (`@weissaufschwarz/mitthooks`), so the per-instance secret is unused. `handleSecretRotated` therefore acknowledges the webhook without writing.

## Design Decisions

### Encryption parameters

API keys are encrypted with AES-256-GCM, 12-byte random IV, 16-byte auth tag (`src/server/crypto.ts`). The KEK is derived from `ENCRYPTION_MASTER_PASSWORD` + `ENCRYPTION_SALT` using `scrypt` with explicit cost parameters: `N = 2^15 (32768)`, `r = 8`, `p = 1`, `maxmem = 64 MiB`. The derived key is cached for the process lifetime (cost paid once at boot). Both env values must be supplied at deploy time and rotation invalidates every existing ciphertext (see `docs/DEPLOYMENT.md` §4 for the rotation procedure).

### Webhook replay protection

Incoming mittwald webhooks are protected by three checks: Ed25519 signature verification (`@weissaufschwarz/mitthooks`), a 7-day timestamp window on `payload.request.createdAt`, and a deduplication ledger of `request.id` values with 14-day retention. The ledger retention is intentionally longer than the timestamp window so a captured payload cannot land in the boundary gap between sweep and reject.

### Logging

The structured logger (`src/server/logger.ts`) applies a field-name redaction filter to every emitted `extra` payload: keys matching `apiKey|api_key|x-api-key|AccessKey|secret|password|token|encrypted_api_key|authorization` are replaced with `[REDACTED]`. The primary control is per-call-site redaction (e.g. `redactApiKey(...)` in `bunnycdn.ts`); the filter is the safety net for forgotten ones. `AppError.message` and `AppError.code` are safe to surface; `AppError.details` may contain upstream-API response bodies — do not display it to end users.

### Backups

The SQLite database lives on a mittwald-managed volume; the project's standard volume backup schedule covers it. SQLite is in WAL mode with `synchronous = NORMAL`, which is crash-recoverable from a volume snapshot — restoring the volume produces a database that is consistent up to the moment of the snapshot. On `SIGTERM` the app issues `wal_checkpoint(TRUNCATE)` so the on-disk file is fully consolidated before container shutdown (see `closeDb()` in `src/server/db/index.ts`).

### Tenant isolation

Every authenticated server function passes through `assertInstanceContextMatches` (`src/server/scope.ts`), which verifies that the JWT-derived `contextId` matches the persisted `extension_instances.contextId` for the JWT-derived `extensionInstanceId`. mStudio binds these at install time so a mismatch is normally impossible — the check is defence-in-depth against any future token-issuance bug.

## Dependencies

`npm audit` runs in CI (`continue-on-error: true` so transitive CVEs do not block unrelated PRs). Trivy scans the deployed Docker image gate-blocking on `CRITICAL` / `HIGH`. Dependencies are bumped weekly via Dependabot (`@mittwald/*` patch alpha bumps are ignored to keep the queue manageable; minor and major bumps surface).
