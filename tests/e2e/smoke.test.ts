import { type ChildProcess, execSync, spawn } from 'node:child_process'
import { resolve as resolvePath } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PORT = 9876
const BASE = `http://localhost:${PORT}`
const REPO_ROOT = resolvePath(import.meta.dirname, '..', '..')
const SERVER_ENTRY = resolvePath(REPO_ROOT, '.output/server/index.mjs')
let server: ChildProcess

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status < 500) return
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Server not reachable at ${url} after ${timeoutMs}ms`)
}

beforeAll(async () => {
  // vitest sets NODE_ENV=test by default; if that leaks into `vite build`,
  // tanstack-start's static-NODE_ENV-replacement compiles the server bundle
  // against react/jsx-dev-runtime and SSR crashes at runtime with
  // "jsxDevRuntimeExports.jsxDEV is not a function" (see tanstack/router#6484).
  execSync('npm run build', {
    stdio: 'pipe',
    timeout: 60000,
    cwd: REPO_ROOT,
    env: { ...process.env, NODE_ENV: 'production' },
  })

  server = spawn('node', [SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      ENCRYPTION_MASTER_PASSWORD: 'test-password',
      ENCRYPTION_SALT: 'test-salt',
      EXTENSION_ID: 'test-extension-id',
      EXTENSION_SECRET: 'test-extension-secret',
      DATABASE_URL: `/tmp/bunnycdn-e2e-${Date.now()}.db`,
    },
    stdio: 'ignore',
  })

  server.on('error', (err) => {
    throw new Error(`Failed to spawn server: ${err.message}`)
  })

  await waitForServer(BASE)
}, 90000)

afterAll(() => {
  server?.kill('SIGTERM')
})

describe('E2E: Server smoke tests', () => {
  it('GET / returns HTML', async () => {
    const res = await fetch(BASE)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('html')
  })

  it('POST /api/webhooks/mittwald without signature returns 401', async () => {
    const res = await fetch(`${BASE}/api/webhooks/mittwald`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'ExtensionAddedToContext' }),
    })
    expect(res.status).toBe(401)
  })

  it('GET /unknown returns 404', async () => {
    const res = await fetch(`${BASE}/unknown-path-that-does-not-exist`)
    expect(res.status).toBe(404)
  })
})
