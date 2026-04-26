# Deployment Setup

Einmalige GitHub-Konfiguration, damit der `Build and Deploy`-Workflow
(`.github/workflows/deploy.yml`) durchläuft. Nach dem Setup ist jeder
Push auf `main` ein automatischer Deploy — ein Tag-Push (`vX.Y.Z`) baut
zusätzlich ein archivierungs-getaggtes Image in GHCR ohne Deploy.

## 1. GitHub Environment `production` anlegen

> Settings → **Environments** → **New environment** → `production`

Das Environment entkoppelt Deploy-Secrets vom Rest des Repos: PR-Checks
kommen an sie nicht heran, nur Jobs mit `environment: production` tun
das. Im selben Dialog optional konfigurieren:

- **Required reviewers** — ein manuelles Go/No-Go vor jedem Deploy.
- **Wait timer** — x Minuten Delay zwischen CI-grün und Rollout.
- **Deployment branches and tags** — hart auf `main` beschränken, falls
  jemand auf Test-Branches pushen sollte.

## 2. Environment-Variablen & Secrets

Alle Deploy-relevanten Werte liegen am **Environment** `production`,
**nicht** auf Repo-Ebene. So kriegen PR-Workflows, CI-Reruns und
Fork-PRs sie nie zu sehen.

### Environment Variables

> Settings → Environments → production → **Variables**

| Name | Beispielwert | Zweck |
|---|---|---|
| `DEPLOYMENT_URL` | `https://bunnycdn.hdnet.de` | Öffentliche URL; wird nur im Environment-UI als Link angezeigt |
| `STACK_ID` | `abc123def456…` | mStudio-Stack, in den deployt wird (`mittwald stack list` oder mStudio-UI) |
| `EXTENSION_ID` | `7f3a4b2c-…` | Contribution-ID der Extension (aus der mittwald-Publisher-UI). Nicht sensibel — wandert in Webhook-Payloads — aber semantisch Deploy-gebunden |

### Environment Secrets

> Settings → Environments → production → **Secrets**

| Name | Quelle / Erzeugen mit | Zweck |
|---|---|---|
| `MITTWALD_API_TOKEN` | mStudio → Profil → API-Token | mStudio-API-Auth für den Deploy-Call |
| `EXTENSION_SECRET` | mittwald-Publisher-UI | Webhook-Signature-Verification (see `src/server/webhooks/signature.ts`) |
| `ENCRYPTION_MASTER_PASSWORD` | `node scripts/generate-encryption-secrets.js` | scrypt-Master für AES-256-GCM der bunny.net-API-Keys |
| `ENCRYPTION_SALT` | selber Generator wie oben | Salt für die scrypt-Derivation |

`GITHUB_TOKEN` kommt automatisch von GitHub — nichts zu tun.

## 3. CI braucht keine Secrets

Der CI-Workflow (`.github/workflows/ci.yml`) läuft hermetisch: Unit- und
E2E-Tests verwenden hardcodierte Dummy-Werte (`test-extension-id`,
`test-password` usw.). Es gibt keine Live-API-Tests gegen BunnyCDN oder
mittwald. Falls das mal dazukommt, gehört es in einen separaten
`integration.yml`-Workflow mit `workflow_dispatch`-Trigger und eigenen
Secrets — **nicht** in den PR-Check.

## 4. Rotation

### `ENCRYPTION_MASTER_PASSWORD` / `ENCRYPTION_SALT`

Diese zwei Werte leiten den Key ab, mit dem bunny.net-API-Keys in der
SQLite-DB verschlüsselt sind. Rotation heißt: alle verschlüsselten Keys
werden nach dem Restart unbrauchbar. User müssen ihren API-Key in der
Extension neu eintragen. Plane Rotation entsprechend.

## 6. Backups

Die SQLite-Datenbank liegt auf einem mittwald-Volume und wird im Rahmen
des regulären Projekt-Backups gesichert. Die App betreibt SQLite im
WAL-Modus mit `synchronous = NORMAL`; ein Volume-Snapshot zu beliebigem
Zeitpunkt ist crash-recoverable, weil SQLite die WAL beim Öffnen
abspielt. Beim `SIGTERM` wird zusätzlich ein
`wal_checkpoint(TRUNCATE)` ausgeführt, damit Routine-Restarts den
Datenbestand vollständig in die Hauptdatei konsolidieren. Es gibt keinen
zusätzlichen App-internen Backup-Mechanismus — die mittwald-
Volume-Sicherung ist der einzige Pfad.

### `EXTENSION_SECRET`

Bei Rotation im mittwald-Publisher wird parallel ein
`SecretRotated`-Webhook an den Endpoint geschickt (siehe
`src/server/webhooks/handler.ts:handleSecretRotated`). Der alte Secret
bleibt kurz gültig, bis wir den neuen persistiert haben.

### `MITTWALD_API_TOKEN`

Simple Rotation: neuen Token in mStudio erzeugen, Environment-Secret
überschreiben, alten Token in mStudio widerrufen. Kein Code-Impact.

## 5. Troubleshooting

**Deploy wartet ewig auf „Waiting for review"**
Required Reviewers sind aktiv. Setze dir selber als Reviewer, review,
deploye.

**Deploy failt mit „Stack not found"**
`STACK_ID` ist falsch oder gehört zu einem anderen mStudio-Account als
der `MITTWALD_API_TOKEN`.

**Webhook kommt an aber 400 „Webhook not intended for this extension"**
`EXTENSION_ID` im Environment passt nicht zu dem, was mittwald im
`payload.meta.extensionId` schickt. Check C1-Guard in
`src/server/routes/api/webhooks/mittwald.post.ts`.

**Deploy läuft durch aber Container crasht im mStudio-Log**
`ENCRYPTION_MASTER_PASSWORD` oder `ENCRYPTION_SALT` fehlen / wurden
rotiert ohne DB-Migration. Existierende `encrypted_api_key`-Werte lassen
sich mit dem neuen Key nicht mehr entschlüsseln.
